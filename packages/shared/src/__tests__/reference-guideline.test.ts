/**
 * Reference verification tests — Guideline garbage and scoring.
 *
 * These tests verify that our implementation matches the published Tetris
 * Guideline specification as documented on TetrisWiki:
 *   - Garbage: https://tetris.wiki/Garbage
 *   - Scoring: https://tetris.wiki/Scoring
 *
 * Unlike the unit tests in engine/scoring.test.ts and engine/garbage.test.ts
 * (which test implementation behavior), these are organized around the
 * reference specification tables so compliance is trivially auditable.
 */

import { describe, expect, it } from "vitest";

import { GuidelineScoring } from "../engine/scoring-guideline.js";
import type { LineClearCount, ScoringState, TSpinType } from "../engine/scoring.js";
import { baseGarbage, comboGarbage } from "../engine/garbage-table.js";
import { calculateGarbage } from "../engine/garbage.js";
import type { GarbageCalcInput } from "../engine/garbage-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(startLevel = 1): ScoringState {
  return GuidelineScoring.createState(startLevel);
}

function clearWith(
  state: ScoringState,
  lines: LineClearCount,
  tSpin: TSpinType = "none",
  perfectClear = false,
): void {
  GuidelineScoring.onLineClear(state, lines, tSpin, perfectClear);
}

function garbageInput(overrides: Partial<GarbageCalcInput> = {}): GarbageCalcInput {
  return {
    linesCleared: 0,
    tSpin: "none",
    combo: -1,
    b2b: -1,
    ...overrides,
  };
}

// ===========================================================================
// GARBAGE — Reference: https://tetris.wiki/Garbage
// ===========================================================================

