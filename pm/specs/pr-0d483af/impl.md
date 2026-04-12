# Implementation Spec: TetrisEngine — Game Loop and State Machine

## Files
- `packages/shared/src/engine/engine.ts` — TetrisEngine class
- `packages/shared/src/engine/engine.test.ts` — Unit tests
- `packages/shared/src/index.ts` — Re-export TetrisEngine and related types

## Requirements

### R1: Engine Initialization
TetrisEngine constructor takes a `RuleSet` (from `engine/types.ts`) and a `GameModeConfig` (from `engine/types.ts`), plus an optional seed for deterministic RNG.

Instantiates:
- **RotationSystem**: `SRSRotation` or `NRSRotation` based on `ruleSet.rotationSystem` (from `rotation-srs.ts`, `rotation-nrs.ts`)
- **Randomizer**: via `createRandomizer(ruleSet.randomizer, ruleSet.previewCount, rng)` (from `randomizer.ts`)
- **ScoringSystem**: `GuidelineScoring` or `NESScoring` based on `ruleSet.scoringSystem` (from `scoring-guideline.ts`, `scoring-nes.ts`)
- **Board**: via `createGrid()` (from `board.ts`) — 10×40 grid
- **HoldState**: via `createHoldState()` (from `hold.ts`)
- **ScoringState**: via `scoringSystem.createState(startLevel)` — startLevel defaults to 1

### R2: Game State Machine
Four states: `"idle"` | `"playing"` | `"paused"` | `"gameOver"`

Transitions:
- `idle → playing`: via `start()` — spawns first piece, begins gravity ticks
- `playing → paused`: via `pause()`
- `paused → playing`: via `resume()` — resumes gravity from where it left off
- `playing → gameOver`: automatic on end conditions (top-out, goal reached)
- `idle` is the initial state after construction

Invalid transitions are no-ops (or throw — resolved below in ambiguities).

### R3: Gravity Ticks
The engine uses a tick-based architecture. A `tick(deltaMs: number)` method advances the game clock.

- Gravity interval comes from `scoringSystem.getDropInterval(scoringState.level)`
- Accumulate elapsed time; when accumulated >= interval, move piece down one row
- If piece cannot move down, begin lock phase (R4)
- When `gameModeConfig.gravity === false` (Zen mode), gravity does not apply — piece stays where placed until player acts

### R4: Lock Delay
Driven by `ruleSet.lockDelay`:
- **lockDelay === 0** (Classic): Piece locks instantly when it lands (cannot move down). On the same tick that gravity fails to move down, the piece is placed.
- **lockDelay > 0** (Modern): A timer starts when the piece first touches the ground. The piece locks after `lockDelay` ms unless the player moves/rotates it, which resets the timer (up to `ruleSet.lockResets` times). After max resets exhausted, piece locks on next ground contact.

### R5: Player Actions
The engine exposes action methods that mutate state:
- `moveLeft()` / `moveRight()` — uses `tryMove(grid, shape, row, col, dx, 0)` from `movement.ts`
- `softDrop()` — moves piece down one row; awards points via `scoringSystem.onSoftDrop(state, 1)`
- `hardDrop()` — uses `hardDrop()` from `movement.ts` to find landing row, awards points via `scoringSystem.onHardDrop(state, cellsDropped)`, locks piece immediately. Only available when `ruleSet.hardDropEnabled === true`.
- `rotateCW()` / `rotateCCW()` — uses `tryRotate()` from `movement.ts` with the active rotation system
- `hold()` — uses `holdPiece()` from `hold.ts`. Only functional when `ruleSet.holdEnabled === true`.

Move/rotate actions during lock delay reset the lock timer (if resets remain).

