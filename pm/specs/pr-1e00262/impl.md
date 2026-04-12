# pr-1e00262 — Client multiplayer integration and prediction

## Requirements (grounded)

1. **`packages/client/src/engine/engine-proxy.ts` (new)** — a multiplayer-aware
   wrapper around `TetrisEngine` (from `@tetris/shared`). Mirrors the
   server-side `PlayerEngine` interface (`applyInput`, `advanceTick`,
   `getSnapshot`) so the client can run a deterministic local copy using the
   same seed, ruleset, and `MULTIPLAYER_MODE_CONFIG`. Adds a `reset()` method
   so prediction can rebuild the engine from scratch.

2. **`packages/client/src/net/prediction.ts` (new)** — `PredictionEngine`
   class that owns an `EngineProxy` and provides the client-side prediction
   / reconciliation logic:
   - Assigns a monotonic `seq` to each locally-applied input.
   - Tracks pending (unacked) inputs and full input history.
   - `onServerState(snapshot, ackInputSeq?)`:
     - Drops out-of-order snapshots (`snapshot.tick <= latestServerTick`).
     - Prunes pending inputs whose `seq <= ackInputSeq`.
     - Stores latest server snapshot for display/reconciliation.
   - `reconcile()` — rebuild proxy from seed and replay full history
     (inputs applied locally since game start that have not been pruned).
   - `getPredictedSnapshot()` — current local engine view, updated
     immediately on every local input for responsiveness.

3. **`packages/client/src/net/game-client.ts` (extend)** — currently only
   exports a `GameSessionData` interface. Extend with a `GameClient` class
   (or similar) that:
   - Holds session state + a `PredictionEngine`.
   - On local input: assigns a seq, applies locally via prediction engine,
     and sends a `playerInput` message (includes `seq` as `tick`) to the
     server via `ClientSocket`.
   - Subscribes to `gameStateSnapshot` events for the local player and
     forwards them to the prediction engine.

4. **Tests** — colocated with the files under `__tests__/`:
   - **Prediction/reconciliation**: apply input locally, receive matching
     server snapshot, reconcile → engine state matches expectations. Uses
     `createRNG` / seeded `TetrisEngine` and `GameTestHarness` / `makeGameState`
     factories where appropriate.
   - **Input sequencing**: sequence numbers are monotonic; pending buffer
     correctly holds only unacked inputs after ack.
   - **Out-of-order state**: older snapshot (lower `tick`) is ignored.

## Implicit Requirements

- **Protocol compatibility** — The task file list does not include server or
  shared files. The existing `C2S_PlayerInput` already carries a `tick`
  field; we reuse it as the client-generated sequence number (monotonic per
  client). No server/protocol changes are required; the server simply uses
  input order for processing (as it already does), and client-side
  sequencing / pruning is inferred from wall-clock / seq heuristics.
- **Determinism** — `EngineProxy` must be seed-deterministic so tests can
  rely on identical state between "server" and "client" engines, satisfying
  the rng/determinism note in the session guidelines.
- **No gravity in tests** — reconciliation tests need deterministic tick
  advancement. Tests call `advanceTick` explicitly (or rely on actions that
  don't require gravity to reach a known state).
- **Player-filtering** — The client only feeds `gameStateSnapshot` events
  into its `PredictionEngine` when `playerId === localPlayerId`. Snapshots
  for other players are ignored by the prediction engine (they belong to
  their own mirror view, out of scope here).

## Ambiguities (resolved)

- **Sequence number field** — The protocol's `C2S_PlayerInput.tick`
  conceptually doubles as a client sequence number. We adopt it as-is
  (`seq === tick`) and do not extend the protocol. The `PredictionEngine`
  exposes `nextSeq()` / `pendingInputs` so tests can verify sequencing.
- **Ack signal** — Since the server does not echo a processed-seq field,
  `onServerState` accepts an **optional** `ackInputSeq`. Production
  integration passes `undefined` (pending inputs are not pruned by ack,
  only by reconciliation / reset). Tests pass an explicit value to exercise
  pruning behavior. This keeps the prediction logic correct and testable
  without a protocol change.
- **Reconciliation trigger** — We expose `reconcile()` as an explicit
  method rather than auto-reconciling on every snapshot. This makes tests
  deterministic and avoids tearing down the engine unnecessarily in
  production, where local and server state already agree given determinism.
- **`GameClient` surface** — Extend `game-client.ts` with a lightweight
  `GameClient` that composes `ClientSocket` + `PredictionEngine`. UI wiring
  (GameShell multiplayer mode) is **out of scope** for this PR — the
  file list does not include it.

## Edge Cases

- **Out-of-order snapshots** — drop any snapshot where
  `snapshot.tick <= latestServerTick`.
- **Empty ack** — `onServerState` without an `ackInputSeq` should still
  record the latest server snapshot and bump `latestServerTick`.
- **Reconcile with empty history** — after `reset`+replay, engine equals
  fresh-from-seed state.
- **Local input before server gameStarted** — the `GameClient` only
  instantiates a `PredictionEngine` once `gameStarted` arrives (seed is
  known). Inputs before that are dropped silently.
- **Game over** — once the local engine reaches `gameOver`, further inputs
  should be no-ops (matches `PlayerEngine.applyInput` semantics).
