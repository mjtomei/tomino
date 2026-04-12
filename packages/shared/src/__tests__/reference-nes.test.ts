/**
 * Reference verification tests — NES scoring and gravity tables.
 *
 * These are table-driven snapshot tests that hardcode the authoritative
 * reference values from the NTSC NES Tetris specification. Any accidental
 * change to the engine constants will be caught immediately.
 *
 * Sources:
 *   - https://tetris.wiki/Tetris_(NES) (gravity / speed curve)
 *   - https://tetris.wiki/Scoring (Original Nintendo scoring system)
 */

import { describe, expect, it } from "vitest";

import { nesDropInterval } from "../engine/gravity.js";
import { NESScoring } from "../engine/scoring-nes.js";
import type { LineClearCount } from "../engine/scoring.js";

// ===========================================================================
// Reference data — hardcoded from TetrisWiki
// ===========================================================================

/**
 * NTSC NES gravity table: frames per gridcell drop at each level.
 * Level 29+ uses 1 frame ("kill screen" speed).
 */
const REFERENCE_GRAVITY: readonly { level: number; frames: number }[] = [
  { level: 0, frames: 48 },
  { level: 1, frames: 43 },
  { level: 2, frames: 38 },
  { level: 3, frames: 33 },
  { level: 4, frames: 28 },
  { level: 5, frames: 23 },
  { level: 6, frames: 18 },
  { level: 7, frames: 13 },
  { level: 8, frames: 8 },
  { level: 9, frames: 6 },
  { level: 10, frames: 5 },
  { level: 11, frames: 5 },
  { level: 12, frames: 5 },
  { level: 13, frames: 4 },
  { level: 14, frames: 4 },
  { level: 15, frames: 4 },
  { level: 16, frames: 3 },
  { level: 17, frames: 3 },
  { level: 18, frames: 3 },
  { level: 19, frames: 2 },
  { level: 20, frames: 2 },
  { level: 21, frames: 2 },
  { level: 22, frames: 2 },
  { level: 23, frames: 2 },
  { level: 24, frames: 2 },
  { level: 25, frames: 2 },
  { level: 26, frames: 2 },
  { level: 27, frames: 2 },
  { level: 28, frames: 2 },
  { level: 29, frames: 1 },
];

/** NTSC NES frame rate used to convert frames → milliseconds. */
const NES_FPS = 60.0988;

/**
 * NES line clear base points. Multiplied by (level + 1).
 * Original Nintendo scoring system.
 */
const REFERENCE_LINE_POINTS: readonly {
  lines: LineClearCount;
  label: string;
  basePoints: number;
}[] = [
  { lines: 0, label: "No clear", basePoints: 0 },
  { lines: 1, label: "Single", basePoints: 40 },
  { lines: 2, label: "Double", basePoints: 100 },
  { lines: 3, label: "Triple", basePoints: 300 },
  { lines: 4, label: "Tetris", basePoints: 1200 },
];

/**
 * NES level progression: first level-up line thresholds.
 * Formula: min(startLevel * 10 + 10, max(100, startLevel * 10 - 50))
 * After the first threshold, every 10 additional lines triggers the next level.
 */
const REFERENCE_LEVEL_THRESHOLDS: readonly {
  startLevel: number;
  threshold: number;
}[] = [
  { startLevel: 0, threshold: 10 },
  { startLevel: 1, threshold: 20 },
  { startLevel: 2, threshold: 30 },
  { startLevel: 3, threshold: 40 },
  { startLevel: 4, threshold: 50 },
  { startLevel: 5, threshold: 60 },
  { startLevel: 6, threshold: 70 },
  { startLevel: 7, threshold: 80 },
  { startLevel: 8, threshold: 90 },
  { startLevel: 9, threshold: 100 },
  { startLevel: 10, threshold: 100 },
  { startLevel: 11, threshold: 100 },
  { startLevel: 12, threshold: 100 },
  { startLevel: 13, threshold: 100 },
  { startLevel: 14, threshold: 100 },
  { startLevel: 15, threshold: 100 },
  { startLevel: 16, threshold: 110 },
  { startLevel: 17, threshold: 120 },
  { startLevel: 18, threshold: 130 },
  { startLevel: 19, threshold: 140 },
];

// ===========================================================================
// Gravity table verification
// ===========================================================================

describe("NES reference: gravity table", () => {
  it.each(REFERENCE_GRAVITY)(
    "level $level → $frames frames",
    ({ level, frames }) => {
      const expectedMs = Math.round((frames / NES_FPS) * 1000);
      expect(nesDropInterval(level)).toBe(expectedMs);
    },
  );

  it("levels beyond 29 clamp to 1 frame (kill screen)", () => {
    const killScreenMs = Math.round((1 / NES_FPS) * 1000);
    expect(nesDropInterval(30)).toBe(killScreenMs);
    expect(nesDropInterval(50)).toBe(killScreenMs);
    expect(nesDropInterval(99)).toBe(killScreenMs);
  });

  it("complete table snapshot", () => {
    const actual = REFERENCE_GRAVITY.map(({ level }) => nesDropInterval(level));
    const expected = REFERENCE_GRAVITY.map(({ frames }) =>
      Math.round((frames / NES_FPS) * 1000),
    );
    expect(actual).toEqual(expected);
  });
});

// ===========================================================================
// Scoring table verification
// ===========================================================================

