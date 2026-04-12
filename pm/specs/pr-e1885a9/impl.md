# Implementation Spec: Single-player E2E Tests

## Requirements

### Game Mode Startup Tests

**(1) Marathon modern shows score, level, and lines**
- Call `setupSoloGame(page, { preset: "modern", mode: "marathon" })` from `e2e/helpers/solo.ts`
- Call `readScoreDisplay(page)` from `e2e/helpers/game-state.ts` — parses `.stat-row` elements inside `[data-testid="score-display"]`
- Assert `score`, `level`, `lines` are all defined and numeric
- Source: `marathonMode` in `packages/shared/src/engine/rulesets.ts:66-73` — `displayStats: ["score", "level", "lines"]`
- UI: `packages/client/src/ui/ScoreDisplay.tsx` renders `stat-score`, `stat-level`, `stat-lines` for these stats

**(2) Sprint mode shows timer and lines remaining**
- `setupSoloGame(page, { preset: "modern", mode: "sprint" })`
- Verify `[data-testid="stat-timer"]` and `[data-testid="stat-linesRemaining"]` are visible
- Assert `remaining` from `readScoreDisplay()` starts at 40
- Source: `sprintMode` in `rulesets.ts:76-83` — `goalValue: 40`, `displayStats: ["timer", "linesRemaining"]`
- UI: `ScoreDisplay.tsx:39-46` computes `Math.max(0, (goalValue ?? 0) - scoring.lines)` = 40 initially

**(3) Ultra mode shows timer and score**
- `setupSoloGame(page, { preset: "modern", mode: "ultra" })`
- Verify `[data-testid="stat-timer"]` and `[data-testid="stat-score"]` are visible
- Timer should start at 3:00 (countdown: `formatTime(180000 - elapsedMs)`)
- Source: `ultraMode` in `rulesets.ts:86-93` — `goal: "time", goalValue: 180_000`, `displayStats: ["timer", "score"]`
- UI: `ScoreDisplay.tsx:33-35` renders countdown when `modeConfig.goal === "time"`

**(4) Zen mode — no game over on top-out**
- `setupSoloGame(page, { preset: "modern", mode: "zen" })`
- Hard-drop 25+ pieces rapidly (filling past row 20)
- Verify `[data-testid="gameover-overlay"]` does NOT become visible
- Source: `zenMode` in `rulesets.ts:96-103` — `topOutEndsGame: false`, `gravity: false`
- Engine: `engine.ts:627-636` — when topOutEndsGame is false, game continues with `currentPiece = null`
- **Important**: Zen mode has `gravity: false`, meaning pieces won't fall on their own. The test must use hard drops (which still works with modern preset since `hardDropEnabled: true`) to stack pieces manually.

### Piece Interaction Tests

**(5) Hard drop increases score**
- Start modern marathon, read initial score (0), press Space, wait 200ms, read score again
- Assert score increased (hard drop awards 2 points per cell dropped via guideline scoring)
- Engine: `engine.ts:272-288` — `hardDrop()` calls `this.scoringSystem.onHardDrop(state, cellsDropped)`
- Key: `Space` maps to `hardDrop` in `GameShell.tsx:34`

**(6) Hold piece swaps current piece**
- Start modern marathon
- Verify `[data-testid="hold-display"]` is visible (modern preset has `holdEnabled: true`)
- Verify `[data-testid="hold-piece"]` is NOT visible (no piece held yet — `HoldDisplay.tsx:19` only renders PiecePreview when `hold != null`)
- Press "c" (hold key, `KeyC` in `GameShell.tsx:31`), wait 200ms
- Verify `[data-testid="hold-piece"]` IS now visible
- Engine: `engine.ts:301-320` — `hold()` swaps current piece into hold slot

**(7) Next queue shows preview pieces**
- Start modern marathon
- Verify `[data-testid="next-queue"]` is visible (`NextQueue.tsx:15`)
- Verify at least 1 `[data-testid^="mini-piece-"]` element exists inside it
- Modern preset has `previewCount: 5`, so there should be 5 previews

### Game State Tests

**(8) Pause and unpause**
- Start modern marathon, press Escape
- Verify `[data-testid="pause-overlay"]` is visible (`Overlay.tsx:29`)
- Press Escape again
- Verify pause overlay disappears
- Verify score display is still visible (game continues)
- Key: `Escape` maps to `"pause"` in `GameShell.tsx:35`
- Handler: `GameShell.tsx:498-501` — toggles between `engine.pause()` and `engine.resume()`

**(9) Game over on top-out shows overlay**
- Start modern marathon
- Hard-drop pieces rapidly (25+ with 100ms delays) to fill board
- Verify `[data-testid="gameover-overlay"]` becomes visible within 15s
- Engine: `engine.ts` — when `topOutEndsGame: true` and spawn fails, status becomes `"gameOver"`
- UI: `Overlay.tsx:106-108` renders `GameOverOverlay` when `state.status === "gameOver"`

### Ruleset Selection Tests

**(10) Classic preset disables hold and hard drop**
- `setupSoloGame(page, { preset: "classic", mode: "marathon" })`
- `classicRuleSet()` in `rulesets.ts:8-25`: `holdEnabled: false`, `hardDropEnabled: false`, `ghostEnabled: false`
- Verify `[data-testid="hold-display"]` does NOT exist (HoldDisplay returns null when `holdEnabled: false` — `HoldDisplay.tsx:11-13`)
- Press "c" — verify `[data-testid="hold-piece"]` still doesn't appear (hold is disabled at engine level too: `engine.ts:303`)
- Press Space — read score before and after, assert no change (hard drop disabled: `engine.ts:274`)

