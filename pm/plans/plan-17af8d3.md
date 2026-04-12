# Automated Testing

## Goal

Build test infrastructure that lets Claude (and humans) thoroughly test and debug
every game feature as it's implemented — from pure engine logic to full-app
multiplayer flows. The core game engine doesn't exist yet; this plan lays the
foundation so that each engine PR ships with robust, deterministic tests from day
one, and integration/E2E tests catch issues across the full stack.

## Scope

- **Engine test infrastructure** — helpers, factories, fixtures in `packages/shared/`
- **Deterministic engine test harness** — seed + input replay → assert state
- **Snapshot tests** for static lookup tables (SRS kick offsets, piece shapes)
- **State transition assertion utilities**
- **E2E test infrastructure** — Playwright setup for full-app browser testing
  (client + server + WebSocket, including multiplayer scenarios)
- **Coverage configuration and CI gating**

**Out of scope:** Visual regression testing (screenshot diffing), load/performance
testing, mobile device testing. These can be added later.

## Key Design Decisions

### 1. All engine logic lives in `packages/shared`

The engine must be pure and deterministic — no DOM, no timers, no network. Tests
run in Node with `vitest` (already configured). This is critical for multiplayer:
client and server must agree given the same inputs and seed.

### 2. Seeded PRNG is the foundation of determinism

Every test that involves randomness (piece generation, garbage gap columns) uses a
seeded PRNG. The engine's randomizer must accept an injected RNG function rather
than calling `Math.random()` directly. This enables:
- Reproducible test runs
- Replay-based debugging (save seed + inputs, replay to reproduce bugs)
- Client/server agreement verification

### 3. Board builder DSL for readable tests

Writing 20x10 arrays by hand is error-prone. A string-based board builder lets
tests describe board state visually:

```ts
const board = boardFromAscii(`
  ..........
  ..........
  XXXX..XXXX   // gap in columns 4-5
  XXXXXXXXXX   // full line
`);
```

This makes edge-case setups (near-full boards, T-spin cavities) easy to write
and review.

### 4. Input replay harness for integration-level engine tests

A `GameTestHarness` wraps the engine and accepts a sequence of `(tick, action)`
pairs. After running them all, you assert against the resulting `GameStateSnapshot`.
This tests full state transitions (lock → clear → garbage → spawn) without
needing a real game loop or timers.

### 5. Snapshot tests for lookup tables

SRS kick tables, piece shape matrices, and gravity curves are static data that
should never change accidentally. Vitest inline snapshots catch drift with zero
maintenance.

### 6. Playwright for E2E browser tests

Playwright handles the full-app testing layer: start the dev server + game server,
open browser contexts, interact with the UI, and verify game behavior end-to-end.
Key capabilities:
- **Multiple browser contexts** — simulate 2+ players in the same match to test
  multiplayer flows (room creation, joining, garbage exchange, game over)
- **WebSocket inspection** — verify protocol messages between client and server
- **Keyboard input** — test actual key bindings (move, rotate, drop, hold)
- **Canvas/DOM assertions** — verify board rendering, score display, next queue

Playwright runs as a separate test suite (`npm run test:e2e`) since it needs
running servers and is slower than unit tests.

### 7. Coverage gating

Configure vitest coverage to enforce thresholds on `packages/shared/src/engine/`.
Engine code is pure logic — 90%+ branch coverage is realistic and catches
untested edge cases.

## Constraints

- No external test dependencies beyond vitest + playwright
- Test utilities must be importable from engine PRs without circular deps
- PRNG seeding must be the same implementation on client and server (shared package)
- Board builder must handle the full 40-row board (20 visible + 20 buffer)
- E2E tests must be able to run in CI (headless) and locally (headed for debugging)

---

## PRs

### PR: Seeded PRNG utility
- **description**: Add a seedable pseudo-random number generator to `packages/shared/src/engine/`. This is the foundation for deterministic tests and reproducible game replays. Implement a fast, well-known algorithm (e.g., xoshiro128) with a simple API: `createRNG(seed) → { next(): number, nextInt(min, max): number }`. Pure code, no human-guided testing needed.
- **tests**: Determinism (same seed → same sequence), distribution sanity check, independence of separate instances, edge cases (nextInt bounds)
- **files**: `packages/shared/src/engine/rng.ts`, `packages/shared/src/engine/rng.test.ts`
- **depends_on**:

