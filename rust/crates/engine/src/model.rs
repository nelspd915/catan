//! Core domain model types for the engine.
//!
//! This module intentionally keeps data structures explicit and serializable so
//! state snapshots can be shipped to clients, persisted later, and replayed.

use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};

/// Engine-wide configuration values used to initialize a game.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GameConfig {
    /// Minimum number of players required before game start is legal.
    pub min_players: usize,
    /// Maximum number of players accepted into a lobby.
    pub max_players: usize,
    /// Victory point threshold that ends the game.
    pub target_victory_points: u8,
}

impl Default for GameConfig {
    /// Default base-game values for 3-4 players and 10 point victory.
    fn default() -> Self {
        Self {
            min_players: 3,
            max_players: 4,
            target_victory_points: 10,
        }
    }
}

/// Stable game identifier used by server/session layers.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct GameId(String);

impl GameId {
    /// Construct a new game identifier from a string-like value.
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// Borrow this game identifier as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for GameId {
    /// Display game id without additional formatting.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Compact player identifier.
///
/// The `u8` backing type is sufficient for current game sizes and keeps wire
/// payloads small.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct PlayerId(u8);

impl PlayerId {
    /// Create a new player id.
    pub fn new(value: u8) -> Self {
        Self(value)
    }

    /// Return the raw numeric player id value.
    pub fn value(self) -> u8 {
        self.0
    }
}

impl fmt::Display for PlayerId {
    /// Display player id as its numeric value.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// The five base-game resources.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Resource {
    /// Brick resource.
    Brick,
    /// Lumber resource.
    Lumber,
    /// Wool resource.
    Wool,
    /// Grain resource.
    Grain,
    /// Ore resource.
    Ore,
}

/// Base-game development card variants.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum DevelopmentCard {
    /// Knight card used for robber movement and largest-army race.
    Knight,
    /// Hidden victory-point card that immediately contributes to score.
    VictoryPoint,
    /// Road Building progress card.
    RoadBuilding,
    /// Year of Plenty progress card.
    YearOfPlenty,
    /// Monopoly progress card.
    Monopoly,
}

/// Development card deck owned by the game.
///
/// The current implementation uses deterministic draw order to keep tests and
/// replays stable. A shuffled seeded variant can be layered in later.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DevelopmentDeck {
    cards: Vec<DevelopmentCard>,
}

impl DevelopmentDeck {
    /// Build a standard base-game deck with 25 cards.
    pub fn starting_base_game() -> Self {
        let mut cards = Vec::with_capacity(25);
        for _ in 0..14 {
            cards.push(DevelopmentCard::Knight);
        }
        for _ in 0..5 {
            cards.push(DevelopmentCard::VictoryPoint);
        }
        for _ in 0..2 {
            cards.push(DevelopmentCard::RoadBuilding);
        }
        for _ in 0..2 {
            cards.push(DevelopmentCard::YearOfPlenty);
        }
        for _ in 0..2 {
            cards.push(DevelopmentCard::Monopoly);
        }
        Self { cards }
    }

    /// Draw one development card from the top of the deck.
    pub fn draw(&mut self) -> Option<DevelopmentCard> {
        self.cards.pop()
    }

    /// Number of cards still available in deck.
    pub fn remaining(&self) -> usize {
        self.cards.len()
    }
}

/// Resource inventory keyed by resource type.
///
/// Used for both player hands and the shared bank.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResourceBank {
    resources: BTreeMap<Resource, u8>,
}

impl ResourceBank {
    /// Create a bank initialized with standard base-game card counts.
    pub fn starting() -> Self {
        let mut resources = BTreeMap::new();
        for resource in [
            Resource::Brick,
            Resource::Lumber,
            Resource::Wool,
            Resource::Grain,
            Resource::Ore,
        ] {
            let _ = resources.insert(resource, 19);
        }
        Self { resources }
    }

    /// Create an empty resource inventory.
    pub fn empty() -> Self {
        Self {
            resources: BTreeMap::new(),
        }
    }

    /// Increase the count for one resource.
    ///
    /// Uses saturating arithmetic to avoid overflow panic in defensive paths.
    pub fn add(&mut self, resource: Resource, amount: u8) {
        let entry = self.resources.entry(resource).or_insert(0);
        *entry = entry.saturating_add(amount);
    }

    /// Attempt to remove cards for one resource.
    ///
    /// Returns `true` on success and leaves state unchanged when insufficient.
    pub fn remove(&mut self, resource: Resource, amount: u8) -> bool {
        let entry = self.resources.entry(resource).or_insert(0);
        if *entry < amount {
            return false;
        }
        *entry -= amount;
        true
    }

