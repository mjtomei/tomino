/**
 * Targeting strategy implementations.
 *
 * Four player-selectable strategies that each send all garbage to a single
 * target (standard Tetris 99 behavior):
 *
 * - Random — pick a random alive opponent
 * - Attackers — target someone who is targeting you; fall back to random
 * - KOs — target the opponent closest to topping out; fall back to random on tie
 * - Manual — target the player's explicitly chosen opponent; fall back to random
 */

import type {
  PlayerId,
  TargetAllocation,
  TargetingStrategy,
  TargetingStrategyType,
} from "@tomino/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom(
  opponents: PlayerId[],
  rng: () => number,
): PlayerId | undefined {
  if (opponents.length === 0) return undefined;
  return opponents[Math.floor(rng() * opponents.length)];
}

function singleTarget(
  target: PlayerId,
  lines: number,
): TargetAllocation[] {
  if (lines <= 0) return [];
  return [{ playerId: target, lines }];
}

// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------

export const randomStrategy: TargetingStrategy = {
  resolveTargets(sender, players, context) {
    const opponents = players.filter((id) => id !== sender);
    if (opponents.length === 0 || context.linesToSend <= 0) return [];
    const rng = context.rng ?? Math.random;
    const target = pickRandom(opponents, rng)!;
    return singleTarget(target, context.linesToSend);
  },
};

export const attackersStrategy: TargetingStrategy = {
  resolveTargets(sender, players, context) {
    const opponents = players.filter((id) => id !== sender);
    if (opponents.length === 0 || context.linesToSend <= 0) return [];
    const rng = context.rng ?? Math.random;

    // Find opponents whose stable targeting points at sender
    const graph = context.attackerGraph ?? {};
    const attackers = opponents.filter((id) => graph[id] === sender);

    if (attackers.length > 0) {
      const target = pickRandom(attackers, rng)!;
      return singleTarget(target, context.linesToSend);
    }

    // Fall back to random
    const target = pickRandom(opponents, rng)!;
    return singleTarget(target, context.linesToSend);
  },
};

export const kosStrategy: TargetingStrategy = {
  resolveTargets(sender, players, context) {
    const opponents = players.filter((id) => id !== sender);
    if (opponents.length === 0 || context.linesToSend <= 0) return [];
    const rng = context.rng ?? Math.random;

    const heights = context.boardHeights;
    if (!heights) {
      // No height info — fall back to random
      return randomStrategy.resolveTargets(sender, players, context);
    }

    // Find opponent(s) with highest board (closest to topping out)
    let maxHeight = -1;
    for (const id of opponents) {
      const h = heights[id] ?? 0;
      if (h > maxHeight) maxHeight = h;
    }

    const candidates = opponents.filter(
      (id) => (heights[id] ?? 0) === maxHeight,
    );

    const target = pickRandom(candidates, rng)!;
    return singleTarget(target, context.linesToSend);
  },
};

export const manualStrategy: TargetingStrategy = {
  resolveTargets(sender, players, context) {
    const opponents = players.filter((id) => id !== sender);
    if (opponents.length === 0 || context.linesToSend <= 0) return [];
    const rng = context.rng ?? Math.random;

    const target = context.manualTarget;
    if (target && opponents.includes(target)) {
      return singleTarget(target, context.linesToSend);
    }

    // Target dead or not set — fall back to random
    const fallback = pickRandom(opponents, rng)!;
    return singleTarget(fallback, context.linesToSend);
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const STRATEGY_MAP: Record<TargetingStrategyType, TargetingStrategy> = {
  random: randomStrategy,
  attackers: attackersStrategy,
  kos: kosStrategy,
  manual: manualStrategy,
};

/** Look up the concrete strategy implementation for a strategy type. */
export function getStrategy(type: TargetingStrategyType): TargetingStrategy {
  return STRATEGY_MAP[type];
}
