# Implementation Spec: E2E Multiplayer Game Flow Test

## PR: pr-86780be

---

## 1. Requirements

### R1: Full game lifecycle — room creation → game start → play → game over → winner

**Test file:** `e2e/multiplayer-game.spec.ts`

Two browser contexts exercise the complete multiplayer flow:

1. **Room creation/join:** Use existing helpers `createPlayerContext()`, `createRoom()`, `joinRoom()` from `e2e/helpers/`.
2. **Host starts game:** Click "Start Game" button on host's page. Wait through countdown (3, 2, 1, "Go!" rendered by `Countdown` component in `packages/client/src/ui/Countdown.tsx`). The view transitions: `waiting` → `countdown` → `playing`.
3. **Both players make moves:** Use `sendKeyboardInput()` from `e2e/helpers/input.ts` to send keyboard actions (`hardDrop`, `moveLeft`, `moveRight`, etc.). The game board is rendered by `GameMultiplayer` (`[data-testid="game-multiplayer"]`).
4. **One player tops out:** Repeated hard drops will eventually fill the board and trigger `topOut` (engine detects this in `packages/shared/src/engine/engine.ts:629`). The server broadcasts `S2C_GameOver` then `S2C_GameEnd`.
5. **Winner declared:** The UI transitions to `results` view showing `GameResults` component (`[data-testid="game-results"]`). Winner sees "VICTORY", loser sees "DEFEATED". Both see placement via `[data-testid="results-placement"]`.

### R2: Disconnect/reconnect during a game

1. **Mid-game disconnect:** Close one player's browser context (simulates disconnect).
2. **Server broadcasts `S2C_PlayerDisconnected`** with 15-second timeout (`RECONNECT_WINDOW_MS` in `packages/server/src/disconnect-handler.ts`).
3. **Remaining player sees disconnect overlay** (`[data-testid="disconnect-overlay"]` from `packages/client/src/ui/DisconnectOverlay.tsx`).
4. **Reconnect:** Create a new browser context, navigate, rejoin the room. Server sends `S2C_PlayerReconnected` and `S2C_GameRejoined`.
5. **Game continues:** Disconnect overlay disappears. Play resumes normally until game over.

### R3: Validate the complete stack

The test inherently validates: React UI → WebSocket → server game session → engine state → UI updates. No mocking — this is a true E2E test using the Playwright `webServer` config to start both server (`localhost:3001`) and client (`localhost:5173`).

---

## 2. Implicit Requirements

### IR1: Countdown must complete before inputs are sent
The countdown phase (3→2→1→Go! + 1s delay) takes ~4 seconds. Tests must wait for the game board (`[data-testid="game-multiplayer"]`) to be visible before sending keyboard inputs.

### IR2: Topping out requires many hard drops
To force a game over, we need to repeatedly hard drop pieces. The standard board is 20 rows high with pieces of 1–2 cells, so ~10–20 hard drops should fill a column. We should loop hard drops with small delays rather than fire them all at once, to allow the engine to process each piece.

### IR3: Both players must see the results screen
After game end, both the winner and loser transition to the `results` view. The loser first sees `SpectatorOverlay` (`[data-testid="spectator-overlay"]`) briefly, then both see `GameResults`.

### IR4: Reconnect requires knowing the room ID and player name
To rejoin after disconnect, the new context must navigate to the app, enter the same player name, and issue a rejoin. We need to check how the client handles rejoin — does it auto-rejoin or require manual action?

### IR5: Test timeouts need to be generous
The full game flow (room setup + countdown + gameplay + game over) could take 15–30 seconds. Individual test timeout should be at least 60 seconds, and the disconnect test with its 15-second window needs even more.

### IR6: Cleanup browser contexts
Each test must close browser contexts in a `finally` block or use `test.afterEach` to avoid leaked browsers.

---

## 3. Ambiguities

### A1: How to force a quick game over
**Resolution:** Repeatedly hard drop pieces on one player's board while the other player plays normally (or also hard drops). Hard dropping without moving will stack pieces in the center, filling the board in ~10-15 drops. We'll send hard drops in a loop with small delays between them to let the server process each input.

