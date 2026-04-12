# Implementation Spec: Win/Loss Detection and Game-Over Screen

## Status

This feature is **already implemented** across commits `d35afe8..9f32a23` with
multiple review iterations applied. The merge with master (commit `769c0d9`)
integrated targeting, attack-power, and disconnect/reconnect features that
arrived on master while this branch was in progress.

The remaining work is:
1. **Test utility adoption** — The PR review notes require tests to use
   `boardFromAscii` for near-topout board setup and `makeGameState` factories
   instead of ad-hoc alternatives. The current `forceTopOut()` helper uses
   brute-force hard drops rather than `boardFromAscii`.
2. **Verification** — Confirm all tests pass after merge conflict resolution.

---

## 1. Requirements (grounded in codebase)

### R1: Top-out detection triggers elimination
- **Engine layer** (`packages/shared/src/engine/engine.ts`): When `spawnPiece()`
  detects collision at spawn position and `modeConfig.topOutEndsGame = true`,
  sets `status = "gameOver"` with `endReason = "topOut"`.
- **Server layer** (`packages/server/src/game-session.ts`, `handlePlayerGameOver`):
  After each tick, checks `engine.isGameOver` flag. When newly true, calls
  `eliminatePlayer(playerId)`.
- **Broadcast**: `eliminatePlayer()` sends `S2C_GameOver { playerId, placement }`
  to all room members.

### R2: Last-player-standing win condition
- `checkForWinner()` in `game-session.ts` counts active (non-game-over) engines.
- When ≤1 remain: stops tick loop, captures winner stats, builds final
  placements, broadcasts `S2C_GameEnd { winnerId, placements, stats }`,
  transitions session to `"finished"`.

### R3: Results screen with stats
- **Protocol** (`packages/shared/src/protocol.ts`): `PlayerStats` type with
  `linesSent`, `linesReceived`, `piecesPlaced`, `survivalMs`, `score`,
  `linesCleared`.
- **Client** (`packages/client/src/ui/GameResults.tsx`): Renders sorted results
  table with all stats. Highlights winner and local player rows. "Back to Lobby"
  button.
- **Client state** (`packages/client/src/net/lobby-client.ts`): On `gameEnd`
  message, transitions `view` to `"results"` and stores `GameEndData`.

### R4: Placement calculation
- `eliminatePlayer()` calculates: `placement = totalPlayers - eliminations.indexOf(playerId)`.
- First eliminated = last place. Winner (last standing) = 1st place.
- `placementLabel()` renders ordinals (1st, 2nd, 3rd, etc.) with correct
  suffixes for all numbers (fixed in review iteration `3011706`).

### R5: Spectator mode on elimination
- **SpectatorOverlay** (`packages/client/src/ui/SpectatorOverlay.tsx`): Overlays
  game board when `localElimination` is set. Shows "ELIMINATED", placement, and
  "Spectating remaining players..." text.
- Client continues receiving `gameStateSnapshot` messages for remaining players.
- View stays on `"playing"` — only overlay changes. Transitions to `"results"`
  on `gameEnd`.

### R6: Disconnect counts as elimination
- `markDisconnected(playerId, timeoutMs)` freezes engine and broadcasts notice.
- `forfeitPlayer(playerId)` captures stats, deletes engine, calls
  `eliminatePlayer()`. Used when reconnect window expires.
- Stats are captured before engine deletion (fixed in review iteration `3c4ab7c`).

### R7: piecesPlaced tracking
- `ScoringState.piecesPlaced` counter in `packages/shared/src/engine/scoring.ts`.
- Incremented in `TetrisEngine.lockPiece()`.
- Extracted in `engineStateToSnapshot()` → `GameStateSnapshot.piecesPlaced`.
- Captured in `capturePlayerStats()` at elimination time.

---

## 2. Implicit Requirements

### IR1: Stats timing correctness
Stats must be captured at elimination time (not game-end time) to reflect each
player's terminal state accurately. The winner's stats are captured separately
in `checkForWinner()` since they weren't eliminated.

### IR2: Garbage manager and targeting cleanup on elimination
When a player is eliminated, `eliminatePlayer()` must:
- Remove from garbage manager (`garbageManager.removePlayer`)
- Remove from attack power tracker (`attackPower.removePlayer`)
- Update skill bias config (remove rating, rebuild strategy)
- Clean up targeting state (anyone manually targeting the eliminated player
  reverts to "random" strategy)

