//! Core game-engine primitives for the Catan backend.
//!
//! This crate is intentionally focused on deterministic game rules and state
//! transitions. It does not know about networking, persistence, authentication,
//! frontend messages, or random number generation. Those concerns should live
//! in higher-level crates, which can call this engine with already-validated
//! commands such as "player 2 rolled a 6" or "player 0 built a settlement".
//!
//! The current implementation is a foundation rather than a complete Catan
//! ruleset. It models:
//!
//! - lobby creation and player registration,
//! - starting a game once enough players have joined,
//! - turn ownership and turn stages,
//! - dice rolling,
//! - resource balances,
//! - basic build costs and piece counts,
//! - victory-point based game completion.
//!
//! Future board-specific rules, such as road placement legality, settlement
//! distance checks, robber behavior, resource production from hexes, trading,
//! development cards, and longest-road/largest-army scoring, can be layered on
//! top of these same state-machine patterns.

use std::error::Error;
use std::fmt::{Display, Formatter};

/// Stable index used to identify a player within a single game instance.
///
/// Player IDs are assigned in join order by [`GameEngine::add_player`]. The
/// engine stores players in a `Vec`, so using `usize` keeps lookup simple and
/// cheap. These IDs are only meaningful inside the game that created them; a
/// server should not treat them as global account IDs.
pub type PlayerId = usize;

// Standard Catan starting piece inventories per player.
const STARTING_ROADS: u8 = 15;
const STARTING_SETTLEMENTS: u8 = 5;
const STARTING_CITIES: u8 = 4;

// Build costs are represented as compact static slices. This keeps rule checks
// data-driven and lets ResourceHand::can_pay/pay work for every build type.
const ROAD_COST: [(Resource, u8); 2] = [(Resource::Brick, 1), (Resource::Lumber, 1)];
const SETTLEMENT_COST: [(Resource, u8); 4] = [
    (Resource::Brick, 1),
    (Resource::Lumber, 1),
    (Resource::Wool, 1),
    (Resource::Grain, 1),
];
const CITY_COST: [(Resource, u8); 2] = [(Resource::Ore, 3), (Resource::Grain, 2)];

/// Resource cards that can be held and spent by players.
///
/// Desert is not included because it is a board terrain that produces no card,
/// not a resource type a player can hold.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Resource {
    /// Brick, commonly produced by hills and used for roads/settlements.
    Brick,
    /// Lumber, commonly produced by forests and used for roads/settlements.
    Lumber,
    /// Ore, commonly produced by mountains and used for cities.
    Ore,
    /// Grain, commonly produced by fields and used for settlements/cities.
    Grain,
    /// Wool, commonly produced by pastures and used for settlements.
    Wool,
}

impl Resource {
    /// Converts the enum to an array offset in [`ResourceHand`].
    ///
    /// Keeping this mapping in one place avoids hash maps for the small, fixed
    /// set of resource types and makes resource operations predictable.
    const fn index(self) -> usize {
        match self {
            Self::Brick => 0,
            Self::Lumber => 1,
            Self::Ore => 2,
            Self::Grain => 3,
            Self::Wool => 4,
        }
    }
}

/// A player's current resource-card counts.
///
/// Internally this uses a fixed array instead of a map because Catan has exactly
/// five resource card types. Public methods keep callers from depending on the
/// array order and centralize all resource accounting rules.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ResourceHand {
    amounts: [u8; 5],
}

impl ResourceHand {
    /// Returns how many cards of a specific [`Resource`] this hand contains.
    pub fn amount(&self, resource: Resource) -> u8 {
        self.amounts[resource.index()]
    }

    /// Adds resource cards to the hand.
    ///
    /// This uses saturating addition so an accidental very large award cannot
    /// wrap back to zero. A production-ready engine may eventually want a wider
    /// integer type or an explicit overflow error if card counts are persisted.
    pub fn add(&mut self, resource: Resource, amount: u8) {
        let idx = resource.index();
        self.amounts[idx] = self.amounts[idx].saturating_add(amount);
    }

    /// Checks whether the hand can pay an arbitrary resource cost.
    ///
    /// The cost format is a slice of `(resource, amount)` pairs so callers can
    /// reuse this for roads, settlements, cities, development cards, trades, or
    /// future custom actions without adding one method per action.
    pub fn can_pay(&self, cost: &[(Resource, u8)]) -> bool {
        cost.iter()
            .all(|(resource, amount)| self.amount(*resource) >= *amount)
    }

