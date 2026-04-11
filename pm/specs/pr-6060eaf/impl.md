# Implementation Spec: Scoring Systems — Guideline and NES

## Requirements

### 1. ScoringSystem Interface (`src/engine/scoring.ts`)

Define a `ScoringSystem` interface used by both implementations. The engine will call methods on this interface after piece placement/movement events.

**Types needed:**
- `LineClearType`: single, double, triple, tetris
- `TSpinType`: none, mini, full
- `ScoreEvent`: describes what happened (line clear details, drop type, etc.)
- `ScoringState`: mutable state tracked across a game (score, level, lines, combo, b2b)
- `ScoringSystem` interface with methods:
  - `createState(startLevel: number): ScoringState`
  - `onLineClear(state, linesCleared, tSpinType, isPerfectClear): void` — mutates state
  - `onSoftDrop(state, cells): void`
  - `onHardDrop(state, cells): void`
  - `getDropInterval(level): number` — gravity curve lookup

### 2. GuidelineScoring (`src/engine/scoring-guideline.ts`)

Implements `ScoringSystem` with modern Tetris Guideline rules:

- **Line clear base points** (× level):
  - Single: 100, Double: 300, Triple: 500, Tetris: 800
- **T-spin detection** (3-corner rule):
  - Check the 4 diagonal corners of the T-piece center; if ≥3 are occupied → T-spin
  - Mini T-spin: detected via kick offset (if the last move was a rotation and used a non-trivial kick offset — specifically if ≤2 of the "front" corners are occupied)
  - Full T-spin: ≥2 front corners occupied
  - T-spin bonuses (× level): T-spin mini no lines: 100, T-spin mini single: 200, T-spin no lines: 400, T-spin single: 800, T-spin double: 1200, T-spin triple: 1600
- **Combo counter**: +50 × combo × level for consecutive clears. Combo starts at 0, increments on each consecutive clear, resets to -1 (or 0) on non-clear placement.
- **Back-to-back (B2B)**: 1.5× multiplier for consecutive "difficult" clears (Tetris or any T-spin that clears lines). Resets when a non-difficult clear occurs. First difficult clear in a streak does NOT get the bonus.
- **Perfect clear bonuses** (entire board empty after clear):
  - PC Single: 800, PC Double: 1200, PC Triple: 1800, PC Tetris: 2000 (all × level)
- **Drop points**: Soft drop: 1 per cell. Hard drop: 2 per cell.
- **Level progression**: Lines cleared advance levels. Every 10 lines = 1 level up.

### 3. NESScoring (`src/engine/scoring-nes.ts`)

Implements `ScoringSystem` with classic NES rules:

- **Line clear points** × (level + 1):
  - Single: 40, Double: 100, Triple: 300, Tetris: 1200
