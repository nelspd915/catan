//! Events describe authoritative outcomes produced by accepted commands.
//!
//! The server layer can forward these to clients, persist them for replay, or
//! derive analytics without re-implementing rule logic.

use serde::{Deserialize, Serialize};

use crate::model::{DevelopmentCard, GamePhase, PlayerId, Resource};

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
    /// A development card was purchased by a player.
    DevelopmentCardPurchased {
        /// The purchasing player.
        player_id: PlayerId,
        /// The purchased card.
        card: DevelopmentCard,
        /// Number of cards left in development deck.
        remaining_cards: usize,
    },
    /// A development card was played by a player.
    DevelopmentCardPlayed {
        /// The player who played the card.
        player_id: PlayerId,
        /// The card that was played.
        card: DevelopmentCard,
    },
    /// Largest army changed ownership.
    LargestArmyAwarded {
        /// New largest-army owner.
        player_id: PlayerId,
        /// Knights played by owner at award time.
        army_size: u8,
    },
    /// Longest road changed ownership.
    LongestRoadAwarded {
        /// New longest-road owner.
        player_id: PlayerId,
        /// Length used to satisfy longest-road ownership.
        road_length: u8,
        /// Previous owner, if ownership was transferred.
        previous_owner: Option<PlayerId>,
    },
    /// Longest road bonus was removed because no owner currently qualifies.
    LongestRoadCleared {
        /// Previous owner that lost the bonus.
        previous_owner: PlayerId,
    },
}