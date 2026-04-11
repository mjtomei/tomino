# Core Single-Player Tetris

## Scope

Build a complete, polished single-player Tetris game that runs in the browser with support for multiple rule set presets (Classic, Modern) and fully custom rule sets. All game modes (Marathon, Sprint, Ultra, Zen) are available under any rule set. Game logic is cleanly separated from rendering so the engine can be reused server-side for multiplayer (Plan 2).

## Goals

- Multiple rule set presets with fully custom mix-and-match support
- **Modern preset**: SRS rotation + wall kicks, lock delay, hold, ghost, hard drop, 7-bag, T-spin scoring
- **Classic preset**: NRS rotation, no wall kicks, instant lock, no hold/ghost/hard drop, pure random, NES scoring
- All 7 piece types (I, O, T, S, Z, J, L)
- Game modes: Marathon, Sprint (40L), Ultra (3min), Zen — available for all rule sets
- Next piece preview and hold piece (when rule set enables them)
- Ghost piece (when rule set enables it)
- Scoring system per rule set (Guideline or NES formula)
- Levels with increasing gravity (speed curves per rule set)
- Responsive keyboard controls with configurable DAS/ARR
- Clean, modern UI inspired by tetr.io's aesthetic
- Sound effects for moves, clears, and game over

## Tech Stack

- TypeScript + React (Vite for build tooling)
- HTML5 Canvas for game board rendering
- Web Audio API for sound effects
- No backend needed for this plan

## Rule Set Architecture

The engine accepts a `RuleSet` config object that controls all variable mechanics. Presets are just named `RuleSet` instances. The UI exposes preset selection plus a "Custom" option that lets you mix and match any setting.

```typescript
interface RuleSet {
  name: string;

  // Rotation
  rotationSystem: "srs" | "nrs";         // SRS (4-state, wall kicks) or NRS (2-state I/S/Z, no kicks)

  // Lock behavior
  lockDelay: number;                      // ms, 0 = instant lock (classic)
  lockResets: number;                     // max move/rotate resets before forced lock, 0 = no resets
  
  // Features
  holdEnabled: boolean;
  hardDropEnabled: boolean;
  ghostEnabled: boolean;
  
  // Randomizer
  randomizer: "7bag" | "pure-random";
  
  // Scoring
  scoringSystem: "guideline" | "nes";
  
  // Gravity / speed curve
  gravityCurve: "guideline" | "nes";
  
  // DAS / ARR
  das: number;                            // ms, initial delay
  arr: number;                            // ms, repeat rate (0 = instant)
  sdf: number;                            // soft drop factor multiplier (Infinity = instant)
  
  // Preview
  previewCount: number;                   // number of next pieces shown (0-6)
}
```

### Presets

| Setting | Classic | Modern |
|---------|---------|--------|
| Rotation | NRS (2-state I/S/Z, no kicks) | SRS (4-state, wall kicks) |
| Lock delay | 0ms (instant) | 500ms, 15 resets |
| Hold | No | Yes |
| Hard drop | No | Yes |
| Ghost piece | No | Yes |
| Randomizer | Pure random | 7-bag |
| Scoring | NES formula | Guideline (T-spins, combos, B2B) |
| Gravity curve | NES (48→1 frames/cell) | Guideline |
| DAS / ARR | 267ms / 100ms | 133ms / 10ms |
| SDF | 2x | Infinity (instant) |
| Preview count | 1 | 5 |

Custom rule sets can freely mix any value from any column — e.g., SRS rotation with NES gravity and no hold.

## Game Modes

All modes are available under every rule set:

| Mode | Win/End Condition | Display |
|------|-------------------|---------|
| **Marathon** | Endless; game over on top-out. Optional level cap (e.g., level 15). | Score, level, lines |
| **Sprint (40L)** | Clear 40 lines as fast as possible. Timer counts up. | Timer, lines remaining |
| **Ultra** | 3-minute time limit. Maximize score. | Timer (countdown), score |
| **Zen** | No gravity, no game over. Practice mode. | Lines, score (optional) |

