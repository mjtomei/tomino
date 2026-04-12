# Implementation Spec: Board Builder Test Utility

## Requirements

### R1: `boardFromAscii(ascii: string): Grid`
- Accepts a multiline template string describing a board layout
- Character mapping: `.` = `null` (empty), `X` = `"T"` (generic filled), piece-type letters (`I`, `O`, `T`, `S`, `Z`, `J`, `L`) = that `PieceType` value
- Strips leading/trailing blank lines from the input
- Each non-blank line represents one row; row width must equal `BOARD_WIDTH` (10)
- If fewer than `BOARD_HEIGHT` (40) rows are provided, pads with empty rows **at the top** (partial boards specify bottom rows only)
- Returns a `Grid` (i.e., `Cell[][]`) compatible with `packages/shared/src/engine/board.ts`
- Throws on invalid row width (any row whose trimmed length ≠ 10)

### R2: `boardToAscii(grid: Grid): string`
- Converts a `Grid` back to the same multiline-string format used by `boardFromAscii`
- `null` cells → `.`, piece-type cells → their letter (`I`, `T`, etc.)
- Returns a string with one line per row, no leading/trailing blank lines
- Must include **all 40 rows** so round-trip `boardToAscii(boardFromAscii(s))` is lossless for a full board

### R3: `emptyBoard(): Grid`
- Returns a fresh empty 40×10 grid (all `null` cells)
- Equivalent to `createGrid()` from `board.ts` but available from the test-utils barrel

### R4: `assertBoardEquals(actual: Grid, expected: Grid): void`
- Compares two grids cell-by-cell
- On mismatch, produces a readable diff showing both boards in ASCII format
- Uses Vitest's `expect` internally so failures integrate with the test runner

### R5: File structure
- Implementation: `packages/shared/src/__test-utils__/board-builder.ts`
- Tests: `packages/shared/src/__test-utils__/board-builder.test.ts`
- Barrel export: `packages/shared/src/__test-utils__/index.ts` (re-exports everything)

## Implicit Requirements

1. **`X` maps to `"T"`** — The task says `X` = "filled (generic)". Since `Cell` must be a `PieceType`, we need a concrete value. `"T"` is the conventional default used in existing test helpers (`fillRow` defaults to `"T"` in `board.test.ts:22` and `movement.test.ts:24`).

2. **Row ordering** — The grid is row-major top-down (`grid[0]` = top buffer row, `grid[39]` = bottom row). ASCII lines map top-to-bottom, so the first non-blank line of a partial board maps to `grid[40 - numLines]`.

3. **`boardToAscii` must handle `X` mapping in reverse** — Since multiple piece types map to different letters but `X` is only an input alias for `"T"`, `boardToAscii` should output `T` (not `X`) for T-piece cells. This ensures round-trip fidelity when piece types are used explicitly.

4. **No trimming of empty top rows in `boardToAscii`** — Always outputs all 40 rows. This makes round-trip testing straightforward and avoids lossy conversions.

## Ambiguities

### A1: What character does `boardToAscii` use for generic filled cells? — **[RESOLVED]**
`boardToAscii` always outputs the actual `PieceType` letter. There is no reverse mapping to `X`. This means `boardFromAscii` with `X` → `boardToAscii` will show `T`, not `X`. This is the correct behavior since `X` is purely an input convenience.

### A2: Should `boardFromAscii` validate characters? — **[RESOLVED]**
Yes. Any character that is not `.`, `X`, `I`, `O`, `T`, `S`, `Z`, `J`, or `L` should cause an error. This catches typos early.

### A3: Should `assertBoardEquals` use `boardToAscii` for its diff output? — **[RESOLVED]**
Yes. Displaying both boards in ASCII format gives the clearest visual diff for test failures.

## Edge Cases

1. **Full 40-row board input** — No padding needed; pass through directly.
2. **Single-row input** — Pads 39 empty rows above.
3. **All-empty input (just dots)** — Valid; produces grid with empty rows except the specified dot rows (which are also empty, but structurally present).
4. **Mixed piece types in one row** — e.g., `IITTSSZZJJ` — each cell gets its respective `PieceType`.
5. **Inconsistent row widths** — Must throw with a clear error message indicating which row is wrong and what width was found.
6. **Input with only whitespace lines** — After stripping blank lines, results in 0 content rows. Should return a full empty board (equivalent to `emptyBoard()`).
