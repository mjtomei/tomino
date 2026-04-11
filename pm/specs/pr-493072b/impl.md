# Implementation Spec: Handicap Settings in Lobby UI (pr-493072b)

## Requirements

### R1: Handicap Settings UI Component
Create `packages/client/src/ui/HandicapSettings.tsx` with CSS in `packages/client/src/ui/HandicapSettings.css`.

The component renders these controls:
- **Intensity selector** — off / light / standard / heavy (maps to `HandicapIntensity` in `shared/src/handicap-types.ts`)
- **Mode toggle** — "boost only" (default) vs "symmetric" (maps to `HandicapMode`)
- **Targeting bias strength slider** — 0.0–1.0, default 0.7 (maps to `targetingBiasStrength`)
- **Delay modifier toggle** — checkbox, default off (maps to `delayEnabled`)
- **Messiness modifier toggle** — checkbox, default off (maps to `messinessEnabled`)
- **Rating visibility toggle** — controls whether player ratings are shown in the player list

Props:
- `settings: HandicapSettings & { ratingVisible: boolean }` — current values
- `onChange: (settings) => void` — called when any value changes
- `disabled: boolean` — true for non-host players (read-only view)

### R2: Player Ratings in Player List
Extend `WaitingRoom.tsx` to show each player's rating next to their name when rating visibility is enabled. This requires:
- Adding a `rating?: number` field to player info sent to the waiting room
- Conditionally displaying `(1500)` style badge next to names

### R3: Extend RoomState to Include Handicap Settings
In `shared/src/types.ts`, add `handicapSettings?: HandicapSettings` to `RoomState`. Also add `ratingVisible?: boolean` to `RoomState`.

### R4: Protocol Extension — Update Room Settings
Add a new `C2S_UpdateRoomSettings` message to `shared/src/protocol.ts`:
```ts
interface C2S_UpdateRoomSettings {
  type: "updateRoomSettings";
  roomId: RoomId;
  handicapSettings: HandicapSettings;
  ratingVisible: boolean;
}
```
Add to `ClientMessage` union and `CLIENT_MESSAGE_TYPES`.

This allows the host to change settings in real-time in the waiting room, with changes broadcast to all players via `roomUpdated`.

### R5: Protocol Extension — Settings Sent on Game Start
Extend `C2S_StartGame` in `shared/src/protocol.ts` to include:
```ts
interface C2S_StartGame {
  type: "startGame";
  roomId: RoomId;
  handicapSettings?: HandicapSettings;
}
```
The server stores the final settings snapshot when the game starts.

### R6: Server Handler — Update Room Settings
Add `handleUpdateRoomSettings` to `packages/server/src/handlers/lobby-handlers.ts`:
- Validate sender is the host
- Validate room exists and is in "waiting" status
- Store settings on the room
- Broadcast `roomUpdated` to all players in the room

### R7: Server Handler — Store Settings on Game Start
Extend `handleStartGame` in `packages/server/src/handlers/lobby-handlers.ts`:
- Accept `handicapSettings` from the message
- Store them on the room state before transitioning to "playing"
- The stored settings are what the game engine will use for modifier computation

### R8: RoomStore Extension
Add a method to `RoomStore` for updating room settings:
```ts
setHandicapSettings(roomId: RoomId, settings: HandicapSettings, ratingVisible: boolean): boolean
```

### R9: Rating Lookup for Display
When a player joins a room, the server should look up their rating from `JsonSkillStore` (at `packages/server/src/skill-store.ts`) and include it in the room state. This means extending `PlayerInfo` or adding a parallel ratings map to `RoomState`.

### R10: Non-Host Read-Only View
Non-host players see the handicap settings panel but all controls are disabled. They can see what the host has configured but cannot modify anything.

### R11: Integration with WaitingRoom
Embed the `HandicapSettings` component in `WaitingRoom.tsx`, between the player list and action buttons. Pass `isHost` to control editability.

