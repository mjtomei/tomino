/**
 * Tetris piece types and rotation state definitions.
 *
 * Coordinate convention:
 * - Pieces are defined as arrays of [row, col] offsets within a bounding box
 * - Row increases downward, col increases rightward
 * - (0,0) is the top-left of the bounding box
 */

export enum PieceType {
  I = 'I',
  O = 'O',
  T = 'T',
  S = 'S',
  Z = 'Z',
  J = 'J',
  L = 'L',
}

export enum RotationState {
  SPAWN = 0, // 0 - spawn state
  R = 1,     // R - clockwise from spawn
  TWO = 2,   // 2 - 180° from spawn
  L = 3,     // L - counter-clockwise from spawn
}

/** [row, col] offset within the piece bounding box */
export type CellOffset = [number, number];

/** [dx, dy] wall kick offset — positive x = right, positive y = up */
export type KickOffset = [number, number];

export const ALL_PIECE_TYPES: PieceType[] = [
  PieceType.I,
  PieceType.O,
  PieceType.T,
  PieceType.S,
  PieceType.Z,
  PieceType.J,
  PieceType.L,
];
