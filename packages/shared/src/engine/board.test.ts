import { describe, expect, it } from "vitest";

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BUFFER_HEIGHT,
  VISIBLE_HEIGHT,
  type Cell,
  type Grid,
  clearLines,
  createGrid,
  findCompletedRows,
  placePiece,
} from "./board.js";
import type { PieceShape } from "./pieces.js";
import { SRSRotation } from "./rotation-srs.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill an entire row with a piece type. */
function fillRow(grid: Grid, row: number, pieceType: Cell = "T"): void {
  for (let c = 0; c < BOARD_WIDTH; c++) {
    grid[row]![c] = pieceType;
  }
}

/** Count non-null cells in the grid. */
function countFilledCells(grid: Grid): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== null) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Empty board initialization
// ---------------------------------------------------------------------------

describe("createGrid", () => {
  it("creates a 40-row by 10-column grid", () => {
    const grid = createGrid();
    expect(grid.length).toBe(BOARD_HEIGHT);
    for (const row of grid) {
      expect(row.length).toBe(BOARD_WIDTH);
    }
  });

  it("all cells are null", () => {
    const grid = createGrid();
    expect(countFilledCells(grid)).toBe(0);
  });

  it("has correct dimension constants", () => {
    expect(BOARD_HEIGHT).toBe(40);
    expect(BOARD_WIDTH).toBe(10);
    expect(VISIBLE_HEIGHT).toBe(20);
    expect(BUFFER_HEIGHT).toBe(20);
  });

  it("rows are independent (not shared references)", () => {
    const grid = createGrid();
    grid[0]![0] = "I";
    expect(grid[1]![0]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Placing a piece
// ---------------------------------------------------------------------------

describe("placePiece", () => {
  it("places a T-piece in spawn orientation", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    // Place at row 20, col 3 (visible zone, left-center)
    placePiece(grid, shape, "T", 20, 3);

    // T-piece spawn shape:
    // [0, 1, 0]
    // [1, 1, 1]
    // [0, 0, 0]
    expect(grid[20]![3]).toBeNull();
    expect(grid[20]![4]).toBe("T");
    expect(grid[20]![5]).toBeNull();
    expect(grid[21]![3]).toBe("T");
    expect(grid[21]![4]).toBe("T");
    expect(grid[21]![5]).toBe("T");
    expect(grid[22]![3]).toBeNull();
    expect(grid[22]![4]).toBeNull();
    expect(grid[22]![5]).toBeNull();
    expect(countFilledCells(grid)).toBe(4);
  });

  it("places an I-piece horizontally", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("I", 0);
    placePiece(grid, shape, "I", 36, 3);

    // I-piece spawn: row 1 of 4x4 has [1,1,1,1]
    expect(grid[37]![3]).toBe("I");
    expect(grid[37]![4]).toBe("I");
    expect(grid[37]![5]).toBe("I");
    expect(grid[37]![6]).toBe("I");
    expect(countFilledCells(grid)).toBe(4);
  });

  it("places an O-piece", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("O", 0);
    placePiece(grid, shape, "O", 38, 4);

    expect(grid[38]![4]).toBe("O");
    expect(grid[38]![5]).toBe("O");
    expect(grid[39]![4]).toBe("O");
    expect(grid[39]![5]).toBe("O");
    expect(countFilledCells(grid)).toBe(4);
  });

  it("writes the correct piece type into cells", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("S", 0);
    placePiece(grid, shape, "S", 30, 0);

    // S-piece spawn: [0,1,1] / [1,1,0] / [0,0,0]
    expect(grid[30]![1]).toBe("S");
    expect(grid[30]![2]).toBe("S");
    expect(grid[31]![0]).toBe("S");
    expect(grid[31]![1]).toBe("S");
  });

  it("does not overwrite existing cells with empty shape cells", () => {
    const grid = createGrid();
    grid[30]![3] = "J";

    const shape = SRSRotation.getShape("T", 0);
    // T-piece at (30, 3): shape[0][0] = 0, so grid[30][3] should keep "J"
    placePiece(grid, shape, "T", 30, 3);

    expect(grid[30]![3]).toBe("J"); // Not overwritten by the 0 in shape
    expect(grid[30]![4]).toBe("T"); // Filled by shape[0][1] = 1
  });

  it("can place a piece in the buffer zone", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("I", 0);
    placePiece(grid, shape, "I", 0, 3);

    // Row 1 of the I-piece shape has the filled cells
    expect(grid[1]![3]).toBe("I");
    expect(grid[1]![4]).toBe("I");
    expect(grid[1]![5]).toBe("I");
    expect(grid[1]![6]).toBe("I");
  });

  it("can place a piece straddling buffer and visible zones", () => {
    const grid = createGrid();
    const shape = SRSRotation.getShape("T", 0);
    // Row 19 is last buffer row, 20 is first visible row
    placePiece(grid, shape, "T", 19, 3);

    expect(grid[19]![4]).toBe("T"); // buffer zone
    expect(grid[20]![3]).toBe("T"); // visible zone
    expect(grid[20]![4]).toBe("T"); // visible zone
    expect(grid[20]![5]).toBe("T"); // visible zone
  });
});

// ---------------------------------------------------------------------------
// Detecting full rows
// ---------------------------------------------------------------------------

