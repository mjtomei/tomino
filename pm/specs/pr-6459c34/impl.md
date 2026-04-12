# Spec: Disconnect handling (pr-6459c34)

## Requirements (grounded)

1. **Reconnect window during gameplay.** When a client WebSocket disconnects during `session.state === "playing"`, do NOT immediately forfeit as `game-session.ts:163` currently does. Instead, mark the player as "disconnected" in the session and start a 15 s forfeit timer. The player's engine is frozen (skipped in `onTick`) so they don't accrue state changes while offline.

2. **Restore on reconnect.** If the same player reconnects (new WebSocket sending a new `rejoinRoom` message with the same `PlayerId`) before the timer expires:
   - Clear the forfeit timer.
   - Re-register the player→connection mapping in `ws-server.ts` (`playerConnections`).
   - Send the reconnecting player the current game session data (seed, indexes, current snapshots, handicap info) so the client can rehydrate UI.
   - Broadcast `playerReconnected` to the room so peers clear their "disconnected" overlay.

3. **Forfeit on timeout.** If the timer expires, treat the player as topped out: invoke the existing `handlePlayerGameOver` path → broadcast `gameOver` for that player, run `checkForWinner`, potentially end the session.

4. **Notify other players.** Broadcast `playerDisconnected { playerId, timeoutMs }` when a disconnect starts, and `playerReconnected { playerId }` when it clears. Both go to the entire room.

5. **Lobby/waiting room disconnect = immediate removal.** When a player disconnects while their room is in `waiting` status (or they are not in a game session at all), the existing `handleDisconnect` in `lobby-handlers.ts:232` already removes the player and broadcasts `playerLeft`. Preserve that behavior unchanged.

6. **Countdown disconnect = cancel.** The existing behavior in `game-handlers.ts:155` cancels the session if anyone disconnects during countdown; preserved.

7. **Client pieces (best-effort scaffolding):**
   - `packages/client/src/net/reconnect.ts`: helper that, on unexpected socket close during `playing`, auto-reconnects and sends `rejoinRoom`. Exponential backoff, capped at total reconnect window (15 s) so we don't spam.
   - `packages/client/src/ui/DisconnectOverlay.tsx`: overlay shown either to the disconnecting player (with a ticking countdown) or over a peer's board when we receive `playerDisconnected` for them.

## Implicit requirements

- **New protocol messages**: `S2C_PlayerDisconnected`, `S2C_PlayerReconnected`, `S2C_GameRejoined` (full session state on successful rejoin), and `C2S_RejoinRoom`. These must be added to `protocol.ts`, `SERVER_MESSAGE_TYPES`, `CLIENT_MESSAGE_TYPES`.
- **Pause disconnected players in the tick loop**: `onTick` must skip players who are currently in the "disconnected" set, otherwise their engine would keep ticking (gravity, garbage) while they're offline — which contradicts "restore their game state".
- **checkForWinner semantics**: a disconnected-but-not-forfeited player is still "alive" (`!engine.isGameOver`). That means if P1 tops out while P2 is disconnected, the game does NOT end early — we wait for P2's reconnect-or-forfeit. This matches the spirit of "restore and resume": we don't prematurely declare winners based on network state.
- **Handler wiring**: `ws-server.ts` `handleClientDisconnect` must distinguish playing vs waiting paths. It should also handle `rejoinRoom` messages (routing to a new `handleRejoinRoom`) which must re-register the player on the new connection.
- **Idempotency**: If a player "disconnects" a second time while already disconnected (double fire), we clear/reset the timer. If they "reconnect" while not disconnected, it's a no-op.
- **Session removal on forfeit**: the existing `handleGameDisconnect` path calls `removeGameSession` + `setStatus("finished")` when the session transitions to `finished`. The new forfeit-on-timeout path must do the same.

## Ambiguities (resolved)

- **Reconnect window length**: The task says "default 15 seconds". I treat this as a constant in `disconnect-handler.ts` (`RECONNECT_WINDOW_MS = 15_000`), not configurable per-room.
- **What to send on successful rejoin**: a new `gameRejoined` message carrying `seed`, `playerIndexes`, a full map of current `GameStateSnapshot`s for every player, and handicap info. This lets the client rebuild lobby-client state without introducing a separate "resume" flow.
- **Peer snapshots during disconnect**: keep broadcasting snapshots for *other* players as normal. The disconnected player's board is just frozen from peers' perspective (no new snapshots because they're skipped in `onTick`).
- **Should we advance the disconnected player's engine before freezing?** No — freeze exactly where it was. The in-flight piece stays mid-fall. On reconnect we send a fresh snapshot so the client re-renders from that point.
- **Rejoin auth**: we trust the reconnecting client's declared `PlayerId` (matching it against the disconnected set for that room). This matches the current trust model (`createRoom`/`joinRoom` trust the client's id).
- **Input during disconnect**: any stale `playerInput` messages for a disconnected player are already rejected by `handlePlayerInput`'s session state check if the session is still playing — but the player's engine is skipped. To be safe, `applyInput` should also reject if the player is in the disconnected set.

## Edge cases

- **Rapid disconnect/reconnect**: tests must cover N cycles within the same session — timers properly cleared each time, no leaked timers, no duplicate `playerDisconnected` broadcasts for a player already disconnected.
- **Disconnect during countdown** (already tested): still cancels the session.
- **Forfeit while last player standing**: timeout triggers the normal winner-detection path; the other player is broadcast `gameEnd`.
- **Both players disconnect simultaneously**: both get timers; whoever times out first forfeits; the remaining one (if they come back) wins — or both time out and the `lastOutPlayerId` fallback in `checkForWinner` picks whichever timed out last.
- **Lobby disconnect while not in a game**: falls through to existing `handleDisconnect` → removed from room.
- **Rejoin after the session is already `finished`**: reject with an error (session no longer exists in the registry, so `rejoinRoom` returns `ROOM_NOT_FOUND`-style error).
- **Heartbeat ping/pong during disconnect**: no special handling needed — the new socket is what matters.

## Files to touch

- `packages/shared/src/protocol.ts` — new message types
- `packages/server/src/disconnect-handler.ts` — new; `DisconnectRegistry` with per-session timers
- `packages/server/src/game-session.ts` — disconnected set, freeze in tick loop, forfeit path
- `packages/server/src/handlers/game-handlers.ts` — update `handleGameDisconnect`, add `handleRejoinRoom`
- `packages/server/src/ws-server.ts` — route `rejoinRoom`, re-register connection on rejoin
- `packages/client/src/net/reconnect.ts` — new reconnect helper
- `packages/client/src/ui/DisconnectOverlay.tsx` — new overlay component
- Tests: new `packages/server/src/__tests__/disconnect-handler.test.ts`; extend `game-session.test.ts` and `game-handlers.test.ts`
