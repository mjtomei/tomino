# Implementation Spec: Garbage Targeting Strategies and Attack Power

## Requirements

### R1: Targeting Strategy Types (shared/targeting-types.ts)

Define a `TargetingStrategyType` enum/union: `"random" | "attackers" | "kos" | "manual"`.

The existing `TargetingStrategy` interface (`resolveTargets(sender, players, context)`) is the execution layer. Each strategy type maps to a concrete `TargetingStrategy` implementation. The key change: strategies now need richer context to make decisions — board heights (for KOs), who-targets-whom (for attackers), and explicit target selection (for manual).

**Files:** `packages/shared/src/targeting-types.ts` (extend with new types and strategy implementations)

### R2: Targeting Strategy Implementations (server/targeting.ts)

Four strategy implementations, all conforming to `TargetingStrategy`:

- **Random** — All garbage to one random opponent (not even-split). Uses `context.rng`.
- **Attackers** — All garbage to a random player among those currently targeting the sender. Falls back to random if nobody targets sender.
- **KOs** — All garbage to the opponent closest to topping out (highest board). Falls back to random on tie.
- **Manual** — All garbage to the sender's explicitly chosen target. Falls back to random if target is dead/absent.

All four send the full `linesToSend` to a single target (unlike `evenSplitStrategy` which splits). This is standard Tetris 99 behavior.

**Requires extended `TargetingContext`:** Add `boardHeights: Record<PlayerId, number>`, `attackerGraph: Record<PlayerId, PlayerId>` (who each player targets), `manualTargets: Record<PlayerId, PlayerId | null>`.

**File:** `packages/server/src/targeting.ts` (new)

### R3: Per-Player Strategy Selection (server + protocol)

Each player has an active targeting strategy, changeable mid-game. Server tracks `activeStrategy: Record<PlayerId, TargetingStrategyType>` in the game session.

**New protocol messages:**
- `C2S_SetTargetingStrategy { type: "setTargetingStrategy", roomId, strategy: TargetingStrategyType }` — player switches strategy
- `C2S_SetManualTarget { type: "setManualTarget", roomId, targetPlayerId: PlayerId }` — player selects manual target
- `S2C_TargetingUpdated { type: "targetingUpdated", roomId, playerId, strategy: TargetingStrategyType, targetPlayerId?: PlayerId }` — broadcast strategy changes
- `S2C_AttackPowerUpdated { type: "attackPowerUpdated", roomId, playerId, multiplier: number, koCount: number }` — broadcast multiplier changes

**Files:** `packages/shared/src/protocol.ts`, `packages/shared/src/targeting-types.ts`

### R4: Attack Power Multiplier (server/attack-power.ts)

Per-player attack power multiplier on the server, tracked by KO count:
- 0 KOs → 1.0x
- 1 KO → 1.25x
- 2 KOs → 1.5x
- 4 KOs → 1.75x
- 6+ KOs → 2.0x

The multiplier is applied to outgoing garbage at distribution time. When a player is eliminated, the player who last sent them garbage (or the player targeting them) gets credit for the KO.

**File:** `packages/server/src/attack-power.ts` (new)

### R5: Multiplier Applied to Outgoing Garbage (server/garbage-manager.ts)

After `calculateGarbage` produces the base line count, multiply by the sender's attack power before cancellation and distribution. This fits into the existing `onLinesCleared` flow in `BalancingMiddleware`.

The attack power multiplier stacks multiplicatively with the handicap `garbageMultiplier` — attack power is applied first (it's the sender's bonus), then handicap modifier per-pair.

**File:** `packages/server/src/balancing-middleware.ts` (extend)

### R6: Game Settings Integration (shared + server + client)

Add to room/game settings:
- `enabledStrategies: TargetingStrategyType[]` — which strategies players can pick
- `defaultStrategy: TargetingStrategyType` — initial strategy for all players

These are part of `RoomState` (or a new targeting settings object on `RoomState`). Host configures in the waiting room. Validated on the server: at least one strategy must be enabled; default must be in enabled list.

**Files:** `packages/shared/src/types.ts` (extend `RoomState`), `packages/server/src/handlers/lobby-handlers.ts` (validation), `packages/client/src/ui/WaitingRoom.tsx` (UI)

### R7: Manual Targeting UI (client)

- Player clicks/taps an opponent's mini-board to select them as manual target.
- Targeted board gets a colored border highlight (e.g., red/orange glow).
- Small targeting mode indicator on the player's HUD showing current strategy.

**Files:** `packages/client/src/ui/OpponentBoard.tsx` (add onClick, highlight), `packages/client/src/ui/GameMultiplayer.tsx` (wire click events, pass target state), `packages/client/src/ui/TargetingSelector.tsx` (new — strategy picker UI)

### R8: Strategy Switching UI (client)

A targeting strategy selector visible during gameplay. Shows available strategies (filtered by `enabledStrategies`). Player can switch mid-game. Sends `C2S_SetTargetingStrategy` to server.

**File:** `packages/client/src/ui/TargetingSelector.tsx` (new)

---

## Implicit Requirements

### IR1: Targeting Dispatch Per-Player (not per-room)

The current `GarbageManager` uses a single `TargetingStrategy` for the whole room. With per-player strategies, the garbage manager needs to resolve targets per-sender. The `resolveTargets` call must use the sender's active strategy, not a global one.

**Approach:** Instead of injecting a single `TargetingStrategy`, the garbage pipeline will look up each sender's active strategy from the session's strategy map, and call the appropriate implementation.