describe("findCompletedRows", () => {
  it("returns empty array for an empty board", () => {
    const grid = createGrid();
    expect(findCompletedRows(grid)).toEqual([]);
  });

  it("detects a single full row", () => {
    const grid = createGrid();
    fillRow(grid, 39);
    expect(findCompletedRows(grid)).toEqual([39]);
  });

  it("detects multiple full rows", () => {
    const grid = createGrid();
    fillRow(grid, 37);
    fillRow(grid, 39);
    expect(findCompletedRows(grid)).toEqual([37, 39]);
  });

  it("does not detect a row with one empty cell", () => {
    const grid = createGrid();
    fillRow(grid, 39);
    grid[39]![5] = null; // punch a hole
    expect(findCompletedRows(grid)).toEqual([]);
  });

  it("detects a full row in the buffer zone", () => {
    const grid = createGrid();
    fillRow(grid, 5);
    expect(findCompletedRows(grid)).toEqual([5]);
  });

  it("detects four full rows (Tetris)", () => {
    const grid = createGrid();
    fillRow(grid, 36);
    fillRow(grid, 37);
    fillRow(grid, 38);
    fillRow(grid, 39);
    expect(findCompletedRows(grid)).toEqual([36, 37, 38, 39]);
  });
});

// ---------------------------------------------------------------------------
// Clearing lines
// ---------------------------------------------------------------------------

describe("clearLines", () => {
  it("returns 0 on an empty board", () => {
    const grid = createGrid();
    expect(clearLines(grid)).toBe(0);
    expect(grid.length).toBe(BOARD_HEIGHT);
  });

  it("clears a single line and shifts rows down", () => {
    const grid = createGrid();
    // Place a marker above the line to clear
    grid[38]![0] = "J";
    fillRow(grid, 39);

    const cleared = clearLines(grid);
    expect(cleared).toBe(1);
    expect(grid.length).toBe(BOARD_HEIGHT);

    // The marker should have shifted down from row 38 to row 39
    expect(grid[39]![0]).toBe("J");
    // Row 0 should be a new empty row
    expect(grid[0]!.every((c) => c === null)).toBe(true);
  });

  it("clears a double", () => {
    const grid = createGrid();
    grid[37]![2] = "L";
    fillRow(grid, 38);
    fillRow(grid, 39);

    const cleared = clearLines(grid);
    expect(cleared).toBe(2);
    expect(grid.length).toBe(BOARD_HEIGHT);
    expect(grid[39]![2]).toBe("L");
  });

  it("clears a triple", () => {
    const grid = createGrid();
    grid[36]![4] = "S";
    fillRow(grid, 37);
    fillRow(grid, 38);
    fillRow(grid, 39);

    const cleared = clearLines(grid);
    expect(cleared).toBe(3);
    expect(grid.length).toBe(BOARD_HEIGHT);
    expect(grid[39]![4]).toBe("S");
  });

  it("clears a Tetris (4 lines)", () => {
    const grid = createGrid();
    grid[35]![7] = "I";
    fillRow(grid, 36);
    fillRow(grid, 37);
    fillRow(grid, 38);
    fillRow(grid, 39);

    const cleared = clearLines(grid);
    expect(cleared).toBe(4);
    expect(grid.length).toBe(BOARD_HEIGHT);
    expect(grid[39]![7]).toBe("I");
    // Top 4 rows should be new empties
    for (let r = 0; r < 4; r++) {
      expect(grid[r]!.every((c) => c === null)).toBe(true);
    }
  });

  it("clears non-contiguous lines correctly", () => {
    const grid = createGrid();
    // Fill rows 36 and 38 (skip 37)
    fillRow(grid, 36);
    grid[37]![0] = "Z"; // partial row — should survive
    fillRow(grid, 38);
    grid[39]![3] = "T"; // partial row — should survive

    const cleared = clearLines(grid);
    expect(cleared).toBe(2);
    expect(grid.length).toBe(BOARD_HEIGHT);

    // Row 37 had "Z" at col 0, shifted down by 1 (one clear below it at 38)
    // Row 39 had "T" at col 3, shifted down by 0 (no clears below it)
    // After clearing rows 36 and 38:
    // - Row 39 (was 37): "Z" at col 0
    // - Row 38 was cleared, so 37 shifts to 39... let me think through this:
    //
    // Original: row 36=full, 37=partial(Z), 38=full, 39=partial(T)
    // Remove rows 36 and 38: remaining order top-to-bottom is [..., 37, 39]
    // After prepending 2 empties: new rows 0,1 are empty, old 37->row 38, old 39->row 39
    expect(grid[38]![0]).toBe("Z");
    expect(grid[39]![3]).toBe("T");
  });

  it("clears a line in the buffer zone", () => {
    const grid = createGrid();
    fillRow(grid, 5); // buffer zone row
    grid[6]![0] = "J";

    const cleared = clearLines(grid);
    expect(cleared).toBe(1);
    expect(grid.length).toBe(BOARD_HEIGHT);
    // Marker at row 6 should shift to row 6 (it was below the cleared row)
    expect(grid[6]![0]).toBe("J");
    expect(grid[5]!.every((c) => c === null)).toBe(true);
  });

  it("preserves grid dimensions after multiple clear operations", () => {
    const grid = createGrid();

    fillRow(grid, 39);
    clearLines(grid);
    expect(grid.length).toBe(BOARD_HEIGHT);

    fillRow(grid, 39);
    fillRow(grid, 38);
    clearLines(grid);
    expect(grid.length).toBe(BOARD_HEIGHT);

    for (const row of grid) {
      expect(row.length).toBe(BOARD_WIDTH);
    }
  });

  it("new rows inserted at top are independent", () => {
    const grid = createGrid();
    fillRow(grid, 39);
    clearLines(grid);

    // Modify newly inserted row 0
    grid[0]![0] = "I";
    // Row 1 should be unaffected
    expect(grid[1]![0]).toBeNull();
  });
});