    /// Deducts a resource cost from the hand.
    ///
    /// The method first validates the whole cost and only mutates after the
    /// hand is known to be able to pay. That makes payment atomic from the
    /// engine's perspective: a failed payment never partially removes cards.
    pub fn pay(&mut self, cost: &[(Resource, u8)]) -> Result<(), EngineError> {
        if !self.can_pay(cost) {
            return Err(EngineError::InsufficientResources);
        }

        for (resource, amount) in cost {
            let idx = resource.index();
            self.amounts[idx] -= *amount;
        }

        Ok(())
    }
}

/// Piece/action categories that currently consume resources.
///
/// Board coordinates are deliberately not modeled yet. For now, building means
/// "charge the player, decrement the relevant inventory, and update score".
/// Placement validation will be a later board-model concern.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuildType {
    /// A road piece. Costs one brick and one lumber.
    Road,
    /// A settlement piece. Costs brick, lumber, wool, and grain; worth one VP.
    Settlement,
    /// A city upgrade. Costs ore and grain; upgrades an existing settlement.
    City,
}

impl BuildType {
    /// Returns the resource cost for this build action.
    fn cost(self) -> &'static [(Resource, u8)] {
        match self {
            Self::Road => &ROAD_COST,
            Self::Settlement => &SETTLEMENT_COST,
            Self::City => &CITY_COST,
        }
    }
}

/// Public snapshot of one player's engine-owned state.
///
/// This is intentionally plain data so a server layer can serialize it into
/// websocket/API responses later. The engine remains the authority for mutating
/// these fields; callers receive immutable references through
/// [`GameEngine::player`] and [`GameEngine::players`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayerState {
    /// Engine-local player identifier.
    pub id: PlayerId,
    /// Display name supplied when joining the lobby.
    pub name: String,
    /// Resource cards currently held by the player.
    pub resources: ResourceHand,
    /// Road pieces still available to build.
    pub roads_remaining: u8,
    /// Settlement pieces still available to build.
    pub settlements_remaining: u8,
    /// City pieces still available to build.
    pub cities_remaining: u8,
    /// Visible victory points currently tracked by the engine.
    pub victory_points: u8,
}

impl PlayerState {
    /// Creates a new player with empty resources and full starting inventory.
    fn new(id: PlayerId, name: String) -> Self {
        Self {
            id,
            name,
            resources: ResourceHand::default(),
            roads_remaining: STARTING_ROADS,
            settlements_remaining: STARTING_SETTLEMENTS,
            cities_remaining: STARTING_CITIES,
            victory_points: 0,
        }
    }
}

/// Phase within an individual player's turn.
///
/// The turn is split into stages so the engine can reject out-of-order actions,
/// such as building before rolling or rolling twice.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnStage {
    /// The current player must roll dice before taking main actions.
    RollDice,
    /// The current player may take main-turn actions and then end the turn.
    Main,
}

/// Current turn metadata.
///
/// `TurnState` is `Copy` because it is small and consists only of scalar values.
/// This lets callers inspect the turn without borrowing the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TurnState {
    /// Player whose turn it currently is.
    pub current_player: PlayerId,
    /// One-based count of turns that have begun.
    pub turn_number: u32,
    /// The current player's stage within this turn.
    pub stage: TurnStage,
    /// The total from this turn's dice roll, if dice have been rolled.
    pub last_roll: Option<u8>,
}

/// Coarse lifecycle state for the game.
///
/// Most public engine methods use this to guard when an action is legal. For
/// example, players can only join during [`GamePhase::Lobby`], while dice rolls
/// only make sense during [`GamePhase::InProgress`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GamePhase {
    /// Players can join, but the first turn has not started.
    Lobby,
    /// The turn state exists and players may perform game actions.
    InProgress,
    /// The game has ended and records the winning player.
    Finished { winner: PlayerId },
}

/// Tunable rule/configuration values for a game instance.
///
/// Defaults match the common 3-4 player Catan setup and 10 victory-point win
/// condition. Tests and future custom rooms can supply smaller or larger values
/// through [`GameEngine::with_config`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GameConfig {
    /// Minimum number of players required by [`GameEngine::start_game`].
    pub min_players: usize,
    /// Maximum number of players allowed in the lobby.
    pub max_players: usize,
    /// Victory-point total that immediately ends the game.
    pub victory_points_to_win: u8,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            min_players: 3,
            max_players: 4,
            victory_points_to_win: 10,
        }
    }
}