### R12: Integration with lobby-client Hook
Extend `useLobby` in `packages/client/src/net/lobby-client.ts`:
- Add `updateRoomSettings(settings)` action
- Send settings with `startGame`
- Track handicap settings in local state, initialized with defaults when room is created

## Implicit Requirements

### IR1: Default Settings
When a room is created, it must have sensible defaults:
- `intensity: "off"` (no handicap by default — avoids surprising new users)
- `mode: "boost"`
- `targetingBiasStrength: 0.7`
- `delayEnabled: false`
- `messinessEnabled: false`
- `ratingVisible: true`

### IR2: Settings Sync
When the host changes settings, all players in the room must see the updated settings in real-time (via `roomUpdated` broadcast).

### IR3: Validation
Server must validate:
- `intensity` is one of the four valid values
- `mode` is "boost" or "symmetric"
- `targetingBiasStrength` is a number in [0.0, 1.0]
- `delayEnabled` and `messinessEnabled` are booleans if present
- Only the host can change settings

### IR4: Player Rating Data
The `PlayerInfo` type is used across client and server. Rather than adding `rating` directly to `PlayerInfo` (which is used in many places including protocol messages), add a `playerRatings?: Record<PlayerId, number>` field to `RoomState`. This keeps `PlayerInfo` clean and avoids touching existing protocol messages.

### IR5: New Player Ratings
When a new player joins, the server must look up their rating and broadcast updated `playerRatings` in the `roomUpdated` message.

### IR6: Missing Ratings
Players with no rating history should show a default rating (1500 from Glicko-2 defaults, as seen in `skill-store.ts`).

## Ambiguities

### A1: Rating Visibility Default
**Resolution:** Default `ratingVisible: true`. In a game with handicap settings, seeing ratings helps players understand why handicaps are applied.

### A2: When to Send Settings — Continuously vs On Start
The task says "Settings are sent to the server when the game starts." But for real-time sync (non-host sees settings), we need to send updates as the host changes them.
**Resolution:** Use both: `updateRoomSettings` for live preview sync, and include final settings in `startGame` as the authoritative snapshot. The `startGame` settings take precedence.

### A3: Targeting Bias Slider Granularity
The spec says 0.0–1.0 but doesn't specify step size.
**Resolution:** Use step 0.05 (20 positions) — fine enough for meaningful control, coarse enough for easy selection.

### A4: Rating Source Timing
Should ratings be fetched on room creation or on game start?
**Resolution:** Fetch on join (and creation). This way ratings are visible in the waiting room immediately. The `playerRatings` map on `RoomState` is updated whenever a player joins.

### A5: Where to Put `ratingVisible`
Not part of `HandicapSettings` in the shared types, but logically grouped with handicap configuration.
**Resolution:** Keep `ratingVisible` as a separate field on `RoomState` (not inside `HandicapSettings`), since it's a display preference, not a game mechanic. The `updateRoomSettings` message includes both.

## Edge Cases

### E1: Host Leaves After Configuring Settings
When the host leaves and host transfers to another player, the existing settings should persist on the room. The new host inherits the ability to modify them.

### E2: Player Joins Mid-Configuration
A player joining while the host is changing settings should receive the current settings state in the `roomUpdated` message they get on join.

### E3: Room With No Rating Data
If the `JsonSkillStore` has no data for any player, all ratings default to 1500. Handicap with all-equal ratings and intensity != "off" should produce identity modifiers (gap = 0).

### E4: Single Player Cannot Start
The existing minimum-2-players check in `handleStartGame` still applies. Handicap settings are irrelevant for single player.

### E5: Settings Change Race Condition
If the host changes settings and immediately clicks Start, the `startGame` message carries its own settings snapshot, so even if an `updateRoomSettings` message is in-flight, the game uses the settings from `startGame`.

### E6: `ws-server.ts` Message Routing
Currently `ws-server.ts` only logs messages — it doesn't route to handlers. The lobby handlers are tested in isolation. The new `updateRoomSettings` message type needs to be added to the routing when that integration exists. For now, we add the handler and the protocol type; routing follows the same pattern as existing handlers.
