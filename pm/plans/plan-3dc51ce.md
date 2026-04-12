# UX Polish — Reactive Atmosphere & Adaptive Music

## Vision

Inspired by Tetris Effect's synesthesia: visuals and music respond to game state,
creating a feedback loop that pulls the player deeper into flow. Not random
decoration, but an abstract artistic representation of what's happening — the
board height becomes a visual tide, combos ripple outward, garbage pressure
darkens the sky, opponent eliminations spark across the field. In multiplayer,
the visual atmosphere is a living portrait of the entire match.

Players can choose from different visual themes and music genres, each offering
a distinct aesthetic personality while remaining reactive to the same atmosphere
signals.

## Goals

1. **Immersive atmosphere** — the game should feel alive. Background, particles,
   and screen effects all respond to game state in a coherent way.
2. **Adaptive music** — procedurally generated music layers that shift with
   intensity, danger, and game events. Tempo, key, and instrumentation reflect
   the current mood.
3. **Abstract artistic expression** — visual feedback for game events (T-spins,
   combos, line clears, garbage) should be abstract and beautiful, not text
   callouts or HUD numerals.
4. **Player-controlled variety** — selectable board themes (color palettes,
   particle styles, background moods) and music genres (ambient, synthwave,
   minimal techno, etc.) so players can personalize the experience.
5. **Multiplayer resonance** — in multiplayer, the atmosphere should reflect
   not just local state but the broader match: opponent actions, garbage
   exchanges, and eliminations ripple through the visual and audio landscape.

## Key design decisions

- **No audio files** — everything procedural via Web Audio API, matching the
  existing SFX approach. Keeps the build simple and the repo light.
- **Canvas overlay for effects** — a dedicated canvas layer behind/over the
  board for particles, background, and screen effects. Keeps the board renderer
  clean and the effect system independent.
- **Atmosphere as a single source of truth** — a reactive engine computes
  continuous "mood" signals (intensity, danger, momentum) from game state.
  All visual and audio systems read from this, ensuring coherence.
- **Theme/genre system** — themes define visual parameters (palette, particle
  shapes, background geometry), genres define musical parameters (scale, timbre,
  rhythm pattern). Both are data-driven configs, making new ones easy to add.
- **Procedural generation throughout** — both music and visuals are generated
  at runtime. No asset files, no loading screens, infinite variety.

## Constraints

- Must not interfere with gameplay input responsiveness
- Must work in both solo and multiplayer modes
- Background visuals must not make the board hard to read
- No external dependencies (audio files, heavy libraries)

## Architecture overview

```
GameState / MultiplayerState
        |
        v
  AtmosphereEngine  <-- reads game signals, outputs mood
   |          |
   v          v
 Visuals    Music
   |          |
   +-- BackgroundCanvas (geometry, color field)
   +-- ParticleSystem (event-driven bursts)
   +-- ScreenEffects (vignette, shake, flash)
   +-- BoardEffects (line clear, lock, trail)
   |
   +-- MusicEngine (layered procedural audio)
   +-- SFX integration (existing SoundManager)

  ThemeConfig ---> palette, shapes, particle styles
  GenreConfig ---> scale, timbre, rhythm, layers
```

## PRs

### PR: Atmosphere engine
- **description**: Reactive state machine that reads game signals (board height, level, speed, combo, b2b, garbage pressure, game status) and outputs continuous atmosphere values: intensity (0-1), danger (0-1), momentum (combo/b2b streak energy), and discrete event triggers (lineClear, tSpin, tetris, levelUp, garbageReceived). Provides a React context/hook (`useAtmosphere`) that other systems subscribe to. Includes multiplayer signal inputs (opponent count, eliminations, garbage sent/received). This is the foundational data layer with no visual or audio output.
- **tests**: Unit tests for atmosphere computation: intensity rises with level/speed, danger rises with board height, momentum tracks combo/b2b streaks, event triggers fire correctly, multiplayer signals integrate properly. Snapshot tests for known game states mapping to expected atmosphere values.
- **e2e**: Expose the atmosphere state on `window.__atmosphere__` in dev/test builds. Playwright test drives a solo game through a scripted sequence (stack to mid-height → Tetris → stack to near-top → clear), polls `window.__atmosphere__` at each step, and asserts intensity/danger/momentum values cross expected thresholds. No visual verification needed for this PR (no output yet) — this test locks in the data-layer contract for downstream PRs.
- **files**: `packages/client/src/atmosphere/atmosphere-engine.ts`, `packages/client/src/atmosphere/types.ts`, `packages/client/src/atmosphere/use-atmosphere.ts`, `e2e/atmosphere-engine.spec.ts`, tests
- **depends_on**:

