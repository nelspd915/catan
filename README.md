# Catan

Basic setup and usage instructions for this project.

## Prerequisites

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/nelspd915/catan.git
cd catan
```

## Frontend (Vite + Lit Components)

1. Navigate to the frontend directory and install dependencies:

```bash
cd frontend
pnpm install
```

2. Start the development server:

```bash
pnpm run dev
```

## Backend (Rust)

1. Navigate to the backend directory and build the project:

```bash
cd rust
cargo build
```

2. Run the backend server:

```bash
cargo run -p server
```

3. Call the API from your frontend or curl while the server is running on `http://127.0.0.1:3000`.

Create a game:

```bash
curl -X POST http://127.0.0.1:3000/games \
	-H "content-type: application/json" \
	-d '{"game_id":"local-test","config":{"min_players":2,"max_players":4,"target_victory_points":10}}'
```

Apply a command:

```bash
curl -X POST http://127.0.0.1:3000/games/local-test/commands \
	-H "content-type: application/json" \
	-d '{"AddPlayer":{"id":1,"name":"Alice"}}'
```

Fetch state:

```bash
curl http://127.0.0.1:3000/games/local-test
```
