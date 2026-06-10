//! Authoritative command application for game state transitions.
//!
//! This module hosts the current transition dispatcher and validation rules.
//! As rules become more granular, these handlers can delegate to specialized
//! modules while preserving the same external contract.

use crate::command::Command;
use crate::error::EngineError;
use crate::event::Event;
use crate::model::{
    DevelopmentCard, Direction, GameConfig, GamePhase, GameState, Player, PlayerId, Resource,
};

/// Stateful engine facade used by server-side game sessions.
///
/// The engine owns static config and applies validated commands to mutable game
/// state snapshots.
#[derive(Debug, Clone, Default)]
pub struct Engine {
    config: GameConfig,
}

impl Engine {
    /// Construct an engine instance with a fixed game configuration template.
    pub fn new(config: GameConfig) -> Self {
        Self { config }
    }

    /// Create a new game in lobby phase using this engine's config.
    pub fn create_game(&self, game_id: impl Into<String>) -> GameState {
        GameState::new(game_id, self.config.clone())
    }

    /// Validate and apply a single command to game state.
    ///
    /// On success, returns one or more domain events describing the accepted
    /// transition. On failure, returns a typed `EngineError` and leaves state
    /// unchanged for that command.
    pub fn apply(&mut self, state: &mut GameState, command: Command) -> Result<Vec<Event>, EngineError> {
        // Centralized command dispatch keeps mutation pathways explicit.
        let events = match command {
            Command::AddPlayer { id, name } => self.add_player(state, id, name)?,
            Command::StartGame => self.start_game(state)?,
            Command::AdvancePhase => self.advance_phase(state)?,
            Command::EndTurn => self.end_turn(state)?,
            Command::GrantResource {
                player_id,
                resource,
                amount,
            } => self.grant_resource(state, player_id, resource, amount)?,
            Command::BuyDevelopmentCard { player_id } => {
                self.buy_development_card(state, player_id)?
            }
            Command::PlayDevelopmentCard { player_id, card } => {
                self.play_development_card(state, player_id, card)?
            }
        };

        // Monotonic versioning helps synchronization and deterministic replay.
        state.version = state.version.saturating_add(1);
        Ok(events)
    }

    /// Register a new player in lobby phase.
    fn add_player(
        &self,
        state: &mut GameState,
        id: PlayerId,
        name: String,
    ) -> Result<Vec<Event>, EngineError> {
        // Joining is only legal before the match starts.
        if !matches!(state.phase, GamePhase::Lobby) {
            return Err(EngineError::InvalidPhase {
                phase: state.phase.clone(),
            });
        }

        // Enforce configured table size constraints.
        if state.players.len() >= state.config.max_players {
            return Err(EngineError::TooManyPlayers {
                max: state.config.max_players,
            });
        }

        // Keep ids unique within a match.
        if state.has_player(id) {
            return Err(EngineError::DuplicatePlayer { player_id: id });
        }

        // Keep display names unique for easier UX/server routing.
        if state.has_player_name(&name) {
            return Err(EngineError::DuplicatePlayerName { name });
        }

        state.players.push(Player::new(id, name));
        Ok(vec![Event::PlayerAdded { player_id: id }])
    }

    /// Start game setup once lobby constraints are satisfied.
    fn start_game(&self, state: &mut GameState) -> Result<Vec<Event>, EngineError> {
        if !matches!(state.phase, GamePhase::Lobby) {
            return Err(EngineError::InvalidPhase {
                phase: state.phase.clone(),
            });
        }

        // Enforce minimum table size before opening setup.
        if state.players.len() < state.config.min_players {
            return Err(EngineError::NotEnoughPlayers {
                required: state.config.min_players,
            });
        }

        // Turn order is seeded directly from join order in this phase.
        state.turn_order = state.players.iter().map(|player| player.id).collect();
        state.active_index = 0;
        state.phase = GamePhase::Setup {
            round: 1,
            direction: Direction::Forward,
        };

        Ok(vec![Event::GameStarted])
    }

