/**
 * Nintendo Rotation System (NRS) — classic NES Tetris rotation.
 *
 * - I, S, Z: 2 rotation states
 * - J, L, T: 4 rotation states
 * - O: 1 rotation state (no rotation)
 * - No wall kicks — only the base [0,0] offset
 * - Right-handed rotation bias
 */

import type { PieceShape, PieceType, Rotation } from "./pieces.js";
import type { KickOffset, RotationSystem } from "./rotation.js";

// ---------------------------------------------------------------------------
// Shape definitions
// ---------------------------------------------------------------------------

// NRS shapes — right-handed bias, classic NES Tetris orientations.

const I_SHAPES: readonly PieceShape[] = [
  // 0 — horizontal (spawn)
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 1 — vertical
  [
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
  ],
];

const O_SHAPES: readonly PieceShape[] = [
  // Single state
  [
    [1, 1],
    [1, 1],
  ],
];

const T_SHAPES: readonly PieceShape[] = [
  // 0 — spawn (T pointing up)
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // 1 — CW (T pointing right)
  [
    [0, 1, 0],
    [0, 1, 1],
    [0, 1, 0],
  ],
  // 2 — 180 (T pointing down)
  [
    [0, 0, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  // 3 — CCW (T pointing left)
  [
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 0],
  ],
];

const S_SHAPES: readonly PieceShape[] = [
  // 0 — horizontal (spawn)
  [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  // 1 — vertical (right-handed bias)
  [
    [0, 1, 0],
    [0, 1, 1],
    [0, 0, 1],
  ],
];

const Z_SHAPES: readonly PieceShape[] = [
  // 0 — horizontal (spawn)
  [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  // 1 — vertical (right-handed bias)
  [
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
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

const NRS_SHAPES: Record<PieceType, readonly PieceShape[]> = {
  I: I_SHAPES,
  O: O_SHAPES,
  T: T_SHAPES,
  S: S_SHAPES,
  Z: Z_SHAPES,
  J: J_SHAPES,
  L: L_SHAPES,
};

const ROTATION_COUNTS: Record<PieceType, number> = {
  I: 2,
  O: 1,
  T: 4,
  S: 2,
  Z: 2,
  J: 4,
  L: 4,
};

// No wall kicks in NRS — only try the base position.
const NO_KICKS: readonly KickOffset[] = [[0, 0]];

// ---------------------------------------------------------------------------
// NRSRotation implementation
// ---------------------------------------------------------------------------

export const NRSRotation: RotationSystem = {
  getShape(piece: PieceType, rotation: Rotation): PieceShape {
    const shapes = NRS_SHAPES[piece];
    const count = ROTATION_COUNTS[piece];
    return shapes[rotation % count]!;
  },

  getKickOffsets(): readonly KickOffset[] {
    return NO_KICKS;
  },

  getRotationCount(piece: PieceType): number {
    return ROTATION_COUNTS[piece];
  },
};
