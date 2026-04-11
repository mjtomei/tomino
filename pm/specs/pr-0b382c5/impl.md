# Implementation Spec: Room and Lobby Server Logic (pr-0b382c5)

## Requirements

### R1: Room Creation
- When a client sends `C2S_CreateRoom` (defined in `packages/shared/src/protocol.ts:23-27`), the server creates a new room with a short, human-friendly room code as the `RoomId`.
- The creating player becomes the host (`RoomState.hostId`).
- The room starts in `"waiting"` status.
- Server responds with `S2C_RoomCreated` containing the full `RoomState`.
- Room config (`RoomConfig` from `packages/shared/src/types.ts:62-65`) carries `name` and `maxPlayers`.

### R2: Join Room by Code
- When a client sends `C2S_JoinRoom` with a `roomId`, the server adds the player to the room.
- Server broadcasts `S2C_PlayerJoined` to all players in the room.
- Server sends `S2C_RoomUpdated` to the joining player with current room state.
- Rejects with `S2C_Error` code `"ROOM_NOT_FOUND"` if code is invalid.
- Rejects with `S2C_Error` code `"ROOM_FULL"` if room is at capacity.
- Rejects with `S2C_Error` code `"GAME_IN_PROGRESS"` if room status is not `"waiting"`.

### R3: Leave Room
- When a client sends `C2S_LeaveRoom`, the server removes the player.
- Server broadcasts `S2C_PlayerLeft` to remaining players.
- If the room becomes empty, it is deleted from the store.

### R4: List Players in Room
- `RoomState.players` (type `PlayerInfo[]`) already carries the player list. Clients receive this via `S2C_RoomCreated` and `S2C_RoomUpdated` messages — no separate "list players" message is needed.

### R5: Room Capacity Limits
- Enforced via `RoomConfig.maxPlayers`. Validated on join; `maxPlayers` must be ≥ 2 on creation.

### R6: Host Designation and Transfer
- The room creator is the initial host (`RoomState.hostId`).
- If the host leaves/disconnects while other players remain, host transfers to the next player in the `players` array.
- Server sends `S2C_RoomUpdated` to notify remaining players of the new host.

### R7: Room Lifecycle States
- The shared types define `RoomStatus = "waiting" | "playing" | "finished"` (`packages/shared/src/types.ts:60`).
- The task description mentions a "countdown" state — this will be handled as a transient client-side countdown triggered by `S2C_RoomUpdated` with a countdown field, rather than a distinct `RoomStatus` value, keeping the shared types unchanged. The server remains in `"waiting"` until the countdown completes, then transitions to `"playing"`.
- `"waiting"` → `"playing"`: triggered by host sending `C2S_StartGame`.
- `"playing"` → `"finished"`: triggered by game-over logic (future PR).

### R8: In-Memory Room Store
- `packages/server/src/room-store.ts`: a `Map<RoomId, RoomState>`-based store.
- CRUD operations: `createRoom`, `getRoom`, `deleteRoom`, `getAllRooms`.
- Mutation helpers: `addPlayer`, `removePlayer`, `setStatus`, `setHost`.

### R9: Lobby Handlers
- `packages/server/src/handlers/lobby-handlers.ts`: message handler functions that bridge WebSocket messages to room store operations.
- Each handler takes the parsed message + a context object (player info, send/broadcast functions) and returns void.

## Implicit Requirements

### I1: Player-to-Room Mapping
- The server needs a reverse lookup from `PlayerId` → `RoomId` to handle disconnects (player drops without sending `leaveRoom`). This will be maintained as a separate `Map<PlayerId, RoomId>` in the room store.

### I2: Room Code Uniqueness
- Short room codes must be unique across active rooms. The generator must check existing codes and retry on collision.

### I3: Connection-Player Association
- The WebSocket server (`ws-server.ts`) currently tracks connections by UUID. The lobby handlers need a way to map WebSocket client IDs to `PlayerId`s. This means the `ClientInfo` in `ws-server.ts` needs a `playerId` field, or a separate mapping is maintained.

