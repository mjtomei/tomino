import { PieceType, RotationState, CellOffset, KickOffset } from './pieces.js';

/**
 * Interface for rotation systems. Both SRS and NRS implement this.
 *
 * The movement module calls getShape() to get the cells for a piece in a given
 * rotation state, and getKickOffsets() to get the list of offsets to try when
 * rotating (empty for systems without wall kicks).
 */
export interface RotationSystem {
  /** Get the cell positions for a piece in a given rotation state. */
  getShape(piece: PieceType, state: RotationState): CellOffset[];

  /**
   * Get wall kick offsets to try for a rotation transition.
   * Returns an array of [dx, dy] offsets (positive x = right, positive y = up).
   * The movement module tries each offset in order and uses the first that doesn't collide.
   * Returns an empty array if no kicks are available (NRS, O-piece in SRS).
   */
  getKickOffsets(piece: PieceType, fromState: RotationState, toState: RotationState): KickOffset[];

  /** Get the number of distinct rotation states for a piece in this system. */
  getStateCount(piece: PieceType): number;
}
