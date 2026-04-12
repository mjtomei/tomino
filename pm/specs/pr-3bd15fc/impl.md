# Spec: Reference Verification — Guideline Garbage and Scoring

## Overview

Create a reference verification test file (`packages/shared/src/__tests__/reference-guideline.test.ts`) that validates our Guideline scoring and garbage implementations against the published Tetris Guideline specification (as documented on TetrisWiki's Garbage and Scoring pages).

This is distinct from the existing unit tests in `engine/scoring.test.ts` and `engine/garbage.test.ts` — those test the implementation's internal behavior. This file is organized around the **reference specification** and makes it trivially auditable whether our values match the standard.

## Requirements

### R1: Garbage Line Values (Reference: TetrisWiki Garbage)

Verify `calculateGarbage()` from `packages/shared/src/engine/garbage.ts` and the lookup tables in `packages/shared/src/engine/garbage-table.ts` against the standard Guideline garbage table:

| Action | Expected Garbage |
|---|---|
| Single | 0 |
| Double | 1 |
| Triple | 2 |
| Tetris | 4 |
| T-Spin Single (full) | 2 |
| T-Spin Double (full) | 4 |
| T-Spin Triple (full) | 6 |
| T-Spin Mini Single | 0 (uses normal table) |
| T-Spin Mini Double | 1 (uses normal table) |
| T-Spin with 0 lines | 0 |
| No lines cleared | 0 |

### R2: Combo Garbage Table (Reference: TetrisWiki Garbage)

Verify `comboGarbage()` from `garbage-table.ts` against the standard combo table:

| Combo Count | Garbage Bonus |
|---|---|
| 0 (first clear) | 0 |
| 1 | 1 |
| 2 | 1 |
| 3 | 2 |
| 4 | 2 |
| 5 | 3 |
| 6 | 3 |
| 7+ | 4 (capped) |

### R3: Back-to-Back Garbage Bonus (Reference: TetrisWiki Garbage)

Verify that `calculateGarbage()` adds +1 garbage when `b2b > 0`. B2B applies to "difficult" clears: Tetris or any T-spin with lines cleared.

### R4: Scoring Point Values (Reference: TetrisWiki Scoring)

Verify `GuidelineScoring.onLineClear()` from `packages/shared/src/engine/scoring-guideline.ts` against the standard point tables:

**Line Clear Points** (base × level):

| Action | Base Points |
|---|---|
| Single | 100 |
| Double | 300 |
| Triple | 500 |
| Tetris | 800 |

**T-Spin Points** (base × level):

| Action | Base Points |
|---|---|
| T-Spin Mini no-clear | 100 |
| T-Spin Mini Single | 200 |
| T-Spin Mini Double | 400 |
| T-Spin Full no-clear | 400 |
| T-Spin Full Single | 800 |
| T-Spin Full Double | 1200 |
| T-Spin Full Triple | 1600 |

**Perfect Clear Bonus** (added on top of line clear points, × level):

| Action | Bonus Points |
|---|---|
| PC Single | 800 |
| PC Double | 1200 |
| PC Triple | 1800 |
| PC Tetris | 2000 |

### R5: Back-to-Back Scoring Bonus (Reference: TetrisWiki Scoring)

Verify that consecutive "difficult" clears (Tetris or any T-spin with lines) apply a 1.5× multiplier to base points (floored). The `isDifficultClear()` helper in `scoring-guideline.ts:56-62` defines the criteria.

- First difficult clear: b2b increments to 0, no multiplier
- Subsequent difficult clears: b2b > 0, apply `floor(points * 1.5)`
- Non-difficult clear resets b2b to -1

### R6: Combo Scoring Bonus (Reference: TetrisWiki Scoring)

Verify that consecutive line clears award `50 × combo × level` bonus points.

- First clear: combo → 0, no bonus
- Subsequent consecutive clears: combo increments, bonus applies
- Non-clear placement resets combo to -1

### R7: Drop Scoring (Reference: TetrisWiki Scoring)

Verify soft drop (1 point/cell, no level scaling) and hard drop (2 points/cell, no level scaling).

### R8: Level Progression (Reference: TetrisWiki Scoring)

Verify every 10 lines = 1 level up from start level.

## Implicit Requirements

### IR1: Table-driven test structure
Tests should use `it.each()` or equivalent table-driven patterns for the lookup tables (garbage values, scoring points, combo table). This makes it trivially auditable: the test data IS the reference table.

### IR2: Reference annotation
Each `describe` block should include a comment citing the specific TetrisWiki reference (Garbage or Scoring page) and the section being verified.

### IR3: Independence from implementation internals
Tests should call the public API (`calculateGarbage`, `GuidelineScoring.onLineClear`, `baseGarbage`, `comboGarbage`) rather than reaching into private constants. The point is to verify the behavior matches the spec, not that the constants are correct.

### IR4: Multi-level verification for scoring
Since scoring is multiplied by level, at least one test per category should verify at a level > 1 to confirm the multiplier is applied correctly.

### IR5: Combined bonus scenarios
Include at least one scenario that combines multiple bonuses (e.g., B2B T-spin double with combo + perfect clear) to verify they stack correctly per the guideline.

## Ambiguities

### A1: Perfect clear garbage — **[RESOLVED]**
The TetrisWiki Garbage page lists perfect clear as sending 10 garbage lines. Our `calculateGarbage()` has no `isPerfectClear` input — perfect clear garbage is not implemented in the garbage system. **Resolution**: Document this as a known gap in a comment, but don't test for values we don't implement. The test verifies what we DO implement against the spec.

### A2: Mini T-spin B2B treatment — **[RESOLVED]**
In our scoring system, `isDifficultClear()` treats any T-spin with lines (including mini) as "difficult" for B2B. Some Guideline implementations only count full T-spins. **Resolution**: Test our actual implementation behavior — mini T-spins with lines DO trigger B2B in our system. Note this in a comment as a design decision.

### A3: Test file location — **[RESOLVED]**
The task specifies `packages/shared/src/__tests__/reference-guideline.test.ts`. The existing scoring/garbage tests live in `packages/shared/src/engine/`. **Resolution**: Use the specified path. The `__tests__/` directory is for cross-cutting verification tests, while `engine/` tests are unit tests of individual modules.

## Edge Cases

### E1: Combo garbage cap at high values
Combo values well beyond 7 (e.g., 20, 100) should still return 4. Test the cap boundary.

### E2: B2B with T-spin no-clear
T-spin with 0 lines cleared does NOT affect the B2B counter (doesn't break or advance it). Verify this for both scoring and garbage inputs.

### E3: Floor rounding on B2B 1.5× multiplier
The 1.5× multiplier uses `Math.floor()`. Test with odd base points where rounding matters (e.g., T-spin single 800 × 1.5 = 1200 exact, but combo 50 × combo is added separately).

### E4: Level 1 as minimum
Guideline scoring starts at level 1 (not 0). All point values are multiplied by level, so level 1 yields base × 1. Verify this baseline.
