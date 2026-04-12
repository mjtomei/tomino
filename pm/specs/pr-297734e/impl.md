# Implementation Spec: Sound Effects with Web Audio API

**PR:** pr-297734e
**Files:** `packages/client/src/audio/sounds.ts`, `packages/client/src/audio/sounds.test.ts`

---

## 1. Requirements

### 1.1 Sound Events

The following game events must trigger distinct sounds:

| Event | Detection Method |
|---|---|
| **Piece move** | `moveLeft()`/`moveRight()` succeeds (piece position changes horizontally) |
| **Piece rotate** | `rotateCW()`/`rotateCCW()` succeeds (rotation state changes) |
| **Piece lock** | Piece locks to the grid (currentPiece becomes null after being non-null, lines cleared = 0, not game over) |
| **Hard drop** | `hardDrop()` called (piece drops and locks instantly) |
| **Line clear — single** | 1 line cleared, tSpin = "none" |
| **Line clear — double** | 2 lines cleared, tSpin = "none" |
| **Line clear — triple** | 3 lines cleared, tSpin = "none" |
| **Line clear — tetris** | 4 lines cleared |
| **T-spin** | tSpin = "mini" or "full" (with or without line clear) |
| **Hold** | `hold()` called successfully (held piece changes or holdUsed becomes true) |
| **Level up** | `scoring.level` increases between snapshots |
| **Game over** | `status` transitions to "gameOver" |

### 1.2 Sound Generation

- All sounds generated programmatically using Web Audio API oscillators (no audio file loading).
- Each sound must be distinct and recognizable.
- Sounds use `OscillatorNode`, `GainNode`, and optionally `BiquadFilterNode` for shaping.

### 1.3 Mute Toggle

- A `mute` property that prevents all sound playback when enabled.
- Toggling mute mid-game must not cause errors or orphaned audio nodes.
- Muted state persists for the lifetime of the sound manager instance.

### 1.4 Event Detection Architecture

The `TetrisEngine` (in `packages/shared/src/engine/engine.ts`) is a **pure state machine with no event/callback system**. It exposes `getState(): GameState` which returns a snapshot. The sound module must therefore:

- Accept "sound events" explicitly from the caller (the game loop / UI layer) rather than trying to diff state internally.
- Expose a simple API: `playSound(event: SoundEvent): void` where `SoundEvent` is a union of the events above.
- The game loop / integration layer is responsible for detecting state changes and calling the appropriate sound methods. This PR provides the sound module itself; integration with the game loop is a separate concern.

### 1.5 Test Requirements

Unit tests covering:
1. AudioContext is created (lazily, on first sound play — browser autoplay policy).
2. Each sound event triggers the correct oscillator configuration.
3. Mute prevents playback (no oscillator `start()` called).
4. No errors when the module is used in an environment without Web Audio API.
5. T-spin sound simply never triggers under Classic/NES scoring (no special handling needed — the engine never emits tSpin != "none" for NRS since NRS has no wall kicks and T-spin detection requires last action to be rotation with 3-corner rule; this is engine behavior, not sound module behavior).

---

## 2. Implicit Requirements

### 2.1 Browser Autoplay Policy
Web Audio API requires user interaction before an `AudioContext` can be started. The `AudioContext` must be created/resumed lazily on the first user-triggered sound event, not eagerly at module construction.

### 2.2 Node Cleanup
Oscillator nodes must be properly stopped and disconnected after playback to avoid memory leaks. Use `oscillator.stop(time)` with a scheduled stop time and rely on the garbage collector after disconnect.

### 2.3 jsdom Test Environment
The client tests run in `jsdom` (`packages/client/vitest.config.ts`). jsdom does not implement Web Audio API. Tests must mock `AudioContext`, `OscillatorNode`, and `GainNode` to verify behavior without a real audio backend.

### 2.4 Zero Impact on Engine Package
The sound module lives in `packages/client/src/audio/` and must NOT modify anything in `packages/shared/`. The engine remains a pure, zero-browser-dependency state machine.

### 2.5 TypeScript Strict Mode
The client uses `strict: true` with `noUnusedLocals` and `noUnusedParameters`. All code must pass strict type checking.

---

## 3. Ambiguities

### 3.1 Soft Drop Sound
**Ambiguity:** The task lists "piece move" but not "soft drop" explicitly. Soft drop is a downward movement.
**Resolution:** Soft drop is a form of movement but is continuous/repeated. Do NOT play a sound on soft drop — it would fire every frame and be annoying. Only horizontal moves (left/right) get a move sound.

### 3.2 Hard Drop vs Lock Sound
**Ambiguity:** Hard drop causes an immediate lock. Should both sounds play?
**Resolution:** Hard drop gets its own distinct sound that subsumes the lock sound. When a piece hard-drops, play only the hard drop sound, not the lock sound separately.

### 3.3 T-Spin + Line Clear
**Ambiguity:** Should T-spin and line clear sounds play simultaneously, or should T-spin replace the line clear sound?
**Resolution:** Play the T-spin sound instead of the regular line clear sound. T-spin is the more notable event and overlapping sounds would be cacophonous.

### 3.4 Lock vs Line Clear
**Ambiguity:** Every line clear is also a lock. Should both sounds play?
**Resolution:** When lines are cleared, play only the line clear sound. The lock sound plays only when a piece locks with 0 lines cleared.

### 3.5 Perfect Clear Sound
**Ambiguity:** Not listed in the task requirements, but perfect clear is a significant scoring event.
**Resolution:** Not implementing a separate perfect clear sound — it's not in the requirements. The line clear sound (based on line count) plays as normal.

### 3.6 Sound Event Type Definition Location
**Ambiguity:** Should the `SoundEvent` type live in shared (so the engine could emit events in the future) or in client?
**Resolution:** Keep it in `packages/client/src/audio/sounds.ts`. The engine has no event system and shouldn't gain browser-audio-related types. If events are added to the engine later, they'd be generic game events, not sound events.

---

## 4. Edge Cases

### 4.1 Rapid Fire Events
Multiple sounds may trigger in quick succession (e.g., DAS auto-repeat produces many move events). Each call should create a fresh oscillator — Web Audio API handles polyphony natively.

### 4.2 Game Over During Line Clear
If a `goalReached` end happens after a line clear (sprint mode), both the line clear event and game over event may be detected. The game loop should emit both; the sound module plays both (they're short enough to overlap).

### 4.3 AudioContext Suspended State
If the browser suspends the AudioContext (tab backgrounded, etc.), `context.resume()` should be called before playing. Handle this gracefully — if resume fails, skip the sound silently.

### 4.4 Classic Rule Set (NRS)
Under NRS rules: hold is disabled, hard drop is disabled, T-spins effectively never happen. The sound module doesn't need special handling — these events simply won't be triggered by the caller.

### 4.5 Multiple Rapid Holds
Hold can only be used once per piece drop (`holdUsedThisDrop`), so rapid hold spam is already prevented by the engine.

### 4.6 Level Up on Line Clear
A line clear can trigger a level up in the same lock cycle. The game loop should detect both and emit both sound events. The sounds overlap briefly, which is acceptable.
