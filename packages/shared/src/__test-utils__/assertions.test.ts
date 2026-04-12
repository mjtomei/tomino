import { describe, expect, it } from "vitest";
import type { PieceType } from "../types.js";
import { BOARD_TOTAL_HEIGHT, BOARD_WIDTH } from "../types.js";
import {
  assertGarbageInserted,
  assertLinesCleared,
  assertPieceLocked,
  assertSpawnedPiece,
} from "./assertions.js";
import { makeGameState, makeGarbageBatch, makePiece } from "./factories.js";

// ---------------------------------------------------------------------------
// assertLinesCleared
// ---------------------------------------------------------------------------

describe("assertLinesCleared", () => {
  it("passes when the line count delta matches", () => {
    const before = makeGameState({ linesCleared: 5 });
    const after = makeGameState({ linesCleared: 9 });
    expect(() => assertLinesCleared(before, after, 4)).not.toThrow();
  });

  it("passes when expected count is zero and no lines were cleared", () => {
    const before = makeGameState({ linesCleared: 3 });
    const after = makeGameState({ linesCleared: 3 });
    expect(() => assertLinesCleared(before, after, 0)).not.toThrow();
  });

  it("throws a descriptive error on mismatch", () => {
    const before = makeGameState({ linesCleared: 2 });
    const after = makeGameState({ linesCleared: 5 });
    expect(() => assertLinesCleared(before, after, 2)).toThrow(
      /Expected 2 lines cleared, but 3 were cleared \(before: 2, after: 5\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// assertPieceLocked
// ---------------------------------------------------------------------------

describe("assertPieceLocked", () => {
  function boardWithCells(
    cells: Array<{ row: number; col: number; type: PieceType }>,
  ) {
    const state = makeGameState();
    for (const { row, col, type } of cells) {
      state.board[row]![col] = type;
    }
    return state;
  }

  it("passes when all expected cells match", () => {
    const cells = [
      { row: 38, col: 3, type: "T" as PieceType },
      { row: 38, col: 4, type: "T" as PieceType },
      { row: 38, col: 5, type: "T" as PieceType },
      { row: 39, col: 4, type: "T" as PieceType },
    ];
    const state = boardWithCells(cells);
    expect(() => assertPieceLocked(state, cells)).not.toThrow();
  });

  it("passes with an empty expectedCells array", () => {
    const state = makeGameState();
    expect(() => assertPieceLocked(state, [])).not.toThrow();
  });

  it("throws when a cell has the wrong type", () => {
    const state = boardWithCells([{ row: 39, col: 0, type: "I" }]);
    expect(() =>
      assertPieceLocked(state, [{ row: 39, col: 0, type: "T" }]),
    ).toThrow(/expected "T", got "I"/);
  });

  it("throws when a cell is empty", () => {
    const state = makeGameState();
    expect(() =>
      assertPieceLocked(state, [{ row: 39, col: 0, type: "T" }]),
    ).toThrow(/expected "T", got empty/);
  });

  it("throws for out-of-bounds cells", () => {
    const state = makeGameState();
    expect(() =>
      assertPieceLocked(state, [{ row: -1, col: 0, type: "T" }]),
    ).toThrow(/out of bounds/);
  });

  it("reports all mismatches in one error", () => {
    const state = makeGameState();
    expect(() =>
      assertPieceLocked(state, [
        { row: 39, col: 0, type: "T" },
        { row: 39, col: 1, type: "T" },
      ]),
    ).toThrow(/2 cell\(s\) don't match/);
  });
});

// ---------------------------------------------------------------------------
// assertGarbageInserted
// ---------------------------------------------------------------------------

describe("assertGarbageInserted", () => {
  /** Build an after-state by simulating garbage insertion on a copy of before. */
  function simulateGarbage(
    before: ReturnType<typeof makeGameState>,
    lines: number,
    gapColumn: number,
  ) {
    const after = makeGameState({
      board: before.board.map((row) => [...row]),
    });
    // Shift rows up
    after.board.splice(0, lines);
    // Add garbage rows at bottom
    for (let i = 0; i < lines; i++) {
      const garbageRow = Array.from<PieceType | null>({
        length: BOARD_WIDTH,
      }).fill("Z");
      garbageRow[gapColumn] = null;
      after.board.push(garbageRow);
    }
    return after;
  }

  it("passes on correct single-line garbage insertion", () => {
    const before = makeGameState();
    const batch = makeGarbageBatch({ lines: 1, gapColumn: 3 });
    const after = simulateGarbage(before, 1, 3);
    expect(() => assertGarbageInserted(before, after, batch)).not.toThrow();
  });

  it("passes on correct multi-line garbage insertion", () => {
    const before = makeGameState();
    const batch = makeGarbageBatch({ lines: 4, gapColumn: 7 });
    const after = simulateGarbage(before, 4, 7);
    expect(() => assertGarbageInserted(before, after, batch)).not.toThrow();
  });

  it("passes when existing board content is correctly shifted up", () => {
    const before = makeGameState();
    // Place some content near the bottom
    before.board[BOARD_TOTAL_HEIGHT - 1]![0] = "I";
    before.board[BOARD_TOTAL_HEIGHT - 1]![1] = "I";

    const batch = makeGarbageBatch({ lines: 2, gapColumn: 5 });
    const after = simulateGarbage(before, 2, 5);
    expect(() => assertGarbageInserted(before, after, batch)).not.toThrow();
  });

  it("throws when gap column is wrong", () => {
    const before = makeGameState();
    const batch = makeGarbageBatch({ lines: 1, gapColumn: 3 });
    // Simulate with wrong gap
    const after = simulateGarbage(before, 1, 5);
    expect(() => assertGarbageInserted(before, after, batch)).toThrow(
      /Garbage insertion assertion failed/,
    );
  });

  it("throws when rows were not shifted correctly", () => {
    const before = makeGameState();
    before.board[BOARD_TOTAL_HEIGHT - 1]![0] = "I";
    const batch = makeGarbageBatch({ lines: 1, gapColumn: 0 });
    // Don't actually shift — just append garbage row
    const after = makeGameState({
      board: before.board.map((row) => [...row]),
    });
    // Overwrite the last row with garbage (no shift)
    const garbageRow = Array.from<PieceType | null>({
      length: BOARD_WIDTH,
    }).fill("Z");
    garbageRow[0] = null;
    after.board[BOARD_TOTAL_HEIGHT - 1] = garbageRow;
    expect(() => assertGarbageInserted(before, after, batch)).toThrow(
      /Shifted row mismatch/,
    );
  });

  it("throws when garbage row has an empty cell that should be filled", () => {
    const before = makeGameState();
    const batch = makeGarbageBatch({ lines: 1, gapColumn: 0 });
    const after = simulateGarbage(before, 1, 0);
    // Clear a non-gap cell in the garbage row
    after.board[BOARD_TOTAL_HEIGHT - 1]![5] = null;
    expect(() => assertGarbageInserted(before, after, batch)).toThrow(
      /expected filled, got empty/,
    );
  });
});

// ---------------------------------------------------------------------------
// assertSpawnedPiece
// ---------------------------------------------------------------------------

describe("assertSpawnedPiece", () => {
  it("passes when active piece matches expected type", () => {
    const state = makeGameState({ activePiece: makePiece("T") });
    expect(() => assertSpawnedPiece(state, "T")).not.toThrow();
  });

  it("throws when no active piece exists", () => {
    const state = makeGameState({ activePiece: null });
    expect(() => assertSpawnedPiece(state, "I")).toThrow(
      /no piece is active/,
    );
  });

  it("throws when active piece type doesn't match", () => {
    const state = makeGameState({ activePiece: makePiece("S") });
    expect(() => assertSpawnedPiece(state, "T")).toThrow(
      /Expected active piece of type "T", got "S"/,
    );
  });
});

// ---------------------------------------------------------------------------
// Composability: lock → clear → garbage → spawn cycle
// ---------------------------------------------------------------------------

describe("composability", () => {
  it("chains multiple assertions for a full lock→clear→garbage→spawn cycle", () => {
    // State 0: before piece lock — bottom row almost full (gap at col 0)
    const state0 = makeGameState({ linesCleared: 0 });
    for (let col = 1; col < BOARD_WIDTH; col++) {
      state0.board[BOARD_TOTAL_HEIGHT - 1]![col] = "Z";
    }

    // State 1: after piece locks and fills the row → 1 line cleared
    // The piece locked at col 0 of the bottom row, completing the line.
    // After clear, the bottom row is gone and everything shifts down.
    const state1 = makeGameState({
      linesCleared: 1,
      activePiece: makePiece("T"),
    });

    // Verify line clear
    assertLinesCleared(state0, state1, 1);

    // State 2: after garbage insertion (1 line, gap at col 4)
    const batch = makeGarbageBatch({ lines: 1, gapColumn: 4 });
    const state2 = makeGameState({
      linesCleared: 1,
      activePiece: makePiece("T"),
    });
    // Simulate garbage on the empty board
    const garbageRow = Array.from<PieceType | null>({
      length: BOARD_WIDTH,
    }).fill("Z");
    garbageRow[4] = null;
    state2.board[BOARD_TOTAL_HEIGHT - 1] = garbageRow;

    // Verify garbage insertion
    assertGarbageInserted(state1, state2, batch);

    // Verify spawned piece persists through the cycle
    assertSpawnedPiece(state2, "T");

    // Verify piece lock on state2 board (the garbage row)
    assertPieceLocked(state2, [
      { row: BOARD_TOTAL_HEIGHT - 1, col: 0, type: "Z" },
      { row: BOARD_TOTAL_HEIGHT - 1, col: 1, type: "Z" },
    ]);
  });
});
