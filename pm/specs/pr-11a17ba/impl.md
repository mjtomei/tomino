# Spec: Theme- and genre-aware SFX (pr-11a17ba)

## Requirements

1. **SFX profiles per genre** — Each of the 4 genres defined in
   `packages/client/src/atmosphere/genres.ts` (`ambient`, `synthwave`,
   `minimal-techno`, `chiptune`) gains an SFX profile describing how each of
   the 12 `SoundEvent`s (in `packages/client/src/audio/sounds.ts`) is
   synthesized: oscillator types, frequencies/ramps, filter parameters,
   envelope, effect chain.

2. **Richer synthesis primitives** — New `synth-helpers.ts` module adds:
   multi-oscillator layering (detuned layers, octave doubles), filter
   envelopes (`BiquadFilterNode` with time-varying frequency), and effect
   chains (feedback delay, simple bitcrusher via `WaveShaperNode`).

3. **SoundManager integration** — `SoundManager` accepts a genre id
   (constructor arg and/or `setGenre(id)`). `play(event)` looks up the
   active genre's profile and renders it using the synth helpers. The
   existing `SoundEvent` union and `play`/`muted`/`dispose` API are
   preserved (existing tests in `sounds.test.ts` continue to pass).

4. **Genre wiring in GameShell** — `GameShell.tsx` (both Solo and
   Multiplayer shells) reads `genreId` from `useTheme()` and passes it to
   `SoundManager`; when the genre changes, the manager is updated.

5. **Default profile fallback** — If no genre is set or an unknown genre is
   passed, `SoundManager` uses a default profile (the current generic
   sound). `sfxProfiles.ts` exports a `DEFAULT_SFX_PROFILE` usable without
   any genre context.

6. **Unit tests** — Add tests covering: profile lookup by genre, that
   every `SoundEvent` has a config in every genre profile, filter/envelope
   parameter application (inspect the mocked nodes), backward compat when
   no genre is set.

7. **E2E test** — `e2e/sfx-profiles.spec.ts` verifies switching themes in
   the ThemeSelector UI doesn't error, game plays normally, and sound
   events fire (we can't listen to actual audio but can verify the code
   path is exercised and the app renders).

## Files

- `packages/client/src/audio/sfx-profiles.ts` — profile data + types
- `packages/client/src/audio/synth-helpers.ts` — multi-osc / filter env / effects
- `packages/client/src/audio/sounds.ts` — rewritten to dispatch via profiles
- `packages/client/src/audio/sounds.test.ts` — existing + new tests
- `packages/client/src/audio/sfx-profiles.test.ts` — profile validation tests
- `packages/client/src/ui/GameShell.tsx` — wire `useTheme().genreId`
- `e2e/sfx-profiles.spec.ts` — smoke test across genres

## Implicit Requirements

- The existing mock-based sounds test still uses `createOscillator` and
  `createGain`; the mock must be extended for `createBiquadFilter`,
  `createDelay`, `createWaveShaper` so that profile rendering doesn't
  throw. Tests that count oscillators must still pass (we'll keep the
  existing "plays oscillator(s)" assertion — each profile produces
  ≥1 oscillator per event).
- Effects creation must be guarded — use `typeof` checks so missing
  `createWaveShaper`/`createDelay` on a mock context gracefully degrades.
- Keep CPU modest: event-driven SFX are one-shot; reuse no persistent
  nodes across plays.

## Ambiguities (resolved)

- **How to pass the genre to SoundManager**: constructor optional arg +
  `setGenreId(id)` setter, so GameShell can both initialize and react to
  theme changes without recreating the manager.
- **Effects scope**: reverb is expensive to implement well; use a short
  feedback delay as an approximation for synthwave/ambient. Chiptune gets
  a light WaveShaper bitcrusher curve. Minimal techno gets no effects
  (crisp/dry). Ambient gets a longer delay tail.
- **"Filter envelope"**: implemented as `BiquadFilterNode` with
  `frequency.setValueAtTime` + `exponentialRampToValueAtTime` over the
  event duration.

## Edge Cases

- Mocked AudioContext in existing tests lacks new node factories — the
  mock must be extended or the code must null-check factories.
- `SoundEvent` enum must stay exhaustive; any missing entry in a profile
  is caught by a compile-time `Record<SoundEvent, SfxPatch>` type.
- `setGenreId` called before first play: fine — profile is only read
  inside `play()`.
- Unknown genre id: `getSfxProfile(id)` falls back to `DEFAULT_SFX_PROFILE`.