---

### PR: Theme and genre config system
- **description**: Data-driven configuration system for visual themes and music genres. A theme defines: color palette (background gradient stops, particle colors, accent colors), particle style (shape, size range, trail behavior), background geometry (pattern type, density, movement), board accent colors. A genre defines: musical scale/mode, base tempo, instrument timbres (oscillator types + envelope shapes), rhythm patterns, layer activation thresholds. Ships with 3-4 initial themes (e.g., "Deep Ocean", "Neon City", "Void", "Aurora") and 3-4 genres (e.g., "Ambient", "Synthwave", "Minimal Techno", "Chiptune"). Includes a React context for current theme/genre selection and a settings UI for choosing them.
- **tests**: Unit tests for theme/genre config validation and defaults. Tests for theme switching at runtime.
- **e2e**: Playwright test opens the theme selector in the lobby, takes a screenshot of each theme's preview swatch (baseline images), selects each theme in turn, and verifies the root container's computed background/accent colors match the theme config via `page.evaluate(() => getComputedStyle(...))`. Screenshot comparison catches regressions in theme preview rendering.
- **files**: `packages/client/src/atmosphere/themes.ts`, `packages/client/src/atmosphere/genres.ts`, `packages/client/src/atmosphere/theme-context.ts`, `packages/client/src/ui/ThemeSelector.tsx`, `e2e/theme-selector.spec.ts`, tests
- **depends_on**:

---

### PR: Background canvas layer
- **description**: A full-viewport canvas that renders behind the game board, driven by the atmosphere engine and current theme. Renders animated geometric elements (floating shapes, grid patterns, flowing lines, gradient fields) that shift in color, speed, density, and behavior based on atmosphere intensity and danger. Low intensity = sparse, slow, cool-toned. High intensity = dense, fast, warm/bright. Danger = color shift toward reds/darks, agitated movement. The background is an abstract landscape that mirrors game state without depicting it literally. Integrated into GameShell and the lobby/menu screens. **Human testing needed**: visual aesthetics, performance feel, theme variety look-and-feel.
- **tests**: Unit tests for background geometry computation given atmosphere values. Integration test that the canvas mounts and renders without errors.
- **e2e**: Playwright test records video of a scripted solo game progressing from low-intensity (empty board, slow) to high-intensity (near top-out). Screenshots captured at three checkpoints: calm start, mid-game, danger state. Canvas pixel sampling via `page.evaluate(() => canvas.getContext('2d').getImageData(...))` extracts average hue/brightness from the background canvas at each checkpoint, asserting that brightness/color warmth increases with intensity and warps toward the danger palette near top-out. Also screenshots each theme at identical game state to verify theme differentiation.
- **files**: `packages/client/src/atmosphere/BackgroundCanvas.tsx`, `packages/client/src/atmosphere/background-renderers.ts`, `packages/client/src/ui/GameShell.tsx`, `packages/client/src/ui/GameShell.css`, `e2e/background-atmosphere.spec.ts`, tests
- **depends_on**: Atmosphere engine, Theme and genre config system

---

