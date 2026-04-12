# Implementation Spec: React UI Shell — Score, Next Queue, Hold, Mode Display

## 1. Requirements

### R1: GameShell component (`src/ui/GameShell.tsx`)
Main wrapper that orchestrates the game UI. Instantiates `TetrisEngine` (from `@tetris/shared`), runs the game loop via `requestAnimationFrame`, handles keyboard input (DAS/ARR), and renders `BoardCanvas` plus surrounding chrome (score display, overlays). Manages game lifecycle: idle → playing → paused → gameOver.

- **Engine integration**: `new TetrisEngine({ ruleSet, modeConfig, seed, startLevel })` — see `packages/shared/src/engine/engine.ts:89`
- **Game loop**: Call `engine.tick(deltaMs)` each frame, pass resulting `GameState` to `BoardCanvas` and stat displays
- **Input handling**: Map keyboard events to engine methods (`moveLeft`, `moveRight`, `rotateCW`, `rotateCCW`, `softDrop`, `hardDrop`, `hold`). Implement DAS/ARR from `ruleSet.das` / `ruleSet.arr`.
- **Sound integration**: Instantiate `SoundManager` (`packages/client/src/audio/sounds.ts`), play events on game actions (move, rotate, lock, hardDrop, lineClear, hold, levelUp, gameOver).

### R2: ScoreDisplay component (`src/ui/ScoreDisplay.tsx`)
Renders mode-specific stats driven by `GameModeConfig.displayStats` (`packages/shared/src/engine/types.ts:80`).

- `"score"` → `scoring.score`
- `"level"` → `scoring.level`
- `"lines"` → `scoring.lines`
- `"timer"` → formatted `elapsedMs` (Sprint) or countdown from `modeConfig.goalValue - elapsedMs` (Ultra)
- `"linesRemaining"` → `modeConfig.goalValue - scoring.lines` (Sprint, clamped to 0)

### R3: NextQueue component (`src/ui/NextQueue.tsx`)
Renders the next piece queue. The queue length respects `ruleSet.previewCount` — 1 for Classic, 5 for Modern. The engine already returns `queue` capped to `previewCount` via `randomizer.peek(ruleSet.previewCount)` (`engine.ts:329`).

- Render mini piece previews using piece shapes from `SRSRotation.getShape(type, 0)` (or NRS equivalent based on rule set)
- First piece in queue rendered larger than subsequent pieces (matching `BoardCanvas` convention)

### R4: HoldDisplay component (`src/ui/HoldDisplay.tsx`)
Renders the held piece. Hidden entirely when `ruleSet.holdEnabled === false`. When hold has been used this drop (`holdUsed === true`), render the piece dimmed.

### R5: Overlay component (`src/ui/Overlay.tsx`)
Semi-transparent overlay that covers the game area for state transitions:

- **Pause overlay**: Shown when `status === "paused"`. Text: "PAUSED". Resume on Escape/P.
- **Game Over overlay**: Shown when `status === "gameOver"`. Shows final stats (score, lines, level, time). Shows `endReason` context. "Play Again" button returns to start screen.

### R6: StartScreen component (`src/ui/StartScreen.tsx`)
Shown when the game is in `idle` state (before first start). Contains:

- **Rule set presets**: "Classic", "Modern", "Custom" buttons. Classic calls `classicRuleSet()`, Modern calls `modernRuleSet()` (`packages/shared/src/engine/rulesets.ts`).
- **Game mode buttons**: "Marathon", "Sprint", "Ultra", "Zen" — maps to `gameModes[mode]` (`rulesets.ts:106`).
- **"Custom" expands** `CustomRuleSetPanel` to tweak individual fields.
- **Start button**: Creates engine with selected ruleSet + modeConfig and begins play.

### R7: CustomRuleSetPanel component (`src/ui/CustomRuleSetPanel.tsx`)
Expandable panel for tweaking individual `RuleSet` fields. Uses `customRuleSet(base, overrides)` (`rulesets.ts:54`). Fields to expose:

- `rotationSystem`: dropdown ("srs" | "nrs")
- `lockDelay`: number input (ms)
- `lockResets`: number input
- `holdEnabled`: checkbox
- `hardDropEnabled`: checkbox
- `ghostEnabled`: checkbox
- `randomizer`: dropdown ("7bag" | "pure-random")
- `scoringSystem`: dropdown ("guideline" | "nes")
- `gravityCurve`: dropdown ("guideline" | "nes")
- `das`: number input (ms)
- `arr`: number input (ms)
- `sdf`: number input (or Infinity toggle)
- `previewCount`: number input (0–6)

### R8: GameShell.css (`src/ui/GameShell.css`)
Layout CSS. tetr.io-inspired dark theme. Center the board with score/stats panels on sides. Use existing color constants from `colors.ts` where applicable. Background: `#1a1a2e` (matching existing App styles).

### R9: App.tsx integration
The `"playing"` case in `App.tsx` (line 84) currently shows a placeholder. Replace with `<GameShell>` component. Pass the game session data (seed, etc.) when available.

