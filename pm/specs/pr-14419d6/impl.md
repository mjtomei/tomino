# pr-14419d6 — Screen Effects (vignette, shake, flash)

## Requirements

1. **Danger vignette** — dark reddish vignette intensity grows with
   `AtmosphereState.danger` (0..1, quadratic against stack height per
   `atmosphere-engine.ts#computeDanger`). Tinted toward a blend of
   `theme.palette.accent` and deep red.
2. **Screen shake** — brief displacement (2–4 px) on:
   - `garbageReceived` atmosphere event (magnitude = lines received).
   - Hard drop (not emitted by atmosphere engine — must be sourced from
     GameShell input path where `executeAction(engine, "hardDrop")` is
     called, and from the multiplayer `sendAction("hardDrop")`).
3. **Screen flash** — white flash on `lineClear` atmosphere event, opacity
   scales with magnitude (1..4 lines).
4. **Wrapper component** — `ScreenEffects.tsx` wraps the `.game-layout`
   subtree inside `GameShell.tsx` for both Solo and Multiplayer shells.
   Uses CSS transform for shake, absolutely positioned overlay divs for
   vignette and flash (pointer-events: none).
5. **Pure computation module** — `screen-effects.ts` exports:
   - `computeVignetteOpacity(danger)` → 0..~0.55
   - `computeVignetteColor(accent, danger)` → CSS color
   - `computeShakeMagnitude(eventType, magnitude)` → px (garbage: 2–4,
     hardDrop: 2)
   - `computeFlashOpacity(lines)` → 0..~0.5
   - `decayTransient(current, dtMs, halfLifeMs)` → new value
6. **Tests**
   - Unit: `screen-effects.test.ts` covers the pure functions and decay.
   - E2E: `e2e/screen-effects.spec.ts` smoke — loads solo game, asserts
     ScreenEffects overlay nodes exist and `data-*` attributes reflect
     atmosphere state.

## Implicit Requirements

- Must not obscure the board center or interfere with input (overlays use
  `pointer-events: none`).
- Shake translation applied to the inner `.game-layout`, not outer
  `.game-shell`, so back button & overlays stay anchored.
- Decay driven by `requestAnimationFrame` inside ScreenEffects; no new
  game-loop plumbing required.
- `useAtmosphere()` returns a fresh object each tick the state materially
  changes, so reading `events` in a `useEffect` with `[events]` dep works.
- Respect `prefers-reduced-motion`: if set, disable shake and damp flash.

## Ambiguities (resolved)

- **Hard-drop sourcing**: atmosphere has no hardDrop event. Resolution: a
  tiny imperative API — `ScreenEffects` exposes a `triggerShake()` via a
  ref, and GameShell calls it in the hardDrop branch of `executeAction`
  and the multiplayer keydown handler. Alternative (extending atmosphere
  types) is broader in scope than this PR.
- **Vignette color**: blend `accent` with `#ff2030` weighted by danger so
  the red dominates only at high danger; at low danger, tinted toward
  accent to stay themed.
- **Shake duration**: ~180 ms exponential decay (half-life ~60 ms).
- **Flash duration**: ~220 ms exponential decay.

## Edge Cases

- Multiple line-clear events in one tick: pick max magnitude.
- Simultaneous garbage + line clear: shake and flash both active (they
  use separate channels).
- `atmosphereReset()` during a Solo restart: transient effect values
  should also drop to 0 — handled by clearing internal refs on unmount
  of ScreenEffects (Solo remounts the game layout between runs is not
  actually how it works — layout persists — so we additionally clear on
  `danger` dropping from near-1 to 0 in one tick).
- Reduced motion: skip shake; cap flash opacity.
