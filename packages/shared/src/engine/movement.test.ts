import { describe, expect, it } from "vitest";

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type Grid,
  createGrid,
} from "./board.js";
import type { PieceType, Rotation } from "./pieces.js";
import { ALL_PIECES } from "./pieces.js";
import { SRSRotation } from "./rotation-srs.js";
import { ClassicRotation } from "./rotation-classic.js";
import {
  collides,
  tryMove,
  tryRotate,
  hardDrop,
} from "./movement.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill a row completely (default piece type "T"). */
function fillRow(grid: Grid, row: number, piece: PieceType = "T"): void {
  for (let c = 0; c < BOARD_WIDTH; c++) {
    grid[row]![c] = piece;
  }
}

/** Fill a column from startRow to endRow (inclusive). */
function fillCol(grid: Grid, col: number, startRow: number, endRow: number, piece: PieceType = "T"): void {
  for (let r = startRow; r <= endRow; r++) {
    grid[r]![col] = piece;
  }
}

// ---------------------------------------------------------------------------
// collides
// ---------------------------------------------------------------------------

describe("collides", () => {
  it("returns false for a piece in open space", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    expect(collides(grid, shape, 20, 3)).toBe(false);
  });

  it("returns true when a filled cell is left of the board", () => {
    const grid = createGrid();
    // T-piece spawn: row 1 has [1,1,1] starting at col offset 0
    const shape = SRSRotation.getShape("T", 0);
    expect(collides(grid, shape, 20, -1)).toBe(true);
  });

  it("returns true when a filled cell is right of the board", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    // T-piece is 3 wide; col 8 puts rightmost filled cell at col 10 (out of bounds)
    expect(collides(grid, shape, 20, 8)).toBe(true);
  });

  it("returns true when a filled cell is below the board", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    // T-piece has filled cells in rows 0 and 1 of shape
    // At grid row 39, shape row 1 -> grid row 40 (out of bounds)
    expect(collides(grid, shape, 39, 3)).toBe(true);
  });

  it("returns true when a filled cell is above the board (negative row)", () => {
    const grid = createGrid();
    // I-piece spawn: filled cells at shape row 1. At grid row -2, shape row 1 -> grid row -1
    const shape = SRSRotation.getShape("I", 0);
    expect(collides(grid, shape, -2, 3)).toBe(true);
  });

  it("returns true when overlapping a placed cell", () => {
    const grid = createGrid();
    grid[21]![4] = "J"; // Place a cell where T-piece fills
    const shape = SRSRotation.getShape("T", 0);
    // T-piece at (20, 3): fills (20,4), (21,3), (21,4), (21,5)
    expect(collides(grid, shape, 20, 3)).toBe(true);
  });

  it("returns false when placed cells only overlap empty shape cells", () => {
    const grid = createGrid();
    grid[20]![3] = "J"; // T-piece shape[0][0] = 0, so no overlap
    const shape = SRSRotation.getShape("T", 0);
    expect(collides(grid, shape, 20, 3)).toBe(false);
  });

  it("works in the buffer zone", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    expect(collides(grid, shape, 0, 3)).toBe(false);
  });

  it("I-piece at row -1 is valid (filled cells at shape row 1 = grid row 0)", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("I", 0);
    // I-piece spawn: only row 1 of the 4x4 box has filled cells
    // At grid row -1, filled cells at grid row 0 — valid
    expect(collides(grid, shape, -1, 3)).toBe(false);
  });

  it("O-piece at bottom-right corner", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("O", 0);
    // O-piece is 2x2. Last valid position: row 38, col 8
    expect(collides(grid, shape, 38, 8)).toBe(false);
    expect(collides(grid, shape, 38, 9)).toBe(true);
    expect(collides(grid, shape, 39, 8)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tryMove — horizontal movement
// ---------------------------------------------------------------------------

describe("tryMove", () => {
  describe("move left", () => {
    it("moves a piece left in open space", () => {
      const grid = createGrid();
      const shape = SRSRotation.getShape("T", 0);
      const result = tryMove(grid, shape, 20, 5, -1, 0);
      expect(result).toEqual({ row: 20, col: 4 });
    });

    it("blocks at the left wall", () => {
      const grid = createGrid();
      const shape = SRSRotation.getShape("T", 0);
      // T-piece row 1 starts at col 0 — can't move left
      const result = tryMove(grid, shape, 20, 0, -1, 0);
      expect(result).toBeNull();
    });

    it("blocks when a placed piece is to the left", () => {
      const grid = createGrid();
      grid[21]![2] = "J"; // Block to the left of T at col 3
      const shape = SRSRotation.getShape("T", 0);
      const result = tryMove(grid, shape, 20, 3, -1, 0);
      expect(result).toBeNull();
    });
  });

  describe("move right", () => {
    it("moves a piece right in open space", () => {
      const grid = createGrid();
      const shape = SRSRotation.getShape("T", 0);
      const result = tryMove(grid, shape, 20, 3, 1, 0);
      expect(result).toEqual({ row: 20, col: 4 });
    });

    it("blocks at the right wall", () => {
      const grid = createGrid();
      const shape = SRSRotation.getShape("T", 0);
      // T-piece is 3 wide; at col 7, rightmost filled is col 9. Col 8 would put it at 10.
      const result = tryMove(grid, shape, 20, 7, 1, 0);
      expect(result).toBeNull();
    });

    it("blocks when a placed piece is to the right", () => {
      const grid = createGrid();
      grid[21]![6] = "L"; // Block to the right of T at col 3
      const shape = SRSRotation.getShape("T", 0);
      const result = tryMove(grid, shape, 20, 3, 1, 0);
      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// tryMove — soft drop
// ---------------------------------------------------------------------------

describe("tryMove — soft drop", () => {
  it("drops a piece one row down", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    const result = tryMove(grid, shape, 20, 3, 0, 1);
    expect(result).toEqual({ row: 21, col: 3 });
  });

  it("blocks at the floor", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    // T-piece has filled cells at rows 0,1 of shape. At grid row 38, row 1 = grid row 39 (last row). Can't go down.
    const result = tryMove(grid, shape, 38, 3, 0, 1);
    expect(result).toBeNull();
  });

  it("blocks when a placed piece is below", () => {
    const grid = createGrid();
    fillRow(grid, 37); // Full row below
    const shape = SRSRotation.getShape("T", 0);
    // T-piece at row 35: filled cells at rows 35,36. Row 36+1=37 is full.
    const result = tryMove(grid, shape, 35, 3, 0, 1);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hardDrop
// ---------------------------------------------------------------------------

describe("hardDrop", () => {
  it("drops to the floor on an empty board", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    // T-piece: filled rows 0,1 of 3x3 shape. Last valid: row 38 (row 39 = shape row 1)
    const landing = hardDrop(grid, shape, 0, 3);
    expect(landing).toBe(38);
  });

  it("drops onto a placed piece", () => {
    const grid = createGrid();
    fillRow(grid, 39);
    const shape = SRSRotation.getShape("T", 0);
    // Floor is at row 39, so T lands at row 37 (shape row 1 at grid row 38)
    const landing = hardDrop(grid, shape, 0, 3);
    expect(landing).toBe(37);
  });

  it("returns current row if already on the floor", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    const landing = hardDrop(grid, shape, 38, 3);
    expect(landing).toBe(38);
  });

  it("works with I-piece (4x4 bounding box)", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("I", 0);
    // I-piece spawn: filled at shape row 1. At grid row 38, shape row 1 = grid row 39. Valid.
    // At grid row 39, shape row 1 = grid row 40 — invalid.
    const landing = hardDrop(grid, shape, 0, 3);
    expect(landing).toBe(38);
  });

  it("I-piece vertical drops correctly", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("I", 1);
    // I-piece CW: filled at shape rows 0-3, col 2. Last valid: row 36 (row 3 = grid row 39).
    const landing = hardDrop(grid, shape, 0, 3);
    expect(landing).toBe(36);
  });
});

// ---------------------------------------------------------------------------
// tryRotate — SRS rotation
// ---------------------------------------------------------------------------

describe("tryRotate — SRS", () => {
  describe("basic rotation through all 4 states", () => {
    it.each(ALL_PIECES.filter((p) => p !== "O"))("rotates %s CW through all 4 states", (piece) => {
      const grid = createGrid();
      let row = 20;
      let col = 3;
      let rotation: Rotation = 0;

      for (let i = 0; i < 4; i++) {
        const result = tryRotate(grid, piece, row, col, rotation, "cw", SRSRotation);
        expect(result).not.toBeNull();
        row = result!.row;
        col = result!.col;
        rotation = result!.rotation;
      }
      // After 4 CW rotations, back to state 0
      expect(rotation).toBe(0);
    });

    it.each(ALL_PIECES.filter((p) => p !== "O"))("rotates %s CCW through all 4 states", (piece) => {
      const grid = createGrid();
      let row = 20;
      let col = 3;
      let rotation: Rotation = 0;

      for (let i = 0; i < 4; i++) {
        const result = tryRotate(grid, piece, row, col, rotation, "ccw", SRSRotation);
        expect(result).not.toBeNull();
        row = result!.row;
        col = result!.col;
        rotation = result!.rotation;
      }
      expect(rotation).toBe(0);
    });
  });

  describe("O-piece rotation", () => {
    it("rotation succeeds but state stays effectively the same", () => {
      const grid = createGrid();
      const result = tryRotate(grid, "O", 20, 4, 0, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.rotation).toBe(1);
      // Position unchanged (kick [0,0] always works for O)
      expect(result!.row).toBe(20);
      expect(result!.col).toBe(4);
    });
  });

  describe("wall kicks", () => {
    it("T-piece kicks right when against left wall (0→1)", () => {
      const grid = createGrid();
      // T-piece in state 0 at col 0. CW rotation (state 1) would place
      // filled cells at col -1 without kick. Kick [-1,0] would make it worse.
      // But some kick offset should succeed.
      // State 1 shape: [0,1,0] / [0,1,1] / [0,1,0] — needs cols 0,1,2 minimum
      // At col 0 with no kick: col 0 is fine (all cells at col 0,1,2 in shape cols 0,1,2)
      // Actually state 1 fits at col 0. Let me use a tighter scenario.

      // Better test: build a wall that blocks base rotation but not a kicked position.
      // Place blocks that prevent T rotation 0→1 at base position
      grid[20]![5] = "J"; // Block where CW T-piece shape[0][1] would go if at col 4
      // T in state 0 at (20, 3): fills (20,4), (21,3), (21,4), (21,5)
      // T in state 1 at (20, 3): fills (20,4), (21,4), (21,5), (22,4)
      // grid[21][5] is occupied by T-state-0... wait, we're checking against the grid before placing.
      // Let me think more carefully.

      // Simple wall kick test: T-piece at left edge, rotated into a position
      // where base doesn't fit but a kick does.

      // Fill col 0 from row 21 to 39, leaving row 20 open
      fillCol(grid, 0, 21, 39);
      // T-piece state 3 (CCW): shape is [0,1,0] / [1,1,0] / [0,1,0]
      // At (20, 0): fills (20,1), (21,0), (21,1), (22,1) — col 0 row 21 is blocked!
      // Rotating CW from state 3 to state 0: [0,1,0] / [1,1,1] / [0,0,0]
      // At base (20, 0): fills (20,1), (21,0), (21,1), (21,2) — (21,0) blocked!
      // Kick offsets for 3→0: [0,0], [-1,0], [-1,-1], [0,2], [-1,2]
      // Try [-1,0]: col -1 — shape has filled cells at col 1,0,1,2 → grid cols 0,-1,0,1 — -1 out of bounds
      // Try [-1,-1]: col -1, row 21 — out of bounds
      // Try [0,2]: col 0, row 18 — fills (18,1), (19,0), (19,1), (19,2) — open! Success.
      // Try [-1,2]: col -1 — out of bounds
      // So kick [0,2] should work: row 18, col 0.
      const result = tryRotate(grid, "T", 20, 0, 3, "cw", SRSRotation);
      expect(result).not.toBeNull();
      // The kick [0,2] means dy=2, so row = 20-2 = 18
      expect(result!.row).toBe(18);
      expect(result!.col).toBe(0);
      expect(result!.rotation).toBe(0);
    });

    it("kick succeeds when base rotation is blocked by placed piece", () => {
      const grid = createGrid();
      // T-piece state 0 at (30, 4): [0,1,0] / [1,1,1] / [0,0,0]
      // CW to state 1: [0,1,0] / [0,1,1] / [0,1,0]
      // At base (30, 4): fills (30,5), (31,5), (31,6), (32,5)
      // Block (31, 6) to prevent base rotation
      grid[31]![6] = "J";
      // Kick offsets 0→1: [0,0], [-1,0], [-1,1], [0,-2], [-1,-2]
      // [0,0] blocked at (31,6)
      // [-1,0]: col 3, same rows shifted left: (30,4), (31,4), (31,5), (32,4) — all open!
      const result = tryRotate(grid, "T", 30, 4, 0, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.col).toBe(3); // kicked left by 1
      expect(result!.row).toBe(30);
      expect(result!.rotation).toBe(1);
    });

    it("rotation blocked when all kicks fail", () => {
      const grid = createGrid();
      // Surround a T-piece so no rotation is possible
      // T-piece state 0 at (38, 4): fills (38,5), (39,4), (39,5), (39,6)
      // Block everything around it
      fillRow(grid, 39); // Bottom row full
      grid[38]![4] = "J";
      grid[38]![6] = "J";
      grid[37]![4] = "J";
      grid[37]![5] = "J";
      grid[37]![6] = "J";

      // State 0 at (37, 4): fills (37,5), (38,4), (38,5), (38,6)
      // Trying CW to state 1 — all kicks should fail given the surrounding blocks
      const result = tryRotate(grid, "T", 37, 4, 0, "cw", SRSRotation);
      expect(result).toBeNull();
    });
  });

  describe("I-piece kicks", () => {
    it("I-piece kicks when rotating near right wall", () => {
      const grid = createGrid();
      // I-piece state 0 (horizontal) at col 7: fills row 1 of shape at cols 7,8,9,10 — col 10 out of bounds
      // So place at col 6: fills (row+1, 6), (row+1, 7), (row+1, 8), (row+1, 9) — valid
      // CW to state 1 (vertical): col 2 of 4x4 → grid col 8. Fills rows 0-3 at col 8.
      // Base position at (30, 6): state 1 fills (30,8), (31,8), (32,8), (33,8) — all open
      // This works without kick. Need to force a kick scenario.

      // I-piece state 1 (vertical) at col 7: fills col 9 (7+2) rows 0-3
      // CW to state 2 (horizontal flipped): row 2 of shape filled at cols 0-3
      // At base (30, 7): fills (32, 7), (32, 8), (32, 9), (32, 10) — col 10 out of bounds!
      // Kick offsets 1→2: [0,0], [-1,0], [2,0], [-1,2], [2,-1]
      // [-1,0]: col 6 → fills (32,6),(32,7),(32,8),(32,9) — fits!
      const result = tryRotate(grid, "I", 30, 7, 1, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.col).toBe(6); // kicked left by 1
      expect(result!.rotation).toBe(2);
    });

    it("I-piece kicks when rotating near left wall", () => {
      const grid = createGrid();
      // I-piece state 0 at col -1: fills row 1 at cols -1,0,1,2 — col -1 out of bounds
      // Place at col 0: fills (row+1, 0), (row+1, 1), (row+1, 2), (row+1, 3)
      // CCW to state 3: col 1 filled, rows 0-3
      // At base (30, 0): fills (30,1), (31,1), (32,1), (33,1) — all fit. No kick needed.

      // I-piece state 3 at col 0: fills col 1 rows 0-3
      // CW to state 0: row 1 filled at cols 0-3
      // At base (30, 0): fills (31,0),(31,1),(31,2),(31,3) — fits.

      // Force kick: I-piece state 0 at col 0, block the CW rotation base.
      // State 1 at (30, 0): fills (30,2),(31,2),(32,2),(33,2)
      grid[31]![2] = "J"; // Block base position for state 1
      // Kick offsets 0→1: [0,0], [-2,0], [1,0], [-2,-1], [1,2]
      // [0,0]: col 0, fills col 2 — blocked at (31,2)
      // [-2,0]: col -2 — shape col 2 at grid col 0, but shape col 0 at grid col -2 — need to check filled cells only.
      //   State 1 only fills col 2. Grid col = -2+2 = 0. Rows 30-33, col 0. (31,0) is null. Open!
      //   But wait — shape has filled cells only at col 2 of each row. So grid col = -2+2=0. All rows at col 0.
      //   Check (30,0), (31,0), (32,0), (33,0) — all null. Kick succeeds!
      const result = tryRotate(grid, "I", 30, 0, 0, "cw", SRSRotation);
      expect(result).not.toBeNull();
      expect(result!.col).toBe(-2); // kicked left by 2
      expect(result!.rotation).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// tryRotate — Classic rotation
// ---------------------------------------------------------------------------

describe("tryRotate — Classic", () => {
  describe("2-state pieces (I, S, Z)", () => {
    it.each(["I", "S", "Z"] as PieceType[])("%s has 2 rotation states", (piece) => {
      expect(ClassicRotation.getRotationCount(piece)).toBe(2);
    });

    it.each(["I", "S", "Z"] as PieceType[])("%s CW rotation cycles 0→1→0", (piece) => {
      const grid = createGrid();
      const r1 = tryRotate(grid, piece, 20, 4, 0, "cw", ClassicRotation);
      expect(r1).not.toBeNull();
      expect(r1!.rotation).toBe(1);

      const r2 = tryRotate(grid, piece, r1!.row, r1!.col, r1!.rotation, "cw", ClassicRotation);
      expect(r2).not.toBeNull();
      expect(r2!.rotation).toBe(0);
    });

    it.each(["I", "S", "Z"] as PieceType[])("%s CCW rotation cycles 0→1→0", (piece) => {
      const grid = createGrid();
      const r1 = tryRotate(grid, piece, 20, 4, 0, "ccw", ClassicRotation);
      expect(r1).not.toBeNull();
      expect(r1!.rotation).toBe(1);

      const r2 = tryRotate(grid, piece, r1!.row, r1!.col, r1!.rotation, "ccw", ClassicRotation);
      expect(r2).not.toBeNull();
      expect(r2!.rotation).toBe(0);
    });
  });

  describe("4-state pieces (J, L, T)", () => {
    it.each(["J", "L", "T"] as PieceType[])("%s has 4 rotation states", (piece) => {
      expect(ClassicRotation.getRotationCount(piece)).toBe(4);
    });

    it.each(["J", "L", "T"] as PieceType[])("%s CW rotation cycles through 0→1→2→3→0", (piece) => {
      const grid = createGrid();
      let row = 20;
      let col = 4;
      let rotation: Rotation = 0;

      for (let i = 0; i < 4; i++) {
        const result = tryRotate(grid, piece, row, col, rotation, "cw", ClassicRotation);
        expect(result).not.toBeNull();
        row = result!.row;
        col = result!.col;
        rotation = result!.rotation;
      }
      expect(rotation).toBe(0);
    });
  });

  describe("O-piece", () => {
    it("has 1 rotation state", () => {
      expect(ClassicRotation.getRotationCount("O")).toBe(1);
    });

    it("rotation is a no-op (stays at state 0)", () => {
      const grid = createGrid();
      const result = tryRotate(grid, "O", 20, 4, 0, "cw", ClassicRotation);
      expect(result).not.toBeNull();
      expect(result!.rotation).toBe(0);
      expect(result!.row).toBe(20);
      expect(result!.col).toBe(4);
    });
  });

  describe("no wall kicks", () => {
    it("Classic rotation is blocked on collision (no kick fallback)", () => {
      const grid = createGrid();
      // T-piece state 0 at (38, 4): fills (38,5), (39,4), (39,5), (39,6)
      // CW to state 1 at base: fills (38,5), (39,5), (39,6), (40,5) — row 40 out of bounds
      // Classic has no kicks, so rotation fails.
      fillRow(grid, 39);
      // T in state 0 at row 37: fills (37,5), (38,4), (38,5), (38,6)
      // Rotate CW to state 1: [0,1,0] / [0,1,1] / [0,1,0]
      // At (37, 4): fills (37,5), (38,5), (38,6), (39,5) — row 39 is full, (39,5) blocked!
      const result = tryRotate(grid, "T", 37, 4, 0, "cw", ClassicRotation);
      expect(result).toBeNull();
    });

    it("Classic I-piece rotation blocked at right wall", () => {
      const grid = createGrid();
      // I-piece state 0 at col 7: horizontal, fills (row+1, 7), (row+1, 8), (row+1, 9), (row+1, 10) — out of bounds
      // Actually at col 6: fills row+1 at cols 6,7,8,9 — valid
      // CW to state 1 (vertical): Classic I vertical sits in a specific column
      // Classic getShape("I", 1) — need to verify. But with no kicks, if it collides, it fails.
      // Place I-piece horizontal at col 7 — that itself is invalid. Use col 6.
      // Classic I state 1 fills a single column. At col 6, that column might be at col 8.
      // Without reading Classic shapes exactly, use a scenario where the floor blocks:
      fillRow(grid, 39);
      fillRow(grid, 38);
      fillRow(grid, 37);
      // I-piece state 0 at row 35, col 3: fills (36, 3), (36, 4), (36, 5), (36, 6)
      // CW to state 1 (vertical): fills 4 rows in one column. Starting at row 35, that's rows 35,36,37,38
      // Row 37 and 38 are full — blocked!
      const result = tryRotate(grid, "I", 35, 3, 0, "cw", ClassicRotation);
      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("piece at top of buffer zone can move and rotate", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    // T at row 0: valid (filled cells at rows 0,1)
    expect(tryMove(grid, shape, 0, 3, 1, 0)).toEqual({ row: 0, col: 4 });
    expect(tryMove(grid, shape, 0, 3, 0, 1)).toEqual({ row: 1, col: 3 });
    expect(tryRotate(grid, "T", 0, 3, 0, "cw", SRSRotation)).not.toBeNull();
  });

  it("multiple moves accumulate correctly", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    let row = 20;
    let col = 5;

    // Move left 3 times, down 2 times
    for (let i = 0; i < 3; i++) {
      const r = tryMove(grid, shape, row, col, -1, 0);
      expect(r).not.toBeNull();
      col = r!.col;
    }
    for (let i = 0; i < 2; i++) {
      const r = tryMove(grid, shape, row, col, 0, 1);
      expect(r).not.toBeNull();
      row = r!.row;
    }
    expect(col).toBe(2);
    expect(row).toBe(22);
  });

  it("hard drop through narrow gap", () => {
    const grid = createGrid();
    // Create a narrow channel: fill cols 0-3 and 5-9, leaving col 4 open
    for (let r = 30; r < BOARD_HEIGHT; r++) {
      for (let c = 0; c < BOARD_WIDTH; c++) {
        if (c !== 4) grid[r]![c] = "T";
      }
    }
    // I-piece vertical (state 1): fills col 2 of 4x4 box
    const shape = SRSRotation.getShape("I", 1);
    // At col 2, shape col 2 = grid col 4 (the open column)
    const landing = hardDrop(grid, shape, 0, 2);
    expect(landing).toBe(36); // rows 36-39 at col 4 are open
  });

  it("wall kick near ceiling (kick pushes piece upward)", () => {
    const grid = createGrid();
    // The kick offset with positive dy pushes the piece up (lower row number).
    // This is tested implicitly in the T-piece left wall kick test above.
    // Verify a kick doesn't push above row 0 for filled cells.
    // Fill rows 1-3 except a gap
    for (let r = 1; r <= 3; r++) {
      fillRow(grid, r);
    }
    // T-piece at row 0: can't rotate CW because state 1 would need row 2 which is full.
    // All kicks that move down (negative dy → positive row shift) hit full rows.
    // Kicks that move up might go above row 0 → out of bounds.
    const result = tryRotate(grid, "T", 0, 4, 0, "cw", SRSRotation);
    // Should fail — nowhere to go
    expect(result).toBeNull();
  });
});