    /// Move the game to its next coarse-grained phase.
    fn advance_phase(&self, state: &mut GameState) -> Result<Vec<Event>, EngineError> {
        let next_phase = match state.phase {
            // Setup currently jumps to turn start once setup handlers complete.
            GamePhase::Setup { .. } => GamePhase::TurnStart,
            // Turn-start transitions into main-turn actions.
            GamePhase::TurnStart => GamePhase::MainTurn,
            // Main turn remains stable until an explicit `EndTurn` command.
            GamePhase::MainTurn => GamePhase::MainTurn,
            GamePhase::Lobby | GamePhase::GameOver => {
                return Err(EngineError::InvalidPhase {
                    phase: state.phase.clone(),
                });
            }
        };

        state.phase = next_phase.clone();
        Ok(vec![Event::PhaseAdvanced { phase: next_phase }])
    }

    /// End the active turn and rotate ownership to the next seat.
    fn end_turn(&self, state: &mut GameState) -> Result<Vec<Event>, EngineError> {
        // Ending turn is legal only after entering main-turn phase.
        if !matches!(state.phase, GamePhase::MainTurn) {
            return Err(EngineError::InvalidPhase {
                phase: state.phase.clone(),
            });
        }

        if state.turn_order.is_empty() {
            return Err(EngineError::NoActivePlayer);
        }

        let ending_player = state.active_player().ok_or(EngineError::NoActivePlayer)?;
        if let Some(player) = state.player_mut(ending_player) {
            // Development cards bought this turn become playable on future turns.
            player.unlock_new_development_cards();
        }

        // Rotate in a deterministic ring over current turn order.
        state.active_index = (state.active_index + 1) % state.turn_order.len();
        state.phase = GamePhase::TurnStart;
        let active_player = state.active_player().ok_or(EngineError::NoActivePlayer)?;

        Ok(vec![Event::TurnEnded { active_player }])
    }

    /// Transfer resource cards from bank to one player.
    ///
    /// This is currently used as a low-level primitive for future rule flows
    /// such as production distribution and setup grants.
    fn grant_resource(
        &self,
        state: &mut GameState,
        player_id: PlayerId,
        resource: crate::model::Resource,
        amount: u8,
    ) -> Result<Vec<Event>, EngineError> {
        // Resource transfer is not legal outside active gameplay.
        if matches!(state.phase, GamePhase::Lobby | GamePhase::GameOver) {
            return Err(EngineError::InvalidPhase {
                phase: state.phase.clone(),
            });
        }

        // Bank must have enough cards before mutating player inventory.
        if !state.bank.remove(resource, amount) {
            return Err(EngineError::BankInsufficient { resource });
        }

        // Player must exist; otherwise this command is invalid.
        let player = state
            .player_mut(player_id)
            .ok_or(EngineError::PlayerNotFound { player_id })?;
        player.resources.add(resource, amount);

        Ok(vec![Event::ResourceGranted {
            player_id,
            resource,
            amount,
        }])
    }

    /// Purchase one development card by paying standard base-game cost.
    fn buy_development_card(
        &self,
        state: &mut GameState,
        player_id: PlayerId,
    ) -> Result<Vec<Event>, EngineError> {
        self.ensure_active_main_turn(state, player_id)?;

        let player_idx = state
            .players
            .iter()
            .position(|player| player.id == player_id)
            .ok_or(EngineError::PlayerNotFound { player_id })?;

        let player = &state.players[player_idx];
        if !player.can_buy_development_card() {
            for resource in [Resource::Wool, Resource::Grain, Resource::Ore] {
                if player.resources.amount(resource) < 1 {
                    return Err(EngineError::InsufficientResources {
                        player_id,
                        resource,
                    });
                }
            }
        }

        let card = state
            .development_deck
            .draw()
            .ok_or(EngineError::DevelopmentDeckEmpty)?;

        {
            let player = &mut state.players[player_idx];
            let _ = player.resources.remove(Resource::Wool, 1);
            let _ = player.resources.remove(Resource::Grain, 1);
            let _ = player.resources.remove(Resource::Ore, 1);

            match card {
                // Victory point cards score immediately when purchased.
                DevelopmentCard::VictoryPoint => {
                    player.victory_points = player.victory_points.saturating_add(1);
                    player.development_cards.push(card);
                }
                _ => {
                    player.newly_acquired_development_cards.push(card);
                }
            }
        }

        state.bank.add(Resource::Wool, 1);
        state.bank.add(Resource::Grain, 1);
        state.bank.add(Resource::Ore, 1);

        Ok(vec![Event::DevelopmentCardPurchased {
            player_id,
            card,
            remaining_cards: state.development_deck.remaining(),
        }])
    }

