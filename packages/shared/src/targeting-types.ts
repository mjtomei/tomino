/**
 * Garbage targeting strategy interface.
 *
 * A strategy decides how many garbage lines a sender distributes to each
 * other player in a room. Strategies are pluggable so that the targeting PR
 * can introduce new strategies (attacker, defender, random, biased) without
 * touching distribution / queueing code.
 */

import type { PlayerId } from "./types.js";

// ---------------------------------------------------------------------------
// Player-selectable targeting strategy types
// ---------------------------------------------------------------------------

/** The four player-selectable targeting strategy types. */
export type TargetingStrategyType = "random" | "attackers" | "kos" | "manual";

export const ALL_TARGETING_STRATEGIES: readonly TargetingStrategyType[] = [
  "random",
  "attackers",
  "kos",
  "manual",
] as const;

/** Room-level targeting configuration. */
export interface TargetingSettings {
  /** Which strategies players may select. Must contain at least one. */
  enabledStrategies: TargetingStrategyType[];
  /** Initial strategy for all players. Must be in enabledStrategies. */
  defaultStrategy: TargetingStrategyType;
}

export const DEFAULT_TARGETING_SETTINGS: TargetingSettings = {
  enabledStrategies: ["random", "attackers", "kos", "manual"],
  defaultStrategy: "random",
};

// ---------------------------------------------------------------------------
// Strategy interface
// ---------------------------------------------------------------------------

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
  /** Board height (number of non-empty rows) per player, for KOs strategy. */
  boardHeights?: Record<PlayerId, number>;
  /**
   * Who each player is "stably" targeting (manual targets + attackers
   * retaliations). Used by the attackers strategy.
   */
  attackerGraph?: Record<PlayerId, PlayerId | null>;
  /** Explicit manual target for the sender, if set. */
  manualTarget?: PlayerId | null;
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
