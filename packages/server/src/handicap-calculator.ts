import type { HandicapModifiers, HandicapSettings, ModifierMatrix } from "@tetris/shared";
import { modifierKey } from "@tetris/shared";
import {
  type HandicapCurveConfig,
  DEFAULT_CURVE_CONFIG,
  effectiveSteepness,
} from "./handicap-config.js";

/** Identity modifiers — no handicap applied. */
const IDENTITY: HandicapModifiers = {
  garbageMultiplier: 1.0,
  delayModifier: 1.0,
  messinessFactor: 1.0,
};

/**
 * Core sigmoid: returns a value in (0, 1) that represents the garbage
 * multiplier for a given rating gap and curve parameters.
 *
 *   multiplier = 1 / (1 + exp(steepness * (gap - midpoint)))
 *
 * gap > 0 means sender is stronger than receiver.
 * At gap = 0   → ≈1.0 (with typical midpoint=400)
 * At gap = mid → 0.5
 * At gap >> mid → ≈0.0
 */
function sigmoidMultiplier(gap: number, steepness: number, midpoint: number): number {
  return 1 / (1 + Math.exp(steepness * (gap - midpoint)));
}

/**
 * Compute the normalized gap used for delay/messiness scaling.
 * Returns a value in [0, 1] representing how large the gap is relative to
 * the midpoint (capped at 1.0 when gap >= 2 * midpoint).
 */
function normalizedGap(gap: number, midpoint: number): number {
  if (gap <= 0) return 0;
  return Math.min(gap / (2 * midpoint), 1.0);
}

/**
 * Compute `HandicapModifiers` for a directed sender→receiver pair.
 *
 * Pure function — no server dependencies.
 */
export function computePairHandicap(
  senderRating: number,
  receiverRating: number,
  settings: HandicapSettings,
  config: HandicapCurveConfig = DEFAULT_CURVE_CONFIG,
): HandicapModifiers {
  // Intensity "off" → identity
  if (settings.intensity === "off") {
    return { ...IDENTITY };
  }

  const gap = senderRating - receiverRating;

  // Equal ratings → identity
  if (gap === 0) {
    return { ...IDENTITY };
  }

  const steepness = effectiveSteepness(config.steepness, settings.intensity);

  let garbageMultiplier: number;

  if (settings.mode === "boost") {
    // Boost mode: only reduce when sender is stronger (gap > 0)
    if (gap > 0) {
      garbageMultiplier = sigmoidMultiplier(gap, steepness, config.midpoint);
    } else {
      garbageMultiplier = 1.0;
    }
  } else {
    // Symmetric mode: both directions get reduced
    if (gap > 0) {
      // Stronger→weaker: full sigmoid reduction
      garbageMultiplier = sigmoidMultiplier(gap, steepness, config.midpoint);
    } else {
      // Weaker→stronger: reduced sigmoid with symmetric factor
      const effectiveGap = Math.abs(gap) * config.symmetricFactor;
      garbageMultiplier = sigmoidMultiplier(effectiveGap, steepness, config.midpoint);
    }
  }

  // Delay modifier: increases for stronger→weaker (gap > 0)
  let delayModifier = 1.0;
  if (settings.delayEnabled && gap > 0) {
    const norm = normalizedGap(gap, config.midpoint);
    delayModifier = 1.0 + config.delayScale * norm;
  }

  // Messiness factor: decreases (cleaner) for stronger→weaker (gap > 0)
  let messinessFactor = 1.0;
  if (settings.messinessEnabled && gap > 0) {
    const norm = normalizedGap(gap, config.midpoint);
    messinessFactor = Math.max(0.0, 1.0 - config.messinessScale * norm);
  }

  return { garbageMultiplier, delayModifier, messinessFactor };
}

/** Player descriptor for matrix computation. */
export interface PlayerRating {
  username: string;
  rating: number;
}

/**
 * Compute the full modifier matrix for all directed sender→receiver pairs.
 *
 * For N players, produces N*(N-1) entries.
 * Pure function — no server dependencies.
 */
export function computeModifierMatrix(
  players: PlayerRating[],
  settings: HandicapSettings,
  config: HandicapCurveConfig = DEFAULT_CURVE_CONFIG,
): ModifierMatrix {
  const matrix: ModifierMatrix = new Map();

  for (const sender of players) {
    for (const receiver of players) {
      if (sender.username === receiver.username) continue;
      const key = modifierKey(sender.username, receiver.username);
      matrix.set(key, computePairHandicap(sender.rating, receiver.rating, settings, config));
    }
  }

  return matrix;
}
