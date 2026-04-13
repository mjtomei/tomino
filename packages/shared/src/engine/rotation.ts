/**
 * RotationSystem interface — strategy pattern for piece rotation.
 *
 * Two implementations exist: SRSRotation (modern, wall kicks) and
 * ClassicRotation (classic classic, no wall kicks).
 */

import type { PieceShape, PieceType, Rotation } from "./pieces.js";

/** A wall kick offset: [dx, dy] where +x = right, +y = up. */
export type KickOffset = readonly [dx: number, dy: number];

export interface RotationSystem {
  /** Returns the shape grid for a piece in the given rotation state. */
  getShape(piece: PieceType, rotation: Rotation): PieceShape;

  /**
   * Returns the list of kick offsets to try for a rotation transition.
   * The first entry is always [0, 0] (try the base rotation in place).
   * An empty array means rotation is impossible (shouldn't happen in practice).
   */
  getKickOffsets(
    piece: PieceType,
    fromRotation: Rotation,
    toRotation: Rotation,
  ): readonly KickOffset[];

  /** Number of distinct rotation states for this piece (e.g. 2 for classic-rotation I-piece). */
  getRotationCount(piece: PieceType): number;
}
