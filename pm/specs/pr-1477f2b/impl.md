# Implementation Spec: Fix garbage not appearing on receiving player's game

## Problem Summary

The server broadcasts two dedicated garbage events — `garbageQueued` and `garbageReceived` — but the client's `lobby-client.ts` has no handlers for either. The client only learns about incoming garbage when a `gameStateSnapshot` happens to be broadcast for another reason. Critically, the `snapshotsEqual()` function in `game-session.ts:910-950` does **not** compare `pendingGarbage`, so pending-garbage-only changes never trigger a snapshot broadcast. The garbage meter stays empty until the board itself changes (piece movement, gravity, garbage insertion), creating visible lag and missing the "warning" phase entirely.

## Requirements

### R1: Add `garbageQueued` handler to lobby-client.ts

**File**: `packages/client/src/net/lobby-client.ts`

Register a `socket.on("garbageQueued", ...)` handler that updates `localPendingGarbage` when the message targets the local player.

**Server event** (`packages/shared/src/protocol.ts:226-233`):
```typescript
interface S2C_GarbageQueued {
  type: "garbageQueued";
  roomId: RoomId;
  playerId: PlayerId;           // player whose queue changed
  pendingGarbage: GarbageBatch[];  // full replacement array
}
```

**Handler logic**:
- Get local player ID via `getSessionPlayerId()` (line 119)
- If `msg.playerId === localId`, update `localPendingGarbage` to `msg.pendingGarbage`
- Guard with `prev.room?.id === msg.roomId` check (consistent with other handlers)
- This is an authoritative replacement, not an append — the server sends the full queue

### R2: Add `garbageReceived` handler to lobby-client.ts

**File**: `packages/client/src/net/lobby-client.ts`

Register a `socket.on("garbageReceived", ...)` handler. This event fires when a garbage batch is actually applied to a player's board (after the delay window).

**Server event** (`packages/shared/src/protocol.ts:216-224`):
```typescript
interface S2C_GarbageReceived {
  type: "garbageReceived";
  roomId: RoomId;
  playerId: PlayerId;      // player whose board gets garbage
  senderId?: PlayerId;     // who sent it
  garbage: GarbageBatch;   // single batch being applied
}
```

**Handler logic**:
- If `msg.playerId === localId`, remove the applied batch from `localPendingGarbage`
- The server has already drained this batch from pending, so the client should reflect that
- Note: A `garbageQueued` event follows `garbageReceived` in the server flow (`game-session.ts:654` calls `syncPendingGarbage` after draining), so the authoritative queue update will arrive shortly after. The `garbageReceived` handler can either:
  - (a) Optimistically remove the batch (match by `batch.lines`), or
  - (b) Do nothing for local state (rely on the subsequent `garbageQueued` to correct the queue)
  
  Option (b) is simpler and avoids race conditions. The `garbageQueued` from `syncPendingGarbage` at line 654 will follow within the same server tick, arriving almost immediately.

### R3: E2E test — `e2e/multiplayer-garbage.spec.ts`

New Playwright test file with 90s timeout. Must verify:
1. Player A clears lines → garbage meter appears on Player B's screen
2. The garbage meter reflects the pending garbage count

**Test approach**:
- Set up a 2-player game using the existing `setupAndStartGame` pattern from `e2e/multiplayer-game.spec.ts`
- Player A performs actions that clear lines (move pieces strategically, or use rapid hard drops to eventually clear lines)
- Assert that Player B's garbage meter (`[data-testid="garbage-meter"]`) becomes visible
- Assert the garbage meter bar (`[data-testid="garbage-meter-bar"]`) has non-zero height

## Implicit Requirements

### IR1: Room ID guard on all new handlers
All existing handlers guard state updates with `prev.room?.id === msg.roomId`. The new handlers must follow this pattern.

### IR2: No-op when not in playing state
The `garbageQueued`/`garbageReceived` events only matter during gameplay. However, since `localPendingGarbage` is reset to `[]` on `gameStarted` (line 325) and on `roomUpdated` when returning to waiting (line 247), and the server only sends these during active games, no explicit view guard is needed.

### IR3: Opponent garbage state in `opponentStates`
The `gameStateSnapshot` handler already stores full snapshots for opponents (line 384: `opponentStates[pid] = msg.state`). The `garbageQueued` event for opponents could also update their state, but since opponent garbage meters are rendered from `opponentStates[pid].pendingGarbage` via the snapshot, and the snapshot also arrives on game-state-changing ticks, the current opponent rendering path is acceptable. The main fix is for the **local** player's garbage meter.

### IR4: TypeScript type safety
The `socket.on()` method is typed with `Extract<ServerMessage, { type: T }>` (see `client-socket.ts:90-92`), so the handler parameter will be correctly typed as `S2C_GarbageQueued` or `S2C_GarbageReceived`. No additional type assertions needed.

## Ambiguities

### A1: Should `garbageReceived` update local state? — **RESOLVED**
Option (b): the `garbageReceived` handler for the local player should be a no-op for `localPendingGarbage`. The `garbageQueued` event that immediately follows (same server tick) will provide the authoritative pending queue state. This avoids fragile batch-matching logic.

### A2: Should `garbageQueued` update opponent garbage state? — **RESOLVED**
No. Opponent garbage is currently rendered from `opponentStates[pid].pendingGarbage` which comes from the full `gameStateSnapshot`. Adding a separate update path for opponent garbage from `garbageQueued` would require restructuring the opponent state model. Since the task description focuses on the **local** player's garbage meter, and opponent state is updated via snapshots at adequate frequency (every tick with state changes), we only handle `garbageQueued` for the local player.

### A3: E2E test — how to reliably trigger line clears? — **RESOLVED**
The test needs one player to clear at least one line to generate garbage. Strategy: Player A rapidly hard-drops pieces. In standard Tetris with random piece generation, rapidly dropping ~15-20 pieces will almost certainly fill and clear at least one line. After each hard drop, poll for the garbage meter on Player B's page. If needed, use a longer drop sequence with small delays. The 90s timeout provides ample time.

## Edge Cases

### EC1: Multiple rapid `garbageQueued` updates
If multiple `garbageQueued` events arrive in quick succession (e.g., multiple opponents send garbage), each carries the full `pendingGarbage` array, so the last one wins. This is correct — the server's `syncPendingGarbage()` always sends the complete current queue.

### EC2: `garbageQueued` arriving after game over
If a `garbageQueued` event arrives for a player who has already topped out, the state update is harmless — `localPendingGarbage` is set but not rendered (the game over / spectator overlay is shown instead). No special handling needed.

### EC3: Garbage cancellation
When the local player clears lines, their own pending garbage may be partially cancelled (garbage offset). The server handles this in `gm.onLinesCleared()` and calls `syncPendingGarbage()` for affected receivers. The client will receive a `garbageQueued` with the reduced queue, which the handler will apply correctly.

### EC4: Reconnection
On reconnect, the server sends a `gameRejoined` event with the current game state including `pendingGarbage`. The existing reconnection flow restores `localPendingGarbage` from the snapshot. The new handlers don't interfere with this.
