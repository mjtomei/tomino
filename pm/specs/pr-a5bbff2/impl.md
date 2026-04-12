# Implementation Spec: Three-or-more player game E2E tests

## Overview
New E2E test file `e2e/multiplayer-3player.spec.ts` exercising 3-player multiplayer scenarios. All existing multiplayer E2E tests use exactly 2 players; this covers the 3+ player core use case.

## Requirements

### R1: Three players can join a room and see each other
**Test:** `"three players can join a room and see each other"`

- Use `createPlayerContext(browser, name)` from `e2e/helpers/player.ts` to create 3 isolated browser contexts (e.g. "Alice", "Bob", "Charlie").
- Player 1 creates a room via `createRoom(page)` from `e2e/helpers/lobby.ts`.
- Players 2 and 3 join with `joinRoom(page, roomId)`.
- All three pages must show all three player names in the waiting room player list.
- Player count text must contain `"3/"` — sourced from `WaitingRoom.tsx:50` which renders `Players ({room.players.length}/{room.config.maxPlayers})`. Default `maxPlayers` is 4 (set in `packages/client/src/net/lobby-client.ts:507`), so the text will be `"Players (3/4)"`.
- Host's Start Game button must be enabled (`canStart = room.players.length >= 2` in `WaitingRoom.tsx`).
- Close all 3 contexts in cleanup.

### R2: First elimination shows spectator overlay only for eliminated player
**Test:** `"3-player game: first elimination shows spectator overlay only for eliminated player"`

- Start a 3-player game (create room, 2 players join, host clicks Start Game, wait for `[data-testid="game-multiplayer"]` on all 3 pages).
- Player 1 hard-drops rapidly to top out (same `forceTopOut` pattern as `multiplayer-game.spec.ts:44-51`).
- Player 1 sees `[data-testid="spectator-overlay"]` with text "ELIMINATED" and "You placed 3rd" (from `SpectatorOverlay.tsx`).
- Players 2 and 3 must NOT see `[data-testid="spectator-overlay"]` — they should still see the active game (`[data-testid="game-multiplayer"]`).
- Verify Players 2 and 3 can still interact: send a hard drop on each to confirm the game accepts input (no crash, no game-over).

### R3: Second elimination ends game and shows correct placements
**Test:** `"3-player game: second elimination ends game and shows correct placements"`

- After Player 1 tops out (from R2 scenario), have Player 2 hard-drop rapidly to also top out.
- All three players see `[data-testid="game-results"]`.
- Player 3 (last standing, winner) sees `"VICTORY"` (`.results-title` text) and `"1st"` (`[data-testid="results-placement"]`).
- Player 2 sees `"DEFEATED"` and `"2nd"`.
- Player 1 sees `"DEFEATED"` and `"3rd"`.
- On every player's results table (`[data-testid="results-table"]`), there are 3 `.results-row` elements (CSS class, matching existing test pattern from `multiplayer-game.spec.ts:97-101`).
- All three player names appear in each results table.

### R4: Opponent boards shown for all opponents
**Test:** `"3-player game: opponent boards are shown for all opponents"`

- During an active 3-player game, each player should see 2 opponent mini-boards.
- Each player's page has exactly 2 `[data-testid="opponent-board"]` elements visible.
- The `opponent-boards` container (`[data-testid="opponent-boards"]`) is rendered in `GameMultiplayer.tsx` and contains one `OpponentBoard` per opponent (all players except the local player).

### R5: Targeting selector appears in 3-player game
**Test:** `"targeting selector appears in 3-player game"`

- During an active 3-player game, `[data-testid="targeting-selector"]` is visible on each player's page.
- It shows strategy buttons — at minimum "Random" via `[data-testid="targeting-btn-random"]`.
- Click a different strategy button (e.g. `[data-testid="targeting-btn-attackers"]`) and verify it becomes active (gets blue background `#4040d0` or bold font-weight from `TargetingSelector.tsx` active styling).

## Implicit Requirements

### IR1: Test timeout
All tests use `test.setTimeout(120_000)` — 3 browser contexts are heavier than 2. The task specifies 120s.