## Engine Architecture

- **`RuleSet`**: Pure data describing all configurable mechanics. Presets are factory functions.
- **`RotationSystem` interface**: Strategy for rotation states and kick tables. Two implementations: `SRSRotation` and `NRSRotation`.
- **`Randomizer` interface**: Strategy for piece generation. Two implementations: `SevenBagRandomizer` and `PureRandomRandomizer`.
- **`ScoringSystem` interface**: Strategy for scoring. Two implementations: `GuidelineScoring` (T-spins, combos, B2B) and `NESScoring` (classic formula).
- **`GravityCurve` interface**: Maps level → drop interval. Two implementations for guideline and NES curves.
- **`TetrisEngine`**: Core class that takes a `RuleSet` + `GameMode` config. Owns the board, active piece, and delegates to the pluggable systems above. Zero browser dependencies.
- **Board**: 10 columns x 40 rows (rows 0-19 buffer, 20-39 visible).
- **Input handler**: Maps keyboard events → engine actions. Implements DAS/ARR from the rule set.
- **Renderer**: Canvas-based, renders any game state regardless of rule set.

## Key Design Decisions

- **Strategy pattern for pluggable systems**: Rotation, randomizer, scoring, and gravity are interfaces with swappable implementations. The engine doesn't know which variant it's running — it just calls the interface. This makes custom rule sets trivial: pick one implementation per interface.
- **RuleSet is plain data**: Serializable to JSON so it can be saved, shared, and sent over the wire for multiplayer.
- **Game mode is orthogonal to rule set**: Mode only controls start/end conditions and which stats to display. Any mode works with any rule set.
- **Canvas rendering**: Same renderer regardless of rule set — it just draws whatever the engine state contains. Ghost/hold/preview visibility is driven by the state (null ghost = no ghost drawn).

## Constraints

- Game engine must have zero browser dependencies (no DOM, no `window`) so it can run in Node.js for multiplayer later.
- No external game frameworks — keep dependencies minimal.
- Must work on modern Chrome/Firefox/Safari. No mobile support needed yet.
- RuleSet must be serializable (no functions/classes in the config object itself).

## PRs

