# Skill Rating Storage Layer — Implementation Spec

## Requirements

### R1: Implement `SkillStore` interface (defined in `packages/shared/src/skill-types.ts:38-44`)
The JSON-backed store must implement all five methods:
- `getPlayer(username: string): Promise<PlayerProfile | null>` — return profile or null if not found
- `upsertPlayer(profile: PlayerProfile): Promise<void>` — insert or update by username
- `getLeaderboard(): Promise<PlayerProfile[]>` — return all players sorted by rating descending
- `getMatchHistory(username: string, limit: number): Promise<MatchResult[]>` — return matches involving `username`, most recent first, capped at `limit`
- `saveMatchResult(result: MatchResult): Promise<void>` — append a match result to history

### R2: JSON file persistence (`data/ratings.json`)
Store all data in a single JSON file at a configurable path (default `data/ratings.json` relative to project root). The file contains both player profiles and match history.

### R3: Atomic write via temp-file-swap
Writes must use write-to-temp-then-rename to prevent corruption from crashes mid-write. Use `fs.writeFile` to a sibling temp file, then `fs.rename` (which is atomic on POSIX).

### R4: Auto-create data file on first run
If the JSON file does not exist when the store is first accessed, create it with an empty initial structure. Also create parent directories if needed.

### R5: Migration path comment for future SQLite upgrade
Include a clear comment in the source explaining how to swap this implementation for SQLite.

### R6: `data/.gitkeep`
Create `data/.gitkeep` so the data directory is tracked by git but `ratings.json` is not committed (it's runtime data).

## Implicit Requirements

### IR1: Thread/concurrent write safety
Since Node.js is single-threaded but async, multiple concurrent `upsertPlayer` or `saveMatchResult` calls could interleave reads and writes. Must serialize write operations (e.g., via an async mutex/queue) to prevent lost updates.

### IR2: Data shape
The JSON file needs a schema that holds both `PlayerProfile[]` and `MatchResult[]`. Proposed shape:
```json
{
  "players": { "username": PlayerProfile },
  "matches": MatchResult[]
}
```
Using a `Record<string, PlayerProfile>` for O(1) lookup by username.

### IR3: Import paths
The store lives in `packages/server/src/skill-store.ts` and imports types from `@tetris/shared`. The project uses ESM (`"type": "module"`) with `nodenext` module resolution, so imports need `.js` extensions.

### IR4: Test isolation
Tests must use temp directories so they don't conflict with each other or with production data. Each test should get its own file path.

### IR5: `.gitignore` for data files
`data/ratings.json` should be gitignored since it's runtime state. Add to `.gitignore` or create `data/.gitignore`.

## Ambiguities

### A1: File path — relative to what?
The task says `data/ratings.json`. Since the monorepo root is `/workspace` and the server package is at `packages/server`, the data directory should live at the project root (`/workspace/data/`) since it's shared runtime state, not package-specific.
**Resolution**: Place at project root. The store constructor accepts a configurable path so tests and production can use different locations.

### A2: Match history — which matches involve a username?
`getMatchHistory(username)` should return matches where the user is either `winner` or `loser`.
**Resolution**: Filter on `result.winner === username || result.loser === username`.

### A3: Leaderboard sorting tiebreaker
When ratings are equal, what's the tiebreaker?
**Resolution**: Sort by rating descending, then by games played descending (more games = more established), then alphabetically by username for determinism.

### A4: Concurrent write mechanism
The task mentions "concurrent write safety (temp-file swap)" but temp-file swap alone doesn't prevent lost updates from interleaved async operations.
**Resolution**: Implement a simple async write lock (promise chain) that serializes all write operations. The temp-file swap handles crash safety; the lock handles async interleaving.

## Edge Cases

### E1: Empty match history
`getMatchHistory` for a user with no matches should return `[]`.

### E2: `getPlayer` for non-existent user
Should return `null`, not throw.

### E3: `upsertPlayer` for new vs existing player
Must handle both insert (new username) and update (existing username) correctly.

### E4: `getLeaderboard` with no players
Should return `[]`.

### E5: `saveMatchResult` creates file if needed
If the data file doesn't exist yet, `saveMatchResult` should auto-create it (same as other methods).

### E6: Corrupted JSON file
If the file exists but contains invalid JSON, the store should handle this gracefully — either throw a clear error or reset to empty state. **Resolution**: Throw a descriptive error; silent data loss is worse than a crash.

### E7: `limit` parameter edge cases
`getMatchHistory(username, 0)` should return `[]`. Negative limit should be treated as 0.

## Test Plan

Tests in `packages/server/src/__tests__/skill-store.test.ts`:

1. **File creation on first access** — store with non-existent path auto-creates the file
2. **CRUD on player profiles** — `upsertPlayer` then `getPlayer` round-trips correctly; update overwrites
3. **`getPlayer` returns null for unknown** — non-existent username returns null
4. **Leaderboard sorting** — multiple players returned sorted by rating desc
5. **Match history append and retrieval** — `saveMatchResult` then `getMatchHistory` returns correct results
6. **Match history limit** — returns at most `limit` results, most recent first
7. **Match history filters by username** — only returns matches involving the queried user
8. **Concurrent write safety** — multiple simultaneous `upsertPlayer` calls all succeed without data loss
9. **Temp-file atomic write** — data file is written atomically (verify by checking no partial writes)
10. **Empty state** — leaderboard and match history return `[]` on fresh store