### PR: Particle system
- **description**: A canvas-based particle engine that spawns, updates, and renders particles. Supports configurable particle types: shape (circle, square, diamond, line, star), color (from theme palette), lifetime, velocity, gravity, fade, scale curves, trail rendering. Particles are triggered by atmosphere events — not on a timer. Provides an imperative API (`emit(config, position, count)`) and a React component that overlays the game area. Does not render anything on its own — just the engine and rendering infrastructure. **Human testing needed**: particle visual quality, feel of different particle shapes.
- **tests**: Unit tests for particle lifecycle (spawn, update, expire), velocity/gravity integration, bounds culling. Tests for emission from event triggers.
- **e2e**: Playwright test mounts a test harness page that exposes `window.__particles.emit(config, x, y, count)`. Test triggers each particle shape type, records video of the emission, and screenshots at t=0 (spawn burst), t=150ms (in-flight), and t=500ms (near expiry) to verify lifetime curve. Canvas pixel sampling verifies particles actually render (non-background pixels appear within expected region) and fade out (pixel count decreases over time). Also verifies particle canvas auto-clears when all particles have expired.
- **files**: `packages/client/src/atmosphere/particle-system.ts`, `packages/client/src/atmosphere/ParticleCanvas.tsx`, `e2e/particle-system.spec.ts`, tests
- **depends_on**: Theme and genre config system

---

### PR: Board visual effects — line clear and lock
- **description**: Visual effects rendered on or near the board for game events. Line clear: rows flash white and dissolve into particles (using the particle system) that scatter outward. Piece lock: brief pulse/glow at the locked position. Hard drop: vertical trail of fading cells from drop start to landing. Tetris (4-line clear): amplified version — screen-wide flash, more particles, color burst. All effects use theme colors. These are rendered on the particle/effects canvas layer, not by modifying BoardCanvas internals. **Human testing needed**: timing feel relative to gameplay, visual clarity, effect doesn't obscure next piece placement.
- **tests**: Unit tests for effect trigger detection (diffing game state for line clears, locks, hard drops). Tests that effects spawn correct particle configurations.
- **e2e**: Playwright test uses a solo game with a deterministic seed that produces a queue enabling a single, double, triple, and Tetris clear in sequence. Video recording captures the entire sequence. Screenshots taken 50ms after each line clear fires, verifying pixel-level evidence of the flash (bright pixels on cleared rows) and particles (non-background pixels outside the board). Separate test for hard drop: screenshot taken mid-trail to verify the vertical streak is visible. Separate test for lock pulse: screenshot at lock moment to verify glow.
- **files**: `packages/client/src/atmosphere/board-effects.ts`, `packages/client/src/ui/GameShell.tsx`, `e2e/board-effects.spec.ts`, tests
- **depends_on**: Particle system, Atmosphere engine

---

### PR: Event burst visuals
- **description**: Abstract visual responses to significant game events, rendered as full-screen or board-area effects. T-spin: radial starburst emanating from the T-piece position. Combo streak: escalating concentric ripples — each successive combo in a streak produces a larger, more colorful ripple. Back-to-back: horizontal color wave that sweeps across the screen. Level up: brief chromatic shift of the entire background. These are artistic, abstract — no text, no numbers. The visual language communicates "something impressive happened" through motion and color alone. Uses theme palette. **Human testing needed**: whether events feel distinct from each other, whether they feel rewarding, visual clarity.
- **tests**: Unit tests for event detection from atmosphere signals. Tests for burst geometry computation (ripple radius over time, starburst ray count).
- **e2e**: Playwright test uses a test harness that programmatically triggers each burst type (`window.__bursts.trigger('tSpin', x, y)` etc.). Video recording captures the full animation cycle of each burst. Screenshots at t=0, t=200ms, and t=500ms verify burst geometry progression (e.g., ripple radius grows, starburst rays appear then fade). Canvas pixel comparison asserts that each burst type produces visually distinct signatures (e.g., T-spin has radial symmetry, B2B wave has horizontal motion). Also tests a scripted combo streak sequence showing escalation across successive ripples.
- **files**: `packages/client/src/atmosphere/event-bursts.ts`, `packages/client/src/atmosphere/EventBurstCanvas.tsx`, `e2e/event-bursts.spec.ts`, tests
- **depends_on**: Particle system, Atmosphere engine, Theme and genre config system

---