/// Deterministic state machine for one Catan game.
///
/// `GameEngine` owns the authoritative game state and exposes methods for each
/// supported command. Callers submit intent ("add player", "roll dice", "build")
/// and receive either a state transition or a typed [`EngineError`].
///
/// Important design choices:
///
/// - no random generation: dice values are passed in so tests and server code
///   can control randomness outside the engine;
/// - no networking types: this crate can be reused by CLI tests, HTTP handlers,
///   websocket rooms, or simulations;
/// - no board coordinates yet: current build actions validate resources and
///   inventory, while later iterations can add placement validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameEngine {
    /// Immutable rules/configuration for this game instance.
    config: GameConfig,
    /// Lifecycle phase that controls which commands are legal.
    phase: GamePhase,
    /// Players in join order; the vector index is the player's [`PlayerId`].
    players: Vec<PlayerState>,
    /// Current turn data. This is present only while the game is in progress.
    turn: Option<TurnState>,
}

impl Default for GameEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl GameEngine {
    /// Creates a new empty game lobby using [`GameConfig::default`].
    pub fn new() -> Self {
        Self {
            config: GameConfig::default(),
            phase: GamePhase::Lobby,
            players: Vec::new(),
            turn: None,
        }
    }

    /// Creates a new empty game lobby with a custom configuration.
    ///
    /// The configuration must have at least one required player and the minimum
    /// cannot exceed the maximum, otherwise the engine would create rooms that
    /// could never be started.
    pub fn with_config(config: GameConfig) -> Result<Self, EngineError> {
        if config.min_players == 0 || config.min_players > config.max_players {
            return Err(EngineError::InvalidConfig);
        }

        Ok(Self {
            config,
            ..Self::new()
        })
    }

    /// Returns the current game lifecycle phase.
    pub fn phase(&self) -> GamePhase {
        self.phase
    }

    /// Returns all players in stable join order.
    pub fn players(&self) -> &[PlayerState] {
        &self.players
    }

    /// Returns the current turn snapshot, if the game is in progress.
    pub fn turn(&self) -> Option<TurnState> {
        self.turn
    }

    /// Looks up a player by engine-local [`PlayerId`].
    pub fn player(&self, player_id: PlayerId) -> Result<&PlayerState, EngineError> {
        self.players
            .get(player_id)
            .ok_or(EngineError::InvalidPlayer)
    }

    /// Adds a player to the lobby and returns their assigned [`PlayerId`].
    ///
    /// Joining is restricted to the lobby phase so the active turn order cannot
    /// change after the game has started. Names must contain non-whitespace
    /// content, but uniqueness is not enforced yet.
    pub fn add_player(&mut self, name: impl Into<String>) -> Result<PlayerId, EngineError> {
        if self.phase != GamePhase::Lobby {
            return Err(EngineError::NotInLobby);
        }

        if self.players.len() >= self.config.max_players {
            return Err(EngineError::LobbyFull);
        }

        let name = name.into();
        if name.trim().is_empty() {
            return Err(EngineError::InvalidPlayerName);
        }

        let id = self.players.len();
        self.players.push(PlayerState::new(id, name));
        Ok(id)
    }

    /// Starts the game and creates the first turn.
    ///
    /// Player 0 always starts in this first implementation. A future setup flow
    /// can replace that with randomized first-player selection or the official
    /// initial placement snake draft.
    pub fn start_game(&mut self) -> Result<(), EngineError> {
        match self.phase {
            GamePhase::InProgress => return Err(EngineError::GameAlreadyStarted),
            GamePhase::Finished { .. } => return Err(EngineError::GameFinished),
            GamePhase::Lobby => {}
        }

        if self.players.len() < self.config.min_players {
            return Err(EngineError::NotEnoughPlayers {
                minimum: self.config.min_players,
                current: self.players.len(),
            });
        }

        self.phase = GamePhase::InProgress;
        self.turn = Some(TurnState {
            current_player: 0,
            turn_number: 1,
            stage: TurnStage::RollDice,
            last_roll: None,
        });

        Ok(())
    }

    /// Grants resources to a player.
    ///
    /// This is a low-level engine primitive used by tests and, later, by board
    /// production logic after dice are rolled. Keeping it explicit makes early
    /// development easier while the board model does not exist yet.
    pub fn give_resource(
        &mut self,
        player_id: PlayerId,
        resource: Resource,
        amount: u8,
    ) -> Result<(), EngineError> {
        match self.phase {
            GamePhase::Lobby => return Err(EngineError::GameNotStarted),
            GamePhase::Finished { .. } => return Err(EngineError::GameFinished),
            GamePhase::InProgress => {}
        }

        let player = self.player_mut(player_id)?;
        player.resources.add(resource, amount);
        Ok(())
    }

