# Spec: Piece animation — spawn, movement, rotation (pr-ed25215)

## 1. Requirements (grounded in code)

Current state: `BoardCanvas.tsx:198-217` draws the active piece at the exact
logical `(row, col)` from `state.currentPiece` on each React state change.
There's no interpolation — every update teleports the piece. The render is
scheduled via a single `requestAnimationFrame` in `useEffect([state])`
(`BoardCanvas.tsx:319-323`), so there's currently no continuous RAF loop.

Requirements:

1. **Spawn fade-in (~100ms)** — When `currentPiece` becomes defined or its
   `type` changes (new piece spawned), its cells fade from alpha 0 → 1 over
   ~100ms at the logical spawn position.
2. **Lateral movement tween (~40ms)** — When `col` changes without `type`
   changing, the rendered piece interpolates linearly from the previous col
   to the new col over ~40ms.
3. **Vertical movement tween** — Soft drop / gravity changes to `row` should
   also tween (same short duration) so soft drop "feels smoother". Hard drop
   should NOT tween (snap instantly — the trail effect from board effects PR
   handles the visual).
4. **Rotation easing** — When `rotation` changes, animate a brief rotation
   easing. Implementation: visually rotate the shape's bounding box around
   its pivot over ~80ms with `easeOutCubic`. Because `shape` already reflects
   post-rotation cells, we interpolate angle from ±90° (or 180°) back to 0°
   on the new shape.
5. **Never lag behind state** — If a new input arrives mid-animation, the
   animation re-targets immediately. If inputs arrive faster than animation
   duration, animations compress (use `min(duration, timeSinceLastChange)`)
   or are skipped entirely. `renderPos` must equal logical pos at rest.
6. **Engine untouched** — All work in the render layer. `piece-animation.ts`
   is a pure state-tracking module consumed by `BoardCanvas`.

Files touched:
- `packages/client/src/ui/piece-animation.ts` (new)
- `packages/client/src/ui/BoardCanvas.tsx` (integrate animator, continuous RAF)
- `packages/client/src/__tests__/piece-animation.test.ts` (new unit tests)
- `e2e/piece-animation.spec.ts` (new e2e smoke)

## 2. Implicit requirements

- Continuous RAF loop while an animation is in flight; idle to single-draw
  when at rest (to avoid burning CPU).
- Animator must be resettable when a new game starts (piece type+row+col
  diff compared to prior tracked state).
- Hard-drop detection: a single-frame jump of many rows → snap rather than
  tween. Heuristic: if `|newRow - oldRow| > 2`, snap.
- Line-clear gap: when `currentPiece` becomes `null` (lock delay / clearing),
  animator clears its tracked state so the next spawn fades in cleanly.
- Ghost piece snaps instantly (not animated) to remain a responsiveness
  indicator.

## 3. Ambiguities (resolved)

- **Rotation animation shape** — We don't have per-cell transforms; rotating
  individual drawCell calls around a pivot is feasible using canvas
  `ctx.save/translate/rotate`. Resolution: wrap the active-piece draw in
  a transform around the shape's center; interpolate angle from the
  pre-rotation offset angle to 0.
- **Duration constants** — Use `SPAWN_MS = 100`, `MOVE_MS = 40`, `ROTATE_MS =
  80`. Exported for tests.
- **Soft drop tween** — Only tween row changes of exactly 1 (gravity/soft
  drop single-step). Multi-row jumps snap.

## 4. Edge cases

- Hold swap: `type` changes; treat as spawn (fade-in).
- Piece locks and next piece spawns at same col: animator sees `type`
  change → fade in at new spawn position, no lateral tween.
- Wall-kick: rotation changes AND col/row may change. Animate rotation;
  position change is small enough to tween lateral in parallel.
- Game over: `currentPiece` null — animator resets.
- Tests must be time-deterministic: pass a `now` function into the animator
  rather than using `performance.now` directly.

## 5. Tests

Unit (`piece-animation.test.ts`):
- Spawn fade: at t=0 alpha≈0, t=50 alpha≈0.5, t=100 alpha=1.
- Lateral tween: render col midway between old and new at t=duration/2.
- At rest (t > duration) rendered pos === logical pos exactly.
- Rapid inputs: successive col changes at t=10ms each produce a
  continuously-moving render that never falls behind logical pos by > 1 cell.
- Hard-drop snap: `|dy| > 2` → instant (no tween).
- Type change resets tween state.

E2E (`piece-animation.spec.ts`):
- Smoke: load solo game, send a left move, assert board-canvas still
  responsive and DOM stat updates.
