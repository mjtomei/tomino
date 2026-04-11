# Implementation Spec: Piece Definitions for SRS and NRS Rotation Systems

PR: pr-1d0b36c

## 1. Requirements

### 1.1 Piece Definitions (`src/engine/pieces.ts`)
- Define an enum/type for all 7 Tetris piece types: `I`, `O`, `T`, `S`, `Z`, `J`, `L`
- Each piece has a canonical shape represented as a 2D grid of occupied cells
- Define a `RotationState` enum with values `0` (spawn), `R` (clockwise), `2` (180°), `L` (counter-clockwise)
- Piece shapes are stored as arrays of `[row, col]` offsets relative to a bounding box origin

### 1.2 Rotation System Interface (`src/engine/rotation.ts`)
- Define a `RotationSystem` interface with methods:
  - `getShape(piece, rotationState)` → cell positions for the piece in that rotation
  - `getKickOffsets(piece, fromState, toState)` → array of `[dx, dy]` offsets to try (empty for systems with no kicks)
- Both `SRSRotation` and `NRSRotation` implement this interface

### 1.3 SRS Rotation (`src/engine/rotation-srs.ts`)
- **All 7 pieces have 4 rotation states** (0, R, 2, L)
- Rotation state shapes follow the SRS standard:
  - Pieces defined in a bounding box (3×3 for J/L/S/Z/T, 4×4 for I, 2×2 for O)
  - Each rotation is a distinct shape (not computed by matrix rotation)
- **Wall kick offset tables** (tried in order; first non-colliding offset wins):
  - **JLSTZ shared table**: 5 kick offsets per rotation transition (4 transitions × 5 offsets for CW, same for CCW)
  - **I-piece separate table**: 5 kick offsets per rotation transition, different values from JLSTZ
  - **O-piece**: no kick offsets (empty array — O doesn't move on rotation)
- Kick tables are defined for CW transitions: `0→R`, `R→2`, `2→L`, `L→0` and CCW transitions: `0→L`, `L→2`, `2→R`, `R→0`

### 1.4 NRS Rotation (`src/engine/rotation-nrs.ts`)
- **I, S, Z pieces**: 2 rotation states (toggle between 0 and R)
- **J, L, T pieces**: 4 rotation states (0, R, 2, L)
- **O piece**: 1 rotation state (never rotates)
- **No wall kicks**: `getKickOffsets()` always returns an empty array
- **Right-handed bias**: rotation states for asymmetric pieces use right-handed (clockwise-favoring) orientations as seen in NES Tetris

### 1.5 Tests (`src/engine/pieces.test.ts`)
- **SRS tests**:
  - Each piece has exactly 4 rotation states
  - Shape data is correct for each piece/state (spot-check against known SRS shapes)
  - JLSTZ kick table has entries for all 8 rotation transitions with 5 offsets each
  - I-piece uses its own separate kick table
  - O-piece returns no kick offsets
- **NRS tests**:
  - I/S/Z have exactly 2 rotation states
  - J/L/T have exactly 4 rotation states
  - O has exactly 1 rotation state
  - No kick offsets returned for any piece/transition
- **Interface tests**: Both `SRSRotation` and `NRSRotation` satisfy the `RotationSystem` interface

## 2. Implicit Requirements

- **Project scaffolding**: Since the scaffolding PR (pr-a1cfec0) hasn't landed yet, this PR needs minimal TypeScript + test infrastructure (package.json, tsconfig.json, vitest config) to be self-contained and testable.
- **Downstream compatibility**: The `RotationSystem` interface must support the needs of `src/engine/movement.ts` (pr-ac2a70b), which will call `getShape()` and `getKickOffsets()` and try each offset against collision detection.
- **Piece identity**: Need a `PieceType` enum/union that other modules (board, randomizer, scoring) can import.
- **Coordinate system**: Must establish a consistent coordinate convention (row increases downward, col increases rightward) that the board module will use.
- **Exports**: All types and classes must be properly exported for consumption by downstream PRs.

## 3. Ambiguities

### 3.1 Coordinate representation for piece shapes — **[RESOLVED]**
**Ambiguity**: Should pieces be defined as a 2D boolean grid or as a list of occupied cell offsets?
**Resolution**: Use a list of `[row, col]` offsets relative to the bounding box top-left. This is more compact and easier to work with for collision detection. The bounding box size is implicit from the piece type.

### 3.2 Kick offset sign convention — **[RESOLVED]**
**Ambiguity**: Are kick offsets `(dx, dy)` where positive x is right and positive y is down, or up?
**Resolution**: Use the SRS standard convention: positive x = right, positive y = up. The board module will need to negate y when applying to board coordinates (where row increases downward). This keeps the kick data consistent with published SRS documentation.

### 3.3 NRS rotation direction — **[RESOLVED]**
**Ambiguity**: NRS only supports CW rotation in the original NES game. Should the interface still accept CCW rotation requests?
**Resolution**: The interface supports both CW and CCW rotation requests. For NRS pieces with 2 states, both directions produce the same toggle. For pieces with 4 states, CCW goes in reverse order. This lets the engine treat rotation uniformly regardless of system.

### 3.4 Minimal project setup — **[RESOLVED]**
**Ambiguity**: This PR has no dependencies but the scaffolding PR hasn't landed. How much tooling to include?
**Resolution**: Include minimal package.json with TypeScript and Vitest. Keep it simple — the scaffolding PR will add the full React/Vite setup. This PR only needs enough to compile and test pure TypeScript.

## 4. Edge Cases

### 4.1 O-piece rotation in SRS
The O-piece technically has 4 rotation states in SRS but the shape is identical in all states. The kick table returns empty offsets, so rotation is effectively a no-op. This is correct SRS behavior — the state still advances (matters for some combo systems) even though the visual is unchanged.

### 4.2 180° rotation
The SRS standard doesn't define direct 180° rotation kick tables (0→2, R→L, etc.). The `getKickOffsets()` method should handle this gracefully — either by composing two 90° rotations or by returning no kicks for unsupported transitions. Since downstream movement code will handle 180° rotation if needed, the rotation system should support the transition by returning a reasonable set of kicks or an empty array.
**Resolution**: Only support 90° CW and CCW transitions in the kick tables. If 180° rotation is requested, the movement module should decompose it into two 90° rotations. The rotation system's `getShape()` still returns the correct shape for any state.

### 4.3 NRS spawn orientation
In NES Tetris, pieces spawn in a specific orientation that may differ from SRS spawn orientation. The NRS rotation state `0` must match the NES spawn orientation, not the SRS one.
