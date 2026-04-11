# Implementation Spec: Board Model and Line Clearing

## Requirements

### R1: 10x40 2D Grid
- Create `packages/shared/src/engine/board.ts` exporting a `Board` class/module.
- The grid is 10 columns wide, 40 rows tall.
- Rows 0–19 are the **buffer zone** (above the visible playfield, used for piece spawning and top-out detection).
- Rows 20–39 are the **visible playfield** (row 39 = bottom of the board).
- Cell values: `null` (empty) or a `PieceType` string indicating which piece occupies it. This preserves color information for rendering.

### R2: Place a Piece
- Given a piece shape (`PieceShape` from `pieces.ts`), a piece type (`PieceType`), and a board position (row, col of the shape's top-left corner), write the filled cells of the shape into the grid.
- The position uses the same coordinate system as the grid: row increases downward, col increases rightward.
- No bounds checking or collision detection needed in `placePiece` itself — that belongs to the game engine. The board is a dumb data structure; the caller is responsible for validating placement.

### R3: Detect Completed Lines
- A row is "complete" when every cell in that row (all 10 columns) is non-null.
- Provide a method to find and return the indices of all completed rows.

### R4: Clear Completed Lines
- Remove all completed rows from the grid.
- Shift all rows above each cleared row downward to fill the gaps.
- Insert new empty rows at the top (row 0) to maintain the 40-row height.
- Return the number of lines cleared (needed by scoring system later).

### R5: Export from shared package
- Export the board module from `packages/shared/src/index.ts` so server and client can both use it.

## Implicit Requirements

- **Immutability of piece shapes**: `placePiece` must not mutate the `PieceShape` arrays from the rotation system. It only reads them.
- **Determinism**: All operations must be deterministic — no randomness, no Date.now(), no side effects. Given the same inputs, produce identical output.
- **Coordinate convention**: The kick offsets in `rotation.ts` use `+y = up`, but the board grid uses row-increases-downward. The board module itself doesn't need to handle this conversion (that's the game engine's job), but the convention must be documented.
- **Cell type**: Using `PieceType | null` for cells (not 0/1) enables colored rendering and is consistent with how modern Tetris engines work.

## Ambiguities

### A1: Grid representation — resolved
**Row-major 2D array** (`grid[row][col]`), matching the `PieceShape` convention already established in `pieces.ts`. Type: `(PieceType | null)[][]`.

### A2: File location — resolved
The PR notes specify `packages/shared`, not `src/engine/board.ts` at the project root. Files will be:
- `packages/shared/src/engine/board.ts`
- `packages/shared/src/engine/board.test.ts`

### A3: placePiece bounds behavior — resolved
No bounds checking. The board is a low-level data structure. The game engine (future PR) will handle collision detection before calling `placePiece`. Out-of-bounds writes would be a caller bug.

### A4: What does "placing a piece" write to the cell — resolved
Write the `PieceType` value (e.g., `"T"`) rather than just `1`. This preserves piece identity for rendering colors and for T-spin detection logic later.

## Edge Cases

### E1: Line clear at top of buffer zone (row 0)
If somehow the top row of the buffer is full, it should be detected and cleared like any other row. New empty rows are always inserted at row 0.

### E2: Piece placement overlapping buffer and visible zones
A piece spawning in the buffer zone (rows 18-21 typically) may straddle the boundary. `placePiece` treats all 40 rows uniformly — no special boundary logic.

### E3: Multiple non-contiguous line clears
When clearing lines, rows may not be contiguous (e.g., rows 35 and 37 are full but 36 is not). The shift-down logic must handle gaps correctly — each cleared row causes rows above it to shift, and the order of operations matters. Safest approach: remove all completed rows at once, then prepend empty rows.

### E4: Tetris (4-line clear)
The maximum possible clear is 4 lines (only achievable with an I-piece). The implementation must handle clearing up to 4 lines in a single operation.

### E5: Empty board — no lines to clear
`clearLines` on an empty board should return 0 and leave the board unchanged.
