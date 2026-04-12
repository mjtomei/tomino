# Implementation Spec: Rematch Flow (pr-3f9112e)

## Requirements

### R1: Rematch button on results screen
After a game ends (view = `"results"`, `gameEndData` populated), show a "REMATCH" button alongside the existing "BACK TO LOBBY" button in `GameResults.tsx`. The button sends a `requestRematch` message to the server.

### R2: Vote collection on server
The server tracks rematch votes per room. When a player sends `requestRematch`, the server records their vote and broadcasts the current vote status to all players in the room. Votes are stored in the room or a parallel data structure keyed by `RoomId`.

### R3: Unanimous yes triggers new game
When all players in the room have voted yes for rematch, the server:
1. Removes the old `GameSession` via `removeGameSession(roomId)`
2. Resets room status to `"waiting"` via `store.setStatus(roomId, "waiting")`
3. Clears the rematch vote state
4. Broadcasts `roomUpdated` with the updated room (status = `"waiting"`)
5. Clients transition from `"results"` view back to `"waiting"` view (reusing the existing `WaitingRoom` component)

### R4: Decline returns to waiting room
If any player explicitly declines the rematch, the server:
1. Removes the declining player from the room via `store.removePlayer(playerId)`
2. Clears the rematch vote state for that room
3. Resets room status to `"waiting"` for remaining players
4. Removes old `GameSession`
5. Broadcasts `playerLeft` and `roomUpdated` to remaining players
6. Remaining players return to the waiting room; the declining player returns to the menu

### R5: Player leave during vote handling
If a player disconnects or leaves (sends `leaveRoom`) while rematch voting is in progress:
1. Their vote is removed
2. If remaining voters are now unanimous yes, trigger R3
3. Otherwise, treat as a decline: remaining players return to waiting room (per R4 logic)

### R6: Tests
- Rematch vote collection: adding votes, checking unanimity
- Unanimous yes triggers new game flow
- Decline returns remaining players to waiting room
- Player leave during vote clears their vote and resolves correctly

## Implicit Requirements

### IR1: Protocol additions
New message types must be added to both `ClientMessage` and `ServerMessage` unions in `protocol.ts`, and their type strings added to `CLIENT_MESSAGE_TYPES` / `SERVER_MESSAGE_TYPES` arrays (used by `parseC2SMessage` / `parseS2CMessage` for validation).

### IR2: Client socket compatibility
The `ClientSocket.on()` method uses `ServerMessageType` (derived from the `ServerMessage` union) for type-safe subscriptions. New S2C message types will automatically be available once added to the union.

### IR3: Room status must be "waiting" for new games
`handleStartGame` in `lobby-handlers.ts` checks `room.status !== "waiting"` before allowing start. The rematch flow must ensure room status is reset to `"waiting"` before the host can start a new game.

### IR4: Game session cleanup
The old `GameSession` must be removed before a new game can start. `createGameSession` cancels existing sessions, but explicitly removing via `removeGameSession` is cleaner.

### IR5: Host preservation
After rematch, the same host should remain host. Since `removePlayer` transfers host, the rematch flow should NOT remove and re-add players — it should only reset room status.

### IR6: Client state reset on rematch acceptance
When transitioning from `"results"` back to `"waiting"`, the client must clear: `gameSession`, `opponentStates`, `localPendingGarbage`, `targetingStates`, `attackPowers`, `targetingSettings`, `localElimination`, `gameEndData`. The `roomUpdated` handler already transitions from any view when it receives a room with status `"waiting"`.

## Ambiguities

### A1: What constitutes "all players" for unanimity?
**Resolution:** All players currently in the room (i.e., `room.players`). If a player leaves, they're removed from the room, so the unanimity check adjusts to the remaining players.

### A2: Should there be a timeout on rematch voting?
**Resolution:** No timeout. Players can take as long as they want. If they disconnect, the disconnect handler cleans up (per R5). This keeps the implementation simple and matches typical game UX (e.g., "rematch?" screens in fighting games).

### A3: What happens if only 1 player remains after others decline/leave?
**Resolution:** The remaining player returns to the waiting room with status `"waiting"`. They cannot start a game alone (the `handleStartGame` check requires >= 2 players), but they can wait for new players to join via the room code. The room is only deleted when it becomes empty.

### A4: Should the rematch button show vote progress?
**Resolution:** Yes. The `rematchUpdate` broadcast includes the set of players who have voted, so the UI can show "2/3 voted" or checkmarks next to player names. This gives clear feedback.

### A5: Can a player change their vote?
**Resolution:** No. Once a player votes (yes or decline), it's final. The rematch button becomes disabled after clicking. This simplifies the state machine.

### A6: Should the "decline" be an explicit button or just "Back to Lobby"?
**Resolution:** "BACK TO LOBBY" acts as the decline action. When clicked during rematch voting, it removes the player from the room (existing `leaveRoom` behavior) and the server treats their departure as a decline. No separate "DECLINE" button needed — this keeps the UI clean and reuses existing logic.

## Edge Cases

### E1: All players click rematch simultaneously
The server processes messages sequentially per connection. Each vote is recorded atomically. The last vote to arrive triggers the unanimity check and initiates the transition. No race condition.

### E2: Player disconnects during countdown after rematch
Already handled by existing `handleGameDisconnect` → `session.cancel()` flow during countdown state.

### E3: Room becomes empty during rematch voting
If the last player leaves, `store.removePlayer` deletes the room. The rematch vote state should be cleaned up. This is handled by keying votes on roomId — when the room is deleted, the votes become orphaned and can be garbage collected or simply ignored.

### E4: Host leaves during rematch voting
Existing `removePlayer` logic transfers host to the next player. The remaining players return to the waiting room with the new host, who can then start a new game.

### E5: Rematch vote state persists across multiple games
The vote state must be cleared when a new game starts (in `startGameCountdown`) and when the room transitions back to waiting. This prevents stale votes from a previous round.

## Implementation Plan

### Files to create:
- `server/handlers/rematch-handlers.ts` — server-side rematch vote logic

### Files to modify:
- `shared/protocol.ts` — add `C2S_RequestRematch`, `S2C_RematchUpdate` messages
- `shared/messages.ts` — no changes needed (auto-derives from protocol unions)
- `server/ws-server.ts` — register `requestRematch` handler in message switch
- `server/handlers/lobby-handlers.ts` — extend `handleLeaveRoom` / `handleDisconnect` to clean up rematch votes
- `server/handlers/game-handlers.ts` — clear rematch votes in `startGameCountdown`
- `client/src/net/lobby-client.ts` — add `requestRematch` action, `rematchUpdate` handler, rematch state
- `client/src/ui/GameResults.tsx` — add rematch button with vote status
- `client/src/App.tsx` — pass rematch props to GameResults

### Protocol messages:

```typescript
// Client → Server
interface C2S_RequestRematch {
  type: "requestRematch";
  roomId: RoomId;
}

// Server → Client
interface S2C_RematchUpdate {
  type: "rematchUpdate";
  roomId: RoomId;
  /** Player IDs who have voted for rematch so far. */
  votes: PlayerId[];
  /** Total number of players who need to vote. */
  totalPlayers: number;
}
```

### Server-side rematch state:
A module-level `Map<RoomId, Set<PlayerId>>` in `rematch-handlers.ts` tracking votes per room. Exported functions:
- `handleRequestRematch(playerId, roomId, ctx, store)` — record vote, check unanimity
- `clearRematchVotes(roomId)` — called on game start, room reset, room deletion
- `removeRematchVote(roomId, playerId)` — called on player leave/disconnect
