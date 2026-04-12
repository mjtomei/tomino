# Implementation Spec: Multiplayer Rematch Flow E2E Tests

## Overview

Add Playwright E2E tests for the multiplayer rematch flow on the results screen.
The tests cover the rematch button state transitions, vote synchronization between
players, the full rematch cycle returning to the waiting room, and the back-to-lobby
flow.

**New file:** `e2e/multiplayer-rematch.spec.ts`

---

## Requirements

### R1: Clicking rematch shows waiting state

- **Test:** `"clicking rematch shows waiting state"`
- **Flow:** Use `setupAndStartGame` (from `e2e/multiplayer-game.spec.ts` pattern) to
  create a 2-player game. Force the host to top out via `forceTopOut`. Wait for
  `[data-testid="game-results"]` on both pages. On the host's results screen, click
  `[data-testid="rematch-btn"]`.
- **Assertions:**
  - Button text changes to `"WAITING..."` (`GameResults.tsx:181` — `hasVoted` state
    flips to `true`)
  - Button becomes disabled (`GameResults.tsx:174` — `disabled={hasVoted}`)
  - `[data-testid="rematch-status"]` appears showing `"1/2 voted for rematch"`
    (`GameResults.tsx:191-193` — rendered when `rematchVotes` is non-null)
- **Server path:** `requestRematch` message → `handleRequestRematch`
  (`rematch-handlers.ts:37-85`) → records vote in `rematchVotes` Map → broadcasts
  `rematchUpdate` with `votes: [hostId], totalPlayers: 2`
- **Client path:** `rematchUpdate` socket event (`lobby-client.ts:417-428`) updates
  `rematchVotes` state → `GameResults` re-renders with vote count

### R2: Opponent sees rematch vote count update

- **Test:** `"opponent sees rematch vote count update"`
- **Flow:** After the host votes for rematch (same setup as R1), check the guest's page.
- **Assertions:**
  - Guest's `[data-testid="rematch-status"]` shows `"1/2 voted for rematch"`
  - Guest's `[data-testid="rematch-btn"]` still shows `"REMATCH"` (not voted yet —
    `hasVoted` is local React state, not server-driven)
- **Server path:** The `rematchUpdate` broadcast goes to all players in the room
  (`rematch-handlers.ts:74-79` — `ctx.broadcastToRoom`)

### R3: Both players accepting rematch starts a new game

- **Test:** `"both players accepting rematch starts a new game"`
- **Flow:** Both host and guest click `[data-testid="rematch-btn"]`. Server detects
  unanimity (`rematch-handlers.ts:82` — `votes.size >= totalPlayers`) and calls
  `resetToWaiting` (`rematch-handlers.ts:135-148`).
- **Server path:** `resetToWaiting` clears votes, removes game session, sets room status
  to `"waiting"`, broadcasts `roomUpdated` with the reset room.
- **Client path:** `roomUpdated` handler (`lobby-client.ts:240-254`) detects
  `prev.view === "results" && msg.room.status === "waiting"` → transitions to
  `view: "waiting"`, clears all game state.
- **Actual behavior:** Both players return to the **waiting room** (not directly into a
  new game). The host sees the "Start Game" button; the guest sees "Waiting for host to
  start...".
- **Assertions:**
  - `[data-testid="game-results"]` is no longer visible on both pages
  - The waiting room heading is visible on both pages (players are back in the room)
  - Both player names appear in the waiting room (room is intact)

### R4: Back to lobby returns both players to lobby

- **Test:** `"back to lobby returns both players to lobby"`
- **Flow:** Game ends, host clicks `[data-testid="back-to-lobby"]`.
- **Host path:** `leaveRoom()` (`lobby-client.ts:520-542`) sends `leaveRoom` message
  and immediately resets local state to `view: "menu"`.
- **Server path:** `handleLeaveRoom` (`lobby-handlers.ts:105-144`) removes host from
  room, calls `removeRematchVote` (no-op if no votes), broadcasts `playerLeft` to guest,
  and if `hostChanged` broadcasts `roomUpdated`.
- **Guest behavior:** Guest receives `playerLeft` (removes host from player list) and
  possibly `roomUpdated` (with `hostChanged`). However, since room status remains
  `"finished"` (no rematch votes existed to trigger `resetToWaiting`), the guest's view
  stays on `"results"`. The guest is NOT stuck — they can click "BACK TO LOBBY" themselves.
