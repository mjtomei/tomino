# pr-20fd8ff — Integration: playable single-player Tetris

## Context

The integration work is largely already done in prior PRs. `packages/client/src/ui/GameShell.tsx` already contains the full integration: it constructs `TetrisEngine` from a `RuleSet` + `GameModeConfig`, wires a `requestAnimationFrame` game loop, keyboard input with DAS/ARR, `SoundManager` audio, and renders `BoardCanvas`, `ScoreDisplay`, `NextQueue`, `HoldDisplay`, and `Overlay`. `packages/client/src/ui/StartScreen.tsx` already lets users pick preset (Classic/Modern/Custom) + mode (Marathon/Sprint/Ultra/Zen). `App.tsx` routes to `GameShell` via the lobby's `showSolo` flag and in the `playing` view. `main.tsx` mounts `<App />`. All 913 unit tests currently pass.

The PR task file list mentions a `src/game/GameController.ts` module, but no such file exists — integration logic lives in `GameShell.tsx`. Extracting is out of scope (high churn risk, no functional gain, existing tests cover behavior).

## Requirements (grounded)

1. **Engine wired to rule set + mode** — `GameShell.startGame(rs, mc)` at `packages/client/src/ui/GameShell.tsx:119` constructs `new TetrisEngine({ ruleSet, modeConfig, seed })`. ✅ Already present.
2. **Input handler connected** — `handleKeyDown` at `GameShell.tsx:243` maps `KEY_MAP` codes to engine actions, with DAS/ARR via `processDAS` using `ruleSet.das`/`arr`. ✅
3. **Audio connected** — `SoundManager` created in a `useEffect`, `detectSoundEvents` diffs pre/post state for lock, line clears, level up, hold, game over. Immediate move/rotate/hardDrop sounds fire on keydown. ✅
4. **Renderer connected** — `<BoardCanvas state={gameState} showSidePanels={false} />` at `GameShell.tsx:332`. ✅
5. **UI shell** — `HoldDisplay`, `ScoreDisplay`, `NextQueue`, `Overlay` wired with current `gameState`, `ruleSet`, `modeConfig`. ✅
6. **Game loop via RAF** — `useEffect` at `GameShell.tsx:154` drives `engine.tick(delta)` via `requestAnimationFrame`, cancels on cleanup / game over. ✅
7. **Start screen: preset + mode selection** — `StartScreen.tsx` has `preset-classic|modern|custom`, `mode-marathon|sprint|ultra|zen`, `start-play` button; calls `onStart(ruleSet, modeConfig)`. ✅
8. **Transitions** — start→play handled by `startGame`; pause/resume via `Escape`/`KeyP` calling `engine.pause/resume`; gameOver overlay with "PLAY AGAIN" resets via `handlePlayAgain`. ✅
9. **Integration test** — engine + input + renderer initialize without errors for each preset; smoke test switching presets and modes. **MISSING**: StartScreen has unit tests, but there is no test that actually mounts `GameShell`, selects each preset, clicks start, and asserts the engine loop + renderer initialize without throwing. Need to add.
10. **E2E smoke** — `e2e/smoke.spec.ts` exists and verifies app loads with title and no console errors. It does not exercise solo play flow. Leaving as-is; extending it is outside the task's explicit scope (pr-9fa62c0 owns e2e smoke tests).

## Implicit Requirements

- `packages/shared/dist/` must be built before tests/dev run (vitest/vite resolve `@tetris/shared` from its `exports.default` which points to `./dist/index.js`). Already verified by running `npm run build -w packages/shared`.
- `seed` prop on `GameShell` is optional; when omitted, `startGame` generates `Math.floor(Math.random() * 2**32)`. Multi-player path passes `session.seed`; solo path from `showSolo` uses random.
- `holdEnabled: false` (Classic) must suppress hold UI; `HoldDisplay` already checks `ruleSet.holdEnabled`.
- `previewCount` must respect rule set; `NextQueue` already handles `previewCount=0` and classic's `previewCount=1`.

## Ambiguities (resolved)

- **Q: Should I create `src/game/GameController.ts` as the task description lists?**
  A: No. Integration logic is already in `GameShell.tsx` from the prior UI-shell PR and is fully tested. Extracting would be pure refactor with regression risk and no functional gain. The task's file list is a rough guide, not a contract.
- **Q: What integration test should I add?**
  A: A vitest test that renders `GameShell`, selects each preset + mode, clicks start, and asserts (a) `start-screen` disappears, (b) `game-shell`/canvas appears, (c) no console errors thrown. Also a smoke test that rapidly switches between presets and modes on the start screen without calling start.
- **Q: Should I add a solo-play E2E test?**
  A: Out of scope — pr-9fa62c0 owns E2E. I will run existing `npm run test:e2e` to verify no regression.

## Edge Cases

- React StrictMode double-mounts effects in dev; the game-loop `useEffect` cleanup cancels the prior RAF properly. The sound manager effect disposes correctly.
- Switching from `preset-classic` (holdEnabled=false, previewCount=1) to `preset-modern` should live-update the side panels. `StartScreen` updates local state; at `startGame` time the fresh ruleSet is read — correct.
- `handlePlayAgain` clears engineRef and state, returning to StartScreen. The cancelAnimationFrame call prevents stray ticks.
- Custom preset: the `StartScreen` clones `customRules` as-is and stamps `name: "Custom"`. If user mixes SRS + NES gravity + no hold, engine accepts all fields.
- During `paused` status, `processDAS` is gated by `engine.getState().status === "playing"` so held-key repeats don't leak through pause.

## Plan of work

1. Build `@tetris/shared` (done).
2. Add an integration test file that renders `GameShell` per-preset + per-mode, verifies no throw and the game board is rendered. Include a rapid preset/mode switching smoke test.
3. Run `npm test` → all pass.
4. Run `npm run test:e2e` to verify smoke test still passes.
5. Commit + push.
