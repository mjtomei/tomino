# pr-9ced1e0 — Background canvas layer

## Requirements

1. **`background-renderers.ts`** — Pure module that computes per-frame
   background geometry/appearance from `(AtmosphereState, Theme, time, size)`.
   Exports:
   - `computeBackgroundParams(atmosphere, theme)` → derived params
     (`density`, `speed`, `hueShift`, `warmth`, `agitation`, `colors`).
     Low intensity → sparse/slow/cool; high intensity → dense/fast/warm;
     high danger → colors shifted toward red/dark + agitation.
   - `renderBackground(ctx, params, theme, size, tMs)` → draws a gradient
     field plus one of `theme.geometry.pattern` = `grid | hexagons | waves |
     stars | none`. Uses `theme.palette.backgroundGradient` and
     `particleColors`. Respects `theme.geometry.density/movement` as
     baseline multipliers.
   - Helper: `mixColor(hex, hex, t)` and `shiftTowardDanger(hex, danger)`
     used by tests.

2. **`BackgroundCanvas.tsx`** — React component (`<BackgroundCanvas />`).
   - Fullscreen fixed canvas (`position: fixed; inset: 0; z-index: 0;
     pointer-events: none`).
   - Sizes canvas to `window.innerWidth/innerHeight` with DPR scaling,
     re-fits on resize.
   - Subscribes to `useAtmosphere()` + `useTheme()`. Runs a
     `requestAnimationFrame` loop calling `renderBackground`. Reads
     atmosphere via a ref so the rAF loop isn't torn down per-state.
   - Guards: if `getContext("2d")` returns null or size is 0, bail.
   - `data-testid="background-canvas"`.

3. **GameShell integration** — Mount `<BackgroundCanvas />` as first child
   of `.game-shell` div in both `SoloGameShell` and `MultiplayerGameShell`
   (and the start-screen branch). `.game-shell` already has
   `position: relative`. Existing content must render above
   (explicit `z-index: 1` on `.game-layout`, `.back-btn`, `.start-screen`
   wrappers as needed) so the background never overlays interactable UI.

4. **Lobby / menu integration** — Lobby uses inline styles. Add
   `<BackgroundCanvas />` inside the Lobby container (and PlayerNameInput
   screen via App wrapper for disconnected/name screens). Keep the
   existing `#1a1a2e` fallback background but overlay the canvas.

5. **Tests**
   - Unit: `background-renderers.test.ts` asserting:
     - Low atmosphere → lower density/speed than high atmosphere.
     - Rising danger → color palette warmth shifts toward red.
     - `mixColor` boundary cases (t=0, t=1).
     - Deterministic output given same inputs (pure function).
   - Component: `BackgroundCanvas.test.tsx` mounts the component inside
     AtmosphereProvider + ThemeProvider and asserts the canvas element
     renders without error and has `data-testid`.
   - E2E: `e2e/background-atmosphere.spec.ts` — starts solo game and
     checks `[data-testid="background-canvas"]` is visible.

## Implicit Requirements

- Must not block user input: `pointer-events: none`.
- Must not be torn down on every atmosphere update — use refs for state
  read inside the rAF loop.
- Must clean up rAF + resize listener on unmount.
- Performance: cap geometry elements at a reasonable max so low-end
  devices don't choke (e.g. ≤200 elements at max density).
- SSR-safe: guard `window`/`canvas` access.
- `getContext` may fail in jsdom (it returns a stub); component tests
  tolerate missing context methods — we call with safe fallbacks.

## Ambiguities (resolved)

- *"Integrated into lobby/menu screens"* → mount in `Lobby.tsx` and the
  name-input screen wrapper within `App.tsx`. Start screen is already
  inside `GameShell` so it's covered by the GameShell mount.
- *Which renderer patterns?* Four primitives matching
  `GeometryPattern`: grid, hexagons, waves, stars. `none` = just
  gradient.
- *Atmosphere reactivity cadence?* Read atmosphere via ref each frame;
  no explicit throttling — the engine already dedupes updates.
- *Z-index* for background: `z-index: 0` on the canvas, `.game-layout`
  defaults (auto, which stacks above in the flow because canvas is
  fixed). We'll add `position: relative; z-index: 1` on `.game-layout`
  defensively.

## Edge Cases

- Window resize during a game: re-fit canvas without losing the loop.
- Tab backgrounded: `requestAnimationFrame` auto-pauses — nothing to do.
- `vi.useFakeTimers()` in tests: rAF may not fire — unit tests don't
  exercise the loop; component test only checks mount.
- Multiple mounts (StrictMode): each instance starts its own rAF; guard
  with the cleanup already in place.
