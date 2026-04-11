import { describe, expect, it } from "vitest";

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  createGrid,
  type Cell,
  type Grid,
} from "./board.js";
import { baseGarbage, comboGarbage } from "./garbage-table.js";
import { GARBAGE_CELL_TYPE } from "./garbage-types.js";
import type { GarbageCalcInput } from "./garbage-types.js";
import { calculateGarbage, insertGarbage, insertGarbageBatches } from "./garbage.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill an entire row with a piece type. */
function fillRow(grid: Grid, row: number, pieceType: Cell = "T"): void {
  for (let c = 0; c < BOARD_WIDTH; c++) {
    grid[row]![c] = pieceType;
  }
}

/** Count non-null cells in a single row. */
function filledCellsInRow(grid: Grid, row: number): number {
  return grid[row]!.filter((c) => c !== null).length;
}

/** Create a GarbageCalcInput with defaults. */
function input(
  overrides: Partial<GarbageCalcInput> = {},
): GarbageCalcInput {
  return {
    linesCleared: 0,
    tSpin: "none",
    combo: -1,
    b2b: -1,
    ...overrides,
  };
}

// ===========================================================================
// Garbage sent calculation
// ===========================================================================

describe("calculateGarbage", () => {
  // -------------------------------------------------------------------------
  // Base line clear garbage
  // -------------------------------------------------------------------------

  describe("base line clear garbage", () => {
    it("sends 0 garbage for a single", () => {
      const result = calculateGarbage(input({ linesCleared: 1 }));
      expect(result.total).toBe(0);
      expect(result.base).toBe(0);
    });

    it("sends 1 garbage for a double", () => {
      const result = calculateGarbage(input({ linesCleared: 2 }));
      expect(result.total).toBe(1);
      expect(result.base).toBe(1);
    });

    it("sends 2 garbage for a triple", () => {
      const result = calculateGarbage(input({ linesCleared: 3 }));
      expect(result.total).toBe(2);
      expect(result.base).toBe(2);
    });

    it("sends 4 garbage for a Tetris", () => {
      const result = calculateGarbage(input({ linesCleared: 4 }));
      expect(result.total).toBe(4);
      expect(result.base).toBe(4);
    });

    it("sends 0 garbage for 0 lines cleared", () => {
      const result = calculateGarbage(input({ linesCleared: 0 }));
      expect(result.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // T-spin garbage
  // -------------------------------------------------------------------------

  describe("T-spin garbage", () => {
    it("sends 2 garbage for a T-spin single", () => {
      const result = calculateGarbage(
        input({ linesCleared: 1, tSpin: "full" }),
      );
      expect(result.base).toBe(2);
      expect(result.total).toBe(2);
    });

    it("sends 4 garbage for a T-spin double", () => {
      const result = calculateGarbage(
        input({ linesCleared: 2, tSpin: "full" }),
      );
      expect(result.base).toBe(4);
      expect(result.total).toBe(4);
    });

    it("sends 6 garbage for a T-spin triple", () => {
      const result = calculateGarbage(
        input({ linesCleared: 3, tSpin: "full" }),
      );
      expect(result.base).toBe(6);
      expect(result.total).toBe(6);
    });

    it("sends 0 garbage for a T-spin with 0 lines", () => {
      const result = calculateGarbage(
        input({ linesCleared: 0, tSpin: "full" }),
      );
      expect(result.total).toBe(0);
    });

    it("sends normal garbage for a mini T-spin single", () => {
      const result = calculateGarbage(
        input({ linesCleared: 1, tSpin: "mini" }),
      );
      // Mini T-spin uses normal line clear table: single = 0
      expect(result.base).toBe(0);
      expect(result.total).toBe(0);
    });

    it("sends normal garbage for a mini T-spin double", () => {
      const result = calculateGarbage(
        input({ linesCleared: 2, tSpin: "mini" }),
      );
      // Mini T-spin uses normal line clear table: double = 1
      expect(result.base).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Back-to-back bonus
  // -------------------------------------------------------------------------

  describe("back-to-back bonus", () => {
    it("adds +1 garbage when b2b > 0", () => {
      const result = calculateGarbage(
        input({ linesCleared: 4, b2b: 1 }),
      );
      expect(result.b2b).toBe(1);
      expect(result.total).toBe(4 + 1); // Tetris + B2B
    });

    it("adds no bonus when b2b is 0 (first difficult clear)", () => {
      const result = calculateGarbage(
        input({ linesCleared: 4, b2b: 0 }),
      );
      expect(result.b2b).toBe(0);
      expect(result.total).toBe(4);
    });

    it("adds no bonus when b2b is -1 (inactive)", () => {
      const result = calculateGarbage(
        input({ linesCleared: 4, b2b: -1 }),
      );
      expect(result.b2b).toBe(0);
      expect(result.total).toBe(4);
    });

    it("adds +1 for back-to-back T-spin", () => {
      const result = calculateGarbage(
        input({ linesCleared: 2, tSpin: "full", b2b: 2 }),
      );
      expect(result.b2b).toBe(1);
      expect(result.total).toBe(4 + 1); // TSD(4) + B2B(1)
    });
  });

  // -------------------------------------------------------------------------
  // Combo garbage
  // -------------------------------------------------------------------------

  describe("combo garbage", () => {
    it("adds 0 combo garbage for combo -1 (inactive)", () => {
      const result = calculateGarbage(
        input({ linesCleared: 2, combo: -1 }),
      );
      expect(result.combo).toBe(0);
    });

    it("adds 0 combo garbage for combo 0 (first clear)", () => {
      const result = calculateGarbage(
        input({ linesCleared: 2, combo: 0 }),
      );
      expect(result.combo).toBe(0);
    });

    it("adds 1 combo garbage for combo 1", () => {
      const result = calculateGarbage(
        input({ linesCleared: 1, combo: 1 }),
      );
      expect(result.combo).toBe(1);
      expect(result.total).toBe(0 + 1); // single(0) + combo(1)
    });

    it("adds 1 combo garbage for combo 2", () => {
      const result = calculateGarbage(
        input({ linesCleared: 1, combo: 2 }),
      );
      expect(result.combo).toBe(1);
    });

    it("adds 2 combo garbage for combo 3", () => {
      const result = calculateGarbage(
        input({ linesCleared: 1, combo: 3 }),
      );
      expect(result.combo).toBe(2);
    });

    it("adds 4 combo garbage for combo 7+", () => {
      const result = calculateGarbage(
        input({ linesCleared: 1, combo: 7 }),
      );
      expect(result.combo).toBe(4);
    });

    it("caps combo garbage for very high combos", () => {
      const result = calculateGarbage(
        input({ linesCleared: 1, combo: 20 }),
      );
      expect(result.combo).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // Combined bonuses
  // -------------------------------------------------------------------------

  describe("combined bonuses", () => {
    it("sums base + combo + b2b", () => {
      // T-spin double (4) + combo 5 (3) + b2b (1) = 8
      const result = calculateGarbage(
        input({ linesCleared: 2, tSpin: "full", combo: 5, b2b: 1 }),
      );
      expect(result.base).toBe(4);
      expect(result.combo).toBe(3);
      expect(result.b2b).toBe(1);
      expect(result.total).toBe(8);
    });
  });
});

// ===========================================================================
// Garbage table helpers
// ===========================================================================

describe("baseGarbage", () => {
  it("returns T-spin garbage for full T-spins", () => {
    expect(baseGarbage(1, "full")).toBe(2);
    expect(baseGarbage(2, "full")).toBe(4);
    expect(baseGarbage(3, "full")).toBe(6);
  });

  it("returns normal garbage for mini T-spins", () => {
    expect(baseGarbage(1, "mini")).toBe(0);
    expect(baseGarbage(2, "mini")).toBe(1);
  });

  it("returns normal garbage for no T-spin", () => {
    expect(baseGarbage(1, "none")).toBe(0);
    expect(baseGarbage(4, "none")).toBe(4);
  });
});

describe("comboGarbage", () => {
  it("returns 0 for inactive combo", () => {
    expect(comboGarbage(-1)).toBe(0);
  });

  it("follows the escalating combo table", () => {
    expect(comboGarbage(0)).toBe(0);
    expect(comboGarbage(1)).toBe(1);
    expect(comboGarbage(2)).toBe(1);
    expect(comboGarbage(3)).toBe(2);
    expect(comboGarbage(4)).toBe(2);
    expect(comboGarbage(5)).toBe(3);
    expect(comboGarbage(6)).toBe(3);
    expect(comboGarbage(7)).toBe(4);
  });

  it("caps at 4 for combos beyond 7", () => {
    expect(comboGarbage(10)).toBe(4);
    expect(comboGarbage(100)).toBe(4);
  });
});

// ===========================================================================
// Garbage row insertion
// ===========================================================================

describe("insertGarbage", () => {
  it("inserts garbage rows at the bottom of an empty board", () => {
    const grid = createGrid();
    insertGarbage(grid, { lines: 3, gapColumn: 4 });

    expect(grid).toHaveLength(BOARD_HEIGHT);

    // Bottom 3 rows should be garbage
    for (let r = BOARD_HEIGHT - 3; r < BOARD_HEIGHT; r++) {
      expect(filledCellsInRow(grid, r)).toBe(BOARD_WIDTH - 1);
      expect(grid[r]![4]).toBeNull(); // gap at column 4
    }

    // Row above garbage should be empty
    expect(filledCellsInRow(grid, BOARD_HEIGHT - 4)).toBe(0);
  });

  it("pushes existing rows up", () => {
    const grid = createGrid();
    // Place a marker at the bottom row
    grid[BOARD_HEIGHT - 1]![0] = "T";

    insertGarbage(grid, { lines: 2, gapColumn: 0 });

    expect(grid).toHaveLength(BOARD_HEIGHT);
    // Marker should have moved up by 2
    expect(grid[BOARD_HEIGHT - 3]![0]).toBe("T");
    // Bottom 2 rows are garbage
    expect(grid[BOARD_HEIGHT - 1]![0]).toBeNull(); // gap at column 0
    expect(grid[BOARD_HEIGHT - 1]![1]).toBe(GARBAGE_CELL_TYPE);
  });

  it("discards rows that overflow above the buffer zone", () => {
    const grid = createGrid();
    // Fill the top row
    fillRow(grid, 0, "I");

    insertGarbage(grid, { lines: 2, gapColumn: 5 });

    expect(grid).toHaveLength(BOARD_HEIGHT);
    // Top row content is gone (pushed off)
    expect(filledCellsInRow(grid, 0)).toBe(0);
  });

  it("handles inserting 0 garbage lines", () => {
    const grid = createGrid();
    grid[BOARD_HEIGHT - 1]![0] = "L";

    insertGarbage(grid, { lines: 0, gapColumn: 0 });

    expect(grid).toHaveLength(BOARD_HEIGHT);
    expect(grid[BOARD_HEIGHT - 1]![0]).toBe("L"); // unchanged
  });

  it("places gap at column 0 (left edge)", () => {
    const grid = createGrid();
    insertGarbage(grid, { lines: 1, gapColumn: 0 });

    const bottomRow = grid[BOARD_HEIGHT - 1]!;
    expect(bottomRow[0]).toBeNull();
    for (let c = 1; c < BOARD_WIDTH; c++) {
      expect(bottomRow[c]).toBe(GARBAGE_CELL_TYPE);
    }
  });

  it("places gap at column 9 (right edge)", () => {
    const grid = createGrid();
    insertGarbage(grid, { lines: 1, gapColumn: 9 });

    const bottomRow = grid[BOARD_HEIGHT - 1]!;
    expect(bottomRow[9]).toBeNull();
    for (let c = 0; c < BOARD_WIDTH - 1; c++) {
      expect(bottomRow[c]).toBe(GARBAGE_CELL_TYPE);
    }
  });

  it("fills garbage cells with GARBAGE_CELL_TYPE", () => {
    const grid = createGrid();
    insertGarbage(grid, { lines: 1, gapColumn: 3 });

    const bottomRow = grid[BOARD_HEIGHT - 1]!;
    for (let c = 0; c < BOARD_WIDTH; c++) {
      if (c === 3) {
        expect(bottomRow[c]).toBeNull();
      } else {
        expect(bottomRow[c]).toBe(GARBAGE_CELL_TYPE);
      }
    }
  });
});

describe("insertGarbageBatches", () => {
  it("inserts multiple batches with different gap columns", () => {
    const grid = createGrid();
    insertGarbageBatches(grid, [
      { lines: 2, gapColumn: 1 },
      { lines: 1, gapColumn: 8 },
    ]);

    expect(grid).toHaveLength(BOARD_HEIGHT);

    // Bottom row: second batch (gap at 8)
    expect(grid[BOARD_HEIGHT - 1]![8]).toBeNull();
    expect(grid[BOARD_HEIGHT - 1]![1]).toBe(GARBAGE_CELL_TYPE);

    // Rows above: first batch (gap at 1), pushed up by 1
    expect(grid[BOARD_HEIGHT - 2]![1]).toBeNull();
    expect(grid[BOARD_HEIGHT - 3]![1]).toBeNull();
  });

  it("handles board overflow from large garbage insertion", () => {
    const grid = createGrid();
    // Place content near the top
    fillRow(grid, 2, "J");

    // Insert enough garbage to push it off
    insertGarbageBatches(grid, [
      { lines: 20, gapColumn: 0 },
      { lines: 20, gapColumn: 5 },
    ]);

    expect(grid).toHaveLength(BOARD_HEIGHT);
    // All original content should be gone
    // Bottom 20 rows: second batch (gap at 5)
    for (let r = BOARD_HEIGHT - 20; r < BOARD_HEIGHT; r++) {
      expect(grid[r]![5]).toBeNull();
      expect(grid[r]![0]).toBe(GARBAGE_CELL_TYPE);
    }
    // Next 20 rows up: first batch (gap at 0)
    for (let r = 0; r < 20; r++) {
      expect(grid[r]![0]).toBeNull();
      expect(grid[r]![5]).toBe(GARBAGE_CELL_TYPE);
    }
  });
});