    /// Applies a dice roll for the current player.
    ///
    /// The caller supplies both die values instead of the engine generating
    /// randomness. That keeps the engine deterministic and easy to test. Once a
    /// roll succeeds, the turn advances from [`TurnStage::RollDice`] to
    /// [`TurnStage::Main`].
    pub fn roll_dice(
        &mut self,
        player_id: PlayerId,
        die_one: u8,
        die_two: u8,
    ) -> Result<u8, EngineError> {
        if !(1..=6).contains(&die_one) {
            return Err(EngineError::InvalidDieValue { value: die_one });
        }
        if !(1..=6).contains(&die_two) {
            return Err(EngineError::InvalidDieValue { value: die_two });
        }

        self.ensure_player_turn(player_id)?;
        let turn = self.ensure_turn_mut()?;

        if turn.stage != TurnStage::RollDice {
            return Err(EngineError::DiceAlreadyRolled);
        }

        let total = die_one + die_two;
        turn.last_roll = Some(total);
        turn.stage = TurnStage::Main;
        Ok(total)
    }

    /// Performs a build action for the current player.
    ///
    /// This currently validates:
    ///
    /// - the game is in progress,
    /// - it is `player_id`'s turn,
    /// - dice have already been rolled,
    /// - the player can pay the build cost,
    /// - the player has the required piece inventory,
    /// - cities only upgrade after the player has built at least one settlement.
    ///
    /// It does not yet validate board position, road connectivity, settlement
    /// distance, harbor access, or whether a specific settlement is being
    /// upgraded. Those require board coordinates and should be added when the
    /// board model exists.
    pub fn build(&mut self, player_id: PlayerId, build_type: BuildType) -> Result<(), EngineError> {
        self.ensure_player_turn(player_id)?;
        if self.ensure_turn()?.stage != TurnStage::Main {
            return Err(EngineError::MustRollBeforeAction);
        }

        let victory_points_to_win = self.config.victory_points_to_win;
        // Mutably borrow only the player for the accounting work, then return
        // the values needed for winner detection. This keeps the borrow scoped
        // so we can safely update `self.phase` and `self.turn` afterward.
        let (player_victory_points, winner_id) = {
            let player = self.player_mut(player_id)?;
            if !player.resources.can_pay(build_type.cost()) {
                return Err(EngineError::InsufficientResources);
            }

            match build_type {
                BuildType::Road => {
                    if player.roads_remaining == 0 {
                        return Err(EngineError::NoPiecesRemaining {
                            build_type: BuildType::Road,
                        });
                    }
                }
                BuildType::Settlement => {
                    if player.settlements_remaining == 0 {
                        return Err(EngineError::NoPiecesRemaining {
                            build_type: BuildType::Settlement,
                        });
                    }
                }
                BuildType::City => {
                    if player.cities_remaining == 0 {
                        return Err(EngineError::NoPiecesRemaining {
                            build_type: BuildType::City,
                        });
                    }
                    if player.settlements_remaining == STARTING_SETTLEMENTS {
                        return Err(EngineError::NoSettlementToUpgrade);
                    }
                }
            }

            player.resources.pay(build_type.cost())?;

            match build_type {
                BuildType::Road => {
                    player.roads_remaining -= 1;
                }
                BuildType::Settlement => {
                    player.settlements_remaining -= 1;
                    player.victory_points = player.victory_points.saturating_add(1);
                }
                BuildType::City => {
                    player.cities_remaining -= 1;
                    player.settlements_remaining += 1;
                    player.victory_points = player.victory_points.saturating_add(1);
                }
            }

            (player.victory_points, player.id)
        };

        if player_victory_points >= victory_points_to_win {
            self.phase = GamePhase::Finished { winner: winner_id };
            self.turn = None;
        }

        Ok(())
    }

    /// Ends the current player's turn and advances to the next player.
    ///
    /// Ending is only legal after dice have been rolled. This prevents a player
    /// from skipping the roll phase and keeps every turn in the same sequence:
    /// roll dice, take main actions, end turn.
    pub fn end_turn(&mut self, player_id: PlayerId) -> Result<(), EngineError> {
        self.ensure_player_turn(player_id)?;
        let player_count = self.players.len();
        let turn = self.ensure_turn_mut()?;

        if turn.stage != TurnStage::Main {
            return Err(EngineError::MustRollBeforeAction);
        }

        turn.current_player = (turn.current_player + 1) % player_count;
        turn.turn_number += 1;
        turn.stage = TurnStage::RollDice;
        turn.last_roll = None;
        Ok(())
    }

