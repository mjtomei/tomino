import { describe, expect, it } from "vitest";

import { BOARD_WIDTH, createGrid, type Grid } from "./board.js";
import { guidelineDropInterval, nesDropInterval } from "./gravity.js";
import { GuidelineScoring } from "./scoring-guideline.js";
import { NESScoring } from "./scoring-nes.js";
import type { LineClearCount, ScoringState, TSpinType } from "./scoring.js";
import { detectTSpin } from "./scoring.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand: create state and apply a line clear event. */
function clearWith(
  scoring: typeof GuidelineScoring,
  state: ScoringState,
  lines: LineClearCount,
  tSpin: TSpinType = "none",
  perfectClear = false,
): void {
  scoring.onLineClear(state, lines, tSpin, perfectClear);
}

// ===========================================================================
// Guideline Scoring
// ===========================================================================

describe("GuidelineScoring", () => {
  // -------------------------------------------------------------------------
  // Line clear base points
  // -------------------------------------------------------------------------

  describe("line clear base points", () => {
    it("awards 100 × level for a single", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 1);
      expect(state.score).toBe(100);
    });

    it("awards 300 × level for a double", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 2);
      expect(state.score).toBe(300);
    });

    it("awards 500 × level for a triple", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 3);
      expect(state.score).toBe(500);
    });

    it("awards 800 × level for a tetris", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 4);
      expect(state.score).toBe(800);
    });

    it("scales points with level", () => {
      const state = GuidelineScoring.createState(5);
      clearWith(GuidelineScoring, state, 1);
      expect(state.score).toBe(500); // 100 × 5
    });

    it("awards 0 points for a placement with no clear and no T-spin", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 0);
      expect(state.score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // T-spin bonuses
  // -------------------------------------------------------------------------

  describe("T-spin bonuses", () => {
    it("awards 400 × level for a T-spin no-clear", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 0, "full");
      expect(state.score).toBe(400);
    });

    it("awards 100 × level for a T-spin mini no-clear", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 0, "mini");
      expect(state.score).toBe(100);
    });

    it("awards 800 × level for a T-spin single", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 1, "full");
      expect(state.score).toBe(800);
    });

    it("awards 1200 × level for a T-spin double", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 2, "full");
      expect(state.score).toBe(1200);
    });

    it("awards 1600 × level for a T-spin triple", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 3, "full");
      expect(state.score).toBe(1600);
    });

    it("awards 200 × level for a T-spin mini single", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 1, "mini");
      expect(state.score).toBe(200);
    });

    it("scales T-spin points with level", () => {
      const state = GuidelineScoring.createState(3);
      clearWith(GuidelineScoring, state, 2, "full");
      expect(state.score).toBe(3600); // 1200 × 3
    });
  });

  // -------------------------------------------------------------------------
  // T-spin detection (3-corner rule)
  // -------------------------------------------------------------------------

  describe("detectTSpin", () => {
    /** Create a grid with specific corners filled around a T-piece center. */
    function setupTSpinGrid(
      corners: [boolean, boolean, boolean, boolean],
    ): Grid {
      const grid = createGrid();
      // T-piece placed at row 37, col 4 — center is (38, 5)
      // Corners: (37,4), (37,6), (39,4), (39,6)
      if (corners[0]) grid[37]![4] = "I";
      if (corners[1]) grid[37]![6] = "I";
      if (corners[2]) grid[39]![4] = "I";
      if (corners[3]) grid[39]![6] = "I";
      return grid;
    }

    it("returns 'none' when fewer than 3 corners are occupied", () => {
      const grid = setupTSpinGrid([true, true, false, false]);
      expect(detectTSpin(grid, 37, 4, 0, false)).toBe("none");
    });

    it("returns 'full' when 3+ corners occupied and both front corners filled (rotation 0)", () => {
      // Rotation 0: front corners are [0]=top-left(37,4) and [1]=top-right(37,6)
      const grid = setupTSpinGrid([true, true, true, false]);
      expect(detectTSpin(grid, 37, 4, 0, false)).toBe("full");
    });

    it("returns 'mini' when 3+ corners occupied but <2 front corners (rotation 0)", () => {
      // Rotation 0: front corners are top-left and top-right
      // Fill bottom-left, bottom-right, and top-left only (1 front corner)
      const grid = setupTSpinGrid([true, false, true, true]);
      expect(detectTSpin(grid, 37, 4, 0, false)).toBe("mini");
    });

    it("returns 'full' for rotation 2 with both front (bottom) corners occupied", () => {
      // Rotation 2: front corners are [2]=bottom-left(39,4) and [3]=bottom-right(39,6)
      const grid = setupTSpinGrid([true, false, true, true]);
      expect(detectTSpin(grid, 37, 4, 2, false)).toBe("full");
    });

    it("treats out-of-bounds cells as occupied (wall/floor)", () => {
      const grid = createGrid();
      // Place T-piece at very bottom-left: row 37, col 0
      // Corners: (37,0), (37,2), (39,0), (39,2)
      // Bottom row (39) corners — if we place at row 38: corners at (38,0),(38,2),(40,0),(40,2)
      // Row 40 is out of bounds — counts as occupied
      grid[38]![0] = "I"; // top-left corner
      grid[38]![2] = "I"; // top-right corner
      // Row 40 is OOB → 2 more corners occupied = 4 total
      expect(detectTSpin(grid, 38, 0, 2, false)).toBe("full");
    });

    it("detects all 4 corners occupied as full T-spin", () => {
      const grid = setupTSpinGrid([true, true, true, true]);
      expect(detectTSpin(grid, 37, 4, 0, false)).toBe("full");
    });
  });

  // -------------------------------------------------------------------------
  // Combo counter
  // -------------------------------------------------------------------------

  describe("combo counter", () => {
    it("starts at -1 (no combo)", () => {
      const state = GuidelineScoring.createState(1);
      expect(state.combo).toBe(-1);
    });

    it("first clear gives combo=0, no bonus", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 1);
      expect(state.combo).toBe(0);
      expect(state.score).toBe(100); // no combo bonus
    });

    it("second consecutive clear gives combo=1, +50 bonus", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 1); // combo → 0
      clearWith(GuidelineScoring, state, 1); // combo → 1
      // 100 + (100 + 50×1×1) = 100 + 150 = 250
      expect(state.score).toBe(250);
      expect(state.combo).toBe(1);
    });

    it("third consecutive clear gives combo=2, +100 bonus", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 1); // 100
      clearWith(GuidelineScoring, state, 1); // 100 + 50
      clearWith(GuidelineScoring, state, 1); // 100 + 100
      // 100 + 150 + 200 = 450
      expect(state.score).toBe(450);
      expect(state.combo).toBe(2);
    });

    it("combo resets on non-clear placement", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 1); // combo → 0
      clearWith(GuidelineScoring, state, 1); // combo → 1
      clearWith(GuidelineScoring, state, 0); // reset combo to -1
      expect(state.combo).toBe(-1);

      clearWith(GuidelineScoring, state, 1); // combo → 0 again, no bonus
      // 100 + 150 + 100 = 350
      expect(state.score).toBe(350);
    });

    it("combo bonus scales with level", () => {
      const state = GuidelineScoring.createState(3);
      clearWith(GuidelineScoring, state, 4); // combo → 0, b2b → 0: 800×3 = 2400
      clearWith(GuidelineScoring, state, 4); // combo → 1, b2b → 1: floor(800×3×1.5) + 50×1×3 = 3600 + 150 = 3750
      // Total: 2400 + 3750 = 6150
      expect(state.score).toBe(6150);
    });
  });

  // -------------------------------------------------------------------------
  // Back-to-back (B2B)
  // -------------------------------------------------------------------------

  describe("back-to-back", () => {
    it("starts at -1", () => {
      const state = GuidelineScoring.createState(1);
      expect(state.b2b).toBe(-1);
    });

    it("first tetris sets b2b=0, no bonus", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 4);
      expect(state.b2b).toBe(0);
      expect(state.score).toBe(800);
    });

    it("second consecutive tetris gets 1.5× bonus", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 4); // 800
      clearWith(GuidelineScoring, state, 4); // 800×1.5 = 1200, combo +50
      // 800 + 1200 + 50 = 2050
      expect(state.score).toBe(2050);
    });

    it("T-spin single is a difficult clear for B2B", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 1, "full"); // 800, b2b → 0
      clearWith(GuidelineScoring, state, 1, "full"); // 800×1.5=1200, combo +50
      // 800 + 1200 + 50 = 2050
      expect(state.score).toBe(2050);
    });

    it("non-difficult clear breaks B2B", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 4); // b2b → 0
      clearWith(GuidelineScoring, state, 1); // non-difficult, b2b → -1
      expect(state.b2b).toBe(-1);
      clearWith(GuidelineScoring, state, 4); // b2b → 0 (restarted, no bonus)
      // 800 + (100 + 50) + (800 + 100) = 1850
      expect(state.score).toBe(1850);
    });

    it("T-spin with 0 lines does not affect B2B", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 4); // b2b → 0
      clearWith(GuidelineScoring, state, 0, "full"); // T-spin no-clear: no B2B change
      expect(state.b2b).toBe(0); // unchanged
      clearWith(GuidelineScoring, state, 4); // b2b → 1, gets bonus
      // 800 + 400 + floor(800×1.5) + 50 = 800 + 400 + 1200 + 50 = 2450
      expect(state.score).toBe(2450);
    });
  });

  // -------------------------------------------------------------------------
  // Perfect clear bonuses
  // -------------------------------------------------------------------------

  describe("perfect clear", () => {
    it("awards 800 × level for PC single", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 1, "none", true);
      expect(state.score).toBe(100 + 800); // line clear + PC bonus
    });

    it("awards 1200 × level for PC double", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 2, "none", true);
      expect(state.score).toBe(300 + 1200);
    });

    it("awards 1800 × level for PC triple", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 3, "none", true);
      expect(state.score).toBe(500 + 1800);
    });

    it("awards 2000 × level for PC tetris", () => {
      const state = GuidelineScoring.createState(1);
      clearWith(GuidelineScoring, state, 4, "none", true);
      expect(state.score).toBe(800 + 2000);
    });

    it("PC bonus scales with level", () => {
      const state = GuidelineScoring.createState(2);
      clearWith(GuidelineScoring, state, 1, "none", true);
      // (100×2) + (800×2) = 200 + 1600 = 1800
      expect(state.score).toBe(1800);
    });

    it("PC stacks with B2B and T-spin", () => {
      const state = GuidelineScoring.createState(1);
      // First: tetris to start B2B
      clearWith(GuidelineScoring, state, 4); // 800, b2b → 0
      // Second: T-spin double perfect clear with B2B
      clearWith(GuidelineScoring, state, 2, "full", true);
      // T-spin double: 1200 × 1.5 (B2B) = 1800
      // combo: +50
      // PC double: +1200
      // Total for second clear: 1800 + 50 + 1200 = 3050
      expect(state.score).toBe(800 + 3050);
    });
  });

  // -------------------------------------------------------------------------
  // Drop points
  // -------------------------------------------------------------------------

  describe("drop points", () => {
    it("awards 1 point per cell for soft drop", () => {
      const state = GuidelineScoring.createState(1);
      GuidelineScoring.onSoftDrop(state, 10);
      expect(state.score).toBe(10);
    });

    it("awards 2 points per cell for hard drop", () => {
      const state = GuidelineScoring.createState(1);
      GuidelineScoring.onHardDrop(state, 10);
      expect(state.score).toBe(20);
    });

    it("drop points are not affected by level", () => {
      const state = GuidelineScoring.createState(5);
      GuidelineScoring.onSoftDrop(state, 10);
      expect(state.score).toBe(10); // not 50
    });
  });

  // -------------------------------------------------------------------------
  // Level progression
  // -------------------------------------------------------------------------

  describe("level progression", () => {
    it("starts at the given start level", () => {
      const state = GuidelineScoring.createState(3);
      expect(state.level).toBe(3);
    });

    it("levels up after 10 lines", () => {
      const state = GuidelineScoring.createState(1);
      // Clear 10 singles (ignore score details)
      for (let i = 0; i < 10; i++) {
        clearWith(GuidelineScoring, state, 1);
      }
      expect(state.lines).toBe(10);
      expect(state.level).toBe(2);
    });

    it("levels up correctly from start level 5", () => {
      const state = GuidelineScoring.createState(5);
      for (let i = 0; i < 10; i++) {
        clearWith(GuidelineScoring, state, 1);
      }
      expect(state.level).toBe(6);
    });

    it("multiple level-ups with tetrises", () => {
      const state = GuidelineScoring.createState(1);
      // 3 tetrises = 12 lines = level 2
      clearWith(GuidelineScoring, state, 4);
      clearWith(GuidelineScoring, state, 4);
      clearWith(GuidelineScoring, state, 4);
      expect(state.lines).toBe(12);
      expect(state.level).toBe(2);
    });
  });
});

