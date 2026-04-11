/**
 * Types for the garbage mechanics engine.
 */

import type { PieceType } from "./pieces.js";
import type { LineClearCount, TSpinType } from "./scoring.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * PieceType value used to fill garbage cells.
 * The rendering layer should map this to a gray/distinct color.
 */
export const GARBAGE_CELL_TYPE: PieceType = "Z";

// ---------------------------------------------------------------------------
// Garbage calculation result
// ---------------------------------------------------------------------------

/** Breakdown of garbage lines sent from a single placement. */
export interface GarbageCalcResult {
  /** Total garbage lines to send. */
  total: number;
  /** Garbage from the base line-clear / T-spin table. */
  base: number;
  /** Extra garbage from combo. */
  combo: number;
  /** Extra garbage from back-to-back bonus. */
  b2b: number;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Inputs needed to calculate garbage sent for a single placement. */
export interface GarbageCalcInput {
  /** Number of lines cleared (0–4). */
  linesCleared: LineClearCount;
  /** T-spin classification for this placement. */
  tSpin: TSpinType;
  /** Current combo counter (from ScoringState.combo AFTER the scoring update). */
  combo: number;
  /** Current B2B counter (from ScoringState.b2b AFTER the scoring update). */
  b2b: number;
}
