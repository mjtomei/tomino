# Server-Authoritative Game State — Implementation Spec

## 1. Requirements

### R1: Per-player TetrisEngine on the server
After `gameStarted` fires in `GameSession`, instantiate one `TetrisEngine` (from `@tetris/shared`) per player. The engine is configured with:
- The session's shared `seed` (passed to `EngineOptions.seed`)
- `modernRuleSet()` (from `packages/shared/src/engine/rulesets.ts`)
- `marathonMode()` (or a suitable multiplayer mode config)
- Each engine calls `engine.start()` immediately

**File:** New `server/player-engine.ts` wraps a `TetrisEngine` and exposes a server-friendly API.

### R2: Server receives and applies player inputs
When the server receives a `C2S_PlayerInput` message (`{ type: "playerInput", roomId, action, tick }`):
1. Look up the player's `PlayerEngine` via the session
2. Validate: player is in the session, game is playing, game is not over for that player
3. Map `InputAction` to `TetrisEngine` method calls: `moveLeft()`, `moveRight()`, `rotateCW()`, `rotateCCW()`, `softDrop()`, `hardDrop()`, `hold()`
4. `rotate180` — the engine doesn't have a `rotate180()` method. Apply two consecutive `rotateCW()` calls (matching the harness pattern in `game-harness.ts:313-332`)
5. After applying the input, broadcast the resulting state snapshot

**Files:** Extend `game-handlers.ts` with `handlePlayerInput()`. Wire it in `ws-server.ts` (replace the placeholder comment at line 197-198).

### R3: State snapshots broadcast to all players
After each input application and after each gravity tick, broadcast an `S2C_GameStateSnapshot` message to all players in the room. The snapshot is produced by converting `TetrisEngine.getState()` (type `GameState`) to `GameStateSnapshot` (type from `types.ts`).