// ===========================================================================
// NES Scoring
// ===========================================================================

describe("NESScoring", () => {
  // -------------------------------------------------------------------------
  // Line clear points
  // -------------------------------------------------------------------------

  describe("line clear points", () => {
    it("awards 40 × (level+1) for a single", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 1, "none", false);
      expect(state.score).toBe(40);
    });

    it("awards 100 × (level+1) for a double", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 2, "none", false);
      expect(state.score).toBe(100);
    });

    it("awards 300 × (level+1) for a triple", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 3, "none", false);
      expect(state.score).toBe(300);
    });

    it("awards 1200 × (level+1) for a tetris", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 4, "none", false);
      expect(state.score).toBe(1200);
    });

    it("scales with (level+1)", () => {
      const state = NESScoring.createState(5);
      NESScoring.onLineClear(state, 1, "none", false);
      expect(state.score).toBe(240); // 40 × 6
    });

    it("awards 0 for no lines", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 0, "none", false);
      expect(state.score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // NES ignores T-spins, combos, B2B, perfect clears
  // -------------------------------------------------------------------------

  describe("no T-spin/combo/B2B/perfect clear", () => {
    it("ignores T-spin type", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 1, "full", false);
      expect(state.score).toBe(40); // same as normal single
    });

    it("ignores perfect clear flag", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 1, "none", true);
      expect(state.score).toBe(40); // no PC bonus
    });

    it("does not track combos", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 1, "none", false); // 40
      NESScoring.onLineClear(state, 1, "none", false); // 40
      expect(state.score).toBe(80); // no combo bonus
    });

    it("does not apply B2B", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 4, "none", false); // 1200
      NESScoring.onLineClear(state, 4, "none", false); // 1200 (no 1.5×)
      // But note: lines=8, still level 0 at start level 0 (threshold=10)
      expect(state.score).toBe(2400);
    });
  });

  // -------------------------------------------------------------------------
  // Soft drop points
  // -------------------------------------------------------------------------

  describe("soft drop", () => {
    it("awards 1 point per cell", () => {
      const state = NESScoring.createState(0);
      NESScoring.onSoftDrop(state, 15);
      expect(state.score).toBe(15);
    });
  });

  // -------------------------------------------------------------------------
  // Hard drop (no-op)
  // -------------------------------------------------------------------------

  describe("hard drop", () => {
    it("is a no-op", () => {
      const state = NESScoring.createState(0);
      NESScoring.onHardDrop(state, 20);
      expect(state.score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // NES level progression
  // -------------------------------------------------------------------------

  describe("level progression", () => {
    it("starts at start level", () => {
      const state = NESScoring.createState(0);
      expect(state.level).toBe(0);
    });

    it("first level-up at 10 lines for start level 0", () => {
      const state = NESScoring.createState(0);
      // threshold = min(0*10+10, max(100, 0*10-50)) = min(10, 100) = 10
      for (let i = 0; i < 10; i++) {
        NESScoring.onLineClear(state, 1, "none", false);
      }
      expect(state.lines).toBe(10);
      expect(state.level).toBe(1);
    });

    it("first level-up at 100 lines for start level 9", () => {
      // threshold = min(9*10+10, max(100, 9*10-50)) = min(100, 100) = 100
      const state = NESScoring.createState(9);
      expect(state.level).toBe(9);
      // Clear 99 lines — should still be level 9
      for (let i = 0; i < 24; i++) {
        NESScoring.onLineClear(state, 4, "none", false);
      }
      expect(state.lines).toBe(96);
      expect(state.level).toBe(9);
      NESScoring.onLineClear(state, 4, "none", false);
      expect(state.lines).toBe(100);
      expect(state.level).toBe(10);
    });

    it("first level-up at 100 lines for start level 15", () => {
      // threshold = min(15*10+10, max(100, 15*10-50)) = min(160, 100) = 100
      const state = NESScoring.createState(15);
      for (let i = 0; i < 25; i++) {
        NESScoring.onLineClear(state, 4, "none", false);
      }
      expect(state.lines).toBe(100);
      expect(state.level).toBe(16);
    });

    it("levels up every 10 lines after first threshold", () => {
      const state = NESScoring.createState(0);
      // First 10 lines → level 1
      for (let i = 0; i < 10; i++) {
        NESScoring.onLineClear(state, 1, "none", false);
      }
      expect(state.level).toBe(1);
      // 10 more lines → level 2
      for (let i = 0; i < 10; i++) {
        NESScoring.onLineClear(state, 1, "none", false);
      }
      expect(state.level).toBe(2);
    });
  });
});

// ===========================================================================
// Gravity curves
// ===========================================================================

describe("gravity curves", () => {
  describe("guideline", () => {
    it("returns ~1000ms at level 0", () => {
      expect(guidelineDropInterval(0)).toBe(1000);
    });

    it("returns ~793ms at level 1", () => {
      const interval = guidelineDropInterval(1);
      expect(interval).toBe(793);
    });

    it("decreases with level", () => {
      let prev = guidelineDropInterval(0);
      for (let level = 1; level <= 15; level++) {
        const cur = guidelineDropInterval(level);
        expect(cur).toBeLessThan(prev);
        prev = cur;
      }
    });

    it("clamps to minimum 1ms at very high levels", () => {
      expect(guidelineDropInterval(50)).toBe(1);
    });
  });

  describe("NES", () => {
    it("returns ~799ms at level 0 (48 frames)", () => {
      const interval = nesDropInterval(0);
      expect(interval).toBe(Math.round((48 / 60.0988) * 1000));
    });

    it("returns ~17ms at level 29 (1 frame)", () => {
      const interval = nesDropInterval(29);
      expect(interval).toBe(Math.round((1 / 60.0988) * 1000));
    });

    it("level 29+ all use 1 frame", () => {
      const l29 = nesDropInterval(29);
      expect(nesDropInterval(30)).toBe(l29);
      expect(nesDropInterval(99)).toBe(l29);
    });

    it("decreases monotonically", () => {
      let prev = nesDropInterval(0);
      for (let level = 1; level <= 29; level++) {
        const cur = nesDropInterval(level);
        expect(cur).toBeLessThanOrEqual(prev);
        prev = cur;
      }
    });

    it("has known values for key levels", () => {
      // L9: 6 frames, L10: 5 frames, L18: 3 frames, L19: 2 frames
      expect(nesDropInterval(9)).toBe(Math.round((6 / 60.0988) * 1000));
      expect(nesDropInterval(10)).toBe(Math.round((5 / 60.0988) * 1000));
      expect(nesDropInterval(18)).toBe(Math.round((3 / 60.0988) * 1000));
      expect(nesDropInterval(19)).toBe(Math.round((2 / 60.0988) * 1000));
    });
  });
});
