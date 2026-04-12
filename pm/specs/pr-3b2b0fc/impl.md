# Implementation Spec — pr-3b2b0fc: Balancing Middleware

## Requirements (grounded in codebase)

1. **Create `BalancingMiddleware` class in `packages/server/src/balancing-middleware.ts`** that exposes a `GarbageManager`-compatible public API (`onLinesCleared`, `drainReady`, `getPending`, `removePlayer`, `setTargetingStrategy`) so `game-session.ts` can swap it in without changes to `processGarbageFor` (`game-session.ts:325-352`).

2. **Compute / accept a modifier matrix at construction.** Matrix is already built upstream in `handlers/game-handlers.ts:81` via `computeModifierMatrix(...)` and serialized into `Record<ModifierMatrixKey, HandicapModifiers>`. The middleware should accept the serialized form (same shape that flows through `GameSessionConfig.handicapModifiers` at `game-session.ts:40`).
   - `ModifierMatrixKey` format: `` `${senderUsername}→${receiverUsername}` `` (`handicap-types.ts:14-19`, `modifierKey()`).
   - Matrix is keyed by **username** (player.name), not PlayerId. GameSession stores PlayerId-keyed engine maps — the middleware therefore needs a `PlayerId → username` lookup supplied at construction.

3. **Per-pair garbage multiplier with probabilistic rounding.** When routing garbage from sender → receiver, multiply the allocation's `lines` by `garbageMultiplier` and probabilistically round to an integer:
   - `floor(x)` with probability `1 - frac(x)`, `ceil(x)` with probability `frac(x)`.
   - `0.0` multiplier → always 0 lines (full absorption).
   - `1.0` multiplier → unchanged.

