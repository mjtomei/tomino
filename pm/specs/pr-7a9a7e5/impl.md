# pr-7a9a7e5 — Garbage network integration — Implementation Spec

## Requirements

### 1. Targeting strategy interface — `shared/targeting-types.ts`
A pluggable hook point so a later PR can swap strategies without touching
distribution code:

```ts
interface TargetAllocation { playerId: PlayerId; lines: number; }

interface TargetingContext {
  /** Total lines the sender is distributing. */
  linesToSend: number;
  /** Optional RNG for non-deterministic strategies. */
  rng?: () => number;
}

interface TargetingStrategy {
  resolveTargets(
    sender: PlayerId,
    players: readonly PlayerId[],
    context: TargetingContext,
  ): TargetAllocation[];
}
```

Default implementation `evenSplitStrategy` exported here: excludes the sender
from `players`, splits `linesToSend` evenly across the remaining opponents with
a `floor(linesToSend / n)` base and distributes the remainder one line at a time
starting from index 0 (deterministic ordering). Returns one `TargetAllocation`
entry per recipient (zero-line allocations omitted).

### 2. Shared protocol messages — `shared/protocol.ts`
`S2C_GarbageReceived` and `S2C_GarbageQueued` exist. Both lack the recipient
player id, so clients can't route them. Extend:

- `S2C_GarbageReceived`: add `playerId: PlayerId` (recipient), `senderId?: PlayerId`.
- `S2C_GarbageQueued`: add `playerId: PlayerId` (recipient).

Update `packages/shared/src/__tests__/messages.test.ts` fixtures accordingly.

### 3. Engine line-clear event hook — `packages/shared/src/engine/engine.ts`
`TetrisEngine.lockPiece` is the only place that knows `linesCleared`, `tSpin`,
`combo`, and `b2b` together. Add:

- Private field `lastLineClearEvent: { linesCleared, tSpin, combo, b2b } | null`
  set at the end of `lockPiece` when `linesCleared > 0`.
- Public `consumeLineClearEvent(): LineClearEvent | null` — returns and clears.
- Public `applyGarbage(batches: readonly GarbageBatch[]): void` — wraps
  `insertGarbageBatches` on the internal grid. No-op while `status !== "playing"`.

Expose `LineClearEvent` through `shared/index.ts`.

### 4. Player engine — `packages/server/src/player-engine.ts`
Add pass-through methods:
- `consumeLineClearEvent()`
- `applyGarbage(batches)`
- `setPendingGarbage(batches)` — update a locally tracked pending queue that
  is exposed to snapshots via `getSnapshot()` (overrides the empty default from
  `engineStateToSnapshot`).

### 5. Garbage manager — `server/garbage-manager.ts`
Stateful per-session helper that owns:
- Per-player pending incoming queue: `Array<{ batch: GarbageBatch; readyAt: number; senderId: PlayerId }>`
- Configurable `delayMs` (default `500`).
- Configurable `targetingStrategy` (defaults to `evenSplitStrategy`).
- Time source (`now()`) injectable for deterministic tests.

API:
- `onLinesCleared(sender, linesCleared, combo, b2b, tSpin)` →
  1. Compute total via `calculateGarbage`.
  2. Cancel from `sender`'s pending incoming queue, oldest-first, up to total.
    Return the list of receivers whose queues changed (so caller can rebroadcast).
  3. Residual → `targetingStrategy.resolveTargets(sender, allPlayerIds, ctx)` →
    enqueue batches on each receiver with `readyAt = now + delayMs`.
  4. Return `{ cancelledReceivers: PlayerId[]; queuedReceivers: PlayerId[] }`.
- `drainReady(playerId, now)` → shift entries with `readyAt <= now` off the
  head of the queue, return the batches. Called from the tick loop after the
  player's piece has locked (between lock and insert).
- `getPending(playerId)` → returns current `GarbageBatch[]` for broadcast / snapshot.
- `removePlayer(playerId)` / `addPlayers(ids)` — lifecycle.
- `setTargetingStrategy(strategy)` — for tests and the future targeting PR.

Gap column is chosen by the sender at the time of generation (single gap per
batch per calculate call). For now use a simple seeded RNG (or Math.random)
passed in via constructor options — default `Math.random`. Same gap for the
whole batch matches the existing `GarbageBatch` type.

### 6. Game session wiring — `server/game-session.ts`
- Construct a `GarbageManager` in `initializeEngines` with the current player
  id list.
