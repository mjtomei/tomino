/**
 * Factory functions for creating test game state objects with sensible defaults.
 */

import type {
  Board,
  GameStateSnapshot,
  GarbageBatch,
  PieceState,
  PieceType,
  Row,
} from "../types.js";
import { BOARD_TOTAL_HEIGHT, BOARD_WIDTH } from "../types.js";

function emptyBoard(): Board {
  return Array.from({ length: BOARD_TOTAL_HEIGHT }, (): Row =>
    Array.from<null>({ length: BOARD_WIDTH }).fill(null),
  );
}

export function makeGameState(
  overrides: Partial<GameStateSnapshot> = {},
): GameStateSnapshot {
  return {
    tick: 0,
    board: emptyBoard(),
    activePiece: null,
    ghostY: null,
    nextQueue: [],
    holdPiece: null,
    holdUsed: false,
    score: 0,
    level: 1,
    linesCleared: 0,
    piecesPlaced: 0,
    pendingGarbage: [],
    isGameOver: false,
    ...overrides,
  };
}

export function makePiece(
  type: PieceType,
  overrides: Partial<Omit<PieceState, "type">> = {},
): PieceState {
  return {
    type,
    x: 3,
    y: 0,
    rotation: 0,
    ...overrides,
  };
}

export function makeGarbageBatch(
  overrides: Partial<GarbageBatch> = {},
): GarbageBatch {
  return {
    lines: 1,
    gapColumn: 0,
    ...overrides,
  };
}
