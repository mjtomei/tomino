# PR pr-0f48e4a — Audio and Visual Settings Panel

## Existing state
- `SoundManager` (`packages/client/src/audio/sounds.ts`) has only a `muted` toggle; no volume. Instantiated in `GameShell.tsx` at lines 235 (multiplayer) and 510 (solo). Volume needs to apply to the master gain of each rendered patch.
- `MusicProvider` (`packages/client/src/audio/use-music.ts`) already exposes `volume`, `muted`, and persists to `tetris.music.volume` / `tetris.music.muted`. Settings panel will drive music via `useMusic()`.
- `ThemeProvider` (`packages/client/src/atmosphere/theme-context.tsx`) exposes `themeId`/`genreId` with localStorage persistence under `tetris.theme`/`tetris.genre`.
- An older `ThemeSelector` (in `ui/ThemeSelector.tsx`, used on StartScreen) already gives dropdowns for theme/genre — leave untouched.
- `Overlay.tsx` `PauseOverlay` has RESUME/QUIT only; in solo, pause is triggered by Escape/P in `GameShell.tsx`.
- `Lobby.tsx` has a buttons row with four buttons; new Settings button slots in there.
- Tests: Vitest + React Testing Library. Mocked `AudioContext` pattern already in `sounds.test.ts`.
- E2E: Playwright under `/workspace/e2e/`.

## Requirements (grounded)

1. **SoundManager volume**
   - Add `_volume: number` (default 1) with `get volume()/set volume()` clamped to [0,1].
   - In `renderPatch`, multiply `patch.gain` by `_volume` when building the envelope gain — simplest single-point application. Verify by reading existing `buildEnvelopeGain(ctx, envelope, t, duration, patch.gain)` signature.
   - Unit tests: default volume = 1; setter clamps negatives to 0 and >1 to 1; volume=0 behaves like muted for audible output (patch still renders — the test can assert gain value on envelope).

2. **Settings context** (`atmosphere/settings-context.ts`)
   - New React context providing `{ musicVolume, sfxVolume, masterMuted, effectsIntensity, setMusicVolume, setSfxVolume, setMasterMuted, setEffectsIntensity }`.
   - `effectsIntensity: "off" | "subtle" | "full"`, default `"full"`.
   - `sfxVolume: number` (0–1), default 0.8.
   - `masterMuted: boolean`, default false; applies to BOTH music and sfx (wraps existing music mute + sfx mute).
   - localStorage keys: `tetris.sfx.volume`, `tetris.master.muted`, `tetris.effects.intensity`. Music volume/mute stays in existing `tetris.music.*` keys (avoid data migration).
   - Exported: `SettingsProvider`, `useSettings()`, serialization helpers `readSettings()`/`writeSettings()` for unit testing.
   - Since the task filename is `.ts`, wrap the Provider implementation in `createElement` (as `use-music.ts` does) to avoid JSX in a `.ts` file.

3. **SoundManager ↔ settings wiring**
   - In `GameShell.tsx` (both shells), after creating `SoundManager`, subscribe to `useSettings()` in a `useEffect` to push `volume` and `muted` into the manager. `muted = masterMuted || sfxVolume === 0`. Keep existing genre effect.

4. **MusicProvider ↔ master mute**
   - In the settings context, when `masterMuted` toggles, call `useMusic().setMuted(masterMuted || <prev musicMute>)`. Simpler approach: let `masterMuted` fully override music's own mute by calling `music.setMuted(masterMuted)` whenever it changes. Music's own mute stays available but the settings UI only shows master. This is acceptable because the task says "master mute toggle" (single toggle, no separate music mute). To avoid fighting storage, the settings provider is the only caller of music.setMuted during its lifetime.

5. **SettingsPanel UI** (`ui/SettingsPanel.tsx` + `SettingsPanel.css`)
   - Modal-style overlay with dark background and a panel. Close button (X) + backdrop click + Escape key closes.
   - Controls:
     - Music volume slider (range 0–1 step 0.01), label shows percent.
     - SFX volume slider (same).
     - Master mute checkbox/toggle.
     - Visual effects intensity: segmented radio-like buttons: Off / Subtle / Full.
     - Theme selector: buttons showing each theme with a color-swatch preview derived from `theme.palette`. Click sets.
     - Genre selector: buttons showing name + plays short sfx preview (a single SoundManager `play("lineClear1")`) on hover. Click sets active genre.
   - `data-testid="settings-panel"` and individual testids for each control.
   - Accepts `onClose: () => void`.

6. **Lobby access**
   - Add `onOpenSettings` prop to `Lobby`. Render a 5th button "Settings". App.tsx holds `showSettings` state and renders `<SettingsPanel onClose={…} />` overlayed over current view (or with Lobby still behind it).

