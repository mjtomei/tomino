# Implementation Spec: Input Handler with DAS/ARR

## Overview

Create `packages/client/src/input/keyboard.ts` — a client-side keyboard input handler that maps physical keys to `InputAction` values, implements DAS (Delayed Auto Shift) and ARR (Auto Repeat Rate) for horizontal movement, gates actions based on rule set flags, and exposes an `update(deltaMs)` method for the game loop to poll.

Tests in `packages/client/src/input/keyboard.test.ts`.

---

## 1. Requirements

### R1: Key-to-Action Mapping

Map keyboard keys to engine actions:

| Key            | Action         |
|----------------|----------------|
| ArrowLeft      | `moveLeft`     |
| ArrowRight     | `moveRight`    |
| ArrowUp        | `rotateCW`     |
| KeyZ           | `rotateCCW`    |
| Space          | `hardDrop`     |
| ArrowDown      | `softDrop`     |
| ShiftLeft/ShiftRight | `hold`   |
| Escape         | `pause` (toggle) |

Actions dispatch to `TetrisEngine` methods (`engine.ts:221-300`): `moveLeft()`, `moveRight()`, `rotateCW()`, `rotateCCW()`, `hardDrop()`, `softDrop()`, `hold()`, `pause()`/`resume()`.

The `InputAction` type (`types.ts:124-132`) does not include "pause" — pause/resume are engine lifecycle methods, not gameplay inputs. The keyboard handler will treat Escape specially.

### R2: DAS/ARR for Horizontal Movement

DAS and ARR apply only to `moveLeft` and `moveRight`.

- **DAS (Delayed Auto Shift)**: When a horizontal key is pressed, the first move fires immediately. If the key is held, wait `ruleSet.das` milliseconds before auto-repeat begins.
- **ARR (Auto Repeat Rate)**: After DAS charges, repeat the move every `ruleSet.arr` milliseconds.
- **ARR=0 special case**: When `arr === 0`, after DAS charges, instantly move the piece to the wall (teleport). This means calling `moveLeft()`/`moveRight()` repeatedly in a single frame until the piece can't move further.

Values come from `RuleSet` (`engine/types.ts:9-62`):
- Classic: `das: 267`, `arr: 100`
- Modern: `das: 133`, `arr: 10`

### R3: Action Gating by Rule Set

- `hardDrop` (`Space`): Ignored when `ruleSet.hardDropEnabled === false` (Classic preset, `rulesets.ts:15`).
- `hold` (`Shift`): Ignored when `ruleSet.holdEnabled === false` (Classic preset, `rulesets.ts:14`).

Note: The engine already gates these (`engine.ts:258`, `engine.ts:287`), but the input handler should also gate them to avoid unnecessary action dispatches and to keep the input layer self-contained.

### R4: Soft Drop

Soft drop (`ArrowDown`) fires on press and repeats while held, but does NOT use DAS/ARR timing. Instead, soft drop should fire every frame while held (the engine handles SDF gravity multiplication internally).

### R5: Non-Repeating Actions

`rotateCW`, `rotateCCW`, `hardDrop`, and `hold` fire once on key press and do not repeat while held.

### R6: Pause Toggle

`Escape` toggles between `engine.pause()` and `engine.resume()` based on current `GameStatus`. Fire once on press, no repeat.

---

## 2. Implicit Requirements

### IR1: Directional Key Priority

When both left and right are held simultaneously, only the most recently pressed direction should be active. This prevents conflicting DAS states.

### IR2: Key Release Resets DAS

Releasing a horizontal key resets DAS state for that direction. Re-pressing starts a fresh DAS charge.

### IR3: Cleanup / Dispose

The handler attaches `keydown`/`keyup` event listeners to `document` (or a target element). It must provide a `dispose()`/`destroy()` method to remove listeners and prevent memory leaks.

### IR4: Prevent Default Browser Behavior

Arrow keys, Space, and other mapped keys should have their default browser behavior prevented (e.g., page scrolling) while the handler is active.

### IR5: No Action When Game Not Playing

The handler should not dispatch movement/rotation/drop actions when the engine status is not `"playing"`. Pause toggle is the exception (works in both `"playing"` and `"paused"` states).

### IR6: Frame-Driven Update Model

The handler should track key state internally and expose an `update(deltaMs: number)` method. The game loop calls `update()` each frame, which processes DAS/ARR timers and returns any actions to execute. This decouples input from event timing and ensures deterministic behavior.