### A2: How reconnection works on the client side
**Resolution:** After examining the code, the client uses `C2S_RejoinRoom` message. The lobby client has a `rejoinRoom` flow that requires knowing the room ID. For the E2E test, we can simulate disconnect by closing the browser context, then create a new context with the same player name, navigate to the app, and use the WebSocket rejoin mechanism. However, the UI flow for rejoining may need to go through the lobby → join room path.

**Resolved:** The `ReconnectController` class exists in `packages/client/src/net/reconnect.ts` but is **not imported or used anywhere** in the client. There is no auto-reconnect wired up. The client stores only the player name in localStorage (not room/session info). This means reconnecting mid-game is not supported by the current UI. The disconnect test should focus on the **forfeit path**: when a player disconnects and the 15-second timeout expires, the remaining player wins by default.

### A3: Whether "game-multiplayer" test ID appears for both players
**Resolution:** Yes — both players are in the `playing` view state and render `GameMultiplayer`. Each player sees their own board and opponent boards via `[data-testid="opponent-boards"]`.

### A4: How to distinguish winner from loser in results
**Resolution:** The `GameResults` component shows "VICTORY" for the winner and "DEFEATED" for the loser via `isWinner = localPlayerId === winnerId`. We can assert on the `h2.results-title` text content.

---

## 4. Edge Cases

### EC1: Both players top out simultaneously
If both players hard drop rapidly, they might top out in the same server tick. The server handles this: `checkForWinner()` accepts `lastOutPlayerId` — the last player eliminated wins if all are eliminated. Test should verify this doesn't crash, but it's unlikely in practice.

### EC2: Disconnect during countdown
Server cancels the game if a player disconnects during countdown. We should NOT test this in the disconnect/reconnect test — instead, disconnect during the `playing` phase.

### EC3: Game over race with disconnect
If the remaining player tops out while the disconnected player is in the grace window, the disconnected player could win by default. Not critical to test but worth noting.

### EC4: Slow piece processing
Hard drops sent too fast might queue up. We should add small delays (~100ms) between hard drops to let the server tick loop process each one.

---

## 5. Test Plan

### Test 1: `full game lifecycle — two players play until game over`
1. Create two player contexts (Alice, Bob)
2. Alice creates room, Bob joins
3. Alice clicks "Start Game"
4. Wait for countdown to finish and game board to appear on both pages
5. Alice hard drops pieces rapidly (filling her board)
6. Wait for Alice's game over → spectator overlay appears
7. Wait for game end → both see `GameResults`
8. Verify Alice sees "DEFEATED", Bob sees "VICTORY"
9. Verify results table shows both players with stats

### Test 2: `disconnect during game causes forfeit after timeout`
1. Create two player contexts (Alice, Bob)
2. Alice creates room, Bob joins, Alice starts game
3. Wait for game to be playing
4. Close Bob's browser context (simulates disconnect)
5. Verify Alice sees disconnect overlay (`[data-testid="disconnect-overlay"]`)
6. Wait for 15-second reconnect timeout to expire
7. Verify Alice sees game results — wins by forfeit ("VICTORY")

Note: Client-side reconnection is not wired up (ReconnectController exists but is unused), so we only test the forfeit/timeout path. The reconnect test from the original task description is descoped.

---

## 6. Key Files

| File | Role |
|------|------|
| `e2e/multiplayer-game.spec.ts` | New test file (to create) |
| `e2e/helpers/index.ts` | Re-exports test helpers |
| `e2e/helpers/player.ts` | `createPlayerContext()` — browser context setup |
| `e2e/helpers/lobby.ts` | `createRoom()`, `joinRoom()` — room management |
| `e2e/helpers/input.ts` | `sendKeyboardInput()` — keyboard action mapping |
| `e2e/helpers/game-state.ts` | `waitForGameState()` — wait for DOM selectors |
| `packages/client/src/App.tsx` | View routing (countdown → playing → results) |
| `packages/client/src/ui/GameMultiplayer.tsx` | Game board component |
| `packages/client/src/ui/GameResults.tsx` | Results screen |
| `packages/client/src/ui/DisconnectOverlay.tsx` | Disconnect countdown |
| `packages/client/src/ui/SpectatorOverlay.tsx` | Eliminated player overlay |
| `packages/server/src/game-session.ts` | Server game state machine |
| `packages/server/src/disconnect-handler.ts` | Reconnect timeout (15s) |
