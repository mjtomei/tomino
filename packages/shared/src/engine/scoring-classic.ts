/**
 * Classic scoring — classic Nintendo-style line-clear scoring system.
 *
 * Features: line clears × (level + 1), soft drop (1/cell).
 * No T-spins, no combos, no B2B, no hard drop, no perfect clear bonus.
 */

import { classicDropInterval } from "./gravity.js";
import type {
  LineClearCount,
  ScoringState,
  ScoringSystem,
  TSpinType,
} from "./scoring.js";
import { createScoringState } from "./scoring.js";

// ---------------------------------------------------------------------------
// Point table
// ---------------------------------------------------------------------------

/** classic line clear base points. Multiplied by (level + 1). */
const CLASSIC_LINE_POINTS: Record<LineClearCount, number> = {
  0: 0,
  1: 40,
  2: 100,
  3: 300,
  4: 1200,
};

// ---------------------------------------------------------------------------
// Level-up threshold
// ---------------------------------------------------------------------------

/**
 * Calculate the number of lines needed for the first level-up in classic mode.
 * After the first level-up, every 10 additional lines triggers the next.
 *
 * Formula: min(startLevel × 10 + 10, max(100, startLevel × 10 - 50))
 */
function firstLevelUpThreshold(startLevel: number): number {
  return Math.min(startLevel * 10 + 10, Math.max(100, startLevel * 10 - 50));
}

function updateClassicLevel(state: ScoringState): void {
  const threshold = firstLevelUpThreshold(state.startLevel);
  if (state.lines < threshold) {
    state.level = state.startLevel;
  } else {
    const linesAfterFirst = state.lines - threshold;
    state.level = state.startLevel + 1 + Math.floor(linesAfterFirst / 10);
  }
}

// ---------------------------------------------------------------------------
// ClassicScoring
// ---------------------------------------------------------------------------

export const ClassicScoring: ScoringSystem = {
  createState: createScoringState,

  onLineClear(
    state: ScoringState,
    linesCleared: LineClearCount,
    _tSpin: TSpinType,
    _isPerfectClear: boolean,
  ): void {
    // classic ignores T-spins, combos, B2B, and perfect clears
    if (linesCleared === 0) return;

    const base = CLASSIC_LINE_POINTS[linesCleared];
    state.score += base * (state.level + 1);
    state.lines += linesCleared;
    updateClassicLevel(state);
  },

  onSoftDrop(state: ScoringState, cells: number): void {
    state.score += cells;
  },

  onHardDrop(_state: ScoringState, _cells: number): void {
    // classic has no hard drop — no-op
  },

  getDropInterval: classicDropInterval,
};
