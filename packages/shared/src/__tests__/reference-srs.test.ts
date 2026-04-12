/**
 * Reference verification — SRS rotation and wall kicks.
 *
 * These tests cross-check our SRS implementation against the canonical
 * Super Rotation System specification as documented on:
 *   - https://tetris.wiki/Super_Rotation_System
 *   - https://harddrop.com/wiki/SRS
 *
 * Unlike the snapshot-based regression tests in engine/kick-tables.test.ts,
 * this file defines expected values as hardcoded constants derived
 * independently from the SRS specification's offset data tables, serving
 * as an independent oracle.
 *
 * The SRS spec defines "offset data" per rotation state. The actual kick
 * for a transition A→B is: kick[i] = offsetA[i] − offsetB[i].
 * We pre-compute those final values here and assert equality.
 */

import { describe, expect, it } from "vitest";

import { createGrid, type Grid, BOARD_WIDTH } from "../engine/board.js";
import type { PieceType, Rotation } from "../engine/pieces.js";
import { SRSRotation } from "../engine/rotation-srs.js";
import { tryRotate } from "../engine/movement.js";

// ---------------------------------------------------------------------------
// Reference data — derived from the SRS offset data tables
// ---------------------------------------------------------------------------

/**
 * JLSTZ offset data (from TetrisWiki SRS specification).
 *
 * Format: offsetData[state] = [[x, y], ...] for 5 tests.
 * Convention: +x = right, +y = up.
 *
 * State 0 (spawn): all zeros
 * State 1 (R/CW):  [(0,0), (+1,0), (+1,-1), (0,+2), (+1,+2)]
 * State 2 (180):   all zeros
 * State 3 (L/CCW): [(0,0), (-1,0), (-1,-1), (0,+2), (-1,+2)]
 */
