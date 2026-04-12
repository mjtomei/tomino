# Implementation Spec: Game Test Harness (Input Replay)

## 1. Requirements

### R1: `GameTestHarness` class
Create `packages/shared/src/__test-utils__/game-harness.ts` exporting a `GameTestHarness` class.

**Constructor**: `new GameTestHarness({ seed, ruleSet?, startLevel? })`
- `seed: number` — passed to `createRNG()` from `engine/rng.ts` for deterministic piece generation
- `ruleSet?: RuleSet` — defaults to `modernRuleSet()` from `engine/rulesets.ts`
- `startLevel?: number` — defaults to `1`

The harness internally creates:
- An RNG via `createRNG(seed)`
- A `Randomizer` via `createRandomizer(ruleSet.randomizer, ruleSet.previewCount, rng.next)`
- A `ScoringSystem` based on `ruleSet.scoringSystem`
- A `RotationSystem` based on `ruleSet.rotationSystem`
- A game grid via `createGrid()`
- Initial game state (tick 0, empty board, first piece spawned, next queue populated)

### R2: Minimal Engine Interface
Since no `GameEngine` class exists yet, the harness must define a minimal `GameEngine` interface describing what it expects the real engine to provide. The harness then implements this interface internally using the existing pure functions (`tryMove`, `tryRotate`, `hardDrop`, `placePiece`, `clearLines`, `holdPiece`, etc. from `engine/`).

The interface should cover:
```typescript
interface GameEngine {
  /** Current game state snapshot. */
  readonly state: GameStateSnapshot;
  /** Apply a single input action. */
  applyInput(action: InputAction): void;
  /** Advance one tick (for gravity/lock delay). */
  tick(): void;
}
```

### R3: `harness.input(action)` and `harness.inputs([...])`
- `input(action: InputAction)` — applies a single input action to the engine
- `inputs(actions: InputAction[])` — applies actions in order

Uses `InputAction` type from `types.ts`: `"moveLeft" | "moveRight" | "rotateCW" | "rotateCCW" | "rotate180" | "softDrop" | "hardDrop" | "hold"`.

### R4: `harness.state`
Returns the current `GameStateSnapshot` (from `types.ts`). Must reflect the state after all applied inputs.

### R5: `harness.tickUntil(predicate)`
`tickUntil(predicate: (state: GameStateSnapshot) => boolean, maxTicks?: number): void`

Advances ticks (calling `engine.tick()`) until the predicate returns true or maxTicks is reached. This is for advancing past lock delays, gravity drops, etc. without real timers.

### R6: Export from `__test-utils__/index.ts`
Add `GameTestHarness` export to `packages/shared/src/__test-utils__/index.ts`.

### R7: Tests in `game-harness.test.ts`
Required test cases:
1. Harness initializes with correct defaults (modern ruleset, level 1, empty board, active piece spawned)
2. Inputs are applied in order (e.g., moveLeft then moveRight)
3. State is accessible after each input
4. `tickUntil` advances correctly (e.g., advance until piece locks)
5. Deterministic: same seed + inputs = same state

## 2. Implicit Requirements

### IR1: Piece Spawning
The harness must implement piece spawning — placing a new piece at the top of the board from the randomizer queue. Standard spawn position is typically column 3 (center-ish for a 10-wide board), row at the buffer zone boundary. Uses existing `PieceState` type.

### IR2: Gravity and Lock Delay
`tick()` must handle gravity (dropping the piece down) and lock delay (locking the piece after it lands). Uses `guidelineDropInterval`/`nesDropInterval` from `gravity.ts` for timing, and lock delay settings from the `RuleSet`.

### IR3: Line Clearing After Lock
When a piece locks, the engine must call `clearLines()` from `board.ts` and update scoring via the `ScoringSystem`.

### IR4: Game Over Detection
Top-out detection: if a new piece spawns and immediately collides, the game is over.

### IR5: Ghost Piece Calculation
The `GameStateSnapshot` includes `ghostY`. After each input/tick, the harness should calculate the ghost piece position using `hardDrop()` from `movement.ts`.

### IR6: Tick Counting
Each `tick()` call increments the tick counter in the game state.

### IR7: Hold Piece Interaction
When `InputAction` is `"hold"`, the harness must use `holdPiece()` and `resetHoldFlag()` from `hold.ts`.

### IR8: Pending Garbage
The harness should maintain the `pendingGarbage` array in state. For the initial harness, garbage insertion may be a no-op or stub (garbage is typically received from opponents in multiplayer). The harness should at minimum support `addGarbage(batch)` for tests that want to simulate receiving garbage.

## 3. Ambiguities

### A1: Engine Scope — Full vs. Minimal
**Ambiguity**: How much game logic should the harness actually implement? A full engine (gravity timing, DAS/ARR, lock delay timers) vs. a minimal step-based engine.

**Resolution**: Implement a **tick-based engine** where each `tick()` represents one frame/step. Gravity drops happen every N ticks based on the gravity curve. Lock delay counts down in ticks. DAS/ARR are NOT simulated (inputs are applied immediately) since tests care about piece placement outcomes, not input timing. This keeps the harness simple while supporting the `tickUntil` use case for lock delays and gravity.

### A2: Tick Duration
**Ambiguity**: What does one tick represent in time?

**Resolution**: One tick = one frame. Use a fixed frame rate (e.g., 60fps → ~16.67ms per tick). The gravity curve functions return milliseconds, so convert to ticks: `gravityTicks = Math.ceil(dropInterval / frameDuration)`.

### A3: `rotate180` Action
**Ambiguity**: The `tryRotate` in `movement.ts` only supports `"cw"` and `"ccw"` directions. `InputAction` includes `"rotate180"`.

**Resolution**: Implement 180° rotation as two consecutive CW rotations. If the first rotation fails, the 180° fails entirely.

### A4: Soft Drop Behavior
**Ambiguity**: Should `softDrop` as an input action drop by one cell or set a soft-drop mode?

**Resolution**: As an input action (not tick-based), `softDrop` moves the piece down by one cell immediately. This is simpler for testing and avoids needing to track soft-drop state.

### A5: `addGarbage` Method
**Ambiguity**: The task description mentions "garbage insert" in state transitions but doesn't explicitly list an `addGarbage` API on the harness.

**Resolution**: Add `harness.addGarbage(batches: GarbageBatch[])` that queues garbage to `pendingGarbage`. Garbage is inserted after the next piece lock, consistent with standard Tetris behavior.

## 4. Edge Cases

### E1: Game Over During Input
If the game is already over, `input()` and `inputs()` should be no-ops.

### E2: `tickUntil` With Unreachable Predicate
If the predicate never becomes true, `tickUntil` must not loop forever. The `maxTicks` parameter (with a sensible default like 10000) prevents this.

### E3: Hold When Disabled
If `ruleSet.holdEnabled` is false, the `hold` input should be a no-op (handled by `holdPiece()` from `hold.ts`).

### E4: Hard Drop at Bottom
Hard drop when the piece is already at the lowest valid position should lock immediately (0-cell drop).

### E5: Spawn Blockout
If a newly spawned piece immediately collides (board is topped out), set `isGameOver = true` before any further inputs.

### E6: Lock Delay Reset
Per the `RuleSet.lockResets` field, successful moves/rotations while grounded should reset the lock delay counter, up to the max reset count.
