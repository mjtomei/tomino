# Lobby UI — Implementation Spec

## Requirements

### R1: Player Name Input (stored in localStorage)
- New component `packages/client/src/ui/PlayerNameInput.tsx`
- Text input for player name, stored in `localStorage` under a stable key (e.g. `tetris-player-name`)
- Shown before lobby interaction — user must have a name before creating/joining rooms
- Generates a stable `PlayerId` (UUID), also persisted in `localStorage`
- Produces a `PlayerInfo` object (`{ id, name }` from `@tetris/shared`) for use by lobby messages

### R2: Main Menu with "Create Room" and "Join Room" buttons
- New component `packages/client/src/ui/Lobby.tsx`
- Displays the game title and two primary actions: "Create Room" and "Join Room"
- "Create Room" sends a `C2S_CreateRoom` message with a default `RoomConfig` (room name from the player name, `maxPlayers: 2` default) and the player's `PlayerInfo`
- "Join Room" opens the room code input dialog (R3)

### R3: Room Code Input Dialog
- New component `packages/client/src/ui/JoinDialog.tsx`
- Modal/dialog for entering a room code (`RoomId`)
- Submit sends a `C2S_JoinRoom` message with the entered `roomId` and `PlayerInfo`
- Cancel returns to main menu
- Displays errors from server (e.g. `ROOM_NOT_FOUND`, `ROOM_FULL`, `GAME_IN_PROGRESS`)

### R4: Waiting Room — Player List and Ready Status
- New component `packages/client/src/ui/WaitingRoom.tsx`
- Shows room code (copyable), player list from `RoomState.players`, host indicator
- Host sees a "Start Game" button (sends `C2S_StartGame`)
- Non-host sees "Waiting for host to start..."
- Updates in real time as `roomUpdated`, `playerJoined`, `playerLeft` messages arrive
- "Leave Room" button sends `C2S_LeaveRoom`

### R5: WebSocket Client Connection
- New module `packages/client/src/net/client-socket.ts`
- Manages a single WebSocket connection to the server
- Handles connection lifecycle: connect, reconnect (not required for MVP), disconnect
- Sends `ClientMessage` objects serialized via `serializeMessage` from `@tetris/shared`
- Receives `ServerMessage` objects parsed via `parseS2CMessage` from `@tetris/shared`
- Exposes an event-based API for components to subscribe to specific message types

### R6: Lobby Client — State Management
- New module `packages/client/src/net/lobby-client.ts`
- Orchestrates lobby state: current view (menu/joining/waiting), room state, errors
- Subscribes to server messages and updates state accordingly
- Provides methods: `createRoom`, `joinRoom`, `leaveRoom`, `startGame`
- Consumed by React components (exposed as a hook or context)

### R7: Wire Up App.tsx
- Replace the placeholder in `packages/client/src/App.tsx` with lobby flow
- State machine: name-input → main-menu → (join-dialog | waiting-room)
- Transitions driven by lobby client state

## Implicit Requirements

### I1: Vite WebSocket Proxy
- The client dev server (Vite, port 5173) must proxy WebSocket connections to the game server (port 3001)
- Add a `server.proxy` entry in `packages/client/vite.config.ts` for `/ws` → `ws://localhost:3001`
- Or: connect directly to `ws://localhost:3001` in development (simpler, avoids proxy config for WS)

### I2: Player ID Generation
- Each browser tab needs a stable `PlayerId` (UUID v4)
- Stored in `localStorage` alongside the player name
- Used in all `PlayerInfo` objects sent to the server

### I3: Error Handling for Server Messages
- `S2C_Error` messages must be surfaced to the user (e.g. room not found, room full)
- `S2C_Disconnected` should return the user to the main menu with a notification
- WebSocket `close`/`error` events should reset lobby state

### I4: Type Safety with Shared Package
- All message construction must use types from `@tetris/shared`
- `parseS2CMessage` must be used for all incoming messages (returns `null` for invalid data)
- `serializeMessage` for all outgoing messages

## Ambiguities

### A1: WebSocket URL Configuration
**Resolution**: Use `ws://localhost:3001` directly in development. The client-socket module will accept a URL parameter, defaulting to `ws://${window.location.hostname}:3001` for development. Production would use the same host with a WS upgrade path, but that's out of scope.

### A2: "Ready" Status in Waiting Room
The task mentions "ready status" in the waiting room, but the protocol has no ready/unready mechanism — the host simply calls `startGame`.
**Resolution**: The "ready status" refers to the visual state of the waiting room (showing who's connected and whether the host can start). No ready-toggle protocol is needed. The host can start when at least 2 players are connected.

### A3: Room Configuration
The `RoomConfig` requires `name` and `maxPlayers`, but the task doesn't specify a UI for configuring these.
**Resolution**: Default to room name `"${playerName}'s Room"` and `maxPlayers: 4`. Keep the UI simple — no room config dialog for now.

### A4: Reconnection Behavior
**Resolution**: Out of scope for this PR. If the WebSocket drops, the user is returned to the main menu. Reconnection can be added in a future PR.

### A5: Player Name Validation
**Resolution**: Require non-empty name, trim whitespace, max 20 characters. No profanity filter.

## Edge Cases

### E1: Host Disconnects
When the host leaves, the server will send `playerLeft` and likely a `roomUpdated` with a new `hostId` or an error. The client should handle both: if a new host is assigned, update the UI; if the room is dissolved, return to menu.

### E2: Room Code Sharing
The room code (`RoomId`) is server-generated (in the `roomCreated` response). The UI must make it easy to copy. Since it's a string ID, display it prominently in the waiting room.

### E3: Duplicate Player Names
The protocol doesn't prevent duplicate names. This is acceptable — players are identified by `PlayerId`, not name.

### E4: WebSocket Connection Failure
If the server is unreachable, the lobby should show an error message ("Cannot connect to server") rather than silently failing.

### E5: Multiple Tabs
Each tab gets its own `PlayerId` from `localStorage`. Since `localStorage` is shared per origin, all tabs share the same name and ID. This means a user can't easily join from "another tab" as a different player for testing. 
**Resolution**: Generate a unique `PlayerId` per session (not persisted) so multiple tabs work independently. Only the player name is persisted in `localStorage`.

### E6: Start Game with 1 Player
The host shouldn't be able to start with only themselves. Disable the "Start Game" button until at least 2 players are in the room.