const JLSTZ_OFFSETS: readonly (readonly [number, number])[][] = [
  /* 0 */ [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  /* 1 */ [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  /* 2 */ [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  /* 3 */ [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
];

/**
 * I-piece offset data (SRS Guideline variant, normalized with state 0 = all zeros).
 *
 * The SRS specification uses an offset table where the kick for A→B is
 * offset[A][i] − offset[B][i]. Multiple equivalent offset tables exist
 * (adding a constant per test index to all states preserves kick values).
 *
 * This table is equivalent to the standard Tetris Guideline I-piece data,
 * normalized so that state 0 has all-zero offsets. The resulting kicks
 * match the Guideline SRS wall kick data where test 1 is always (0,0).
 *
 * Convention: +x = right, +y = up.
 */
const I_OFFSETS: readonly (readonly [number, number])[][] = [
  /* 0 */ [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  /* 1 */ [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  /* 2 */ [[0, 0], [3, 0], [-3, 0], [3, -1], [-3, -1]],
  /* 3 */ [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
];

/**
 * Derive kick offsets from the SRS offset data tables.
 * kick[i] = offsetFrom[i] − offsetTo[i]
 */
function deriveKicks(
  offsets: readonly (readonly [number, number])[][],
  from: number,
  to: number,
): readonly [number, number][] {
  return offsets[from]!.map((o, i) => {
    const t = offsets[to]![i]!;
    return [o[0] - t[0], o[1] - t[1]] as [number, number];
  });
}

/** All 8 adjacent rotation transitions. */
const TRANSITIONS: readonly [Rotation, Rotation][] = [
  [0, 1], [1, 0], [1, 2], [2, 1], [2, 3], [3, 2], [3, 0], [0, 3],
];

/** Pre-computed reference kick tables for JLSTZ. */
const REFERENCE_JLSTZ_KICKS: Record<string, readonly [number, number][]> = {};
for (const [from, to] of TRANSITIONS) {
  REFERENCE_JLSTZ_KICKS[`${from}>${to}`] = deriveKicks(JLSTZ_OFFSETS, from, to);
}

/** Pre-computed reference kick tables for I-piece. */
const REFERENCE_I_KICKS: Record<string, readonly [number, number][]> = {};
for (const [from, to] of TRANSITIONS) {
  REFERENCE_I_KICKS[`${from}>${to}`] = deriveKicks(I_OFFSETS, from, to);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JLSTZ_PIECES: readonly PieceType[] = ["J", "L", "S", "T", "Z"];

/** Fill a grid row completely. */
function fillRow(grid: Grid, row: number, piece: PieceType = "T"): void {
  for (let c = 0; c < BOARD_WIDTH; c++) {
    grid[row]![c] = piece;
  }
}

// =========================================================================
// DATA VALIDATION — raw kick table values vs. SRS reference
// =========================================================================

describe("SRS kick table data — reference verification", () => {
  describe("JLSTZ kicks match SRS specification", () => {
    for (const [from, to] of TRANSITIONS) {
      const key = `${from}>${to}`;
      it(`transition ${key}`, () => {
        // Use T as the canonical JLSTZ representative
        const actual = SRSRotation.getKickOffsets("T", from, to);
        const expected = REFERENCE_JLSTZ_KICKS[key]!;
        expect(actual).toEqual(expected);
      });
    }
  });

  describe("I-piece kicks match SRS specification", () => {
    for (const [from, to] of TRANSITIONS) {
      const key = `${from}>${to}`;
      it(`transition ${key}`, () => {
        const actual = SRSRotation.getKickOffsets("I", from, to);
        const expected = REFERENCE_I_KICKS[key]!;
        expect(actual).toEqual(expected);
      });
    }
  });

  describe("all JLSTZ pieces share identical kick data", () => {
    for (const [from, to] of TRANSITIONS) {
      const key = `${from}>${to}`;
      it(`transition ${key} is identical for J, L, S, T, Z`, () => {
        const baseline = SRSRotation.getKickOffsets("T", from, to);
        for (const piece of JLSTZ_PIECES) {
          expect(SRSRotation.getKickOffsets(piece, from, to)).toEqual(baseline);
        }
      });
    }
  });

  describe("O-piece has no meaningful kicks", () => {
    for (const [from, to] of TRANSITIONS) {
      it(`transition ${from}>${to} returns only [0,0]`, () => {
        const kicks = SRSRotation.getKickOffsets("O", from, to);
        expect(kicks).toEqual([[0, 0]]);
      });
    }
  });

  describe("structural properties", () => {
    it("every JLSTZ transition has exactly 5 kick tests", () => {
      for (const [from, to] of TRANSITIONS) {
        const kicks = SRSRotation.getKickOffsets("T", from, to);
        expect(kicks).toHaveLength(5);
      }
    });

    it("every I-piece transition has exactly 5 kick tests", () => {
      for (const [from, to] of TRANSITIONS) {
        const kicks = SRSRotation.getKickOffsets("I", from, to);
        expect(kicks).toHaveLength(5);
      }
    });

    it("first kick test is always [0,0] for JLSTZ", () => {
      for (const [from, to] of TRANSITIONS) {
        const kicks = SRSRotation.getKickOffsets("T", from, to);
        expect(kicks[0]).toEqual([0, 0]);
      }
    });

    it("first kick test is always [0,0] for I-piece", () => {
      for (const [from, to] of TRANSITIONS) {
        const kicks = SRSRotation.getKickOffsets("I", from, to);
        expect(kicks[0]).toEqual([0, 0]);
      }
    });

    it("reverse transitions have negated offsets for JLSTZ", () => {
      // SRS property: kicks for A→B are negations of kicks for B→A
      const pairs: [Rotation, Rotation][] = [[0, 1], [1, 2], [2, 3], [3, 0]];
      for (const [a, b] of pairs) {
        const forward = SRSRotation.getKickOffsets("T", a, b);
        const reverse = SRSRotation.getKickOffsets("T", b, a);
        for (let i = 0; i < forward.length; i++) {
          // Use addition check to avoid -0 vs 0 Object.is mismatch
          expect(forward[i]![0] + reverse[i]![0]).toBe(0);
          expect(forward[i]![1] + reverse[i]![1]).toBe(0);
        }
      }
    });
  });
});

// =========================================================================
// BEHAVIORAL VALIDATION — wall kicks on a grid
// =========================================================================

describe("SRS wall kick behavior — reference verification", () => {
  describe("basic rotation without kick", () => {
    it("T-piece rotates CW in open space at base position", () => {
      const grid = createGrid();
      const result = tryRotate(grid, "T", 30, 4, 0, "cw", SRSRotation);
      expect(result).not.toBeNull();
      // Base rotation succeeds with kick [0,0] → position unchanged
      expect(result!.row).toBe(30);
      expect(result!.col).toBe(4);
      expect(result!.rotation).toBe(1);
    });

    it("I-piece rotates CW in open space at base position", () => {
      const grid = createGrid();
      const result = tryRotate(grid, "I", 30, 3, 0, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.row).toBe(30);
      expect(result!.col).toBe(3);
      expect(result!.rotation).toBe(1);
    });

    it("full CW cycle returns to original state for T-piece", () => {
      const grid = createGrid();
      let row = 30;
      let col = 4;
      let rotation: Rotation = 0;

      for (let i = 0; i < 4; i++) {
        const result = tryRotate(grid, "T", row, col, rotation, "cw", SRSRotation);
        expect(result).not.toBeNull();
        row = result!.row;
        col = result!.col;
        rotation = result!.rotation;
      }
      expect(rotation).toBe(0);
    });
  });

  describe("left wall kicks", () => {
    it("T-piece 0→1 kicks left (dx=-1) when against left wall with obstruction", () => {
      const grid = createGrid();
      // T-piece state 0 at (30, 0): fills (30,1), (31,0), (31,1), (31,2)
      // CW to state 1: shape [0,1,0] / [0,1,1] / [0,1,0]
      // At base (30, 0): fills (30,1), (31,1), (31,2), (32,1) — fits in open space.
      // Block (31,2) to force a kick.
      grid[31]![2] = "J";
      // Kick offsets for 0→1: [0,0], [-1,0], [-1,+1], [0,-2], [-1,-2]
      // Test 1 [0,0]: (31,2) blocked ✗
      // Test 2 [-1,0]: col=-1. State 1 fills (30,0), (31,0), (31,1), (32,0) — all open ✓
      const result = tryRotate(grid, "T", 30, 0, 0, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.col).toBe(-1); // kicked left by 1 (dx=-1)
      expect(result!.row).toBe(30); // dy=0
      expect(result!.rotation).toBe(1);
    });
  });

  describe("right wall kicks", () => {
    it("T-piece 0→3 kicks right (dx=+1) when against right wall with obstruction", () => {
      const grid = createGrid();
      // T-piece state 0 at (30, 7): fills (30,8), (31,7), (31,8), (31,9)
      // CCW to state 3: shape [0,1,0] / [1,1,0] / [0,1,0]
      // At base (30, 7): fits in open space. Block (31,7) to force a kick.
      grid[31]![7] = "J";
      // Kick offsets for 0→3: [0,0], [+1,0], [+1,+1], [0,-2], [+1,-2]
      // Test 1 [0,0]: (31,7) blocked ✗
      // Test 2 [+1,0]: col=8. State 3 fills (30,9), (31,8), (31,9), (32,9) — all open ✓
      const result = tryRotate(grid, "T", 30, 7, 0, "ccw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.col).toBe(8); // kicked right by 1 (dx=+1)
      expect(result!.row).toBe(30); // dy=0
      expect(result!.rotation).toBe(3);
    });
  });

  describe("floor kicks (upward)", () => {
    it("T-piece 3→0 kicks up when near floor", () => {
      const grid = createGrid();
      // T-piece state 3 at (37, 4): fills (37,5), (38,4), (38,5), (39,5)
      // CW to state 0: shape [0,1,0] / [1,1,1] / [0,0,0]
      // At base (37, 4): fills (37,5), (38,4), (38,5), (38,6)
      //
      // Fill row 38 entirely except col 5 to block base and early kicks.
      for (let c = 0; c < BOARD_WIDTH; c++) {
        if (c !== 4 && c !== 5 && c !== 6) grid[38]![c] = "J";
      }
      grid[38]![4] = "J";
      grid[38]![6] = "J";
      // Kick offsets for 3→0: [0,0], [-1,0], [-1,-1], [0,+2], [-1,+2]
      // Tests 1-3 all hit (38,4) or other blocked cells in row 38 ✗
      // Test 4 [0,+2]: row=35, col=4. Fills (35,5), (36,4), (36,5), (36,6) — all open ✓
      const result = tryRotate(grid, "T", 37, 4, 3, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.row).toBe(35); // kicked up by 2 (dy=+2)
      expect(result!.col).toBe(4); // dx=0
      expect(result!.rotation).toBe(0);
    });
  });

  describe("I-piece specific kicks", () => {
    it("I-piece 0→1 near right wall uses kick test 2 (dx=-2)", () => {
      const grid = createGrid();
      // I-piece state 0 at (30, 6): horizontal, fills row 31 at cols 6,7,8,9
      // CW to state 1: vertical, fills col 2 of 4x4 shape → grid col 6+2=8
      //   Fills: (30,8), (31,8), (32,8), (33,8) — all open in empty grid ✓
      //
      // Block (31,8) to prevent base rotation.
      grid[31]![8] = "J";
      // Kick offsets for I 0→1: [0,0], [-2,0], [+1,0], [-2,-1], [+1,+2]
      // Test 1 [0,0]: col 6. State 1 fills col 8 rows 30-33. (31,8) blocked ✗
      // Test 2 [-2,0]: col 4. State 1 fills col 6 rows 30-33. All open ✓
      const result = tryRotate(grid, "I", 30, 6, 0, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.col).toBe(4); // kicked left by 2 (dx=-2)
      expect(result!.row).toBe(30);
      expect(result!.rotation).toBe(1);
    });

    it("I-piece 0→1 uses kick test 3 (dx=+1) when test 2 is also blocked", () => {
      const grid = createGrid();
      // I-piece state 0 at (30, 3): horizontal, fills row 31 at cols 3,4,5,6
      // CW to state 1: vertical, shape col 2 → grid col 3+2=5
      //   Fills: (30,5), (31,5), (32,5), (33,5)
      //
      // Block base and test 2 positions.
      grid[31]![5] = "J"; // Blocks test 1 [0,0]: col 3, fills col 5
      grid[32]![3] = "J"; // Blocks test 2 [-2,0]: col 1, fills col 3. (32,3) blocked ✗
      // Test 3 [+1,0]: col 4. State 1 fills col 6 rows 30-33. All open ✓
      const result = tryRotate(grid, "I", 30, 3, 0, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.col).toBe(4); // kicked right by 1 (dx=+1)
      expect(result!.row).toBe(30);
      expect(result!.rotation).toBe(1);
    });
  });

  describe("kick blocked by placed pieces", () => {
    it("T-piece rotation blocked when all 5 kicks collide", () => {
      const grid = createGrid();
      // Fill the area around the T-piece densely so no kick can succeed.
      // T-piece state 0 at (37, 4): fills (37,5), (38,4), (38,5), (38,6)
      // CW to state 1: shape [0,1,0] / [0,1,1] / [0,1,0]
      // We need all 5 kick positions blocked for 0→1.
      // Kick offsets: [0,0], [-1,0], [-1,+1], [0,-2], [-1,-2]
      //
      // Fill rows 37-39 fully, except where the current piece sits
      fillRow(grid, 39);
      fillRow(grid, 38);
      fillRow(grid, 37);
      fillRow(grid, 36);
      fillRow(grid, 35);
      // Clear the cells where state 0 at (37,4) actually sits
      grid[37]![5] = null;
      grid[38]![4] = null;
      grid[38]![5] = null;
      grid[38]![6] = null;

      const result = tryRotate(grid, "T", 37, 4, 0, "cw", SRSRotation);
      expect(result).toBeNull();
    });
  });

  describe("O-piece position invariance", () => {
    it("O-piece rotation never changes position", () => {
      const grid = createGrid();
      let row = 30;
      let col = 4;
      let rotation: Rotation = 0;

      // Rotate CW through all 4 states
      for (let i = 0; i < 4; i++) {
        const result = tryRotate(grid, "O", row, col, rotation, "cw", SRSRotation);
        expect(result).not.toBeNull();
        expect(result!.row).toBe(30);
        expect(result!.col).toBe(4);
        row = result!.row;
        col = result!.col;
        rotation = result!.rotation;
      }
      expect(rotation).toBe(0);
    });
  });

  describe("kick priority — correct kick index selected", () => {
    it("JLSTZ: when tests 1-3 fail, test 4 (dy=-2) is used", () => {
      const grid = createGrid();
      // T-piece state 2 at (30, 4): shape [0,0,0] / [1,1,1] / [0,1,0]
      // CW to state 3: shape [0,1,0] / [1,1,0] / [0,1,0]
      // Kick offsets for 2→3: [0,0], [+1,0], [+1,+1], [0,-2], [+1,-2]
      //
      // Block tests 1-3, allow test 4 [0,-2] at (32,4):
      grid[30]![5] = "J"; // blocks test 1: state 3 at (30,4) fills (30,5) ✗
      grid[30]![6] = "J"; // blocks test 2: state 3 at (30,5) fills (30,6) ✗
      // Test 3 [+1,+1] at (29,5) also blocked: (30,5) and (30,6) occupied ✗
      // Test 4 [0,-2] at (32,4): fills (32,5), (33,4), (33,5), (34,5) — all open ✓

      const result = tryRotate(grid, "T", 30, 4, 2, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.row).toBe(32); // kicked down by 2 (dy=-2 → row+2)
      expect(result!.col).toBe(4); // dx=0
      expect(result!.rotation).toBe(3);
    });

    it("JLSTZ: when tests 1-4 fail, test 5 is used", () => {
      const grid = createGrid();
      // T-piece state 2 at (30, 4), CW to state 3.
      // Kick offsets for 2→3: [0,0], [+1,0], [+1,+1], [0,-2], [+1,-2]
      //
      // Block tests 1-4:
      grid[30]![5] = "J"; // blocks test 1: state 3 at (30,4) fills (30,5) ✗
      grid[30]![6] = "J"; // blocks test 2 at (30,5) and test 3 at (29,5) via (30,5)/(30,6) ✗
      grid[32]![5] = "J"; // blocks test 4: state 3 at (32,4) fills (32,5) ✗
      // Test 5 [+1,-2] at (32,5): fills (32,6), (33,5), (33,6), (34,6) — all open ✓

      const result = tryRotate(grid, "T", 30, 4, 2, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.row).toBe(32); // dy=-2 → row+2
      expect(result!.col).toBe(5); // dx=+1
      expect(result!.rotation).toBe(3);
    });
  });

  describe("JLSTZ table sharing — behavioral", () => {
    it("S-piece uses the same kicks as T-piece for 0→1", () => {
      const grid = createGrid();
      // Block the base rotation for both pieces, verify same kick result.
      // S-piece state 0 at (30, 4): shape [0,1,1] / [1,1,0] / [0,0,0]
      // CW to state 1: shape [0,1,0] / [0,1,1] / [0,0,1]
      // At base (30,4): fills (30,5), (31,5), (31,6), (32,6)
      grid[32]![6] = "J"; // block test 1

      // Test 2 [-1,0]: col=3. State 1 at (30,3): fills (30,4), (31,4), (31,5), (32,5) — open ✓
      const sResult = tryRotate(grid, "S", 30, 4, 0, "cw", SRSRotation);
      expect(sResult).not.toBeNull();
      expect(sResult!.col).toBe(3); // same kick dx=-1 as T would get

      // Verify T-piece gets same kick in equivalent scenario
      const grid2 = createGrid();
      // T state 1 at (30,4): fills (30,5), (31,5), (31,6), (32,5)
      grid2[32]![5] = "J"; // block test 1 for T state 1
      // Test 2 [-1,0] for T: col=3. State 1 at (30,3): fills (30,4), (31,4), (31,5), (32,4) — open ✓
      const tResult = tryRotate(grid2, "T", 30, 4, 0, "cw", SRSRotation);
      expect(tResult).not.toBeNull();
      expect(tResult!.col).toBe(3); // same kick
    });
  });
});