4. **Optional delay modifier.** When enabled (via `HandicapSettings.delayEnabled`, already baked into the matrix's `delayModifier` field), multiply the per-pair delay by `delayModifier` before computing `readyAt`. Since `GarbageManager` applies a single global `delayMs` at `garbage-manager.ts:171`, the middleware must own its own queue/`readyAt` bookkeeping per batch rather than delegate to `GarbageManager` for this path — otherwise the per-pair delay can't be expressed.

5. **Optional messiness modifier.** When enabled, `messinessFactor < 1.0` → cleaner gaps (less randomization). Concretely: the gap column selection for a per-pair batch uses a blend of the random column and a "canonical" column (e.g., first column, 0) controlled by `messinessFactor`. At `messinessFactor = 1.0` → fully random (current behavior, uniform random across `BOARD_WIDTH`). At `messinessFactor = 0.0` → deterministic canonical column. This is a design choice — see Ambiguities §A1.

6. **Passthrough when handicap disabled.** If the modifier matrix is `undefined`, the middleware delegates every call to an inner `GarbageManager` with identical inputs, preserving current behavior.

7. **Inject middleware in `game-session.ts`.** In `initializeEngines()` (`game-session.ts:250-271`), replace the direct `new GarbageManager(...)` with `new BalancingMiddleware(...)` when `this.handicapModifiers` is set, otherwise keep `new GarbageManager(...)` (or always use `BalancingMiddleware` with the matrix as `undefined` — equivalent). The middleware receives `playerNames: Record<PlayerId, string>` built from `config.players`.

8. **Tests in `packages/server/src/__tests__/balancing-middleware.test.ts`** (or colocated with the source; existing server tests live in `__tests__/`). Required coverage:
   - Garbage passthrough when handicap is disabled (matrix = undefined).
   - Per-pair modifiers: `A→B` differs from `A→C` (3-player matrix, different multipliers).
   - `0.0` multiplier → zero lines delivered to that receiver.
   - Probabilistic rounding: large-sample average (e.g. 10,000 iterations) approximates expected value within a tolerance, using an injected seeded RNG for determinism.
   - Matrix recomputation for different player counts (2 and 3+).
   - `delayEnabled` off → `delayModifier` ignored; `delayEnabled` on → `readyAt` shifts by the pair's factor.
   - `messinessEnabled` off → uses default gap RNG; on → gap selection biased toward canonical.
   - Integration test using real `BalancingMiddleware` + a fake garbage-producing event feeding the assertion helpers from `@tetris/shared/__test-utils__`:
     - `makeGarbageBatch` factory (`factories.ts:54`)
     - `assertGarbageInserted` (`assertions.ts:64`) — verifies final board state after middleware-modified batch is applied via `PlayerEngine.applyGarbage`
     - `boardFromAscii` is optional for tests that set up specific pre-garbage board states; use it where it adds clarity.

## Implementation Structure

```ts
// balancing-middleware.ts
import type { GarbageBatch, PlayerId, HandicapModifiers, ModifierMatrixKey, TargetingStrategy } from "@tetris/shared";
import { BOARD_WIDTH, calculateGarbage, evenSplitStrategy, modifierKey } from "@tetris/shared";

export interface BalancingMiddlewareOptions {
  playerIds: readonly PlayerId[];
  playerNames: Record<PlayerId, string>;       // id → username for matrix lookup
  modifiers?: Record<ModifierMatrixKey, HandicapModifiers>;  // undefined → passthrough
  delayMs?: number;
  targetingStrategy?: TargetingStrategy;
  now?: () => number;
  gapRng?: () => number;
  rounderRng?: () => number;                   // for probabilistic rounding; default Math.random
  delayEnabled?: boolean;                      // gate on delayModifier application
  messinessEnabled?: boolean;                  // gate on messinessFactor application
}

export class BalancingMiddleware {
  // Owns its own queue bookkeeping to support per-pair delay. The public API
  // mirrors GarbageManager so game-session can swap it in.
  onLinesCleared(sender, input): LinesClearedOutcome { ... }
  drainReady(playerId, now?): GarbageBatch[] { ... }
  getPending(playerId): GarbageBatch[] { ... }
  removePlayer(playerId): void { ... }
  setTargetingStrategy(strategy): void { ... }
}
```

**Why reimplement queue bookkeeping rather than wrap `GarbageManager` by composition?** `GarbageManager` computes a single global `readyAt` per `onLinesCleared` call (`garbage-manager.ts:171`), so per-pair delay cannot be expressed by merely wrapping its public API. Reimplementing the ~80-line queueing logic is cleaner than hacking around the uniform-delay assumption. When the matrix is undefined, we delegate to an inner `GarbageManager` to guarantee identical passthrough behavior (no behavioral drift).

**Modifier application order inside `onLinesCleared`:**
1. `total = calculateGarbage(input)` — unchanged.
2. Cancel from sender's own queue (FIFO) using unmodified `total` — matches current `GarbageManager` behavior.
3. `residual = total - cancelled`; targeting strategy allocates `residual` across receivers (unchanged call).
4. **Per-allocation**: look up `modifiers[modifierKey(senderName, receiverName)]`.
   - `lines' = probabilisticRound(alloc.lines * garbageMultiplier)` — skip enqueue if 0.
   - `delayMsForPair = delayMs * (delayEnabled ? delayModifier : 1)`.
   - `gapColumn = messinessEnabled ? blendedGap(messinessFactor) : defaultGapRng()`.
5. Enqueue `{batch: {lines', gapColumn}, readyAt: now + delayMsForPair, senderId}`.

## Implicit Requirements

- **Preserve `affectedReceivers` semantics** — `outcome.affectedReceivers` drives `syncPendingGarbage` broadcasts (`game-session.ts:333`). A receiver whose allocation rounds to 0 lines should NOT appear in `affectedReceivers` (no state change to sync).
- **Sender cancellation still operates on pre-modified lines** — cancellation is receiver-agnostic; applying a sender-side multiplier would not match the spec ("multiplier is a sender→receiver attribute").
- **Determinism for tests** — both `gapRng` and `rounderRng` must be injectable. Tests will use fixed RNGs (e.g. `() => 0.5`) for reproducible assertions, and loop-based averaging for the probabilistic-rounding test.
- **`playerNames` mapping must cover all players** in the session — GameSession already has `config.players: PlayerInfo[]`, so `Object.fromEntries(players.map(p => [p.id, p.name]))` is the natural construction.
- **`removePlayer` must clean the queue** (matches `GarbageManager.removePlayer` at `garbage-manager.ts:89`) to avoid stale entries for disconnected players.

## Ambiguities (resolved)

**A1. Messiness semantics.** The spec says "adjust gap randomization" but not how. The handicap calculator already produces `messinessFactor ∈ [0, 1]` where lower = cleaner. **Resolution:** with probability `messinessFactor` use `floor(gapRng() * BOARD_WIDTH)` (fully random), otherwise use a fixed canonical column (`0`). At `messinessFactor = 1.0` this matches current behavior; at `0.0` gaps are always in column 0 (maximally clean / predictable). This is a simple, testable interpretation; more sophisticated blending can be added later if human playtesting demands it. Note this only applies when `messinessEnabled` is true; otherwise default random gap selection is used.

**A2. Rounding direction for 0 ≤ multiplier < 1.** Example in spec: `0.3 × 4 = 1.2` → 1 line 80% / 2 lines 20%. **Resolution:** probabilistic round — let `x = rawLines`; with probability `frac(x)` return `ceil(x)`, else `floor(x)`. Matches the example (`1.2` → `P(2) = 0.2`).

**A3. Which `total` feeds sender cancellation?** Pre-modifier, since multipliers are sender→receiver and don't apply to self-absorbed cancellation. This also avoids a sender multiplier-matrix lookup against a nonexistent `modifierKey(sender, sender)`.

**A4. Injection conditional.** Always construct `BalancingMiddleware`; pass `modifiers: undefined` when handicap disabled. Cleaner than branching in `game-session.ts`.

## Edge Cases

- **Matrix missing an expected pair key** (shouldn't happen in practice but be defensive): treat as identity modifiers (`{1, 1, 1}`) — no behavior change rather than crash.
- **Targeting strategy returns an allocation to an unknown player** (`garbage-manager.ts:176` already guards with `if (!queue) continue`): keep the same guard.
- **`residual = 0`** after cancellation: return early as in `GarbageManager`.
- **Rounding produces 0 lines for every receiver** (e.g. all multipliers 0): `residualSent = 0`, `affectedReceivers` contains only the sender if cancellation happened. No receivers are listed.
- **Player removed mid-game** (`handlePlayerDisconnect` → `removePlayer`): subsequent `onLinesCleared` calls should not allocate to that receiver. Since players list is authoritative and targeting strategy uses it, updating the internal `players` array in `removePlayer` handles this — mirror `GarbageManager`.
- **Game-session tick delays** — for tests with `vi.useFakeTimers()`, the `now` callback must use the test clock; accept it via options (same as `GarbageManager`).
- **Passthrough preservation** — automated test compares outcomes between `BalancingMiddleware(undefined)` and raw `GarbageManager` on the same input, guarding against accidental drift in the passthrough code path.

## Testing Strategy Notes

- Use `@tetris/shared/__test-utils__/factories.js` `makeGarbageBatch` to construct expected batches for `assertGarbageInserted`.
- Use `boardFromAscii` from `@tetris/shared/__test-utils__/board-builder.js` in the integration test to set up a known pre-garbage board state, run the middleware's output through `PlayerEngine.applyGarbage`, then use `assertGarbageInserted` to verify.
- Determinism: inject `gapRng: () => 0`, `rounderRng` as a stepper over a pre-seeded array, and `now: () => fixedTime`.
- Probabilistic rounding test: 10,000 iterations, assert mean is within ±0.05 of expected value.