### PR: Screen effects — vignette, shake, flash
- **description**: Screen-level post-processing effects applied as a CSS/canvas overlay on the entire game view. Danger vignette: dark reddish vignette creeps in from edges as board height increases — controlled by atmosphere danger signal. Screen shake: brief displacement on garbage received or hard drop (subtle, 2-4px). Screen flash: brief white flash on line clears, scaled by line count. All effects driven by atmosphere, themed by current theme's accent colors. Applied via a wrapper component around the game layout. **Human testing needed**: shake magnitude feel, vignette not obscuring board edges, flash not causing discomfort.
- **tests**: Unit tests for effect parameter computation from atmosphere (vignette opacity from danger, shake magnitude from event type). Tests for auto-decay of transient effects.
- **e2e**: Playwright test records video of a solo game stacked high to verify vignette appears as danger rises — screenshots at low (empty), medium (half), and high (near top) board states compared via edge-pixel brightness to confirm vignette darkening. For shake: test tracks the game container's bounding rect across frames during a hard drop via `page.evaluate`, asserting position oscillates then settles. For flash: screenshot within 30ms of a line clear confirms a brightness spike in the overlay layer.
- **files**: `packages/client/src/atmosphere/screen-effects.ts`, `packages/client/src/atmosphere/ScreenEffects.tsx`, `packages/client/src/ui/GameShell.tsx`, `e2e/screen-effects.spec.ts`, tests
- **depends_on**: Atmosphere engine, Theme and genre config system

---

### PR: Adaptive music engine
- **description**: A layered procedural music system built on Web Audio API. Architecture: multiple concurrent "layers" (bass drone, rhythm/percussion, arpeggiated melody, lead/pad), each generated procedurally from the current genre config. Layers activate/deactivate based on atmosphere intensity thresholds — calm games have just a bass drone, intense moments bring in all layers. Tempo is driven by game speed/level. Danger shifts the musical mode (e.g., major to minor, or to diminished). Line clears trigger harmonic accents. Combos add rhythmic fills. Level-up triggers a brief key change or flourish. The engine crossfades between states smoothly. Genre config determines all musical parameters (scale, timbre, rhythm patterns). Includes a mute/volume control. **Human testing needed**: musical quality, genre variety, transitions between intensity levels, whether music feels connected to gameplay.
- **tests**: Unit tests for layer activation thresholds, tempo calculation from game speed, scale/mode selection from atmosphere. Tests for note generation from genre config. Tests for crossfade timing.
- **e2e**: Playwright test runs with `--use-fake-ui-for-media-stream` and captures the WebAudio graph via an exposed `window.__music.introspect()` that returns active layer count, current tempo, current scale/mode, and master gain. Test scripts a solo game through low→high intensity progression and asserts layer count increases, tempo rises, and mode shifts from major to minor as danger rises. Additionally, uses Playwright's `page.video()` with audio capture enabled (via `context.grantPermissions(['microphone'])` + tab audio routing) to record a short gameplay session per genre, producing a webm video file per genre for human A/B review on PR. Also tests mute/volume — after setting volume to 0, introspection should show master gain near zero.
- **files**: `packages/client/src/audio/music-engine.ts`, `packages/client/src/audio/music-layers.ts`, `packages/client/src/audio/use-music.ts`, `e2e/music-engine.spec.ts`, tests
- **depends_on**: Atmosphere engine, Theme and genre config system

---

### PR: Multiplayer atmosphere integration
- **description**: Extends the atmosphere engine to incorporate multiplayer-specific signals as abstract visual phenomena. Garbage incoming: approaching particles/shapes drift toward the board from the direction of the attacker's opponent board — abstract "pressure" visualization. Opponent elimination: a distant visual "shockwave" ripple. Garbage sent by local player: outward burst of energy toward targeted opponent. Overall match intensity (number of active players, aggregate garbage flying) modulates background density and color saturation. All effects are abstract — you feel the battle's energy without needing to read numbers. **Human testing needed**: whether multiplayer atmosphere feels meaningfully different from solo, whether opponent events are noticeable but not distracting.
- **tests**: Unit tests for multiplayer signal processing in atmosphere engine. Tests for garbage direction computation (which opponent). Tests for match-wide intensity aggregation.
- **e2e**: Playwright test spins up a 3-player multiplayer match (using existing multiplayer-3player helpers) and records video from each player's perspective. Scripted scenario: player A sends garbage to player B, player B receives it, player C is eliminated. Screenshots captured for each player at each event to verify: (1) sender sees outward burst toward target direction, (2) receiver sees incoming pressure particles approaching from correct direction, (3) all players see the elimination shockwave. Canvas pixel comparison verifies particle trajectories originate/terminate from the expected opponent-board positions.
- **files**: `packages/client/src/atmosphere/multiplayer-effects.ts`, `packages/client/src/atmosphere/atmosphere-engine.ts`, `packages/client/src/ui/GameMultiplayer.tsx`, `e2e/multiplayer-atmosphere.spec.ts`, tests
- **depends_on**: Atmosphere engine, Particle system, Background canvas layer

