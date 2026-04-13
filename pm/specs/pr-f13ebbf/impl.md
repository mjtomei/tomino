# pr-f13ebbf — Rename Tetris → Tomino (impl spec)

Three coordinated renames in one PR: project identity, genre term ("tetris" → "quad" for the 4-line clear), and piece-color palettes (Guideline → three selectable in-house palettes, default Synthwave).

## 1. Requirements (grounded)

### Part 1 — Project identity (Tetris → Tomino)

- **Root & workspace package names**
  - `package.json:2` — `"name": "tetris"` → `"tomino"`
  - `packages/shared/package.json:2` — `@tetris/shared` → `@tomino/shared`
  - `packages/server/package.json:2,14` — name + `@tetris/shared` dep
  - `packages/client/package.json:2,13` — name + `@tetris/shared` dep
  - Regenerate `package-lock.json` via `npm install`
- **Import rewrites** — all `from "@tetris/shared"` → `from "@tomino/shared"` across ~60 client/server/test files (identified by Grep pass)
- **`TetrisEngine` class → `TominoEngine`**
  - Declaration: `packages/shared/src/engine/engine.ts:2,102`
  - Re-export: `packages/shared/src/index.ts:148`, plus JSDoc at `state-snapshot.ts:25`
  - Tests: `packages/shared/src/engine/engine.test.ts:2,16,17,26,31,46,757`
  - Client usages: `packages/client/src/ui/GameShell.tsx:4,192,526,597,692,724`, `packages/client/src/engine/engine-proxy.ts:16,37,45,46`
  - Server: `packages/server/src/player-engine.ts:2,19,54,60`, plus `__tests__/player-engine.test.ts:234` comment