### PR: Project scaffolding with Vite + React + TypeScript
- **description**: Initialize the project with Vite, React, TypeScript, and basic dev tooling (ESLint, Prettier). Set up the directory structure: `src/engine/`, `src/ui/`, `src/input/`, `src/audio/`. Include a minimal "Hello World" React app that renders to confirm the toolchain works. No game logic yet.
- **tests**: Vite builds successfully, dev server starts, React renders a placeholder page.
- **files**: `package.json`, `tsconfig.json`, `vite.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `index.html`, `src/main.tsx`, `src/App.tsx`
- **depends_on**:

---

### PR: RuleSet types, presets, and game mode definitions
- **description**: Define the `RuleSet` interface, `GameMode` enum, and preset factory functions (`classicRuleSet()`, `modernRuleSet()`). Define the `GameMode` type with start/end conditions for Marathon, Sprint, Ultra, and Zen. Include a `customRuleSet()` helper that takes partial overrides on top of a base preset. All pure types and data — no logic. **Human testing not needed** — type definitions and data.
- **tests**: Unit tests for: presets return valid RuleSets with all fields populated, custom rule set overrides work, game mode definitions have correct conditions.
- **files**: `src/engine/types.ts`, `src/engine/rulesets.ts`, `src/engine/rulesets.test.ts`
- **depends_on**: Project scaffolding with Vite + React + TypeScript

---

### PR: Piece definitions for SRS and NRS rotation systems
- **description**: Define all 7 Tetris pieces with rotation states for both rotation systems. **SRS**: 4 rotation states per piece, wall kick offset tables (JLSTZ shared table, I-piece separate table, O-piece no kicks). **NRS**: 2 rotation states for I/S/Z pieces, 4 for J/L/T, no wall kicks, right-handed bias. Implement the `RotationSystem` interface with `SRSRotation` and `NRSRotation` implementations that return rotation states and kick offsets for a given piece and rotation transition. **Human testing not needed** — purely data and logic verified by unit tests.
- **tests**: Unit tests for: SRS — each piece has 4 states, correct shapes, kick tables have correct entries, I-piece uses own table. NRS — I/S/Z have 2 states, J/L/T have 4, no kick offsets returned, O has 1 state. Both systems implement the same interface.
- **files**: `src/engine/pieces.ts`, `src/engine/rotation-srs.ts`, `src/engine/rotation-nrs.ts`, `src/engine/rotation.ts`, `src/engine/pieces.test.ts`
- **depends_on**: RuleSet types presets and game mode definitions

---

### PR: Board model and line clearing
- **description**: Implement the board as a 10x40 2D grid (rows 0-19 buffer zone, 20-39 visible). Support placing a piece (writing its cells to the grid), checking for completed lines, clearing completed lines and shifting rows down. Pure logic, no rendering. **Human testing not needed** — pure logic verified by unit tests.
- **tests**: Unit tests for: empty board initialization, placing a piece on the board, detecting full rows, clearing single/double/triple/tetris lines, rows above shift down correctly after clear, buffer zone rows work correctly.
- **files**: `src/engine/board.ts`, `src/engine/board.test.ts`
- **depends_on**: Piece definitions for SRS and NRS rotation systems

---

### PR: Piece movement, rotation, and wall kicks
- **description**: Implement piece movement (left, right, soft drop) and rotation via the `RotationSystem` interface. Movement checks collision with board walls and placed cells. Rotation delegates to the active rotation system which returns kick offsets to try — the movement module accepts the first non-colliding offset. Works identically for SRS (with kicks) and NRS (no kicks, just base rotation). **Human testing not needed** — pure logic verified by unit tests.
- **tests**: Unit tests for: moving left/right, collision with walls, collision with placed pieces, soft drop. With SRS: rotation through all 4 states, wall kicks trigger on obstruction, I-piece kicks, blocked when all kicks fail. With NRS: 2-state rotation for I/S/Z, no kicks attempted, rotation blocked on collision.
- **files**: `src/engine/movement.ts`, `src/engine/movement.test.ts`
- **depends_on**: Board model and line clearing

---

### PR: Randomizer variants — 7-bag and pure random
- **description**: Implement the `Randomizer` interface with two implementations. **SevenBagRandomizer**: shuffles all 7 pieces, deals them, refills when empty. **PureRandomRandomizer**: uniform random piece selection (classic style, allows repeats). Both maintain a piece queue (depth configurable via `previewCount`). Implement hold piece logic separately — swap current with held, one-hold-per-drop restriction, respects `holdEnabled` from rule set. **Human testing not needed** — pure logic verified by unit tests.
- **tests**: Unit tests for: 7-bag — contains all 7, no repeats within bag, refills on exhaustion. Pure random — produces valid pieces, allows repeats. Both — queue stays filled to requested depth. Hold — swaps correctly, blocked when disabled, cannot hold twice per drop.
- **files**: `src/engine/randomizer.ts`, `src/engine/randomizer-7bag.ts`, `src/engine/randomizer-pure.ts`, `src/engine/hold.ts`, `src/engine/randomizer.test.ts`
- **depends_on**: Piece definitions for SRS and NRS rotation systems

---

### PR: Scoring systems — Guideline and NES
- **description**: Implement the `ScoringSystem` interface with two implementations. **GuidelineScoring**: base points × level for clears (100/300/500/800), T-spin detection (3-corner rule) with mini/full bonuses, combo counter (+50 × combo), back-to-back 1.5x for consecutive difficult clears, perfect clear bonuses, soft drop (1/cell) and hard drop (2/cell). **NESScoring**: classic formula (40/100/300/1200 × (level+1)), soft drop (1/cell), no T-spins, no combos, no B2B. Each scoring system includes its own gravity curve (level → drop interval mapping). **Human testing not needed** — pure logic verified by unit tests.
- **tests**: Unit tests for: Guideline — points for each clear type at various levels, T-spin 3-corner detection, mini vs full, combo escalation, combo reset, B2B bonus, perfect clear bonus, hard/soft drop points. NES — points for each clear type at various levels, soft drop points, no T-spin/combo/B2B. Gravity — guideline curve values, NES curve (48 frames at L0, 1 frame at L29).
- **files**: `src/engine/scoring.ts`, `src/engine/scoring-guideline.ts`, `src/engine/scoring-nes.ts`, `src/engine/gravity.ts`, `src/engine/scoring.test.ts`
- **depends_on**: Board model and line clearing

---

### PR: TetrisEngine — game loop and state machine
- **description**: Implement the core `TetrisEngine` class that takes a `RuleSet` and `GameMode` config, instantiates the appropriate rotation system, randomizer, and scoring system, and ties them together with the board and movement modules. Manages game states (idle, playing, paused, game over). Runs gravity ticks per the active gravity curve. Lock delay behavior driven by rule set (0 = instant lock, >0 = delay with configurable max resets). Hard drop availability driven by rule set. Game mode controls end conditions: Marathon = top-out, Sprint = 40 lines cleared, Ultra = 3min timer expires, Zen = manual quit only. Emits complete game state snapshots. Zero browser dependencies. **Human testing not needed** — pure logic verified by unit tests.
- **tests**: Unit tests for: engine initializes from rule set + mode, start/pause/game-over transitions. With Modern rules: gravity at correct interval, lock delay with resets, hard drop works, hold works, ghost position correct. With Classic rules: instant lock, no hard drop action, no hold, no ghost in state. Game modes: Marathon ends on top-out, Sprint ends at 40 lines (records time), Ultra ends after 3min (records score), Zen has no gravity and no top-out. State snapshot contains all data needed by renderer.
- **files**: `src/engine/engine.ts`, `src/engine/engine.test.ts`
- **depends_on**: Piece movement rotation and wall kicks, Randomizer variants — 7-bag and pure random, Scoring systems — Guideline and NES

---

### PR: Canvas renderer for game board
- **description**: Implement a React component with an HTML5 Canvas that renders the game state: placed cells with colors, active piece, ghost piece (when present in state), grid lines. Each cell is a colored rectangle with subtle borders. Renders at 60fps via `requestAnimationFrame`. The renderer is rule-set-agnostic — it draws whatever the state snapshot contains. If ghost is null (Classic), nothing is drawn for it. Same for hold/preview. **INPUT_REQUIRED: Human testing needed** to verify pieces render correctly under both Classic and Modern rule sets, ghost appears only when enabled, colors look right.
- **tests**: Unit tests for: component renders canvas, render called with state, ghost not drawn when null.
- **files**: `src/ui/BoardCanvas.tsx`, `src/ui/BoardCanvas.test.tsx`, `src/ui/colors.ts`
- **depends_on**: TetrisEngine — game loop and state machine

---

### PR: Input handler with DAS/ARR
- **description**: Implement keyboard input handling that maps keys to engine actions. DAS and ARR values are read from the active rule set. Actions gated by rule set: hard drop key ignored when `hardDropEnabled=false`, hold key ignored when `holdEnabled=false`. Key mappings: left/right arrows for movement, up for CW rotation, Z for CCW, space for hard drop, down for soft drop, shift for hold, escape for pause. DAS/ARR feel must be snappy — ARR=0 means instant teleport on DAS charge. **INPUT_REQUIRED: Human testing needed** to verify responsiveness under both Classic DAS (sluggish, authentic) and Modern DAS (fast, tetr.io-like), and that disabled actions are properly ignored.
- **tests**: Unit tests for: key→action mapping, DAS delay before repeat, ARR repeat rate, ARR=0 instant move, hard drop key ignored when disabled, hold key ignored when disabled.
- **files**: `src/input/keyboard.ts`, `src/input/keyboard.test.ts`
- **depends_on**: TetrisEngine — game loop and state machine

---

### PR: React UI shell — score, next queue, hold, mode display
- **description**: Build the React UI chrome around the canvas: score/level/lines display, next piece queue (respects `previewCount` — 1 for Classic, 5 for Modern), hold piece display (hidden when hold disabled), game mode-specific stats (timer for Sprint/Ultra, lines remaining for Sprint), and overlays (start screen with rule set + mode selector, pause, game over with final stats). Layout inspired by tetr.io. The start screen shows preset buttons (Classic, Modern, Custom) and mode buttons (Marathon, Sprint, Ultra, Zen). "Custom" expands a panel to tweak individual rule set fields. **INPUT_REQUIRED: Human testing needed** to verify layout, rule set selector works, mode selector works, custom panel usable, correct stats shown per mode, overlays appear correctly.
- **tests**: Unit tests for: components render correct values, next queue respects previewCount, hold hidden when disabled, mode-specific stats displayed, overlays appear on correct game states, preset/mode selection updates config.
- **files**: `src/ui/GameShell.tsx`, `src/ui/ScoreDisplay.tsx`, `src/ui/NextQueue.tsx`, `src/ui/HoldDisplay.tsx`, `src/ui/Overlay.tsx`, `src/ui/StartScreen.tsx`, `src/ui/CustomRuleSetPanel.tsx`, `src/ui/GameShell.css`, `src/App.tsx`
- **depends_on**: Canvas renderer for game board

---

### PR: Sound effects with Web Audio API
- **description**: Implement sound effects using the Web Audio API: piece move, piece rotate, piece lock, line clear (single/multi/tetris), T-spin, hold, hard drop, level up, game over. Generate sounds programmatically (oscillator-based) rather than loading audio files. Provide a mute toggle. Sound events are driven by engine state transitions — works with any rule set (T-spin sound simply never triggers under Classic/NES scoring). **INPUT_REQUIRED: Human testing needed** to verify sounds play at the right time, volume levels are balanced, sounds are pleasant, mute works.
- **tests**: Unit tests for: audio context created, sounds trigger on correct events, mute prevents playback, no errors when T-spin event absent.
- **files**: `src/audio/sounds.ts`, `src/audio/sounds.test.ts`
- **depends_on**: TetrisEngine — game loop and state machine

---

### PR: Integration — playable single-player Tetris
- **description**: Wire everything together: `App.tsx` creates engine from selected rule set + game mode, connects input handler, audio, renderer, and UI shell. Game loop via `requestAnimationFrame`. Start screen lets user pick preset (Classic/Modern/Custom) and mode (Marathon/Sprint/Ultra/Zen), then launches the game. **INPUT_REQUIRED: Human testing critical** — play full games under each combination: Modern+Marathon (standard experience), Classic+Marathon (NES feel — instant lock, no hold, sluggish DAS), Modern+Sprint (race to 40L), Classic+Sprint, Modern+Ultra, Zen mode. Verify a custom rule set (e.g., SRS rotation + NES gravity + no hold). Verify all transitions: start→play→pause→resume→game over→restart with different settings.
- **tests**: Integration test: engine + input + renderer initialize without errors for each preset. Smoke test switching presets and modes.
- **files**: `src/App.tsx`, `src/main.tsx`, `src/game/GameController.ts`
- **depends_on**: Canvas renderer for game board, Input handler with DAS/ARR, React UI shell — score next queue hold mode display, Sound effects with Web Audio API