describe("NES reference: scoring table", () => {
  const testLevels = [0, 1, 5, 9, 15, 19, 29];

  describe("base points × (level + 1)", () => {
    for (const { lines, label, basePoints } of REFERENCE_LINE_POINTS) {
      if (lines === 0) continue; // no-clear tested separately

      it.each(testLevels)(
        `${label} (${lines} line${lines > 1 ? "s" : ""}) at level %i`,
        (level) => {
          const state = NESScoring.createState(level);
          NESScoring.onLineClear(state, lines, "none", false);
          expect(state.score).toBe(basePoints * (level + 1));
        },
      );
    }
  });

  it("no-clear awards 0 points at any level", () => {
    for (const level of testLevels) {
      const state = NESScoring.createState(level);
      NESScoring.onLineClear(state, 0, "none", false);
      expect(state.score).toBe(0);
    }
  });

  it("soft drop awards 1 point per cell, independent of level", () => {
    for (const level of testLevels) {
      const state = NESScoring.createState(level);
      NESScoring.onSoftDrop(state, 10);
      expect(state.score).toBe(10);
    }
  });

  it("hard drop is a no-op (not in original NES)", () => {
    const state = NESScoring.createState(0);
    NESScoring.onHardDrop(state, 20);
    expect(state.score).toBe(0);
  });

  describe("NES ignores non-classic features", () => {
    it("T-spin type has no effect on score", () => {
      const normal = NESScoring.createState(0);
      NESScoring.onLineClear(normal, 1, "none", false);

      const full = NESScoring.createState(0);
      NESScoring.onLineClear(full, 1, "full", false);

      const mini = NESScoring.createState(0);
      NESScoring.onLineClear(mini, 1, "mini", false);

      expect(normal.score).toBe(full.score);
      expect(normal.score).toBe(mini.score);
    });

    it("perfect clear flag has no effect on score", () => {
      const normal = NESScoring.createState(0);
      NESScoring.onLineClear(normal, 4, "none", false);

      const pc = NESScoring.createState(0);
      NESScoring.onLineClear(pc, 4, "none", true);

      expect(normal.score).toBe(pc.score);
    });

    it("consecutive clears do not award combo bonus", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 1, "none", false); // 40
      NESScoring.onLineClear(state, 1, "none", false); // 40
      NESScoring.onLineClear(state, 1, "none", false); // 40
      expect(state.score).toBe(120); // exactly 3 × 40, no combo bonus
    });

    it("consecutive tetrises do not award back-to-back bonus", () => {
      const state = NESScoring.createState(0);
      NESScoring.onLineClear(state, 4, "none", false); // 1200
      NESScoring.onLineClear(state, 4, "none", false); // 1200 (no 1.5×)
      expect(state.score).toBe(2400);
    });
  });
});

// ===========================================================================
// Level progression verification
// ===========================================================================

describe("NES reference: level progression", () => {
  describe("first level-up thresholds", () => {
    it.each(REFERENCE_LEVEL_THRESHOLDS)(
      "start level $startLevel → first level-up at $threshold lines",
      ({ startLevel, threshold }) => {
        const state = NESScoring.createState(startLevel);

        // Clear lines up to 1 below threshold — should still be at start level
        let linesCleared = 0;
        while (linesCleared + 4 < threshold) {
          NESScoring.onLineClear(state, 4, "none", false);
          linesCleared += 4;
        }
        while (linesCleared + 1 < threshold) {
          NESScoring.onLineClear(state, 1, "none", false);
          linesCleared += 1;
        }
        expect(state.lines).toBe(threshold - 1);
        expect(state.level).toBe(startLevel);

        // One more line should trigger the level-up
        NESScoring.onLineClear(state, 1, "none", false);
        expect(state.lines).toBe(threshold);
        expect(state.level).toBe(startLevel + 1);
      },
    );
  });

  it("levels up every 10 lines after first threshold", () => {
    const state = NESScoring.createState(0);
    // First threshold at 10 lines → level 1
    for (let i = 0; i < 10; i++) {
      NESScoring.onLineClear(state, 1, "none", false);
    }
    expect(state.level).toBe(1);

    // +10 lines → level 2
    for (let i = 0; i < 10; i++) {
      NESScoring.onLineClear(state, 1, "none", false);
    }
    expect(state.level).toBe(2);

    // +10 lines → level 3
    for (let i = 0; i < 10; i++) {
      NESScoring.onLineClear(state, 1, "none", false);
    }
    expect(state.level).toBe(3);
  });

  it("score accumulates correctly as level changes mid-game", () => {
    const state = NESScoring.createState(0);
    // 10 singles at level 0: 10 × 40 × (0+1) = 400 → level up to 1
    for (let i = 0; i < 10; i++) {
      NESScoring.onLineClear(state, 1, "none", false);
    }
    expect(state.score).toBe(400);
    expect(state.level).toBe(1);

    // 1 tetris at level 1: 1200 × (1+1) = 2400
    NESScoring.onLineClear(state, 4, "none", false);
    expect(state.score).toBe(400 + 2400);
  });

  it("start level beyond gravity table still uses correct scoring multiplier", () => {
    const state = NESScoring.createState(30);
    NESScoring.onLineClear(state, 4, "none", false);
    expect(state.score).toBe(1200 * 31); // 1200 × (30+1)
  });
});