- **README.md** — `:1` title `# Tetris` → `# Tomino`; `:3` first paragraph "Multiplayer Tetris with adaptive…" → "Multiplayer block-stacking game with adaptive…"; keep `- **Core Tetris** — SRS rotation` bullet if present but rename its label to "Core engine" (SRS stays).
- **index.html** — `packages/client/index.html:6` `<title>Tetris</title>` → `Tomino`
- **Server log** — `packages/server/src/index.ts:27` — "Tetris server listening…" → "Tomino server listening…"
- **Lobby UI** — `packages/client/src/ui/Lobby.tsx:28` and `PlayerNameInput.tsx:21` — `<h1>Tetris</h1>` → `Tomino`
- **Lobby test** — `packages/client/src/__tests__/Lobby.test.tsx:21` — assertion
- **localStorage keys** (acceptable to break existing users' saved settings)
  - `audio/use-music.ts:29,30` — `tetris.music.*` → `tomino.music.*`
  - `atmosphere/settings-context.ts:39,40,41` — `tetris.sfx.volume`, `tetris.master.muted`, `tetris.effects.intensity` → `tomino.*`
  - `atmosphere/theme-context.tsx:13,14` — `tetris.theme`, `tetris.genre` → `tomino.*`
  - `net/lobby-client.ts:118` — `tetris-player-name` → `tomino-player-name`
  - `__tests__/App.test.tsx:17` and `SettingsPanel.test.tsx:58,68,75,82,89` — update assertions
- **Docs prose** — `docs/pm-demo-narrative.md`, `notes.txt`, `plans/*.md`: "multiplayer Tetris game" → "multiplayer Tomino game" where describing *our project*. Keep external references ("Tetris Guideline", "NES Tetris", "Tetris 99", `tetris.wiki/*`, SRS references) intact.

### Part 2 — Genre term "tetris" → "quad" (4-line clear)

- **Event discriminator `"tetris"` → `"quad"`**
  - Type unions:
    - `atmosphere/types.ts:41` — AtmosphereEvent union `| "tetris"` → `| "quad"`
    - `atmosphere/board-effects.ts:17` — `{ type: "tetris"; rows }` → `"quad"`
    - `atmosphere/opponent-reactions.ts:12` — `OpponentReaction = "tetris" | …` → `"quad"`
  - Emissions: `board-effects.ts:105`, `atmosphere-engine.ts:147`, `menu-atmosphere.ts:128`, `audio/use-music.ts:204`, `opponent-reactions.ts:45` (client-root path discovered)
  - Consumption/dispatch/switches: `board-effects.ts:179`, `event-bursts.ts:95`, `ScreenEffects.tsx:110`, `audio/music-engine.ts:276`, `opponent-reactions.ts:94`
  - Method rename: `board-effects.ts:245` `spawnTetrisBurst` → `spawnQuadBurst` (+ call site `:181`)
  - Tests: `atmosphere/__tests__/board-effects.test.ts:144`, `atmosphere-engine.test.ts:95`, `menu-atmosphere.test.ts:88`, `opponent-reactions.test.ts:46,53,106,112`, `screen-effects.test.ts:76`, `event-bursts.test.ts:57`
  - Variables: `audio/sounds.test.ts:293` `tetrisCount` → `quadCount`; test description `:284` "plays more oscillators for tetris (4 lines)" → "for quad"
  - UI key maps: `ui/OpponentBoard.tsx:43` `tetris: "#ffd84a"` → `quad`; `ui/GameMultiplayer.tsx:115,118` rank map/prefs key `tetris` → `quad`
- **Comments referencing "tetris" as 4-line clear** — update prose in `screen-effects.ts:18,87`, `board-effects.ts:4`, `GameShell.tsx:347,659`, `atmosphere-engine.ts:6`, `music-engine.ts:13` → say "quad" (4-line)
- **Shared engine test/doc prose** — `board.test.ts:271`, `garbage.test.ts:72`, engine comments awarding "800 × level for a tetris", b2b comments, etc. — update to "quad"
- **Reference tables** — `shared/src/__tests__/reference-guideline.test.ts:65,231,290` `action: "Tetris"`/`"PC Tetris"` → `"Quad"`/`"PC Quad"`; `reference-nes.test.ts:76` `label: "Tetris"` → `"Quad"`

### Part 3 — Piece color palettes

- **New file** `packages/client/src/ui/palettes.ts` — exactly per task spec: `PaletteId` union ("synthwave"|"jewel"|"muted"), `Palette` interface, `PALETTES` dict with the 21 listed hex values, `DEFAULT_PALETTE_ID = "synthwave"`, `getPalette(id)` fallback helper. Import `PieceType` from `@tomino/shared`.
- **Refactor** `packages/client/src/ui/colors.ts`
  - Remove `/** Tetris Guideline piece colors. */` and `PIECE_COLORS`
  - Keep `darken`, `lighten`, `BOARD_BG`, `PANEL_BG`
  - Migrate every `PIECE_COLORS` importer to read `palette.colors` from the theme context
- **Theme context** `atmosphere/theme-context.tsx`
  - Add `PALETTE_STORAGE_KEY = "tomino.palette"`
  - Add `paletteId: string`, `palette: Palette`, `setPaletteId: (id: string) => void` to `ThemeContextValue`
  - `useState` initializer reads from localStorage, validated against `PALETTES`, defaulting to `DEFAULT_PALETTE_ID`
  - `useEffect` persists; `setPaletteId` guards against invalid ids
- **Settings UI** — add palette selector to `packages/client/src/ui/SettingsPanel.tsx` matching existing theme/genre selector style; include a 7-color preview row.
- **Tests**
  - New `ui/palettes.test.ts` verifying each palette has all 7 piece keys and each value is a 7-char hex (`/^#[0-9A-F]{6}$/i`).
  - `atmosphere/__tests__/theme-context.test.tsx` (or extend existing) asserting paletteId persistence + palette swap.
  - Update any test asserting specific Guideline hex values (e.g. `board-life.test.ts:19` `#00D4D4`) to assert against the current Synthwave palette color or use a palette-provided value.

## 2. Implicit requirements

- Guideline hex strings (`#00D4D4`, `#E6C000`, `#A020D0`, `#00C800`, `#D41400`, `#2020D4`, `#E08000`) must not appear anywhere in the repo after the change (verification grep).
- `@tomino/shared` workspace must resolve — update TS project references / path mappings if `tsconfig.json` or `tsconfig.*.json` hardcodes `@tetris/shared`.
- Tests currently relying on `PIECE_COLORS` as a module export must either import `PALETTES.synthwave.colors` or get colors from theme context — whichever matches call style.
- Renaming `TetrisEngine` must be atomic across shared/client/server in the same commit or TS won't compile.
- `board-effects.ts` method rename `spawnTetrisBurst` → `spawnQuadBurst`: class method, verify no other file references it.
- When replacing localStorage keys, no read-migration is required (per task: "Acceptable that existing users lose their saved settings").

## 3. Ambiguities (resolved)

- **README "Core Tetris" bullet** — task says rename project descriptions but keep spec references. Interpretation: the bullet label refers to our engine, not the spec; rename label, keep SRS/NES mentions within. Resolved: label → "Core engine".
- **`ui/PlayerNameInput.tsx` not explicitly listed in task** — it shows "Tetris" as app title (survey hit). Treat as part of Part 1 Lobby UI rename. Resolved: rename to "Tomino".
- **`ui/OpponentBoard.tsx:43` reaction color map key `tetris`** — this is a reaction-type key, matches `OpponentReaction` union. Resolved: rename to `quad` in step with union rename.
- **`GameMultiplayer.tsx` `tetris: 2` priority weight** — same story, rename to `quad`.
- **`BoardCanvas.test.tsx`** — not found in survey hits; the hardcoded-hex test to update is `atmosphere/__tests__/board-life.test.ts:19` (`const BASE = "#00D4D4"`). Resolved: update that test.
- **`PaletteId` — should it be `string` or the union in context?** Task says `paletteId: string` in context, but validates against `PALETTES` dict. Resolved: follow task literally.
- **Package.json name scope — keep `@tomino/*` or drop scope?** Task explicitly specifies `@tomino/*`. Resolved: keep scope.

## 4. Edge cases

- **`package-lock.json`** contains `@tetris/*` entries; regenerate with `npm install` after package.json edits so lockfile is consistent. Do not hand-edit.
- **TypeScript path aliases**: if `tsconfig.json` / `tsconfig.*.json` declares `"paths": { "@tetris/shared": […] }`, update to `@tomino/shared`. Check before running `npm run build`.
- **External spec preservation**: `shared/src/engine/rotation-srs.ts:2,225` ("Tetris Guideline / SRS"), `targeting.ts:5` ("Tetris 99"), `reference-*.test.ts` spec URLs — leave fully intact.
- **Plan file** `plans/01-core-tetris.md` — filename stays; in-file prose describing *our project* is updatable.
- **`notes.txt`, `docs/pm-demo-narrative.md`** — may contain mixed references; only rewrite sentences describing our project, not sentences citing the Tetris standard.
- **`pm/` directory** — skip entirely (transcripts, historical specs).
- **E2E tests** under `e2e/*.spec.ts` may use `"tetris"` event literals or the app title "Tetris"; update in lockstep.
- **B2B logic / PC bonus** — these are functional rules, not identity; the *labels* in test tables rename, the values and logic stay.
- **Music engine switch** — `music-engine.ts:276` comparing `ev.type === "tetris"` must flip to `"quad"` same commit as emitters to avoid runtime misses.
- **Theme context tests** — existing tests likely spy `localStorage.getItem("tetris.theme")`; update to new keys.
- **Flow/zone detection** may emit a `"tetris"` event; double-check after grep.