describe("Guideline garbage (TetrisWiki reference)", () => {
  // -------------------------------------------------------------------------
  // Base garbage table — normal line clears
  // Reference: TetrisWiki Garbage § "Lines sent" table
  // -------------------------------------------------------------------------

  describe("base garbage — normal line clears", () => {
    it.each([
      { action: "no clear", lines: 0 as LineClearCount, expected: 0 },
      { action: "Single", lines: 1 as LineClearCount, expected: 0 },
      { action: "Double", lines: 2 as LineClearCount, expected: 1 },
      { action: "Triple", lines: 3 as LineClearCount, expected: 2 },
      { action: "Tetris", lines: 4 as LineClearCount, expected: 4 },
    ])("$action → $expected garbage", ({ lines, expected }) => {
      expect(baseGarbage(lines, "none")).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Base garbage table — T-spin line clears
  // Reference: TetrisWiki Garbage § "Lines sent" table (T-Spin rows)
  // -------------------------------------------------------------------------

  describe("base garbage — full T-spin line clears", () => {
    it.each([
      { action: "T-Spin no-clear", lines: 0 as LineClearCount, expected: 0 },
      { action: "T-Spin Single", lines: 1 as LineClearCount, expected: 2 },
      { action: "T-Spin Double", lines: 2 as LineClearCount, expected: 4 },
      { action: "T-Spin Triple", lines: 3 as LineClearCount, expected: 6 },
    ])("$action → $expected garbage", ({ lines, expected }) => {
      expect(baseGarbage(lines, "full")).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Mini T-spin treatment
  // Reference: TetrisWiki Garbage — mini T-spins use the normal line clear
  // garbage table, not the T-spin table.
  // -------------------------------------------------------------------------

  describe("base garbage — mini T-spin uses normal table", () => {
    it.each([
      { action: "Mini T-Spin Single", lines: 1 as LineClearCount, expected: 0 },
      { action: "Mini T-Spin Double", lines: 2 as LineClearCount, expected: 1 },
    ])("$action → $expected garbage (same as normal clear)", ({ lines, expected }) => {
      expect(baseGarbage(lines, "mini")).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Combo garbage table
  // Reference: TetrisWiki Garbage § "Combo" table
  // -------------------------------------------------------------------------

  describe("combo garbage table", () => {
    it.each([
      { combo: -1, expected: 0, label: "inactive (-1)" },
      { combo: 0, expected: 0, label: "first clear (0)" },
      { combo: 1, expected: 1, label: "1" },
      { combo: 2, expected: 1, label: "2" },
      { combo: 3, expected: 2, label: "3" },
      { combo: 4, expected: 2, label: "4" },
      { combo: 5, expected: 3, label: "5" },
      { combo: 6, expected: 3, label: "6" },
      { combo: 7, expected: 4, label: "7" },
    ])("combo $label → $expected garbage", ({ combo, expected }) => {
      expect(comboGarbage(combo)).toBe(expected);
    });

    it("caps at 4 for combo values beyond 7", () => {
      expect(comboGarbage(8)).toBe(4);
      expect(comboGarbage(15)).toBe(4);
      expect(comboGarbage(100)).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // Back-to-back garbage bonus
  // Reference: TetrisWiki Garbage § "Back-to-Back"
  // B2B adds +1 garbage line when b2b > 0 (at least second consecutive
  // difficult clear).
  // -------------------------------------------------------------------------

  describe("back-to-back garbage bonus", () => {
    it("adds +1 garbage when b2b > 0 (active B2B)", () => {
      const result = calculateGarbage(garbageInput({ linesCleared: 4, b2b: 1 }));
      expect(result.b2b).toBe(1);
      expect(result.total).toBe(4 + 1);
    });

    it("no bonus when b2b = 0 (first difficult clear)", () => {
      const result = calculateGarbage(garbageInput({ linesCleared: 4, b2b: 0 }));
      expect(result.b2b).toBe(0);
      expect(result.total).toBe(4);
    });

    it("no bonus when b2b = -1 (inactive)", () => {
      const result = calculateGarbage(garbageInput({ linesCleared: 4, b2b: -1 }));
      expect(result.b2b).toBe(0);
      expect(result.total).toBe(4);
    });

    it("+1 applies to T-spin clears too", () => {
      const result = calculateGarbage(
        garbageInput({ linesCleared: 2, tSpin: "full", b2b: 1 }),
      );
      expect(result.b2b).toBe(1);
      expect(result.total).toBe(4 + 1); // TSD base(4) + B2B(1)
    });
  });

  // -------------------------------------------------------------------------
  // calculateGarbage — combined bonuses
  // Reference: TetrisWiki Garbage — total = base + combo + b2b
  // -------------------------------------------------------------------------

  describe("calculateGarbage — combined bonuses", () => {
    it("sums base + combo + b2b for T-spin double with combo and B2B", () => {
      const result = calculateGarbage(
        garbageInput({ linesCleared: 2, tSpin: "full", combo: 5, b2b: 2 }),
      );
      expect(result.base).toBe(4);  // TSD
      expect(result.combo).toBe(3); // combo 5
      expect(result.b2b).toBe(1);   // active B2B
      expect(result.total).toBe(4 + 3 + 1); // = 8
    });

    it("sends 0 for no lines cleared even with active combo/b2b", () => {
      const result = calculateGarbage(
        garbageInput({ linesCleared: 0, tSpin: "full", combo: 3, b2b: 2 }),
      );
      expect(result.total).toBe(0);
    });

    it("Tetris with max combo and B2B", () => {
      const result = calculateGarbage(
        garbageInput({ linesCleared: 4, combo: 7, b2b: 3 }),
      );
      expect(result.base).toBe(4);  // Tetris
      expect(result.combo).toBe(4); // combo 7 (capped)
      expect(result.b2b).toBe(1);   // active B2B
      expect(result.total).toBe(4 + 4 + 1); // = 9
    });
  });

  // -------------------------------------------------------------------------
  // Perfect clear garbage — known gap
  // Reference: TetrisWiki Garbage § "Perfect Clear" lists 10 lines.
  // Our implementation does not include perfect clear in garbage calculation
  // (GarbageCalcInput has no isPerfectClear field). This is documented here
  // for reference completeness.
  // -------------------------------------------------------------------------

  describe("perfect clear garbage (not implemented)", () => {
    it("calculateGarbage has no perfect clear input — returns normal garbage only", () => {
      // A Tetris that happens to be a perfect clear still sends only base garbage
      const result = calculateGarbage(garbageInput({ linesCleared: 4 }));
      expect(result.total).toBe(4); // No extra PC bonus
    });
  });
});

// ===========================================================================
// SCORING — Reference: https://tetris.wiki/Scoring
// ===========================================================================

describe("Guideline scoring (TetrisWiki reference)", () => {
  // -------------------------------------------------------------------------
  // Line clear base points
  // Reference: TetrisWiki Scoring § "Line clear" table
  // Points = base × level
  // -------------------------------------------------------------------------

  describe("line clear base points", () => {
    it.each([
      { action: "Single", lines: 1 as LineClearCount, base: 100 },
      { action: "Double", lines: 2 as LineClearCount, base: 300 },
      { action: "Triple", lines: 3 as LineClearCount, base: 500 },
      { action: "Tetris", lines: 4 as LineClearCount, base: 800 },
    ])("$action → $base × level", ({ lines, base }) => {
      // Level 1
      const s1 = makeState(1);
      clearWith(s1, lines);
      expect(s1.score).toBe(base * 1);

      // Level 5 (verify multiplier)
      const s5 = makeState(5);
      clearWith(s5, lines);
      expect(s5.score).toBe(base * 5);
    });

    it("no clear awards 0 points", () => {
      const state = makeState(1);
      clearWith(state, 0);
      expect(state.score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // T-spin bonus points
  // Reference: TetrisWiki Scoring § "T-Spin" table
  // Points = base × level
  // -------------------------------------------------------------------------

  describe("T-spin bonus points", () => {
    it.each([
      { action: "T-Spin Mini no-clear", lines: 0 as LineClearCount, tSpin: "mini" as TSpinType, base: 100 },
      { action: "T-Spin Mini Single", lines: 1 as LineClearCount, tSpin: "mini" as TSpinType, base: 200 },
      { action: "T-Spin Mini Double", lines: 2 as LineClearCount, tSpin: "mini" as TSpinType, base: 400 },
      { action: "T-Spin Full no-clear", lines: 0 as LineClearCount, tSpin: "full" as TSpinType, base: 400 },
      { action: "T-Spin Full Single", lines: 1 as LineClearCount, tSpin: "full" as TSpinType, base: 800 },
      { action: "T-Spin Full Double", lines: 2 as LineClearCount, tSpin: "full" as TSpinType, base: 1200 },
      { action: "T-Spin Full Triple", lines: 3 as LineClearCount, tSpin: "full" as TSpinType, base: 1600 },
    ])("$action → $base × level", ({ lines, tSpin, base }) => {
      // Level 1
      const s1 = makeState(1);
      clearWith(s1, lines, tSpin);
      expect(s1.score).toBe(base * 1);

      // Level 3 (verify multiplier)
      const s3 = makeState(3);
      clearWith(s3, lines, tSpin);
      expect(s3.score).toBe(base * 3);
    });
  });

  // -------------------------------------------------------------------------
  // Perfect clear bonus points
  // Reference: TetrisWiki Scoring § "Perfect Clear" table
  // Bonus added on top of line clear points, × level
  // -------------------------------------------------------------------------

  describe("perfect clear bonus points", () => {
    it.each([
      { action: "PC Single", lines: 1 as LineClearCount, lineBase: 100, pcBonus: 800 },
      { action: "PC Double", lines: 2 as LineClearCount, lineBase: 300, pcBonus: 1200 },
      { action: "PC Triple", lines: 3 as LineClearCount, lineBase: 500, pcBonus: 1800 },
      { action: "PC Tetris", lines: 4 as LineClearCount, lineBase: 800, pcBonus: 2000 },
    ])("$action → ($lineBase + $pcBonus) × level", ({ lines, lineBase, pcBonus }) => {
      // Level 1
      const s1 = makeState(1);
      clearWith(s1, lines, "none", true);
      expect(s1.score).toBe((lineBase + pcBonus) * 1);

      // Level 2 (verify multiplier)
      const s2 = makeState(2);
      clearWith(s2, lines, "none", true);
      expect(s2.score).toBe((lineBase + pcBonus) * 2);
    });
  });

  // -------------------------------------------------------------------------
  // Back-to-back scoring bonus
  // Reference: TetrisWiki Scoring § "Back-to-Back"
  // Consecutive "difficult" clears (Tetris or any T-spin with lines) get
  // floor(points × 1.5). First difficult clear has no multiplier.
  //
  // Note: In our implementation, mini T-spins with lines also count as
  // "difficult" for B2B purposes. This is a design decision.
  // -------------------------------------------------------------------------

  describe("back-to-back scoring bonus (1.5× multiplier)", () => {
    it("first difficult clear: no multiplier (b2b → 0)", () => {
      const state = makeState(1);
      clearWith(state, 4); // Tetris: 800
      expect(state.b2b).toBe(0);
      expect(state.score).toBe(800);
    });

    it("second consecutive difficult clear: floor(base × level × 1.5)", () => {
      const state = makeState(1);
      clearWith(state, 4); // 800, b2b → 0
      clearWith(state, 4); // floor(800 × 1.5) = 1200, combo +50
      expect(state.b2b).toBe(1);
      expect(state.score).toBe(800 + 1200 + 50);
    });

    it("non-difficult clear resets B2B to -1", () => {
      const state = makeState(1);
      clearWith(state, 4); // b2b → 0
      clearWith(state, 1); // Single (non-difficult), b2b → -1
      expect(state.b2b).toBe(-1);
    });

    it("T-spin with 0 lines does not affect B2B counter", () => {
      const state = makeState(1);
      clearWith(state, 4);           // b2b → 0
      clearWith(state, 0, "full");   // T-spin no-clear: b2b unchanged
      expect(state.b2b).toBe(0);
      clearWith(state, 4);           // b2b → 1 (gets 1.5× bonus)
      // 800 + 400 + floor(800 × 1.5) + 50 = 800 + 400 + 1200 + 50 = 2450
      expect(state.score).toBe(2450);
    });

    it("B2B applies to T-spin clears", () => {
      const state = makeState(1);
      clearWith(state, 1, "full"); // T-Spin Single: 800, b2b → 0
      clearWith(state, 1, "full"); // floor(800 × 1.5) = 1200, combo +50
      expect(state.score).toBe(800 + 1200 + 50);
    });

    it("B2B between Tetris and T-spin (cross-type difficult clears)", () => {
      const state = makeState(1);
      clearWith(state, 4);            // Tetris: 800, b2b → 0
      clearWith(state, 2, "full");    // TSD: floor(1200 × 1.5) = 1800, combo +50
      expect(state.score).toBe(800 + 1800 + 50);
    });
  });

  // -------------------------------------------------------------------------
  // Combo scoring bonus
  // Reference: TetrisWiki Scoring § "Combo"
  // Bonus = 50 × combo × level, where combo starts at 0 on first clear.
  // -------------------------------------------------------------------------

  describe("combo scoring bonus (50 × combo × level)", () => {
    it("first clear: combo → 0, no bonus", () => {
      const state = makeState(1);
      clearWith(state, 1);
      expect(state.combo).toBe(0);
      expect(state.score).toBe(100); // no combo bonus
    });

    it("second consecutive clear: combo → 1, +50 × 1 × level", () => {
      const state = makeState(1);
      clearWith(state, 1); // 100, combo → 0
      clearWith(state, 1); // 100 + 50, combo → 1
      expect(state.score).toBe(100 + 150);
    });

    it("third consecutive clear: combo → 2, +50 × 2 × level", () => {
      const state = makeState(1);
      clearWith(state, 1); // 100
      clearWith(state, 1); // 100 + 50
      clearWith(state, 1); // 100 + 100
      expect(state.score).toBe(100 + 150 + 200);
    });

    it("combo resets on non-clear placement", () => {
      const state = makeState(1);
      clearWith(state, 1); // combo → 0
      clearWith(state, 1); // combo → 1
      clearWith(state, 0); // reset combo → -1
      expect(state.combo).toBe(-1);
      clearWith(state, 1); // combo → 0 (no bonus)
      expect(state.score).toBe(100 + 150 + 100);
    });

    it("combo bonus scales with level", () => {
      const state = makeState(3);
      clearWith(state, 1); // 100 × 3 = 300
      clearWith(state, 1); // 100 × 3 + 50 × 1 × 3 = 300 + 150 = 450
      expect(state.score).toBe(300 + 450);
    });
  });

  // -------------------------------------------------------------------------
  // Drop scoring
  // Reference: TetrisWiki Scoring § "Soft drop" / "Hard drop"
  // Soft drop: 1 point per cell (no level scaling)
  // Hard drop: 2 points per cell (no level scaling)
  // -------------------------------------------------------------------------

  describe("drop scoring", () => {
    it("soft drop: 1 point per cell, no level scaling", () => {
      const state = makeState(5);
      GuidelineScoring.onSoftDrop(state, 10);
      expect(state.score).toBe(10); // not 50
    });

    it("hard drop: 2 points per cell, no level scaling", () => {
      const state = makeState(5);
      GuidelineScoring.onHardDrop(state, 10);
      expect(state.score).toBe(20); // not 100
    });
  });

  // -------------------------------------------------------------------------
  // Level progression
  // Reference: TetrisWiki Scoring § "Level"
  // Every 10 lines = 1 level up from start level.
  // -------------------------------------------------------------------------

  describe("level progression", () => {
    it("starts at the given start level", () => {
      expect(makeState(1).level).toBe(1);
      expect(makeState(5).level).toBe(5);
    });

    it("levels up after 10 lines", () => {
      const state = makeState(1);
      for (let i = 0; i < 10; i++) clearWith(state, 1);
      expect(state.lines).toBe(10);
      expect(state.level).toBe(2);
    });

    it("multiple level-ups via tetrises", () => {
      const state = makeState(1);
      clearWith(state, 4); // 4 lines
      clearWith(state, 4); // 8 lines
      clearWith(state, 4); // 12 lines → level 2
      expect(state.lines).toBe(12);
      expect(state.level).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Combined scenario — all bonuses stacking
  // Reference: TetrisWiki Scoring — verifies B2B + T-spin + combo + PC
  // all compose correctly.
  // -------------------------------------------------------------------------

  describe("combined bonus stacking", () => {
    it("B2B T-spin double perfect clear with combo", () => {
      const state = makeState(1);
      // 1st: Tetris to start B2B chain
      clearWith(state, 4);
      // b2b → 0, combo → 0, score = 800

      // 2nd: T-spin double + perfect clear (B2B active, combo active)
      clearWith(state, 2, "full", true);
      // Base: 1200 × 1 = 1200
      // B2B 1.5×: floor(1200 × 1.5) = 1800
      // Combo: 50 × 1 × 1 = 50
      // PC bonus: 1200 × 1 = 1200
      // Second clear total: 1800 + 50 + 1200 = 3050
      expect(state.score).toBe(800 + 3050);
    });

    it("high-level B2B T-spin triple with extended combo", () => {
      const state = makeState(5);

      // Build up combo with singles
      clearWith(state, 1); // 500, combo → 0
      clearWith(state, 1); // 500 + 250, combo → 1
      clearWith(state, 1); // 500 + 500, combo → 2

      // Now T-spin triple (first difficult clear in chain)
      clearWith(state, 3, "full");
      // Base: 1600 × 5 = 8000 (b2b → 0, no 1.5× yet)
      // Combo: 50 × 3 × 5 = 750
      // Score from this clear: 8000 + 750

      const expectedSoFar = 500 + 750 + 1000 + 8000 + 750;
      expect(state.score).toBe(expectedSoFar);
      expect(state.combo).toBe(3);
      expect(state.b2b).toBe(0);
    });
  });
});
