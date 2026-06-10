//! Typed command rejection reasons returned by the engine.
//!
//! Keeping these explicit is important for multiplayer UX: callers can map
//! specific failures to user-visible explanations and telemetry dimensions.

use thiserror::Error;

use crate::model::{GamePhase, PlayerId, Resource};

/// Domain errors produced while validating or applying commands.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum EngineError {
    /// The command is not legal in the current game phase.
    #[error("cannot run command in phase {phase:?}")]
    InvalidPhase { phase: GamePhase },
    /// A player with this identifier already exists in the game.
    #[error("player {player_id} already exists")]
    DuplicatePlayer { player_id: PlayerId },
    /// A player with this display name already exists in the game.
    #[error("player name {name} already exists")]
    DuplicatePlayerName { name: String },
    /// The requested player does not exist in the current game state.
    #[error("player {player_id} was not found")]
    PlayerNotFound { player_id: PlayerId },
    /// The bank cannot satisfy a requested transfer for this resource.
    #[error("bank does not have enough {resource:?}")]
    BankInsufficient { resource: Resource },
    /// The game cannot start because player count is below configured minimum.
    #[error("minimum player count of {required} not met")]
    NotEnoughPlayers { required: usize },
    /// A command attempted to exceed the configured maximum player count.
    #[error("maximum player count of {max} exceeded")]
    TooManyPlayers { max: usize },
    /// The state has no active turn owner when one is required.
    #[error("no active player available")]
    NoActivePlayer,
}