### R6: Piece Lifecycle
1. **Spawn**: New piece appears at spawn position (row ~18 for buffer zone, col centered). Piece type comes from `randomizer.next()`. If the piece collides at spawn → top-out.
2. **Falling**: Gravity moves piece down. Player can move/rotate/soft drop/hard drop.
3. **Lock**: Piece is placed on grid via `placePiece()`. Then:
   a. Detect T-spin if piece is T and last action was rotation — `detectTSpin()` from `scoring.ts`
   b. Clear lines via `clearLines()` from `board.ts`
   c. Check perfect clear (all cells empty after clear)
   d. Update scoring via `scoringSystem.onLineClear()`
   e. Reset hold flag via `resetHoldFlag()`
   f. Check end conditions (R7)
   g. Spawn next piece

### R7: Game Mode End Conditions
- **Marathon** (`topOutEndsGame: true`, `goal: "none"`): Ends only on top-out
- **Sprint** (`goal: "lines"`, `goalValue: 40`): Ends when `scoringState.lines >= 40`. Records elapsed time.
- **Ultra** (`goal: "time"`, `goalValue: 180000`): Ends when elapsed time >= 180000ms. Records final score.
- **Zen** (`topOutEndsGame: false`, `gravity: false`): Never ends automatically. No gravity. Top-out does not end game. Manual quit only via a `quit()` method.

### R8: Ghost Piece
When `ruleSet.ghostEnabled === true`, the state snapshot includes the ghost row — computed via `hardDrop()` from `movement.ts` (landing row for current piece at current column).

When `ghostEnabled === false`, ghost position is not included in state snapshot (null/undefined).

### R9: State Snapshot
The engine emits a complete state snapshot (returned from `tick()` or accessible via a `getState()` method) containing all data a renderer needs:

```typescript
interface GameState {
  status: "idle" | "playing" | "paused" | "gameOver";
  board: Grid;                    // 10×40 grid
  currentPiece: {                 // null when idle/gameOver
    type: PieceType;
    row: number;
    col: number;
    rotation: Rotation;
    shape: PieceShape;
  } | null;
  ghostRow: number | null;        // null if ghost disabled or no current piece
  hold: PieceType | null;         // held piece
  holdUsed: boolean;              // whether hold was used this drop
  queue: readonly PieceType[];    // next pieces preview
  scoring: ScoringState;          // score, level, lines, combo, b2b
  elapsedMs: number;              // total play time
  gameMode: GameMode;
  endReason?: "topOut" | "goalReached" | "quit";
}
```

### R10: Determinism
Given the same RuleSet, GameModeConfig, seed, and sequence of inputs, the engine must produce identical output. This is critical for client-server multiplayer agreement. Achieved by:
- Injecting seeded RNG into randomizer via `seededRng(seed)` from `randomizer.ts`
- Pure function usage for movement/rotation/scoring
- No dependency on `Date.now()` or `Math.random()` — time comes from `tick(deltaMs)`

## Implicit Requirements

### I1: Spawn Position
Guideline standard: pieces spawn in rows 18-19 (just above visible area, which starts at row 20) centered horizontally. For a 3-wide piece in a 10-wide board: col = 3. For the 4-wide I piece: col = 3. For the 2-wide O piece: col = 4. Spawn at rotation 0.

### I2: Top-Out Detection
A piece that collides at spawn position means top-out. This happens when cells in the spawn area are already occupied.

### I3: Lock Delay Reset on Move
When a piece is in lock delay and the player successfully moves or rotates it (and the piece is no longer on the ground after the move), the lock timer resets. If the piece is still on the ground after moving, the timer still resets (Guideline behavior) but only if resets remain.

### I4: ScoringSystem Factory
No factory exists for scoring systems (unlike randomizer). Engine must select directly: `ruleSet.scoringSystem === "guideline" ? GuidelineScoring : NESScoring`.

### I5: Rotation System Selection
Similarly: `ruleSet.rotationSystem === "srs" ? SRSRotation : NRSRotation`.

### I6: Perfect Clear Detection
After clearing lines, check if `grid.every(row => row.every(cell => cell === null))`. The visible area (rows 20-39) being empty is the correct check since buffer rows are always empty.