Conversion mapping (`GameState` → `GameStateSnapshot`):
- `status === "gameOver"` → `isGameOver: true`
- `board` (Grid) → `board` (Board) — same underlying type (`Cell[][]`)
- `currentPiece: ActivePiece` → `activePiece: PieceState` — map `{row, col, rotation}` → `{y: row, x: col, rotation}`
- `ghostRow` → `ghostY`
- `queue` → `nextQueue`
- `hold` → `holdPiece`
- `holdUsed` → `holdUsed`
- `scoring.score` → `score`
- `scoring.level` → `level`
- `scoring.lines` → `linesCleared`
- `pendingGarbage` → `pendingGarbage` (empty array for now; garbage system is a future PR)
- `tick` — tracked externally by `PlayerEngine` (engine doesn't have a tick counter)

**File:** Conversion function in `shared/state-snapshot.ts`.

### R4: Server-side tick/gravity loop
The server runs a periodic tick loop (e.g., 60fps = ~16.67ms interval using `setInterval`) that calls `engine.tick(deltaMs)` for each active player engine. After each tick, if the state changed, broadcast the snapshot.

- The tick loop starts when `onGameStarted` fires in `GameSession`
- The tick loop stops when all players have topped out or the game ends
- Use `setInterval` (not `setTimeout` chains) for simplicity; track actual elapsed time for `deltaMs`

**File:** Tick loop managed by `PlayerEngine` or `GameSession`.

### R5: Delta compression for state snapshots
State snapshots are delta-compressed to reduce bandwidth. Instead of sending the full `GameStateSnapshot` every frame, compute a diff against the previous snapshot sent to each recipient and send only changed fields.

**File:** `shared/state-snapshot.ts` — `computeStateDelta()` and `applyStateDelta()` functions.

### R6: Game over / game end detection
When a player's engine reaches `gameOver` status:
- Broadcast `S2C_GameOver` with that player's ID
- If only one player remains (not game over), broadcast `S2C_GameEnd` with the winner
- Clean up: stop their tick loop, remove the session when all engines are done

### R7: Disconnect during gameplay
When a player disconnects during an active game:
- Mark their engine as game over
- Broadcast `S2C_GameOver` for the disconnected player
- Check for winner (last player standing)

## 2. Implicit Requirements

### IR1: GameState → GameStateSnapshot conversion must be lossless
The engine's internal `GameState` uses different field names than the protocol's `GameStateSnapshot`. The conversion must preserve all information needed by clients. The `ActivePiece.row/col` → `PieceState.y/x` mapping is the most error-prone part.

### IR2: Tick counter must be managed server-side
`TetrisEngine` tracks `elapsedMs` but not a discrete tick counter. The `GameStateSnapshot.tick` field needs to be maintained by the `PlayerEngine` wrapper. Increment on each server tick.

### IR3: Engine uses millisecond-based time, server tick loop provides deltaMs
The `TetrisEngine.tick(deltaMs)` method expects real milliseconds. The server tick loop must calculate actual `deltaMs` using `Date.now()` or `performance.now()`, not assume fixed 16.67ms intervals.

### IR4: Input validation prevents cheating
The server must reject inputs for:
- Players not in the session
- Players whose game is already over
- Invalid `InputAction` values (not one of the 8 valid actions)
- Messages for rooms without active sessions

### IR5: Session lifecycle cleanup
When all players are game over or disconnected, the session must:
- Clear the tick interval
- Remove the session from the registry
- Set the room status back to "waiting" or "finished"

### IR6: Thread safety / reentrancy
Node.js is single-threaded, but `setInterval` callbacks and WebSocket message handlers interleave. Ensure that input application and tick processing don't conflict — apply inputs synchronously within the message handler, and the tick loop processes engines sequentially.

## 3. Ambiguities

### A1: Multiplayer game mode config
The engine requires a `GameModeConfig`. For multiplayer, what mode? **Resolution:** Use a dedicated multiplayer config: marathon mode with `goal: "none"`, `topOutEndsGame: true`, `gravity: true`. This keeps the game running until someone tops out. The `marathonMode()` from rulesets.ts already has `goal: "lines"` with `goalValue: 150`, so we'll create a simple multiplayer mode config with `goal: "none"`.

### A2: Tick loop frequency
The task says "tick/gravity loop" but doesn't specify frequency. **Resolution:** 60 ticks/second (~16.67ms), matching the client-side frame rate and the `FRAME_MS` constant in `game-harness.ts`. This ensures gravity and lock delay behave identically to the client.

### A3: When to broadcast snapshots
Every tick vs. only on change? **Resolution:** Broadcast only when state changes (after input application or when gravity/lock causes a state change). Sending 60 full snapshots/sec per player is wasteful. Delta compression helps but sending nothing when nothing changed is better.

### A4: Delta compression granularity
What constitutes a "delta"? **Resolution:** Field-level diffing of `GameStateSnapshot`. If a field's value hasn't changed from the last sent snapshot, omit it from the delta. The `board` field gets special treatment — send only changed rows (sparse representation). The `tick` field is always included as a sequence number.

### A5: `rotate180` handling
`TetrisEngine` has no `rotate180()` method, but `InputAction` includes `"rotate180"`. **Resolution:** Apply two consecutive `rotateCW()` calls, matching the pattern in the test harness (`game-harness.ts:313-332`).

### A6: Snapshot broadcast recipients
Should a player's state be broadcast to all players or just to other players? **Resolution:** Broadcast to all players in the room. Each player needs to see opponents' boards. The sending player also receives their authoritative state to reconcile with client-side prediction (future PR).

## 4. Edge Cases

### E1: Input arrives after game over
Player sends input but their engine has already transitioned to `gameOver`. The engine methods already guard against this (`if (this.status !== "playing") return`), so inputs are silently ignored. Send no error — this is a race condition, not a bug.

### E2: Rapid inputs between ticks
Multiple inputs can arrive between tick intervals. Apply them all immediately in order — the engine is synchronous and handles this correctly.

### E3: Last player tops out
If all players top out simultaneously (or the last remaining player tops out), there's no winner. Broadcast `S2C_GameOver` for each, then `S2C_GameEnd` with the last player to top out as the "winner" (they lasted longest), or handle as a draw.

### E4: Player disconnects during countdown (existing behavior)
Already handled by `handleGameDisconnect` in `game-handlers.ts`. This PR extends it to handle disconnects during `"playing"` state.

### E5: Delta compression — first snapshot
The first snapshot for each player has no previous state to diff against. Send the full snapshot as the initial delta (all fields present).

### E6: Board comparison for delta compression
Board is a 40x10 2D array. Comparing it cell-by-cell every tick is O(400) — cheap enough. For the delta, send only row indices that changed along with their new contents.

### E7: Lock delay edge cases
Wall kicks near boundaries during lock delay are handled by the engine. The server just forwards the engine state — no special handling needed.

### E8: Seed determinism
All player engines share the same seed, but each has their own independent engine instance with its own randomizer. The seed ensures the piece sequence is identical across all players — same as client-side. This is important for spectating/replays but not for gameplay (each player plays independently).

## 5. Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/player-engine.ts` | **Create** | Wraps `TetrisEngine` with tick counter, state conversion, input application |
| `packages/shared/src/state-snapshot.ts` | **Create** | `engineStateToSnapshot()` conversion, `computeStateDelta()`, `applyStateDelta()` |
| `packages/server/src/game-session.ts` | **Extend** | Add player engine map, tick loop, game-over detection |
| `packages/server/src/handlers/game-handlers.ts` | **Extend** | Add `handlePlayerInput()`, extend `startGameCountdown` and disconnect handling |
| `packages/server/src/ws-server.ts` | **Extend** | Wire `playerInput` message to handler |
| `packages/server/src/__tests__/player-engine.test.ts` | **Create** | Input application, state conversion, tick progression |
| `packages/server/src/__tests__/game-session-gameplay.test.ts` | **Create** | Multi-player session, game-over detection, disconnect during play |
| `packages/shared/src/__tests__/state-snapshot.test.ts` | **Create** | Delta compression correctness, conversion accuracy |

## 6. Test Plan

All tests use:
- `createRNG(seed)` for deterministic PRNG
- `GameTestHarness` for engine state verification (cross-checking server engine output)
- `makeGameState()` / `makePiece()` factories for snapshot construction
- `boardFromAscii()` for readable board setup and assertions

### T1: Input application and state broadcast
- Apply `moveLeft`, verify piece position changes in snapshot
- Apply `hardDrop`, verify piece locks and score increases
- Apply `hold`, verify hold piece swaps
- Apply `rotate180`, verify two CW rotations applied
- Apply input to game-over engine, verify no state change

### T2: Gravity tick progression
- Create engine, advance ticks, verify piece drops by gravity
- Verify lock delay triggers after piece reaches ground
- Verify piece locks after lock delay expires

### T3: Invalid input rejection
- Input from player not in session → error
- Input for non-existent room → error
- Invalid action string → rejected

### T4: Multi-player session with independent engines
- Two players with same seed → same initial piece sequence
- Input on player 1 doesn't affect player 2's board
- Player 1 tops out → `gameOver` broadcast, player 2 continues
- Player 2 tops out → `gameEnd` broadcast with winner

### T5: Delta compression correctness
- Full snapshot → delta with all fields present (first send)
- No change → minimal delta (only tick)
- Board change in one row → delta contains only that row
- Piece move → delta contains only `activePiece` and `ghostY`
- Apply delta to previous snapshot → reconstructs full snapshot exactly