---

### PR: Board builder test utility
- **description**: Add a `boardFromAscii()` helper and a `boardToAscii()` helper for test readability. Accepts a multiline string where `.` = empty, `X` = filled (generic), and piece-type letters (`I`, `T`, etc.) represent colored cells. Strips leading/trailing blank lines, pads short boards to full height. Also add `emptyBoard()` and `assertBoardEquals()` helpers. Pure utility, no human-guided testing needed.
- **tests**: Round-trip (ascii → board → ascii), partial board (only bottom rows specified), piece-type colors preserved, full 40-row board support, error on invalid width
- **files**: `packages/shared/src/__test-utils__/board-builder.ts`, `packages/shared/src/__test-utils__/board-builder.test.ts`, `packages/shared/src/__test-utils__/index.ts`
- **depends_on**:

---

### PR: Game state factory helpers
- **description**: Add factory functions for creating test game states: `makeGameState(overrides?)`, `makePiece(type, overrides?)`, `makeGarbageBatch(overrides?)`. These produce valid `GameStateSnapshot`, `PieceState`, and `GarbageBatch` objects with sensible defaults, reducing boilerplate in every engine test file. Pure utility, no human-guided testing needed.
- **tests**: Defaults produce valid objects, overrides are applied correctly, board dimensions are correct, factory objects are independent (no shared references)
- **files**: `packages/shared/src/__test-utils__/factories.ts`, `packages/shared/src/__test-utils__/factories.test.ts`, `packages/shared/src/__test-utils__/index.ts`
- **depends_on**:

---

### PR: Snapshot tests for piece shapes and SRS kick tables
- **description**: Add snapshot tests that lock down the static data tables defined in pr-48ed9f4 (Piece definitions, plan-48e829d): piece shape matrices for all 7 pieces in all 4 rotations, and the SRS wall kick offset table (including I-piece special cases). These tests import the data and use `toMatchInlineSnapshot()` so any accidental edit is caught immediately. Pure data tests, no human-guided testing needed.
- **tests**: Inline snapshots for all 7 piece shapes x 4 rotations (28 snapshots), inline snapshots for all SRS kick offset sets, NRS rotation states if applicable
- **files**: `packages/shared/src/engine/piece-data.test.ts`, `packages/shared/src/engine/kick-tables.test.ts`
- **depends_on**: Piece definitions for SRS and NRS rotation systems (pr-48ed9f4, plan-48e829d)

---

### PR: Game test harness (input replay)
- **description**: Add a `GameTestHarness` class that wraps the engine for integration-level testing. API: `new GameTestHarness({ seed, ruleSet?, startLevel? })` creates a game, then `harness.input(action)` or `harness.inputs([action1, action2, ...])` feeds inputs, and `harness.state` returns the current `GameStateSnapshot`. Also supports `harness.tickUntil(predicate)` for advancing past lock delays. This enables testing full state transitions (piece lock → line clear → garbage insert → next piece spawn) without timers. Depends on the engine existing, so this PR also defines the minimal engine interface it expects (which engine PRs will implement). No human-guided testing needed.
- **tests**: Harness initializes with correct defaults, inputs are applied in order, state is accessible after each input, tickUntil advances correctly, deterministic (same seed + inputs = same state)
- **files**: `packages/shared/src/__test-utils__/game-harness.ts`, `packages/shared/src/__test-utils__/game-harness.test.ts`, `packages/shared/src/__test-utils__/index.ts`
- **depends_on**: Seeded PRNG utility, Game state factory helpers

---

### PR: State transition assertion helpers
- **description**: Add focused assertion helpers for verifying engine state transitions: `assertLinesCleared(before, after, expectedCount)`, `assertPieceLocked(state, expectedCells)`, `assertGarbageInserted(before, after, batch)`, `assertSpawnedPiece(state, expectedType)`. These compose with the board builder and game harness to make transition tests readable and specific. No human-guided testing needed.
- **tests**: Each assertion helper correctly passes on valid transitions, each helper throws descriptive errors on mismatches, composability (chain multiple assertions for a full lock→clear→garbage→spawn cycle)
- **files**: `packages/shared/src/__test-utils__/assertions.ts`, `packages/shared/src/__test-utils__/assertions.test.ts`, `packages/shared/src/__test-utils__/index.ts`
- **depends_on**: Board builder test utility, Game state factory helpers

