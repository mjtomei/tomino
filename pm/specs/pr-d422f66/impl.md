# Garbage Queue Indicator — Implementation Spec

## Requirements

### R1: Vertical garbage meter on the left side of the player's board
- Create `src/ui/GarbageMeter.tsx` — a React component that renders a vertical bar
  showing pending incoming garbage lines.
- Create `src/ui/GarbageMeter.css` for styling.
- The meter renders on the **left edge** of the board area, between the hold panel
  and the board itself.
- Each pending garbage line maps to a red bar segment. The total height of the
  filled region = `sum(batch.lines for batch in pendingGarbage)` segments, where
  each segment represents one board row.
- The meter's maximum height equals VISIBLE_HEIGHT (20 rows). If pending garbage
  exceeds 20, the meter is capped at full height (all segments filled).

### R2: Data source — `pendingGarbage: GarbageBatch[]`
- **Multiplayer (local player):** `GameStateSnapshot.pendingGarbage` flows from
  `GameClient.getRenderSnapshot()` through the lobby state. Currently,
  `GameMultiplayer` passes `GameShell` with no garbage data. We need to thread
  `pendingGarbage` into the local player's board area.
  - Approach: Add an optional `pendingGarbage` prop to `GameShell` (and by
    extension, its layout). `GameMultiplayer` passes the local player's
    `pendingGarbage` from `opponentStates` or a new dedicated field.
  - **Simpler approach:** Since `GameShell` manages its own `TetrisEngine` in solo
    mode (which has no `pendingGarbage`), and in multiplayer it wraps the same
    `GameShell`, we add `pendingGarbage?: GarbageBatch[]` as an optional prop to
    `GameShell`. `GameMultiplayer` extracts it from the lobby state.
- **Solo mode:** No garbage system — meter is hidden (pendingGarbage is undefined
  or empty).