### I7: Hold Mechanic Details
When hold returns `newCurrent === null`, the engine must pull the next piece from the randomizer. The held piece's rotation resets to 0 when swapped out.

### I8: Soft Drop with Gravity Off
In Zen mode (gravity off), soft drop should still work — it moves the piece down manually. This gives the player control even without automatic gravity.

## Ambiguities

### A1: `tick()` Return Value vs `getState()`
**Resolution**: Provide both. `tick(deltaMs)` returns `GameState`. `getState()` returns the current snapshot without advancing time. This supports both game-loop-driven rendering and on-demand state queries.

### A2: Start Level Configuration
**Resolution**: Default start level is 1. Allow an optional `startLevel` parameter on `start()` or in the constructor options. Sprint/Ultra typically start at level 1; Marathon can start at higher levels.

### A3: What Happens on Invalid Actions
**Resolution**: Invalid actions (e.g., hard drop when not enabled, hold when not enabled, any action when not in "playing" state) are silently ignored (no-op). This matches typical game engine behavior — the UI shouldn't need to guard every action.

### A4: Sprint Goal — Lines from Scoring vs Direct Count
**Resolution**: Use `scoringState.lines` since the scoring system already tracks line count and handles level-ups. This avoids duplicate state.

### A5: Zen Mode Quit
**Resolution**: Add a `quit()` method that transitions `playing → gameOver` with `endReason: "quit"`. Works in any mode but is the only way to end Zen.

### A6: DAS/ARR Handling
**Resolution**: DAS/ARR is input-layer concern, not engine concern. The engine exposes discrete `moveLeft()`/`moveRight()` actions. The client applies DAS/ARR timing and calls these methods at the appropriate rate. The `ruleSet.das`/`arr`/`sdf` values are stored in the RuleSet for the client to read but the engine doesn't implement auto-repeat internally.

### A7: Elapsed Time During Pause
**Resolution**: `tick()` is a no-op when paused or game over. Elapsed time only accumulates while `status === "playing"`. The caller simply stops calling tick, or tick ignores deltaMs when not playing.

## Edge Cases

### E1: Spawn Collision After Line Clear
After clearing lines, the board shifts down. The next piece spawn should succeed unless the board is still full above the visible area. This is standard — clearing lines creates space.

### E2: Hold at Spawn
Holding immediately after spawn (before any movement) should work. The current piece goes to hold, the held piece (or next from randomizer) spawns at the standard spawn position.

### E3: Lock Delay at Board Bottom
A piece at row 39 (bottom) with lock delay should start the lock timer. If the player moves it horizontally and it's still at the bottom, the timer resets (if resets remain).

### E4: Gravity Interval Changes Mid-Drop
When a line clear causes a level-up, the gravity interval changes. The next gravity tick uses the new interval. No need to adjust the current accumulated time — just compare against the new interval on the next tick.

### E5: Multiple Line Clears Reaching Sprint Goal
If a player clears 4 lines and goes from 38 to 42 total lines in Sprint mode, the game ends immediately — no need for exactly 40.

### E6: Ultra Timer Precision
The timer is driven by `tick(deltaMs)`. If accumulated time passes 180000ms during a tick, the game ends at that tick. The final elapsed time may slightly exceed 180000ms — that's fine for fairness since it depends on tick granularity.

### E7: Zen Mode Top-Out Behavior
In Zen mode with `topOutEndsGame: false`, pieces that collide at spawn just... don't spawn? **Resolution**: In Zen mode, if spawn collides, the game continues but the player must clear space (perhaps by clearing lines). We still attempt spawn — if it fails, we could push the piece up or simply not spawn until space is available. Since Zen has no gravity, this is an unusual edge case. **Resolution**: Treat it as a no-op — don't spawn, don't end game. Player must somehow clear lines. In practice this shouldn't happen in Zen since there's no pressure.
