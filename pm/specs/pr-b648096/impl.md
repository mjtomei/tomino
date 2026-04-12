# pr-b648096 — Menu and lobby atmosphere

## Requirements (grounded)

1. **Menu/lobby/waiting/results get ambient atmosphere**
   - `BackgroundCanvas` (mounted once in `App.tsx`) currently reads
     `useAtmosphere()` which is driven only by the game loop via
     `useAtmosphereUpdater` from `GameShell`. Off-game, state stays at
     `INITIAL_ATMOSPHERE_STATE` (all zeros) → essentially a dead background.
   - New `menu-atmosphere.ts` derives an `AtmosphereState`-shaped object
     from the current lobby view + room + game end data.
   - `BackgroundCanvas` accepts an optional `override?: AtmosphereState`
     prop. When provided, the canvas renders from the override (with a
     crossfade). `App.tsx` computes the override for non-game views and
     passes it down.

2. **Calm ambient look on non-game screens**
   - Intensity ≈ 0.15, danger = 0, momentum ≈ 0.05 → low density, slow
     motion via existing `computeBackgroundParams`. No code changes to
     `background-renderers.ts` needed.

3. **Waiting room "fills up"**
   - `computeWaitingRoomIntensity(playerCount, maxPlayers)` scales from
     0.15 (first player) up to ~0.45 (room full). Pure function; unit
     tested.

4. **Game results reflects match outcome**
   - Winner: intensity 0.55, momentum 0.7, danger 0 — "triumphant".
   - Non-winner: intensity 0.2, momentum 0.1 — "softer resolved state".
   - Winner also emits a synthetic `tetris` event on first mount so the
     existing music accent fires as a single color burst.

5. **Smooth transitions between screens**
   - `BackgroundCanvas` crossfades `BackgroundParams` over 600 ms when
     the override changes (interpolating density, speed, warmth,
     agitation, gradient, elementColors). The render loop already runs
     each RAF tick — we store `from`/`to`/`startedAt` refs.

6. **Ambient music on menu screens**
   - `MusicEngine.setAmbient(ambient: boolean)` — new flag; when true,
     master gain is multiplied by `AMBIENT_GAIN = 0.35`, applied in
     `applyMasterGain`.
   - New `useMenuMusic(view)` hook in `use-music.ts`: when `view` is
     `menu`/`joining`/`waiting`/`results`, calls `engine.setAmbient(true)`,
     `engine.start()`, and `engine.sync(1, lowIntensityState)` on an
     interval so the engine stays alive. On `playing`/`countdown`, calls
     `setAmbient(false)` and `stop()` (GameShell's `useMusicSync` then
     takes over).
   - Low-intensity synthetic state matches menu-atmosphere state so only
     the base drone layer plays.

7. **Tests**
   - `menu-atmosphere.test.ts` — state computation, waiting-room
     intensity curve, winner/loser results.
   - `BackgroundCanvas` already has a test file — add a mount test for
     the `override` prop path (without validating raster output).
   - `e2e/menu-atmosphere.spec.ts` — on name-input → menu → waiting
     transition, `window.__atmosphere__` stays usable; also verify the
     background canvas remains attached across views (transition trigger
     integration).

## Implicit requirements

- Override must not mutate the real atmosphere state (game state is
  untouched). The real state still advances once a game begins; the
  canvas simply ignores the override when `override` is undefined.
- Ambient music must not clobber user volume/mute settings — use a
  separate multiplier that layers onto `_volume`.
- `useMenuMusic` only runs ambient on views listed above; during
  `countdown`/`playing` the game-shell hook owns the engine.
- Crossfade must degrade gracefully if either side lacks gradient stops.

## Ambiguities (resolved)

- **Ambient loop content**: no new musical material — reuse the base
  layer of the current genre, fed a synthetic low-intensity state.
  Existing `isLayerActive` ensures only the lowest-threshold layer plays.
- **Results burst**: a one-time `tetris` event magnitude=4 for the
  winner leverages the existing `playAccent` harmonic stab — no new
  sound code needed.
- **Transition duration**: 600 ms fade. Matches the feel of the
  existing `CROSSFADE_MS` ≈ 800 used in music, slightly snappier for
  visuals.
- **Ambient attenuation**: 0.35 multiplier — low enough not to annoy,
  still audible at default 0.8 volume.

## Edge cases

- View can switch directly `playing` → `results` (game end) → `menu`
  (back to lobby). Each transition triggers one crossfade. The winner
  synthetic event fires once per results mount.
- Room can be empty momentarily during join errors — guard against
  `room.players.length === 0` in waiting-room intensity (min floor).
- MusicEngine's `setAmbient` must be safe to call before the
  AudioContext exists (the flag is stored; `applyMasterGain` early-exits
  if no context).
- `useMenuMusic` unmount: leave `stop()` + `setAmbient(false)` so
  navigating to game is clean.
