# Implementation Spec: Randomizer Variants — 7-Bag and Pure Random

## Requirements

### R1: Randomizer Interface
Define a `Randomizer` interface in `packages/shared/src/engine/randomizer.ts` that abstracts piece generation. Must expose:
- `next(): PieceType` — dequeue the next piece and refill the internal queue.
- `peek(count: number): readonly PieceType[]` — preview the next `count` pieces without consuming them.
- `readonly queue: readonly PieceType[]` — the current preview queue (read-only view).

The interface must be importable from `@tetris/shared` via `packages/shared/src/index.ts`.

### R2: SevenBagRandomizer
Implement in `packages/shared/src/engine/randomizer-7bag.ts`:
- Shuffles all 7 pieces (`ALL_PIECES` from `pieces.ts`) into a bag.
- Deals pieces from the bag in order.
- When the bag is exhausted, generates a new shuffled bag.
- Constructor takes `previewCount: number` and an optional `seed` or RNG function for deterministic operation.
- On construction, immediately fills the queue to `previewCount` depth.

### R3: PureRandomRandomizer
Implement in `packages/shared/src/engine/randomizer-pure.ts`:
- Each piece is chosen uniformly at random from `ALL_PIECES`, allowing repeats.
- Constructor takes `previewCount: number` and an optional `seed` or RNG function.
- On construction, immediately fills the queue to `previewCount` depth.

### R4: Hold Piece Logic
Implement in `packages/shared/src/engine/hold.ts`:
- `HoldState` type tracking: `heldPiece: PieceType | null`, `holdUsedThisDrop: boolean`.
- `createHoldState(): HoldState` — initial state (null piece, unused).
- `holdPiece(current: PieceType, state: HoldState, holdEnabled: boolean): { newCurrent: PieceType | null; newState: HoldState }` — swap logic:
  - If `holdEnabled` is false, return unchanged (no-op).
  - If `holdUsedThisDrop` is true, return unchanged (one hold per drop).
  - Otherwise: swap `current` into hold, return previously held piece (or `null` if hold was empty, meaning caller must pull from randomizer).
  - Set `holdUsedThisDrop = true` in returned state.
- `resetHoldFlag(state: HoldState): HoldState` — called on piece lock, resets `holdUsedThisDrop` to false.

### R5: Unit Tests
Implement in `packages/shared/src/engine/randomizer.test.ts`:
- **7-bag**: contains all 7 unique pieces per bag, no repeats within a bag, seamlessly refills on exhaustion.
- **Pure random**: produces only valid `PieceType` values, allows repeats (statistical test over many draws).
- **Both**: queue stays filled to requested `previewCount` depth after every `next()` call.
- **Hold**: swaps correctly, returns null on first hold (empty), blocked when `holdEnabled=false`, cannot hold twice per drop, resets after `resetHoldFlag`.

### R6: Exports
All new types and implementations must be exported from `packages/shared/src/index.ts`.

## Implicit Requirements

1. **Determinism**: Both randomizers must accept a seed or RNG function so the server and client can produce identical sequences given the same seed. This is critical for server-authoritative multiplayer (noted in PR Notes).

2. **Seeded RNG**: Need a simple seedable PRNG. A basic implementation (e.g., mulberry32 or similar) should be included as a utility, since `Math.random()` is not seedable and would break determinism.

3. **Immutability of `ALL_PIECES`**: The 7-bag must copy/shuffle a mutable copy of `ALL_PIECES`, never mutate the `readonly` original array.

4. **`previewCount` from `RuleSet`**: The `previewCount` field in `RuleSet` (types.ts:60) drives the queue depth. Randomizer constructors should accept this value.

5. **`randomizer` field in `RuleSet`**: The `randomizer: "7bag" | "pure-random"` field (types.ts:37) determines which implementation to instantiate. A factory function mapping this string to a concrete randomizer would be useful.

6. **Package location**: All code goes in `packages/shared/src/engine/`, not client-side, per PR Notes.

## Ambiguities

1. **RNG interface**: The task says "seed" but doesn't specify the PRNG algorithm. **Resolution**: Provide a `() => number` RNG function parameter (returns [0,1) like `Math.random()`). Include a built-in `seededRng(seed: number)` helper using mulberry32. Default to `Math.random` when no RNG is provided.

2. **Hold piece returning null vs piece**: When hold is empty and player holds, the current piece goes into hold and caller needs a new piece from the randomizer. **Resolution**: Return `newCurrent: PieceType | null` — null signals "pull from randomizer". This keeps hold logic decoupled from the randomizer.

3. **Factory function**: Not explicitly requested but implied by the `randomizer` field in `RuleSet`. **Resolution**: Include a `createRandomizer(type: "7bag" | "pure-random", previewCount: number, rng?: () => number): Randomizer` factory in `randomizer.ts`.

## Edge Cases

1. **`previewCount = 0`**: Queue should be empty, `peek(0)` returns `[]`, `next()` still works (generates on demand).
2. **7-bag with `previewCount > 7`**: Must span multiple bags. Initial fill should generate enough bags to fill the queue.
3. **`peek(n)` where `n > queue.length`**: Should return only what's available (up to `previewCount`), or should it temporarily generate more? **Resolution**: `peek` returns `Math.min(n, queue.length)` items — the queue is always maintained at `previewCount` depth, so requesting more than `previewCount` just returns the full queue.
4. **Hold when hold is disabled in ruleset**: `holdPiece` with `holdEnabled=false` is a no-op, returns current piece unchanged.
5. **Multiple consecutive holds**: Second hold in same drop is blocked by `holdUsedThisDrop` flag.