For now, also add a "Solo Play" option from the menu that goes directly to the start screen without requiring a network connection. This enables single-player mode independently of the lobby/multiplayer flow.

## 2. Implicit Requirements

### IR1: DAS/ARR input handling
The engine exposes `moveLeft()`/`moveRight()` as instant actions. The UI must implement DAS (delayed auto shift) and ARR (auto repeat rate) timing from `ruleSet.das` and `ruleSet.arr`. On key down: fire once immediately, wait `das` ms, then repeat every `arr` ms. On key up: cancel repeat. `arr === 0` means instant — move to wall on each DAS trigger.

### IR2: Soft drop factor
`ruleSet.sdf` controls soft drop speed. When soft drop key is held, gravity should be multiplied by `sdf`. `sdf === Infinity` means instant (move to landing row without locking, unlike hard drop).

### IR3: Rotation system awareness for piece display
NextQueue and HoldDisplay need to use the correct rotation system for rendering piece shapes. Classic uses NRS (different shapes for some pieces), Modern uses SRS. Use `ruleSet.rotationSystem` to pick `SRSRotation` or `NRSRotation`.

### IR4: Timer display format
Sprint timer counts up from 0. Ultra timer counts down from `goalValue` (180000ms = 3:00). Format as `M:SS.mmm` or `M:SS.ss`.

### IR5: Component unmount cleanup
Game loop (rAF), keyboard listeners, and SoundManager must be properly cleaned up on unmount to prevent memory leaks.

### IR6: Canvas already renders hold and next queue
`BoardCanvas` already renders hold piece (left panel) and next queue (right panel) within the canvas. The React `NextQueue` and `HoldDisplay` components should be the HTML/DOM versions that sit outside the canvas. **Decision**: Since the canvas already handles hold/next rendering, the separate React components (`NextQueue.tsx`, `HoldDisplay.tsx`) will be lightweight — they exist for the stat display area, not redundant rendering. However, looking at the task description more carefully, it seems the intent is for these to be the primary display. **Resolution**: Keep the canvas rendering as-is (it's already merged). The React NextQueue/HoldDisplay components provide an alternative rendering path for when we want DOM-based UI. For this PR, use the canvas for hold/next (already done) and focus the React components on the surrounding chrome (score, stats, overlays, start screen). The NextQueue and HoldDisplay React components will still be created but as simple display components that could replace the canvas panels later.

## 3. Ambiguities

### A1: Solo play entry point — **[RESOLVED]**
The task says to build overlays including a "start screen with rule set + mode selector" but App.tsx currently only has multiplayer flow (lobby → waiting room → playing). **Resolution**: Add a "Solo Play" button to the Lobby menu that transitions to a new view showing the StartScreen. This keeps the multiplayer flow intact while enabling single-player.

### A2: Sound event detection — **[RESOLVED]**
The engine doesn't emit events — it returns state snapshots. To play sounds, the UI must diff successive states. **Resolution**: Compare previous and current `GameState` each frame to detect: line clears (lines increased), level ups (level increased), piece lock (currentPiece changed from non-null to null then back), hold used, game over, etc. Track previous state in a ref.

### A3: Start level selection — **[RESOLVED]**
The engine supports `startLevel` in `EngineOptions` but the task doesn't mention a level selector. **Resolution**: Default to level 1. Could add a level selector to StartScreen as a minor enhancement but not required.

### A4: BoardCanvas hold/next vs React components — **[RESOLVED]**
See IR6. The canvas already renders hold and next panels. The React components will be created as specified in the task but the canvas continues to be the primary renderer for those panels.

## 4. Edge Cases

### E1: Zen mode has no game over
`zenMode.topOutEndsGame === false`. The game over overlay should never appear in Zen. The only way to exit is quitting (Escape/quit button).

### E2: Sprint completion
When Sprint goal is reached (`endReason === "goalReached"`), the game over overlay should show completion time prominently (this is the player's "score" in Sprint).

### E3: Ultra time expiry
When Ultra time runs out (`endReason === "goalReached"`), show final score prominently (this is what matters in Ultra).

### E4: previewCount = 0
If a custom rule set sets `previewCount: 0`, the NextQueue should render empty / be hidden. The engine returns `queue: []` in this case.

### E5: Pause during lock delay
Pausing during lock delay should freeze the lock timer. The engine handles this (tick is not called when paused), but resuming should not cause an instant lock if the timer was almost expired — verified: engine only ticks lock delay when `status === "playing"`.

### E6: Key repeat vs DAS
Browser key repeat events (from holding a key) should be ignored — the UI must implement its own DAS/ARR based on keydown/keyup. Use `event.repeat` to filter out browser-generated repeat events.

### E7: SDF = Infinity
When `sdf` is Infinity, soft drop should move the piece to the landing row but NOT lock (unlike hard drop). The piece should be at the ghost position but remain in play for lock delay.