    /// Returns a mutable turn reference if the game is currently active.
    fn ensure_turn_mut(&mut self) -> Result<&mut TurnState, EngineError> {
        match self.phase {
            GamePhase::Lobby => Err(EngineError::GameNotStarted),
            GamePhase::Finished { .. } => Err(EngineError::GameFinished),
            GamePhase::InProgress => self.turn.as_mut().ok_or(EngineError::GameNotStarted),
        }
    }

    /// Returns an immutable turn reference if the game is currently active.
    fn ensure_turn(&self) -> Result<&TurnState, EngineError> {
        match self.phase {
            GamePhase::Lobby => Err(EngineError::GameNotStarted),
            GamePhase::Finished { .. } => Err(EngineError::GameFinished),
            GamePhase::InProgress => self.turn.as_ref().ok_or(EngineError::GameNotStarted),
        }
    }

    /// Validates that a player exists and owns the current turn.
    fn ensure_player_turn(&self, player_id: PlayerId) -> Result<(), EngineError> {
        self.player(player_id)?;
        let turn = self.ensure_turn()?;

        if player_id != turn.current_player {
            return Err(EngineError::NotPlayersTurn {
                expected: turn.current_player,
                actual: player_id,
            });
        }

        Ok(())
    }

    /// Returns a mutable player reference for engine-internal state updates.
    fn player_mut(&mut self, player_id: PlayerId) -> Result<&mut PlayerState, EngineError> {
        self.players
            .get_mut(player_id)
            .ok_or(EngineError::InvalidPlayer)
    }
}

/// Errors returned by game-engine commands.
///
/// Every fallible engine method returns this type so callers can distinguish
/// rule violations from each other without parsing display strings. The
/// [`Display`] implementation is intended for logs and simple UI messages; API
/// handlers can match individual variants to produce structured responses.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineError {
    /// The supplied [`GameConfig`] cannot produce a valid game.
    InvalidConfig,
    /// A [`PlayerId`] does not refer to any player in this game.
    InvalidPlayer,
    /// A player attempted to join with an empty or whitespace-only name.
    InvalidPlayerName,
    /// The attempted action is only valid before the game starts.
    NotInLobby,
    /// The lobby already contains `max_players`.
    LobbyFull,
    /// The game cannot start until more players have joined.
    NotEnoughPlayers {
        /// Required player count from [`GameConfig::min_players`].
        minimum: usize,
        /// Current number of players in the lobby.
        current: usize,
    },
    /// The attempted action requires an active game.
    GameNotStarted,
    /// The game has already moved out of the lobby into active play.
    GameAlreadyStarted,
    /// The attempted action cannot run after a winner has been declared.
    GameFinished,
    /// A die value was outside the valid inclusive range `1..=6`.
    InvalidDieValue {
        /// The invalid die value supplied by the caller.
        value: u8,
    },
    /// A player attempted to act when another player owns the turn.
    NotPlayersTurn {
        /// Player ID that currently owns the turn.
        expected: PlayerId,
        /// Player ID supplied by the caller.
        actual: PlayerId,
    },
    /// The player attempted a main-turn action before rolling dice.
    MustRollBeforeAction,
    /// The player attempted to roll more than once in the same turn.
    DiceAlreadyRolled,
    /// The player does not have enough resource cards for the requested cost.
    InsufficientResources,
    /// The player has exhausted the physical pieces for a build action.
    NoPiecesRemaining {
        /// The attempted build type whose inventory is empty.
        build_type: BuildType,
    },
    /// A city build was requested before any settlement existed to upgrade.
    NoSettlementToUpgrade,
}

