//! Events describe authoritative outcomes produced by accepted commands.
//!
//! The server layer can forward these to clients, persist them for replay, or
//! derive analytics without re-implementing rule logic.

use serde::{Deserialize, Serialize};

use crate::model::{Building, GamePhase, PlayerId, Resource};

/// A state-transition result emitted by the engine.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Event {
    /// A player was successfully registered with the game.
    PlayerAdded { player_id: PlayerId },
    /// The game left lobby and entered setup flow.
    GameStarted,
    /// The coarse-grained game phase changed.
    PhaseAdvanced { phase: GamePhase },
    /// Turn ownership advanced to the returned active player.
    TurnEnded { active_player: PlayerId },
    /// A player received resources from the bank.
    ResourceGranted {
        /// The player that received resources.
        player_id: PlayerId,
        /// The resource type granted.
        resource: Resource,
        /// Number of cards granted.
        amount: u8,
    },
    /// A player successfully purchased a building piece.
    BuildingPurchased {
        /// The player who made the purchase.
        player_id: PlayerId,
        /// The building category purchased.
        building: Building,
    },
}
