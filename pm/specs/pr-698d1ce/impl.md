# PR-698d1ce: Fix Arrow Key Page Scroll While Held

## Requirements

### R1: Prevent browser scroll on repeated arrow key events (solo mode)

**File**: `packages/client/src/ui/GameShell.tsx`, solo keyboard handler (~line 484-544)

The solo `handleKeyDown` (line 485) currently does `if (e.repeat) return;` at line 486 before reaching `e.preventDefault()` at line 493. When a player holds an arrow key, the browser fires repeated `keydown` events with `e.repeat === true`. The early return skips `preventDefault()`, causing the page to scroll.

**Fix**: Call `e.preventDefault()` for mapped keys _before_ the `e.repeat` guard. The handler should still bail out of _game logic_ on repeat events, but must always suppress the browser default for recognized game keys.

### R2: Prevent browser scroll on repeated arrow key events (multiplayer mode)

**File**: `packages/client/src/ui/GameShell.tsx`, multiplayer keyboard handler (~line 245-293)

The multiplayer `handleKeyDown` (line 247) has the identical pattern: `if (e.repeat) return;` at line 248 before `e.preventDefault()` at line 252.

**Fix**: Same approach as R1 — call `e.preventDefault()` for mapped keys before the `e.repeat` guard.

### R3: E2E test coverage

**File**: `e2e/input-bugs.spec.ts` (new)

Write an E2E test that verifies holding an arrow key does not cause page scrolling. The test should:
- Start a solo game using `setupSoloGame` helper
- Hold an arrow key long enough to trigger repeat events
- Assert that the page has not scrolled (scrollTop remains 0)

## Implicit Requirements

### IR1: Unmapped keys must not have `preventDefault()` called

The fix must only call `preventDefault()` for keys that are in `KEY_MAP`. Calling `preventDefault()` on unmapped keys would break browser features like tab navigation, F5 refresh, etc.

### IR2: Game logic for repeat events must remain unchanged

The `if (e.repeat) return;` guard exists to prevent repeat keypresses from triggering additional game actions (duplicate moves, rotations, etc.). The DAS system handles auto-repeat for lateral movement. The fix must preserve this behavior — only the `preventDefault()` call should run on repeat events, not the game logic.

### IR3: Both solo and multiplayer handlers need identical fixes

The bug exists in both handlers with the same pattern. Both must be fixed consistently.

## Ambiguities

### A1: Which keys to test in E2E

**Resolution**: Test `ArrowDown` (softDrop) since it's the most natural key to cause vertical page scroll and is a common key players hold. ArrowLeft/ArrowRight could also cause horizontal scroll but vertical scroll is the primary user-visible issue.

### A2: Test structure — solo only vs. both modes

**Resolution**: Test solo mode only. The multiplayer handler has the identical code pattern, so if the fix works for solo, the same structural fix applies to multiplayer. Setting up a full multiplayer game for this test would add significant complexity for marginal benefit.

### A3: Duration of key hold in test

**Resolution**: Hold the arrow key for ~500ms. This is long enough to trigger multiple repeat events (browsers typically fire at ~30ms intervals after an initial ~500ms delay, but the initial DAS delay is what matters). Use 500ms to be safe across environments. The `holdKey` helper from `e2e/helpers/input.ts` already supports this.

## Edge Cases

### E1: Non-arrow keys in KEY_MAP

The fix also applies to Space, Escape, KeyZ, KeyX, KeyC, ShiftLeft, ShiftRight, KeyP — all keys in `KEY_MAP`. Space in particular can cause page scroll. The fix handles all of these uniformly since it calls `preventDefault()` for any mapped key.

### E2: Keys pressed when game is not active (solo mode)

In solo mode, the handler checks `engine` at line 488-489 and returns if null. The `KEY_MAP` lookup happens _after_ the engine check. The fix should place `preventDefault()` after the KEY_MAP lookup but before the `e.repeat` guard, which means the engine-null check will still skip preventDefault. This is acceptable: if there's no engine, the game shell isn't showing a game board, so scroll suppression isn't needed.

### E3: Paused state

When the game is paused (solo), the handler returns at line 505 (`if (status !== "playing") return`). This is _after_ `preventDefault()`, so arrow keys won't scroll even while paused. This is correct behavior — the game board is still visible and scrolling would be disruptive.
