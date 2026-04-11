import { PieceType, RotationState, CellOffset, KickOffset } from './pieces.js';
import { RotationSystem } from './rotation.js';

/**
 * NRS (Nintendo Rotation System) — classic NES/Game Boy Tetris rotation.
 *
 * - I, S, Z: 2 rotation states (toggle between 0 and R)
 * - J, L, T: 4 rotation states
 * - O: 1 rotation state (no rotation)
 * - No wall kicks
 * - Right-handed bias (asymmetric pieces favor clockwise orientations)
 */

// --- Shape definitions ---
// NRS uses different spawn orientations than SRS for some pieces

const NRS_I: Record<number, CellOffset[]> = {
  [RotationState.SPAWN]: [[1, 0], [1, 1], [1, 2], [1, 3]],   // horizontal
  [RotationState.R]:     [[0, 2], [1, 2], [2, 2], [3, 2]],   // vertical (right-biased)
};

const NRS_O: Record<number, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 0], [0, 1], [1, 0], [1, 1]],
};

const NRS_T: Record<number, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 1], [1, 0], [1, 1], [1, 2]],   // T pointing up
  [RotationState.R]:     [[0, 1], [1, 1], [1, 2], [2, 1]],   // T pointing right
  [RotationState.TWO]:   [[1, 0], [1, 1], [1, 2], [2, 1]],   // T pointing down
  [RotationState.L]:     [[0, 1], [1, 0], [1, 1], [2, 1]],   // T pointing left
};

const NRS_S: Record<number, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 1], [0, 2], [1, 0], [1, 1]],   // horizontal
  [RotationState.R]:     [[0, 1], [1, 1], [1, 2], [2, 2]],   // vertical (right-biased)
};

const NRS_Z: Record<number, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 0], [0, 1], [1, 1], [1, 2]],   // horizontal
  [RotationState.R]:     [[0, 2], [1, 1], [1, 2], [2, 1]],   // vertical (right-biased)
};

const NRS_J: Record<number, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 0], [1, 0], [1, 1], [1, 2]],   // J pointing up
  [RotationState.R]:     [[0, 1], [0, 2], [1, 1], [2, 1]],   // J pointing right
  [RotationState.TWO]:   [[1, 0], [1, 1], [1, 2], [2, 2]],   // J pointing down
  [RotationState.L]:     [[0, 1], [1, 1], [2, 0], [2, 1]],   // J pointing left
};

const NRS_L: Record<number, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 2], [1, 0], [1, 1], [1, 2]],   // L pointing up
  [RotationState.R]:     [[0, 1], [1, 1], [2, 1], [2, 2]],   // L pointing right
  [RotationState.TWO]:   [[1, 0], [1, 1], [1, 2], [2, 0]],   // L pointing down
  [RotationState.L]:     [[0, 0], [0, 1], [1, 1], [2, 1]],   // L pointing left
};

const NRS_SHAPES: Record<PieceType, Record<number, CellOffset[]>> = {
  [PieceType.I]: NRS_I,
  [PieceType.O]: NRS_O,
  [PieceType.T]: NRS_T,
  [PieceType.S]: NRS_S,
  [PieceType.Z]: NRS_Z,
  [PieceType.J]: NRS_J,
  [PieceType.L]: NRS_L,
};

const STATE_COUNTS: Record<PieceType, number> = {
  [PieceType.I]: 2,
  [PieceType.O]: 1,
  [PieceType.T]: 4,
  [PieceType.S]: 2,
  [PieceType.Z]: 2,
  [PieceType.J]: 4,
  [PieceType.L]: 4,
};

export class NRSRotation implements RotationSystem {
  getShape(piece: PieceType, state: RotationState): CellOffset[] {
    const stateCount = STATE_COUNTS[piece];
    // Wrap the state to the valid range for this piece
    const effectiveState = state % stateCount;
    return NRS_SHAPES[piece][effectiveState];
  }

  getKickOffsets(_piece: PieceType, _fromState: RotationState, _toState: RotationState): KickOffset[] {
    return [];
  }

  getStateCount(piece: PieceType): number {
    return STATE_COUNTS[piece];
  }
}