---

### PR: Menu and lobby atmosphere
- **description**: Extends the background canvas and ambient music to non-game screens: lobby, waiting room, start screen, results. These screens get a calm, ambient version of the current theme's background — slow-moving geometry, muted colors, gentle particles. The music engine plays a low-intensity ambient loop on menu screens. Waiting room background subtly shifts as more players join (the room "fills up" visually). Game results screen reflects the match outcome — winner gets a triumphant color burst, others get a softer resolved state. Smooth visual transitions between screens (fade/crossfade the background canvas rather than hard-cutting). **Human testing needed**: lobby feel, transition smoothness, whether ambient audio is pleasant or annoying at low volumes.
- **tests**: Unit tests for menu atmosphere state computation. Tests for player-count-driven waiting room intensity. Integration test for screen transition triggers.
- **e2e**: Playwright test records video of a full flow: lobby → waiting room (1 player, then 2, then 3) → countdown → game → results (winner view and loser view). Screenshots at each screen verify background is present and distinct from the in-game version (ambient, lower density). Waiting-room screenshots at each player count verify intensity progression via canvas pixel sampling. `window.__music.introspect()` queried at each screen to verify appropriate layer count and tempo (lowest on menu, rising into game). Screen transition test captures frames every 50ms during a transition and verifies the background doesn't hard-cut (no single-frame pixel deltas above threshold).
- **files**: `packages/client/src/atmosphere/menu-atmosphere.ts`, `packages/client/src/ui/Lobby.tsx`, `packages/client/src/ui/WaitingRoom.tsx`, `packages/client/src/ui/GameResults.tsx`, `packages/client/src/App.tsx`, `e2e/menu-atmosphere.spec.ts`, tests
- **depends_on**: Background canvas layer, Adaptive music engine

---

### PR: Audio and visual settings panel
- **description**: A settings panel accessible from the lobby and in-game (pause overlay in solo mode). Controls: music volume slider, SFX volume slider, master mute toggle, visual effects intensity (off / subtle / full), theme selector (with preview swatches), genre selector (with short audio preview on hover). Settings persist to localStorage. The existing SoundManager gains volume control (currently just mute toggle). Settings are exposed via React context so all atmosphere consumers can read them. **Human testing needed**: settings persistence across sessions, volume slider feel, theme/genre preview behavior.
- **tests**: Unit tests for settings serialization/deserialization, default values, volume application to audio nodes. Tests for settings context provider.
- **e2e**: Playwright test opens the settings panel and screenshots its full layout. Interacts with each control: drags volume sliders and asserts `window.__music.introspect()` reflects the new gain, toggles mute and verifies master gain drops, selects each theme and screenshots the lobby background change, selects each genre and verifies music introspection shows updated scale/tempo. Tests localStorage persistence: sets settings, reloads page, verifies settings are restored via both localStorage read and re-querying the audio/visual state. Visual effects intensity test screenshots the in-game view at each level (off/subtle/full) for comparison.
- **files**: `packages/client/src/ui/SettingsPanel.tsx`, `packages/client/src/ui/SettingsPanel.css`, `packages/client/src/atmosphere/settings-context.ts`, `packages/client/src/audio/sounds.ts`, `packages/client/src/ui/Lobby.tsx`, `e2e/settings-panel.spec.ts`, tests
- **depends_on**: Theme and genre config system, Adaptive music engine

---

