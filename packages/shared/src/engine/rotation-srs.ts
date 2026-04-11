/**
 * Super Rotation System (SRS) — modern Tetris Guideline rotation.
 *
 * All pieces have 4 rotation states. Wall kick offset tables are used
 * when the base rotation collides. JLSTZ share one kick table, I-piece
 * has its own, and O-piece effectively has no kicks.
 */

import type { PieceShape, PieceType, Rotation } from "./pieces.js";
import type { KickOffset, RotationSystem } from "./rotation.js";

// ---------------------------------------------------------------------------
// Shape definitions — 4 rotation states per piece
// ---------------------------------------------------------------------------

// Shapes are row-major, top-down. 1 = filled, 0 = empty.

const I_SHAPES: readonly PieceShape[] = [
  // 0 — spawn
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 1 — CW
  [
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
  ],
  // 2 — 180
  [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
  ],
  // 3 — CCW
  [
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
  ],
];

const O_SHAPES: readonly PieceShape[] = [
  // All 4 states are identical
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 1],
    [1, 1],
  ],
];

const T_SHAPES: readonly PieceShape[] = [
  // 0 — spawn
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // 1 — CW
  [
    [0, 1, 0],
    [0, 1, 1],
    [0, 1, 0],
  ],
  // 2 — 180
  [
    [0, 0, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  // 3 — CCW
  [
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 0],
  ],
];

const S_SHAPES: readonly PieceShape[] = [
  // 0 — spawn
  [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  // 1 — CW
  [
    [0, 1, 0],
    [0, 1, 1],
    [0, 0, 1],
  ],
  // 2 — 180
  [
    [0, 0, 0],
    [0, 1, 1],
    [1, 1, 0],
  ],
  // 3 — CCW
  [
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
  ],
];

const Z_SHAPES: readonly PieceShape[] = [
  // 0 — spawn
  [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  // 1 — CW
  [
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ],
  // 2 — 180
  [
    [0, 0, 0],
    [1, 1, 0],
    [0, 1, 1],
  ],
  // 3 — CCW
  [
    [0, 1, 0],
    [1, 1, 0],
    [1, 0, 0],
  ],
];

const J_SHAPES: readonly PieceShape[] = [
  // 0 — spawn
  [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // 1 — CW
  [
    [0, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
  ],
  // 2 — 180
  [
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
  ],
  // 3 — CCW
  [
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 0],
  ],
];

const L_SHAPES: readonly PieceShape[] = [
  // 0 — spawn
  [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // 1 — CW
  [
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 1],
  ],
  // 2 — 180
  [
    [0, 0, 0],
    [1, 1, 1],
    [1, 0, 0],
  ],
  // 3 — CCW
  [
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
];

const SRS_SHAPES: Record<PieceType, readonly PieceShape[]> = {
  I: I_SHAPES,
  O: O_SHAPES,
  T: T_SHAPES,
  S: S_SHAPES,
  Z: Z_SHAPES,
  J: J_SHAPES,
  L: L_SHAPES,
};

// ---------------------------------------------------------------------------
// Wall kick offset tables
// ---------------------------------------------------------------------------

// Key format: "fromRotation>toRotation" (e.g. "0>1" = spawn → CW)
// Only adjacent transitions are defined (CW and CCW).
type KickKey = string;

/**
 * JLSTZ wall kick data — shared by J, L, S, T, Z pieces.
 * 5 tests per transition. First test is always (0,0).
 * Source: Tetris Guideline / SRS specification.
 */
const JLSTZ_KICKS: Record<KickKey, readonly KickOffset[]> = {
  "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

/**
 * I-piece wall kick data — separate table from JLSTZ.
 * 5 tests per transition.
 * Source: Tetris Guideline / SRS specification.
 */
const I_KICKS: Record<KickKey, readonly KickOffset[]> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/**
 * O-piece — no meaningful kicks. Only the base (0,0) offset.
 */
const O_KICKS: readonly KickOffset[] = [[0, 0]];

// ---------------------------------------------------------------------------
// SRSRotation implementation
// ---------------------------------------------------------------------------

export const SRSRotation: RotationSystem = {
  getShape(piece: PieceType, rotation: Rotation): PieceShape {
    const shapes = SRS_SHAPES[piece];
    return shapes[rotation % 4]!;
  },

  getKickOffsets(
    piece: PieceType,
    fromRotation: Rotation,
    toRotation: Rotation,
  ): readonly KickOffset[] {
    if (piece === "O") return O_KICKS;

    const key: KickKey = `${fromRotation}>${toRotation}`;
    const table = piece === "I" ? I_KICKS : JLSTZ_KICKS;
    return table[key] ?? O_KICKS;
  },

  getRotationCount(): number {
    return 4;
  },
};
