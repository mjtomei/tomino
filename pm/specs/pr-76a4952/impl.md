# PR-76a4952: Fix left/right movement double-fire and stuck keys

## Requirements

### R1: Add `firedKeys` tracking for single-fire actions

**Problem**: The inline keyboard handlers in `GameShell.tsx` (solo: line 484, multiplayer: line 246) only use `if (e.repeat) return` to prevent duplicate keydown events. The `KeyboardHandler` class in `input/keyboard.ts` additionally maintains a `firedKeys: Set<string>` that gates single-fire actions (rotate, hardDrop, hold) — preventing duplicate firings even if the browser delivers multiple non-repeat keydown events for the same physical key without an intervening keyup.

**Fix**: Add a `firedKeys` ref (`Set<string>`) to both `SoloGameShell` and `MultiplayerGameShell`. On keydown for single-fire actions (rotateCW, rotateCCW, hardDrop, hold), check `firedKeys.has(e.code)` before executing; add the code to the set on first fire. On keyup, delete the code from `firedKeys`. This mirrors `KeyboardHandler.firedKeys` (line 101) and `handleKeyUp` (line 207).

**Files**: `packages/client/src/ui/GameShell.tsx`

### R2: Add blur handler to reset all input state on window focus loss

**Problem**: The inline handlers have no `blur` event listener. If a player holds a movement key and alt-tabs away, the `keyup` event is never delivered. When focus returns, the DAS ref still holds the stale key, so the game loop continues auto-repeating the movement direction — the "stuck key" bug. The `KeyboardHandler` class handles this via `handleBlur()` (line 236) which clears `heldKeys`, `firedKeys`, `das`, `directionOrder`, and `softDropHeld`.

**Fix**: Add a `blur` event listener on `window` in both solo and multiplayer keyboard `useEffect` blocks. On blur, reset `dasRef.current` to the neutral state (`{ key: null, action: null, dasTimer: 0, arrTimer: 0, dasTriggered: false }`) and clear `firedKeys`.

**Files**: `packages/client/src/ui/GameShell.tsx`

### R3: E2E tests for input bugs

**Problem**: No E2E test coverage for these input edge cases.

**Fix**: Create `e2e/input-bugs.spec.ts` with tests covering:
1. **Stuck keys on blur**: Start a solo game, hold a movement key, dispatch blur on window, verify game still responds to new input (piece can be moved in the opposite direction).
2. **Single-fire action does not double-fire**: Start a solo game, press a rotate key, verify the piece rotates exactly once (compare board state before and after).

**Files**: `e2e/input-bugs.spec.ts`

## Implicit Requirements

### IR1: DAS actions (moveLeft/moveRight) must NOT be gated by firedKeys
DAS actions fire immediately on keydown AND continue repeating via the DAS/ARR timer in the game loop. They should not be added to `firedKeys`. The `KeyboardHandler` separates these into `DAS_ACTIONS` (line 45) vs `SINGLE_FIRE_ACTIONS` (line 46). The inline code must make the same distinction.

### IR2: firedKeys cleanup on effect teardown
The `firedKeys` set must be cleared when the keyboard effect is cleaned up (component unmount or effect re-run), to prevent stale state across game restarts.

### IR3: blur handler must be removed on cleanup
The `blur` event listener must be removed in the effect's cleanup function to avoid memory leaks and duplicate handlers.

### IR4: Multiplayer sendAction path unchanged
The multiplayer `sendAction` function sends `InputAction` to the `GameClient`. The fix must not alter this code path — only add the gating logic before it executes.

### IR5: Sound effects still fire correctly
Move/rotate/hardDrop sounds are triggered in the keydown handler after the action. The `firedKeys` gate must prevent both the action AND the sound from double-firing (they're in the same code path, so gating early achieves this).

## Ambiguities

### A1: Should we integrate KeyboardHandler class or patch inline code?
**Resolution**: Patch inline code. The task description lists `keyboard.ts` as "if integrating" — optional. Integrating `KeyboardHandler` would require substantial refactoring of both shell components (different action dispatch patterns: engine methods vs GameClient.sendInput, pause handling differences, sound effect hooks). The minimal fix — adding `firedKeys` and `blur` handler — is lower risk and directly addresses both bugs.

### A2: Should softDrop be gated by firedKeys?
**Resolution**: No. Soft drop fires every frame while held (see `KeyboardHandler` line 255). It is not a single-fire action. The inline code doesn't track `softDropHeld` separately — it relies on the engine's soft drop handling. No change needed for soft drop.

### A3: What game actions count as "single-fire" in the inline code?
**Resolution**: Following `KeyboardHandler`'s `SINGLE_FIRE_ACTIONS` (line 46): `rotateCW`, `rotateCCW`, `hardDrop`, `hold`. The inline `KEY_MAP` also maps `KeyX` to `rotateCW` and `KeyC`/`ShiftLeft`/`ShiftRight` to `hold` — all of these key codes need firedKeys tracking. Pause is handled separately (returns early) and doesn't need gating.

### A4: E2E test approach for verifying "no double-fire"
**Resolution**: Use board state observation. After a single rotate keypress, take a brief wait and check that the score hasn't advanced unexpectedly (double hard-drop would cause visible piece placement). For movement, verify the game responds correctly to input after blur recovery. The E2E tests focus on observable behavior rather than counting internal action dispatches.

## Edge Cases

### EC1: Rapid direction reversal with firedKeys
A player pressing ArrowLeft then ArrowRight rapidly (without releasing ArrowLeft) should: fire moveLeft once, then fire moveRight once and start DAS for right. The `firedKeys` set should not interfere because DAS actions are not gated by it.

### EC2: Blur during DAS charging
If the player is holding ArrowLeft and DAS is mid-charge when blur fires, the DAS state should be fully reset. When focus returns and the player presses ArrowLeft again, DAS should start fresh (initial move + new DAS timer).

### EC3: Multiple blur events
Multiple blur events in sequence should be safe — resetting already-neutral state is a no-op.

### EC4: Tab switching during pause (solo)
If the game is paused and the player alt-tabs, the blur handler should still clear firedKeys and DAS. This prevents stale state when they resume.

### EC5: Game over during key hold
If a hard drop causes game over while a movement key is held, the DAS ref persists but the game loop stops (both solo and multiplayer check game-over before continuing RAF). When a new game starts, `dasRef` is reset in `startGame` (solo, line 373). Multiplayer doesn't restart within the same component instance. No additional fix needed.