---

## 3. Ambiguities

### A1: Soft Drop Repeat Behavior — **[RESOLVED]**

**Question**: Should soft drop use DAS/ARR timing or repeat every frame?

**Resolution**: Soft drop repeats every frame while held. The engine's `softDrop()` moves the piece down one row per call, and the SDF multiplier is handled by engine gravity. Frame-by-frame soft drop gives the expected "hold down = fast drop" feel.

### A2: rotate180 Action — **[RESOLVED]**

**Question**: `InputAction` includes `"rotate180"` but no key mapping is specified in the task.

**Resolution**: No key is mapped to `rotate180` in this PR. The action exists in the type for future use. No dead code will be added for it.

### A3: Handler Architecture — Callback vs Polling — **[RESOLVED]**

**Question**: Should the handler push actions via callbacks or be polled each frame?

**Resolution**: Polling model via `update(deltaMs)`. This is more natural for game loops, allows DAS/ARR to be processed synchronously with the frame, and avoids timing issues with async event handlers. The `update()` method returns an array of `InputAction` values (plus a `pause` sentinel) to execute this frame.

### A4: Multiple Keys for Same Action — **[RESOLVED]**

**Question**: Should both ShiftLeft and ShiftRight map to hold?

**Resolution**: Yes. Both `ShiftLeft` and `ShiftRight` map to `hold`. Using `event.code` (not `event.key`) for unambiguous physical key identification.

---

## 4. Edge Cases

### E1: ARR=0 Wall Teleport Bound

When ARR=0 and DAS charges, the handler must call `moveLeft()`/`moveRight()` in a loop. The loop terminates when the piece position stops changing (wall reached). Must guard against infinite loops — cap at `BOARD_WIDTH` (10) iterations.

### E2: Rapid Key Tap During DAS Charge

If a player taps left, releases before DAS charges, then presses left again — each press should fire one immediate move and start a fresh DAS timer. No "partial DAS" carries over.

### E3: Direction Switch Mid-DAS

If left is held and DAS is charging, pressing right should cancel left's DAS and start right's DAS fresh (per IR1: most-recent-key wins).

### E4: Key Events During Pause

While paused, movement/rotation/drop key events should be ignored. Only Escape (to resume) should be processed. DAS timers should be reset when the game leaves `"playing"` state.

### E5: Focus Loss

If the browser tab loses focus, all keys should be considered released to prevent "stuck key" behavior. Listen for `blur` event on the target.

---

## 5. API Design

```typescript
interface KeyboardHandlerOptions {
  ruleSet: RuleSet;
  onAction: (action: InputAction) => void;
  onPause: () => void;
  onResume: () => void;
  target?: EventTarget;  // defaults to document
}

class KeyboardHandler {
  constructor(options: KeyboardHandlerOptions);

  /** Call each frame. Processes DAS/ARR and fires callbacks. */
  update(deltaMs: number): void;

  /** Remove event listeners. */
  dispose(): void;
}
```

The callback model (rather than returning an array) is simpler for the caller — the game loop just calls `update(deltaMs)` and the handler dispatches actions directly.

---

## 6. Test Plan

Tests in `packages/client/src/input/keyboard.test.ts` using vitest. Since the keyboard handler is client-side and event-driven, tests will simulate `KeyboardEvent` dispatches and verify callback invocations. Factories from `packages/shared/src/__test-utils__/factories.ts` will be used for game state setup where needed.

| Test | Description |
|------|-------------|
| Key→action mapping | Each mapped key fires the correct `InputAction` callback |
| DAS delay | Holding left/right fires once immediately, then no repeat until DAS ms elapsed |
| ARR repeat rate | After DAS charges, actions fire at ARR interval |
| ARR=0 instant move | After DAS charges with ARR=0, multiple moves fire in single update |
| Hard drop gating | Space key ignored when `hardDropEnabled=false` |
| Hold gating | Shift key ignored when `holdEnabled=false` |
| Non-repeating keys | Rotation, hard drop, hold fire once per press |
| Direction priority | Last-pressed direction wins when both held |
| DAS reset on release | Releasing and re-pressing starts fresh DAS |
| Pause toggle | Escape calls onPause/onResume appropriately |
| Blur resets keys | Window blur clears all held key state |
| Dispose cleanup | After dispose, no callbacks fire |
