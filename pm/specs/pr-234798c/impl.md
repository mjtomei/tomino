# Implementation Spec: Full Integration Test — Single-Player, Multiplayer, and Adaptive Balancing

## Overview

Final integration PR that verifies the three core systems — single-player Tetris, multiplayer with garbage sending, and adaptive skill-based balancing — work together end-to-end. This creates two new test files: one server-side Vitest integration test and one Playwright E2E test.

---

## 1. Requirements

### R1: Single-Player Game Lifecycle (via GameTestHarness)

Verify that a single-player game runs correctly end-to-end using the test harness.

- **Test harness**: `GameTestHarness` from `packages/shared/src/__test-utils__/game-harness.ts`
- **Seeded PRNG**: `createRNG(seed)` from `packages/shared/src/engine/rng.ts` — same seed must produce identical piece sequences
- **State transitions**: spawn → move → lock → line clear → garbage insert → next spawn
- **Assertions**: Use `assertSpawnedPiece`, `assertLinesCleared`, `assertPieceLocked` from `packages/shared/src/__test-utils__/assertions.ts`
- **Board verification**: Use `boardFromAscii` / `assertBoardEquals` from `packages/shared/src/__test-utils__/board-builder.ts`
- **Factories**: Use `makeGameState`, `makePiece`, `makeGarbageBatch` from `packages/shared/src/__test-utils__/factories.ts`

Tests:
1. **Determinism**: Two harness instances with the same seed produce identical piece sequences and game states after the same inputs
2. **Piece lock and line clear cycle**: Hard-drop pieces, verify line clears via `assertLinesCleared`, scoring increments
3. **Garbage insertion during gameplay**: `addGarbage()` inserts rows at the bottom, verified with `assertGarbageInserted`
4. **Game over via top-out**: Rapid hard drops fill the board; `state.isGameOver` becomes true
5. **Hold piece functionality**: Hold swaps current piece, can't hold twice in a row

### R2: Multiplayer with Garbage Exchange (via GameSession)

Verify two-player multiplayer sessions with garbage sending through the server-side `GameSession`.

- **GameSession**: `createGameSession` / `removeGameSession` from `packages/server/src/game-session.ts`
- **PlayerEngine**: wraps `TetrisEngine` per player, accessed via `session.getPlayerEngine(playerId)`
- **GarbageManager / BalancingMiddleware**: manages garbage queuing, delay, and distribution
- **Broadcast spy**: captures `ServerMessage` broadcasts for verification

Tests:
1. **Line clear sends garbage to opponent**: Player A clears 4 lines → garbage queued for Player B. Verify via broadcast messages (`garbageQueued`, `garbageReceived`) and `assertGarbageInserted` on Player B's board.
2. **Garbage cancellation**: Player B clears lines while garbage is pending → pending garbage reduced before insertion
3. **Game end from garbage pressure**: Player A sends enough garbage to top out Player B → `gameOver` and `gameEnd` messages broadcast with correct winner
4. **Independent engines, shared seed**: Both players start with same piece; inputs on one don't affect the other

### R3: Adaptive Skill-Based Balancing (via BalancingMiddleware + PostGame)

Verify the full handicap pipeline: rating lookup → modifier computation → gameplay with modifiers → post-game rating update.

- **Handicap calculator**: `computeModifierMatrix` from `packages/server/src/handicap-calculator.ts`
- **Balancing middleware**: `BalancingMiddleware` from `packages/server/src/balancing-middleware.ts`
- **Rating algorithm**: `updateRatings` from `packages/server/src/rating-algorithm.ts`
- **Post-game handler**: `handlePostGame` from `packages/server/src/post-game-handler.ts`
- **Config**: `getDefaultBalancingConfig` from `packages/server/src/balancing-init.ts`, `GLICKO_CONFIG` from `packages/server/src/rating-config.ts`, `DEFAULT_CURVE_CONFIG` from `packages/server/src/handicap-config.ts`

Tests:
1. **Handicapped garbage flow through GameSession**: Create a session with `handicapModifiers`. Strong player's garbage to weak player is reduced. Weak player's garbage to strong player is unmodified (boost mode).
2. **Post-game rating update after multiplayer**: Game ends → `handlePostGame` updates both player profiles → `ratingUpdate` broadcast with correct before/after values
3. **Full pipeline in a single test**: Compute modifiers from ratings → create session with modifiers → simulate gameplay → game ends → post-game updates ratings → verify rating changes are consistent with the game outcome

### R4: E2E Browser Tests (via Playwright)

Verify the complete user-facing flow in the browser.

- **Helpers**: `createPlayerContext`, `createRoom`, `joinRoom`, `sendKeyboardInput`, `waitForGameState` from `e2e/helpers/`
- **Test IDs**: `game-results`, `results-placement`, `results-table`, `rating-{pid}`, `handicap-summary`, `handicap-indicator`, `view-stats`

Tests:
1. **Full multiplayer game with results and stats**: Two players, one tops out, verify results screen shows placements, player names, results rows for both players, and stats (APM, PPS, lines) are displayed
2. **Handicap indicator visible during handicapped game**: If the server is configured with handicap settings, verify the handicap indicator appears in the game UI

---

## 2. Implicit Requirements

### IR1: Use plan-17af8d3 Testing Infra Exclusively
All tests must use the shared testing infrastructure, not ad-hoc alternatives:
- `GameTestHarness` — not raw `TetrisEngine` construction
- `boardFromAscii` / `assertBoardEquals` — not manual grid comparisons
- `makeGameState` / `makePiece` / `makeGarbageBatch` — not inline object literals for test data
- `assertLinesCleared` / `assertPieceLocked` / `assertGarbageInserted` / `assertSpawnedPiece` — not raw `.toBe()` on state fields
- `createPlayerContext` / `createRoom` / `joinRoom` / `sendKeyboardInput` / `waitForGameState` — not raw Playwright page interactions

