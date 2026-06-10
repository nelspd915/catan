//! Commands represent player or system intent submitted to the engine.
//!
//! Commands should not mutate state directly. Instead, they are validated and
//! applied by `Engine::apply`, which either emits domain events or returns an
//! explicit `EngineError`.

use serde::{Deserialize, Serialize};

use crate::model::{DevelopmentCard, PlayerId, Resource};

/// A request to mutate game state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Command {
    /// Add a new player while in the lobby.
    ///
    /// Validation checks include max-player limits and uniqueness for both
    /// player id and display name.
    AddPlayer { id: PlayerId, name: String },
    /// Transition from lobby to setup sequence.
    ///
    /// Requires that the minimum player count configured for the game is met.
    StartGame,
    /// Advance to the next coarse-grained phase.
    ///
    /// This is currently a scaffold command used while finer setup and turn
    /// state machines are being implemented.
    AdvancePhase,
    /// End the current player's turn and rotate to the next player in order.
    EndTurn,
    /// Grant a resource from the bank to a player.
    ///
    /// Intended for controlled internal workflows (e.g., production, setup
    /// grants) and test fixtures.
    GrantResource {
        /// The player who receives the resource cards.
        player_id: PlayerId,
        /// The resource type to grant.
        resource: Resource,
        /// Number of cards to transfer from bank to player.
        amount: u8,
    },
    /// Buy one development card (cost: wool + grain + ore).
    BuyDevelopmentCard {
        /// The active player purchasing the card.
        player_id: PlayerId,
    },
    /// Play one development card from the player's playable hand.
    PlayDevelopmentCard {
        /// The active player playing the card.
        player_id: PlayerId,
        /// The card type to play.
        card: DevelopmentCard,
    },
    /// Update one player's computed continuous road length.
    ///
    /// This is a system-facing command intended to be called after board
    /// topology changes (road placement or road interruption).
    UpdateLongestRoadLength {
        /// The player whose road length was recomputed.
        player_id: PlayerId,
        /// The player's best continuous road length.
        road_length: u8,
    },
}