### R3: Animation on garbage add/cancel
- CSS transitions on the meter height for smooth visual feedback when garbage is
  added or cancelled (lines removed from queue by the player's own line clears).
- A CSS `transition` on the bar height property provides smooth grow/shrink.

### R4: Delay timer visual
- The garbage delay (server default: 500ms from `DEFAULT_GARBAGE_DELAY_MS`) means
  garbage sits in the queue before becoming "ready."
- Visual: Segments could use a pulsing/flashing animation or reduced opacity for
  "not yet ready" batches, and full opacity for "ready" batches.
- **Resolution:** The client does not currently receive `readyAt` timestamps per
  batch — `GarbageBatch` only has `{ lines, gapColumn }`. The delay is
  server-side only (in `PendingEntry.readyAt`). Without per-batch timing data on
  the client, we cannot distinguish ready vs. not-ready batches.
- **Approach:** Show the total pending count as a solid bar. Add a subtle pulse
  animation to the entire meter when the count changes (garbage added), signaling
  that new garbage arrived and is on a delay. This is the standard Tetris approach
  — the meter itself serves as the "delay timer" visual, as garbage appears in the
  meter before it's applied to the board.

### R5: Integration with opponent boards
- `OpponentBoard` already receives `snapshot: GameStateSnapshot` which includes
  `pendingGarbage`. A compact garbage meter can be added to opponent boards as
  well, though the task focuses on the local player's board.
- For scope: implement for the local player's board. Opponent board integration is
  a natural follow-up but not explicitly required.

## Implicit Requirements

### IR1: GarbageMeter must not affect board dimensions or layout
- The meter sits in the gap between hold panel and board (currently `PANEL_GAP =
  0.5 cells`). It should be a thin bar (e.g. 4-8px wide) that fits in the
  existing gap or overlaps the board edge, not push the board right.

### IR2: Meter scales with cellSize
- The meter height must match the board height (VISIBLE_HEIGHT * cellSize). Each
  segment height = cellSize. This ensures 1 garbage line = 1 visible row.

### IR3: Hidden when no garbage
- When `pendingGarbage` is undefined or empty, the meter should be invisible (no
  empty bar chrome taking up space).

### IR4: Meter fills from the bottom up
- Garbage is inserted at the bottom of the board, so the meter should fill from
  the bottom upward, matching the visual metaphor.

### IR5: Works in both GameShell layouts
- Solo mode: meter hidden (no garbage data).
- Multiplayer mode (via GameMultiplayer): meter shown when pendingGarbage is
  non-empty.

## Ambiguities

### A1: Exact placement of the meter — **[RESOLVED]**
The task says "left side of the player's board." In the current layout, the left
side has the hold panel (`game-left-panel`). The meter should be positioned as a
thin vertical bar between the left panel and the board canvas, or as an overlay
on the left edge of the board itself.
**Resolution:** Render the meter as a thin absolute-positioned bar on the left
edge of the `game-board-container`, overlapping slightly into the board. This
avoids layout changes and is the standard Tetris convention (meter overlays the
board edge).

### A2: Color scheme — **[RESOLVED]**
Task says "red bar segment" for each pending line.
**Resolution:** Use red (#D41400, matching Z-piece / garbage color) for the bar
segments. When garbage count is high (e.g. >= 10 lines), the color could pulse
more urgently, but base color is red.

### A3: Per-batch vs. aggregate display — **[RESOLVED]**
`pendingGarbage` is an array of `GarbageBatch` objects, each with a `lines`
count. Should each batch be visually distinct?
**Resolution:** Show aggregate total as a single continuous bar. Individual
batches are not visually distinguished — the total pending line count is what
matters to the player.

### A4: Opponent board garbage meter — **[RESOLVED]**
Task mentions "player's board" specifically. Opponent boards also have
pendingGarbage data available.
**Resolution:** Implement for local player only in this PR. The component is
designed to be reusable for opponent boards in a follow-up.

## Edge Cases

### E1: Garbage exceeds visible height
If pending garbage >= 20 lines, the meter is fully filled. Cap the visual at
VISIBLE_HEIGHT. Consider a warning indicator (brighter glow) when garbage is
near or at maximum.

### E2: Rapid add + cancel
Player clears lines while garbage is pending, causing cancellation. The meter
should shrink smoothly via CSS transition — no special handling needed beyond the
transition.

### E3: Game over state
When `isGameOver` is true, the meter should remain showing the final garbage
state (no need to hide it). It will naturally freeze since no more updates come.

### E4: Empty pendingGarbage array
When the array is empty, render nothing (or a zero-height bar). The component
should handle `[]` and `undefined` gracefully.

### E5: State race — pendingGarbage updates arriving while animation is in progress
CSS transitions handle this naturally — the browser interpolates to the new
target value, interrupting any in-progress animation.

## Test Plan

### T1: Meter height calculation
- Given `pendingGarbage` with known line counts, verify the computed meter height
  equals `sum(lines) * cellSize`, capped at `VISIBLE_HEIGHT * cellSize`.
- Test with 0, 1, 5, 20, and 25 pending lines.

### T2: Animation state transitions
- Verify the meter element has CSS transition properties applied.
- Test that changing pendingGarbage from 3 lines to 5 lines updates the rendered
  height.
- Test that changing from 5 lines to 2 lines (cancellation) updates the rendered
  height.

### T3: Garbage cancellation visual update
- Render with pendingGarbage = [{lines: 4, gapColumn: 0}].
- Re-render with pendingGarbage = [{lines: 1, gapColumn: 0}].
- Assert meter height decreased.

### T4: Edge cases
- pendingGarbage = [] renders no visible meter.
- pendingGarbage = undefined renders no visible meter.
- pendingGarbage exceeding 20 lines caps at full board height.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `packages/client/src/ui/GarbageMeter.tsx` | Create | React component |
| `packages/client/src/ui/GarbageMeter.css` | Create | Styling + animations |
| `packages/client/src/ui/GameShell.tsx` | Modify | Add pendingGarbage prop, render GarbageMeter |
| `packages/client/src/ui/GameMultiplayer.tsx` | Modify | Pass pendingGarbage to GameShell |
| `packages/client/src/__tests__/GarbageMeter.test.tsx` | Create | Unit tests |