### IR2: Deterministic Tests
All server-side tests must be deterministic:
- Use seeded PRNG (fixed seeds) for piece sequences
- Use `vi.useFakeTimers()` for time-dependent logic (countdown, tick loop, garbage delay)
- Use deterministic RNG overrides for `BalancingMiddleware` (`gapRng`, `rounderRng`)
- Set `garbageDelayMs: 0` where immediate garbage application is needed

### IR3: Proper Cleanup
- Call `removeGameSession(roomId)` in `afterEach` for all server-side GameSession tests
- Call `vi.useRealTimers()` in `afterEach`
- Close Playwright browser contexts in `finally` blocks for E2E tests

### IR4: No Duplication of Existing Tests
Existing test files already cover subsystem-level behavior. This PR tests the **integration** across subsystems — the chaining of the systems together, not re-testing individual pieces. For example:
- Don't re-test `computeModifierMatrix` in isolation (covered in `balancing.integration.test.ts`)
- Don't re-test basic GameSession lifecycle (covered in `game-session-gameplay.test.ts`)
- Don't re-test the E2E lobby flow (covered in `multiplayer-lobby.spec.ts`)

### IR5: Test File Locations
- Server-side integration test: `packages/server/src/__tests__/full-integration.test.ts`
- E2E integration test: `e2e/full-integration.spec.ts`

---

## 3. Ambiguities

### A1: Scope of "Single-Player" Testing
**Resolution**: Single-player is tested via `GameTestHarness` (Vitest), not via a browser E2E test. The project doesn't have a single-player E2E test page, and the harness provides deterministic verification of the engine. The harness tests verify the engine end-to-end without timers.

### A2: How to Trigger Line Clears in GameSession Tests
**Resolution**: Two approaches available: (1) Use `session.applyInput()` with specific move sequences to naturally clear lines — fragile, depends on piece sequence. (2) Access the internal `garbageManager` via type assertion to call `onLinesCleared()` directly — used in existing `game-session-garbage.test.ts`. We use approach (2) for tests focused on garbage flow, and approach (1) for tests focused on the full gameplay loop where we know the seed and can predict piece sequences.

### A3: Handicap Indicator in E2E
**Resolution**: The handicap indicator (`data-testid="handicap-indicator"`) requires server-side handicap configuration, which depends on the room being configured with specific settings. The E2E test will focus on the results screen (which is observable after any multiplayer game) rather than requiring handicap configuration. The server-side tests adequately verify handicap behavior.

### A4: Stats Display E2E Verification
**Resolution**: The results screen shows stats (APM, PPS, lines) in the results table. The E2E test will verify that the results table rows contain numeric stat values. The `view-stats` button navigates to a stats page — we verify its presence but don't test the full stats page (that's a separate feature).

---

## 4. Edge Cases

### EC1: Garbage Insertion While Piece is in Landing Zone
When garbage rows are inserted from the bottom while the active piece is near the bottom of the board, the piece should be pushed up. If pushing up would cause collision with the ceiling, this can trigger a top-out. Test this via `GameTestHarness.addGarbage()` with a piece positioned near the board bottom.

### EC2: Line Clear + Garbage Insert Ordering
After a piece locks and clears lines, pending garbage should be inserted before the next piece spawns. The state transition order is: lock → clear → garbage insert → spawn. Test that garbage arrives between the clear and the next spawn.

### EC3: Handicap with Zero Garbage Result
When the handicap multiplier is very low (strong player sending to weak player with heavy handicap), the probabilistic rounding could result in 0 lines of garbage sent. Test that 0-line garbage is handled gracefully (no crash, no phantom garbage batches).

### EC4: Post-Game Rating with Disconnect/Forfeit
When a player disconnects and is forfeited, the game end result should still trigger rating updates. The forfeited player should lose rating. Test via `session.forfeitPlayer()` followed by `handlePostGame()`.

### EC5: Same Rating Players Get Identity Modifiers
When two players have the same rating, `computeModifierMatrix` should produce modifiers at or near 1.0 (identity). Verify that gameplay is unmodified in this case — no garbage reduction or amplification.

---

## 5. Test Plan Summary

### File 1: `packages/server/src/__tests__/full-integration.test.ts`

```
describe("Full integration — single-player, multiplayer, and adaptive balancing")

  describe("single-player lifecycle via GameTestHarness")
    ✓ deterministic piece sequence with seeded PRNG
    ✓ piece lock → line clear → score update cycle
    ✓ garbage insertion shifts board and is verified with assertGarbageInserted
    ✓ game over via top-out after rapid hard drops
    ✓ state transition ordering: lock → clear → garbage → spawn

  describe("multiplayer garbage exchange via GameSession")
    ✓ line clear by player A queues garbage for player B
    ✓ garbage insertion on opponent board verified with assertGarbageInserted
    ✓ garbage pressure leads to game end with correct winner
    ✓ garbage inserted between line clear and next piece spawn

  describe("adaptive balancing end-to-end")
    ✓ handicapped session reduces strong→weak garbage
    ✓ post-game rating update broadcasts correct changes
    ✓ full pipeline: ratings → modifiers → session → gameplay → post-game → updated ratings
    ✓ equal-rated players get identity modifiers (no effect on gameplay)
    ✓ forfeit triggers valid post-game rating update
```

### File 2: `e2e/full-integration.spec.ts`

```
describe("full integration E2E")
    ✓ multiplayer game shows complete results with stats
```
