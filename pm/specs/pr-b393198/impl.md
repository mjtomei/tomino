# Implementation Spec: Network Protocol and Shared Types

## Requirements

### 1. Create shared type definitions (`packages/shared/src/types.ts`)
Define core game types used across both client and server:
- Board representation (10x20 grid + hidden rows)
- Piece types (I, O, T, S, Z, J, L) and piece state (position, rotation)
- Player info (id, name, room membership)
- Room/lobby state (room id, player list, game status)
- Garbage line representation (for adaptive multiplayer)
- Game state snapshot (board, score, level, active piece, next queue, hold, etc.)

### 2. Define message protocol (`packages/shared/src/protocol.ts`)
Exhaustive discriminated-union message types for WebSocket communication:

**Client-to-Server (C2S):**
- Lobby: `createRoom`, `joinRoom`, `leaveRoom`
- Game: `playerInput` (move/rotate/drop/hold), `startGame`
- Garbage: (none — garbage sending is derived server-side from line clears)
- System: `ping`

**Server-to-Client (S2C):**
- Lobby: `roomCreated`, `roomUpdated`, `playerJoined`, `playerLeft`
- Game: `gameStarted`, `gameStateSnapshot`, `gameOver`, `gameEnd`
- Garbage: `garbageReceived`, `garbageQueued`
- System: `pong`, `error`, `disconnected`

Each message type has a `type` string literal discriminant for exhaustive matching.

### 3. Message helpers (`packages/shared/src/messages.ts`)
- Type guard functions for each message category (isC2SMessage, isS2CMessage)
- Message parsing/validation from raw JSON (parseC2SMessage, parseS2CMessage)
- Serialization helpers (serializeMessage)
- These enable safe parsing of untrusted WebSocket data

### 4. Re-export from package entry point (`packages/shared/src/index.ts`)
Update the existing placeholder to re-export all types, protocol definitions, and message helpers.

### 5. Tests
- Message type validation: valid messages pass, invalid/malformed messages are rejected
- Round-trip serialization: serialize → parse produces identical message
- Type guard correctness: each guard correctly identifies its message category
- Edge cases: missing fields, extra fields, wrong type discriminants

### 6. TypeScript config updates
- Ensure `packages/shared/tsconfig.json` compiles the new files correctly (it already includes `src/` — no changes expected)
- The task mentions path aliases in `tsconfig.json` but the existing workspace setup already uses `@tetris/shared` as an npm workspace package reference, which is the standard monorepo approach. No path aliases are needed.

## Implicit Requirements

1. **Discriminated unions must be exhaustive** — every message type string must be unique across C2S and S2C to avoid ambiguity.
2. **Messages must be JSON-serializable** — no functions, Maps, Sets, circular refs, BigInt, or undefined values in message payloads.
3. **Validation must reject unknown message types** — the parser should return a typed error/null for messages with unrecognized `type` fields, since the server will receive arbitrary WebSocket data.
4. **No runtime dependencies** — the shared package currently has zero dependencies; validation should use hand-written guards, not a schema library like Zod. This keeps the shared package lightweight and dependency-free.
5. **Game state types must support the engine architecture** — Plan 01 describes a game engine that "ticks on a timer and emits state." The snapshot type should capture everything needed to render a remote player's board.
6. **Test framework** — No test framework is currently configured. Need to add vitest (consistent with the Vite toolchain already in use).

## Ambiguities

1. **Player input granularity** — Should `playerInput` send individual key events (keyDown/keyUp for DAS/ARR) or higher-level actions (moveLeft, moveRight, rotateCW, etc.)?
   - **Resolution:** Use high-level actions (moveLeft, moveRight, rotateCW, rotateCCW, softDrop, hardDrop, hold). DAS/ARR is a client-side input concern; the server receives the resulting game actions. This simplifies the protocol and keeps input handling client-local.

2. **State snapshot frequency/scope** — Should snapshots contain the full game state or deltas?
   - **Resolution:** Full snapshots. Delta compression is an optimization for later. Full snapshots are simpler, easier to debug, and sufficient for 1v1 where bandwidth is not a concern.

3. **Garbage representation** — How are garbage lines represented?
   - **Resolution:** A garbage line is a row with one gap column (standard Tetris garbage). Represent as `{ lines: number; gapColumn: number }` per batch. The adaptive handicap system (Plan 3) will modify the quantity/timing, not the format.

4. **Error message structure** — What errors can the server send?
   - **Resolution:** A simple `{ type: "error"; code: string; message: string }` is sufficient. Specific error codes (e.g., "ROOM_FULL", "GAME_IN_PROGRESS") will be defined as a string union.

5. **Room configuration** — Should room creation include config options (speed, rules)?
   - **Resolution:** Include a minimal `RoomConfig` type with room name and max players. Game rules configuration can be expanded later.

## Edge Cases

1. **Message ordering** — WebSocket guarantees in-order delivery per connection, but messages from different clients arrive in non-deterministic order. The protocol types don't need to handle this, but the server will. No protocol-level sequence numbers needed at this stage.

2. **Reconnection** — The `disconnected` message handles clean disconnects. Reconnection (resuming a game after network drop) is out of scope for this PR but the player ID type should be stable enough to support it later (use opaque string IDs, not array indices).

3. **Spectator mode** — Not in scope. The protocol only defines player roles. Spectator messages can be added later without breaking existing types.

4. **Multiple games in a room** — A room has one game at a time. The protocol assumes `roomId` + `gameId` are sufficient identifiers. No tournament bracket structure.
