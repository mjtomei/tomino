# Integration — Playable Multiplayer Tetris: Implementation Spec

## Overview

This is the final integration PR for Plan 2. All individual multiplayer features
(garbage sending, opponent display, win/loss detection, rematch flow, disconnect
handling, latency display, targeting strategies, attack power) exist as
implemented components. The task is to wire them into a working end-to-end
multiplayer experience and fix the issues preventing the test suite from passing.

---

## 1. Requirements

### R1: Fix @tetris/shared import resolution for tests

**Problem**: 29 of 69 test files fail because `@tetris/shared` cannot be resolved
at runtime. The shared package's `exports` map in `packages/shared/package.json`
maps `"."` default to `./dist/index.js`, but no `dist/` directory exists (the
package is never built). The `types` condition points to `./src/index.ts` which
works for TypeScript type-checking but not for vitest runtime resolution.

**Files**:
- `packages/shared/package.json` (lines 8-11: exports map)
- `packages/server/vitest.config.ts`
- `packages/client/vitest.config.ts`

**Fix**: Update the shared package's exports map so the `default` condition
points to source (`./src/index.ts`) instead of `./dist/index.js`. This matches
the pattern already used for the `__test-utils__` sub-path exports (lines 12-28)
which correctly point to `.ts` source files. Vitest and tsx (the server dev
runner) can both consume TypeScript source directly.

### R2: Wire GameClient/PredictionEngine into multiplayer gameplay

**Problem**: `GameShell` (`packages/client/src/ui/GameShell.tsx`) creates a
standalone `TetrisEngine` that runs locally via `requestAnimationFrame`. In
multiplayer mode, player inputs are never sent to the server (`playerInput`
messages), and the local engine runs independently of the authoritative server.

The `GameClient` class (`packages/client/src/net/game-client.ts`) and
`PredictionEngine` (`packages/client/src/net/prediction.ts`) exist and
implement the correct pattern (local prediction + server reconciliation), but
they are not connected to the UI.

**What must happen**:
1. In multiplayer mode (`GameMultiplayer`), `GameShell` must use `GameClient`
   instead of a standalone `TetrisEngine`.
2. Player inputs must be routed through `GameClient.sendInput()` which both
   applies locally (for prediction) and sends `playerInput` to the server.
3. The render loop must call `GameClient.advanceTick()` for gravity/lock delay.
4. The rendered game state must come from `GameClient.getRenderSnapshot()`
   (the predicted state) instead of the local-only engine.
5. Server `gameStateSnapshot` messages for the local player must flow into
   `GameClient.prediction.onServerState()` for reconciliation — this is already
   wired in `GameClient`'s constructor.

**Files to modify**:
- `packages/client/src/ui/GameShell.tsx` — Add a multiplayer mode that accepts
  a `GameClient` instance (or the data to construct one) and delegates to it
  instead of a local `TetrisEngine`.
- `packages/client/src/ui/GameMultiplayer.tsx` — Construct `GameClient` when
  game starts, pass it to `GameShell`.
- `packages/client/src/App.tsx` — Pass socket and room data through.
- `packages/client/src/net/lobby-client.ts` — The `gameStateSnapshot` handler
  for the local player (line 367-374) currently only extracts `pendingGarbage`.
  It must also forward the snapshot to the `GameClient` — OR the `GameClient`
  subscribes directly to the socket (which it already does in its constructor).

### R3: All unit tests pass (`npm test`)

After R1 and R2, all 69 test files (832+ tests) must pass. The 40 currently
passing shared tests must continue to pass.

### R4: E2E tests pass (`npm run test:e2e`)

The Playwright tests (`e2e/smoke.spec.ts`, `e2e/multiplayer-lobby.spec.ts`)
must pass. These require:
- Client dev server on port 5173
- Server dev on port 3001
- Both configured in `playwright.config.ts` as `webServer` entries

### R5: Full game flow works end-to-end

The complete multiplayer flow must work:
1. **Lobby**: Enter name → Create/Join room → Waiting room with settings
2. **Countdown**: 3-2-1-Go broadcast → transition to gameplay
3. **Gameplay**: Local inputs → server via WebSocket → authoritative state back
   → prediction reconciliation → opponent board updates
4. **Garbage**: Line clears → targeting resolution → garbage queuing/delivery →
   garbage meter display
5. **Win/Loss**: Top-out → elimination → spectator overlay → game end →
   results screen with stats
6. **Rematch**: Vote → unanimous → return to waiting room
7. **Disconnect**: Grace period → forfeit or reconnect

---

## 2. Implicit Requirements

### IR1: GameShell must support both solo and multiplayer modes

`GameShell` is used for both solo play (from Lobby "Solo Play" button) and
multiplayer. The solo path must continue to work with a standalone engine.
The multiplayer path needs different input routing and state management.

### IR2: Multiplayer GameShell must not show start screen or pause

In solo mode, `GameShell` shows a `StartScreen` to pick rules/mode. In
multiplayer, the game starts immediately with the server-provided seed and
mode. Pause should be disabled (or ignored) in multiplayer.

### IR3: GameClient lifecycle management

