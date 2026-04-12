# Spec: Theme and Genre Config System (pr-d687e7a)

## Requirements
1. **Theme config** (`packages/client/src/atmosphere/themes.ts`):
   - Define `Theme` type: palette (background gradient stops, particle colors, accent colors), particle style (shape/size/trail), background geometry (pattern/density/movement), board accent colors.
   - Ship 4 themes: "Deep Ocean", "Neon City", "Void", "Aurora".
   - Export `THEMES` record + `DEFAULT_THEME_ID`.
2. **Genre config** (`packages/client/src/atmosphere/genres.ts`):
   - Define `Genre` type: musical scale/mode (note degrees), base tempo (BPM), instrument timbres (osc type + envelope ADSR), rhythm patterns, layer activation thresholds.
   - Ship 4 genres: "Ambient", "Synthwave", "Minimal Techno", "Chiptune".
   - Export `GENRES` + `DEFAULT_GENRE_ID`.
3. **Theme context** (`packages/client/src/atmosphere/theme-context.ts`(x)):
   - React context with current theme/genre IDs + setters. Provider + `useTheme()` hook.
   - Persist selection to `localStorage`.
4. **Settings UI** (`packages/client/src/ui/ThemeSelector.tsx`):
   - Dropdowns for theme + genre, controlled by context. Mount in `StartScreen` or menu.
5. **Tests**:
   - Unit: validation (all themes/genres have required fields, IDs match keys, defaults exist).
   - Unit: theme context switch test using RTL.
   - E2E: `e2e/theme-selector.spec.ts` — selector changes selection and persists across reload.

## Implicit Requirements
- `theme-context.ts` must be `.tsx` since JSX is needed; task says `.ts` but React context provider requires JSX. Will use `.tsx`.
- Provider must wrap `App` in `main.tsx`.
- Existing `colors.ts` board/panel constants should become theme-driven, but to minimize blast radius we keep colors.ts as fallback and expose theme values via context for future use. Board rendering can remain unchanged for this PR (theme selection scaffolding + selector UI is primary deliverable).
- localStorage keys namespaced (`tetris.theme`, `tetris.genre`).
- Validation helper (`validateTheme`, `validateGenre`) checks structural invariants for tests.

## Ambiguities (resolved)
- **Scope of visual application**: The task focuses on the *config system + selector*. Actually re-rendering board/particles with theme is left to followup PRs per the plan. Resolution: add context + selector + save selection; wire theme values through but don't rewrite BoardCanvas.
- **File extension**: `theme-context.ts` → use `.tsx` for JSX provider.
- **E2E**: StartScreen surfaces the ThemeSelector so test can verify before entering a game.

## Edge Cases
- Invalid saved localStorage value → fall back to default.
- SSR: no `window` at module load — guard localStorage reads.
- Duplicate mounts: context default values must work without provider for tests.
