# Performance Metrics Collector — Implementation Spec

## Context

Introduces `packages/server/src/metrics-collector.ts` (+ tests), a lightweight
observer that tracks per-player performance metrics during a live game and
produces a `PerformanceMetrics` snapshot at game end. Wiring into
`GameSession`/`PlayerEngine` is out of scope for this PR — this is the
standalone module + unit tests.

Relevant existing code:
- `PerformanceMetrics` shape already defined in
  `packages/shared/src/skill-types.ts` (apm, pps, linesCleared, tSpins, maxCombo).
- `TSpinType` (`"none" | "mini" | "full"`) from
  `packages/shared/src/engine/scoring.ts`.
- `ScoringState.combo` is an integer counter (-1 when inactive, 0 on first
  clear, 1 on second consecutive clear, etc.) — the engine mutates it via
  `ScoringSystem.onLineClear`.
- The engine does not accumulate t-spin counts or max combo; the collector is
  the sole source of truth for those aggregates.
- Input handling in `GameSession.applyInput` already funnels all player inputs
  through a single call site — a natural future wire-up point for
  `recordAction`.
- Piece locks happen inside `TetrisEngine.lockPiece`; the session observes
  them indirectly by diffing snapshots or by the eventual wire-up reading
  `GameState.scoring` changes. The collector itself takes pre-parsed events
  from the caller so the engine stays untouched.

## 1. Requirements (grounded)

1. **Per-player collector.** One instance tracks one player's game. Multiple
   concurrent players ⇒ multiple collectors, managed by caller (eventually
   `GameSession`).
2. **Action counting → APM.** Each player input action counts as one action.
   APM = `actions / (durationMs / 60000)`.
3. **Piece counting → PPS.** Each piece lock increments a counter. PPS =
   `pieces / (durationMs / 1000)`.
4. **Line clear counting.** Sum of `linesCleared` reported at each lock.
5. **T-spin counting.** Each lock with `tSpin !== "none"` increments the
   t-spin count. Both mini and full count.
6. **Max combo tracking.** After each lock, collector reads the current
   combo counter (as it appears in `ScoringState.combo`, the post-clear
   value) and keeps `max(maxCombo, combo)`. Because combo is -1 while
   inactive and `≥0` after a successful clear, a clamp `max(0, …)` ensures
   we never report a negative maxCombo.
7. **Reset between games.** `reset()` restores initial state so the same
   instance can be reused.
8. **Snapshot accuracy at game end.** `snapshot()` returns a
   `PerformanceMetrics` computed from the accumulated state; must produce
   stable numbers once `end()` has been called (no drift from `Date.now()`).

## 2. API

```ts
export interface PieceLockEvent {
  linesCleared: number;   // 0..4
  tSpin: TSpinType;       // "none" | "mini" | "full"
  combo: number;          // post-clear combo counter from ScoringState
}

export class MetricsCollector {
  start(nowMs: number): void;
  recordAction(): void;           // one input → one action
  recordPieceLock(event: PieceLockEvent): void;
  end(nowMs: number): void;       // freeze duration for snapshot
  snapshot(): PerformanceMetrics; // pure getter
  reset(): void;                  // clears all state; caller must start() again
}
```

- `start` is idempotent only in the sense that calling it resets
  timing/counters via `reset()` internally — the intended flow is
  `reset()` → `start()` → events → `end()` → `snapshot()`.
- `recordAction`/`recordPieceLock` before `start()` are ignored (no-ops);
  the collector requires a known start time to be meaningful.
- `snapshot()` uses `endedAt - startedAt` if `end()` was called; otherwise
  returns zeros (duration 0 ⇒ apm/pps 0) to avoid racing `Date.now()` in
  tests.

## 3. Implicit requirements

- **Determinism.** The collector must not call `Date.now()` internally; all
  timestamps are injected. This keeps unit tests deterministic and matches
  the engine's tick-driven style.
- **No engine modifications.** Per the task description, the collector is an
  observer. This PR introduces no changes to `engine.ts`, `player-engine.ts`,
  or `game-session.ts`. Wiring is a follow-up PR.
- **Zero-duration safety.** APM/PPS must return 0 (not NaN/Infinity) when
  `durationMs === 0`.
- **PerformanceMetrics shape compliance.** Output matches the interface in
  `skill-types.ts` exactly — fields: `apm`, `pps`, `linesCleared`, `tSpins`,
  `maxCombo`.

## 4. Ambiguities (resolved)

- **Do mini t-spins count toward `tSpins`?** The interface is a single
  integer. Guideline convention treats both as t-spin placements, so
  count any `tSpin !== "none"`. Revisable later if adaptive balancing
  needs to distinguish.
- **What counts as an "action" for APM?** Every accepted `InputAction`
  (movement, rotation, drop, hold). The caller (`GameSession.applyInput`)
  already filters rejected inputs; the collector trusts the caller.
- **Rounding.** APM/PPS are returned as floating-point numbers. Downstream
  `PerformanceMetrics` consumers can round for display.
- **`maxCombo` semantics.** Reported as the highest combo counter value
  seen, clamped to `≥0`. E.g., 3 consecutive clears ⇒ combo reaches 2 ⇒
  `maxCombo = 2`. (This matches `ScoringState.combo` semantics.)

## 5. Edge cases

- Game ends with no pieces locked → pps = 0, linesCleared = 0,
  tSpins = 0, maxCombo = 0.
- Game ends with only actions but no locks (player mashes move on a
  single falling piece that never locks before top-out): actions counted,
  pieces = 0, pps = 0, apm > 0.
- `end()` called twice: second call is a no-op (duration frozen on first
  call).
- `snapshot()` called before `end()`: returns zeros (duration is 0).
- `reset()` after `end()` clears all fields back to 0 and clears the
  started/ended flags.
- Combo resetting to -1 after a non-clearing lock: must not lower
  `maxCombo` below its prior peak.

## 6. Test plan (`metrics-collector.test.ts`)

1. **APM from action timestamps** — start at t=0, 120 actions, end at
   t=60000 ⇒ apm = 120.
2. **APM zero-duration safety** — start/end at same t ⇒ apm = 0.
3. **PPS from piece count and duration** — 30 piece locks over 60s ⇒
   pps = 0.5.
4. **Line clear accumulation** — multiple locks with varying
   `linesCleared`, verify sum.
5. **T-spin counting** — locks with `"none"`, `"mini"`, `"full"`; only
   non-none entries increment the counter.
6. **Max combo tracking** — sequence of combo values (-1, 0, 1, 2, -1, 0)
   ⇒ maxCombo = 2.
7. **Reset between games** — run a full game, call `reset()`, run another
   with different numbers; snapshot reflects only the second game.
8. **Snapshot accuracy at game end** — integration-style: simulate a short
   game with mixed events and verify every field of the returned
   `PerformanceMetrics`.
9. **Events before start() are ignored** — defensive check.
10. **Snapshot before end() returns zeros** — duration not yet frozen.
