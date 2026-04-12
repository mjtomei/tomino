# Spec: Canvas Renderer for Game Board (pr-c08aefa)

## Requirements

### R1: React component with HTML5 Canvas
Create `src/ui/BoardCanvas.tsx` in `packages/client`. The component accepts a `GameState` (from `@tetris/shared`, defined in `packages/shared/src/engine/engine.ts:50-62`) as a prop and renders it onto an HTML5 `<canvas>` element.

### R2: Render placed cells with colors
Read `state.board` (a `Grid` / `Cell[][]`). Only render the visible portion: rows `BUFFER_HEIGHT` (20) through `BOARD_HEIGHT-1` (39). Each non-null cell is drawn as a colored rectangle using the cell's `PieceType` to look up the color from a new `colors.ts` module.

### R3: Render active piece
Read `state.currentPiece` (`ActivePiece | null`). When non-null, iterate its `shape` (a `PieceShape` — 2D array of 0/1) and draw filled cells at `(currentPiece.row + r, currentPiece.col + c)` offset into the visible grid. Only draw cells that fall within the visible rows (row >= BUFFER_HEIGHT).

### R4: Render ghost piece
Read `state.ghostRow` (`number | null`). When non-null AND `state.currentPiece` is non-null, render the current piece's shape at `(ghostRow, currentPiece.col)` with semi-transparent styling. When `ghostRow` is null (Classic rule set has `ghostEnabled: false`), draw nothing.

### R5: Grid lines
Draw subtle grid lines to delineate cell boundaries on the 10x20 visible board.

### R6: 60fps rendering via requestAnimationFrame
Use `requestAnimationFrame` for the render loop. The component should schedule a new frame whenever `GameState` changes. Clean up the rAF on unmount.

### R7: Rule-set agnostic rendering
The renderer draws whatever the state snapshot contains. It does not check rule set configuration — it only checks whether `ghostRow`, `hold`, `queue` are null/empty to decide what to render.

### R8: Hold and preview
Render `state.hold` (a `PieceType | null`) and `state.queue` (a `readonly PieceType[]`). If hold is null, draw nothing for hold. If queue is empty, draw nothing for preview. Use the rotation system's spawn shape (rotation 0) for rendering these pieces. The `holdUsed` flag can be used to dim the hold piece when it's been used this drop.

### R9: Color definitions
Create `src/ui/colors.ts` with a mapping from `PieceType` to hex colors following the Tetris Guideline:
- I: cyan, O: yellow, T: purple, S: green, Z: red, J: blue, L: orange

### R10: Subtle cell borders
Each filled cell is drawn as a colored rectangle with subtle borders (slightly darker or lighter edges) to give a 3D/beveled appearance.

## Implicit Requirements

### IR1: Coordinate translation
The board grid is 40 rows (0-39) but only rows 20-39 are visible. Canvas Y coordinates must map `boardRow - BUFFER_HEIGHT` to pixel Y. Pieces spawn at row 18 (in the buffer), so parts of the active piece may be above the visible area and should be clipped.

### IR2: Canvas sizing
The canvas needs explicit width/height. Cell size should be configurable or computed from props (e.g., `cellSize` prop or derived from container). Default to a reasonable cell size (e.g., 30px) making the board 300x600 pixels.

### IR3: Shape lookup for hold/preview
Hold and queue store only `PieceType`, not shapes. To render them, the component needs access to the spawn shapes. Import `SRSRotation` (or accept a rotation system) to call `getShape(type, 0)`. Since the renderer is rule-set agnostic, use SRS shapes for preview/hold display (they're standard representations).

### IR4: Cleanup on unmount
Cancel any pending `requestAnimationFrame` via `cancelAnimationFrame` in the cleanup function of `useEffect`.

### IR5: Ghost piece vs active piece overlap
When the ghost piece and active piece overlap (piece is at its landing position), the ghost should not be visible (active piece takes priority). Since ghost is rendered first with transparency, drawing the active piece on top handles this naturally.

## Ambiguities

### A1: Hold and preview layout
**Resolution:** The task says "Same for hold/preview" regarding null handling, but doesn't specify layout. The board canvas will render just the main playfield (board + active piece + ghost + grid lines). Hold and preview will be rendered as separate small canvases or as part of a parent layout component. For this PR, include hold and preview rendering within the same canvas — hold on the left, preview on the right, board in the center.

### A2: Cell size / canvas dimensions
**Resolution:** Use a `cellSize` prop with a default of 30px. The main board area is `BOARD_WIDTH * cellSize` x `VISIBLE_HEIGHT * cellSize` (300x600 at default). Hold and preview areas add margins on each side.

### A3: Ghost piece styling
**Resolution:** Render ghost piece cells with the same color as the active piece but at ~30% opacity, with a visible outline. This is the standard Tetris guideline approach.

### A4: What "renders at 60fps" means
**Resolution:** The component doesn't run its own 60fps game loop — it re-renders the canvas whenever the `GameState` prop changes. Use `requestAnimationFrame` to batch canvas draws efficiently (avoid drawing mid-frame). The game loop driving state updates at 60fps lives elsewhere (the engine's `tick()` caller).

## Edge Cases

### EC1: Piece partially above visible area
Active piece spawns at row 18 (buffer zone). Its shape extends 2-4 rows below, so some cells may be at rows 18-19 (invisible) while others are at rows 20-21 (visible). Only draw cells where `row >= BUFFER_HEIGHT`.

### EC2: Empty board state
When `status` is `"idle"` or `"gameOver"` with no current piece, the renderer should still draw the board (possibly with locked cells from game over) and grid lines. Just skip active/ghost piece drawing.

### EC3: Ghost at same position as active piece
When the piece is already at its landing row, `ghostRow === currentPiece.row`. Drawing ghost first then active piece on top is correct — the ghost is fully occluded.

### EC4: Very fast state updates
If state updates faster than the display refresh rate, `requestAnimationFrame` naturally coalesces to one draw per frame. Store the latest state in a ref and draw it on the next frame.

## Test Plan

### T1: Component renders a canvas element
Render `<BoardCanvas>` with a valid `GameState`, assert a `<canvas>` element is present in the DOM.

### T2: Render function called with state
Mock `canvas.getContext('2d')` and verify that drawing methods are called when state contains board cells and an active piece.

### T3: Ghost not drawn when null
Provide a `GameState` with `ghostRow: null`, verify that ghost-related draw calls are not made (no semi-transparent piece rendered at a ghost position).

### T4: Hold/preview not drawn when null/empty
Provide a `GameState` with `hold: null` and `queue: []`, verify no hold/preview drawing occurs.
