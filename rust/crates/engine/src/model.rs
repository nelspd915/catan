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
        }
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