`GameClient` subscribes to socket messages in its constructor and must be
disposed (`dispose()`) when the game ends or the player leaves. Failure to
dispose would cause leaked subscriptions that process stale messages.

### IR4: Sound events in multiplayer mode

`GameShell` detects sound events by diffing `GameState` objects from the local
engine. In multiplayer mode using `GameClient`, the state comes from
`GameStateSnapshot` (protocol type) not `GameState` (engine type). The sound
detection must work with the multiplayer state representation.

### IR5: DAS/ARR must work in multiplayer

The DAS (Delayed Auto Shift) and ARR (Auto Repeat Rate) system in `GameShell`
calls engine methods directly. In multiplayer, these must route through
`GameClient.sendInput()` so inputs are sent to the server.

### IR6: Pending garbage must update from GameClient state

The lobby client's `gameStateSnapshot` handler for the local player extracts
`pendingGarbage` (line 371). With `GameClient` intercepting local-player
snapshots, the lobby still needs to receive garbage data. Either:
- `GameClient` exposes pending garbage from server snapshots, OR
- The lobby handler continues to run alongside `GameClient`'s handler
  (both can subscribe to the same socket event)

---

## 3. Ambiguities

### A1: Multiplayer mode config selection — **[RESOLVED]**

In solo play, the user picks a rule set and mode via `StartScreen`. In
multiplayer, the server sends a seed but no explicit rule set or mode config.
**Resolution**: The server uses `modernRuleSet()` and `MULTIPLAYER_MODE_CONFIG`
(defined in both `packages/server/src/player-engine.ts` and
`packages/client/src/engine/engine-proxy.ts`). The client should use these
same defaults when constructing `GameClient`.

### A2: Should GameShell render server snapshots or predicted state? — **[RESOLVED]**

**Resolution**: Render `GameClient.getRenderSnapshot()` (the locally-predicted
state). This provides instant feedback. Server snapshots are folded in via the
prediction engine for reconciliation.

### A3: How to pass GameClient state to GameShell's render — **[RESOLVED]**

`GameShell` currently renders a React state (`gameState: GameState`). The
multiplayer path needs to render `GameStateSnapshot` from `GameClient`.
**Resolution**: Add a multiplayer prop path to `GameShell` that accepts a
`GameClient` or equivalent state source. `GameStateSnapshot` has the same
fields needed for rendering (board, activePiece, queue, hold, score, etc.).

---

## 4. Edge Cases

### E1: Garbage insertion during piece placement

When the server applies garbage to a player's board while a piece is in the
landing zone, the piece position may become invalid. The server engine handles
this through its `insertGarbage` → collision check flow. The client prediction
engine must handle the same case when reconciling.

### E2: Player tops out from garbage (not from piece lock)

Garbage insertion can push the board past the buffer height, causing a top-out.
The server detects this in `processGarbageFor` → engine state check. The client
prediction engine must also detect this state change.

### E3: Rapid reconnect cycles

A player could disconnect and reconnect multiple times within a game. The
`DisconnectRegistry` handles this (clearing the timer on reconnect, re-registering
on next disconnect). No additional integration work needed.

### E4: All players disconnect simultaneously

If all players disconnect within the grace window, the session stays alive with
all engines frozen. Each player's forfeit timer runs independently. The last
player to forfeit triggers the winner check. Already handled by
`GameSession.checkForWinner`.

### E5: Solo play regression

The multiplayer integration must not break the existing solo play path through
`GameShell`. Solo play does not use sockets, `GameClient`, or prediction.

---

## Implementation Plan

### Step 1: Fix shared package exports (R1)

Update `packages/shared/package.json` exports map for `"."` to point
`default` to `./src/index.ts` instead of `./dist/index.js`.

### Step 2: Verify all tests pass with export fix (R1, R3)

Run `npm test` — all 69 test files should pass once imports resolve.

### Step 3: Wire GameClient into multiplayer flow (R2)

1. **Refactor `GameShell`** to support a multiplayer mode:
   - Accept optional `gameClient: GameClient` prop
   - When `gameClient` is provided: skip `StartScreen`, use `GameClient` for
     input routing and state, disable pause
   - Convert `GameStateSnapshot` to the fields needed for rendering
   - Route DAS/ARR through `GameClient.sendInput()`

2. **Update `GameMultiplayer`** to construct and manage `GameClient`:
   - Create `GameClient` when the component mounts with game session data
   - Pass it to `GameShell`
   - Dispose on unmount or game end

3. **Update `App.tsx`** to pass socket through to `GameMultiplayer`

4. **Ensure lobby-client pending garbage still works**: The `GameClient`
   constructor subscribes to `gameStateSnapshot` for the local player. The
   lobby client's handler also subscribes. Both subscriptions coexist (the
   socket supports multiple listeners per message type). The lobby handler
   continues to extract `pendingGarbage` for the garbage meter.

### Step 4: Run full test suite (R3, R4)

- `npm test` — all unit tests pass
- `npm run test:e2e` — Playwright tests pass

### Step 5: Manual integration verification (R5)

Verify the full multiplayer flow works end-to-end by starting both servers
and testing with the browser.
