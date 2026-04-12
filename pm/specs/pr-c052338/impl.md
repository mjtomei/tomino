# Atmosphere Engine — Implementation Spec

## Requirements (grounded)

1. **Reactive state machine** — Pure computation module `packages/client/src/atmosphere/atmosphere-engine.ts` exposing a class `AtmosphereEngine` with `update(signals: GameSignals): AtmosphereState`. No React/DOM imports; deterministic so snapshot tests are stable.

2. **Signal inputs** read from the engine's `GameState` (`packages/shared/src/engine/engine.ts`) and lobby state (`packages/client/src/net/lobby-client.ts`):
   - `status` from `GameState.status` ("idle"|"playing"|"paused"|"gameOver")
   - `level` from `GameState.scoring.level`
   - `gravity` / speed — derived: treat level-to-gravity mapping as `min(1, level / 20)` since the shared engine uses a guideline curve indexed by level.
   - `stackHeight` — derived from `GameState.board`: `BOARD_VISIBLE_HEIGHT - firstNonEmptyRowFromTop`, clamped to [0, BOARD_VISIBLE_HEIGHT].
   - `combo` from `scoring.combo` (-1 meaning inactive)
   - `b2b` from `scoring.b2b`
   - `pendingGarbage` — total lines in `GarbageBatch[]` passed in (multiplayer feed) or from snapshot if solo.
   - `lastLineClear?: LineClearEvent` — optional; provided by caller via `engine.consumeLineClearEvent()` so atmosphere can detect tSpin/tetris events without reaching into engine internals.
   - Multiplayer: `opponentCount`, `eliminations`, `garbageSent`, `garbageReceivedTotal`.

3. **Outputs** — `AtmosphereState`:
   - `intensity: number` 0..1 — blend of normalized level and speed (level weight 0.6, stack weight 0.4).
   - `danger: number` 0..1 — `stackHeight / BOARD_VISIBLE_HEIGHT` with a soft ramp (quadratic) so danger only climbs past ~0.5 near the top, plus a small contribution from `pendingGarbage`.
   - `momentum: number` 0..1 — `clamp((max(0, combo) * 0.12) + (max(0, b2b) * 0.15), 0, 1)`.
   - `events: AtmosphereEvent[]` — fired only this tick. Types: `lineClear`, `tSpin`, `tetris`, `levelUp`, `garbageReceived`.

4. **React context/hook** `packages/client/src/atmosphere/use-atmosphere.ts`:
   - `AtmosphereProvider` — holds an `AtmosphereEngine` instance in a ref, exposes state via context.
   - `useAtmosphere()` — returns current `AtmosphereState`.
   - `useAtmosphereUpdater()` — returns a `(signals) => void` function callers invoke on each game tick. Component state re-renders when any output meaningfully changes.
   - Dev/test mode: `if (import.meta.env.DEV || import.meta.env.MODE === 'test')` assign latest state to `window.__atmosphere__` on each update.

5. **Types file** `packages/client/src/atmosphere/types.ts` — `GameSignals`, `MultiplayerSignals`, `AtmosphereState`, `AtmosphereEvent`, `AtmosphereEventType`.

6. **Unit tests** (`packages/client/src/atmosphere/__tests__/atmosphere-engine.test.ts`):
   - intensity increases with level and speed
   - danger increases with stack height
   - momentum tracks combo/b2b streaks
   - events fire correctly (lineClear, tSpin, tetris, levelUp, garbageReceived)
   - multiplayer signals integrate (garbageReceived event)
   - snapshot for known game states

7. **E2E test** `e2e/atmosphere-engine.spec.ts`:
   - Drive solo game, poll `window.__atmosphere__`, assert intensity/danger/momentum cross thresholds across calm → mid → danger states. Since mounting `AtmosphereProvider` in `GameShell` is not in the file list, for this data-layer PR we just wire the provider in `main.tsx`/`App.tsx` so window exposure works, but the updater is driven by a tiny hook call inside `GameShell` we add. Actually `GameShell.tsx` is not in the files list — so we wire the updater via a small integration in `App.tsx`, which IS wrap-level and minimally invasive… Correction: the spec file list is illustrative not exhaustive. We may touch `GameShell.tsx` minimally to feed the updater.

## Implicit Requirements

- Pure engine: no DOM, no React, no timers. Deterministic.
- Engine must hold prev state to detect edge events (linesCleared delta > 0 → lineClear; scoring.level delta > 0 → levelUp; incoming garbage added → garbageReceived).
- Event list is "events this tick" — cleared every update, so consumers must react immediately.
- Clamp all continuous outputs to [0,1].
- `window.__atmosphere__` only in dev/test (production build strips).
- Hook must avoid infinite re-renders: only re-render when one of `intensity/danger/momentum` changes by >0.001 or new events fire.

## Ambiguities (resolved)

- **How to derive "speed":** Level serves as a proxy — at guideline level 20 gravity is effectively soft-drop. Use `min(1, level / 20)`.
- **tSpin detection without engine coupling:** The hook will call `engine.consumeLineClearEvent()` (existing API, engine.ts:361) and pass it to the engine updater each tick.
- **Hook data source for signals:** Since `GameShell.tsx` is the only place that owns a `TetrisEngine`, we add a small `useEffect`/tick-side call there to feed signals. Minimal footprint — read `engine.getState()` and `engine.consumeLineClearEvent()` and call the updater.
- **Multiplayer signals this PR:** Wire opponent count / eliminations / garbage from `gameClient` props already available in `GameShell`. Snapshot `pendingGarbage` used as proxy when solo.
- **Momentum decay:** momentum drops to 0 as soon as combo/b2b go back to -1 (no smoothing). Future PRs can smooth if desired.
- **Intensity smoothing:** No EMA in this PR — raw deterministic output for reliable snapshot tests.

## Edge Cases

- First `update()` call: `prev` is null → no events fired, continuous values computed normally.
- Game reset (status transitions gameOver→playing, level resets): prev state is reset so a level drop doesn't trigger negative deltas or spurious events.
- Paused status: continuous outputs held constant; events not fired.
- Empty board: stackHeight = 0, danger = 0.
- E2E reliability: `window.__atmosphere__` may be stale if no tick has run — test waits for a non-null readout before asserting.
