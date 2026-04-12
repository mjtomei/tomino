# Adaptive Music Engine — Implementation Spec

## Requirements (grounded in code)

1. **Layered procedural music, Web Audio API** — new module
   `packages/client/src/audio/music-engine.ts`. Must NOT touch the existing
   `SoundManager` (`audio/sounds.ts`) — they coexist, sharing no state.
   Engine owns its own `AudioContext` (lazily created like `SoundManager`,
   for autoplay compliance).

2. **Multiple concurrent layers (bass/rhythm/arp/lead)** — driven by
   `Genre.layers` from `atmosphere/genres.ts`. The existing `Layer` type
   already carries `instrument`, `pattern` (16-step), and
   `activationThreshold`. We reinterpret `activationThreshold` (currently
   level-based) as an intensity threshold via `threshold / 10` so that
   (a) existing genre data keeps working and (b) intensity in [0..1] maps
   sensibly (ambient bells threshold 3 → intensity ≥ 0.3).

3. **Layers activate/deactivate based on atmosphere intensity** — computed
   in a pure helper `music-layers.ts::isLayerActive(layer, intensity)`.
   Engine keeps a per-layer target gain (0 or layer gain) and crossfades to
   the target over `CROSSFADE_MS` (400 ms) using
   `gainNode.gain.linearRampToValueAtTime`.

4. **Tempo driven by game level** — pure helper
   `computeTempo(baseTempo, level)` in `music-layers.ts`. Formula:
   `baseTempo * (1 + (max(level,1) - 1) * 0.04)` clamped to `[baseTempo, baseTempo*2]`.

5. **Danger shifts the musical mode** — pure helper
   `shiftScale(scaleDegrees, danger)` that, when `danger > 0.6`, flattens
   the 3rd (lowers it 1 semitone); when `danger > 0.85`, additionally
   flattens the 5th (diminished flavor). For scales without a 3rd
   (pentatonic/chromatic), no-op.

6. **Line clears trigger harmonic accents** — `MusicEngine.onEvent(ev)`
   reacts to `AtmosphereEvent`s. `lineClear` / `tetris` fire a chord stab
   (root+3rd+5th of current scale) at the next step boundary.

7. **Combos add rhythmic fills** — when `momentum > 0.5`, enable a "fill"
   overlay: doubles the rhythm layer's pattern density (adds hits on
   off-beats).

8. **Level-up triggers a brief key change/flourish** — `levelUp` event
   temporarily raises root note by 7 semitones (a fifth) for 2 steps, then
   returns.

9. **Crossfade between states smoothly** — any layer activation,
   tempo change, or mode swap uses linear ramps on gain or scheduled at
   the next bar boundary (never discontinuous).

10. **Genre config determines all parameters** — `setGenre(genreId)`
    fetches via `getGenre()` from `atmosphere/genres.ts`. Switching genre
    crossfades all layers out, swaps genre, and ramps new layers in.

11. **Mute/volume control** — `setMuted(bool)`, `setVolume(0..1)`. Engine
    maintains a master gain node. Mute instantly drops master to 0 (short
    ramp, 30 ms to avoid click).

12. **React hook `use-music.ts`** — `MusicProvider` creates engine,
    `useMusic()` returns controls, and a `useMusicSync()` internal effect
    subscribes to `useAtmosphere()` state + `useTheme().genreId` + latest
    game level, feeding them to the engine each render.

13. **Wire into `GameShell.tsx`** — both `SoloGameShell` and
    `MultiplayerGameShell` already call `useAtmosphereUpdater`. Add a
    `useMusicSync(gameState.scoring.level, atmosphereState)` call
    alongside, and ensure `<MusicProvider>` wraps the app next to
    `<AtmosphereProvider>` in `main.tsx` / root.

14. **Unit tests** (`music-engine.test.ts`, `music-layers.test.ts`):
    - `isLayerActive` threshold behavior
    - `computeTempo` range + monotonicity
    - `shiftScale` danger thresholds
    - `noteFromDegree` scale indexing with octaves
    - `crossfadeGain` schedules a linear ramp
    - Engine creates AudioContext lazily; `start()` schedules first step
    - Engine reacts to `lineClear` event with accent scheduling
    - Mute drops master gain; unmute restores

15. **E2E test** (`e2e/music-engine.spec.ts`) — expose
    `window.__music__` (dev/test only, like `__atmosphere__`) with
    `{ tempo, activeLayers, scaleRoot, muted, stepCount }`. Test:
    1. Start solo game, `stepCount` advances.
    2. Change genre via theme selector, verify tempo/active layers shift.
    3. Toggle mute, verify `muted` flag.

## Implicit Requirements

- Engine must be **idempotent** on multiple `start()` calls and
  defensive against being called before `AudioContext` is available
  (e.g. in tests without `AudioContext` globally installed).
- Must not throw if `Genre.layers` is empty (fallback: silence).
- Must survive `AudioContext` being `suspended` (resume on first
  gesture).
- Respect existing test mock pattern (`installMockAudioContext`); reuse
  the same mock shape in new tests.
- No global side effects on import (important for SSR safety / tests).
- Scheduler must not leak intervals when provider unmounts or engine
  `dispose()`s.

## Ambiguities (resolved)

- **Scheduling approach**: Web Audio lookahead (classic Chris Wilson
  pattern) vs. simple `setInterval`. **Resolution**: Use a 25 ms
  `setInterval` with a 100 ms schedule-ahead window, reading
  `ctx.currentTime` — keeps tests simple (timer can be faked) while
  providing sample-accurate note timing.
- **Layer count per genre**: Existing genres define only 2 layers.
  Requirements mention up to 4 (bass/rhythm/arp/lead). **Resolution**:
  work with whatever the genre defines; engine treats `layers` as
  ordered. Genre data can be expanded later.
- **Danger mode shift reversibility**: does danger falling back below
  threshold restore the bright scale? **Resolution**: yes, shift is
  re-computed each step from current danger.
- **Initial root of scale accents**: uses `rootNote` from genre
  (current MIDI).
- **Where does volume persist**: localStorage key
  `tetris.music.volume` and `tetris.music.muted`, matching the theme
  persistence pattern.

## Edge Cases

- **Pausing the game**: music should pause (stop scheduling) but keep
  audio context alive. Hook to `gameState.status === "paused"`.
- **Game over**: stop music with a fade-out, not a hard cut.
- **Genre switch mid-note**: let in-flight notes finish; only new steps
  use the new genre.
- **Rapid intensity oscillation**: crossfade prevents chatter because
  target gain ramps are additive over time.
- **Tests without AudioContext**: engine methods all no-op gracefully
  (`ensureContext()` returns null).
- **Multiple music providers**: provider is module-scoped; only one
  engine instance exists per page.
