/**
 * Randomizer interface and factory — piece generation for Tetris.
 *
 * Two implementations: SevenBagRandomizer (modern) and PureRandomRandomizer (classic).
 * Both accept a `() => number` RNG function for deterministic replay.
 */

import type { PieceType } from "./pieces.js";
import { SevenBagRandomizer } from "./randomizer-7bag.js";
import { PureRandomRandomizer } from "./randomizer-pure.js";

/** Abstract piece generator with a preview queue. */
export interface Randomizer {
  /** Dequeue the next piece and refill the queue. */
  next(): PieceType;
  /** Preview the next `count` pieces without consuming them. */
  peek(count: number): readonly PieceType[];
  /** Current preview queue (read-only). */
  readonly queue: readonly PieceType[];
}

/**
 * Create a seedable PRNG using the mulberry32 algorithm.
 * Returns a function producing values in [0, 1).
 */
export function seededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Factory: create a Randomizer from a rule set's `randomizer` field.
 */
export function createRandomizer(
  type: "7bag" | "pure-random",
  previewCount: number,
  rng?: () => number,
): Randomizer {
  switch (type) {
    case "7bag":
      return new SevenBagRandomizer(previewCount, rng);
    case "pure-random":
      return new PureRandomRandomizer(previewCount, rng);
  }
}
