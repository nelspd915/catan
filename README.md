# Catan

Basic setup and usage instructions for this project.

## Prerequisites

- [Git](https://git-scm.com/)
- A recent version of [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/)
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
cargo run
```
