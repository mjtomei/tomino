# Spec — Board visual effects (line clear & lock)

## 1. Requirements (grounded)

**R1 — Line clear flash + dissolve.** When `GameState.scoring.lines` advances, rows that were filled and are no longer filled should flash white and dissolve into scattering particles. The diffing input matches the existing sound-event pattern at `packages/client/src/ui/GameShell.tsx:46` (`detectSoundEvents`). The cleared-row *indices* are not carried on `LineClearEvent` (`packages/shared/src/engine/engine.ts:46`), so `board-effects.ts` will recover them by scanning `prev.board` for rows that were full and are not full in `curr.board` (in the 40-row grid, using rows `BUFFER_HEIGHT..BUFFER_HEIGHT+VISIBLE_HEIGHT`).

**R2 — Piece lock pulse.** On a lock (detected via `prev.currentPiece != null && linesDiff === 0 && queueShifted`, same predicate as `GameShell.tsx:67-75`), spawn a short pulse/glow at the last-known `prev.currentPiece` cells. Since a landed piece is hard to recover from `curr.board` alone, we capture position from `prev.currentPiece` plus `prev.ghostRow` (the row the piece would drop to); for soft locks the active row equals the ghost row at lock time — but safer: use `prev.currentPiece.row` directly. When a lock *also* clears lines, still pulse first, then dissolve.

**R3 — Hard drop trail.** Hard drop is a player action (`GameShell.tsx:540` solo / `sendAction("hardDrop")` mp). We need to signal this to `board-effects.ts`. Approach: the shell calls `boardEffects.onHardDrop(piece, fromRow, toRow)` *before* invoking `engine.hardDrop()` (or computes `toRow` from `prev.ghostRow` on the rendered state captured just before the action). Simpler alternative: a one-shot flag set by the keyboard handler and consumed on the next tick diff. I will expose `BoardEffects.onHardDropIntent()` which the shell calls synchronously on the Space keydown, capturing the current `gameState.currentPiece` + `gameState.ghostRow` to render a vertical trail.

**R4 — Tetris amplification.** When `lastLineClear.linesCleared === 4`, emit an amplified version: screen-wide flash overlay, more particles, color burst using `theme.palette.accent` + `particleColors`. The "screen-wide flash" is rendered on the existing particle canvas (or a CSS overlay) — we'll implement it as a very large, short-lived faint-white particle or a separate flash element managed by `BoardEffects`.

**R5 — Theme colors.** All particle colors pulled from `useTheme().theme.palette.particleColors` and `.accent`. No hard-coded piece colors.

**R6 — Separate canvas layer.** Effects render on a `<ParticleCanvas>` overlaid via `position: absolute` on the `.game-board-container` (`GameShell.tsx:348,654`), *never* modifying `BoardCanvas`. `ParticleCanvas` already exists at `packages/client/src/atmosphere/ParticleCanvas.tsx`.

**R7 — Tests.**
- Unit: `packages/client/src/atmosphere/__tests__/board-effects.test.ts` — test diff detection (line clears, lock, hard drop) and that each event emits the correct number/config of particles into an injected `ParticleSystem`.
- E2E: `e2e/board-effects.spec.ts` — run a game, force a line clear, assert particle count on an exposed `window.__boardEffects__` (mirroring the `window.__atmosphere__` pattern at `use-atmosphere.ts:46`).

## 2. Files

- **New:** `packages/client/src/atmosphere/board-effects.ts`
- **New:** `packages/client/src/atmosphere/__tests__/board-effects.test.ts`
- **New:** `e2e/board-effects.spec.ts`
- **Edit:** `packages/client/src/ui/GameShell.tsx` — instantiate `ParticleSystem` + `BoardEffects`, mount `<ParticleCanvas>` over the board, call `boardEffects.onFrame(prev, curr, theme)` each tick, call `onHardDropIntent` on Space keydown. Applied to **both** `SoloGameShell` and `MultiplayerGameShell` for parity.

## 3. BoardEffects API

```ts
interface BoardEffectsOptions {
  system: ParticleSystem;
  cellSize: number;          // pixels
  getTheme: () => Theme;     // called lazily so theme swaps pick up
  rng?: () => number;
}

class BoardEffects {
  constructor(opts: BoardEffectsOptions);
  onFrame(prev: GameState | null, curr: GameState): void;
  onHardDropIntent(state: GameState): void;
  // For tests / debug:
  readonly debug: { lastEvents: BoardEffectEvent[] };
}

type BoardEffectEvent =
  | { type: "lineClear"; rows: number[]; count: number }   // count = linesCleared
  | { type: "tetris"; rows: number[] }
  | { type: "lock"; row: number; col: number; piece: PieceType }
  | { type: "hardDrop"; col: number; fromRow: number; toRow: number; piece: PieceType };
```

`onFrame` is the core diff:
1. Compare `curr.scoring.lines` vs `prev.scoring.lines`; if delta > 0, scan `prev.board` for rows that were full → produce line-clear event (tetris variant if delta >= 4).
2. Apply the existing lock predicate for piece-lock events (using `prev.currentPiece` position).
3. Emit particles into `this.system` via the theme-derived `EmitConfig`s.

`onHardDropIntent` is invoked from the keyboard handler with the *pre-action* state, so we know the drop column and the ghost landing row.

## 4. Coordinate math

