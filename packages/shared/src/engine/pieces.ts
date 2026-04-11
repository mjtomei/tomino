/**
 * Tetris piece definitions — types, shapes, and constants shared by all
 * rotation systems.
 */

/** The seven standard Tetris piece types. */
export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

/** Rotation state index: 0 = spawn, 1 = CW, 2 = 180°, 3 = CCW. */
export type Rotation = 0 | 1 | 2 | 3;

/**
 * A piece shape as a 2D grid of 0s and 1s.
 * Row-major, top-down: `shape[row][col]`.
 * 1 = filled cell, 0 = empty.
 */
export type PieceShape = readonly (readonly number[])[];

/** All seven piece types in standard order. */
export const ALL_PIECES: readonly PieceType[] = [
  "I",
  "O",
  "T",
  "S",
  "Z",
  "J",
  "L",
] as const;

/** All valid rotation values. */
export const ALL_ROTATIONS: readonly Rotation[] = [0, 1, 2, 3] as const;
