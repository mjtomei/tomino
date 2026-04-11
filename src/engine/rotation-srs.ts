import { PieceType, RotationState, CellOffset, KickOffset } from './pieces.js';
import { RotationSystem } from './rotation.js';

/**
 * SRS (Super Rotation System) — the modern Tetris standard.
 *
 * All 7 pieces have 4 rotation states.
 * Wall kick tables: JLSTZ share one table, I has its own, O has no kicks.
 *
 * Shapes are defined per the SRS specification.
 * Bounding boxes: I = 4×4, O = 2×2 (in a 3×3 grid), JLSTZ = 3×3.
 */

// --- Shape definitions ---
// Each piece has shapes for states 0, R, 2, L
// Stored as [row, col] offsets within the bounding box

const I_SHAPES: Record<RotationState, CellOffset[]> = {
  [RotationState.SPAWN]: [[1, 0], [1, 1], [1, 2], [1, 3]],
  [RotationState.R]:     [[0, 2], [1, 2], [2, 2], [3, 2]],
  [RotationState.TWO]:   [[2, 0], [2, 1], [2, 2], [2, 3]],
  [RotationState.L]:     [[0, 1], [1, 1], [2, 1], [3, 1]],
};

const O_SHAPES: Record<RotationState, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 0], [0, 1], [1, 0], [1, 1]],
  [RotationState.R]:     [[0, 0], [0, 1], [1, 0], [1, 1]],
  [RotationState.TWO]:   [[0, 0], [0, 1], [1, 0], [1, 1]],
  [RotationState.L]:     [[0, 0], [0, 1], [1, 0], [1, 1]],
};

const T_SHAPES: Record<RotationState, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 1], [1, 0], [1, 1], [1, 2]],
  [RotationState.R]:     [[0, 1], [1, 1], [1, 2], [2, 1]],
  [RotationState.TWO]:   [[1, 0], [1, 1], [1, 2], [2, 1]],
  [RotationState.L]:     [[0, 1], [1, 0], [1, 1], [2, 1]],
};

const S_SHAPES: Record<RotationState, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 1], [0, 2], [1, 0], [1, 1]],
  [RotationState.R]:     [[0, 1], [1, 1], [1, 2], [2, 2]],
  [RotationState.TWO]:   [[1, 1], [1, 2], [2, 0], [2, 1]],
  [RotationState.L]:     [[0, 0], [1, 0], [1, 1], [2, 1]],
};

const Z_SHAPES: Record<RotationState, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 0], [0, 1], [1, 1], [1, 2]],
  [RotationState.R]:     [[0, 2], [1, 1], [1, 2], [2, 1]],
  [RotationState.TWO]:   [[1, 0], [1, 1], [2, 1], [2, 2]],
  [RotationState.L]:     [[0, 1], [1, 0], [1, 1], [2, 0]],
};

const J_SHAPES: Record<RotationState, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 0], [1, 0], [1, 1], [1, 2]],
  [RotationState.R]:     [[0, 1], [0, 2], [1, 1], [2, 1]],
  [RotationState.TWO]:   [[1, 0], [1, 1], [1, 2], [2, 2]],
  [RotationState.L]:     [[0, 1], [1, 1], [2, 0], [2, 1]],
};

const L_SHAPES: Record<RotationState, CellOffset[]> = {
  [RotationState.SPAWN]: [[0, 2], [1, 0], [1, 1], [1, 2]],
  [RotationState.R]:     [[0, 1], [1, 1], [2, 1], [2, 2]],
  [RotationState.TWO]:   [[1, 0], [1, 1], [1, 2], [2, 0]],
  [RotationState.L]:     [[0, 0], [0, 1], [1, 1], [2, 1]],
};

const SRS_SHAPES: Record<PieceType, Record<RotationState, CellOffset[]>> = {
  [PieceType.I]: I_SHAPES,
  [PieceType.O]: O_SHAPES,
  [PieceType.T]: T_SHAPES,
  [PieceType.S]: S_SHAPES,
  [PieceType.Z]: Z_SHAPES,
  [PieceType.J]: J_SHAPES,
  [PieceType.L]: L_SHAPES,
};

// --- Wall kick offset tables ---
// Key format: "fromState->toState"
// Values: array of [dx, dy] offsets (positive x = right, positive y = up)

type KickKey = `${RotationState}->${RotationState}`;

function kickKey(from: RotationState, to: RotationState): KickKey {
  return `${from}->${to}`;
}

// JLSTZ wall kick data (shared table)
const JLSTZ_KICKS: Partial<Record<KickKey, KickOffset[]>> = {
  // CW rotations
  [kickKey(RotationState.SPAWN, RotationState.R)]:   [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  [kickKey(RotationState.R, RotationState.TWO)]:     [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  [kickKey(RotationState.TWO, RotationState.L)]:     [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  [kickKey(RotationState.L, RotationState.SPAWN)]:   [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  // CCW rotations
  [kickKey(RotationState.SPAWN, RotationState.L)]:   [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  [kickKey(RotationState.L, RotationState.TWO)]:     [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  [kickKey(RotationState.TWO, RotationState.R)]:     [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  [kickKey(RotationState.R, RotationState.SPAWN)]:   [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

// I-piece wall kick data (separate table)
// Reference: SRS standard (tetris.wiki/Super_Rotation_System)
const I_KICKS: Partial<Record<KickKey, KickOffset[]>> = {
  // CW rotations
  [kickKey(RotationState.SPAWN, RotationState.R)]:   [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  [kickKey(RotationState.R, RotationState.TWO)]:     [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  [kickKey(RotationState.TWO, RotationState.L)]:     [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  [kickKey(RotationState.L, RotationState.SPAWN)]:   [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  // CCW rotations
  [kickKey(RotationState.SPAWN, RotationState.L)]:   [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  [kickKey(RotationState.L, RotationState.TWO)]:     [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  [kickKey(RotationState.TWO, RotationState.R)]:     [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  [kickKey(RotationState.R, RotationState.SPAWN)]:   [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
};

export class SRSRotation implements RotationSystem {
  getShape(piece: PieceType, state: RotationState): CellOffset[] {
    return SRS_SHAPES[piece][state];
  }

  getKickOffsets(piece: PieceType, fromState: RotationState, toState: RotationState): KickOffset[] {
    if (piece === PieceType.O) {
      return [];
    }

    const key = kickKey(fromState, toState);
    const table = piece === PieceType.I ? I_KICKS : JLSTZ_KICKS;
    return table[key] ?? [];
  }

  getStateCount(_piece: PieceType): number {
    return 4;
  }
}