impl Display for EngineError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidConfig => write!(f, "invalid game configuration"),
            Self::InvalidPlayer => write!(f, "unknown player"),
            Self::InvalidPlayerName => write!(f, "player name cannot be empty"),
            Self::NotInLobby => write!(f, "operation only allowed in lobby"),
            Self::LobbyFull => write!(f, "lobby is full"),
            Self::NotEnoughPlayers { minimum, current } => {
                write!(
                    f,
                    "not enough players: need at least {minimum}, got {current}"
                )
            }
            Self::GameNotStarted => write!(f, "game has not started"),
            Self::GameAlreadyStarted => write!(f, "game already started"),
            Self::GameFinished => write!(f, "game already finished"),
            Self::InvalidDieValue { value } => write!(f, "die value out of range: {value}"),
            Self::NotPlayersTurn { expected, actual } => {
                write!(
                    f,
                    "it is not player {actual}'s turn (expected player {expected})"
                )
            }
            Self::MustRollBeforeAction => write!(f, "player must roll dice first"),
            Self::DiceAlreadyRolled => write!(f, "dice already rolled this turn"),
            Self::InsufficientResources => write!(f, "insufficient resources"),
            Self::NoPiecesRemaining { build_type } => {
                write!(f, "no pieces remaining for {:?}", build_type)
            }
            Self::NoSettlementToUpgrade => write!(f, "city requires an existing settlement"),
        }
    }
}

impl Error for EngineError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn started_game() -> GameEngine {
        let mut engine = GameEngine::new();
        engine.add_player("A").unwrap();
        engine.add_player("B").unwrap();
        engine.add_player("C").unwrap();
        engine.start_game().unwrap();
        engine
    }

    #[test]
    fn cannot_start_with_too_few_players() {
        let mut engine = GameEngine::new();
        engine.add_player("A").unwrap();
        engine.add_player("B").unwrap();
        let err = engine.start_game().unwrap_err();

        assert_eq!(
            err,
            EngineError::NotEnoughPlayers {
                minimum: 3,
                current: 2,
            }
        );
    }

    #[test]
    fn start_roll_and_end_turn_progresses_current_player() {
        let mut engine = started_game();
        assert_eq!(
            engine.turn(),
            Some(TurnState {
                current_player: 0,
                turn_number: 1,
                stage: TurnStage::RollDice,
                last_roll: None
            })
        );

        let roll = engine.roll_dice(0, 3, 4).unwrap();
        assert_eq!(roll, 7);
        assert_eq!(engine.turn().unwrap().stage, TurnStage::Main);
        engine.end_turn(0).unwrap();
        assert_eq!(engine.turn().unwrap().current_player, 1);
        assert_eq!(engine.turn().unwrap().turn_number, 2);
        assert_eq!(engine.turn().unwrap().stage, TurnStage::RollDice);
    }

    #[test]
    fn settlement_build_consumes_resources_and_awards_vp() {
        let mut engine = started_game();
        engine.give_resource(0, Resource::Brick, 1).unwrap();
        engine.give_resource(0, Resource::Lumber, 1).unwrap();
        engine.give_resource(0, Resource::Wool, 1).unwrap();
        engine.give_resource(0, Resource::Grain, 1).unwrap();
        engine.roll_dice(0, 1, 1).unwrap();
        engine.build(0, BuildType::Settlement).unwrap();

        let player = engine.player(0).unwrap();
        assert_eq!(player.victory_points, 1);
        assert_eq!(player.settlements_remaining, STARTING_SETTLEMENTS - 1);
        assert_eq!(player.resources.amount(Resource::Brick), 0);
        assert_eq!(player.resources.amount(Resource::Lumber), 0);
        assert_eq!(player.resources.amount(Resource::Wool), 0);
        assert_eq!(player.resources.amount(Resource::Grain), 0);
    }

    #[test]
    fn city_requires_settlement_and_then_upgrades_correctly() {
        let mut engine = started_game();
        engine.give_resource(0, Resource::Brick, 1).unwrap();
        engine.give_resource(0, Resource::Lumber, 1).unwrap();
        engine.give_resource(0, Resource::Wool, 1).unwrap();
        engine.give_resource(0, Resource::Grain, 3).unwrap();
        engine.give_resource(0, Resource::Ore, 3).unwrap();
        engine.roll_dice(0, 2, 3).unwrap();

        let err = engine.build(0, BuildType::City).unwrap_err();
        assert_eq!(err, EngineError::NoSettlementToUpgrade);

        engine.build(0, BuildType::Settlement).unwrap();
        engine.build(0, BuildType::City).unwrap();

        let player = engine.player(0).unwrap();
        assert_eq!(player.victory_points, 2);
        assert_eq!(player.settlements_remaining, STARTING_SETTLEMENTS);
        assert_eq!(player.cities_remaining, STARTING_CITIES - 1);
    }

    #[test]
    fn non_current_player_cannot_act() {
        let mut engine = started_game();
        let err = engine.roll_dice(1, 3, 3).unwrap_err();
        assert_eq!(
            err,
            EngineError::NotPlayersTurn {
                expected: 0,
                actual: 1
            }
        );
    }
}
