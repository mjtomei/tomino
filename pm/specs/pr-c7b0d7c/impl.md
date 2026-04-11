# Spec: Skill Rating Types and Interfaces

## Requirements

### 1. Define `PlayerProfile` type
- Fields: `username` (string), `rating` (number), `ratingDeviation` (number), `volatility` (number), `gamesPlayed` (number)
- File: `packages/shared/src/skill-types.ts`
- Consumed by: server's `SkillStore`, Glicko-2 algorithm, client stats screen
- Per plan: Glicko-2-inspired, keyed by username, no auth

### 2. Define `PerformanceMetrics` type
- Fields: `apm` (actions per minute), `pps` (pieces per second), `linesCleared`, `tSpins`, `combos`
- File: `packages/shared/src/skill-types.ts`
- Used by: server metrics collector, stored with match results

### 3. Define `MatchResult` type
- Fields: `winner` (username), `loser` (username), `metrics` (map of username → PerformanceMetrics snapshot), `timestamp`, `ratingChanges` (optional, for post-game display)
- File: `packages/shared/src/skill-types.ts`
- Stored via SkillStore, used by post-game handler

### 4. Define `SkillStore` interface
- Methods: `getPlayer(username)`, `upsertPlayer(profile)`, `getLeaderboard()`, `getMatchHistory(username, limit)`
- File: `packages/shared/src/skill-types.ts`
- Implemented by server (JSON file MVP), consumed by multiple server modules

### 5. Define `HandicapModifiers` type
- Fields: `garbageMultiplier` (0.0–1.0), `delayModifier` (number), `messinessFactor` (number)
- Per directed sender→receiver pair
- File: `packages/shared/src/handicap-types.ts`

### 6. Define `ModifierMatrix` type
- Map keyed by `${sender}→${receiver}` string to `HandicapModifiers`
- File: `packages/shared/src/handicap-types.ts`

### 7. Define `TargetingBias` type
- Weight distribution across opponents for auto-targeting
- Map of opponent username → weight (number)
- File: `packages/shared/src/handicap-types.ts`

### 8. Define `HandicapSettings` type
- Fields: `intensity` (off/light/standard/heavy), `mode` (boost/symmetric), `targetingBiasStrength` (0.0–1.0), optional knob toggles for delay and messiness
- File: `packages/shared/src/handicap-types.ts`

### 9. Export from shared package
- Both files must be re-exported from `packages/shared/src/index.ts`
- Importable as `@tetris/shared` from both client and server packages

### 10. Tests
- Type compilation checks: verify `tsc -b` succeeds with the new types
- Import verification: ensure types are importable from both client and server code paths

## Implicit Requirements

1. **Module system compatibility**: Shared package uses `nodenext` module resolution. Files must use `.js` extensions in imports (TypeScript nodenext requirement).
2. **No runtime dependencies**: These are pure type definitions — no runtime code, no imports from external packages.
3. **`noUnusedLocals` / `noUnusedParameters`**: The shared tsconfig enforces these. All exports must be used or explicitly exported (re-export from index.ts satisfies this).
4. **`noUncheckedIndexedAccess`**: Map-like types should account for potentially undefined access.
5. **`isolatedModules`**: No const enums (they don't work with isolatedModules). Use regular enums or string literal unions.

## Ambiguities

1. **`MatchResult` for 3+ players**: The plan describes pairwise rating updates for 3+ player games, but `MatchResult` has only `winner` and `loser` fields. **Resolution**: Keep `MatchResult` as a single winner/loser pair. A 3+ player game produces multiple `MatchResult` records (winner vs each loser). Add a `gameId` field to correlate them.

2. **`PerformanceMetrics.combos`**: Could mean max combo, total combos, or combo distribution. **Resolution**: Use `maxCombo` (number) — this is the most common metric in Tetris games and the most meaningful for skill assessment.

3. **`HandicapModifiers` field ranges**: `delayModifier` and `messinessFactor` — are these multipliers (0.0–1.0) or additive values? **Resolution**: Use multipliers (number) for consistency with `garbageMultiplier`. Document in JSDoc. Exact semantics will be defined in the handicap calculator PR.

4. **`SkillStore` return types**: Should methods return `Promise` (async) or synchronous values? **Resolution**: Use `Promise` — the JSON file storage is I/O-bound, and this allows future SQLite migration without interface changes.

5. **`SkillStore.getMatchHistory` return type**: **Resolution**: Returns `Promise<MatchResult[]>`.

6. **`SkillStore.getPlayer` for nonexistent players**: **Resolution**: Returns `Promise<PlayerProfile | null>`.

7. **Rating change tracking in `MatchResult`**: The plan mentions post-game rating display. **Resolution**: Add optional `ratingChanges` field: `Record<string, { before: number; after: number }>`.

## Edge Cases

1. **String template literal key type for ModifierMatrix**: TypeScript template literal types (`${string}→${string}`) work for type safety on the key format. However, a `Map<string, HandicapModifiers>` is more practical at runtime. Use a type alias with a branded string approach or simply `Map<string, HandicapModifiers>` with a helper function type for key construction.

2. **Empty TargetingBias**: In a 2-player game, targeting bias is a no-op. The type should still be valid (single-entry map or empty map). No special handling needed in the type — the consuming code handles this.

3. **HandicapSettings defaults**: The type should make optional fields explicit (`delayEnabled?: boolean`, `messinessEnabled?: boolean`) so consuming code knows what's toggled.