### IR2: Shared setup helper
Tests R2, R3, R4, R5 all need a running 3-player game. A shared `setupAndStart3PlayerGame(browser)` helper should be created (analogous to `setupAndStartGame` in `multiplayer-game.spec.ts:15-38`) that:
1. Creates 3 player contexts
2. Creates a room, has players 2 and 3 join
3. Clicks Start Game
4. Waits for `[data-testid="game-multiplayer"]` on all 3 pages
5. Returns `{ player1, player2, player3, roomId }`

### IR3: forceTopOut helper
Reuse the same pattern as `multiplayer-game.spec.ts:44-51`: send ~25 hard drops with 150ms delays between each. This can be a local helper in the file (same as the existing test file does it — not exported from helpers).

### IR4: Context cleanup
All tests must close all 3 browser contexts in a `finally` block (pattern from `multiplayer-game.spec.ts:63,113`).

### IR5: Countdown wait
After clicking Start Game, there's a countdown before the game board appears. The wait timeout for `game-multiplayer` should be generous (15_000ms per context, matching existing tests).

### IR6: Results-row selector
The existing 2-player test uses `.results-row` (CSS class) to count rows: `'[data-testid="results-table"] .results-row'`. The 3-player tests should use the same pattern for consistency.

## Ambiguities

### A1: Test independence vs. combined scenarios (R2 + R3)
R2 tests first elimination and R3 tests second elimination. These could be:
- (a) Two independent tests, each setting up a fresh 3-player game
- (b) One combined test that does both eliminations sequentially

**Resolution:** Implement as separate tests for isolation and clear failure diagnostics, even though it's slower. Each test sets up its own game. R3's test will perform both eliminations (Player 1 tops out, then Player 2 tops out) within a single test.

### A2: R4 and R5 timing — during active game vs. from start
The task says "during an active 3-player game" — this means after Start Game, once the game board is visible, before any player tops out.

**Resolution:** These tests set up a 3-player game, verify the assertions immediately after the game starts (before any top-outs), then clean up.

### A3: Results-row count uses CSS class `.results-row` vs data-testid `results-row-{pid}`
The task says "3 `.results-row` elements." The component uses both: CSS class `results-row` on every row AND data-testid `results-row-{pid}` per player. The existing 2-player test uses `.results-row` class selector.

**Resolution:** Use `.results-row` CSS class selector (matching existing test convention) for counting rows. Use `toContainText` on the results-table for verifying player names.

### A4: Targeting button active state verification
The task says "verify it becomes active (gets the active styling)." The active button in `TargetingSelector.tsx` gets inline styles: `border: "1px solid #4040d0"`, `background: "#4040d0"`, `fontWeight: "bold"`.

**Resolution:** Check for `font-weight: bold` via CSS computed style, or use `toHaveCSS({ fontWeight: '700' })`. Alternatively, click the button and verify it has the expected background color. Using `toHaveCSS` with `background-color` is most reliable since it's the most visually distinct active indicator.

## Edge Cases

### EC1: WebSocket connection timing with 3 contexts
Three simultaneous browser contexts connecting to the same server may cause timing issues. The helpers already wait for button-enabled states before acting, which should handle this.

### EC2: Race between elimination and spectator overlay
When Player 1 tops out in a 3-player game, the server must notify all clients. There may be a brief delay before the spectator overlay appears on Player 1. The `waitForElimination` helper (or direct `toBeVisible` with timeout) handles this.

### EC3: Player 2 topping out while Player 1 is spectating
In R3, after Player 1 is eliminated and spectating, Player 2 also tops out. The game should transition from 2-alive to 1-alive (Player 3 wins), ending the game. The server handles this transition; the test verifies the results screen appears for all 3 players.

### EC4: Targeting selector may not appear in 2-player games
The `TargetingSelector` only renders when `targetingSettings` is provided. In 2-player games there's only one possible target, so targeting may be suppressed. In 3+ player games, targeting should be active. R5 verifies this explicitly.