---

### PR: Playwright E2E setup and dev server orchestration
- **description**: Install Playwright and configure it for the project. Set up `playwright.config.ts` at the repo root with a `webServer` config that starts both the Vite dev server (client) and the game server before tests run. Configure headless Chromium as the default browser, with a headed mode flag for local debugging. Add `npm run test:e2e` script to root `package.json`. Create a first smoke test that loads the app and verifies it renders. **INPUT_REQUIRED**: Human should verify the smoke test opens the app correctly in a real browser.
- **tests**: Smoke test — app loads, title is correct, no console errors
- **files**: `playwright.config.ts`, `package.json`, `e2e/smoke.spec.ts`
- **depends_on**:

---

### PR: E2E test helpers for multiplayer flows
- **description**: Add Playwright helper utilities for multiplayer E2E scenarios: `createPlayerContext(browser, name)` opens a new browser context and navigates to the app, `createRoom(page)` and `joinRoom(page, roomId)` handle lobby interactions, `sendKeyboardInput(page, action)` maps game actions to key presses. These helpers abstract away UI selectors so E2E tests read like game scenarios. Also add a `waitForGameState(page, predicate)` helper that polls the page for a DOM condition (e.g., game started, game over). **INPUT_REQUIRED**: Human should verify the helpers work with the actual UI once lobby/game components exist.
- **tests**: Helper functions are tested via a 2-player lobby flow: create room → join room → verify both players see each other
- **files**: `e2e/helpers/player.ts`, `e2e/helpers/lobby.ts`, `e2e/helpers/input.ts`, `e2e/helpers/game-state.ts`, `e2e/helpers/index.ts`, `e2e/multiplayer-lobby.spec.ts`
- **depends_on**: Playwright E2E setup and dev server orchestration, Lobby UI (pr-ea6f093, plan-c686698), Room and lobby server logic (pr-0b382c5, plan-c686698)

---

### PR: E2E multiplayer game flow test
- **description**: Add an E2E test that exercises a full multiplayer game: two browser contexts create/join a room, host starts the game, both players make moves via keyboard, one player tops out, winner is declared. This validates the complete stack: React UI → WebSocket → server → game state → UI updates. **INPUT_REQUIRED**: Human should verify game interactions work in a real browser — keyboard inputs, board rendering, game over detection all depend on the actual UI implementation.
- **tests**: Full game lifecycle — room creation, game start, player input, game over, winner announcement. Also test disconnect/reconnect during a game.
- **files**: `e2e/multiplayer-game.spec.ts`
- **depends_on**: E2E test helpers for multiplayer flows, Integration — playable multiplayer Tetris (pr-c0cc689)

---

### PR: Coverage configuration and CI thresholds
- **description**: Configure vitest coverage (v8 provider) with per-package thresholds. Set `packages/shared/src/engine/` to 90% branch coverage minimum. Add `npm run test:coverage` script to root `package.json`. Update vitest workspace configs to include coverage settings. No human-guided testing needed.
- **tests**: No new unit tests — this PR is configuration. Verify by running `npm run test:coverage` and confirming thresholds are enforced.
- **files**: `packages/shared/vitest.config.ts`, `packages/server/vitest.config.ts`, `package.json`
- **depends_on**:

---

### PR: Testing plan review gate
- **description**: Final review gate for the automated testing plan. This PR has no implementation of its own — it exists to gather all testing infrastructure PRs into a single dependency so auto-start can orchestrate the full plan. Once all dependencies are merged, this PR can be closed.
- **tests**: None — gate PR only.
- **files**: None
- **depends_on**: Snapshot tests for piece shapes and SRS kick tables, Game test harness (input replay), State transition assertion helpers, E2E multiplayer game flow test, Coverage configuration and CI thresholds
