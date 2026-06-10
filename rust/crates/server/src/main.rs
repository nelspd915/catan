use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use axum::extract::{Path, State};
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use engine::{Command, Engine, EngineError, Event, GameConfig, GameState};
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};

#[derive(Debug)]
struct GameSession {
    engine: Engine,
    state: GameState,
}

#[derive(Debug)]
struct AppState {
    games: Mutex<HashMap<String, GameSession>>,
    next_game_id: AtomicU64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            games: Mutex::new(HashMap::new()),
            next_game_id: AtomicU64::new(1),
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct CreateGameRequest {
    game_id: Option<String>,
    config: Option<GameConfig>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Debug, Serialize)]
struct CreateGameResponse {
    game_id: String,
    state: GameState,
}

#[derive(Debug, Serialize)]
struct GameStateResponse {
    state: GameState,
}

#[derive(Debug, Serialize)]
struct CommandResponse {
    events: Vec<Event>,
    state: GameState,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: &'static str,
    message: String,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    error: &'static str,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, error: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            error,
            message: message.into(),
        }
    }
}

impl From<EngineError> for ApiError {
    fn from(value: EngineError) -> Self {
        Self::new(
            StatusCode::BAD_REQUEST,
            "engine_rejected",
            value.to_string(),
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let payload = ErrorResponse {
            error: self.error,
            message: self.message,
        };
        (self.status, Json(payload)).into_response()
    }
}

type SharedState = Arc<AppState>;
type ApiResult<T> = Result<Json<T>, ApiError>;

#[tokio::main]
async fn main() {
    let state = Arc::new(AppState::default());
    let app = Router::new()
        .route("/health", get(health))
        .route("/games", post(create_game))
        .route("/games/{game_id}", get(get_game))
        .route("/games/{game_id}/commands", post(apply_command))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
                .allow_headers(Any),
        )
        .with_state(state);

    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3000);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind TCP listener");

    println!("server listening on http://{}", addr);

    axum::serve(listener, app).await.expect("run server");
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn create_game(
    State(state): State<SharedState>,
    payload: Option<Json<CreateGameRequest>>,
) -> ApiResult<CreateGameResponse> {
    let request = payload.map(|Json(value)| value).unwrap_or_default();

    let config = request.config.unwrap_or_default();
    validate_config(&config)?;

    let game_id = request.game_id.unwrap_or_else(|| {
        format!(
            "game-{}",
            state.next_game_id.fetch_add(1, Ordering::Relaxed)
        )
    });

    let mut games = state.games.lock().map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "state_poisoned",
            "state lock poisoned",
        )
    })?;

    if games.contains_key(&game_id) {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "game_exists",
            format!("game with id '{}' already exists", game_id),
        ));
    }

    let engine = Engine::new(config);
    let game_state = engine.create_game(game_id.clone());
    let response_state = game_state.clone();

    let _ = games.insert(
        game_id.clone(),
        GameSession {
            engine,
            state: game_state,
        },
    );

    Ok(Json(CreateGameResponse {
        game_id,
        state: response_state,
    }))
}

async fn get_game(
    State(state): State<SharedState>,
    Path(game_id): Path<String>,
) -> ApiResult<GameStateResponse> {
    let games = state.games.lock().map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "state_poisoned",
            "state lock poisoned",
        )
    })?;

    let session = games.get(&game_id).ok_or_else(|| {
        ApiError::new(
            StatusCode::NOT_FOUND,
            "game_not_found",
            format!("game '{}' was not found", game_id),
        )
    })?;

    Ok(Json(GameStateResponse {
        state: session.state.clone(),
    }))
}

async fn apply_command(
    State(state): State<SharedState>,
    Path(game_id): Path<String>,
    Json(command): Json<Command>,
) -> ApiResult<CommandResponse> {
    let mut games = state.games.lock().map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "state_poisoned",
            "state lock poisoned",
        )
    })?;

    let session = games.get_mut(&game_id).ok_or_else(|| {
        ApiError::new(
            StatusCode::NOT_FOUND,
            "game_not_found",
            format!("game '{}' was not found", game_id),
        )
    })?;

    let events = session.engine.apply(&mut session.state, command)?;
    Ok(Json(CommandResponse {
        events,
        state: session.state.clone(),
    }))
}

fn validate_config(config: &GameConfig) -> Result<(), ApiError> {
    if config.min_players == 0 {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_config",
            "min_players must be greater than 0",
        ));
    }

    if config.max_players < config.min_players {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_config",
            "max_players must be greater than or equal to min_players",
        ));
    }

    if config.target_victory_points == 0 {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "invalid_config",
            "target_victory_points must be greater than 0",
        ));
    }

    Ok(())
}
