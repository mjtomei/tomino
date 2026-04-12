# pr-49e8aee — Flow state detection & Zone mode

## Requirements (grounded)

1. **New module `packages/client/src/atmosphere/flow-detection.ts`** exporting a `FlowDetector` class with a `update(signals, nowMs) → FlowReadout` API and `reset()`. Pure, no DOM/React.
2. **Extend `AtmosphereState`** in `packages/client/src/atmosphere/types.ts` with a `flow` field:
   - `active: boolean` — currently in Zone
   - `level: number` — 0..1 smoothed flow score (for visual intensity)
   - `sustainedMs: number` — how long score has been above entry threshold
3. **Wire `FlowDetector` into `AtmosphereEngine.update`** (`atmosphere-engine.ts`), owning one instance, resetting on engine reset, and populating `state.flow`. Use a clock injection (`now: () => number`) so tests are deterministic; default to `Date.now`.
4. **Detection inputs** (from existing `GameSignals`, no new fields required):
   - **Clears per minute** — rolling window of `linesCleared` deltas over last 30s.
   - **Combo maintenance** — `signals.combo >= 0` sustained.
   - **Back-to-back maintenance** — `signals.b2b >= 0` adds bonus.
   - **Low max stack height** — average `stackHeight` over window ≤ 12.
   - **No break events** — a flow-breaking event resets the sustained timer:
     - `stackHeight` climbing above 16 (danger zone)
     - combo dropping from >0 to -1 without a clear that tick (proxy for misdrop: "missed a clear")
     - `status` transitioning out of `playing`
     - `garbageReceived` event of ≥2 lines
5. **Entry / exit thresholds (hysteresis)**
   - Entry: flowScore ≥ 0.72 sustained for ≥ 4000 ms → `active = true`.
   - Exit: flowScore < 0.45 for ≥ 800 ms, OR hard break event → `active = false` immediately on hard break, smoothly after timeout on soft decay.
   - Smoothing: `level` lerps toward raw flowScore at τ ≈ 250ms so visuals don't flicker.
6. **Atmosphere output modulation** — `computeBackgroundParams` in `background-renderers.ts` should, when `atmosphere.flow.active`, boost `density`, `speed`, and desaturate danger-shift (flow should not look dangerous), and increase color saturation. Flow `level` (the smoothed 0..1) scales the boost so entry/exit is smooth.
7. **Music** — `MusicEngine.sync` already receives `AtmosphereState`. When flow is active, apply a small layer-gain boost (extra harmonic layer = activate all genre layers unconditionally) and keep scale unshifted by danger. Minimum invasive change: in `updateLayerTargets` treat `isLayerActive` as `true` when `flow.active`; in `scheduleStep` use `shiftScale` with danger=0 when `flow.active`.
8. **Aura around board** — add a lightweight CSS/DOM indicator via a new export the existing `GameShell` can use. Minimum scope: extend `AtmosphereState.flow` so a consumer can render it; add a small `FlowAura` overlay (or a class on body) keyed off `atmosphere.flow.active`. *Scope trim:* rather than a new component, we add `data-flow="active"` on `document.body` from `use-atmosphere.ts` and a CSS rule. Actually simplest: expose `flow` via `window.__atmosphere__` (already happens since we extend state) and update existing `ScreenEffects` to render the aura when `state.flow.active`.
9. **Unit tests** — `__tests__/flow-detection.test.ts`:
   - Rolling-window accumulates/decays.
   - Entry requires sustained duration (hysteresis).
   - Hard break (topout/big garbage) exits immediately.
   - Flow persists across brief dips (soft decay window).
   - Snapshot test: sequences-that-should and should-not trigger flow.
10. **Atmosphere-engine unit test** — extend `atmosphere-engine.test.ts` with cases verifying `state.flow` is populated and that a long skilled sequence sets `flow.active = true`.
11. **E2E test** — `e2e/flow-state.spec.ts`: no real gameplay can reliably hit flow; instead drive `window.__atmosphere__` injection via a dev-only test helper, OR drop to the unit-test level and only verify `window.__atmosphere__.flow` exists. Simplest: check `flow` field exists and defaults to `{ active: false, level: 0, sustainedMs: 0 }` in the initial readout.

## Implicit Requirements

- `INITIAL_ATMOSPHERE_STATE` must include `flow` defaults so React initial render doesn't crash.
- `use-atmosphere.ts` `changed` comparison must consider `flow.active` edges so React re-renders on flow entry/exit.
- Existing snapshot tests in `atmosphere-engine.test.ts` still pass — they destructure only `intensity/danger/momentum`, so adding `flow` is safe.
- Background-renderers `computeBackgroundParams` tests (if any) must still pass: change guarded behind `flow.active` default false.

## Ambiguities (resolved)

- *"No misdrops"* — no explicit misdrop signal exists. Resolved: treat a combo drop from >0 → -1 as a missed-clear proxy; this is the game-engine's definition of combo break.
- *"Clean placements"* — no per-placement signal. Resolved: use stack-height stability + clears-per-minute as the combined proxy.
- *"Aura around the board"* — resolved to minimum-scope addition on `ScreenEffects` (it already renders a screen-wide overlay).
- *E2E detection sensitivity* — a true end-to-end "play well for 30s" test is flaky. Resolved: e2e spec only asserts the data contract (flow field present, default values, still reachable after some play).

## Edge cases

- Paused / idle — detector should freeze its window (not count time) rather than decay toward zero and drop flow on pause. Implementation: skip window updates and sustain-timer advancement when `status !== 'playing'`, but keep `flow.active` for one pause frame so resuming feels continuous.
- `reset()` — must clear detector window and exit flow.
- Clock going backwards (tests) — guard with `max(0, now - last)`.
- First update — no previous snapshot; flowScore = 0, sustain = 0.
