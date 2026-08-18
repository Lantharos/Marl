//! Git-native local repository primitives for Marl.
//!
//! This crate deliberately has no HTTP, terminal, or hosted-product concepts. It turns
//! stable Git commands into typed results and is the boundary used by the CLI and runner.

mod models;
mod repository;

pub use models::*;
pub use repository::{RepoError, Repository, Result};
