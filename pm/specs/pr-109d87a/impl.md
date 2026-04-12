# Spec: Seeded PRNG Utility (pr-109d87a)

## Requirements

1. **New module `packages/shared/src/engine/rng.ts`** — A standalone seedable PRNG module implementing a well-known algorithm (xoshiro128**). This replaces the existing `seededRng` (mulberry32) in `randomizer.ts` as the canonical PRNG for the project.

2. **API: `createRNG(seed: number) → RNG`** where `RNG` exposes:
   - `next(): number` — returns a float in [0, 1), same contract as the existing `() => number` RNG function used by randomizers.
   - `nextInt(min: number, max: number): number` — returns an integer in [min, max] (inclusive on both ends).

3. **Backward compatibility** — The existing `seededRng` in `randomizer.ts` and its consumers (SevenBagRandomizer, PureRandomRandomizer, tests) must continue to work. The new `createRNG` is additive; existing code is not migrated in this PR.

4. **Export from barrel** — `createRNG` and the `RNG` type must be exported from `packages/shared/src/index.ts`.

5. **Tests in `packages/shared/src/engine/rng.test.ts`**:
   - Determinism: same seed → identical sequence
   - Distribution sanity: values in [0, 1) for `next()`, values in [min, max] for `nextInt`
   - Independence: two instances with different seeds produce different sequences
   - Edge cases for `nextInt`: min === max, large ranges, boundary values

## Implicit Requirements

- **Pure, side-effect-free** — no global state, no dependency on `Math.random`. Each `createRNG` call returns an independent instance.
- **32-bit safe** — must use only 32-bit integer operations (`Math.imul`, bitwise ops, `>>> 0`) since JS doesn't have native 64-bit integers. xoshiro128** is a 128-bit state / 32-bit output algorithm that fits this constraint.
- **Compatible RNG function** — The `next()` method returns `[0, 1)` floats, same as the `() => number` contract used by randomizers. An RNG instance's `next` method (bound or wrapped) should be usable as a drop-in for the `rng?: () => number` parameter in randomizer constructors.

## Ambiguities

1. **Algorithm choice: xoshiro128** vs mulberry32** — The task says "e.g., xoshiro128". The existing codebase uses mulberry32. **Resolution**: Implement xoshiro128** as specified. It has better statistical properties (128-bit state vs 32-bit) and is the recommended algorithm from the Vigna/Blackman family. The existing mulberry32 `seededRng` stays untouched for backward compatibility.

2. **Seed initialization for xoshiro128**** — xoshiro128** needs 4 × 32-bit state words, but the API takes a single `number` seed. **Resolution**: Use a simple splitmix32 expansion (same approach as reference implementations) to derive the 4 state words from the single seed.

3. **`nextInt` bounds convention** — "nextInt(min, max)" could be [min, max) or [min, max]. **Resolution**: Use [min, max] inclusive, which is the more natural convention for game dev (e.g., `nextInt(1, 7)` returns 1 through 7).

4. **Should `createRNG` replace `seededRng`?** — **Resolution**: No. This PR adds `createRNG` as a new, richer API. Migration of existing consumers is out of scope.

## Edge Cases

- **Seed of 0** — splitmix32 handles zero seeds correctly (the additive constant ensures state progression). Verify in tests.
- **`nextInt(n, n)`** — must return `n` every time.
- **`nextInt` with negative ranges** — e.g., `nextInt(-5, 5)` should work correctly.
- **Large `nextInt` ranges** — e.g., `nextInt(0, 2**31 - 1)` — must not overflow or produce values outside bounds.
- **Float precision** — dividing a 32-bit unsigned int by 2^32 yields [0, 1) without risk of returning exactly 1.0.