Board pixels: `(col * cellSize, (row - BUFFER_HEIGHT) * cellSize)` for the top-left of a visible cell (rows in the 40-row grid; visible rows start at `BUFFER_HEIGHT = 20` per `shared` constants). The ParticleCanvas is sized to `BOARD_WIDTH * cellSize × VISIBLE_HEIGHT * cellSize` and positioned with `position: absolute; inset: 0` relative to the `game-board-container`. Since `BoardCanvas` is rendered with `showSidePanels={false}`, no panel offset needed.

## 5. Particle configs (theme-driven)

- **Line clear (per row):** ~12 particles per row, `shape: "square"`, color picked from `palette.particleColors`, `velocity.y = -20`, `velocityJitter: { x: 160, y: 120 }`, `gravity: { x: 0, y: 400 }`, `lifetime: 0.7s`, `fade: [1, 0]`, `sizeCurve: [1, 0.3]`, `size: cellSize * 0.25`. Position along the row: column centers at `(col + 0.5) * cellSize`.
- **White flash:** one row of `color: "rgba(255,255,255,0.9)"`, `lifetime: 0.12s`, `shape: "square"`, `size: cellSize * 0.5`, zero velocity, placed at each cleared row — serves as the "flash" requirement.
- **Tetris amplification:** multiplier 2.0× on per-row counts, add a full-width horizontal sweep using `shape: "line"` with `palette.accent`, plus a faint wide white particle (very large `size`, short lifetime) to approximate the screen-wide flash without a separate DOM element.
- **Lock pulse:** 6 particles at the piece centroid, `shape: "circle"`, `palette.accent`, `lifetime: 0.2s`, `sizeCurve: [1, 2.5]`, `fade: [0.6, 0]`, small radial `velocityJitter`.
- **Hard drop trail:** for each row from `fromRow` to `toRow-1`, emit 1 particle at column centroid, `shape: "square"`, `palette.particleColors[0]`, `lifetime: 0.3s`, zero velocity, `fade: [0.6, 0]`, `sizeCurve: [1, 0.5]`.

Exact numbers are tuning — spec fixes *shape* of config, tests assert counts/colors in relative terms.

## 6. Implicit requirements

- Must work in both solo and multiplayer shells (both render `<BoardCanvas>`; both should render effects overlay).
- Must not leak particles across game resets — `atmosphereReset()` path must also call `boardEffects.clear()` (system reset).
- Must cap particles: ParticleSystem already enforces `maxParticles: 2000`.
- Must not break determinism of engine tests: `board-effects.ts` is client-only and never touches engine state.
- `onFrame` must tolerate `prev === null` (first tick after start) — no-op in that case.
- Bounds on ParticleSystem set to the board rectangle so particles don't render outside the overlay.
- The dev/test global `window.__boardEffects__` is only populated when `isDevOrTest()` (mirror pattern from use-atmosphere).

## 7. Edge cases

- **Line clear + lock on the same tick.** Lock predicate currently gates on `linesDiff === 0`; line-clear locks therefore do *not* fire a lock pulse. Keeping this behavior (the dissolve already visually anchors the lock). Noted in code comment.
- **Game over on lock (topOut).** `curr.status === "gameOver"` — skip spawning lock/clear effects (avoid noisy end-of-game burst). Flash/dissolve for the final clear *is* allowed if `linesDiff > 0` to celebrate the last move.
- **Hard drop into a line clear.** `onHardDropIntent` is called before the tick; the subsequent `onFrame` will then fire the line clear dissolve. Both effects should stack — they use disjoint particles.
- **Paused state.** When `status === "paused"`, `onFrame` no-ops (diff is trivially empty since state is frozen).
- **Piece color vs theme color.** The spec says "theme colors"; we intentionally ignore `PIECE_COLORS` from `BoardCanvas`.
- **Buffer rows.** Clears can include rows in the buffer (row index < `BUFFER_HEIGHT`). We only flash cleared rows whose visible index is ≥ 0; buffer-row clears are detected but render offscreen (culled by bounds).
- **Multiplayer snapshot rate.** `MultiplayerGameShell` builds `GameState` via `snapshotToGameState` each RAF — diffing still works since scoring/line totals are monotonic.

## 8. Ambiguities (all resolved)

- *"Screen-wide flash" for tetris:* implemented as an oversized white particle on the effects canvas (no new DOM overlay). Resolved — keeps the "effects canvas only" constraint.
- *Effect duration tuning:* fixed by spec above; human-testable per task description.
- *How to detect cleared row indices (not on LineClearEvent):* recover by diffing `prev.board` full-rows vs `curr.board`. Resolved.
- *Whether multiplayer shell needs the same effects:* yes, for parity with solo. Resolved.

No **[UNRESOLVED]** items.

## 9. Test plan

**Unit (`board-effects.test.ts`):**
- Given prev/curr with `scoring.lines` delta 1 and one row that was full → exactly one lineClear event, N particles emitted on the ParticleSystem (count > 0).
- Delta 4 → tetris event, > than 1×single-clear count.
- Queue shift + no lines delta → lock event at piece position.
- `onHardDropIntent` → emits a vertical trail of particles covering the drop span.
- `prev === null` → no emissions.
- Paused state → no emissions.
- Theme-color assertion: emitted particles' colors come from the provided theme's `particleColors`/`accent`.

**E2E (`board-effects.spec.ts`):**
- Sanity: `window.__boardEffects__` exposed in dev/test and non-null after gameplay.
- Smoke: after a few inputs, particle system count advances (>0).