- After each `applyInput` and after each tick loop per-player `advanceTick`:
  1. `engine.consumeLineClearEvent()` — if present, call
     `garbageManager.onLinesCleared` and broadcast `garbageQueued` to every
     affected receiver (cancellations + new queues) AND update each affected
     player's `pendingGarbage` via `setPendingGarbage` so snapshots reflect it.
  2. `garbageManager.drainReady(playerId, now)` — if any ready batches and the
     player currently has no active piece in the landing zone, apply them via
     `engine.applyGarbage` and broadcast one `garbageReceived` per batch, then
     update pending via `setPendingGarbage` and broadcast `garbageQueued`.
     (Simplification: "landing zone" check is skipped; garbage inserts after
     whatever tick returns control. The engine already handles the resulting
     top-out on the next spawn.)

On `handlePlayerDisconnect` / game-over: call `garbageManager.removePlayer` so
no further garbage is queued for them.

### 7. Tests

New test files:
- `packages/shared/src/__tests__/targeting-types.test.ts` — even-split for 2/3/4
  opponents, sender excluded, deterministic ordering for remainder.
- `packages/shared/src/__tests__/protocol-garbage.test.ts` — optional; covered
  by updated `messages.test.ts` fixture roundtrip.
- `packages/server/src/__tests__/garbage-manager.test.ts` —
  - distribution to correct opponents (2-player)
  - delay timer before application (no drain before `delayMs`, drain at/after)
  - cancellation by clearing lines during delay
  - even-split across 3+ players
  - queue state accuracy after multiple enqueues/drains/cancels
  - pluggable targeting strategy: swap in a stub that targets a specific player
    and verify distribution honors it.
- `packages/server/src/__tests__/game-session-garbage.test.ts` — integration
  smoke test: two-player session; player A clears lines; player B's pending
  updates broadcast; after advancing time, garbage inserts onto B's board.

Tests use `boardFromAscii` for board setup, `assertGarbageInserted` /
`assertLinesCleared` for state transitions, `makeGarbageBatch` factory for
seeding incoming queues.

## Implicit Requirements

- **Grid mutation**: `TetrisEngine.applyGarbage` mutates the internal grid.
  `TetrisEngine.getState()` returns a board copy so callers still see the
  post-insertion board via `getSnapshot`. No invariants broken — row count
  preserved by `insertGarbage`.
- **Snapshot consistency**: `pendingGarbage` in `GameStateSnapshot` must be
  written by the server (engine doesn't know about it). `PlayerEngine` tracks
  it locally and injects it into `getSnapshot` after calling
  `engineStateToSnapshot`.
- **Cancellation semantics**: "cancel by clearing lines" means outgoing lines
  reduce the sender's own pending incoming before being sent to opponents,
  in FIFO order.
- **Determinism for tests**: `GarbageManager` takes a `now()` function and a
  gap-column RNG so tests can advance time and predict gaps.
- **Messages test fixture**: Adding required `playerId` fields breaks
  `messages.test.ts` — updated in the same commit.

## Ambiguities & Resolutions

- **Timing model**: "delay before application" can mean either real wall-clock
  milliseconds or game ticks. The task says "~500ms" so I treat it as wall-clock
  and use `Date.now()` by default, injectable for tests.
- **Gap column selection**: `calculateGarbage` doesn't choose gaps; the
  `GarbageBatch` type requires one. Resolved: `GarbageManager` owns gap
  selection via an injected `gapRng` (default `Math.random`). Single gap per
  batch (per existing type).
- **Multi-line batch vs many 1-line batches**: Resolved: one `GarbageBatch` per
  `onLinesCleared` call per receiver (per the even-split allocation). Consistent
  with existing tests that expect `GarbageBatch` as a unit.
- **Landing-zone check before inserting garbage**: Standard Tetris waits until
  the current piece is not in the active landing zone before inserting. The
  engine doesn't currently expose this state. Resolved: insert immediately after
  `drainReady` at tick time (after `advanceTick`), accepting that garbage may
  push an in-flight piece up one row. This is a known acceptable simplification
  and avoids touching engine internals beyond the small hook surface. A follow-up
  PR can gate on piece state.
- **Tests — integration test scope**: Full server-session integration is
  heavier than the rest. Kept as a minimal smoke test; the detailed coverage
  lives in the unit test for `GarbageManager`.

## Edge Cases

- Clearing lines while no incoming garbage is pending: `cancelled = 0`,
  residual == total, no-op on cancellation broadcast.
- Clearing more lines than incoming garbage: cancel all pending, send residual.
- Player disconnects while garbage is queued for them: `removePlayer` drops
  their queue; any in-flight `onLinesCleared` calls for that player become
  no-ops (sender's targeting skips removed players).
- All opponents disconnected: `resolveTargets` returns empty list; `onLinesCleared`
  sends nothing.
- `linesToSend == 0` but B2B bonus: `calculateGarbage` returns 0 total when
  `linesCleared == 0`, so no call path; safe.
- Single-player session: `resolveTargets` returns empty (no opponents); garbage
  manager never enqueues.
