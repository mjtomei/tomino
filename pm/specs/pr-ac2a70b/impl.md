# Implementation Spec: Piece Movement, Rotation, and Wall Kicks

PR: pr-ac2a70b
Files: `packages/shared/src/engine/movement.ts`, `packages/shared/src/engine/movement.test.ts`

## Requirements

### R1: Collision Detection

A `collides(grid, shape, row, col)` function that checks whether placing a piece shape at a given grid position would overlap with:
- **Board walls** — any filled cell in the shape falls outside `[0, BOARD_HEIGHT)` rows or `[0, BOARD_WIDTH)` cols.
- **Placed cells** — any filled cell in the shape overlaps a non-null cell in `grid`.

Grounded in: `Grid` type from `board.ts`, `PieceShape` from `pieces.ts`. Row increases downward, col increases rightward. Shape is placed with its top-left corner at `(row, col)`.

### R2: Horizontal Movement (Left/Right)

A `tryMove(grid, shape, row, col, dx, dy)` function (or similar) that attempts to shift the piece by `(dx, dy)` and returns the new position if no collision, or `null` if blocked.

- Move left: `dx = -1, dy = 0`
- Move right: `dx = 1, dy = 0`
- Soft drop: `dx = 0, dy = 1` (row increases downward)

### R3: Soft Drop

Soft drop moves the piece one row down (`dy = +1` in grid coordinates). Uses the same collision check as horizontal movement. No special logic beyond the movement itself — gravity speed and scoring are handled elsewhere.

### R4: Rotation with Wall Kicks

A `tryRotate(grid, piece, row, col, fromRotation, direction, rotationSystem)` function that:

1. Computes `toRotation` from `fromRotation` and `direction` (CW or CCW), wrapping via `rotationSystem.getRotationCount()`.
2. Gets the new shape from `rotationSystem.getShape(piece, toRotation)`.
3. Gets kick offsets from `rotationSystem.getKickOffsets(piece, fromRotation, toRotation)`.
4. Iterates kick offsets: for each `[dx, dy]`, checks `collides(grid, newShape, row - dy, col + dx)` — note `dy` is inverted because kick offsets use +y = up but grid uses +row = down.
5. Returns the first non-colliding `{ row, col, rotation }` result, or `null` if all kicks fail.

### R5: SRS Wall Kicks

SRS rotation uses 5 kick offsets per transition (from `rotation-srs.ts`). The movement module doesn't define these — it delegates to `RotationSystem.getKickOffsets()`. Tests verify that:
- All 4 rotation states are reachable for each piece.
- Wall kicks trigger when the base rotation (offset `[0,0]`) collides but a later offset succeeds.
- I-piece kicks work (separate kick table from JLSTZ).
- Rotation is blocked when all 5 kicks fail.

### R6: NRS Rotation (No Kicks)

NRS always returns `[[0, 0]]` from `getKickOffsets()`. The movement module treats this identically — it just happens that there's only one offset to try. Tests verify:
- I, S, Z pieces have 2 rotation states (wrapping).
- J, L, T pieces have 4 rotation states.
- O piece has 1 state (rotation is a no-op).
- Rotation is blocked on collision (no fallback kicks).

### R7: Exports

Add to `packages/shared/src/index.ts`:
- Export `collides`, `tryMove`, `tryRotate` from `./engine/movement.js`.
- Export any new types (e.g., `RotateResult`, `MoveResult`).

## Implicit Requirements

1. **Coordinate system consistency**: KickOffset uses `+x = right, +y = up`. Grid uses `+row = down, +col = right`. The movement module must translate: `gridCol = col + dx`, `gridRow = row - dy`.

2. **Rotation wrapping**: `toRotation` must wrap using `getRotationCount()`, not hardcoded to 4. NRS I-piece has only 2 states.

3. **Pure functions**: Movement functions should be pure — no mutation of the grid. They check and return positions; the caller decides whether to apply them.

4. **Buffer zone awareness**: Collision detection must work for rows 0–19 (buffer zone) where pieces spawn. A piece partially above the board (negative row for some shape cells) should be handled — cells above row 0 are out of bounds.

5. **Direction type**: Need a `RotationDirection` type (`"cw" | "ccw"`) or use numeric `+1 / -1`.

## Ambiguities

1. **Hard drop**: The task mentions soft drop but not hard drop. Hard drop (instant drop to lowest valid row) is a natural addition but not explicitly requested. **Resolution**: Include a `hardDrop(grid, shape, row, col)` function that returns the lowest valid row. It's trivial (loop `tryMove` downward) and will be needed soon. Keep it simple — just return the landing row.

2. **180 rotation**: Some modern Tetris games support 180-degree rotation. SRS kick tables only define adjacent transitions (0>1, 1>2, etc.), not 0>2. **Resolution**: Don't implement 180 rotation. The `direction` parameter only accepts CW/CCW. If 180 is needed later, it can be added as two sequential rotations or a new direction.

3. **Return types for tryMove/tryRotate**: Should these return just coordinates, or include the shape? **Resolution**: `tryMove` returns `{ row, col } | null` (shape doesn't change). `tryRotate` returns `{ row, col, rotation } | null` (caller can get shape from rotation system).

## Edge Cases

1. **Piece at left wall, move left**: Collision detected via out-of-bounds column (col + dx < 0 for filled cells).

2. **Piece at bottom, soft drop**: Collision detected via out-of-bounds row (row + dy >= BOARD_HEIGHT for filled cells).

3. **Piece in buffer zone (row < 20)**: Must work correctly — pieces spawn here. No special handling needed if collision detection correctly checks bounds.

4. **Shape bounding box vs filled cells**: The I-piece spawn shape has empty rows (row 0, 2, 3 of the 4x4 box). Only filled cells (value = 1) participate in collision checks. An I-piece at row -1 is valid if its filled cells (row 1 of shape = grid row 0) are in bounds.

5. **O-piece rotation**: SRS O-piece has identical shapes and only `[0,0]` kick. Rotation always "succeeds" but nothing visually changes. This is correct behavior.

6. **Wall kick at board ceiling**: A kick offset with `+dy` (up, meaning lower row number) could push a piece into negative rows. Collision detection must reject any filled cell at row < 0.

7. **All kicks exhausted**: When every kick offset collides, `tryRotate` returns `null`. The piece stays in its current rotation state.

8. **NRS 2-state wrapping**: For NRS I/S/Z, rotating CW from state 1 wraps to state 0 (not to state 2, which doesn't exist). `(fromRotation + 1) % getRotationCount()` handles this.
