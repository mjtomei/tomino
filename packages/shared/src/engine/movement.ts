/**
 * Piece movement, rotation, and wall kicks.
 *
 * Pure functions that check collision and return new positions without
 * mutating the grid. The caller decides whether to apply the result.
 *
 * Coordinate conventions:
 * - Grid: row increases downward, col increases rightward.
 * - KickOffset: +x = right (col), +y = up (opposite of row).
 *   Translation: gridCol = col + dx, gridRow = row - dy.
 */

import type { PieceShape, PieceType, Rotation } from "./pieces.js";
import type { Grid } from "./board.js";
import { BOARD_HEIGHT, BOARD_WIDTH } from "./board.js";
import type { RotationSystem } from "./rotation.js";

/** Direction for rotation: clockwise or counter-clockwise. */
export type RotationDirection = "cw" | "ccw";

/** Result of a successful rotation attempt. */
export interface RotateResult {
  readonly row: number;
  readonly col: number;
  readonly rotation: Rotation;
}

/**
 * Check whether a piece shape at (row, col) collides with the board
 * boundaries or any placed cells in the grid.
 *
 * Only filled cells (value = 1) in the shape are checked.
 */
export function collides(
  grid: Grid,
  shape: PieceShape,
  row: number,
  col: number,
): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r]!.length; c++) {
      if (!shape[r]![c]) continue;

      const gridRow = row + r;
      const gridCol = col + c;

      // Out of bounds
      if (gridRow < 0 || gridRow >= BOARD_HEIGHT) return true;
      if (gridCol < 0 || gridCol >= BOARD_WIDTH) return true;

      // Occupied cell
      if (grid[gridRow]![gridCol] !== null) return true;
    }
  }
  return false;
}

/**
 * Attempt to move a piece by (dx, dy) in grid coordinates.
 *
 * @returns The new { row, col } if the move is valid, or null if blocked.
 */
export function tryMove(
  grid: Grid,
  shape: PieceShape,
  row: number,
  col: number,
  dx: number,
  dy: number,
): { row: number; col: number } | null {
  const newRow = row + dy;
  const newCol = col + dx;
  if (collides(grid, shape, newRow, newCol)) return null;
  return { row: newRow, col: newCol };
}

/**
 * Attempt to rotate a piece, trying wall kick offsets in order.
 *
 * @param direction - "cw" for clockwise, "ccw" for counter-clockwise.
 * @returns The new position and rotation if any kick succeeds, or null.
 */
export function tryRotate(
  grid: Grid,
  piece: PieceType,
  row: number,
  col: number,
  fromRotation: Rotation,
  direction: RotationDirection,
  rotationSystem: RotationSystem,
): RotateResult | null {
  const count = rotationSystem.getRotationCount(piece);
  const delta = direction === "cw" ? 1 : -1;
  const toRotation = (((fromRotation + delta) % count) + count) % count as Rotation;

  const newShape = rotationSystem.getShape(piece, toRotation);
  const kicks = rotationSystem.getKickOffsets(piece, fromRotation, toRotation);

  for (const [dx, dy] of kicks) {
    // KickOffset: +x = right (col), +y = up (negative row direction)
    const kickRow = row - dy;
    const kickCol = col + dx;

    if (!collides(grid, newShape, kickRow, kickCol)) {
      return { row: kickRow, col: kickCol, rotation: toRotation };
    }
  }

  return null;
}

/**
 * Find the lowest row a piece can drop to from its current position.
 *
 * @returns The row where the piece would land (for hard drop or ghost piece).
 */
export function hardDrop(
  grid: Grid,
  shape: PieceShape,
  row: number,
  col: number,
): number {
  let landingRow = row;
  while (!collides(grid, shape, landingRow + 1, col)) {
    landingRow++;
  }
  return landingRow;
}
