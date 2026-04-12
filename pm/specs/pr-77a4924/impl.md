# Implementation Spec: Stats Screen and Post-Game UI E2E Tests

## File: `e2e/stats-screen.spec.ts` (new)

---

## Requirements

### Test 1: "view stats button opens stats screen"

**Flow:** Play a 2-player game to completion (host hard-drops to top out). On the winner's (guest's) results screen, click `[data-testid="view-stats"]`. Verify:
- The stats screen appears: `div.stats-screen` becomes visible.
- The heading contains "Stats for {name}": `h1` inside `.stats-header` with text "Stats for Bob".
- No error state: `.stats-empty` with text matching "Error:" should NOT be present.
- If the stats API returns player data, the rating card `.stats-rating-card` is visible.

**Source files:**
- `packages/client/src/ui/StatsScreen.tsx:66-94` — renders `.stats-screen` container with `.stats-header > h1` ("Stats for {username}") and `.stats-rating-card`.
- `packages/client/src/ui/StatsScreen.tsx:48-59` — error state renders `.stats-empty` with "Error: {message}".
- `packages/client/src/App.tsx:158` — `onViewStats` sets `showStats=true`, which renders `<StatsScreen>`.
- `packages/client/src/App.tsx:39-44` — when `showStats` is true, renders StatsScreen and hides everything else.

**Selectors:**
- Click: `[data-testid="view-stats"]`
- Verify visible: `.stats-screen`
- Verify heading text: `.stats-screen .stats-header h1` contains "Stats for Bob"
- Verify no error: `.stats-screen .stats-empty` should either not exist or not contain "Error:"
- Optional verify: `.stats-rating-card` visible (if API returns player data)

### Test 2: "stats screen back button returns to results"

**Flow:** From the stats screen (opened in test 1), click `.stats-back-btn`. Verify `[data-testid="game-results"]` is visible again.

**Source files:**
- `packages/client/src/ui/StatsScreen.tsx:69` — `.stats-back-btn` calls `onBack` prop.
- `packages/client/src/App.tsx:42` — `onBack` sets `showStats(false)`, which hides StatsScreen and re-renders the results view.

**Selectors:**
- Click: `.stats-back-btn`
- Verify visible: `[data-testid="game-results"]`

### Test 3: "results table shows plausible stat values for both players"

**Flow:** After the game where the host hard-dropped many pieces, on the results screen verify:
- The results table has exactly 2 `.results-row` elements.
- For each row, extract the 6 `.cell-stat` elements (Sent, Recv, Pieces, Lines, Score, Time).
- Pieces (index 2): positive integer >= 1 (host hard-dropped ~25 pieces, guest dropped 0 but still has >= 0).
- Score (index 4): non-negative number (may have locale commas via `.toLocaleString()`).
- Time (index 5): matches format `M:SS.CC` (e.g. "0:05.32") per `formatTime()` in `packages/client/src/ui/formatTime.ts:14-21`.

**Source files:**
- `packages/client/src/ui/GameResults.tsx:91-147` — results table with `.results-row` and `.cell-stat` cells.
- `packages/client/src/ui/GameResults.tsx:119-124` — stat cells in order: linesSent, linesReceived, piecesPlaced, linesCleared, score (toLocaleString), formatTime(survivalMs).
- `packages/client/src/ui/formatTime.ts:14-21` — format is `M:SS.CC`.

**Selectors:**
- Rows: `[data-testid="results-table"] .results-row`
- Stat cells per row: `.cell-stat` (6 cells, indices 0-5)

**Note on "at least 1 piece":** The host hard-dropped ~25 pieces so will have pieces >= 1. The guest (Bob) does nothing — but the game still spawns the first piece for them, so piecesPlaced may be 0 (no lock). The task says "at least 1" for each row, but the guest may have 0 pieces placed. Resolution: check that the host row (the one that hard-dropped) has pieces >= 1. For the guest, accept pieces >= 0 since they may not have locked any pieces.

### Test 4: "results table stat values are non-negative numbers"

**Flow:** For every `.cell-stat` in the results table (all rows), excluding the Time column (index 5, which is a formatted string), parse the text content and verify it's a valid non-negative integer after removing commas.