### IR2: Board Height Tracking for KOs Strategy

The KOs strategy needs to know each player's board height. This is available from `PlayerEngine.getSnapshot().board` but must be computed and passed into `TargetingContext` at distribution time.

**Approach:** Compute board heights lazily in `GameSession.processGarbageFor` and pass into the targeting context.

### IR3: Attacker Graph for Attackers Strategy

The "attackers" strategy needs to know which players are currently targeting the sender. This is derived from the session's `activeStrategy` map + `manualTargets` map.

**Approach:** `GameSession` maintains the attacker graph (derived from all players' strategy selections) and passes it into targeting context.

### IR4: KO Attribution

When a player tops out, we need to attribute the KO to someone for attack power calculation. The most recent sender of garbage to the eliminated player is the natural choice (tracked via `PendingEntry.senderId` or the last `garbageReceived` event).

### IR5: Attack Power Broadcast

Clients need to display the current attack multiplier. Broadcast `S2C_AttackPowerUpdated` whenever a KO changes a player's multiplier. Include in `S2C_GameStarted` initial state (all 1.0x).

### IR6: Strategy Persistence Across Rounds

Manual target selection must persist if the game has multiple rounds (future). For now, single-round games mean persistence is trivial — it lasts until game end.

### IR7: Dead Target Fallback

If a manually targeted player tops out, the manual target should auto-clear and fall back to random targeting for subsequent garbage. The client should be notified.

### IR8: Initial Strategy Assignment

On game start, all players get the room's `defaultStrategy`. Broadcast initial targeting state in `S2C_GameStarted` or immediately after.

### IR9: Message Validation

All new C2S messages need server-side validation: strategy must be in `enabledStrategies`, manual target must be a valid alive opponent, etc.

---

## Ambiguities

### A1: Random Strategy — All-to-one vs Even-split

**Resolution:** Random sends all garbage to one randomly selected opponent per attack (standard Tetris 99 behavior). This differs from the existing `evenSplitStrategy`. The even-split strategy remains available as a separate option but is not one of the four player-selectable strategies.

### A2: Attack Power — Applied Before or After Cancellation?

The task says "applied to outgoing garbage at distribution time." 

**Resolution:** Applied after cancellation, to the residual garbage that actually gets sent to opponents. This prevents attack power from inflating cancellation amounts (which would be counterintuitive — you shouldn't cancel more of your own incoming garbage just because you have high attack power).

### A3: KO Attribution — Who Gets Credit?

The task says "KOs increase the multiplier" but doesn't define who gets credit for a KO in scenarios where multiple players sent garbage.

**Resolution:** The player whose garbage most recently arrived on the eliminated player's board gets the KO credit. Track `lastGarbageSender` per player in the garbage manager.

### A4: Attack Power Thresholds — Cumulative or Per-Game?

**Resolution:** Per-game. KO count resets each game. The thresholds are cumulative within a game (1 KO total → 1.25x, etc.).

### A5: Attackers Strategy — What Counts as "Targeting"?

**Resolution:** A player "targets" another if their active strategy would direct garbage at them. For random/KOs, the targeting is implicit and changes per-attack, so those players don't count as targeting anyone specific. Only manual targeting and attackers (retaliating) create stable targeting relationships visible to the attackers strategy. This prevents circular loops.

Concretely: the attacker graph only includes players with `manual` strategy pointing at you, plus players with `attackers` strategy who are retaliating against you.

### A6: Multiplier Display — Where on HUD?

**Resolution:** Show attack power multiplier as a small badge near the player's board (e.g., "ATK 1.5x"). Show alongside the targeting strategy indicator.

---

## Edge Cases

### E1: All Opponents Dead Except One

When only 2 players remain, all strategies effectively target the same player. No special handling needed.

### E2: Self-Targeting Prevention

Manual target validation must reject selecting yourself. The UI should not render your own board as clickable.

### E3: KOs Strategy Tie-Breaking

Multiple opponents at the same board height: pick randomly among tied opponents using the context RNG.

### E4: Attackers Strategy with No Attackers

If no one is targeting the sender, fall back to random targeting.

### E5: Strategy Switch During Active Garbage Flight

A player switches from manual→random while garbage from a previous attack is still in-flight (delayed). No retroactive change — garbage already enqueued stays with its original target. Only future attacks use the new strategy.

### E6: Manual Target Dies Mid-Game

When the manually targeted player tops out: clear the manual target, fall back to random. Broadcast `S2C_TargetingUpdated` with cleared target. Client shows visual feedback.

### E7: Room Settings Validation Edge Cases

- Empty `enabledStrategies` array → reject
- `defaultStrategy` not in `enabledStrategies` → reject
- Player tries to switch to a non-enabled strategy → reject with error

### E8: Attack Power Multiplier with Handicap Stacking

A player with 2.0x attack power and 0.5x handicap garbage multiplier sends garbage modified by both: `base * 2.0 * 0.5 = base * 1.0`. The ordering (attack power then handicap) doesn't matter since both are multiplicative, but for clarity attack power is applied first.

### E9: Disconnect with Attack Power

If a player disconnects (treated as game-over), the KO is attributed normally. The disconnecting player's attack power state is cleaned up.

### E10: Single Player Remaining Doesn't Need Targeting

When only one opponent remains alive, all strategies collapse to targeting that opponent. No special case needed — the strategy implementations naturally handle the single-opponent case.
