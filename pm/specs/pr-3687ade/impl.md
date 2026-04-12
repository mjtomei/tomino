# Implementation Spec: PR-3687ade — E2E Test Helpers & data-testid Coverage

## Requirements

### Part A — New Playwright Helpers

#### A1. `holdKey(page, key, durationMs)` in `e2e/helpers/input.ts`
- Add to existing file alongside `sendKeyboardInput` (line 26).
- Signature: `async function holdKey(page: Page, key: string, durationMs: number): Promise<void>`
- Implementation: `page.keyboard.down(key)` → `page.waitForTimeout(durationMs)` → `page.keyboard.up(key)`
- Export from module.

#### A2. `readScoreDisplay(page)` in `e2e/helpers/game-state.ts`
- Add to existing file alongside `waitForGameState` (line 13).
- Reads `[data-testid="score-display"]` element, iterates `.stat-row` children.
- For each `.stat-row`, reads `.stat-label` text and `.stat-value` text content.
- Maps labels to fields: SCORE→`score` (number), LEVEL→`level` (number), LINES→`lines` (number), TIME→`time` (string), REMAINING→`remaining` (number).
- Return type: `{ score?: number, level?: number, lines?: number, time?: string, remaining?: number }`
- Numeric parsing: use `parseInt` or `Number` after stripping locale formatting (commas) for score. `time` stays as string since it's formatted as `mm:ss.ms`.

#### A3. `waitForElimination(page, timeoutMs?)` in `e2e/helpers/game-state.ts`
- Add to same file as A2.
- Waits for `[data-testid="spectator-overlay"]` to be visible.
- The `SpectatorOverlay` component (`packages/client/src/ui/SpectatorOverlay.tsx:9`) already has this testid.
- Default timeout should follow the pattern in `waitForGameState` (10_000ms).

#### A4. `setupSoloGame(page, options)` in `e2e/helpers/solo.ts` (new file)
- Options type: `{ preset?: "classic" | "modern" | "custom", mode?: "marathon" | "sprint" | "ultra" | "zen" }`
- Defaults: `preset = "modern"`, `mode = "marathon"`
- **Full app flow** (see Implicit Requirements — IR1):
  1. Navigate to `/`
  2. Handle player name input: fill `#player-name` with a default name (e.g., "TestPlayer"), click "Continue" button
  3. Wait for lobby menu to appear (wait for "Solo Play" button)
  4. Click "Solo Play" button
  5. Wait for `[data-testid="start-screen"]` to appear
  6. Click `[data-testid="preset-{preset}"]` to select ruleset
  7. Click `[data-testid="mode-{mode}"]` to select game mode
  8. Click `[data-testid="start-play"]`
  9. Wait for either `[data-testid="game-board"]` or `[data-testid="board-canvas"]` to be visible
- The StartScreen (`packages/client/src/ui/StartScreen.tsx`) already has all required testids: `preset-classic`, `preset-modern`, `preset-custom`, `mode-marathon`, `mode-sprint`, `mode-ultra`, `mode-zen`, `start-play`.

#### A5. Re-export from `e2e/helpers/index.ts`
- Add exports for: `holdKey` from `./input`, `readScoreDisplay` and `waitForElimination` from `./game-state`, `setupSoloGame` from `./solo`.

### Part B — data-testid Attributes

#### B1. `ScoreDisplay.tsx` — Add `data-testid="stat-{stat}"` to StatRow
- File: `packages/client/src/ui/ScoreDisplay.tsx`
- The `StatRow` component (line 10) renders the outer `<div className="stat-row">`.
- Add a `testId` prop (or `data-testid` directly via the stat key) to each `StatRow` usage.
- The stat keys in the switch at lines 25-49 are: `"score"`, `"level"`, `"lines"`, `"timer"`, `"linesRemaining"`.
- Map to testid values: `stat-score`, `stat-level`, `stat-lines`, `stat-timer`, `stat-linesRemaining`.
- Approach: Add `testId` prop to `StatRow`, spread as `data-testid` on the outer div. Pass from each switch case.

#### B2. `GameShell.tsx` — Add `data-testid="game-board"` to game board container
- File: `packages/client/src/ui/GameShell.tsx`
- The game board container is `<div className="game-board-container">` at:
  - SoloGameShell: line 574
  - MultiplayerGameShell: line 304
- Add `data-testid="game-board"` to both instances.
- Overlays (`pause-overlay`, `gameover-overlay`) already exist in `Overlay.tsx` — no changes needed.

#### B3. No changes needed to: `GarbageMeter.tsx`, `NextQueue.tsx`, `HoldDisplay.tsx`, `Overlay.tsx`
- These already have the required testids.