### IR3: KO attribution
`attributeKO()` uses `lastGarbageSender` map to credit kills. When a player
tops out from garbage, the sender gets a KO recorded in the attack power
tracker.

### IR4: Deterministic elimination ordering
When multiple players top out in the same call sequence (e.g., rapid
`forceTopOut` calls or tick-triggered multi-topout), the `eliminations` array
preserves insertion order for placement calculation.

---

## 3. Ambiguities (all resolved)

### A1: What happens in 1v1 when the last player also tops out?
**Resolution**: `checkForWinner()` handles the ≤1 active players case. If the
winner also topped out, they still get 1st place (last-out wins). This is
covered by test "correct placements when all players top out (last-out wins)".

### A2: Should eliminated players' engines be kept alive?
**Resolution**: Engines for disconnected players are deleted immediately in
`forfeitPlayer()`. Engines for topped-out players remain (their `isGameOver`
flag prevents further ticks). This is because topped-out boards may still be
displayed to spectators via snapshots.

### A3: What happens when a player disconnects during countdown?
**Resolution**: `markDisconnected()` returns false if `state !== "playing"`.
Countdown disconnect is handled by the room/lobby layer, not the game session.

---

## 4. Edge Cases

### EC1: Line clear at board top followed by garbage that causes immediate topout
The tick ordering in `processPostTick()` is: line-clear events → garbage drain →
garbage application → topout check. A player could clear lines (reducing stack)
but then receive garbage that pushes them over.

### EC2: Simultaneous multi-player topout from garbage
If garbage applied to multiple players causes topouts in the same tick, each
is processed sequentially in player iteration order. The first player processed
gets the worse placement.

### EC3: All players eliminated (no active players remain)
`checkForWinner()` handles this: if `activePlayers.length === 0`, the winner
is `eliminations[eliminations.length - 1]` (the last to be eliminated).

### EC4: KO during simultaneous elimination
If player A sends garbage that causes player B and C to top out, player A gets
KO credit for whichever is processed first. The second elimination also checks
`lastGarbageSender` independently.

---

## 5. Test Requirements

### Current test coverage (game-session-elimination.test.ts)
- Top-out triggers elimination broadcast ✓
- Last-player-standing win condition ✓
- Multi-elimination ordering (3-player) ✓
- Stats accumulation and winner stats ✓
- Disconnect counts as elimination ✓
- Simultaneous elimination ordering ✓

### Client test coverage
- GameResults.test.tsx: Results table rendering, winner highlighting ✓
- SpectatorOverlay.test.tsx: Overlay rendering with placement ✓

### Required test utility adoption (from PR notes)
Tests should use:
- `boardFromAscii` for setting up near-topout boards instead of `forceTopOut()` brute-force
- `makeGameState` factories for game state setup
- `assertLinesCleared`/`assertSpawnedPiece` for state transition assertions

**Current gap**: The server tests use `forceTopOut()` (200 hard drops) instead
of `boardFromAscii` to create near-topout conditions. This should be refactored
to use the testing infra from plan-17af8d3.

---

## 6. Files Modified

| File | Changes |
|------|---------|
| `packages/shared/src/engine/scoring.ts` | Added `piecesPlaced` to `ScoringState` |
| `packages/shared/src/state-snapshot.ts` | Extract `piecesPlaced` in snapshot |
| `packages/shared/src/protocol.ts` | `PlayerStats`, `S2C_GameOver`, `S2C_GameEnd` types |
| `packages/shared/src/types.ts` | `piecesPlaced` in `GameStateSnapshot` |
| `packages/server/src/game-session.ts` | `eliminatePlayer`, `checkForWinner`, `capturePlayerStats`, stats tracking |
| `packages/client/src/ui/GameResults.tsx` | Results screen component |
| `packages/client/src/ui/GameResults.css` | Results screen styles |
| `packages/client/src/ui/SpectatorOverlay.tsx` | Spectator overlay component |
| `packages/client/src/net/lobby-client.ts` | Client-side elimination/gameEnd handlers |
| `packages/client/src/ui/GameMultiplayer.tsx` | SpectatorOverlay integration |
| `packages/client/src/App.tsx` | Results view routing |
| `packages/server/src/__tests__/game-session-elimination.test.ts` | Server tests |
| `packages/client/src/__tests__/GameResults.test.tsx` | Client results tests |
| `packages/client/src/__tests__/SpectatorOverlay.test.tsx` | Client overlay tests |
