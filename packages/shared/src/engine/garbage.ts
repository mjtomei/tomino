/**
 * Garbage mechanics engine.
 *
 * Two responsibilities:
 * 1. Calculate how many garbage lines a placement sends (based on line clears,
 *    T-spins, combo, and back-to-back).
 * 2. Insert garbage rows into a board grid.
 */

import { BOARD_WIDTH, type Grid } from "./board.js";
import { baseGarbage, comboGarbage } from "./garbage-table.js";
import { GARBAGE_CELL_TYPE, type GarbageCalcInput, type GarbageCalcResult } from "./garbage-types.js";
import type { GarbageBatch } from "../types.js";

// ---------------------------------------------------------------------------
// Garbage sent calculation
// ---------------------------------------------------------------------------

/**
 * Calculate how many garbage lines to send for a single piece placement.
 *
 * @param input - Line clear count, T-spin type, combo counter, and B2B counter,
 *                all taken from the scoring state AFTER `onLineClear` has been called.
 * @returns Breakdown of garbage sent (total, base, combo, b2b).
 */
export function calculateGarbage(input: GarbageCalcInput): GarbageCalcResult {
  const { linesCleared, tSpin, combo, b2b } = input;

  // No lines cleared → no garbage sent (even for T-spin with 0 lines)
  if (linesCleared === 0) {
    return { total: 0, base: 0, combo: 0, b2b: 0 };
  }

  const base = baseGarbage(linesCleared, tSpin);
  const comboBonus = comboGarbage(combo);

  // B2B bonus: +1 if this is at least the second consecutive difficult clear
  const b2bBonus = b2b > 0 ? 1 : 0;

  const total = base + comboBonus + b2bBonus;

  return { total, base, combo: comboBonus, b2b: b2bBonus };
}

// ---------------------------------------------------------------------------
// Garbage row insertion
// ---------------------------------------------------------------------------

/**
 * Create a single garbage row with one gap.
 *
 * @param gapColumn - Column index (0-based) of the gap.
 */
function createGarbageRow(gapColumn: number): (typeof GARBAGE_CELL_TYPE | null)[] {
  const row = Array.from({ length: BOARD_WIDTH }, () => GARBAGE_CELL_TYPE as typeof GARBAGE_CELL_TYPE | null);
  row[gapColumn] = null;
  return row;
}

/**
 * Insert garbage rows at the bottom of the board.
 *
 * Pushes existing rows up and discards any that overflow above row 0.
 * Mutates the grid in place. Maintains the grid's row count.
 *
 * @param grid - The board grid (mutated in place).
 * @param batch - The garbage batch to insert (lines count + gap column).
 */
export function insertGarbage(grid: Grid, batch: GarbageBatch): void {
  const { gapColumn } = batch;
  // Clamp to grid height to maintain the row-count invariant
  const lines = Math.min(batch.lines, grid.length);
  if (lines <= 0) return;

  // Build garbage rows
  const garbageRows = Array.from({ length: lines }, () =>
    createGarbageRow(gapColumn),
  );

  // Remove rows from the top (they overflow and are lost)
  grid.splice(0, lines);

  // Append garbage rows at the bottom
  grid.push(...garbageRows);
}

/**
 * Insert multiple garbage batches sequentially.
 *
 * @param grid - The board grid (mutated in place).
 * @param batches - Array of garbage batches to insert in order.
 */
export function insertGarbageBatches(grid: Grid, batches: readonly GarbageBatch[]): void {
  for (const batch of batches) {
    insertGarbage(grid, batch);
  }
}