### PR: Flow state detection and Zone mode
- **description**: Extends the atmosphere engine to detect sustained skilled play — a rolling window of recent performance (clears-per-minute, clean placements, combo maintenance, no misdrops, low max board height) that when high enough for a sustained duration triggers a "flow" atmosphere state. In flow state, the background opens up dramatically, colors saturate, particles intensify, the music hits a sustained groove with extra harmonic layers, and a subtle visual "aura" appears around the board. Breaking the flow (topping out, missing a clear, big misdrop) smoothly exits the state. This is Tetris-Effect's "Zone" reimagined as an emergent reward for the player getting into rhythm. **Human testing needed**: detection sensitivity (not too easy, not too hard to trigger), how it feels to enter and exit, whether it feels rewarding without being disruptive.
- **tests**: Unit tests for flow detection windowing (rolling metrics, entry/exit thresholds), hysteresis to prevent flicker, that flow state modulates atmosphere output correctly. Snapshot tests for game state sequences that should and should not trigger flow.
- **e2e**: Playwright test uses a deterministic seed and scripted optimal play sequence to reliably trigger flow state. Video recording captures the transition into and out of flow. Screenshots before, during, and after flow state show visual differentiation (background saturation, aura presence). `window.__atmosphere__.flow` exposed for direct state assertion. Music introspection verifies the groove layer activates on flow entry and deactivates on exit. A second test script breaks the flow with a deliberate misdrop and verifies smooth exit (no single-frame cut).
- **files**: `packages/client/src/atmosphere/flow-detection.ts`, `packages/client/src/atmosphere/atmosphere-engine.ts`, `e2e/flow-state.spec.ts`, tests
- **depends_on**: Atmosphere engine, Background canvas layer, Adaptive music engine

---

### PR: Piece animation — spawn, movement, rotation
- **description**: Replaces instant piece rendering with smoothly interpolated animation. Spawn: new pieces fade in at their spawn position over ~100ms rather than popping in. Lateral movement: pieces tween between cell positions over a short duration (~40ms) instead of teleporting. Rotation: pieces rotate with a brief easing animation. Hard drop already has a trail effect (from board effects PR); this PR adds the piece-level animation. Soft drop feels smoother. The gameplay logic (engine) remains cell-snapped — this is purely a render-layer interpolation. Must never lag behind actual game state (animations catch up immediately on next input). **Human testing needed**: animation duration feel (too slow = sluggish, too fast = pointless), rotation easing shape, that animations never interfere with responsiveness of DAS/ARR at high speeds.
- **tests**: Unit tests for interpolation state tracking, that animations are skipped or compressed when inputs arrive faster than animation duration, that animated render position matches logical position at rest.
- **e2e**: Playwright test records video of scripted piece actions: spawn, single left move, single rotation, sustained lateral hold (DAS). Screenshots at fine time intervals (every 16ms) during a single movement capture intermediate interpolated positions, verifying pixel-level smoothness (piece appears in non-integer cell positions mid-animation). A stress test with rapid DAS confirms animations collapse and piece position tracks the actual game state at high speeds (no render lag). Responsiveness test measures time from keydown to first pixel change of piece position and asserts it's within one frame.
- **files**: `packages/client/src/ui/BoardCanvas.tsx`, `packages/client/src/ui/piece-animation.ts`, `e2e/piece-animation.spec.ts`, tests
- **depends_on**:

---

### PR: Board life — idle animations
- **description**: Subtle ambient animations on the board itself to make it feel alive even during pauses between actions. Placed cells get a very faint shimmer (slow color cycle through nearby hues, ~2% amplitude), occasional specular "glints" that sweep across cells, and grid lines that pulse very gently with the atmosphere intensity. Cell highlights breathe slowly. Everything is subtle — the board should feel alive but not distract from piece placement. Theme palette drives the shimmer colors. **Human testing needed**: whether animation amplitude is subtle enough (not distracting), whether the board feels alive or busy, whether glints occur too often.
- **tests**: Unit tests for shimmer computation from time + atmosphere, glint scheduling, that baseline cell colors are preserved (animation is additive). Tests for theme-driven color variation.
- **e2e**: Playwright test sets up a paused solo game with placed cells, then records a 3-second video of the static board. Sequential screenshots at 100ms intervals verify pixel-level changes frame-to-frame (proving shimmer is active) while staying within a bounded amplitude (asserting the change per frame is small — subtle rather than flashy). A separate test confirms a glint event by watching for a brief brightness spike on a specific cell within a timeout window.
- **files**: `packages/client/src/ui/BoardCanvas.tsx`, `packages/client/src/atmosphere/board-life.ts`, `e2e/board-life.spec.ts`, tests
- **depends_on**: Theme and genre config system, Atmosphere engine

