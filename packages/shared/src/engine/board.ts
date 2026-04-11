/**
 * Board model — a 10x40 2D grid representing the Tetris playfield.
 *
 * Rows 0–19 are the buffer zone (hidden, used for spawning).
 * Rows 20–39 are the visible playfield (row 39 = bottom).
 *
 * Coordinate convention: row increases downward, col increases rightward.
 * This matches the PieceShape convention in pieces.ts.
 */

import type { PieceShape, PieceType } from "./pieces.js";

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 40;
export const VISIBLE_HEIGHT = 20;
export const BUFFER_HEIGHT = 20;

/** A single cell is either empty (null) or occupied by a piece type. */
export type Cell = PieceType | null;

/** Row-major grid: grid[row][col]. */
export type Grid = Cell[][];

/** Create a new empty row. */
function emptyRow(): Cell[] {
  return Array.from<Cell>({ length: BOARD_WIDTH }).fill(null);
}

/** Create a new empty 10x40 grid. */
export function createGrid(): Grid {
  return Array.from({ length: BOARD_HEIGHT }, () => emptyRow());
}

/**
 * Place a piece on the grid by writing its filled cells.
 *
 * @param grid - The board grid (mutated in place).
 * @param shape - The piece shape to place (from the rotation system).
 * @param pieceType - Which piece type, written into each filled cell.
 * @param row - Row of the shape's top-left corner on the grid.
 * @param col - Column of the shape's top-left corner on the grid.
 */
export function placePiece(
  grid: Grid,
  shape: PieceShape,
  pieceType: PieceType,
  row: number,
  col: number,
): void {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r]!.length; c++) {
      if (shape[r]![c]) {
        grid[row + r]![col + c] = pieceType;
      }
    }
  }
}

/** Check whether a row is completely filled. */
function isRowFull(row: Cell[]): boolean {
  return row.every((cell) => cell !== null);
}

/**
 * Find all completed (full) row indices.
 *
 * @returns Array of row indices that are full, sorted ascending.
 */
export function findCompletedRows(grid: Grid): number[] {
  const completed: number[] = [];
  for (let r = 0; r < BOARD_HEIGHT; r++) {
    if (isRowFull(grid[r]!)) {
      completed.push(r);
    }
  }
  return completed;
}

/**
 * Clear completed lines and shift rows down.
 *
 * Removes all full rows, shifts everything above down, and inserts
 * empty rows at the top to maintain the 40-row height.
 *
 * @param grid - The board grid (mutated in place).
 * @returns The number of lines cleared.
 */
export function clearLines(grid: Grid): number {
  const completed = findCompletedRows(grid);
  if (completed.length === 0) return 0;

  // Remove completed rows (iterate in reverse to preserve indices)
  for (let i = completed.length - 1; i >= 0; i--) {
    grid.splice(completed[i]!, 1);
  }

  // Prepend empty rows at the top
  for (let i = 0; i < completed.length; i++) {
    grid.unshift(emptyRow());
  }

  return completed.length;
}
