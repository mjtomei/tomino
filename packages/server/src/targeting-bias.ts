/**
 * Skill-aware targeting bias.
 *
 * Computes a weighted probability distribution across opponents based on
 * skill ratings. Stronger players' garbage skews toward other strong players;
 * weaker players' garbage skews toward their highest-rated opponent.
 *
 * The bias strength parameter (0.0–1.0) interpolates between uniform random
 * and fully skill-weighted targeting.
 */

import type {
  PlayerId,
  TargetAllocation,
  TargetingContext,
  TargetingStrategy,
} from "@tetris/shared";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TargetingBiasConfig {
  /** Player skill ratings keyed by PlayerId. */
  ratings: Record<PlayerId, number>;
  /** Bias strength: 0.0 = uniform, 1.0 = fully skill-weighted. */
  biasStrength: number;
}

// ---------------------------------------------------------------------------
// Weight computation
// ---------------------------------------------------------------------------

/**
 * Compute targeting weights for a sender against alive opponents.
 *
 * - Strong senders (above median): weight proportional to opponent rating
 *   (garbage goes toward other strong players).
 * - Weak senders (at or below median): weight concentrated on the
 *   highest-rated opponent (biggest threat).
 *
 * The bias strength interpolates between uniform weights and the skill-based
 * weights: finalWeight = (1 - bias) * uniform + bias * skillWeight.
 */
export function computeTargetingWeights(
  sender: PlayerId,
  opponents: PlayerId[],
  config: TargetingBiasConfig,
): Record<PlayerId, number> {
  const n = opponents.length;
  if (n === 0) return {};

  const uniform = 1 / n;

  // If bias is 0, return uniform
  if (config.biasStrength <= 0) {
    const weights: Record<PlayerId, number> = {};
    for (const opp of opponents) {
      weights[opp] = uniform;
    }
    return weights;
  }

  const senderRating = config.ratings[sender] ?? 1500;

  // Compute median of all alive players (sender + opponents)
  const allRatings = [senderRating];
  for (const opp of opponents) {
    allRatings.push(config.ratings[opp] ?? 1500);
  }
  allRatings.sort((a, b) => a - b);
  const mid = Math.floor(allRatings.length / 2);
  const median =
    allRatings.length % 2 === 0
      ? (allRatings[mid - 1]! + allRatings[mid]!) / 2
      : allRatings[mid]!;

  const isStrong = senderRating > median;

  let skillWeights: Record<PlayerId, number>;

  if (isStrong) {
    // Strong sender: weight proportional to opponent rating
    skillWeights = computeRatingProportionalWeights(opponents, config.ratings);
  } else {
    // Weak sender: concentrate weight on highest-rated opponent
    skillWeights = computeHighestThreatWeights(opponents, config.ratings);
  }

  // Interpolate: final = (1 - bias) * uniform + bias * skillWeight
  const bias = config.biasStrength;
  const weights: Record<PlayerId, number> = {};
  for (const opp of opponents) {
    weights[opp] = (1 - bias) * uniform + bias * (skillWeights[opp] ?? 0);
  }

  return weights;
}

/**
 * Weights proportional to opponent ratings. Higher-rated opponents get more
 * weight. Normalized to sum to 1.
 */
function computeRatingProportionalWeights(
  opponents: PlayerId[],
  ratings: Record<PlayerId, number>,
): Record<PlayerId, number> {
  const weights: Record<PlayerId, number> = {};
  let total = 0;
  for (const opp of opponents) {
    const r = ratings[opp] ?? 1500;
    weights[opp] = r;
    total += r;
  }
  if (total === 0) {
    // All zero — uniform fallback
    const n = opponents.length;
    for (const opp of opponents) {
      weights[opp] = 1 / n;
    }
  } else {
    for (const opp of opponents) {
      weights[opp] = weights[opp]! / total;
    }
  }
  return weights;
}

/**
 * Concentrate weight on the highest-rated opponent.
 * If multiple opponents share the top rating, split evenly among them.
 * Other opponents get zero skill-weight (though bias interpolation means
 * they still have some chance via the uniform component).
 */
function computeHighestThreatWeights(
  opponents: PlayerId[],
  ratings: Record<PlayerId, number>,
): Record<PlayerId, number> {
  let maxRating = -Infinity;
  for (const opp of opponents) {
    const r = ratings[opp] ?? 1500;
    if (r > maxRating) maxRating = r;
  }

  const topOpponents = opponents.filter(
    (opp) => (ratings[opp] ?? 1500) === maxRating,
  );
  const topWeight = 1 / topOpponents.length;

  const weights: Record<PlayerId, number> = {};
  for (const opp of opponents) {
    weights[opp] = topOpponents.includes(opp) ? topWeight : 0;
  }
  return weights;
}

// ---------------------------------------------------------------------------
// Weighted target selection
// ---------------------------------------------------------------------------

/**
 * Select a target from the weighted distribution using the given RNG value.
 * The RNG should produce a value in [0, 1).
 */
export function selectWeightedTarget(
  weights: Record<PlayerId, number>,
  rng: () => number,
): PlayerId | undefined {
  const entries = Object.entries(weights);
  if (entries.length === 0) return undefined;

  const r = rng();
  let cumulative = 0;
  for (const [playerId, weight] of entries) {
    cumulative += weight;
    if (r < cumulative) return playerId;
  }
  // Floating-point edge case — return last entry
  return entries[entries.length - 1]![0];
}

// ---------------------------------------------------------------------------
// Strategy factory
// ---------------------------------------------------------------------------

/**
 * Create a TargetingStrategy that applies skill-based bias.
 *
 * In 2-player games or when bias is 0, falls through to single-target random.
 * Manual target contexts bypass this entirely (handled at call site).
 */
export function createSkillBiasStrategy(
  config: TargetingBiasConfig,
): TargetingStrategy {
  return {
    resolveTargets(
      sender: PlayerId,
      players: readonly PlayerId[],
      context: TargetingContext,
    ): TargetAllocation[] {
      const opponents = players.filter((id) => id !== sender);
      if (opponents.length === 0 || context.linesToSend <= 0) return [];

      // 2-player: no bias needed, single target
      if (opponents.length === 1) {
        return [{ playerId: opponents[0]!, lines: context.linesToSend }];
      }

      const rng = context.rng ?? Math.random;
      const weights = computeTargetingWeights(sender, opponents, config);
      const target = selectWeightedTarget(weights, rng);

      if (!target) return [];
      return [{ playerId: target, lines: context.linesToSend }];
    },
  };
}
