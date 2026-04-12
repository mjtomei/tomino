import { describe, expect, it } from "vitest";
import { BOARD_TOTAL_HEIGHT, BOARD_WIDTH } from "../types.js";
import { makeGameState, makeGarbageBatch, makePiece } from "./factories.js";

describe("makeGameState", () => {
  it("produces valid defaults", () => {
    const state = makeGameState();

    expect(state.tick).toBe(0);
    expect(state.activePiece).toBeNull();
    expect(state.ghostY).toBeNull();
    expect(state.nextQueue).toEqual([]);
    expect(state.holdPiece).toBeNull();
    expect(state.holdUsed).toBe(false);
    expect(state.score).toBe(0);
    expect(state.level).toBe(1);
    expect(state.linesCleared).toBe(0);
    expect(state.pendingGarbage).toEqual([]);
    expect(state.isGameOver).toBe(false);
  });

  it("creates a board with correct dimensions", () => {
    const state = makeGameState();

    expect(state.board).toHaveLength(BOARD_TOTAL_HEIGHT);
    for (const row of state.board) {
      expect(row).toHaveLength(BOARD_WIDTH);
      expect(row.every((cell) => cell === null)).toBe(true);
    }
  });

  it("applies overrides", () => {
    const state = makeGameState({
      tick: 42,
      score: 1000,
      level: 5,
      isGameOver: true,
      holdPiece: "T",
      nextQueue: ["I", "O", "S"],
    });

    expect(state.tick).toBe(42);
    expect(state.score).toBe(1000);
    expect(state.level).toBe(5);
    expect(state.isGameOver).toBe(true);
    expect(state.holdPiece).toBe("T");
    expect(state.nextQueue).toEqual(["I", "O", "S"]);
  });

  it("allows overriding the board", () => {
    const customBoard = [[null, "T", null]];
    const state = makeGameState({ board: customBoard });

    expect(state.board).toBe(customBoard);
  });

  it("produces independent objects (no shared references)", () => {
    const a = makeGameState();
    const b = makeGameState();

    expect(a.board).not.toBe(b.board);
    expect(a.board[0]).not.toBe(b.board[0]);
    expect(a.nextQueue).not.toBe(b.nextQueue);
    expect(a.pendingGarbage).not.toBe(b.pendingGarbage);
  });
});

describe("makePiece", () => {
  it("produces valid defaults for a given type", () => {
    const piece = makePiece("T");

    expect(piece.type).toBe("T");
    expect(piece.x).toBe(3);
    expect(piece.y).toBe(0);
    expect(piece.rotation).toBe(0);
  });

  it("applies overrides without affecting type", () => {
    const piece = makePiece("I", { x: 5, y: 10, rotation: 2 });

    expect(piece.type).toBe("I");
    expect(piece.x).toBe(5);
    expect(piece.y).toBe(10);
    expect(piece.rotation).toBe(2);
  });

  it("produces independent objects", () => {
    const a = makePiece("T");
    const b = makePiece("T");

    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("makeGarbageBatch", () => {
  it("produces valid defaults", () => {
    const batch = makeGarbageBatch();

    expect(batch.lines).toBe(1);
    expect(batch.gapColumn).toBe(0);
  });

  it("applies overrides", () => {
    const batch = makeGarbageBatch({ lines: 4, gapColumn: 7 });

    expect(batch.lines).toBe(4);
    expect(batch.gapColumn).toBe(7);
  });

  it("produces independent objects", () => {
    const a = makeGarbageBatch();
    const b = makeGarbageBatch();

    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("factory composition", () => {
  it("factories compose cleanly", () => {
    const state = makeGameState({
      activePiece: makePiece("T", { x: 4, y: 2 }),
      pendingGarbage: [
        makeGarbageBatch({ lines: 2 }),
        makeGarbageBatch({ lines: 3, gapColumn: 5 }),
      ],
    });

    expect(state.activePiece?.type).toBe("T");
    expect(state.activePiece?.x).toBe(4);
    expect(state.pendingGarbage).toHaveLength(2);
    expect(state.pendingGarbage[0]?.lines).toBe(2);
    expect(state.pendingGarbage[1]?.gapColumn).toBe(5);
  });
});
