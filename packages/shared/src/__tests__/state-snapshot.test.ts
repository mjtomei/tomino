import { describe, it, expect } from "vitest";
import {
  engineStateToSnapshot,
  computeStateDelta,
  applyStateDelta,
} from "../state-snapshot.js";
import type { GameState } from "../engine/engine.js";
import type { GameStateSnapshot } from "../types.js";
import { makeGameState, makePiece } from "../__test-utils__/factories.js";
import { boardFromAscii } from "../__test-utils__/board-builder.js";
import { createRNG } from "../engine/rng.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEngineState(overrides: Partial<GameState> = {}): GameState {
  return {
    status: "playing",
    board: Array.from({ length: 40 }, () => Array(10).fill(null)),
    currentPiece: null,
    ghostRow: null,
    hold: null,
    holdUsed: false,
    queue: [],
    scoring: { score: 0, level: 1, lines: 0, combo: -1, b2b: -1, startLevel: 1 },
    elapsedMs: 0,
    gameMode: "marathon",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// engineStateToSnapshot
// ---------------------------------------------------------------------------

describe("engineStateToSnapshot", () => {
  it("converts basic engine state to snapshot with correct field mapping", () => {
    const engineState = makeEngineState({
      scoring: { score: 1500, level: 3, lines: 12, combo: 2, b2b: 0, startLevel: 1 },
    });

    const snapshot = engineStateToSnapshot(engineState, 42);

    expect(snapshot.tick).toBe(42);
    expect(snapshot.score).toBe(1500);
    expect(snapshot.level).toBe(3);
    expect(snapshot.linesCleared).toBe(12);
    expect(snapshot.isGameOver).toBe(false);
    expect(snapshot.activePiece).toBeNull();
    expect(snapshot.ghostY).toBeNull();
    expect(snapshot.holdPiece).toBeNull();
    expect(snapshot.holdUsed).toBe(false);
    expect(snapshot.pendingGarbage).toEqual([]);
  });

  it("maps ActivePiece {row, col} to PieceState {y, x}", () => {
    const engineState = makeEngineState({
      currentPiece: {
        type: "T",
        row: 18,
        col: 3,
        rotation: 1,
        shape: [[0, 1], [1, 1], [0, 1]],
      },
      ghostRow: 35,
    });

    const snapshot = engineStateToSnapshot(engineState, 10);

    expect(snapshot.activePiece).toEqual({
      type: "T",
      x: 3,
      y: 18,
      rotation: 1,
    });
    expect(snapshot.ghostY).toBe(35);
  });

  it("detects game over from engine status", () => {
    const engineState = makeEngineState({ status: "gameOver" });
    const snapshot = engineStateToSnapshot(engineState, 100);
    expect(snapshot.isGameOver).toBe(true);
  });

  it("maps hold piece and queue", () => {
    const engineState = makeEngineState({
      hold: "I",
      holdUsed: true,
      queue: ["T", "S", "Z", "J", "L"],
    });

    const snapshot = engineStateToSnapshot(engineState, 5);

    expect(snapshot.holdPiece).toBe("I");
    expect(snapshot.holdUsed).toBe(true);
    expect(snapshot.nextQueue).toEqual(["T", "S", "Z", "J", "L"]);
  });
});

// ---------------------------------------------------------------------------
// computeStateDelta
// ---------------------------------------------------------------------------

describe("computeStateDelta", () => {
  it("returns all fields when prev is null (first snapshot)", () => {
    const snapshot = makeGameState({
      tick: 1,
      activePiece: makePiece("T"),
      score: 100,
      level: 2,
    });

    const delta = computeStateDelta(null, snapshot);

    expect(delta.tick).toBe(1);
    expect(delta.activePiece).toEqual(makePiece("T"));
    expect(delta.score).toBe(100);
    expect(delta.level).toBe(2);
    expect(delta.isGameOver).toBe(false);
  });

  it("returns only tick when nothing changed", () => {
    const snapshot = makeGameState({ tick: 5 });
    const prev = makeGameState({ tick: 4 });

    const delta = computeStateDelta(prev, snapshot);

    expect(delta.tick).toBe(5);
    expect(delta.board).toBeUndefined();
    expect(delta.activePiece).toBeUndefined();
    expect(delta.score).toBeUndefined();
    expect(delta.level).toBeUndefined();
    expect(delta.linesCleared).toBeUndefined();
    expect(delta.isGameOver).toBeUndefined();
  });

  it("includes activePiece when piece moves", () => {
    const prev = makeGameState({
      tick: 1,
      activePiece: makePiece("T", { x: 3, y: 18 }),
    });
    const curr = makeGameState({
      tick: 2,
      activePiece: makePiece("T", { x: 4, y: 18 }),
    });

    const delta = computeStateDelta(prev, curr);

    expect(delta.activePiece).toEqual(makePiece("T", { x: 4, y: 18 }));
  });

  it("includes activePiece as null when piece disappears", () => {
    const prev = makeGameState({
      tick: 1,
      activePiece: makePiece("T"),
    });
    const curr = makeGameState({
      tick: 2,
      activePiece: null,
    });

    const delta = computeStateDelta(prev, curr);

    expect(delta.activePiece).toBeNull();
  });

  it("includes only changed board rows", () => {
    const prevBoard = boardFromAscii(`
..........
..........
XXXXXXXXXX
`);
    const currBoard = boardFromAscii(`
..........
..........
..........
`);

    const prev = makeGameState({ tick: 1, board: prevBoard });
    const curr = makeGameState({ tick: 2, board: currBoard });

    const delta = computeStateDelta(prev, curr);

    expect(delta.board).toBeDefined();
    // Only the changed row should be in the delta
    const changedIndices = Object.keys(delta.board!).map(Number);
    expect(changedIndices.length).toBe(1);
  });

  it("includes score when score changes", () => {
    const prev = makeGameState({ tick: 1, score: 0 });
    const curr = makeGameState({ tick: 2, score: 100 });

    const delta = computeStateDelta(prev, curr);

    expect(delta.score).toBe(100);
    expect(delta.level).toBeUndefined();
  });

  it("includes isGameOver when game ends", () => {
    const prev = makeGameState({ tick: 1, isGameOver: false });
    const curr = makeGameState({ tick: 2, isGameOver: true });

    const delta = computeStateDelta(prev, curr);

    expect(delta.isGameOver).toBe(true);
  });

  it("includes nextQueue when queue changes", () => {
    const prev = makeGameState({ tick: 1, nextQueue: ["T", "S", "Z"] });
    const curr = makeGameState({ tick: 2, nextQueue: ["S", "Z", "J"] });

    const delta = computeStateDelta(prev, curr);

    expect(delta.nextQueue).toEqual(["S", "Z", "J"]);
  });
});

// ---------------------------------------------------------------------------
// applyStateDelta
// ---------------------------------------------------------------------------

describe("applyStateDelta", () => {
  it("reconstructs full snapshot from prev + delta", () => {
    const prev = makeGameState({
      tick: 1,
      activePiece: makePiece("T", { x: 3, y: 18 }),
      score: 100,
      level: 2,
      linesCleared: 5,
    });

    const curr = makeGameState({
      tick: 2,
      activePiece: makePiece("T", { x: 4, y: 18 }),
      score: 200,
      level: 2,
      linesCleared: 5,
    });

    const delta = computeStateDelta(prev, curr);
    const reconstructed = applyStateDelta(prev, delta);

    expect(reconstructed.tick).toBe(curr.tick);
    expect(reconstructed.activePiece).toEqual(curr.activePiece);
    expect(reconstructed.score).toBe(curr.score);
    expect(reconstructed.level).toBe(curr.level);
    expect(reconstructed.linesCleared).toBe(curr.linesCleared);
    expect(reconstructed.isGameOver).toBe(curr.isGameOver);
  });

  it("preserves unchanged fields from prev", () => {
    const prev = makeGameState({
      tick: 1,
      holdPiece: "I",
      holdUsed: true,
      level: 3,
    });

    const delta = { tick: 2, score: 500 };
    const result = applyStateDelta(prev, delta);

    expect(result.holdPiece).toBe("I");
    expect(result.holdUsed).toBe(true);
    expect(result.level).toBe(3);
    expect(result.score).toBe(500);
  });

  it("applies board row changes correctly", () => {
    const prevBoard = boardFromAscii(`
..........
..........
TTTTTTTTTT
`);
    const prev = makeGameState({ tick: 1, board: prevBoard });

    // Delta changes the bottom row to empty
    const emptyRow = Array(10).fill(null);
    const delta = {
      tick: 2,
      board: { [prevBoard.length - 1]: emptyRow },
    };

    const result = applyStateDelta(prev, delta);
    const lastRow = result.board[result.board.length - 1]!;
    expect(lastRow.every((cell) => cell === null)).toBe(true);
  });

  it("round-trips through computeStateDelta and applyStateDelta", () => {
    // Use seeded RNG for deterministic test
    const _rng = createRNG(42);

    const prev = makeGameState({
      tick: 10,
      activePiece: makePiece("S", { x: 5, y: 20 }),
      ghostY: 37,
      score: 3000,
      level: 4,
      linesCleared: 30,
      holdPiece: "I",
      holdUsed: false,
      nextQueue: ["T", "Z", "J"],
    });

    const curr = makeGameState({
      tick: 11,
      activePiece: makePiece("S", { x: 5, y: 21 }),
      ghostY: 37,
      score: 3000,
      level: 4,
      linesCleared: 30,
      holdPiece: "I",
      holdUsed: false,
      nextQueue: ["T", "Z", "J"],
    });

    const delta = computeStateDelta(prev, curr);
    const reconstructed = applyStateDelta(prev, delta);

    expect(reconstructed.tick).toBe(curr.tick);
    expect(reconstructed.activePiece).toEqual(curr.activePiece);
    expect(reconstructed.ghostY).toBe(curr.ghostY);
    expect(reconstructed.score).toBe(curr.score);
    expect(reconstructed.holdPiece).toBe(curr.holdPiece);
    expect(reconstructed.nextQueue).toEqual(curr.nextQueue);
  });
});