7. **In-game (pause) access**
   - Solo-only. Extend `PauseOverlay` with an optional `onOpenSettings` prop and render a SETTINGS button between RESUME and QUIT when provided. Pass from `SoloGameShell` → `Overlay` → `PauseOverlay`. Multiplayer has no pause, so no exposure.
   - Also need `Overlay` to pass through `onOpenSettings`. Add local state in `SoloGameShell` to show/hide the settings overlay on top of the pause overlay.

8. **Effects intensity consumption**
   - Wire `effectsIntensity` to gate expensive visual effects. Minimal viable integration: in `SoloGameShell`/`MultiplayerGameShell`, multiply `atmosphereIntensity` passed to `<BoardCanvas>` by a factor: `off→0, subtle→0.5, full→1`. Particle system & event bursts stay on unless `off` (skip `boardEffectsRef.current?.onFrame` calls when off, or clear system). For the scope of this PR, applying the multiplier to the BoardCanvas intensity prop is sufficient — we don't rewire every effect module. Document this in a comment if needed.

9. **Tests**
   - `sounds.test.ts`: add cases for volume default, setter clamping, volume application (assert last created gain's `.gain.value` reflects `patch.gain * volume` OR that `setValueAtTime` was called with the product).
   - New `atmosphere/settings-context.test.tsx`: serialization roundtrip, default values, provider reads initial from localStorage, setter writes to localStorage.
   - New `ui/SettingsPanel.test.tsx`: renders controls; slider changes call context setters; theme/genre click calls setters; close button calls `onClose`.
   - New `e2e/settings-panel.spec.ts`: open from lobby, change music volume, close, reopen, value persisted (new page load).

## Implicit requirements
- `settings-context` must not throw if `useMusic`/`useTheme` aren't available — but it's only instantiated inside the existing provider tree, so they're always available. It should sit INSIDE both providers in `main.tsx`.
- Panel and test ids must not collide with existing `theme-selector` test id.
- Keyboard Escape for closing panel must not conflict with pause Escape. When settings panel is open on top of pause, Escape closes the panel only (stopPropagation at window level via `capture`), and panel captures escape first.
- SoundManager volume change must take effect on subsequent `play()` calls without requiring reconstruction — achieved since we look up `_volume` inside `renderPatch`.

## Ambiguities (resolved)
- *"Master mute" vs existing music mute*: Resolved — master mute overrides both; music's own mute checkbox is not surfaced in the new panel. Existing `tetris.music.muted` key becomes unused for the user-facing toggle but we leave the key intact for now to avoid migration churn.
- *Genre preview on hover*: Resolved — hover triggers a single `SoundManager.play("lineClear1")` using a disposable SoundManager constructed with that genre id; rate-limited by hover behavior. Avoids bringing up the full music engine for a preview.
- *Scope of effects-intensity enforcement*: Resolved — apply a multiplier to atmosphere intensity passed to `BoardCanvas` and skip particle updates when `off`. Not rewriting every effect consumer.
- *Where to mount SettingsPanel in App*: Resolved — render in `AppInner` as an overlay when `showSettings` is true, on top of whatever view is active. Keeps logic centralized and available across views.

## Edge cases
- Rapid slider drag → many localStorage writes. Accept; volume slider writes on change are fine (max ~100/s, negligible).
- Volume slider while muted → value updates but no audible change; unmuting restores to slider value. Correct by construction.
- Opening settings during pause, then unpausing while open → should close panel OR leave open. Decision: close on unpause isn't required; leaving open is fine since the user explicitly opened it.
- SSR / no-window → use existing guard pattern from `theme-context.tsx` and `use-music.ts`.
- E2E test's localStorage persistence across reloads — use `page.reload()` within the same context.

## File list
- `packages/client/src/audio/sounds.ts` (edit — add volume)
- `packages/client/src/audio/sounds.test.ts` (edit — add volume tests)
- `packages/client/src/atmosphere/settings-context.ts` (new)
- `packages/client/src/atmosphere/settings-context.test.tsx` (new)
- `packages/client/src/ui/SettingsPanel.tsx` (new)
- `packages/client/src/ui/SettingsPanel.css` (new)
- `packages/client/src/ui/SettingsPanel.test.tsx` (new)
- `packages/client/src/ui/Lobby.tsx` (edit — add button + prop)
- `packages/client/src/ui/Overlay.tsx` (edit — add settings button to pause overlay)
- `packages/client/src/ui/GameShell.tsx` (edit — wire sfx volume/mute, wire pause→settings, effects-intensity multiplier)
- `packages/client/src/App.tsx` (edit — wire lobby→settings, render panel)
- `packages/client/src/main.tsx` (edit — wrap with SettingsProvider inside Music/Theme)
- `e2e/settings-panel.spec.ts` (new)
