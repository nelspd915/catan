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
    Building, Direction, GameConfig, GameId, GamePhase, GameState, Player, PlayerId, Resource,
    ResourceBank,
};

#[cfg(test)]
mod tests {
    use super::*;

    fn create_started_main_turn_game() -> (Engine, GameState) {
        let config = GameConfig {
            min_players: 2,
            ..GameConfig::default()
        };

        let mut state = Engine::new(config.clone()).create_game("purchase-tests");
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

        (engine, state)
    }

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
    fn buying_road_spends_resources_and_piece() {
        let (mut engine, mut state) = create_started_main_turn_game();

        let _ = engine
            .apply(
                &mut state,
                Command::GrantResource {
                    player_id: PlayerId::new(1),
                    resource: Resource::Brick,
                    amount: 1,
                },
            )
            .unwrap();
        let _ = engine
            .apply(
                &mut state,
                Command::GrantResource {
                    player_id: PlayerId::new(1),
                    resource: Resource::Lumber,
                    amount: 1,
                },
            )
            .unwrap();

        let player_before = state.players.iter().find(|p| p.id == PlayerId::new(1)).unwrap();
        let roads_before = player_before.roads_left;
        let roads_built_before = player_before.roads_built;
        let vp_before = player_before.victory_points;
        let bank_brick_before = state.bank.amount(Resource::Brick);
        let bank_lumber_before = state.bank.amount(Resource::Lumber);

        let events = engine
            .apply(
                &mut state,
                Command::BuyBuilding {
                    player_id: PlayerId::new(1),
                    building: Building::Road,
                },
            )
            .unwrap();

        assert_eq!(
            events,
            vec![Event::BuildingPurchased {
                player_id: PlayerId::new(1),
                building: Building::Road,
            }]
        );

        let player_after = state.players.iter().find(|p| p.id == PlayerId::new(1)).unwrap();
        assert_eq!(player_after.roads_left, roads_before - 1);
        assert_eq!(player_after.roads_built, roads_built_before + 1);
        assert_eq!(player_after.victory_points, vp_before);
        assert_eq!(player_after.resources.amount(Resource::Brick), 1);
        assert_eq!(player_after.resources.amount(Resource::Lumber), 1);
        assert_eq!(state.bank.amount(Resource::Brick), bank_brick_before + 1);
        assert_eq!(state.bank.amount(Resource::Lumber), bank_lumber_before + 1);
    }

    #[test]
    fn buying_settlement_and_city_updates_built_stock_and_victory_points() {
        let (mut engine, mut state) = create_started_main_turn_game();

        for (resource, amount) in [
            (Resource::Brick, 1),
            (Resource::Lumber, 1),
            (Resource::Wool, 1),
            (Resource::Grain, 3),
            (Resource::Ore, 3),
        ] {
            let _ = engine
                .apply(
                    &mut state,
                    Command::GrantResource {
                        player_id: PlayerId::new(1),
                        resource,
                        amount,
                    },
                )
                .unwrap();
        }

        let _ = engine
            .apply(
                &mut state,
                Command::BuyBuilding {
                    player_id: PlayerId::new(1),
                    building: Building::Settlement,
                },
            )
            .unwrap();

        let after_settlement = state.players.iter().find(|p| p.id == PlayerId::new(1)).unwrap();
        assert_eq!(after_settlement.settlements_built, 1);
        assert_eq!(after_settlement.settlements_left, 4);
        assert_eq!(after_settlement.victory_points, 1);

        let _ = engine
            .apply(
                &mut state,
                Command::BuyBuilding {
                    player_id: PlayerId::new(1),
                    building: Building::City,
                },
            )
            .unwrap();

        let after_city = state.players.iter().find(|p| p.id == PlayerId::new(1)).unwrap();
        assert_eq!(after_city.settlements_built, 0);
        assert_eq!(after_city.settlements_left, 5);
        assert_eq!(after_city.cities_built, 1);
        assert_eq!(after_city.cities_left, 3);
        assert_eq!(after_city.victory_points, 2);
    }

