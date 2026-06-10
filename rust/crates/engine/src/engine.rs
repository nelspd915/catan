//! Authoritative command application for game state transitions.
//!
//! This module hosts the current transition dispatcher and validation rules.
//! As rules become more granular, these handlers can delegate to specialized
//! modules while preserving the same external contract.

use crate::command::Command;
use crate::error::EngineError;
use crate::event::Event;
use crate::model::{
    Building, Direction, GameConfig, GamePhase, GameState, Player, PlayerId, Resource,
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
            Command::BuyBuilding {
                player_id,
                building,
            } => self.buy_building(state, player_id, building)?,
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
        resource: Resource,
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

    /// Purchase one building piece by paying resource costs.
    fn buy_building(
        &self,
        state: &mut GameState,
        player_id: PlayerId,
        building: Building,
    ) -> Result<Vec<Event>, EngineError> {
        if !matches!(state.phase, GamePhase::MainTurn) {
            return Err(EngineError::InvalidPhase {
                phase: state.phase.clone(),
            });
        }

        let cost = Self::building_cost(building);

        {
            let player = state
                .player_mut(player_id)
                .ok_or(EngineError::PlayerNotFound { player_id })?;

            for (resource, required) in &cost {
                let available = player.resources.amount(*resource);
                if available < *required {
                    return Err(EngineError::InsufficientResources {
                        player_id,
                        resource: *resource,
                        required: *required,
                        available,
                    });
                }
            }

            let pieces_left = match building {
                Building::Road => &mut player.roads_left,
                Building::Settlement => &mut player.settlements_left,
                Building::City => &mut player.cities_left,
            };

            if *pieces_left == 0 {
                return Err(EngineError::NoPiecesRemaining {
                    player_id,
                    building,
                });
            }

            for (resource, amount) in &cost {
                let removed = player.resources.remove(*resource, *amount);
                debug_assert!(removed, "resource pre-check should guarantee removal");
            }

            *pieces_left -= 1;
        }

        for (resource, amount) in &cost {
            state.bank.add(*resource, *amount);
        }

        Ok(vec![Event::BuildingPurchased {
            player_id,
            building,
        }])
    }

    /// Return resource cost for one building purchase.
    fn building_cost(building: Building) -> Vec<(Resource, u8)> {
        match building {
            Building::Road => vec![(Resource::Brick, 1), (Resource::Lumber, 1)],
            Building::Settlement => vec![
                (Resource::Brick, 1),
                (Resource::Lumber, 1),
                (Resource::Wool, 1),
                (Resource::Grain, 1),
            ],
            Building::City => vec![(Resource::Grain, 2), (Resource::Ore, 3)],
        }
    }
}
