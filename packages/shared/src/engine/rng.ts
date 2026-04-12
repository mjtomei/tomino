/**
 * Seedable PRNG using xoshiro128** — a fast, high-quality 128-bit state
 * generator with 32-bit output. Suitable for deterministic game replay
 * and testing.
 *
 * Reference: Blackman & Vigna, "Scrambled Linear Pseudorandom Number Generators"
 */

/** A seeded pseudo-random number generator. */
export interface RNG {
  /** Returns a float in [0, 1). */
  next(): number;
  /** Returns an integer in [min, max] (inclusive). */
  nextInt(min: number, max: number): number;
}

/**
 * SplitMix32 — used to expand a single 32-bit seed into the 4-word
 * state required by xoshiro128**.
 */
function splitmix32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/**
 * Create a seedable PRNG instance using xoshiro128**.
 *
 * @param seed - A numeric seed. The 4-word internal state is derived via splitmix32.
 * @returns An RNG instance with `next()` and `nextInt(min, max)` methods.
 */
export function createRNG(seed: number): RNG {
  const sm = splitmix32(seed);
  let s0 = sm();
  let s1 = sm();
  let s2 = sm();
  let s3 = sm();

  function nextU32(): number {
    // xoshiro128**: result = rotl(s1 * 5, 7) * 9
    const r = Math.imul(s1, 5);
    const result = (((r << 7) | (r >>> 25)) * 9) >>> 0;

    const t = (s1 << 9) >>> 0;

    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;

    s2 = (s2 ^ t) >>> 0;

    // rotate s3 left by 11
    s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0;

    return result;
  }

  function next(): number {
    return nextU32() / 4294967296; // 2^32
  }

  function nextInt(min: number, max: number): number {
    const range = max - min + 1;
    // Rejection sampling to eliminate modulo bias.
    // threshold is the largest multiple of range that fits in 2^32.
    const threshold = (0x100000000 - range) % range;
    let r: number;
    do {
      r = nextU32();
    } while (r < threshold);
    return min + (r % range);
  }

  return { next, nextInt };
}