- **Assertions:**
  - Host sees lobby menu: "Create Room" and "Join Room" buttons visible
  - Guest's results screen is still visible (game-results testid present)
  - Guest can click "BACK TO LOBBY" and return to the lobby menu

### R5: Rematch button cannot be clicked twice

- **Test:** `"rematch button cannot be clicked twice"`
- **Flow:** Host clicks rematch once.
- **Client guard:** `hasVoted` local state (`GameResults.tsx:67,174`) disables the button
  after first click.
- **Server guard:** `rematch-handlers.ts:67` — `if (votes.has(playerId)) return;` ignores
  duplicate votes.
- **Assertions:**
  - After first click, button has `disabled` attribute
  - Attempt `page.click` with `force: true` (bypasses Playwright's disabled check)
  - Vote count remains `"1/2 voted for rematch"` (not `"2/2"`)

---

## Implicit Requirements

### IR1: Test timeout must be 90 seconds

All tests involve full game lifecycles (create room → join → start → play to game over →
interact with results). The 90s timeout matches the existing `multiplayer-game.spec.ts`
pattern (`test.setTimeout(90_000)`).

### IR2: Proper browser context cleanup

Each test must close both player contexts in a `finally` block to prevent resource leaks,
matching the pattern in `multiplayer-game.spec.ts`.

### IR3: Wait for results screen before interacting

After `forceTopOut`, both pages must show `[data-testid="game-results"]` before any
rematch/lobby button interactions. The host may also need to see
`[data-testid="spectator-overlay"]` first (topped-out player sees spectator overlay
before results).

### IR4: Reuse existing helpers

Import from `./helpers`: `createPlayerContext`, `createRoom`, `joinRoom`,
`sendKeyboardInput`, `waitForGameState`, `PlayerHandle`. Inline `setupAndStartGame` and
`forceTopOut` in the test file (same pattern as `multiplayer-game.spec.ts` — these are
file-local helpers, not exported from the helpers module).

### IR5: The "rematch starts new game" flow goes through the waiting room

The task description says "a new game countdown should start" but the actual
implementation resets to the waiting room (`resetToWaiting`). The host must click
"Start Game" again. The test should verify players return to the waiting room, not
that a game automatically starts.

---

## Ambiguities

### A1: "Both players accepting rematch starts a new game" — what does "new game" mean?

**Resolution:** The server resets the room to `"waiting"` status after unanimous rematch
vote. Both clients transition from `"results"` view to `"waiting"` view. The test will
verify that the results screen disappears and the waiting room appears (proving the
rematch cycle completed successfully). The task's mention of
`[data-testid="game-multiplayer"]` appearing is inaccurate — the flow goes through the
waiting room first. We will verify the waiting room instead.

### A2: Guest behavior when host clicks "Back to Lobby" without prior rematch votes

**Resolution:** Based on code analysis: when no rematch votes exist,
`removeRematchVote` returns early (`rematch-handlers.ts:99`), so `resetToWaiting` is
NOT called. The guest stays on the results screen (room status remains `"finished"`).
The guest receives `playerLeft` and possibly `roomUpdated` (for host change), but the
view doesn't transition. The test will verify the guest can still click "Back to Lobby"
themselves. This matches the task note: "the exact behavior when one player leaves may
vary — the test should verify the guest isn't stuck on a dead results screen."

### A3: Test case 5 — how to attempt a second click on a disabled button

**Resolution:** Use Playwright's `click({ force: true })` to bypass the actionability
check on a disabled button, then verify the vote count didn't change. This tests both
the client-side guard (disabled attribute) and confirms the server guard (duplicate vote
rejection) by checking the count stays at 1/2.

---

## Edge Cases

### EC1: Race condition in vote count display

After the host clicks rematch, the `rematchUpdate` broadcast arrives asynchronously on
both clients. Tests must use `toHaveText` with appropriate timeouts (Playwright's
auto-retry) rather than immediate assertions.

### EC2: Results screen timing after top-out

The host tops out first, sees the spectator overlay, and then when the game ends (server
determines game over since only 1 player remains), both players see the results screen.
There may be a brief delay between the spectator overlay appearing and the results screen
appearing. Tests should wait for `[data-testid="game-results"]` with sufficient timeout.

### EC3: Guest's "Back to Lobby" after host has already left

When the guest clicks "Back to Lobby" after the host has already left, the `leaveRoom`
message is sent to the server. Since the guest is now the last player, the room is
deleted. This is a normal path — the guest transitions to `view: "menu"` locally
regardless of server response.
