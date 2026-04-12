# pr-3fc952c — Event burst visuals

## Requirements

1. **Event detection from atmosphere signals.**
   The existing `AtmosphereEngine` (`packages/client/src/atmosphere/atmosphere-engine.ts`)
   already emits a per-tick `events` array containing `lineClear`, `tSpin`,
   `tetris`, `levelUp`, and `garbageReceived`. `event-bursts.ts` must convert
   those `AtmosphereEvent`s (plus the prior `GameSignals` for combo/b2b
   context) into concrete `Burst` objects with geometry metadata and a start
   time. Combo streak bursts fire on `lineClear` when combo > 0; back-to-back
   bursts fire when `b2b` transitioned from ≤0 to >0 or increased (a b2b
   continuation/start).

2. **Burst types and visual language.**
   - **T-spin**: radial starburst — N rays emanating from the T-piece position
     (approximated to board center for now; see Ambiguities). Ray count scales
     with `linesCleared`.
   - **Combo streak**: concentric ripples — ripple radius and color index
     escalate with combo count.
   - **Back-to-back**: horizontal sweep — a color wave traveling left→right.
   - **Level up**: chromatic shift — a brief full-screen color tint.
   No text or numbers; palette colors sourced from the current theme.

3. **Geometry computation helpers, pure + testable.**
   `event-bursts.ts` exports:
   - `createBurst(event, signals, now, palette)` → `Burst`
   - `rippleRadius(burst, now)` → current radius
   - `starburstRays(burst)` → `{ count, angles }`
   - `sweepOffsetX(burst, now, width)` → x position of the wave front
   - `chromaticAlpha(burst, now)` → 0..1 overlay alpha
   - `isBurstDone(burst, now)` → boolean
   - `detectBursts(events, signals, now, palette)` → `Burst[]`
   All pure functions, no DOM.

4. **Rendering component.**
   `EventBurstCanvas.tsx` is a React canvas overlay, analogous to
   `ParticleCanvas.tsx`. It subscribes to atmosphere state via
   `useAtmosphere()`, maintains an internal list of active bursts, appends
   new ones when `state.events` contains relevant entries, renders each
   burst every rAF frame, and drops finished bursts. It sources the theme
   palette from `useTheme()`.

5. **Integration.**
   `EventBurstCanvas` is mounted inside the game-board container in
   `GameShell.tsx` (both solo and multiplayer shells), layered above
   `BoardCanvas` like `ParticleCanvas` would be.

6. **Unit tests** (`packages/client/src/atmosphere/__tests__/event-bursts.test.ts`):
   - `detectBursts` maps each `AtmosphereEvent` type to the correct `Burst` kind.
   - `detectBursts` emits a combo burst when linesCleared+combo>0 and escalates
     magnitude with combo count.
   - `rippleRadius` grows monotonically from 0 then plateaus/ends.
   - `starburstRays` ray count correlates with magnitude.
   - `sweepOffsetX` moves from left edge to right edge over duration.
   - `chromaticAlpha` peaks then decays.
   - `isBurstDone` returns true after duration elapses.

7. **E2E test** (`e2e/event-bursts.spec.ts`):
   Smoke test that imports `event-bursts.ts` from the client bundle and
   exercises the pure functions (matches `particle-system.spec.ts` pattern).

## Implicit Requirements

- The canvas overlay must not capture pointer events (`pointer-events: none`),
  to match `ParticleCanvas`.
- New bursts must be appended without replacing in-flight ones (multiple
  combos in a streak overlap).
- `useAtmosphere()` returns a state whose `events` is cleared each tick —
  the component must append on each change, not diff against a stable list.
  Tracking by reference (effect on `state.events`) works because a new
  array is produced each tick.
- When the game resets, in-flight bursts should be cleared. Use
  `state === INITIAL_ATMOSPHERE_STATE` (momentum/danger/intensity all 0)
  plus a monotonic "last reset" heuristic: clearing on unmount is sufficient
  because `AtmosphereProvider` replaces state on reset but the canvas stays
  mounted. We clear the local bursts list when the atmosphere state
  transitions to all-zero values after being non-zero.
- Theme palette lookup must tolerate palettes with as few as 1 particle
  color (the `void` theme has 2 particle colors — the minimum acceptable
  per `validateTheme`).

## Ambiguities

- **T-spin burst origin** — the task says "emanating from the T-piece
  position," but `GameSignals` does not carry the piece position, and
  plumbing it through would expand scope beyond `event-bursts.ts`.
  **Resolution:** emanate from the board center. The burst is abstract,
  so an approximated origin still reads as "thing happened on the board."
  A follow-up PR can plumb piece coordinates through signals if needed.

- **Level-up chromatic shift scope** — "entire background" vs the board
  area. The canvas lives inside the board container, matching
  `ParticleCanvas` placement. **Resolution:** the chromatic overlay fills
  the canvas (board area), not the entire viewport. A full-viewport overlay
  would require a new DOM layer outside `GameShell` and expand scope.

- **Burst durations** — not specified. **Resolution:**
  ripple 700ms, starburst 600ms, sweep 800ms, chromatic shift 500ms.
  Tuned for "brief" per the task.

## Edge Cases

- `lineClear` with `tSpin` produces both a `lineClear` and `tSpin` event in
  the same tick — `detectBursts` emits both the combo ripple and the
  starburst, which is desired (tspin-triple is extra flashy).
- `tetris` events coincide with `lineClear` linesDelta>=4 — detectBursts
  emits both a combo ripple and ... actually a `tetris` event has no
  dedicated burst in the task spec. **Resolution:** map `tetris` to a
  larger/brighter combo ripple (same geometry kind, higher magnitude).
- Multiple bursts active simultaneously — canvas renders all in z-order of
  creation.
- Combo counter = 0 on a single line clear after a drought — still emits a
  small combo ripple (magnitude 1). Task says "escalating concentric
  ripples," implying combo must be >0; I'll gate combo bursts on
  `combo >= 1` to match "streak" semantics. Single clears without a streak
  still get a tiny ripple to confirm the line clear visually.
- `garbageReceived` — the task does not describe a burst for this; ignore it
  in `detectBursts` (no visual), so garbage remains the particle system's
  job.
- Paused/gameOver — `AtmosphereEngine` already suppresses events outside
  "playing" state. No extra handling needed.