### Part C — Smoke E2E Test

#### C1. `e2e/helpers.spec.ts` (new file)
- Import `test, expect` from `@playwright/test`.
- Import `setupSoloGame`, `readScoreDisplay` from helpers.
- Single test: call `setupSoloGame(page, { preset: "modern", mode: "marathon" })`, then `readScoreDisplay(page)`, assert `score` is defined and `level` is defined.
- Playwright config (`playwright.config.ts`) puts test dir at `./e2e`, so file will be auto-discovered.

## Implicit Requirements

### IR1. `setupSoloGame` must handle the full app navigation flow
The app flow from `/` is: PlayerNameInput → Lobby → (click Solo Play) → StartScreen → Game.
The task says "navigate to `/`" but the StartScreen is only reached after name entry and lobby navigation. The helper must handle these intermediate steps or it won't work standalone.
**Resolution**: `setupSoloGame` handles the full flow: name input → lobby → Solo Play → preset/mode selection → start. This makes it self-contained for downstream tests.

### IR2. `readScoreDisplay` must handle locale-formatted numbers
`ScoreDisplay.tsx` line 27 uses `scoring.score.toLocaleString()`, which adds commas (e.g., "1,000"). The parser must strip these before converting to number.

### IR3. Default preset/mode in `setupSoloGame` must match StartScreen defaults
StartScreen defaults: `preset = "modern"`, `mode = "marathon"` (lines 34-35). The helper defaults match, so clicking the already-active preset/mode button is a no-op (it stays selected). This is fine — the button click is idempotent.

### IR4. `stat-{stat}` testid naming must use the switch case key
The switch cases use keys: `score`, `level`, `lines`, `timer`, `linesRemaining`. The testids should be `stat-score`, `stat-level`, `stat-lines`, `stat-timer`, `stat-linesRemaining`. The task says "e.g., stat-score, stat-level" but doesn't explicitly name all five — inferred from the pattern.

## Ambiguities

### AMB1. What `stat-{stat}` means for `timer` and `linesRemaining` — **[RESOLVED]**
The task says `data-testid="stat-{stat}"` to each StatRow. The switch keys are `timer` and `linesRemaining`, so testids become `stat-timer` and `stat-linesRemaining`. However, `readScoreDisplay` maps by label text (SCORE/LEVEL/LINES/TIME/REMAINING), not by testid. These testids are for downstream use; the helper reads by class names.

### AMB2. `readScoreDisplay` matching for TIME label — **[RESOLVED]**
The TIME label appears for both `timer` stat (Sprint/Ultra mode) and `linesRemaining` is labeled REMAINING. The helper returns `time` as string for TIME, `remaining` as number for REMAINING. No ambiguity in label matching.

### AMB3. `setupSoloGame` — should it accept a `playerName` option? — **[RESOLVED]**
The task signature doesn't include a player name parameter. Use a hardcoded default name (e.g., "TestPlayer"). Downstream tests that need custom names can use `createPlayerContext` separately.

### AMB4. `game-board` testid — which element? — **[RESOLVED]**
Task says "the main game board container div (the one wrapping BoardCanvas)". This is `div.game-board-container` in GameShell.tsx. The canvas itself already has `data-testid="board-canvas"`. Adding `game-board` to the container div is additive.

## Edge Cases

### EC1. `readScoreDisplay` when some stats are not displayed
Marathon mode shows: SCORE, LEVEL, LINES. Sprint shows: SCORE, LEVEL, LINES, TIME, REMAINING. Ultra shows: SCORE, LEVEL, TIME. The return type uses optional fields, so missing stats are simply `undefined`. The helper must not throw if a field is absent.

### EC2. `holdKey` with very short durations
If `durationMs` is 0 or very small, `page.waitForTimeout(0)` is valid but may not produce meaningful key-hold behavior. Not a concern for the helper itself — callers control timing.

### EC3. `waitForElimination` in solo mode
The spectator overlay only appears in multiplayer. Calling `waitForElimination` in solo mode will simply time out. This is expected behavior — the helper is designed for multiplayer tests.

### EC4. `setupSoloGame` when server is not running
The Lobby component requires a WebSocket connection for multiplayer buttons, but "Solo Play" doesn't need `connected` state — the button is always enabled (Lobby.tsx line 48, no `disabled` prop). So `setupSoloGame` works even if the server is down, as long as the client dev server serves the page.

### EC5. Multiple `data-testid="game-board"` elements
Both `SoloGameShell` and `MultiplayerGameShell` render `game-board-container`. Only one renders at a time (GameShell delegates to one or the other based on `gameClient` prop), so there's no conflict.
