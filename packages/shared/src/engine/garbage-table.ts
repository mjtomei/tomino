/**
 * Garbage lookup tables for the Guideline garbage system.
 *
 * - Line-clear → base garbage mapping
 * - T-spin → base garbage mapping
 * - Combo counter → bonus garbage mapping
 */

import type { LineClearCount, TSpinType } from "./scoring.js";

// ---------------------------------------------------------------------------
// Base garbage for normal line clears (no T-spin)
// ---------------------------------------------------------------------------

/** Lines cleared → garbage lines sent (no T-spin). */
export const LINE_CLEAR_GARBAGE: Record<LineClearCount, number> = {
  0: 0,
  1: 0,
  2: 1,
  3: 2,
  4: 4,
};

// ---------------------------------------------------------------------------
// Base garbage for T-spin line clears
// ---------------------------------------------------------------------------

/**
 * Full T-spin garbage. Key: lines cleared.
 * T-spin with 0 lines sends 0 garbage.
 */
export const TSPIN_GARBAGE: Record<LineClearCount, number> = {
  0: 0,
  1: 2,
  2: 4,
  3: 6,
  4: 0, // impossible but type-safe
};

// ---------------------------------------------------------------------------
// Combo garbage table
// ---------------------------------------------------------------------------

/**
 * Standard Guideline combo garbage table.
 * Index = combo counter value (0 = first clear in streak, 1+ = subsequent).
 * Values beyond the table length use the last entry.
 */
const COMBO_GARBAGE_TABLE: readonly number[] = [
  0, // combo 0: first clear in streak, no bonus
  1, // combo 1
  1, // combo 2
  2, // combo 3
  2, // combo 4
  3, // combo 5
  3, // combo 6
  4, // combo 7+
];

/**
 * Look up combo garbage for a given combo counter value.
 *
 * @param combo - The combo counter. -1 = inactive (returns 0).
 *                0 = first clear (returns 0). 1+ = subsequent clears.
 */
export function comboGarbage(combo: number): number {
  if (combo <= 0) return 0;
  const index = Math.min(combo, COMBO_GARBAGE_TABLE.length - 1);
  return COMBO_GARBAGE_TABLE[index]!;
}

/**
 * Look up base garbage for a line clear, factoring in T-spin type.
 *
 * Only full T-spins get the T-spin garbage table.
 * Mini T-spins use the normal line-clear table (effectively 0 bonus).
 */
export function baseGarbage(
  linesCleared: LineClearCount,
  tSpin: TSpinType,
): number {
  if (tSpin === "full") {
    return TSPIN_GARBAGE[linesCleared];
  }
  return LINE_CLEAR_GARBAGE[linesCleared];
}
