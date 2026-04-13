/**
 * ScoringSystem interface and shared types for line-clear scoring.
 *
 * Two implementations: GuidelineScoring (modern) and ClassicScoring (classic).
 * The game engine calls methods on this interface after piece events.
 */

import type { Grid } from "./board.js";
import type { Rotation } from "./pieces.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How many lines were cleared in a single placement. */
export type LineClearCount = 0 | 1 | 2 | 3 | 4;

/** T-spin classification. */
export type TSpinType = "none" | "mini" | "full";

/** Mutable scoring state tracked across a game. Plain data — serializable. */
export interface ScoringState {
  score: number;
  level: number;
  lines: number;
  /** Combo counter. -1 = no active combo. Increments on each consecutive clear. */
  combo: number;
  /** Back-to-back counter. -1 = no active B2B. */
  b2b: number;
  /** Starting level (needed for classic level-up threshold). */
  startLevel: number;
  /** Total pieces locked onto the board. */
  piecesPlaced: number;
}

/** Interface that both scoring systems implement. */
export interface ScoringSystem {
  /** Create initial scoring state for a game starting at the given level. */
  createState(startLevel: number): ScoringState;

  /**
   * Called after a piece locks and lines are evaluated.
   * Mutates state with points from line clears, T-spins, combos, B2B, and perfect clears.
   *
   * @param linesCleared - Number of lines cleared (0 if none).
   * @param tSpin - T-spin classification for this placement.
   * @param isPerfectClear - Whether the board is completely empty after clearing.
   */
  onLineClear(
    state: ScoringState,
    linesCleared: LineClearCount,
    tSpin: TSpinType,
    isPerfectClear: boolean,
  ): void;

  /** Award points for soft-dropping a piece. */
  onSoftDrop(state: ScoringState, cells: number): void;

  /** Award points for hard-dropping a piece. */
  onHardDrop(state: ScoringState, cells: number): void;

  /** Get the gravity drop interval in milliseconds for the given level. */
  getDropInterval(level: number): number;
}

// ---------------------------------------------------------------------------
// T-spin detection helper (3-corner rule)
// ---------------------------------------------------------------------------

/**
 * The four diagonal corners around the center of a T-piece (in a 3×3 bounding box).
 * Given the piece's top-left position (row, col), the center is at (row+1, col+1).
 * Corners are: (row, col), (row, col+2), (row+2, col), (row+2, col+2).
 */
const T_CORNERS: readonly [dr: number, dc: number][] = [
  [0, 0],
  [0, 2],
  [2, 0],
  [2, 2],
];

/**
 * "Front" corner indices for each rotation state.
 * The front is the direction the T-piece's flat side faces.
 * - Rotation 0 (spawn, flat bottom facing up): front corners are top-left (0) and top-right (1)
 * - Rotation 1 (CW, flat side facing right): front corners are top-right (1) and bottom-right (3)
 * - Rotation 2 (180, flat top facing down): front corners are bottom-left (2) and bottom-right (3)
 * - Rotation 3 (CCW, flat side facing left): front corners are top-left (0) and bottom-left (2)
 */
const FRONT_CORNERS: Record<Rotation, readonly [number, number]> = {
  0: [0, 1],
  1: [1, 3],
  2: [2, 3],
  3: [0, 2],
};

/**
 * Detect T-spin type using the 3-corner rule.
 *
 * Call this only for T-pieces, and only when the last action was a rotation.
 * If the last action was NOT a rotation, this should not be called (return "none").
 *
 * @param grid - The board grid AFTER the piece has been placed.
 * @param row - Row of the T-piece's top-left corner on the grid.
 * @param col - Column of the T-piece's top-left corner on the grid.
 * @param rotation - The T-piece's final rotation state.
 * @param usedKick - Whether a wall kick offset (other than [0,0]) was used.
 * @returns T-spin classification.
 */
export function detectTSpin(
  grid: Grid,
  row: number,
  col: number,
  rotation: Rotation,
  _usedKick: boolean,
): TSpinType {
  // Count occupied corners
  let occupiedCount = 0;
  const cornerOccupied: boolean[] = [];

  for (const [dr, dc] of T_CORNERS) {
    const r = row + dr;
    const c = col + dc;
    // Out-of-bounds counts as occupied (wall/floor)
    const occupied =
      r < 0 ||
      r >= grid.length ||
      c < 0 ||
      c >= grid[0]!.length ||
      grid[r]![c] !== null;
    cornerOccupied.push(occupied);
    if (occupied) occupiedCount++;
  }

  if (occupiedCount < 3) return "none";

  // Check front corners
  const [f1, f2] = FRONT_CORNERS[rotation];
  const frontOccupied =
    (cornerOccupied[f1] ? 1 : 0) + (cornerOccupied[f2] ? 1 : 0);

  if (frontOccupied === 2) {
    return "full";
  }

  // ≥3 corners occupied but <2 front corners → mini T-spin
  return "mini";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createScoringState(startLevel: number): ScoringState {
  return {
    score: 0,
    level: startLevel,
    lines: 0,
    combo: -1,
    b2b: -1,
    startLevel,
    piecesPlaced: 0,
  };
}
