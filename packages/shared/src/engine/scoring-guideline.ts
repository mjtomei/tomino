/**
 * Guideline scoring — modern Tetris scoring system.
 *
 * Features: level-scaled line clears, T-spin bonuses (mini + full),
 * combo counter, back-to-back 1.5× for difficult clears,
 * perfect clear bonuses, soft drop (1/cell), hard drop (2/cell).
 */

import { guidelineDropInterval } from "./gravity.js";
import type {
  LineClearCount,
  ScoringState,
  ScoringSystem,
  TSpinType,
} from "./scoring.js";
import { createScoringState } from "./scoring.js";

// ---------------------------------------------------------------------------
// Point tables
// ---------------------------------------------------------------------------

/** Base points for line clears (no T-spin). */
const LINE_CLEAR_POINTS: Record<LineClearCount, number> = {
  0: 0,
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

/** Base points for T-spin + line clears. Key: `${tSpinType}-${lines}`. */
const TSPIN_POINTS: Record<string, number> = {
  "mini-0": 100,
  "mini-1": 200,
  "mini-2": 400,
  "full-0": 400,
  "full-1": 800,
  "full-2": 1200,
  "full-3": 1600,
};

/** Perfect clear bonus points. */
const PERFECT_CLEAR_POINTS: Record<LineClearCount, number> = {
  0: 0,
  1: 800,
  2: 1200,
  3: 1800,
  4: 2000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Whether a clear is "difficult" for B2B purposes. */
function isDifficultClear(
  linesCleared: LineClearCount,
  tSpin: TSpinType,
): boolean {
  if (linesCleared === 0) return false;
  return linesCleared === 4 || tSpin !== "none";
}

function updateLevel(state: ScoringState): void {
  // Every 10 lines = 1 level up from start level
  const newLevel = state.startLevel + Math.floor(state.lines / 10);
  if (newLevel > state.level) {
    state.level = newLevel;
  }
}

// ---------------------------------------------------------------------------
// GuidelineScoring
// ---------------------------------------------------------------------------

export const GuidelineScoring: ScoringSystem = {
  createState: createScoringState,

  onLineClear(
    state: ScoringState,
    linesCleared: LineClearCount,
    tSpin: TSpinType,
    isPerfectClear: boolean,
  ): void {
    if (linesCleared === 0 && tSpin === "none") {
      // Piece locked without clearing lines and no T-spin — reset combo
      state.combo = -1;
      return;
    }

    // T-spin with 0 lines still awards points but doesn't affect combo or B2B
    if (linesCleared === 0) {
      // T-spin no-clear: award T-spin bonus, no combo/B2B changes
      const base = TSPIN_POINTS[`${tSpin}-0`] ?? 0;
      state.score += base * state.level;
      return;
    }

    // --- Lines were cleared ---

    // 1. Base line clear points (or T-spin line clear points)
    let base: number;
    if (tSpin !== "none") {
      base = TSPIN_POINTS[`${tSpin}-${linesCleared}`] ?? 0;
    } else {
      base = LINE_CLEAR_POINTS[linesCleared];
    }

    let points = base * state.level;

    // 2. Back-to-back bonus
    const difficult = isDifficultClear(linesCleared, tSpin);
    if (difficult) {
      state.b2b++;
      if (state.b2b > 0) {
        // Apply 1.5× — add the extra 0.5× on top
        points = Math.floor(points * 1.5);
      }
    } else {
      state.b2b = -1;
    }

    state.score += points;

    // 3. Combo bonus
    state.combo++;
    if (state.combo > 0) {
      state.score += 50 * state.combo * state.level;
    }

    // 4. Perfect clear bonus
    if (isPerfectClear) {
      state.score += PERFECT_CLEAR_POINTS[linesCleared] * state.level;
    }

    // 5. Update lines and level
    state.lines += linesCleared;
    updateLevel(state);
  },

  onSoftDrop(state: ScoringState, cells: number): void {
    state.score += cells;
  },

  onHardDrop(state: ScoringState, cells: number): void {
    state.score += cells * 2;
  },

  getDropInterval: guidelineDropInterval,
};
