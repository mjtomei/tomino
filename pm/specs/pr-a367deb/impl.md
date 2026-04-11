# Spec: RuleSet types, presets, and game mode definitions

## Requirements

### 1. `RuleSet` interface (in `packages/shared/src/engine/types.ts`)
Define the `RuleSet` interface exactly as specified in the plan (`plans/01-core-tetris.md` and `pm/plans/plan-48e829d.md`):
- `name: string`
- `rotationSystem: "srs" | "nrs"`
- `lockDelay: number` (ms, 0 = instant)
- `lockResets: number` (max resets, 0 = none)
- `holdEnabled: boolean`
- `hardDropEnabled: boolean`
- `ghostEnabled: boolean`
- `randomizer: "7bag" | "pure-random"`
- `scoringSystem: "guideline" | "nes"`
- `gravityCurve: "guideline" | "nes"`
- `das: number` (ms)
- `arr: number` (ms, 0 = instant)
- `sdf: number` (soft drop factor, Infinity = instant)
- `previewCount: number` (0-6)

RuleSet must be plain data (serializable to JSON) per design constraint. Note: `sdf: Infinity` is not JSON-serializable; this is acceptable since the plan explicitly includes it, and serialization can use a sentinel value at the transport layer.

### 2. `GameMode` type (in `packages/shared/src/engine/types.ts`)
Define a `GameMode` type covering Marathon, Sprint, Ultra, and Zen. Each mode needs:
- A discriminant/name field
- Start/end conditions as described in the plan table
- Display metadata (what stats to show)

### 3. Preset factory functions (in `packages/shared/src/engine/rulesets.ts`)
- `classicRuleSet(): RuleSet` — returns Classic preset values from plan table
- `modernRuleSet(): RuleSet` — returns Modern preset values from plan table
- `customRuleSet(base: RuleSet, overrides: Partial<RuleSet>): RuleSet` — merges overrides onto base

### 4. Game mode definitions (in `packages/shared/src/engine/rulesets.ts`)
Define the four game mode configurations with their conditions.

### 5. Tests (in `packages/shared/src/engine/rulesets.test.ts`)
- Presets return valid RuleSets with all fields populated
- Custom rule set overrides work (partial overrides apply, base values preserved)
- Game mode definitions have correct conditions

### 6. Exports (in `packages/shared/src/index.ts`)
Add exports for the new types and functions so other packages can consume them.

## Implicit Requirements

1. **File location**: The plan says `src/engine/types.ts` but the monorepo structure places shared code in `packages/shared/src/`. The `engine/` subdirectory needs to be created under `packages/shared/src/` (currently only a `.gitkeep` exists under `packages/client/src/engine/`). The types belong in `shared` since they'll be used by both client and server.

2. **Style consistency**: Follow the existing patterns in `handicap-types.ts` and `skill-types.ts` — JSDoc comments on interfaces and fields, explicit export of types.

3. **TypeScript config**: `packages/shared/tsconfig.json` uses `nodenext` module resolution, so imports must use `.js` extensions.

4. **Test location**: Existing shared tests are in `packages/shared/src/__tests__/`. However, the PR spec says `src/engine/rulesets.test.ts`. Since the vitest config includes `src/**/*.test.ts`, co-locating the test file with the source in `src/engine/` will work.

5. **No logic constraint**: The PR description says "All pure types and data — no logic." The factory functions and `customRuleSet` helper are data constructors, not game logic. This is consistent with the plan's intent.

## Ambiguities

### 1. GameMode representation
The plan mentions both "GameMode enum" (PR description) and a more structured type with conditions. 
**Resolution**: Use a string union type for the mode name (`"marathon" | "sprint" | "ultra" | "zen"`) plus a `GameModeConfig` interface that pairs the mode name with its conditions. This matches the plan's architecture where GameMode controls start/end conditions and display, while being serializable.

### 2. Game mode conditions — what types?
The plan describes conditions like "game over on top-out", "clear 40 lines", "3-minute time limit", "no gravity, no game over". These are descriptions, not code.
**Resolution**: Model conditions as data properties on a `GameModeConfig` interface:
- `goal: "none" | "lines" | "time" | "level"` — what ends the game (besides top-out)
- `goalValue: number | null` — target value (40 lines, 180000ms, level cap, or null for none)
- `gravity: boolean` — whether gravity applies (false for Zen)
- `topOutEndsGame: boolean` — whether top-out triggers game over (false for Zen)
- `displayStats: string[]` — which stats to show in the UI

### 3. Marathon level cap
Plan says "Optional level cap (e.g., level 15)". 
**Resolution**: Marathon's default config will have no level cap (`goalValue: null`). The level cap can be added via `customRuleSet` or a separate config mechanism later.

### 4. Where to export game mode definitions
**Resolution**: Export from `rulesets.ts` alongside the preset functions, and re-export from `index.ts`.

## Edge Cases

1. **`customRuleSet` with `name` override**: Users should be able to override the name. The merge is a simple spread so this works naturally.

2. **`sdf: Infinity`**: The Modern preset uses `Infinity` for instant soft drop. This is valid TypeScript but not JSON-serializable. Since the plan explicitly specifies it and serialization is a future concern, we'll use `Infinity` directly.

3. **`previewCount` bounds**: The plan says 0-6. We won't enforce bounds in the type (it's `number`), keeping types pure data. Validation belongs in the engine.