**Source files:**
- `packages/client/src/ui/GameResults.tsx:119-123` — stat cells: linesSent, linesReceived, piecesPlaced, linesCleared are plain numbers. Score uses `.toLocaleString()` which may insert commas.

**Logic:**
- For each `.results-row`, get all `.cell-stat` elements.
- For indices 0-4 (Sent, Recv, Pieces, Lines, Score): strip commas, parse as integer, assert >= 0 and not NaN.
- Skip index 5 (Time).

### Test 5: "match history appears after playing a game"

**Flow:** Play a game to completion. Open the stats screen. If the match history table `.stats-table` is visible, verify:
- The `<tbody>` has at least 1 `<tr>`.
- Each row has 4 `<td>` cells (Opponent, Result, Rating Change, Date).
- The Result cell (index 1) contains either "Win" or "Loss".

**Source files:**
- `packages/client/src/ui/StatsScreen.tsx:106-149` — match history table with 4 columns.
- `packages/client/src/ui/StatsScreen.tsx:126` — Result is "Win" or "Loss" text.
- `packages/server/src/stats-routes.ts` — API returns matchHistory array.

**Selectors:**
- Table: `.stats-table`
- Rows: `.stats-table tbody tr`
- Cells per row: `td` (4 cells)

**Note:** The match we just played should appear in the history. However, there's a timing consideration: the stats are fetched when the StatsScreen mounts. The game result must have been persisted to the database before the fetch. In practice, the server saves the result before sending the game-end message to clients, so by the time a player clicks "View Stats", the result should be persisted.

### Test 6: "rating changes appear on results screen"

**Flow:** After the game ends, verify that `[data-testid^="rating-"]` elements appear on the results screen (one per player). Each should contain:
- A `.rating-value` element with a numeric rating.
- A `.rating-delta` element with "+" or "-" prefix followed by a number.
- Wait up to 5s for the rating elements since they arrive asynchronously.

**Source files:**
- `packages/client/src/ui/GameResults.tsx:101-144` — rating column only rendered when `ratingChanges !== undefined`.
- `packages/client/src/ui/GameResults.tsx:129-143` — rating cells with `data-testid="rating-{pid}"`, `.rating-value`, `.rating-delta`.
- `packages/client/src/App.tsx:160` — `ratingChanges` comes from `lobby.state.gameEndData.ratingChanges`.

**Selectors:**
- Rating elements: `[data-testid^="rating-"]` (matches `rating-p1`, `rating-p2`)
- Rating value: `.rating-value` within the rating element
- Rating delta: `.rating-delta` within the rating element

**Note:** Rating changes arrive asynchronously. The component initially shows "..." then updates. We need to wait for `.rating-value` to appear within the rating elements, with a 5s timeout.

---

## Implicit Requirements

1. **Game must complete before results screen tests:** All tests depend on a full multiplayer game lifecycle — two players connect, game starts, one player tops out, results screen appears.

2. **Stats API must be functional:** Tests 1 and 5 require `/api/stats/{username}` to respond. The server must have a working stats database. For a fresh test environment, the stats may show no prior games, but the just-completed game should be recorded.

3. **Rating system must be enabled:** Test 6 requires the server to compute and send rating changes. The server must have the Glicko-2 rating system active and return `ratingChanges` in the game-end data.

4. **StatsScreen replaces entire view:** When `showStats` is true in App.tsx, the StatsScreen is rendered instead of the game/results view (lines 39-44). Going back from stats restores the previous view. This means the results screen state must be preserved while stats is shown.

5. **Test isolation:** Each test needs its own game setup or tests should share setup within a describe block to avoid redundant game plays (since game setup takes significant time).

6. **Score toLocaleString formatting:** Score values in the results table use `Number.toLocaleString()` which may insert commas (e.g., "1,234"). Parsing must strip commas.

7. **Time format is M:SS.CC:** The `formatTime` function outputs `M:SS.CC` format (e.g., "0:05.32"), not "0:XX" or "X:XX" as the task description suggests. Tests should match the actual format.

---

## Ambiguities

