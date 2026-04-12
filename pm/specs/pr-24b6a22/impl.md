# pr-24b6a22 — Multiplayer atmosphere integration spec

## Requirements (grounded)

1. **Garbage incoming → "pressure" particles drifting toward local board**
   - `packages/client/src/atmosphere/atmosphere-engine.ts` already emits a
     `garbageReceived` event (lines 115–123) when
     `signals.multiplayer.garbageReceivedTotal` increases. No visual is
     produced — `event-bursts.ts:120` explicitly skips it. We will:
     - Keep the engine event.
     - Add a new `multiplayer-effects.ts` module that turns
       `garbageReceived` events into particle emissions via
       `ParticleSystem.emit`, drifting toward the local board center from
       an opponent direction.

2. **Opponent elimination → distant shockwave ripple**
   - Extend `AtmosphereEngine` so a delta in
     `MultiplayerSignals.eliminations` produces a new
     `opponentEliminated` event (with `magnitude = delta`).
   - `multiplayer-effects.ts` maps this to a long-duration, low-opacity
     `ripple`-style burst originating from an offset direction (the
     aggregated opponents' side).

3. **Garbage sent by local player → outward burst toward target**
   - Extend `AtmosphereEngine` so a delta in `MultiplayerSignals.garbageSent`
     produces a new `garbageSent` event. `multiplayer-effects.ts` maps it
     to an outward particle burst from the local board center toward the
     targeted opponent's direction.

4. **Match intensity aggregation**
   - Add a `computeMatchIntensity(mp)` function in `multiplayer-effects.ts`:
     aggregates `opponentCount`, `garbageSent + garbageReceivedTotal`, and
     `eliminations` into a 0..1 scalar.
   - `AtmosphereEngine.computeIntensity` currently uses `level*0.6 +
     stack*0.4`. In multiplayer it will blend in `matchIntensity` (a 25%
     contribution) so background density/saturation reflect the match.
     Solo games (`multiplayer === undefined`) are unchanged.

5. **GameMultiplayer wiring**
   - `packages/client/src/ui/GameMultiplayer.tsx` currently owns
     `opponentSnapshots`, `attackPowers`, `localPendingGarbage`,
     `targetingStates`. It does NOT currently feed MultiplayerSignals to
     the atmosphere engine (see `GameShell.tsx:315` — the multiplayer loop
     calls `gameStateToSignals(state, { pendingGarbage })` only).
   - Approach: thread a `getMultiplayerSignals: () => MultiplayerSignals
     | undefined` callback down through `GameShell` →
     `MultiplayerGameShell`. `GameMultiplayer.tsx` computes
     MultiplayerSignals from its props on each render and stashes them in
     a ref that the callback reads. The game-loop tick passes them into
     `gameStateToSignals`.
   - A lightweight `multiplayer-effects` subscription inside
     `GameMultiplayer.tsx` listens for the new atmosphere events via a
     new helper and emits particles through the existing
     `ParticleSystem` on the `GameShell`. (Scoped: the simplest wiring is
     a `useEffect` that, each frame via `requestAnimationFrame`, reads
     `useAtmosphere().events` and dispatches into `multiplayer-effects`.)

6. **Tests**
   - `packages/client/src/atmosphere/__tests__/atmosphere-engine.test.ts`
     — add tests for `opponentEliminated` and `garbageSent` event edges
     plus matchIntensity modulation (when multiplayer signals present).
   - New `packages/client/src/atmosphere/__tests__/multiplayer-effects.test.ts`
     — unit-tests `computeMatchIntensity`, `computeOpponentDirection`,
     and `createMultiplayerBursts` (verifying particle emission counts
     and direction math).
   - New `e2e/multiplayer-atmosphere.spec.ts` — boots a 2-player room,
     plays enough to cause garbage exchange, polls
     `window.__atmosphere__` for non-zero `intensity` and for
     `garbageReceived`/`opponentEliminated` events.

## Implicit Requirements

- Pure atmosphere engine remains decoupled from React/DOM — new logic in
  `multiplayer-effects.ts` must also stay pure for unit testing; only the
  GameMultiplayer integration touches particle systems.
- Solo mode must not regress: new intensity blending requires
  `signals.multiplayer` to exist and have non-zero data before it
  contributes.
- Engine must only emit the new events while both prev and current are
  `status === "playing"` and `prev` exists, matching the guard at
  `atmosphere-engine.ts:96`.
- Event payloads keep the existing `{ type, magnitude }` shape to avoid
  breaking `event-bursts.ts:createBursts` switch. New event types simply
  fall through (no burst) — their visuals come from `multiplayer-effects`.
- `AtmosphereEventType` additions propagate through
  `event-bursts.ts:createBursts` as no-op cases to satisfy exhaustiveness
  (and `opponent-reactions.ts` already deals with per-opponent reactions
  and is separate from engine events).

## Ambiguities (resolved)

- **"Direction of the attacker's opponent board"** — `GarbageBatch` has
  no source player id. **Resolution:** derive direction from the
  `attackersSet` currently computed in `GameMultiplayer.tsx:84`. If empty,
  use the midpoint of all opponents. Opponent layout is a vertical column
  to the right of the player, so direction vectors are approximated as
  `{ x: +1, y: (slot - (N-1)/2) * 0.5 }` normalized. Determinism is
  preserved by using the opponent order from `room.players`.
- **Match intensity scale** — `opponentCount` caps at 8, combined garbage
  caps at ~40, eliminations at `opponentCount`. **Resolution:** each
  component contributes up to 0.5 then clamped; formula:
  `clamp01(opponentCount/8 * 0.3 + totalGarbage/40 * 0.4 +
  eliminations/max(1,opponentCount) * 0.3)`.
- **Intensity blend weight** — 25% seems reasonable. Solo games unaffected
  since `multiplayer === undefined` skips the blend.
- **Burst types** — reuse `ParticleSystem` from
  `opponent-reactions.ts` rather than the full-board `Burst` system, since
  `event-bursts.ts` already special-cases around screen rather than
  spatial direction. `multiplayer-effects.ts` emits particles with
  explicit velocity vectors.

## Edge Cases

- Pause/gameOver: engine already halts continuous updates and guards
  events behind `status === "playing"` on both ends.
- Engine reset: extended test ensures new event types don't fire across
  reset boundaries.
- Missing `multiplayer` prop in subsequent tick after being set:
  treat as unchanged (no spurious delta events) — use `?? prev?.multiplayer`
  defaults to 0.
- First tick with multiplayer signals: no events, only baseline stored.
- `garbageReceivedTotal` monotonic: decreasing values (e.g., from a
  server reconcile) are ignored (no negative event).
- E2E test must tolerate timing jitter: poll with a timeout rather than
  asserting exact tick.