- **Soft drop**: 1 point per cell dropped
- **No T-spins**: T-spin detection always returns "none"
- **No combos**: combo counter is not tracked
- **No B2B**: no back-to-back multiplier
- **No hard drop**: `onHardDrop` is a no-op (NES doesn't have hard drop, but the interface needs the method)
- **No perfect clear bonus**
- **Level progression**: start level + (lines / 10), with the classic threshold: first level-up requires `min(startLevel * 10 + 10, max(100, startLevel * 10 - 50))` lines

### 4. Gravity Curves (`src/engine/gravity.ts`)

Level-to-drop-interval mappings:

- **Guideline curve**: Follows the formula `(0.8 - (level * 0.007))^level * 1000` ms (or a lookup table approximating it). Level 0 ≈ 1000ms, Level 1 ≈ 793ms, ... approaches 0ms at high levels (capped at some minimum like 1ms).
- **NES curve**: Frame-based (NTSC 60.0988fps). Lookup table:
  - L0: 48 frames, L1: 43, L2: 38, L3: 33, L4: 28, L5: 23, L6: 18, L7: 13, L8: 8, L9: 6
  - L10–12: 5, L13–15: 4, L16–18: 3, L19–28: 2, L29+: 1
  - Convert frames to ms: `frames / 60.0988 * 1000`

### 5. Exports (`src/index.ts`)

Export the interface, implementations, gravity functions, and types from the shared package index.

## Implicit Requirements

1. **ScoringState must be serializable**: The state will need to cross the wire for multiplayer (Plan 2). Keep it as plain data — no class instances, no closures.
2. **T-spin detection needs board + piece position context**: The `onLineClear` method needs to know if the last action was a T-spin. The caller (future game engine) is responsible for detecting T-spins and passing the result. The scoring system itself doesn't inspect the board — it receives pre-computed T-spin type.
3. **Combo counter semantics**: Combo increments *before* being used in the formula. First consecutive clear gives combo=0 (no bonus), second gives combo=1 (+50×1×level), etc. Placing without clearing resets combo to -1.
4. **Level starts at the configured start level**: `createState(startLevel)` initializes level to that value; line thresholds are relative to it.
5. **Score is cumulative and monotonically increasing**: No event should decrease the score.
6. **Gravity function should be a standalone export**: Not tied to a ScoringSystem instance, since it may be called independently by the engine tick loop.

## Ambiguities

1. **T-spin mini vs full detection boundary** — The 3-corner rule is standard, but the mini/full distinction has variant implementations. **Resolution**: Use the standard Guideline approach: after confirming ≥3 corners occupied, check the 2 "front" corners (based on the rotation state that was facing before the T rotated). If both front corners are occupied → full T-spin. If only 0–1 front corners are occupied → mini T-spin. Since the scoring system receives pre-computed T-spin type, the detection logic itself can live as a helper function exported from scoring.ts for the engine to call.

2. **B2B definition of "difficult clear"** — **Resolution**: Tetris (4-line clear) or any T-spin that clears ≥1 line. A T-spin with 0 lines is NOT a difficult clear (it doesn't break B2B, but it doesn't start/continue it either). A single/double/triple without T-spin is NOT difficult and breaks B2B.

3. **Perfect clear point values** — Different sources give different values. **Resolution**: Use the commonly cited Guideline values: Single 800, Double 1200, Triple 1800, Tetris 2000 (all × level). These are additive on top of the normal line clear points.

4. **NES level-up threshold formula** — The exact NES formula for the first level-up varies by source. **Resolution**: Use the standard formula: first level-up at `min(startLevel * 10 + 10, max(100, startLevel * 10 - 50))` lines, then every 10 lines after that.

5. **Combo bonus application** — Whether combo bonus is multiplied by level. **Resolution**: Yes, combo bonus = 50 × combo × level (standard Guideline).

## Edge Cases

1. **Level 0**: Both curves must handle level 0. Guideline formula yields 1000ms. NES table yields 48 frames ≈ 799ms.
2. **Very high levels (>29)**: NES caps at 1 frame. Guideline formula approaches 0 — clamp to a minimum of 1ms.
3. **B2B counter starts at -1**: First difficult clear sets it to 0 (no bonus). Second consecutive difficult clear gets 1.5× bonus.
4. **Combo after a non-placement event**: Combo only resets on a piece placement that does NOT clear lines. It does not reset on soft/hard drops.
5. **T-spin with 0 lines**: Awards T-spin bonus points but does NOT count as a "difficult" clear for B2B purposes and does NOT affect combo counter (since no lines were cleared, no placement scoring for combo either — combo is only relevant when lines are cleared).
6. **Perfect clear + T-spin + B2B**: All bonuses stack. PC bonus is added on top of the (possibly B2B-boosted, possibly T-spin-boosted) line clear score.
7. **Start level > 0 for NES**: The level-up threshold adjusts per the formula. Lines required for first level-up can be quite high for high start levels.
8. **Score overflow**: Use standard JS numbers. Max safe integer is 2^53 which is far beyond any realistic Tetris score.
