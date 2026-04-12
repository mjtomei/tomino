# Playwright Testing — Comprehensive E2E Coverage & Bug Fixes

## Context

The project already has basic Playwright infrastructure (`playwright.config.ts`,
`e2e/` directory, helpers for player contexts, lobby, input, and game-state
polling) with tests covering smoke loading, lobby create/join, a 2-player game
lifecycle with disconnect/forfeit, and a full integration test verifying results.

However, several user-facing bugs have been discovered that the existing tests
did not catch, and large areas of functionality have no E2E coverage at all.

## Known Bugs to Fix

1. **Arrow key scrolls page while held** — In `GameShell.tsx`, both the
   multiplayer and solo keydown handlers check `if (e.repeat) return` *before*
   calling `e.preventDefault()`. When a player holds an arrow key, repeated
   keydown events have `e.repeat === true`, the handler returns early, and the
   browser scrolls the page. The fix: call `preventDefault()` for mapped keys
   before the `e.repeat` early return.

2. **Classic NES mode appears to lack level progression** — The engine code
   (`scoring-nes.ts`, `gravity.ts`) correctly implements NES level-up thresholds
   and gravity curve. The bug is likely in how the UI connects ruleset selection
   to the game — the StartScreen/mode selection may not wire the NES gravity
   curve correctly, or the level display may not update reactively. Needs
   investigation during the PR.

3. **Garbage not appearing on opponent's game** — The server broadcasts
   `garbageQueued` and `garbageReceived` messages correctly, but
   `lobby-client.ts` has **no handlers** for either message. The receiving
   player's garbage meter only updates on the next full `gameStateSnapshot`
   (lower frequency), creating visible lag or missing indicators. The fix: add
   client-side handlers for `garbageQueued` and `garbageReceived` in
   `lobby-client.ts` to update `localPendingGarbage` in real time.

4. **Left/right movement double-fires on tap** — The active inline DAS
   implementation in `GameShell.tsx` relies solely on `e.repeat` to filter
   duplicate keydown events, with no `firedKeys` set like the unused
   `KeyboardHandler` class has. There is also no `blur` handler, so held-key
   state can get stuck after alt-tabbing. The fix: add `firedKeys` tracking
   and a window blur handler to the active implementation, or refactor to
   actually use the existing `KeyboardHandler` class.

## Goals

1. **Fix all four known bugs**, each with a Playwright test that would have
   caught the regression.
2. **Expand E2E test coverage** to all major features: single-player modes,
   all input actions, multiplayer flows (rematch, reconnect, 3+ players),
   room settings, handicap/targeting UI, and the stats screen.
3. **Add reference-verification tests** that check our Tetris implementation
   against authoritative specifications from the Tetris wiki and guideline
   documentation.
4. **Improve test helpers** to support richer game interaction patterns
   (movement sequences, holding keys, reading board/score state from canvas).

## Reference Sources for Verification

These authoritative sources should be used to verify implementation accuracy:

- **NES Tetris mechanics**: [Tetris (NES) — TetrisWiki](https://tetris.wiki/Tetris_(NES))
  — scoring tables, DAS (16-frame initial / 6-frame repeat), gravity per level
  (48 frames at L0 down to 1 frame at L29+), level-up thresholds
- **SRS rotation & wall kicks**: [Super Rotation System — TetrisWiki](https://tetris.wiki/Super_Rotation_System)
  — spawn orientations, basic rotation states, wall kick offset tables for
  J/L/S/T/Z and I pieces, O-piece no-kick
- **Wall kick data**: [SRS — Hard Drop Wiki](https://harddrop.com/wiki/SRS)
  — full offset tables, test order for each rotation transition
- **Guideline scoring**: [Scoring — TetrisWiki](https://tetris.wiki/Scoring)
  — point values per clear type, T-spin detection, back-to-back, combo
- **Garbage tables**: [Garbage — TetrisWiki](https://tetris.wiki/Garbage)
  — lines sent per clear type (single=0, double=1, triple=2, tetris=4),
  T-spin garbage (single=2, double=4, triple=6), B2B +1 bonus, combo table
- **TETR.IO mechanics**: [Mechanics — TETR.IO Wiki](https://tetrio.wiki.gg/wiki/Mechanics)
  — multiplier combo system, B2B chaining, garbage countering, targeting
- **DAS specification**: [DAS — TetrisWiki](https://tetris.wiki/DAS)
  — delay/repeat definitions, NES-specific frame counts

## Scope & Constraints

- All bug-fix PRs must include a regression test that fails before the fix.
- Playwright tests should run against the real client+server (no mocks) — we
  already have `webServer` config for this.
- Canvas-based rendering (BoardCanvas) cannot be asserted pixel-by-pixel in
  Playwright; use data-testid attributes, aria labels, and exposed game state
  for assertions. Add `data-testid` attributes where needed.
- Tests should be deterministic where possible. For game engine verification,
  prefer unit tests in the shared package; Playwright tests verify the UI
  wiring and user-facing behavior.
- Reference-verification tests for engine internals (scoring tables, kick
  tables, gravity curves) belong in the shared package's vitest suite, not
  Playwright. Playwright tests verify that these values reach the UI correctly.
- The `KeyboardHandler` class in `input/keyboard.ts` is fully implemented and
  tested but currently unused — the active code is inline in `GameShell.tsx`.
  The input fix PR should evaluate whether to refactor to use it.

## PRs

### PR: Expand E2E test helpers and add data-testid coverage
- **description**: This is the foundation PR that all E2E test PRs depend on. It has two parts: (A) new Playwright helpers and (B) data-testid attributes on UI components.
  **Part A — New helpers** (all in `e2e/helpers/`):
  - `holdKey(page, key, durationMs)` in `input.ts`: press a key down, wait `durationMs`, then release. Uses `page.keyboard.down(key)` / `page.keyboard.up(key)` with a `page.waitForTimeout(durationMs)` in between. Return type void.
  - `readScoreDisplay(page)` in `game-state.ts`: read the `[data-testid="score-display"]` element and parse out all `.stat-row` children. Return `{ score?: number, level?: number, lines?: number, time?: string, remaining?: number }` by matching `.stat-label` text (SCORE/LEVEL/LINES/TIME/REMAINING) and extracting `.stat-value` text content.
  - `waitForElimination(page, timeoutMs?)` in `game-state.ts`: wait for `[data-testid="spectator-overlay"]` to be visible.
  - `setupSoloGame(page, options: { preset?: "classic" | "modern" | "custom", mode?: "marathon" | "sprint" | "ultra" | "zen" })` in `solo.ts` (new file): navigate to `/`, click `[data-testid="preset-{preset}"]` to select ruleset (default "modern"), click `[data-testid="mode-{mode}"]` to select game mode (default "marathon"), click `[data-testid="start-play"]`, then wait for either `[data-testid="game-board"]` or the game canvas to be visible (confirming the game started). The StartScreen already has these testid attributes.
  - Re-export all new helpers from `index.ts`.
  **Part B — data-testid attributes** to add to UI components (only add attributes, do not change logic or layout):
  - `ScoreDisplay.tsx`: already has `data-testid="score-display"` on the container. Add `data-testid="stat-{stat}"` to each `StatRow`'s outer div (e.g., `data-testid="stat-score"`, `data-testid="stat-level"`).
  - `GameShell.tsx`: **add** `data-testid="game-board"` to the main game board container div (the one wrapping BoardCanvas).
  - `GarbageMeter.tsx`: already has `data-testid="garbage-meter"` — no changes needed.
  - `NextQueue.tsx`: already has `data-testid="next-queue"` — no changes needed.
  - `HoldDisplay.tsx`: already has `data-testid="hold-display"` and passes `testId="hold-piece"` to PiecePreview — no changes needed.
  - `Overlay.tsx`: already has `data-testid="pause-overlay"` and `data-testid="gameover-overlay"` — no changes needed. **Important**: downstream tests must use these existing names (NOT `game-paused-overlay` / `game-over-overlay`).
  No human testing needed — helper correctness is verified by the tests in subsequent PRs.
- **tests**: Add one smoke-level E2E test in `e2e/helpers.spec.ts` that calls `setupSoloGame(page, { preset: "modern", mode: "marathon" })`, then calls `readScoreDisplay(page)` and asserts `score` is defined and `level` is defined. This validates the helper chain works end-to-end.
- **files**: `e2e/helpers/input.ts`, `e2e/helpers/game-state.ts`, `e2e/helpers/solo.ts` (new), `e2e/helpers/index.ts`, `e2e/helpers.spec.ts` (new), `packages/client/src/ui/ScoreDisplay.tsx`, `packages/client/src/ui/GameShell.tsx`
- **depends_on**:

---

### PR: Fix arrow key page scroll while held
- **description**: **Root cause**: In `GameShell.tsx`, both the solo keydown handler (~line 486) and the multiplayer keydown handler (~line 248) follow this pattern: `if (e.repeat) return;` then later `e.preventDefault();`. When a player holds an arrow key, the browser fires repeated keydown events with `e.repeat === true`. The handler returns before `preventDefault()` is called, so the browser performs its default scroll action.
  **Fix**: For BOTH handlers (solo and multiplayer), move the `preventDefault()` call to happen immediately after the key is confirmed to be a mapped game key, BEFORE the `e.repeat` early return. The corrected order should be: (1) look up `action = KEY_MAP[e.code]`, (2) if no action, return, (3) call `e.preventDefault()`, (4) if `e.repeat`, return. This ensures repeated key events still get their default prevented even though they don't fire game actions.
  **INPUT_REQUIRED**: Manual verification that holding each arrow key during gameplay no longer scrolls the page, in both solo and multiplayer modes. Also verify that Space (hard drop) doesn't scroll the page.
- **tests**: `e2e/input-bugs.spec.ts` (new) containing:
  - `test("holding ArrowDown does not scroll the page")`: call `setupSoloGame(page)`, wait 500ms for game to start, then call `holdKey(page, "ArrowDown", 600)`, then `expect(await page.evaluate(() => window.scrollY)).toBe(0)`.
  - `test("holding ArrowUp does not scroll the page")`: same pattern with ArrowUp.
  - `test("holding Space does not scroll the page")`: same pattern with Space.
  - `test("holding ArrowLeft does not scroll the page")`: same pattern with ArrowLeft.
  - `test("holding ArrowRight does not scroll the page")`: same pattern with ArrowRight.
  - Each test should also verify that `page.evaluate(() => document.documentElement.scrollTop)` is 0 (some browsers use scrollTop instead of scrollY on the document element). Set the viewport tall enough that the page body extends below the fold (or use `page.setViewportSize({ width: 800, height: 400 })` to force a small viewport that would normally scroll).
- **files**: `packages/client/src/ui/GameShell.tsx`, `e2e/input-bugs.spec.ts` (new)
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Fix left/right movement double-fire and stuck keys
- **description**: **Root cause**: The active inline DAS code in `GameShell.tsx` (both solo ~line 484 and multiplayer ~line 246) relies only on `if (e.repeat) return` to prevent duplicate actions from a single physical keypress. Unlike the unused `KeyboardHandler` class in `input/keyboard.ts` (which maintains a `firedKeys: Set<string>` and clears it on keyup, plus has a `handleBlur()` that resets all state when the window loses focus), the inline code has no such protections. This causes two problems:
  (1) **Double-fire**: If two keydown events arrive for the same key without an intervening keyup (which can happen under load or with certain keyboard hardware), the action fires twice since `e.repeat` may be false on both.
  (2) **Stuck keys**: If the user holds a direction key and alt-tabs away, the keyup event fires on the other window. When the user returns, DAS state still thinks the key is held, causing continuous phantom movement until the user presses and releases that key again.
  **Recommended approach**: Refactor the inline keyboard handling in `GameShell.tsx` to use the existing `KeyboardHandler` class from `input/keyboard.ts`. This class already has: `firedKeys` Set for dedup (lines 190-200), `handleBlur()` that clears all state (lines 236-242), proper direction priority via `directionOrder` array, and full DAS/ARR with `update(deltaMs)`. It accepts an `onAction` callback and a `target` element. Wire it up in a `useEffect` in GameShell — construct in the effect, call `update(deltaMs)` from the existing `requestAnimationFrame` loop, and call `dispose()` in the cleanup. Remove the inline `handleKeyDown`/`handleKeyUp`/`processDAS` code.
  If refactoring to `KeyboardHandler` is too risky for this PR, the minimal fix is: (a) add a `firedKeys = useRef(new Set<string>())` and check/add in keydown, remove in keyup; (b) add a `window.addEventListener("blur", ...)` in the same useEffect that resets `dasRef.current` and clears `firedKeys`.
  **INPUT_REQUIRED**: Manual verification of: (a) single tap of left/right moves piece exactly one column, (b) hold left/right triggers DAS after delay and ARR repeat, (c) alt-tab while holding a key does not cause stuck movement on return, (d) pressing left while holding right correctly switches direction.
- **tests**: `e2e/input-bugs.spec.ts` — add to the file created by the arrow-key PR:
  - `test("single left-arrow tap moves piece exactly one column")`: start a solo modern marathon game, read the initial piece position by inspecting `[data-testid="game-board"]` or exposed game state, press ArrowLeft once (single keydown + keyup with no hold), wait 100ms, verify piece moved exactly 1 column left. Use `page.keyboard.down("ArrowLeft")` immediately followed by `page.keyboard.up("ArrowLeft")`.
  - `test("holding left-arrow triggers DAS auto-repeat")`: start a solo game, hold ArrowLeft for 500ms (modern DAS=133ms, ARR=10ms so should produce multiple moves), release, verify piece moved more than 1 column.
  - `test("window blur resets held key state")`: start a solo game, press and hold ArrowLeft (don't release), call `page.evaluate(() => window.dispatchEvent(new Event("blur")))`, wait 300ms, verify piece is no longer moving (compare position snapshots 100ms apart after blur).
- **files**: `packages/client/src/ui/GameShell.tsx`, `packages/client/src/input/keyboard.ts` (if integrating), `e2e/input-bugs.spec.ts`
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Fix garbage not appearing on receiving player's game
- **description**: **Root cause**: The server's `game-session.ts` broadcasts two garbage-related messages — `garbageQueued` (lines 703-708, sent whenever a player's pending garbage queue changes, containing the full `pendingGarbage` array) and `garbageReceived` (lines 646-652, sent when garbage is ready to insert into the board). However, `lobby-client.ts` has handlers for `gameStateSnapshot`, `gameStarted`, `gameOver`, etc. but **no handler** for `garbageQueued` or `garbageReceived`. This means the receiving player's client only learns about incoming garbage when the next periodic `gameStateSnapshot` arrives, which is at a much lower frequency and creates visible lag.
  **Fix in `lobby-client.ts`**: Add two new message handlers alongside the existing ones (~line 373 area):
  (1) `garbageQueued` handler: when received and `msg.playerId` matches the local player ID, update the `localPendingGarbage` state with `msg.pendingGarbage`. This is the same field that the `gameStateSnapshot` handler currently sets at line 379.
  (2) `garbageReceived` handler: when received and `msg.playerId` matches the local player ID, this signals garbage is about to be inserted. Depending on how the prediction system works, this may need to trigger a board update or can be handled by the next snapshot. At minimum, log it or update a visual indicator.
  Also check: does the `GarbageMeter.tsx` component correctly re-render when `localPendingGarbage` changes? Trace the prop from `lobby-client.ts` state → GameShell → GarbageMeter. The component at `GameShell.tsx` lines 305-306 passes `localPendingGarbage` as a prop — verify the state update triggers a re-render.
  **INPUT_REQUIRED**: Manual verification in a 2-player game: Player A clears 2+ lines. Within ~200ms, Player B should see their garbage meter (red bar on the left side of their board) grow. The garbage should then insert into Player B's board after the garbage delay timer expires. Verify this works for singles (no garbage), doubles (1 line), triples (2 lines), and tetrises (4 lines).
- **tests**: `e2e/multiplayer-garbage.spec.ts` (new) with 90s timeout:
  - `test("garbage meter updates on receiving player within 2 seconds of opponent clearing lines")`: Use `setupAndStartGame(browser)` to create a 2-player game (reuse the pattern from `multiplayer-game.spec.ts`). Have Player A (host) rapidly hard-drop pieces. Monitor Player B's page for `[data-testid="garbage-meter"]` becoming visible or its content changing (e.g., check that the meter element's `offsetHeight` or inner bar height increases). Use `expect(player2.page.locator('[data-testid="garbage-meter"]')).toBeVisible({ timeout: 5_000 })` and then verify the meter has a nonzero value. The test doesn't need to verify exact garbage amounts — just that the meter responds at all.
  - `test("garbage meter is not visible when no garbage is pending")`: Start a 2-player game, immediately check that Player B's garbage meter is either hidden or shows 0 (before any lines are cleared).
- **files**: `packages/client/src/net/lobby-client.ts`, `e2e/multiplayer-garbage.spec.ts` (new)
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Investigate and fix NES classic mode level progression
- **description**: **Reported issue**: Levels don't appear to work in classic NES mode. The engine is correct — `scoring-nes.ts` has `updateNESLevel()` with proper thresholds, and `gravity.ts` has the full NES frame table. The bug is somewhere in the UI wiring.
  **Investigation checklist** (work through these in order):
  (1) In `StartScreen.tsx`, clicking `[data-testid="preset-classic"]` calls `handlePresetChange("classic")` which returns `classicRuleSet()`. Verify this returns `{ gravityCurve: "nes", scoringSystem: "nes", ... }`.
  (2) Trace how `onStart(ruleSet, modeConfig)` passes the ruleset into `GameShell`. Check that `GameShell` uses `ruleSet.gravityCurve` when constructing the `TetrisEngine`. Look for any place where the gravity curve might be hardcoded to "guideline" or ignored.
  (3) Check that `TetrisEngine` constructor or `init()` wires `gravityCurve` to the correct `getDropInterval()` function. Look for a switch/map on the curve name.
  (4) Verify that `ScoreDisplay` receives the updated `scoringState.level` prop as lines are cleared. The `marathonMode` config includes `"level"` in `displayStats`, so the `StatRow` with label "LEVEL" should render. Check that the scoring state passed to `ScoreDisplay` is the live state (not a stale initial snapshot).
  (5) Check if there's a start-level selector or if NES classic always starts at level 0. Some Tetris games let you pick a starting level — if ours doesn't expose this for classic mode, the user might be stuck at level 0 with very slow gravity (48 frames = ~800ms per drop), which could feel like "no levels" if they don't play long enough to level up (need 10 line clears).
  **Fix**: Apply whatever fix the investigation reveals. The most likely issues are: gravity curve not being passed through, scoring system not being initialized with the NES variant, or a reactivity bug where level updates don't trigger re-renders.
  **INPUT_REQUIRED**: Manual verification: start a classic NES marathon game, verify level shows "0", clear 10 lines (need about 3-4 tetrises or 10 singles), verify level increments to "1", and verify pieces fall noticeably faster. Also check that the score uses NES formulas (e.g., a single at level 0 = 40 points, a tetris at level 0 = 1200 points).
- **tests**:
  - `e2e/single-player.spec.ts` — `test("classic NES marathon shows level 0 at start")`: call `setupSoloGame(page, { preset: "classic", mode: "marathon" })`, then `readScoreDisplay(page)` and assert `level === 0`.
  - `test("classic NES marathon level increments after clearing lines")`: start a classic NES game, hard-drop pieces repeatedly (at least 25 drops to accumulate some line clears — NES mode has no hard drop so use soft drop by holding ArrowDown, or verify if `hardDropEnabled: false` in classicRuleSet means Space is ignored and write the test using soft drop + ArrowDown), then read score display and assert `level >= 1`. Note: classic mode has `hardDropEnabled: false`, so the test MUST use soft drop (hold ArrowDown) rather than Space. This is a critical difference from modern mode tests.
  - Unit test: `packages/shared/src/__tests__/gravity.test.ts` — verify `nesDropInterval(0)` returns ~788ms (48 frames / 60.0988fps × 1000) and `nesDropInterval(1)` returns ~707ms.
- **files**: `packages/client/src/ui/StartScreen.tsx`, `packages/client/src/ui/GameShell.tsx`, `packages/shared/src/engine/engine.ts` (if gravity curve wiring needs fixing), `e2e/single-player.spec.ts` (new)
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Single-player E2E tests — game modes and basic gameplay
- **description**: Add comprehensive Playwright tests for all single-player features. The current E2E suite has zero single-player coverage. Each test should use the `setupSoloGame()` helper to start the appropriate mode, then interact via keyboard and verify UI state via data-testid selectors and `readScoreDisplay()`. Use 60s timeout per test.
  **Test cases to implement** (each as its own `test()` block):
  **Game mode startup tests** (verify correct stats displayed for each mode):
  (1) `"marathon modern shows score, level, and lines"`: `setupSoloGame(page, { preset: "modern", mode: "marathon" })`, `readScoreDisplay(page)`, assert all three of `score`, `level`, `lines` are defined numbers.
  (2) `"sprint mode shows timer and lines remaining"`: `setupSoloGame(page, { preset: "modern", mode: "sprint" })`, verify `[data-testid="stat-timer"]` and `[data-testid="stat-linesRemaining"]` are visible. Assert `remaining` starts at 40.
  (3) `"ultra mode shows timer and score"`: `setupSoloGame(page, { preset: "modern", mode: "ultra" })`, verify `stat-timer` and `stat-score` visible. Timer should start counting down from 3:00.
  (4) `"zen mode shows lines and score, no game over on top-out"`: `setupSoloGame(page, { preset: "modern", mode: "zen" })`, hard-drop 25+ pieces rapidly (to fill the board past row 20), verify no game-over overlay appears (`[data-testid="gameover-overlay"]` should not be visible).
  **Piece interaction tests** (use modern marathon):
  (5) `"hard drop increases score"`: start modern marathon, read initial score (should be 0), press Space (hard drop), wait 200ms, read score again, assert it increased (hard drop awards 2 points per cell dropped).
  (6) `"hold piece swaps current piece"`: start modern marathon, verify `[data-testid="hold-display"]` is visible but `[data-testid="hold-piece"]` is not (no piece held yet). Press "c" (hold key), wait 200ms, verify `[data-testid="hold-piece"]` is now visible.
  (7) `"next queue shows preview pieces"`: start modern marathon, verify `[data-testid="next-queue"]` is visible and contains at least 1 piece preview element.
  **Game state tests**:
  (8) `"pause and unpause"`: start modern marathon, press Escape, verify `[data-testid="game-paused-overlay"]` is visible. Press Escape again, verify overlay disappears and game continues (score display still visible).
  (9) `"game over on top-out shows overlay"`: start modern marathon, hard-drop pieces as fast as possible (25+ times with 100ms delays), verify `[data-testid="gameover-overlay"]` becomes visible within 15s.
  **Ruleset selection tests**:
  (10) `"classic preset disables hold and hard drop"`: start classic marathon (which has `holdEnabled: false`, `hardDropEnabled: false`). Press "c" (hold) — verify `[data-testid="hold-piece"]` does NOT appear (hold is disabled). Press Space — verify it does nothing (no score increase from hard drop). The classic preset also has `ghostEnabled: false` — could verify ghost piece is absent if there's a testid for it.
- **tests**: All test cases listed above in `e2e/single-player.spec.ts` (new file or extend from NES fix PR)
- **files**: `e2e/single-player.spec.ts` (new or extend)
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Reference verification — NES scoring and gravity tables
- **description**: Add unit tests in `packages/shared` that verify our NES implementation against the authoritative data from [Tetris (NES) — TetrisWiki](https://tetris.wiki/Tetris_(NES)) and [Scoring — TetrisWiki](https://tetris.wiki/Scoring). These are table-driven snapshot tests — hardcode the expected reference values and compare. Any accidental change to the engine constants will be caught immediately.
  **Test cases to implement**:
  (1) **Gravity frame table** — Test `nesDropInterval(level)` for every level 0-29 against the reference frame counts converted to ms. The reference (NTSC at 60.0988 fps): L0=48f, L1=43f, L2=38f, L3=33f, L4=28f, L5=23f, L6=18f, L7=13f, L8=8f, L9=6f, L10-L12=5f, L13-L15=4f, L16-L18=3f, L19-L28=2f, L29+=1f. Convert each to ms via `Math.round((frames / 60.0988) * 1000)`. Use `test.each` or a loop over the full table.
  (2) **Scoring values** — Test that NES scoring returns correct point values for each clear type. Reference: single=40×(level+1), double=100×(level+1), triple=300×(level+1), tetris=1200×(level+1). Test at level 0, 1, 5, 9, and 19. Create a NES scoring system instance, feed it a line clear event, and verify the score delta.
  (3) **Level-up thresholds** — Verify `firstLevelUpThreshold(startLevel)` matches the formula: `min(startLevel × 10 + 10, max(100, startLevel × 10 - 50))`. Test for start levels 0 (threshold=10), 1 (threshold=20), 5 (threshold=60), 9 (threshold=100), 10 (threshold=100), 15 (threshold=100), 19 (threshold=140), 25 (threshold=200).
  (4) **Level progression** — Verify that starting at level 0, after exactly 10 lines the level becomes 1, after 20 lines the level becomes 2. Verify that starting at level 9, after 100 lines the level becomes 10.
  (5) **Soft drop scoring** — Verify soft drop awards 1 point per cell in NES mode.
  Import the scoring and gravity functions directly from the shared package. Do NOT use Playwright — these are pure vitest unit tests.
- **tests**: `packages/shared/src/__tests__/reference-nes.test.ts` (new)
- **files**: `packages/shared/src/__tests__/reference-nes.test.ts` (new)
- **depends_on**:

---

### PR: Reference verification — SRS rotation and wall kicks
- **description**: Add unit tests verifying our SRS rotation system against [Super Rotation System — TetrisWiki](https://tetris.wiki/Super_Rotation_System) and [SRS — Hard Drop Wiki](https://harddrop.com/wiki/SRS). The tests should validate both the raw kick table data AND behavioral outcomes.
  **Test cases to implement**:
  (1) **J/L/S/T/Z shared kick offsets** — The 5 kick tests for each of the 8 rotation transitions (0→R, R→0, R→2, 2→R, 2→L, L→2, L→0, 0→L) should match the reference. For 0→R: (0,0), (-1,0), (-1,+1), (0,-2), (-1,-2). For R→0: (0,0), (+1,0), (+1,-1), (0,+2), (+1,+2). Continue for all 8 transitions. Import the kick table data structure from `rotation-srs.ts` and snapshot-test every entry.
  (2) **I-piece kick offsets** — Separate table with different values. For 0→R: (0,0), (-2,0), (+1,0), (-2,-1), (+1,+2). Snapshot all 8 transitions.
  (3) **O-piece no kick** — Verify that O-piece rotation attempts produce no translation (O doesn't kick). Place an O-piece and attempt rotation — it should stay in place if blocked.
  (4) **Behavioral: T-spin double** — Set up a board with a T-spin double cavity (T-shaped hole with overhang). Place a T-piece, rotate it into the cavity. Verify the kick succeeds and the piece lands in the correct position. Use the engine's `tryRotate()` or equivalent.
  (5) **Behavioral: I-piece wall kick** — Place an I-piece vertically against the left wall (column 0). Rotate CW — it should kick right by 2 cells. Verify final position.
  (6) **Behavioral: S/Z piece near right wall** — Place an S-piece at the right wall in rotation state R. Rotate CW to state 2 — verify it kicks correctly.
  (7) **Spawn orientations** — Verify all 7 pieces spawn in state 0 (flat/horizontal) at the correct row and column per the guideline (centered, row 21-22 for most pieces).
  Import engine board/piece/rotation functions directly. These are pure vitest tests, not Playwright.
- **tests**: `packages/shared/src/__tests__/reference-srs.test.ts` (new)
- **files**: `packages/shared/src/__tests__/reference-srs.test.ts` (new)
- **depends_on**:

---

### PR: Reference verification — guideline garbage and scoring
- **description**: Add unit tests verifying our modern/guideline scoring and garbage values against [Garbage — TetrisWiki](https://tetris.wiki/Garbage) and [Scoring — TetrisWiki](https://tetris.wiki/Scoring). Covers garbage lines sent, scoring points, and bonus mechanics.
  **Test cases to implement**:
  (1) **Garbage lines per clear type** — Verify: single=0 lines, double=1 line, triple=2 lines, tetris (quad)=4 lines. Feed line-clear events into the garbage calculation function and assert output.
  (2) **T-spin garbage** — Verify: T-spin mini=0 lines, T-spin single=2 lines, T-spin double=4 lines, T-spin triple=6 lines.
  (3) **Back-to-back bonus** — Perform a tetris, then another tetris. The second should send 4+1=5 garbage lines (B2B bonus). Perform a tetris, then a single (breaks B2B), then a tetris — the last should send 4 (no B2B). Same for T-spin: T-spin double → T-spin double should have +1 B2B on the second.
  (4) **Combo table** — Clear lines on consecutive piece placements. Combo garbage starts at 0 for the first clear and increases: combo 1=0, combo 2=1, combo 3=1, combo 4=2, etc. (verify against the specific combo table our implementation uses — may be Tetris Guideline or TETR.IO variant). Test at least combos 1-5.
  (5) **Guideline scoring points** — Verify: single=100×level, double=300×level, triple=500×level, tetris=800×level. T-spin mini single=200×level, T-spin single=800×level, T-spin double=1200×level, T-spin triple=1600×level. Soft drop=1×cells, hard drop=2×cells. Test at levels 1, 5, and 10.
  (6) **Perfect clear bonus** — If implemented, verify perfect clear (clearing the entire board) awards the correct bonus (800×level for single, etc.).
  Import scoring and garbage functions directly from the shared package. Pure vitest tests.
- **tests**: `packages/shared/src/__tests__/reference-guideline.test.ts` (new)
- **files**: `packages/shared/src/__tests__/reference-guideline.test.ts` (new)
- **depends_on**:

---

### PR: Multiplayer rematch flow E2E tests
- **description**: The rematch flow has no E2E coverage. The results screen (`GameResults.tsx`) has three buttons: "REMATCH" (`[data-testid="rematch-btn"]`), "BACK TO LOBBY" (`[data-testid="back-to-lobby"]`), and "VIEW STATS" (`[data-testid="view-stats"]`). When a player clicks REMATCH, the button text changes to "WAITING..." (disabled), and a rematch status line (`[data-testid="rematch-status"]`) appears showing "{n}/{total} voted for rematch". When all players vote, a new game countdown should start.
  **Test cases to implement** (use 90s timeout, reuse the `setupAndStartGame` + `forceTopOut` pattern from `multiplayer-game.spec.ts`):
  (1) `"clicking rematch shows waiting state"`: Play a game to completion (host hard-drops to top out). On the host's results screen, click `[data-testid="rematch-btn"]`. Assert the button becomes disabled and shows "WAITING...". Assert `[data-testid="rematch-status"]` shows "1/2 voted for rematch".
  (2) `"opponent sees rematch vote count update"`: After host votes for rematch, on the guest's page assert `[data-testid="rematch-status"]` shows "1/2 voted for rematch" (guest hasn't voted yet).
  (3) `"both players accepting rematch starts a new game"`: Both players click rematch. Wait for `[data-testid="game-multiplayer"]` to appear on both pages (new game started). Verify the results screen is no longer visible.
  (4) `"back to lobby returns both players to lobby"`: Play a game to completion. Host clicks `[data-testid="back-to-lobby"]`. Verify host's page shows the lobby menu (e.g., "Create Room" and "Join Room" buttons visible). The guest should also be returned to the lobby (or see a "host left" message). Note: the exact behavior when one player leaves may vary — the test should verify the guest isn't stuck on a dead results screen.
  (5) `"rematch button cannot be clicked twice"`: Click rematch once, verify button is disabled (`[data-testid="rematch-btn"]` has `disabled` attribute), attempt to click again, verify vote count is still 1/2 (not 2/2).
- **tests**: `e2e/multiplayer-rematch.spec.ts` (new)
- **files**: `e2e/multiplayer-rematch.spec.ts` (new)
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Multiplayer reconnection flow E2E tests
- **description**: Currently only the disconnect→forfeit path is tested (in `multiplayer-game.spec.ts`). The reconnection path (where a player reconnects within the 15-second `RECONNECT_WINDOW_MS`) has no coverage. The `DisconnectOverlay` component shows a countdown (`[data-testid="disconnect-overlay"]` with `.disconnect-overlay-countdown` showing seconds remaining). The `ReconnectController` (in `reconnect.ts`) uses exponential backoff starting at 250ms, doubling up to 2s max, within the 15s window. To simulate reconnection in Playwright, navigate the page away and back (or close/reopen the browser context).
  **Test cases to implement** (use 90s timeout):
  (1) `"disconnect overlay appears when opponent disconnects"`: Start a 2-player game. Close guest's browser context (simulating disconnect). On host's page, verify `[data-testid="disconnect-overlay"]` appears within 5s with text containing "disconnected". Verify the countdown shows a number ≤ 15.
  (2) `"player reconnects within window and game resumes"`: Start a 2-player game. On guest's page, call `page.goto("about:blank")` to navigate away (disconnects WebSocket). Wait 3s (well within the 15s window). Navigate guest back to `/` and have them re-enter their name and rejoin the room (or test if the app auto-reconnects — check if there's a reconnect UI flow). Verify that both players see `[data-testid="game-multiplayer"]` (game is active, not results). Verify host's disconnect overlay disappears.
  (3) `"reconnect after window expires results in forfeit"`: This is already covered by the existing test, but add a variant: guest navigates to `about:blank`, wait 18s (past the 15s window), navigate back. Guest should see the game results screen (the game ended while they were gone). Host should show "VICTORY".
  (4) `"disconnect overlay countdown ticks down"`: Start a game, disconnect guest. On host's page, read the countdown number from `.disconnect-overlay-countdown`, wait 2s, read again, verify it decreased by approximately 2.
  **INPUT_REQUIRED**: Manual verification that reconnection restores the full game state — the reconnected player's board, score, and pending garbage should match what the server has. The opponent's view of the reconnected player should also be correct.
- **tests**: `e2e/multiplayer-reconnect.spec.ts` (new)
- **files**: `e2e/multiplayer-reconnect.spec.ts` (new)
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Room settings and handicap UI E2E tests
- **description**: The waiting room (`WaitingRoom.tsx`) displays two settings panels that only the host can modify: `HandicapSettings` and `TargetingSettingsPanel`. These have zero E2E coverage. The handicap panel has: intensity select (`#handicap-intensity` with options "off"/"light"/"standard"/"heavy"), mode select (`#handicap-mode` with "boost"/"symmetric"), targeting bias slider (`#handicap-bias`, range 0-1), delay modifier checkbox (`#handicap-delay`), messiness modifier checkbox (`#handicap-messiness`), and show ratings checkbox (`#handicap-rating-visible`). The targeting panel has: checkboxes for each strategy (random/attackers/kos/manual) and a default strategy select. Non-host players see these controls as disabled.
  **Test cases to implement** (60s timeout):
  (1) `"host can change handicap intensity"`: Create a room with 2 players. On host's page, change `#handicap-intensity` select to "standard". Verify the select value updated. On guest's page, verify the guest's `#handicap-intensity` also shows "standard" (settings are synced via WebSocket). Verify guest's select is disabled (non-host can't edit).
  (2) `"handicap mode and sub-options are disabled when intensity is off"`: In the waiting room, with intensity="off", verify `#handicap-mode`, `#handicap-bias`, `#handicap-delay`, `#handicap-messiness` are all disabled. Change intensity to "light", verify they become enabled.
  (3) `"host can toggle targeting strategies"`: On host's page, uncheck the "Manual" targeting checkbox (leaving random/attackers/kos). Verify the checkbox is unchecked. Verify the default strategy select no longer includes "Manual" as an option. Verify at least one strategy cannot be unchecked (last-one-standing protection — when only one is checked, unchecking it should be a no-op).
  (4) `"non-host sees settings as disabled"`: On guest's page, verify all handicap selects, checkboxes, and targeting checkboxes have the `disabled` attribute.
  (5) `"show ratings toggle affects player list"`: With handicap settings default (`ratingVisible: true`), check if rating badges appear next to player names in the player list. Uncheck `#handicap-rating-visible`, verify rating badges disappear. Note: ratings may only appear if players have played previous games — if no ratings exist, the test should verify the toggle doesn't crash and the badge area is absent.
  (6) `"handicap indicator visible during game when handicap is active"`: Create a room, set intensity to "standard", start the game. Verify `[data-testid="handicap-indicator"]` (or similar testid on `HandicapIndicator.tsx`) is visible during gameplay. Start another game with intensity "off", verify the indicator is absent.
  **INPUT_REQUIRED**: Manual verification that the handicap indicator visuals look correct during gameplay and the targeting selector buttons are styled correctly.
- **tests**: `e2e/room-settings.spec.ts` (new)
- **files**: `e2e/room-settings.spec.ts` (new)
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Three-or-more player game E2E tests
- **description**: All existing multiplayer tests use exactly 2 players. The game is designed for family play with siblings, so 3+ player games are a core use case. The `createPlayerContext` helper already supports creating additional browser contexts. The waiting room shows "Players (n/maxPlayers)" and the Start Game button enables when `players.length >= 2`.
  **Test cases to implement** (use 120s timeout — 3 browser contexts are heavier):
  (1) `"three players can join a room and see each other"`: Player 1 creates a room, Player 2 and Player 3 join with the room code. All three pages should show all three player names in the player list. The player count should show "3/". The host's Start Game button should be enabled.
  (2) `"3-player game: first elimination shows spectator overlay only for eliminated player"`: Start a 3-player game. Player 1 hard-drops rapidly to top out. Player 1 should see `[data-testid="spectator-overlay"]` with text "ELIMINATED" and "You placed 3rd". Players 2 and 3 should NOT see the spectator overlay on their own screens — they should still see the active game (`[data-testid="game-multiplayer"]`). Verify Player 2 and Player 3 can still interact (send a hard drop on each to confirm the game is still active).
  (3) `"3-player game: second elimination ends game and shows correct placements"`: After Player 1 tops out, have Player 2 hard-drop rapidly to also top out. Now all three should see `[data-testid="game-results"]`. Verify placements: Player 3 (last standing) sees "VICTORY" and "1st". Player 2 sees "DEFEATED" and "2nd". Player 1 sees "DEFEATED" and "3rd". On every player's results table (`[data-testid="results-table"]`), there should be 3 `.results-row` elements with all three player names.
  (4) `"3-player game: opponent boards are shown for all opponents"`: During an active 3-player game, each player should see 2 opponent mini-boards. Verify each player's page has 2 opponent board elements visible (check for `[data-testid^="opponent-board"]` or the OpponentBoard component's container).
  (5) `"targeting selector appears in 3-player game"`: Start a 3-player game. Verify `[data-testid="targeting-selector"]` is visible on each player's page. Verify it shows the strategy buttons (at minimum "Random" via `[data-testid="targeting-btn-random"]`). Click a different strategy button and verify it becomes active (gets the active styling).
- **tests**: `e2e/multiplayer-3player.spec.ts` (new)
- **files**: `e2e/multiplayer-3player.spec.ts` (new)
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Stats screen and post-game UI E2E tests
- **description**: The stats screen (`StatsScreen.tsx`) loads data from `/api/stats/{username}` and displays: a rating card (rating value, RD, games played, rank badge), a "Rating Over Time" sparkline chart, and a match history table with columns (Opponent, Result, Rating Change, Date). It has a "Back" button (`.stats-back-btn`). The results screen (`GameResults.tsx`) has stat columns per player (Sent, Recv, Pieces, Lines, Score, Time) and optional rating changes with animated reveal. A handicap summary section appears when handicap modifiers were active.
  **Test cases to implement** (90s timeout):
  (1) `"view stats button opens stats screen"`: Play a 2-player game to completion. On the winner's results screen, click `[data-testid="view-stats"]`. Verify the stats screen appears (look for `.stats-screen` or heading "Stats for {name}"). The stats screen fetches from `/api/stats/{username}` — verify it doesn't show an error (`.stats-empty` with "Error:" text should not be present). If the stats API returns data, verify the rating card is visible.
  (2) `"stats screen back button returns to results"`: From the stats screen, click `.stats-back-btn`. Verify the results screen (`[data-testid="game-results"]`) is visible again.
  (3) `"results table shows plausible stat values for both players"`: After a game where the host hard-dropped many pieces, verify on the results screen: the results table has 2 rows. For each row, the "Pieces" column should be a positive number (at least 1). The "Score" column should be a non-negative number. The "Time" column should match a time format like "0:XX" or "X:XX". Extract values using `page.locator('[data-testid="results-table"] .results-row').nth(0).locator('.cell-stat')` and checking `textContent()` for each of the 6 stat cells.
  (4) `"results table stat values are non-negative numbers"`: For every `.cell-stat` in the results table (excluding the Time column which is a formatted string), parse the text content and verify it's a valid non-negative integer (after removing locale formatting like commas).
  (5) `"match history appears after playing a game"`: Play a game to completion. Open the stats screen. If the match history table (`.stats-table`) is visible, verify it has at least 1 row in `tbody`. Each row should have 4 cells (Opponent, Result, Rating Change, Date). The Result cell should contain either "Win" or "Loss".
  (6) `"rating changes appear on results screen"`: After the game ends, verify that `[data-testid^="rating-"]` elements appear on the results screen (one per player). Each should contain a numeric rating value (`.rating-value`) and a delta (`.rating-delta` with "+" or "-" prefix). Wait up to 5s for the rating elements since they arrive async.
- **tests**: `e2e/stats-screen.spec.ts` (new)
- **files**: `e2e/stats-screen.spec.ts` (new)
- **depends_on**: Expand E2E test helpers and add data-testid coverage

---

### PR: Final gate — all Playwright testing plan PRs merged
- **description**: Gate PR that depends on every other PR in this plan. No implementation needed — this PR exists solely so that `pm autostart` can target a single PR that transitively requires all work to be complete. The PR body should list all merged PRs with their titles and confirm: (1) all four known bugs are fixed (arrow key scroll, movement double-fire, garbage display, NES levels), (2) all E2E test suites pass (`npx playwright test` exits 0), (3) all reference verification unit tests pass (`npm test` exits 0 in `packages/shared`), and (4) no regressions in the existing test suite. The PR itself can be an empty commit or a small update to a doc/changelog noting the testing improvements.
- **tests**: Run the full test suite: `npm test` (vitest across all packages) and `npm run test:e2e` (Playwright). All must pass.
- **files**: None (or minimal — e.g., a CHANGELOG entry)
- **depends_on**: Expand E2E test helpers and add data-testid coverage, Fix arrow key page scroll while held, Fix left/right movement double-fire and stuck keys, Fix garbage not appearing on receiving player's game, Investigate and fix NES classic mode level progression, Single-player E2E tests — game modes and basic gameplay, Reference verification — NES scoring and gravity tables, Reference verification — SRS rotation and wall kicks, Reference verification — guideline garbage and scoring, Multiplayer rematch flow E2E tests, Multiplayer reconnection flow E2E tests, Room settings and handicap UI E2E tests, Three-or-more player game E2E tests, Stats screen and post-game UI E2E tests