    #[test]
    fn buying_city_without_resources_is_rejected() {
        let (mut engine, mut state) = create_started_main_turn_game();

        let error = engine
            .apply(
                &mut state,
                Command::BuyBuilding {
                    player_id: PlayerId::new(1),
                    building: Building::City,
                },
            )
            .unwrap_err();

        assert_eq!(
            error,
            EngineError::InsufficientResources {
                player_id: PlayerId::new(1),
                resource: Resource::Grain,
                required: 2,
                available: 1,
            }
        );
    }

    #[test]
    fn advancing_to_main_turn_grants_simulation_income_to_all_players() {
        let config = GameConfig {
            min_players: 2,
            ..GameConfig::default()
        };
        let mut state = Engine::new(config.clone()).create_game("income-sim");
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
        let events = engine.apply(&mut state, Command::AdvancePhase).unwrap();

        let grant_events = events
            .iter()
            .filter(|event| matches!(event, Event::ResourceGranted { .. }))
            .count();
        assert_eq!(grant_events, 10);

        let alice = state.players.iter().find(|p| p.id == PlayerId::new(1)).unwrap();
        let bob = state.players.iter().find(|p| p.id == PlayerId::new(2)).unwrap();

        for resource in [
            Resource::Brick,
            Resource::Lumber,
            Resource::Wool,
            Resource::Grain,
            Resource::Ore,
        ] {
            assert_eq!(alice.resources.amount(resource), 1);
            assert_eq!(bob.resources.amount(resource), 1);
            assert_eq!(state.bank.amount(resource), 17);
        }
    }

    #[test]
    fn buying_on_other_players_turn_is_rejected() {
        let (mut engine, mut state) = create_started_main_turn_game();

        let error = engine
            .apply(
                &mut state,
                Command::BuyBuilding {
                    player_id: PlayerId::new(2),
                    building: Building::Road,
                },
            )
            .unwrap_err();

        assert_eq!(
            error,
            EngineError::NotPlayersTurn {
                player_id: PlayerId::new(2),
                active_player: PlayerId::new(1),
            }
        );
    }

    #[test]
    fn buying_city_can_end_game_when_target_met() {
        let config = GameConfig {
            min_players: 2,
            target_victory_points: 2,
            ..GameConfig::default()
        };
        let mut state = Engine::new(config.clone()).create_game("victory");
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
                Command::BuyBuilding {
                    player_id: PlayerId::new(1),
                    building: Building::Settlement,
                },
            )
            .unwrap();

        for (resource, amount) in [(Resource::Grain, 2), (Resource::Ore, 2)] {
            let _ = engine
                .apply(
                    &mut state,
                    Command::GrantResource {
                        player_id: PlayerId::new(1),
                        resource,
                        amount,
                    },
                )
                .unwrap();
        }

        let events = engine
            .apply(
                &mut state,
                Command::BuyBuilding {
                    player_id: PlayerId::new(1),
                    building: Building::City,
                },
            )
            .unwrap();

        assert!(events.iter().any(|event| {
            matches!(
                event,
                Event::GameWon {
                    player_id,
                    victory_points
                } if *player_id == PlayerId::new(1) && *victory_points == 2
            )
        }));
        assert_eq!(state.winner, Some(PlayerId::new(1)));
        assert!(matches!(state.phase, GamePhase::GameOver));
    }

    #[test]
    fn buying_city_without_settlement_to_upgrade_is_rejected() {
        let (mut engine, mut state) = create_started_main_turn_game();

        for (resource, amount) in [(Resource::Grain, 2), (Resource::Ore, 3)] {
            let _ = engine
                .apply(
                    &mut state,
                    Command::GrantResource {
                        player_id: PlayerId::new(1),
                        resource,
                        amount,
                    },
                )
                .unwrap();
        }

        let error = engine
            .apply(
                &mut state,
                Command::BuyBuilding {
                    player_id: PlayerId::new(1),
                    building: Building::City,
                },
            )
            .unwrap_err();

        assert_eq!(
            error,
            EngineError::NoSettlementToUpgrade {
                player_id: PlayerId::new(1),
            }
        );
    }
}
