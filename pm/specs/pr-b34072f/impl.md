# Implementation Spec: In-game Handicap Indicator

## Overview

Display a small visual indicator near each player's board showing the active
handicap garbage multiplier they receive. The indicator is rendered on the
canvas as part of `BoardCanvas` and is driven by handicap modifier data sent
from the server at game start.

---

## 1. Requirements

### R1: Display garbage multiplier per player board

- **Where**: `packages/client/src/ui/BoardCanvas.tsx` — extend `renderBoard()`
  (or a new drawing helper called from it) to draw the indicator.
- **What**: Show the `garbageMultiplier` value formatted as `"0.6x"`, `"1.0x"`,
  etc., near the player's board.
- **Data source**: The multiplier comes from the `ModifierMatrix`
  (`packages/shared/src/handicap-types.ts`), which is computed server-side by
  `computeModifierMatrix()` in `packages/server/src/handicap-calculator.ts`.

### R2: Icon + color coding

- **Shield icon**: Draw a simple shield shape (canvas path) next to the
  multiplier text when `garbageMultiplier < 1.0` (protection).
- **Color coding**:
  - Green tones (`#4CAF50` / similar) when multiplier < 1.0 (protected).
  - Neutral gray (`#888888`) when multiplier = 1.0 (no handicap).
- No indicator needed when handicap is "off" (intensity = "off"), meaning
  all multipliers are 1.0 — but showing "1.0x" in gray is acceptable for
  consistency when handicap is enabled but the pair happens to be equal.

### R3: Placement

- Render the indicator in the **bottom-left area of the hold panel** (left
  side panel), below the hold piece. This avoids obscuring the board,
  the preview queue, or the hold piece itself.
- The hold panel currently occupies `SIDE_PANEL_CELLS (5) * cellSize` wide,
  and `holdBoxH + cellSize` (4 cells) tall — there is unused vertical space
  below it for the indicator.

### R4: 2-player vs 3+ player display

- **2-player game**: Show a single multiplier — the `garbageMultiplier` for
  the one opponent→this-player direction.
- **3+ player game**: Show the **minimum** (strongest protection) multiplier
  across all opponents→this-player directions. This gives the player a
  quick read of their best protection level.

### R5: Symmetric mode — outgoing multiplier

- In symmetric mode (`HandicapMode = "symmetric"`), the stronger player's
  outgoing garbage is also reduced. Show a second line with the outgoing
  multiplier (e.g., "Out: 0.8x") below the incoming indicator, also
  color-coded.
- In 2-player, this is the this-player→opponent multiplier. In 3+, show the
  minimum outgoing multiplier.

### R6: Live update if handicap changes mid-session

- The indicator reads from a reactive data source (React props/state). If the
  modifier data changes, the canvas re-renders automatically (existing
  `useEffect` on state change in `BoardCanvas` handles this).

### R7: Server sends modifier matrix to clients at game start

- **Protocol change**: Extend `S2C_GameStarted` in `packages/shared/src/protocol.ts`
  to include handicap modifier data. Since `ModifierMatrix` is a `Map` (not
  JSON-serializable), send it as a plain object:
  `handicapModifiers?: Record<string, { garbageMultiplier: number; delayModifier: number; messinessFactor: number }>`.
- Also include `handicapMode?: HandicapMode` so the client knows whether to
  show outgoing multipliers.
- **Server**: In `packages/server/src/handlers/game-handlers.ts`
  `startGameCountdown()`, compute the modifier matrix from room's
  `handicapSettings` and `playerRatings`, serialize it, and include it in the
  `gameStarted` message.
- **Client**: In `packages/client/src/net/lobby-client.ts`, extract the
  modifier data from `gameStarted` and store it in `GameSessionData`
  (`packages/client/src/net/game-client.ts`).

---

## 2. Implicit Requirements

### IR1: `BoardCanvasProps` must accept handicap data

The `BoardCanvas` component currently only takes `state: GameState`. It needs
additional props for the handicap indicator:
- `incomingMultiplier?: number` — the effective incoming garbage multiplier.
- `outgoingMultiplier?: number` — the effective outgoing multiplier (symmetric mode only).
- `handicapActive?: boolean` — whether to show the indicator at all.

This keeps the canvas component decoupled from the full modifier matrix; the
parent computes the relevant values.

### IR2: GameSessionData must store modifier data

`GameSessionData` (`packages/client/src/net/game-client.ts`) needs new fields:
- `handicapModifiers?: Record<string, HandicapModifiers>`
- `handicapMode?: HandicapMode`

### IR3: Modifier matrix serialization

