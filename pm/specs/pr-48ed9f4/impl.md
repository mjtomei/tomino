# Implementation Spec: Piece definitions for SRS and NRS rotation systems

## Requirements

### 1. Piece definitions (`packages/shared/src/engine/pieces.ts`)

Define the 7 standard Tetris pieces (I, O, T, S, Z, J, L) with:
- A `PieceType` union type: `"I" | "O" | "T" | "S" | "Z" | "J" | "L"`
- A `Rotation` type for rotation state indices: `0 | 1 | 2 | 3` (spawn, CW, 180, CCW)
- A `PieceShape` type: a readonly 2D boolean/number grid representing filled cells
- An `ALL_PIECES` constant listing all 7 piece types

Piece shapes are defined as cell offset arrays or bounding-box grids. Each piece has rotation states defined per rotation system (stored separately in rotation modules).

### 2. Rotation system interface (`packages/shared/src/engine/rotation.ts`)

Define a `RotationSystem` interface with methods:
- `getShape(piece: PieceType, rotation: Rotation): PieceShape` — returns the grid/offsets for a piece in a given rotation state
- `getKickOffsets(piece: PieceType, fromRotation: Rotation, toRotation: Rotation): ReadonlyArray<[number, number]>` — returns wall kick offsets to try for a rotation transition (empty array = no kicks)
- `getRotationCount(piece: PieceType): number` — returns the number of distinct rotation states for a piece (allows NRS to return 2 for I/S/Z, 1 for O)

### 3. SRS rotation system (`packages/shared/src/engine/rotation-srs.ts`)

Implement `SRSRotation` satisfying `RotationSystem`:
- All 7 pieces have 4 rotation states (0, 1, 2, 3)
- Shapes follow the standard SRS definitions (pieces defined in a bounding box)
- Wall kick offset tables:
  - **JLSTZ shared table**: 5 kick offsets per rotation transition (4 transitions × 5 offsets)
  - **I-piece separate table**: 5 kick offsets per rotation transition, different values
  - **O-piece**: no kicks (return `[[0,0]]` or empty after base rotation)
- Kick tables sourced from the Tetris Guideline / SRS specification

### 4. NRS rotation system (`packages/shared/src/engine/rotation-nrs.ts`)

Implement `NRSRotation` satisfying `RotationSystem`:
- **I, S, Z**: 2 rotation states (0 and 1)
- **J, L, T**: 4 rotation states (0, 1, 2, 3)
- **O**: 1 rotation state (no rotation)
- **No wall kicks**: `getKickOffsets` returns only the base offset `[[0,0]]` (try the rotation in place, no alternatives)
- **Right-handed bias**: NRS rotates pieces around a right-biased center point

### 5. Exports via index.ts (`packages/shared/src/index.ts`)

Export new types and implementations so they're accessible from `@tetris/shared`.

### 6. Tests (`packages/shared/src/engine/pieces.test.ts`)

Unit tests covering:
- **SRS**: Each piece has 4 rotation states, shapes are correct (snapshot test recommended), JLSTZ share kick table, I-piece has its own kick table, O-piece has no meaningful kicks
- **NRS**: I/S/Z have 2 states, J/L/T have 4 states, O has 1 state, no kick offsets returned (beyond base `[0,0]`), right-handed bias visible in shapes
- **Interface compliance**: Both `SRSRotation` and `NRSRotation` implement `RotationSystem`
- **Snapshot tests** for rotation tables (per session notes: SRS kick tables are well-defined lookup tables, snapshot catches accidental changes)

## Implicit Requirements

1. **Files go in `packages/shared/src/engine/`** — the PR notes explicitly say to build in `packages/shared`, not `packages/client`, because the server needs these definitions for Plan 2.

2. **Module resolution**: The project uses `"moduleResolution": "nodenext"` — all imports must use `.js` extensions (e.g., `import { ... } from "./pieces.js"`), matching the pattern in existing files like `rulesets.ts`.

3. **No browser dependencies**: The engine must have zero browser dependencies (constraint from the plan). These are pure data and logic modules — no DOM, no `window`.

4. **Serializable piece data**: Per plan constraints, `RuleSet` is plain data. The rotation system implementations are classes/objects with methods (not stored in `RuleSet`), instantiated based on `RuleSet.rotationSystem` field. The piece shape data itself should be plain arrays.

5. **`noUnusedLocals` / `noUnusedParameters`**: tsconfig enforces these — all exports and locals must be used or exported.

6. **`noUncheckedIndexedAccess`**: Array/object index access returns `T | undefined` — code must handle this or use assertions.

7. **Test file pattern**: Tests go in `*.test.ts` files under `src/` (matched by vitest config `src/**/*.test.ts`). The existing test for this module is `rulesets.test.ts` in `src/engine/`.

## Ambiguities

### 1. Piece shape representation format
**Resolution**: Use a 2D grid (array of rows, each row an array of 0/1 values) within a bounding box. For I-piece, 4x4 box; for O-piece, 2x2 (or 3x3 with padding); for others, 3x3 box. This is the standard SRS representation and simplifies collision detection later.

### 2. Coordinate system orientation
**Resolution**: Use row-major top-down (row 0 = top of bounding box). This matches typical array indexing and the board model described in the plan (row 0 = top buffer). `[row][col]` indexing.

### 3. Kick offset format — `[dx, dy]` vs `[col, row]`
**Resolution**: Use `[dx, dy]` where positive dx = right, positive dy = up (matching the standard SRS kick table convention from the Tetris wiki). The engine's movement module (future PR) will translate to board coordinates.

### 4. O-piece kick behavior in SRS
**Resolution**: O-piece in SRS technically has 4 rotation states but the shape is identical in all states. SRS defines specific offset data for O-piece that effectively cancels out any visible rotation. We'll implement this: O-piece returns 4 states (all identical shape) and kick offsets of `[[0,0]]` only (no meaningful kicks).

### 5. NRS rotation state mapping when `getShape` is called with rotation > max
**Resolution**: Wrap using modulo. If I-piece has 2 states and `getShape("I", 2)` is called, return state `2 % 2 = 0`. This allows the engine to always increment rotation without checking bounds. `getRotationCount` lets callers know the true count.

### 6. File naming — `pieces.test.ts` vs separate test files per module
**Resolution**: Use a single `pieces.test.ts` as specified in the task, with `describe` blocks for each module (pieces, SRS, NRS, interface compliance).

## Edge Cases

1. **O-piece rotation in SRS**: All 4 states have identical shape. The SRS offset table for O-piece includes specific offsets that effectively mean "don't move" for all transitions. Must handle correctly — callers may rotate O-piece and expect no visible change.

2. **180-degree rotation**: SRS defines transitions 0→2, 1→3, etc. The kick tables are defined for CW (0→1, 1→2, 2→3, 3→0) and CCW (reverse). 180 rotation is two consecutive CW rotations. The `getKickOffsets` should handle any `fromRotation → toRotation` pair, but the standard tables only define adjacent transitions. **Resolution**: Only define kick offsets for CW and CCW transitions (adjacent states). 180 rotation, if implemented later, will be two sequential rotations at the engine level.

3. **NRS right-handed bias**: S and Z pieces in NRS don't have symmetric rotations — they favor the right side. This must be reflected in the shape definitions. Standard NES Tetris reference shapes should be used.

4. **Piece spawn position**: Not part of this PR — the engine (future PR) handles spawn positioning. Piece definitions only provide shapes relative to their bounding box.

5. **Rotation wrapping**: Rotation 3 → CW → should produce rotation 0. The rotation system must handle this wrap correctly in kick table lookups.