    /// Play one development card currently available in player's hand.
    fn play_development_card(
        &self,
        state: &mut GameState,
        player_id: PlayerId,
        card: DevelopmentCard,
    ) -> Result<Vec<Event>, EngineError> {
        self.ensure_active_main_turn(state, player_id)?;

        if card == DevelopmentCard::VictoryPoint {
            return Err(EngineError::VictoryPointCardNotPlayable);
        }

        let player_idx = state
            .players
            .iter()
            .position(|player| player.id == player_id)
            .ok_or(EngineError::PlayerNotFound { player_id })?;

        {
            let player = &mut state.players[player_idx];
            let hand_index = player
                .development_cards
                .iter()
                .position(|existing| *existing == card)
                .ok_or(EngineError::DevelopmentCardUnavailable { player_id, card })?;
            let _ = player.development_cards.remove(hand_index);

            if card == DevelopmentCard::Knight {
                player.played_knights = player.played_knights.saturating_add(1);
            }
        }

        let mut events = vec![Event::DevelopmentCardPlayed { player_id, card }];

        if card == DevelopmentCard::Knight {
            self.maybe_award_largest_army(state, player_id, &mut events);
        }

        Ok(events)
    }

    /// Ensure command is issued by active player during main-turn phase.
    fn ensure_active_main_turn(
        &self,
        state: &GameState,
        player_id: PlayerId,
    ) -> Result<(), EngineError> {
        if !matches!(state.phase, GamePhase::MainTurn) {
            return Err(EngineError::InvalidPhase {
                phase: state.phase.clone(),
            });
        }

        let expected = state.active_player().ok_or(EngineError::NoActivePlayer)?;
        if expected != player_id {
            return Err(EngineError::NotPlayersTurn {
                expected,
                actual: player_id,
            });
        }

        Ok(())
    }

    /// Apply largest-army ownership rules after knight plays.
    fn maybe_award_largest_army(
        &self,
        state: &mut GameState,
        player_id: PlayerId,
        events: &mut Vec<Event>,
    ) {
        let player_idx = match state.players.iter().position(|player| player.id == player_id) {
            Some(index) => index,
            None => return,
        };

        let played_knights = state.players[player_idx].played_knights;
        if played_knights < 3 || played_knights <= state.largest_army_size {
            return;
        }

        if let Some(previous_owner) = state.largest_army_owner {
            if previous_owner != player_id {
                if let Some(previous_idx) = state
                    .players
                    .iter()
                    .position(|player| player.id == previous_owner)
                {
                    state.players[previous_idx].victory_points =
                        state.players[previous_idx].victory_points.saturating_sub(2);
                }
                state.players[player_idx].victory_points =
                    state.players[player_idx].victory_points.saturating_add(2);
            }
        } else {
            state.players[player_idx].victory_points =
                state.players[player_idx].victory_points.saturating_add(2);
        }

        state.largest_army_owner = Some(player_id);
        state.largest_army_size = played_knights;
        events.push(Event::LargestArmyAwarded {
            player_id,
            army_size: played_knights,
        });
    }
}