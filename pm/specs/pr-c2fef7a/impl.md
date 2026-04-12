# Implementation Spec: Post-game Rating Updates

## Requirements

### R1: Collect PerformanceMetrics for each player at game end

**Grounded in:** `MetricsCollector` (`server/src/metrics-collector.ts`) produces `PerformanceMetrics` snapshots (`shared/src/skill-types.ts:10-20`). Currently, `MetricsCollector` is **not integrated** into `GameSession` — it exists as a standalone class. The session tracks `PlayerStats` (lines sent/received, pieces, survival, score, lines cleared) but not `PerformanceMetrics` (APM, PPS, T-spins, max combo).

**Implementation:** Integrate `MetricsCollector` per player into `GameSession`:
- Create one `MetricsCollector` per player when engines start (`startGameplay()`)
- Call `recordAction()` in `applyInput()` 
- Call `recordPieceLock()` when piece lock events fire
- Call `end()` when a player tops out or game ends
- Expose `getMetricsSnapshots(): Record<PlayerId, PerformanceMetrics>` on `GameSession`

### R2: Run Glicko-2 algorithm to update ratings after game end

**Grounded in:** `updateRatings(winner, loser, config?)` in `server/src/rating-algorithm.ts:115-186`. Takes two `PlayerProfile`s, returns updated profiles. Pure function.

**Implementation:** In the post-game handler:
1. Look up each player's `PlayerProfile` from `SkillStore` (or create a default for new players)
2. For each loser, call `updateRatings(winnerProfile, loserProfile)`
3. The winner's profile accumulates updates across all pairwise calls

### R3: Store updated profiles and match results via SkillStore

**Grounded in:** `SkillStore` interface (`shared/src/skill-types.ts:38-44`) with `upsertPlayer()` and `saveMatchResult()`. Implemented by `JsonSkillStore` (`server/src/skill-store.ts`). Instantiated in `server/src/index.ts:12`.

**Implementation:**
- After each pairwise `updateRatings()` call, `upsertPlayer()` both profiles
- Create a `MatchResult` per loser with: gameId, winner username, loser username, metrics, timestamp, ratingChanges
- `saveMatchResult()` for each

### R4: Broadcast updated ratings to all players in the room

**Grounded in:** `broadcastToRoom(roomId, msg)` callback on `GameSession` (`game-session.ts:41`). New message type needed.

**Implementation:**
- Add `S2C_RatingUpdate` message to `protocol.ts` containing per-player rating changes (before/after rating, new rank)
- Broadcast after all rating updates complete
- Include this in `ServerMessage` union and `SERVER_MESSAGE_TYPES` array

### R5: Pairwise updates for 3+ player games (winner vs each loser)

**Grounded in:** `MatchResult` comment: "A 3+ player game produces multiple MatchResults — one per loser" (`shared/src/skill-types.ts:23`). `updateRatings()` is inherently pairwise.

**Implementation:**
- `checkForWinner()` in `GameSession` (`game-session.ts:759-808`) identifies the winner and all losers via `eliminations` array
- Create one `MatchResult` per loser, all sharing the same `gameId`
- Apply `updateRatings()` sequentially so the winner's profile reflects cumulative updates
- Each loser is updated independently against the winner's latest profile

### R6: Disconnected players count as losses

**Grounded in:** `forfeitPlayer()` calls `eliminatePlayer()` (`game-session.ts`), which adds the player to the `eliminations` array and calls `checkForWinner()`. The disconnect handler (`game-handlers.ts:219-256`) calls `forfeitPlayer()` after reconnect timeout.

**Implementation:** No special handling needed — disconnected players are already eliminated and appear in `eliminations`. They'll be treated as losers in the pairwise update. Their `MetricsCollector.end()` should be called at forfeit time so metrics reflect the game up to disconnect.

### R7: No rating update when handicap is disabled

**Grounded in:** `HandicapSettings.intensity` can be `"off"` (`handicap-types.ts:29`). Room stores `handicapSettings` (`types.ts:78`). `startGameCountdown()` checks `settings.intensity !== "off"` (`game-handlers.ts:80`).

**Implementation:** The post-game handler checks whether the room had handicap enabled (intensity !== "off"). If handicap was off, skip all rating updates. This check uses room state or a flag passed through the session config.

**Resolution note:** "Handicap disabled" means `handicapSettings` is undefined or `intensity === "off"`. The handicap system is the feature that uses ratings — when it's off, the room is casual/unranked.

## Implicit Requirements

### IR1: SkillStore must be accessible from the post-game hook

The `SkillStore` is created in `index.ts` but not passed to `createWebSocketServer()` or `GameSession`. It must be threaded through to where the post-game handler runs. Options:
- **Chosen approach:** Add an `onGameEnd` callback to `GameSessionConfig` (parallel to existing `onGameStarted`/`onCancelled`). The callback receives game result data. Wire the callback in `startGameCountdown()` where we have access to the store and room state.

### IR2: Player name ↔ ID mapping

`MatchResult` and `PlayerProfile` use **usernames** (strings), but `GameSession` tracks players by **PlayerId**. `GameSession.playerNames` (line 118) maps PlayerId → name. The post-game handler must translate between the two.

### IR3: Default profiles for new players