---

### PR: Theme- and genre-aware SFX
- **description**: Enriches the existing SoundManager so that SFX sounds match the current theme/genre rather than being generic oscillator tones. Each genre config gains an SFX profile: oscillator types, filter parameters, envelope shapes, and effect chains (reverb, delay, bitcrusher for chiptune, etc.) for each sound event. Chiptune genre produces 8-bit bleeps; synthwave produces filtered analog-style hits; ambient produces soft bells; minimal techno produces crisp percussive clicks. The audio system also gains richer synthesis — current SFX are single oscillators; this PR introduces multi-oscillator layering, filter envelopes, and basic effects. Existing SoundEvent API is preserved; only the implementation changes. **Human testing needed**: sound quality across all genres, whether each genre's SFX feels cohesive with its music, no jarring audio artifacts.
- **tests**: Unit tests for SFX profile lookup by genre, filter/envelope parameter application, that all SoundEvent types have a config in every genre. Tests for backward compatibility with the default profile when no genre is set.
- **e2e**: Playwright test exposes `window.__sfx.playAndCapture(event)` which plays a sound event into an OfflineAudioContext and returns the rendered PCM buffer as a Float32Array. Test iterates through every (genre × SoundEvent) combination, captures the buffer, and saves a WAV artifact per combination for human review. Assertions: buffer is non-silent, buffer differs between genres for the same event (proving profile is applied), no clipping. Also tests an in-game scenario with audio graph introspection to verify the active SFX profile switches when genre is changed mid-game.
- **files**: `packages/client/src/audio/sounds.ts`, `packages/client/src/audio/sfx-profiles.ts`, `packages/client/src/audio/synth-helpers.ts`, `e2e/sfx-profiles.spec.ts`, tests
- **depends_on**: Theme and genre config system

---

### PR: Multiplayer emotes and opponent reactions
- **description**: Social expressiveness for multiplayer matches. Players can trigger quick emotes (a small set: thumbs up, fire, wave, gg — rendered as abstract glyphs or particle bursts, not text) via a keybind or button that appears briefly over the sender's opponent board from the receiver's perspective. Additionally, opponent boards get automatic visual pulses on notable events: a bright ring when they clear a Tetris, a red flash when they take heavy garbage, a flourish on elimination. These reactions make multiplayer feel like playing with people rather than against silent boards. Emotes are sent via the existing WebSocket protocol (new message type). **Human testing needed**: emote triggering feel, opponent reaction visibility without distraction from own play, protocol round-trip latency.
- **tests**: Unit tests for emote message serialization and protocol handling. Unit tests for opponent event detection (Tetris clear, heavy garbage, elimination). Integration tests for emote delivery via socket.
- **e2e**: Playwright test uses the multiplayer-3player harness with two browser contexts. Player A triggers each emote in turn; Player B's page records video and takes screenshots showing the emote appearing over Player A's opponent board position. Canvas pixel sampling at the opponent board region confirms emote visual is rendered on B's view. Round-trip timing measured by timestamping emote send and first pixel change on receiver. Separate scripted scenario triggers a Tetris and heavy-garbage event on Player A; Player B's screenshots verify the automatic reaction pulses (bright ring, red flash) are rendered on Player A's opponent board from B's perspective.
- **files**: `packages/shared/src/protocol.ts`, `packages/client/src/net/lobby-client.ts`, `packages/server/src/room-handlers.ts`, `packages/client/src/ui/OpponentBoard.tsx`, `packages/client/src/ui/EmotePicker.tsx`, `packages/client/src/atmosphere/opponent-reactions.ts`, `e2e/emotes-reactions.spec.ts`, tests
- **depends_on**: Particle system, Theme and genre config system
