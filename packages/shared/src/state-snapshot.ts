/**
 * State snapshot utilities: conversion from engine GameState to protocol
 * GameStateSnapshot, and delta compression for bandwidth-efficient broadcasts.
 */

import type {
  Board,
  GameStateSnapshot,
  PieceState,
  PieceType,
  Row,
} from "./types.js";
import type { GameState } from "./engine/engine.js";

// ---------------------------------------------------------------------------
// Engine → Protocol conversion
// ---------------------------------------------------------------------------

/**
 * Convert an engine `GameState` to a protocol `GameStateSnapshot`.
 *
 * The engine and protocol use different field names / shapes for the same data.
 * This function maps between them.
 *
 * @param engineState - The engine's current state (from `TetrisEngine.getState()`)
 * @param tick - Server-managed tick counter
 */
export function engineStateToSnapshot(
  engineState: GameState,
  tick: number,
): GameStateSnapshot {
  let activePiece: PieceState | null = null;
  if (engineState.currentPiece) {
    activePiece = {
      type: engineState.currentPiece.type,
      x: engineState.currentPiece.col,
      y: engineState.currentPiece.row,
      rotation: engineState.currentPiece.rotation,
    };
  }

  return {
    tick,
    board: engineState.board as Board,
    activePiece,
    ghostY: engineState.ghostRow,
    nextQueue: engineState.queue as PieceType[],
    holdPiece: engineState.hold,
    holdUsed: engineState.holdUsed,
    score: engineState.scoring.score,
    level: engineState.scoring.level,
    linesCleared: engineState.scoring.lines,
    pendingGarbage: [],
    isGameOver: engineState.status === "gameOver",
  };
}

// ---------------------------------------------------------------------------
// Delta compression
// ---------------------------------------------------------------------------

/**
 * A delta-compressed snapshot. All fields except `tick` are optional —
 * only fields that changed from the previous snapshot are present.
 *
 * `board` uses a sparse representation: an object mapping row indices to
 * their new contents, rather than the full 40-row array.
 */
export interface StateDelta {
  tick: number;
  board?: Record<number, Row>;
  activePiece?: PieceState | null;
  ghostY?: number | null;
  nextQueue?: PieceType[];
  holdPiece?: PieceType | null;
  holdUsed?: boolean;
  score?: number;
  level?: number;
  linesCleared?: number;
  pendingGarbage?: GameStateSnapshot["pendingGarbage"];
  isGameOver?: boolean;
}

/**
 * Compare two rows for equality.
 */
function rowsEqual(a: Row, b: Row): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Compare two PieceState values for equality.
 */
function piecesEqual(
  a: PieceState | null,
  b: PieceState | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.rotation === b.rotation
  );
}

/**
 * Compare two PieceType arrays for equality.
 */
function queuesEqual(
  a: readonly PieceType[],
  b: readonly PieceType[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Compare two garbage arrays for equality.
 */
function garbageEqual(
  a: GameStateSnapshot["pendingGarbage"],
  b: GameStateSnapshot["pendingGarbage"],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.lines !== b[i]!.lines || a[i]!.gapColumn !== b[i]!.gapColumn)
      return false;
  }
  return true;
}

/**
 * Compute a delta between two snapshots. The `prev` snapshot may be null
 * (first send), in which case all fields are included.
 */
export function computeStateDelta(
  prev: GameStateSnapshot | null,
  curr: GameStateSnapshot,
): StateDelta {
  // First snapshot — include everything
  if (prev === null) {
    const boardDelta: Record<number, Row> = {};
    for (let i = 0; i < curr.board.length; i++) {
      // Only include non-empty rows for first snapshot
      const row = curr.board[i]!;
      if (row.some((cell) => cell !== null)) {
        boardDelta[i] = row;
      }
    }
    return {
      tick: curr.tick,
      board: Object.keys(boardDelta).length > 0 ? boardDelta : undefined,
      activePiece: curr.activePiece,
      ghostY: curr.ghostY,
      nextQueue: curr.nextQueue,
      holdPiece: curr.holdPiece,
      holdUsed: curr.holdUsed,
      score: curr.score,
      level: curr.level,
      linesCleared: curr.linesCleared,
      pendingGarbage:
        curr.pendingGarbage.length > 0 ? curr.pendingGarbage : undefined,
      isGameOver: curr.isGameOver,
    };
  }

  const delta: StateDelta = { tick: curr.tick };

  // Board — sparse row diff
  const changedRows: Record<number, Row> = {};
  let hasChangedRows = false;
  for (let i = 0; i < curr.board.length; i++) {
    if (!rowsEqual(prev.board[i]!, curr.board[i]!)) {
      changedRows[i] = curr.board[i]!;
      hasChangedRows = true;
    }
  }
  if (hasChangedRows) delta.board = changedRows;

  if (!piecesEqual(prev.activePiece, curr.activePiece))
    delta.activePiece = curr.activePiece;

  if (prev.ghostY !== curr.ghostY) delta.ghostY = curr.ghostY;

  if (!queuesEqual(prev.nextQueue, curr.nextQueue))
    delta.nextQueue = curr.nextQueue;

  if (prev.holdPiece !== curr.holdPiece) delta.holdPiece = curr.holdPiece;
  if (prev.holdUsed !== curr.holdUsed) delta.holdUsed = curr.holdUsed;
  if (prev.score !== curr.score) delta.score = curr.score;
  if (prev.level !== curr.level) delta.level = curr.level;
  if (prev.linesCleared !== curr.linesCleared)
    delta.linesCleared = curr.linesCleared;

  if (!garbageEqual(prev.pendingGarbage, curr.pendingGarbage))
    delta.pendingGarbage = curr.pendingGarbage;

  if (prev.isGameOver !== curr.isGameOver) delta.isGameOver = curr.isGameOver;

  return delta;
}

/**
 * Apply a delta to a previous snapshot to reconstruct the current snapshot.
 * Returns a new `GameStateSnapshot` — does not mutate `prev`.
 */
export function applyStateDelta(
  prev: GameStateSnapshot,
  delta: StateDelta,
): GameStateSnapshot {
  // Board: clone previous, overwrite changed rows
  let board: Board;
  if (delta.board) {
    board = prev.board.map((row) => [...row]);
    for (const [idx, row] of Object.entries(delta.board)) {
      board[Number(idx)] = [...row];
    }
  } else {
    board = prev.board.map((row) => [...row]);
  }

  return {
    tick: delta.tick,
    board,
    activePiece:
      delta.activePiece !== undefined ? delta.activePiece : prev.activePiece,
    ghostY: delta.ghostY !== undefined ? delta.ghostY : prev.ghostY,
    nextQueue:
      delta.nextQueue !== undefined ? [...delta.nextQueue] : [...prev.nextQueue],
    holdPiece:
      delta.holdPiece !== undefined ? delta.holdPiece : prev.holdPiece,
    holdUsed: delta.holdUsed !== undefined ? delta.holdUsed : prev.holdUsed,
    score: delta.score !== undefined ? delta.score : prev.score,
    level: delta.level !== undefined ? delta.level : prev.level,
    linesCleared:
      delta.linesCleared !== undefined
        ? delta.linesCleared
        : prev.linesCleared,
    pendingGarbage:
      delta.pendingGarbage !== undefined
        ? [...delta.pendingGarbage]
        : [...prev.pendingGarbage],
    isGameOver:
      delta.isGameOver !== undefined ? delta.isGameOver : prev.isGameOver,
  };
}
