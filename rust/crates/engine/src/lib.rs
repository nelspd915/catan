//! Authoritative game engine primitives for multiplayer Catan.
//!
//! This crate is intentionally server-first: clients submit commands, the
//! engine validates and applies them, and callers consume emitted events.
//! Current scope covers foundational lifecycle and turn-flow scaffolding.

/// Command contracts accepted by the authoritative engine.
pub mod command;
/// Engine implementation and state transition handlers.
pub mod engine;
/// Typed engine error surface for command rejection reasons.
pub mod error;
/// Event contracts emitted by successful state transitions.
pub mod event;
/// Shared game-domain model types used by commands, events, and engine state.
pub mod model;
/// Deterministic and test-friendly random number utilities.
pub mod rng;

/// Canonical command type re-export for crate consumers.
pub use command::Command;
/// Canonical engine type re-export for crate consumers.
pub use engine::Engine;
/// Canonical error type re-export for crate consumers.
pub use error::EngineError;
/// Canonical event type re-export for crate consumers.
pub use event::Event;
/// Canonical domain model re-exports for crate consumers.
pub use model::{
    DevelopmentCard, DevelopmentDeck, Direction, GameConfig, GameId, GamePhase, GameState, Player,
    PlayerId, Resource, ResourceBank,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_starts_game_from_lobby() {
        // Tests use a lower minimum to keep fixtures compact.
        let config = GameConfig {
            min_players: 2,
            ..GameConfig::default()
        };
        let mut state = Engine::new(config).create_game("test-game");
        let mut engine = Engine::new(GameConfig {
            min_players: 2,
            ..GameConfig::default()
        });

        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(1),
                    name: "Alice".to_string(),
                },
            )
            .unwrap();

        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(2),
                    name: "Bob".to_string(),
                },
            )
            .unwrap();

        let _ = engine.apply(&mut state, Command::StartGame).unwrap();

        assert!(matches!(state.phase, GamePhase::Setup { .. }));
        assert_eq!(state.turn_order.len(), 2);
    }

    #[test]
    fn end_turn_rotates_active_player() {
        // Tests use a lower minimum to keep fixtures compact.
        let config = GameConfig {
            min_players: 2,
            ..GameConfig::default()
        };
        let mut state = Engine::new(config.clone()).create_game("rotation");
        let mut engine = Engine::new(config);

        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(1),
                    name: "Alice".to_string(),
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(2),
                    name: "Bob".to_string(),
                },
            )
            .unwrap();
        let _ = engine.apply(&mut state, Command::StartGame).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();

        assert_eq!(state.active_player(), Some(PlayerId::new(1)));
        let _ = engine.apply(&mut state, Command::EndTurn).unwrap();
        assert_eq!(state.active_player(), Some(PlayerId::new(2)));
    }

    #[test]
    fn buying_development_card_spends_resources_and_locks_card_until_turn_end() {
        let config = GameConfig {
            min_players: 2,
            ..GameConfig::default()
        };
        let mut state = Engine::new(config.clone()).create_game("dev-cards");
        let mut engine = Engine::new(config);

        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(1),
                    name: "Alice".to_string(),
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(2),
                    name: "Bob".to_string(),
                },
            )
            .unwrap();
        let _ = engine.apply(&mut state, Command::StartGame).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();

        let _ = engine
            .apply(
                &mut state,
                Command::GrantResource {
                    player_id: PlayerId::new(1),
                    resource: Resource::Wool,
                    amount: 1,
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::GrantResource {
                    player_id: PlayerId::new(1),
                    resource: Resource::Grain,
                    amount: 1,
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::GrantResource {
                    player_id: PlayerId::new(1),
                    resource: Resource::Ore,
                    amount: 1,
                },
            )
            .unwrap();

        let events = engine
            .apply(
                &mut state,
                Command::BuyDevelopmentCard {
                    player_id: PlayerId::new(1),
                },
            )
            .unwrap();

        assert!(matches!(
            events.first(),
            Some(Event::DevelopmentCardPurchased {
                player_id,
                card: DevelopmentCard::Monopoly,
                ..
            }) if *player_id == PlayerId::new(1)
        ));

        let player = state.players.iter().find(|player| player.id == PlayerId::new(1)).unwrap();
        assert_eq!(player.resources.amount(Resource::Wool), 0);
        assert_eq!(player.resources.amount(Resource::Grain), 0);
        assert_eq!(player.resources.amount(Resource::Ore), 0);
        assert_eq!(player.newly_acquired_development_cards.len(), 1);

        let play_result = engine.apply(
            &mut state,
            Command::PlayDevelopmentCard {
                player_id: PlayerId::new(1),
                card: DevelopmentCard::Monopoly,
            },
        );
        assert!(matches!(
            play_result,
            Err(EngineError::DevelopmentCardUnavailable {
                player_id,
                card: DevelopmentCard::Monopoly,
            }) if player_id == PlayerId::new(1)
        ));

        let _ = engine.apply(&mut state, Command::EndTurn).unwrap();
        let player = state.players.iter().find(|player| player.id == PlayerId::new(1)).unwrap();
        assert_eq!(player.newly_acquired_development_cards.len(), 0);
        assert_eq!(player.development_cards.len(), 1);
    }

    #[test]
    fn playing_knights_awards_largest_army() {
        let config = GameConfig {
            min_players: 2,
            ..GameConfig::default()
        };
        let mut state = Engine::new(config.clone()).create_game("largest-army");
        let mut engine = Engine::new(config);

        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(1),
                    name: "Alice".to_string(),
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(2),
                    name: "Bob".to_string(),
                },
            )
            .unwrap();
        let _ = engine.apply(&mut state, Command::StartGame).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();

        {
            let player = state.players.iter_mut().find(|player| player.id == PlayerId::new(1)).unwrap();
            player.development_cards.push(DevelopmentCard::Knight);
            player.development_cards.push(DevelopmentCard::Knight);
            player.development_cards.push(DevelopmentCard::Knight);
        }

        let _ = engine
            .apply(
                &mut state,
                Command::PlayDevelopmentCard {
                    player_id: PlayerId::new(1),
                    card: DevelopmentCard::Knight,
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::PlayDevelopmentCard {
                    player_id: PlayerId::new(1),
                    card: DevelopmentCard::Knight,
                },
            )
            .unwrap();
        let events = engine
            .apply(
                &mut state,
                Command::PlayDevelopmentCard {
                    player_id: PlayerId::new(1),
                    card: DevelopmentCard::Knight,
                },
            )
            .unwrap();

        assert!(matches!(
            events.last(),
            Some(Event::LargestArmyAwarded {
                player_id,
                army_size: 3,
            }) if *player_id == PlayerId::new(1)
        ));

        assert_eq!(state.largest_army_owner, Some(PlayerId::new(1)));
        assert_eq!(state.largest_army_size, 3);
        let player = state.players.iter().find(|player| player.id == PlayerId::new(1)).unwrap();
        assert_eq!(player.victory_points, 2);
    }

    #[test]
    fn longest_road_awards_two_victory_points() {
        let config = GameConfig {
            min_players: 2,
            ..GameConfig::default()
        };
        let mut state = Engine::new(config.clone()).create_game("longest-road-award");
        let mut engine = Engine::new(config);

        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(1),
                    name: "Alice".to_string(),
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(2),
                    name: "Bob".to_string(),
                },
            )
            .unwrap();
        let _ = engine.apply(&mut state, Command::StartGame).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();

        let events = engine
            .apply(
                &mut state,
                Command::UpdateLongestRoadLength {
                    player_id: PlayerId::new(1),
                    road_length: 5,
                },
            )
            .unwrap();

        assert!(matches!(
            events.first(),
            Some(Event::LongestRoadAwarded {
                player_id,
                road_length: 5,
                previous_owner: None,
            }) if *player_id == PlayerId::new(1)
        ));
        assert_eq!(state.longest_road_owner, Some(PlayerId::new(1)));
        assert_eq!(state.longest_road_size, 5);
        let player = state.players.iter().find(|player| player.id == PlayerId::new(1)).unwrap();
        assert_eq!(player.victory_points, 2);
    }

    #[test]
    fn longest_road_tie_keeps_existing_owner() {
        let config = GameConfig {
            min_players: 2,
            ..GameConfig::default()
        };
        let mut state = Engine::new(config.clone()).create_game("longest-road-tie");
        let mut engine = Engine::new(config);

        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(1),
                    name: "Alice".to_string(),
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(2),
                    name: "Bob".to_string(),
                },
            )
            .unwrap();
        let _ = engine.apply(&mut state, Command::StartGame).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();

        let _ = engine
            .apply(
                &mut state,
                Command::UpdateLongestRoadLength {
                    player_id: PlayerId::new(1),
                    road_length: 6,
                },
            )
            .unwrap();
        let events = engine
            .apply(
                &mut state,
                Command::UpdateLongestRoadLength {
                    player_id: PlayerId::new(2),
                    road_length: 6,
                },
            )
            .unwrap();

        assert!(events.is_empty());
        assert_eq!(state.longest_road_owner, Some(PlayerId::new(1)));
        assert_eq!(state.longest_road_size, 6);

        let alice = state.players.iter().find(|player| player.id == PlayerId::new(1)).unwrap();
        let bob = state.players.iter().find(|player| player.id == PlayerId::new(2)).unwrap();
        assert_eq!(alice.victory_points, 2);
        assert_eq!(bob.victory_points, 0);
    }

    #[test]
    fn longest_road_clears_when_no_player_meets_threshold() {
        let config = GameConfig {
            min_players: 2,
            ..GameConfig::default()
        };
        let mut state = Engine::new(config.clone()).create_game("longest-road-clear");
        let mut engine = Engine::new(config);

        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(1),
                    name: "Alice".to_string(),
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::AddPlayer {
                    id: PlayerId::new(2),
                    name: "Bob".to_string(),
                },
            )
            .unwrap();
        let _ = engine.apply(&mut state, Command::StartGame).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();
        let _ = engine.apply(&mut state, Command::AdvancePhase).unwrap();

        let _ = engine
            .apply(
                &mut state,
                Command::UpdateLongestRoadLength {
                    player_id: PlayerId::new(1),
                    road_length: 5,
                },
            )
            .unwrap();
        let events = engine
            .apply(
                &mut state,
                Command::UpdateLongestRoadLength {
                    player_id: PlayerId::new(1),
                    road_length: 4,
                },
            )
            .unwrap();

        assert!(matches!(
            events.first(),
            Some(Event::LongestRoadCleared {
                previous_owner,
            }) if *previous_owner == PlayerId::new(1)
        ));
        assert_eq!(state.longest_road_owner, None);
        assert_eq!(state.longest_road_size, 0);
        let player = state.players.iter().find(|player| player.id == PlayerId::new(1)).unwrap();
        assert_eq!(player.victory_points, 0);
    }
}
