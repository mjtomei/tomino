# Spec: Board life — idle animations (pr-e46a8a0)

## Requirements (grounded)

1. **Shimmer on placed cells.** In `renderBoard()` at
   `packages/client/src/ui/BoardCanvas.tsx:163` the placed-cell loop draws each
   non-empty board cell via `drawCell(..., PIECE_COLORS[cell])`. We will
   compute a time/atmosphere-driven color offset per-cell (hue cycled through
   nearby hues, ~2% amplitude on lightness and a small hue delta) and pass that
   adjusted color into `drawCell`.

2. **Grid-line pulse.** The grid-line loop at `BoardCanvas.tsx:246-261` sets
   `ctx.strokeStyle = GRID_LINE_COLOR`. We will instead derive a pulsing
   strokeStyle based on `time + atmosphere.intensity`, gently modulating the
   line alpha (and slightly tinting with theme `gridLine` if available).

3. **Occasional specular glints.** A slow diagonal "sweep" that briefly
   highlights a band of cells. Scheduled deterministically from `time` so it
   can be unit-tested: every `GLINT_INTERVAL_MS` a glint starts, lasts
   `GLINT_DURATION_MS`, and affects cells whose diagonal position matches the
   sweep head within a falloff width.

4. **Breathing highlights.** The highlight (top/left edge) amount in
   `drawCell()` is currently fixed at 0.35. We will scale this by a slow
   breathing factor (0.9 → 1.1) driven by `time`.

5. **Theme-driven shimmer palette.** Shimmer hue center is taken from the
   theme's `palette.accent`, and the hue excursion is bounded (~±12°) so the
   cell never shifts away from its base color meaningfully.

6. **Additive / baseline preserved.** With `now=0, intensity=0, glint=none`
   all modifiers must return `0` offset so static snapshots still match.

7. **Pure module.** All math lives in
   `packages/client/src/atmosphere/board-life.ts` exporting:
   - `hexToHsl(hex)` / `hslToHex(h,s,l)`
   - `computeShimmer(baseHex, nowMs, intensity, cellSeed, accentHex?)` → hex
   - `computeGridPulse(nowMs, intensity)` → `{ alpha: number }`
   - `computeBreathe(nowMs, intensity)` → number (highlight multiplier)
   - `computeGlint(nowMs, boardWidth, boardHeight)` →
     `{ active: boolean, headCol: number, headRow: number, strength: number }`

8. **Tests.**
   - `packages/client/src/atmosphere/__tests__/board-life.test.ts` — unit
     tests for determinism, amplitude bounds, baseline preservation, glint
     scheduling windows, theme-accent driving hue.
   - Extend `packages/client/src/__tests__/BoardCanvas.test.tsx` — smoke
     assertion that optional props are accepted and rendering still succeeds
     when atmosphere + theme are passed.
   - `e2e/board-life.spec.ts` — boot a solo game, poll that the board canvas
     continues to repaint (rAF keeps firing) even with no input for ~1s.

## Wiring

- `BoardCanvas` gains optional props: `atmosphereIntensity?: number`,
  `themePalette?: ThemePalette`. When absent, idle animation still runs using
  intensity=0 and `PIECE_COLORS`-based colors (no accent hue shift).
- `renderBoard` gets a new optional `life` argument carrying `now`, those two
  values, and the precomputed `glint`, so the existing renderBoard tests still
  call it without changes (defaults used).
- The `draw()` rAF loop (`BoardCanvas.tsx:334-351`) currently only keeps
  ticking when `anim.animating`. Idle animations need a continuous rAF, so we
  will keep `rafRef` ticking unconditionally while the component is mounted.
- `GameShell.tsx` passes `useAtmosphere().intensity` and `useTheme().theme.palette`
  down to both `BoardCanvas` instances.

## Implicit requirements

- Must not regress existing BoardCanvas snapshot tests (they don't pass
  atmosphere/theme → defaults must produce visually-identical static output at
  `now=0`).
- rAF loop must stop on unmount. Existing `useEffect` cleanup already handles
  this; we just need to make the loop self-rescheduling.
- Deterministic glints: use `Math.floor(now / interval)` as epoch, avoid
  `Math.random`.
- Hue math must tolerate the existing hex constants (`#00D4D4` etc.).

## Edge cases

- Grid-line alpha must stay within `[0, 0.2]` so lines don't pop. Use max
  ~0.12.
- Shimmer amplitude on value/lightness capped at 2% so baseline color stays
  recognisable.
- Glint strength multiplies a highlight overlay — must not exceed the
  existing lighten amount so it never looks like a lock flash.
- `hexToHsl` expects `#rrggbb`; the only non-hex color in the stack is
  `GRID_LINE_COLOR` (`rgba(...)`). We keep grid pulsing via a separate
  rgba-compose path.

## Ambiguities (resolved)

- "Nearby hues" — resolved as ±12° hue excursion around base, centered
  slightly toward theme accent hue (10% pull) so theme colour bleeds in.
- "Occasional glints" — one glint every 7s, lasting 900ms, sweeping the
  board diagonally; density independent of atmosphere but *strength* scales
  mildly with intensity.
- "Breathe slowly" — 4s period, amplitude ±10% of existing highlight amount.

No **[UNRESOLVED]** items.
