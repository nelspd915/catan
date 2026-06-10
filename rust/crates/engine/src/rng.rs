//! Randomness abstractions used by game rules.
//!
//! The engine should stay deterministic in tests and replays. This module
//! separates rule logic from concrete RNG implementation details.

use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

/// Dice provider interface used by rule handlers.
pub trait DiceRng {
    /// Roll two six-sided dice and return both face values.
    fn roll_2d6(&mut self) -> (u8, u8);
}

/// Seeded dice implementation for deterministic gameplay and replay.
#[derive(Debug, Clone)]
pub struct SeededDiceRng {
    inner: StdRng,
}

impl SeededDiceRng {
    /// Create a deterministic RNG from a numeric seed.
    pub fn from_seed(seed: u64) -> Self {
        Self {
            inner: StdRng::seed_from_u64(seed),
        }
    }
}

impl DiceRng for SeededDiceRng {
    /// Roll two independent six-sided dice values.
    fn roll_2d6(&mut self) -> (u8, u8) {
        (self.inner.gen_range(1..=6), self.inner.gen_range(1..=6))
    }
}

/// Fixed dice implementation mainly for deterministic tests.
#[derive(Debug, Clone, Copy)]
pub struct FixedDiceRng {
    pair: (u8, u8),
}

impl FixedDiceRng {
    /// Create a fixed dice provider returning the same pair every roll.
    pub fn new(pair: (u8, u8)) -> Self {
        Self { pair }
    }
}

impl DiceRng for FixedDiceRng {
    /// Return the preconfigured face pair.
    fn roll_2d6(&mut self) -> (u8, u8) {
        self.pair
    }
}