`ModifierMatrix` is a `Map<ModifierMatrixKey, HandicapModifiers>`. For JSON
transport, convert to `Record<string, HandicapModifiers>` on send and
reconstruct on receive. Use `modifierKey()` from `handicap-types.ts` for
lookups.

### IR4: Player username resolution

The modifier matrix is keyed by username (`"alice→bob"`), but `GameSessionData`
uses `PlayerId` (UUID). The client needs the player name mapping. This is
already available: `RoomState.players` maps `PlayerId → PlayerInfo.name`, and
the room state is stored in `LobbyState.room`.

### IR5: Handicap "off" means no indicator

When `handicapSettings.intensity === "off"`, the server should either not send
modifiers or send all 1.0 values. The client should hide the indicator entirely
when `handicapActive` is false.

---

## 3. Ambiguities

### A1: 3+ player aggregation — min vs average

**Task says**: "show the average or strongest modifier."

**Resolution**: Use **minimum** (strongest protection). Rationale: the minimum
gives the most actionable information — it tells the player the most they're
being protected from any single opponent. Average could mask a very strong
protection from one opponent. The minimum is also simpler to compute and
easier to understand at a glance.

### A2: When to show outgoing multiplier in symmetric mode

**Task says**: "the stronger player's indicator also shows their reduced
outgoing multiplier."

**Resolution**: Show the outgoing multiplier for **any** player whose outgoing
multiplier differs from 1.0 in symmetric mode, not just the "stronger" player.
In symmetric mode both players have reduced multipliers (just to different
degrees). Showing it for all affected players is more informative.

### A3: Indicator position for opponent boards

**Task says**: "display a small indicator near each player's board."

**Resolution**: Currently the game only renders one board (the local player's).
The "playing" view in `App.tsx` is still a placeholder — there's no multi-board
layout yet. For this PR, we implement the indicator on the local player's own
`BoardCanvas`. When opponent boards are added in a future PR, the same
`BoardCanvas` component with the same props will show their indicators too.

### A4: Shield icon appearance

**Task says**: "shield icon" — no specific design given.

**Resolution**: Draw a simple shield outline as a canvas path — a pointed-bottom
shape approximately 12x14px at default cell size. Filled with the same green
color as the text when multiplier < 1.0. Not shown when multiplier = 1.0.

---

## 4. Edge Cases

### E1: All players have equal ratings

All multipliers are 1.0. If handicap is enabled (intensity != "off"), show
"1.0x" in gray. If intensity is "off", hide the indicator.

### E2: Handicap settings not present on room

`RoomState.handicapSettings` is optional. If not set, treat as "off" — no
indicator.

### E3: Missing player ratings

`RoomState.playerRatings` may be undefined or may not include all players.
`computePairHandicap()` uses the rating gap — if a player's rating is
missing, default to 1500 (the standard starting rating) so the calculator
still works. This default should be applied server-side before computing
the matrix.

### E4: Solo/spectator mode

If `playerIndexes` has only one entry, there are no opponents and no
meaningful handicap. Don't show the indicator.

### E5: Player names with special characters in modifier key

`ModifierMatrixKey` uses `→` as separator. If a player name contains `→`,
the key could be ambiguous. However, player names are limited to 20
characters via `confirmName()` and the UI doesn't allow special Unicode.
This is unlikely but worth noting — no action needed.

### E6: Canvas scaling / DPI

The indicator text and icon sizes should scale with `cellSize` to remain
readable at different zoom levels. Use `cellSize * 0.4` for font size and
scale the shield icon proportionally.

---

## 5. Implementation Plan

### Step 1: Protocol & data flow
1. Add `handicapModifiers` and `handicapMode` to `S2C_GameStarted` (protocol.ts)
2. Add matching fields to `GameSessionData` (game-client.ts)
3. Store them in lobby-client.ts `gameStarted` handler
4. Compute & serialize the matrix server-side in game-handlers.ts

### Step 2: Canvas rendering
1. Add `incomingMultiplier`, `outgoingMultiplier`, `handicapActive` to `BoardCanvasProps`
2. Add `drawHandicapIndicator()` helper in BoardCanvas.tsx
3. Call it from `renderBoard()` after the hold panel

### Step 3: Wire up in App.tsx
1. In the `"playing"` view, compute effective multipliers from session data + room state
2. Pass them to `BoardCanvas`

### Step 4: Tests
1. Unit test `drawHandicapIndicator` positioning / color logic
2. Test modifier matrix serialization round-trip
3. Test effective multiplier computation (2-player, 3+ player, symmetric mode)