### I4: Broadcast to Room
- Handlers need a `broadcastToRoom(roomId, message, excludePlayerId?)` function. This requires knowing which WebSocket connections belong to which players in a room.

### I5: Disconnect Cleanup
- When a WebSocket disconnects, the server must automatically remove the player from their room (as if they sent `leaveRoom`). This hooks into the existing `cleanup` function in `ws-server.ts`.

## Ambiguities

### A1: Room Code Format
**Resolution:** Use uppercase alphanumeric codes, 5 characters (e.g., `"A3K7X"`). Excludes confusable characters (0/O, 1/I/L). This gives ~28^5 ≈ 17M possible codes, more than enough for an in-memory store.

### A2: Countdown State
**Resolution:** The task says "countdown" is a lifecycle state, but shared types only define `"waiting" | "playing" | "finished"`. Rather than modifying the shared types (which are already merged), the countdown will be a transient phase: when the host starts the game, the server broadcasts a `S2C_RoomUpdated` to signal countdown start, then after a delay (or immediately for this PR) transitions to `"playing"`. The countdown timer itself is a future concern for the game loop PR.

### A3: Player Already in a Room
**Resolution:** If a player tries to create or join a room while already in another room, reject with an error. A player can only be in one room at a time.

### A4: Maximum Player Limit
**Resolution:** Enforce `maxPlayers` between 2 and 8 (inclusive). This is a Tetris game, not an MMO.

### A5: What Happens on startGame
**Resolution:** This PR handles transitioning room status from `"waiting"` to `"playing"` and broadcasting `S2C_GameStarted`. The actual game state initialization is deferred to the game session PR. For now, `startGame` validates that the sender is the host, that the room is in `"waiting"` status, and that there are at least 2 players, then transitions to `"playing"`.

## Edge Cases

### E1: Host Leaves During Waiting
- Host transfer occurs. New host can start the game.

### E2: All Players Leave
- Room is deleted from the store immediately.

### E3: Rapid Join/Leave
- Operations are synchronous on the in-memory store so no race conditions.

### E4: Same Player Joins Twice
- Prevented by I3: player-to-room mapping. If the player is already in the room, reject with error.

### E5: Room Code Collision
- Generator retries with a new random code. With 17M possible codes and likely <100 active rooms, collision probability is negligible.

### E6: startGame with 1 Player
- Rejected: need at least 2 players to start a game.

### E7: Messages for Nonexistent Room
- Return `S2C_Error` with code `"ROOM_NOT_FOUND"`.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `packages/server/src/room-store.ts` | Create | In-memory room store with CRUD + player mapping |
| `packages/server/src/room.ts` | Create | Room code generation, room factory/helper functions |
| `packages/server/src/handlers/lobby-handlers.ts` | Create | Message handlers for create/join/leave/start |
| `packages/server/src/__tests__/room-store.test.ts` | Create | Tests for room store operations |
| `packages/server/src/__tests__/room.test.ts` | Create | Tests for room code generation |
| `packages/server/src/__tests__/lobby-handlers.test.ts` | Create | Tests for handler logic |

## Test Plan

1. **Room code generation**: uniqueness across 1000 generated codes, format validation (5 chars, uppercase alphanumeric, no confusable chars)
2. **Create room**: generates valid code, sets host, initial state is "waiting", respects config
3. **Join room**: adds player, enforces capacity, rejects invalid codes, rejects if game in progress
4. **Leave room**: removes player, triggers host transfer, deletes empty rooms
5. **Host transfer**: second player becomes host when host leaves
6. **Start game**: only host can start, requires ≥2 players, transitions to "playing"
7. **Player-room mapping**: tracks which room each player is in, prevents double-join
8. **Disconnect cleanup**: removing a disconnected player cleans up room state
