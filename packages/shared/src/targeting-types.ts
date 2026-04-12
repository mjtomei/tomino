/**
 * Garbage targeting strategy interface.
 *
 * A strategy decides how many garbage lines a sender distributes to each
 * other player in a room. Strategies are pluggable so that the targeting PR
 * can introduce new strategies (attacker, defender, random, biased) without
 * touching distribution / queueing code.
 */

import type { PlayerId } from "./types.js";

/** One line-allocation output from a targeting strategy. */
export interface TargetAllocation {
  playerId: PlayerId;
  lines: number;
}

/** Contextual inputs passed to every `resolveTargets` call. */
export interface TargetingContext {
  /** Total garbage lines the sender is distributing in this placement. */
  linesToSend: number;
  /** Optional RNG hook for non-deterministic strategies. */
  rng?: () => number;
}

/**
 * Pluggable targeting strategy.
 *
 * Implementations must:
 * - Exclude the sender from the output.
 * - Return at most one entry per player.
 * - Omit zero-line allocations.
 * - Sum allocated lines to at most `context.linesToSend`.
 */
export interface TargetingStrategy {
  resolveTargets(
    sender: PlayerId,
    players: readonly PlayerId[],
    context: TargetingContext,
  ): TargetAllocation[];
}

/**
 * Default strategy: even split across all opponents.
 *
 * Distributes `floor(linesToSend / n)` base lines to each opponent and
 * parcels out the remainder one line at a time starting from index 0
 * (deterministic ordering based on the `players` array). Zero-line
 * allocations are omitted.
 */
export const evenSplitStrategy: TargetingStrategy = {
  resolveTargets(sender, players, context) {
    const opponents = players.filter((id) => id !== sender);
    const n = opponents.length;
    if (n === 0 || context.linesToSend <= 0) return [];

    const base = Math.floor(context.linesToSend / n);
    let remainder = context.linesToSend - base * n;

    const out: TargetAllocation[] = [];
    for (const playerId of opponents) {
      const lines = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      if (lines > 0) out.push({ playerId, lines });
    }
    return out;
  },
};
