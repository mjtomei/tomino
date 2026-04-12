# Implementation Spec: Reference Verification — NES Scoring and Gravity Tables

**PR:** pr-155e552
**File:** `packages/shared/src/__tests__/reference-nes.test.ts` (new)

## 1. Requirements

### R1: NES gravity frame table matches TetrisWiki reference

Verify that the frame-count lookup in `packages/shared/src/engine/gravity.ts` (the `NES_FRAMES` array, exposed via `nesDropInterval()`) matches the authoritative NTSC NES Tetris gravity table:

| Level | Frames | Level | Frames | Level | Frames |
|-------|--------|-------|--------|-------|--------|
| 0     | 48     | 10    | 5      | 20    | 2      |
| 1     | 43     | 11    | 5      | 21    | 2      |
| 2     | 38     | 12    | 5      | 22    | 2      |
| 3     | 33     | 13    | 4      | 23    | 2      |
| 4     | 28     | 14    | 4      | 24    | 2      |
| 5     | 23     | 15    | 4      | 25    | 2      |
| 6     | 18     | 16    | 3      | 26    | 2      |
| 7     | 13     | 17    | 3      | 27    | 2      |
| 8     | 8      | 18    | 3      | 28    | 2      |
| 9     | 6      | 19    | 2      | 29+   | 1      |

**Source function:** `nesDropInterval(level)` in `gravity.ts:66-70`
**Test approach:** Table-driven — hardcode all 30 expected frame values, convert each to milliseconds using `frames / 60.0988 * 1000`, and compare against `nesDropInterval()` output for levels 0–29. Also verify level 29+ clamping.

### R2: NES scoring base points match TetrisWiki reference

Verify that the `NES_LINE_POINTS` table in `packages/shared/src/engine/scoring-nes.ts:22-28` matches the authoritative NES scoring:

| Lines Cleared | Base Points |
|---------------|-------------|
| 0 (no clear)  | 0           |
| 1 (Single)    | 40          |
| 2 (Double)    | 100         |
| 3 (Triple)    | 300         |
| 4 (Tetris)    | 1200        |

**Formula:** `base_points × (level + 1)`

**Source function:** `NESScoring.onLineClear()` in `scoring-nes.ts:61-74`
**Test approach:** Table-driven — for each line clear type at multiple levels, hardcode expected score and compare against `NESScoring.onLineClear()` output.

### R3: NES level progression thresholds match TetrisWiki reference

Verify that `firstLevelUpThreshold()` in `scoring-nes.ts:40-42` produces the correct first-level-up line thresholds:

**Formula:** `min(startLevel × 10 + 10, max(100, startLevel × 10 − 50))`

| Start Level | Threshold | Reasoning |
|-------------|-----------|-----------|
| 0           | 10        | min(10, 100) = 10 |
| 1           | 20        | min(20, 100) = 20 |
| 5           | 60        | min(60, 100) = 60 |
| 9           | 100       | min(100, 100) = 100 |
| 10          | 100       | min(110, 100) = 100 |
| 15          | 100       | min(160, 100) = 100 |
| 16          | 110       | min(170, 110) = 110 |
| 18          | 130       | min(190, 130) = 130 |
| 19          | 140       | min(200, 140) = 140 |

After the first threshold, every 10 additional lines triggers the next level.

**Source function:** `firstLevelUpThreshold()` (private) tested indirectly through `NESScoring.onLineClear()` and its effect on `state.level`
**Test approach:** Table-driven — for each start level, clear lines up to the threshold and verify the level transitions.

### R4: NES soft drop scoring

Verify soft drop awards exactly 1 point per cell dropped, regardless of level.

**Source function:** `NESScoring.onSoftDrop()` in `scoring-nes.ts:76-78`

### R5: NES features correctly absent

Verify that NES scoring ignores T-spins, perfect clears, combos, B2B, and hard drops — these features should have zero effect on score.

**Source function:** `NESScoring.onLineClear()` (ignores tSpin, isPerfectClear params), `NESScoring.onHardDrop()` (no-op)

## 2. Implicit Requirements

### IR1: Frame-to-millisecond conversion uses NTSC frame rate

The conversion `frames / 60.0988 * 1000` uses the NTSC NES frame rate of 60.0988 Hz. The test must use the same constant to compute expected values. Since `NES_FPS` is not exported, we hardcode the expected millisecond values directly (computed from `Math.round(frames / 60.0988 * 1000)`).

### IR2: Level 29+ clamping

`nesDropInterval()` clamps levels ≥ 29 to index 29 (1 frame). The test must verify levels 29, 30, 50, and 99 all return the same interval.

### IR3: Score accumulation across multiple clears with level changes

As lines are cleared, the level advances, changing the `(level + 1)` multiplier. Multi-clear sequences must verify that score accumulates correctly as the level changes mid-game.

### IR4: Test file location and imports

The new test file lives in `packages/shared/src/__tests__/reference-nes.test.ts`, following the pattern established by `example.test.ts` and other files in that directory. Imports use relative paths with `.js` extensions per the project's ESM convention.

## 3. Ambiguities

### A1: Rounding in millisecond conversion — **[RESOLVED]**

The `nesDropInterval()` function uses `Math.round()` for frame-to-ms conversion. Our reference test will hardcode the expected rounded millisecond values directly (e.g., level 0: `Math.round(48 / 60.0988 * 1000) = 799`). This avoids depending on the internal `NES_FPS` constant while still verifying the frame table is correct.

### A2: Scope overlap with existing `scoring.test.ts` — **[RESOLVED]**

The existing `scoring.test.ts` already tests basic NES scoring behaviors. This new file has a different purpose: it is a *reference verification* test that hardcodes authoritative external data as a snapshot. The existing tests verify behavior ("does scoring work correctly?"); the new tests verify fidelity ("do our constants match the NES reference?"). There will be some overlap in what's tested, but the intent and structure are distinct. The new test uses table-driven iteration over the complete data set rather than individual assertions.

### A3: Which levels to test for scoring — **[RESOLVED]**

We test scoring at a representative set of levels that cover the range: 0, 1, 5, 9, 15, 19, 29. This covers the start, middle, and key transition points of the NES level system without being exhaustive (since the formula is `base × (level + 1)`, which is trivially correct once verified at a few points).

## 4. Edge Cases

### E1: Start level > 29 (beyond gravity table)

Starting at level 30+ should clamp gravity to 1 frame (the level 29+ value). The scoring multiplier `(level + 1)` should still work correctly at these levels even though they're beyond the gravity table.

### E2: Level progression threshold crossover at start level 16

Start level 16 is where `startLevel × 10 − 50 = 110 > 100`, so the threshold formula starts using `startLevel × 10 − 50` instead of `100`. This is a boundary worth testing explicitly.

### E3: Tetris at level 0 — maximum single-clear score check

A Tetris at level 0 should award exactly 1200 points (1200 × 1). This is the minimum Tetris score and verifies the base point is correct.

### E4: Lines from a single clear exceeding the first threshold

If a player starts at level 0 and clears a Tetris (4 lines) repeatedly, they cross the 10-line threshold mid-sequence. The level should update after each clear call, and subsequent clears should use the new level's multiplier.