Players who haven't played ranked before won't have a `PlayerProfile` in the store. The handler must create default profiles using `GLICKO_CONFIG` defaults (rating: 1500, RD: 350, volatility: 0.06, gamesPlayed: 0).

### IR4: Room rating display update

`RoomState.playerRatings` (`types.ts:84`) stores ratings for lobby display. After updating profiles, the handler should update `playerRatings` in the room store so the lobby shows current ratings when players return to the waiting room.

### IR5: GameSession cleanup after post-game

The post-game handler fires during `checkForWinner()`. The session cleanup (`removeGameSession()`, `store.setStatus()`) that currently happens in the disconnect handler must also happen on normal game end. Currently the only cleanup path is in `handleGameDisconnect()` — normal wins don't clean up.

### IR6: Piece lock event forwarding to MetricsCollector

`MetricsCollector.recordPieceLock()` needs a `PieceLockEvent` (linesCleared, tSpin, combo). The `PlayerEngine` must emit or expose this data on each piece lock. Need to check how piece locks are detected in the engine tick loop.

## Ambiguities

### A1: Winner profile accumulation in multi-player games

**Ambiguity:** When the winner plays against 3 losers, should the winner's profile be updated cumulatively (winner vs loser1, then updated-winner vs loser2, etc.) or should all pairwise updates use the winner's original profile?

**Resolution:** Cumulative updates. Each match is a separate rated game in Glicko-2 terms. The winner's profile improves after beating each opponent, and the next pairwise calc uses the updated profile. This means the winner's `gamesPlayed` increments by N (number of losers), and their rating reflects N matches. This matches how Glicko-2 is designed — each rating period can contain multiple matches.

### A2: MetricsCollector integration depth

**Ambiguity:** The task says "collects the final PerformanceMetrics for each player." `MetricsCollector` needs piece lock events and action counts that `GameSession` currently doesn't track at that granularity. How deep should the integration go?

**Resolution:** Integrate `MetricsCollector` into `GameSession` with:
- Action recording in `applyInput()` — one call per valid input
- Piece lock detection via engine snapshot diffing (piecesPlaced counter change between ticks)
- For T-spin and combo data, check what the engine exposes. If the engine doesn't expose T-spin/combo per lock event, use a simplified collector that only tracks what's available (APM, PPS, linesCleared from snapshot diffs). Mark T-spins and combo as 0 until the engine exposes them.

### A3: gameId generation

**Ambiguity:** `MatchResult.gameId` needs a unique identifier. What format?

**Resolution:** Use `${roomId}-${timestamp}` or a UUID. Since all MatchResults from the same game share the gameId, generate it once per game end.

### A4: Timing of rating broadcast relative to gameEnd message

**Ambiguity:** Should `ratingUpdate` be sent before or after `gameEnd`?

**Resolution:** After `gameEnd`. The client first processes the game results, then receives rating changes as a follow-up message. This keeps the gameEnd message unchanged and lets clients that don't care about ratings ignore the new message.

## Edge Cases

### E1: Solo game (1 player)

If only one player is in a "game" (e.g., practice mode), there are no losers, so no rating updates should occur. `checkForWinner()` with 1 player should still broadcast `gameEnd` but the post-game handler should skip rating logic when there's only 1 player.

### E2: All players disconnect simultaneously

If all players disconnect at once, `forfeitPlayer()` calls cascade. The last player to be forfeited becomes the "winner." Rating updates should still apply — the last survivor wins.

### E3: Race condition: concurrent game ends and store writes

`JsonSkillStore` uses a write lock (`skill-store.ts:114-120`), so concurrent `upsertPlayer()` calls are serialized. However, if two games end simultaneously and both update the same player, the second write uses stale data. This is acceptable for the JSON store (low concurrency), but the handler should `await` all store operations sequentially per game.

### E4: Player profile exists but with stale data

If a player's profile was created in a previous session, it should be used as-is. `getPlayer()` returns the current profile; `upsertPlayer()` overwrites it. No merge logic needed.

### E5: Room deleted before post-game completes

If the room is deleted (all players leave) before the async rating update finishes, the broadcast will be a no-op (no sockets to send to). The rating updates should still persist to the store regardless of broadcast success.

### E6: Engine doesn't expose T-spin/combo per lock

Need to verify what `PlayerEngine` / `TetrisEngine` exposes. If the engine's `ScoringState` tracks combo and last T-spin type, we can read them after each tick where `piecesPlaced` increments. If not, those metrics will be 0.

## Files to Create/Modify

### New Files
- `packages/server/src/post-game-handler.ts` — Core handler: collect metrics, run Glicko-2, persist, broadcast
- `packages/server/src/__tests__/post-game-handler.test.ts` — Test suite

### Modified Files
- `packages/server/src/game-session.ts` — Add `onGameEnd` callback to config, integrate `MetricsCollector`, call hook from `checkForWinner()`
- `packages/shared/src/protocol.ts` — Add `S2C_RatingUpdate` message type
- `packages/server/src/handlers/game-handlers.ts` — Wire `onGameEnd` callback in `startGameCountdown()`, pass SkillStore
- `packages/server/src/index.ts` — Pass SkillStore to WebSocket server
- `packages/server/src/ws-server.ts` — Accept and forward SkillStore
- `packages/shared/src/messages.ts` — Add `ratingUpdate` to validation (if needed)
