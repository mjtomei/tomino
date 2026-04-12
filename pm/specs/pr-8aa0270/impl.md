# pr-8aa0270 — Particle System

## Requirements

1. **Engine** `packages/client/src/atmosphere/particle-system.ts`
   - Class `ParticleSystem` with: `emit(config, position, count)`, `update(dt)`, `render(ctx)`, `clear()`, `count()`.
   - Particle record: position, velocity, age, lifetime, shape, color, size, sizeCurve, fade, gravity, trail history.
   - Shapes: `circle | square | diamond | line | star` (extends existing `ParticleShape` in `themes.ts` which currently is `circle | square | triangle | star`). Add `diamond | line`, keep `triangle` for compat.
   - Update: integrate velocity + gravity, age+=dt, cull when `age>=lifetime` or outside bounds (if provided).
   - Render: per-shape draw fn; scale via curve; alpha via fade curve; optional trail rendering (draws prior positions with decaying alpha).

2. **React overlay** `packages/client/src/atmosphere/ParticleCanvas.tsx`
   - Component `<ParticleCanvas system width height />` renders an absolutely positioned canvas and drives RAF loop calling `system.update(dt)` and `system.render(ctx)`.
   - Does not own the system — parent creates it via `useRef(new ParticleSystem())`.

3. **Event-triggered, not timer** — engine exposes `emit()` only; no internal scheduling. Integration into GameShell is **out of scope** for this PR per "Does not render anything on its own".

4. **Unit tests** `packages/client/src/atmosphere/__tests__/particle-system.test.ts`
   - Spawn, lifetime expiry, velocity/gravity integration, bounds culling, emit-from-trigger (calling emit in response to a synthetic event increments count).

5. **E2E** `e2e/particle-system.spec.ts` — smoke that a page using ParticleCanvas mounts and its canvas is in the DOM. Since the system isn't wired into the game yet, this is minimal.

## Implicit requirements
- TS strict / `noUncheckedIndexedAccess` — careful with array access.
- Deterministic-ish: accept optional RNG function in config so tests are stable.
- Canvas overlay must be `pointer-events: none` so it doesn't eat clicks.
- RAF cleanup on unmount to avoid leaks.
- Use `ParticleStyle` palette colors when emitting from theme (caller responsibility).

## Ambiguities (resolved)
- **Scale curve** — interpret as `[startScale, endScale]` lerped by `age/lifetime`. Same for `fade` (alpha start/end).
- **Trail length** — config `trailLength: number` (history frames). Default 0 (no trail).
- **Coordinate space** — canvas pixel coords; caller transforms board cells to px.
- **Color** — single color per emission; caller picks from palette. Keeps engine simple.

## Edge cases
- dt=0, very large dt (clamp to 0.1s) to avoid tunneling.
- count=0 emit is a no-op.
- No particles → render clears canvas only.
- Bounds not provided → no culling (cull only on lifetime).