    /// Read the current count for one resource.
    pub fn amount(&self, resource: Resource) -> u8 {
        *self.resources.get(&resource).unwrap_or(&0)
    }
}

/// Player-owned mutable game data.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Player {
    /// Unique player identifier within the match.
    pub id: PlayerId,
    /// Human-readable display name.
    pub name: String,
    /// Current resource cards held by this player.
    pub resources: ResourceBank,
    /// Current victory point total.
    pub victory_points: u8,
    /// Number of road pieces still available to place.
    pub roads_left: u8,
    /// Number of settlement pieces still available to place.
    pub settlements_left: u8,
    /// Number of city pieces still available to place.
    pub cities_left: u8,
    /// Development cards that are currently playable.
    pub development_cards: Vec<DevelopmentCard>,
    /// Development cards purchased this turn and not yet playable.
    pub newly_acquired_development_cards: Vec<DevelopmentCard>,
    /// Number of knight cards this player has played.
    pub played_knights: u8,
}

impl Player {
    /// Construct a player with default base-game piece counts.
    pub fn new(id: PlayerId, name: impl Into<String>) -> Self {
        Self {
            id,
            name: name.into(),
            resources: ResourceBank::empty(),
            victory_points: 0,
            roads_left: 15,
            settlements_left: 5,
            cities_left: 4,
            development_cards: Vec::new(),
            newly_acquired_development_cards: Vec::new(),
            played_knights: 0,
        }
    }

    /// Check whether this player has enough resources for one card cost.
    pub fn can_buy_development_card(&self) -> bool {
        self.resources.amount(Resource::Wool) >= 1
            && self.resources.amount(Resource::Grain) >= 1
            && self.resources.amount(Resource::Ore) >= 1
    }

    /// Move non-playable cards purchased this turn into playable hand.
    pub fn unlock_new_development_cards(&mut self) {
        self.development_cards
            .append(&mut self.newly_acquired_development_cards);
    }
}

/// Direction used by setup snakes and other ordered traversals.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Direction {
    /// Advance from first seat to last seat.
    Forward,
    /// Advance from last seat to first seat.
    Reverse,
}

/// Coarse-grained lifecycle phases for the game.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum GamePhase {
    /// Pre-game lobby where seats are filled.
    Lobby,
    /// Initial placement rounds.
    Setup { round: u8, direction: Direction },
    /// Start-of-turn pipeline before build/trade actions.
    TurnStart,
    /// Main turn actions.
    MainTurn,
    /// Terminal state once winner is decided.
    GameOver,
}

/// Full authoritative game snapshot.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GameState {
    /// Stable identifier for this game instance.
    pub game_id: GameId,
    /// Static configuration for the game.
    pub config: GameConfig,
    /// Current lifecycle phase.
    pub phase: GamePhase,
    /// Registered players and their mutable state.
    pub players: Vec<Player>,
    /// Deterministic seating/turn order.
    pub turn_order: Vec<PlayerId>,
    /// Index into `turn_order` for the active player.
    pub active_index: usize,
    /// Winner id once game has ended.
    pub winner: Option<PlayerId>,
    /// Shared resource bank.
    pub bank: ResourceBank,
    /// Development card deck.
    pub development_deck: DevelopmentDeck,
    /// Current holder of largest army bonus.
    pub largest_army_owner: Option<PlayerId>,
    /// Number of knight cards played by largest-army owner.
    pub largest_army_size: u8,
    /// Monotonic state version for synchronization and replay bookkeeping.
    pub version: u64,
}

impl GameState {
    /// Build a new game snapshot in lobby phase.
    pub fn new(game_id: impl Into<String>, config: GameConfig) -> Self {
        Self {
            game_id: GameId::new(game_id),
            config,
            phase: GamePhase::Lobby,
            players: Vec::new(),
            turn_order: Vec::new(),
            active_index: 0,
            winner: None,
            bank: ResourceBank::starting(),
            development_deck: DevelopmentDeck::starting_base_game(),
            largest_army_owner: None,
            largest_army_size: 0,
            version: 0,
        }
    }

    /// Return the currently active player id, if one exists.
    pub fn active_player(&self) -> Option<PlayerId> {
        self.turn_order.get(self.active_index).copied()
    }

    /// Mutably borrow a player by id.
    pub fn player_mut(&mut self, id: PlayerId) -> Option<&mut Player> {
        self.players.iter_mut().find(|player| player.id == id)
    }

    /// Check whether a player id already exists in this game.
    pub fn has_player(&self, id: PlayerId) -> bool {
        self.players.iter().any(|player| player.id == id)
    }

    /// Check whether a display name already exists in this game.
    pub fn has_player_name(&self, name: &str) -> bool {
        self.players.iter().any(|player| player.name == name)
    }
}