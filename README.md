# Tetris

Multiplayer Tetris with adaptive skill-based handicapping. Built for playing with family and friends of different skill levels — the handicap system evens out win rates so games stay competitive.

## Features

- **Core Tetris** — SRS rotation, wall kicks, lock delay, ghost piece, hold, next queue, scoring (Guideline and NES), DAS/ARR input handling
- **Multiplayer** — WebSocket server, room/lobby system, real-time game sync, garbage sending, opponent board display, disconnect/reconnect handling, rematch flow
- **Adaptive balancing** — Glicko-2 skill rating, per-player handicaps on garbage send/receive, skill-aware targeting bias, in-game handicap indicator
- **Sound** — Web Audio API sound effects for piece movement, rotation, line clears, and garbage

## Tech stack

- TypeScript + React (Vite) frontend with Canvas rendering
- Node.js + Express + WebSocket server
- npm workspaces monorepo (`packages/client`, `packages/server`, `packages/shared`)
- Vitest for unit/integration tests, Playwright for E2E

## Getting started

```bash
npm install
npm run dev          # client dev server
npm run dev:server   # game server
```

## Testing

```bash
npm test             # unit + integration tests
npm run test:e2e     # Playwright end-to-end tests
npm run test:coverage
```

## Project structure

```
packages/
  client/    — React UI, canvas renderer, input handling, sound
  server/    — WebSocket server, game sessions, matchmaking, balancing
  shared/    — Engine, protocol types, skill rating, test utilities
e2e/         — Playwright specs and helpers
```

## How this was built

This project was built using [pm](https://github.com/mjtomei/pm), a CLI tool for managing AI-driven development sessions. The entire codebase — 33,000 lines across 53 merged PRs — was generated from a 3-line description with ~2 hours of human involvement. See the [full narrative](docs/pm-demo-narrative.md) for details.