### 1. Test structure — shared game setup vs. per-test setup
**Resolution:** Use a shared game setup within a `test.describe` block. Playing a full game takes 15-30 seconds, and playing 6 separate games would exceed the 90s timeout. Tests 1-6 can share a single game: play the game once, then run sequential assertions on the results screen, stats screen, and back. Tests that need the results screen visible (3, 4, 6) should run before navigating to stats (1, 2, 5).

### 2. Which player's page to test results on
**Resolution:** Use the winner's page (guest/Bob) for the stats screen tests (1, 2, 5) since the task says "On the winner's results screen, click view-stats." Use the host's page (Alice) for results table tests (3, 4) since Alice hard-dropped many pieces and will have meaningful stat values. Test 6 (rating changes) can use either page.

### 3. "Pieces" column "at least 1" for both players
The task says "For each row, the Pieces column should be a positive number (at least 1)." However, the guest (Bob) does nothing — they have 0 pieces placed. 
**Resolution:** Check pieces >= 1 only for the host (who hard-dropped). For the guest, accept pieces >= 0. Alternatively, both players must have >= 0 pieces, and at least one player has >= 1. The test description seems to expect both rows to have positive pieces, but the game mechanics don't support this when one player is idle.

### 4. Stats screen might show "No matches yet" for a fresh database
The stats API might not have the just-completed match if there's a race condition.
**Resolution:** The match history test (5) uses a conditional: "If the match history table is visible." If `.stats-table` is not visible (showing "No matches yet" instead), skip the row assertions. This handles the case where the stats database doesn't have the match yet.

### 5. Rating changes may not appear in all environments
If the rating system is disabled or the rating computation fails, `ratingChanges` may be `undefined` and the rating column won't render.
**Resolution:** Test 6 should wait for rating elements with a timeout and soft-fail if they don't appear within 5s. However, the task says to "verify that `[data-testid^="rating-"]` elements appear," implying they should appear. We'll assert they appear with a 5s timeout, treating absence as a test failure.

---

## Edge Cases

1. **Stats screen loading state:** The StatsScreen shows "Loading stats..." before the API responds. Tests must wait for the loading to complete before asserting content. Wait for `.stats-screen` (success) or `.stats-loading` to disappear.

2. **Rating animation timing:** Rating changes have a staggered animation (`animationDelay: idx * 0.15s`, 0.6s duration). The `.rating-value` element exists in the DOM immediately when `ratingChanges` is defined, but may not be visually visible until the animation plays. Playwright's `toBeVisible()` should handle this since the element is in the DOM.

3. **Score locale formatting:** `Number.toLocaleString()` output depends on the browser's locale. In Playwright's Chromium, the default locale is typically `en-US`, so commas are used as thousand separators. Tests should strip commas before parsing.

4. **Multiple results rows with same stat structure:** The results table sorts by placement (winner first). The first `.results-row` is the winner (guest/Bob), second is the loser (host/Alice). Tests should account for this ordering when checking specific stat values.

5. **Stats screen fetch timing:** The StatsScreen fetches on mount. If the game result hasn't been persisted yet, the match won't appear in history. The server should persist before sending game-end, but network latency could cause a race. A brief wait before opening stats could help, but in practice the user clicking "View Stats" introduces enough delay.

---

## Implementation Plan

### Test file structure:
```
e2e/stats-screen.spec.ts
```

### Shared setup pattern:
- Single `test.describe` block with `test.setTimeout(90_000)`.
- Shared `setupAndStartGame` + `forceTopOut` pattern (same as existing tests).
- Tests run in order with shared page state where possible, but Playwright tests are independent by default.
- Since Playwright runs tests in parallel by default and each test gets fresh browser state, each test that needs a completed game must set one up.
- **Optimization:** Group tests that can share game state using `test.describe.serial()` to run in order, reusing browser contexts across tests.

### Key helper reuse:
- Import from `./helpers`: `createPlayerContext`, `createRoom`, `joinRoom`, `sendKeyboardInput`, `waitForGameState`, `PlayerHandle`
- Reuse `setupAndStartGame` and `forceTopOut` patterns from existing tests.