## Implicit Requirements

1. **Dev server must be running**: Playwright config (`playwright.config.ts:23-36`) starts both client (port 5173) and server (port 3001) via `webServer`.

2. **60s test timeout**: Task specifies 60s per test. Use `test.setTimeout(60_000)` at the describe level.

3. **`readScoreDisplay()` requires `.stat-row` / `.stat-label` / `.stat-value` DOM structure**: The helper parses by label text (`SCORE`, `LEVEL`, `LINES`, `TIME`, `REMAINING`). This structure must exist in ScoreDisplay.tsx — verified at lines 10-17.

4. **Zen mode gravity=false means pieces don't auto-fall**: Hard drops still work (modern preset has `hardDropEnabled: true`), but without hard drop or soft drop the piece stays at spawn position. The test must actively drop pieces.

5. **`setupSoloGame` navigates from root**: Each test gets a fresh page context via Playwright. The helper handles name input, lobby navigation, preset/mode selection, and game start.

6. **Keyboard events use `e.code` not `e.key`**: The KEY_MAP in GameShell uses `KeyC`, `Space`, `Escape`, etc. Playwright's `page.keyboard.press("c")` sends the correct code. The helper `sendKeyboardInput` already maps actions to keys correctly.

7. **Classic NES mode uses gravity**: Marathon with classic will have pieces falling. The initial piece spawns and falls on NES gravity curve. But `lockDelay: 0` means instant lock on landing. So pieces will fall and lock very quickly.

## Ambiguities

1. **Ultra timer initial display text**: The task says "Timer should start counting down from 3:00". The `formatTime(180000 - 0)` should yield `"3:00"`. **Resolution**: Read the `stat-timer` text content and verify it contains "3:00" or that the time value from `readScoreDisplay()` equals `"3:00"`. Since `readScoreDisplay()` returns `time` as a string, assert `stats.time === "3:00"`.

2. **Zen mode "hard-drop 25+ pieces"**: Zen has `gravity: false`. Without gravity, pieces spawn at the top and don't fall. Hard drop still works (hardDropEnabled: true for modern). Dropping 25+ pieces in center columns (~10 wide board, 20 rows tall, pieces are ~2 rows each → 10 pieces fill a column). With 7 piece types and random bag, pieces spread across ~6 columns. 25 drops should top out. **Resolution**: Use 30 hard drops with 150ms delays to ensure the board fills, similar to `forceTopOut` pattern in multiplayer tests.

3. **Classic marathon hard drop test**: Task says "Press Space — verify it does nothing (no score increase from hard drop)". With classic preset, `hardDropEnabled: false`, so `engine.hardDrop()` returns early. But in classic mode, pieces fall with NES gravity and lock instantly (`lockDelay: 0`). The piece will eventually lock via gravity, potentially awarding soft-drop points if ArrowDown was held, but Space should produce no hard-drop score. **Resolution**: Read score immediately before and after pressing Space (within a short window), assert score didn't change from the Space press. Need a short wait (200ms) but score should not increase since hard drop is no-op.

4. **Ghost piece verification for classic**: Task mentions "could verify ghost piece is absent if there's a testid for it". Ghost piece is rendered on canvas, not as a DOM element — no data-testid. **Resolution**: Skip ghost piece verification; cannot be tested via testid selectors.

5. **Hold key in classic mode — `hold-display` vs `hold-piece`**: Task says press "c" and verify `hold-piece` doesn't appear. But `HoldDisplay` returns `null` entirely when `holdEnabled: false`, so `hold-display` itself won't be in the DOM. **Resolution**: Assert `hold-display` is not visible (entire component absent), then also assert `hold-piece` is not visible as a secondary check.

## Edge Cases

1. **Race condition on score read after hard drop**: After pressing Space, the engine processes the hard drop synchronously, but React re-render is async. The 200ms wait should be sufficient for React to flush state, but if flaky, may need `waitForFunction` or polling.

2. **Zen mode piece spawn failure**: When the board fills and `topOutEndsGame: false`, `currentPiece` becomes `null`. Subsequent hard drops become no-ops (engine checks `!this.currentPiece`). The test just needs to verify no game-over overlay appears — it doesn't need all 25+ drops to succeed.

3. **Classic mode score volatility**: In classic marathon, NES gravity causes pieces to fall and lock automatically, which may award placement points. The score check for "Space does nothing" must be done quickly — read score, press Space, read score again within a tight window, and verify no *hard-drop-specific* increase occurred. Since `lockDelay: 0`, a piece may have already locked by the time we check. **Mitigation**: Read score right before Space, press Space, wait 200ms, read score. Any score change in that window would be from gravity-driven placement (soft drop points from NES scoring), not from hard drop. We should verify score didn't jump by the hard-drop-specific amount (2 * cells). Simpler approach: just verify score before and after are equal within the 200ms window, since NES gravity at level 0 is slow (48 frames per cell ≈ 800ms per row at 60fps).

4. **Pause during game-over**: If a piece locks and triggers game-over between pressing Escape twice, the test could fail. Marathon at level 0 has very slow gravity, so this is unlikely within the test window.

5. **Sprint mode "remaining" via readScoreDisplay**: `readScoreDisplay()` looks for label "REMAINING" (case-insensitive) and returns `remaining` field. ScoreDisplay renders label "REMAINING" at line 43. This matches.
