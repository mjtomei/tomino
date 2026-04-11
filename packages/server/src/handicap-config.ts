import type { HandicapIntensity } from "@tetris/shared";

/** Tunable parameters for the handicap sigmoid curve. */
export interface HandicapCurveConfig {
  /** Sigmoid slope — higher values make the curve steeper. Default: 0.01 */
  steepness: number;
  /** Rating gap at which garbageMultiplier = 0.5. Default: 400 */
  midpoint: number;
  /** How much delay scales per unit of normalized gap. Default: 0.5 */
  delayScale: number;
  /** How much messiness reduces per unit of normalized gap. Default: 0.3 */
  messinessScale: number;
  /**
   * Fraction of the full gap applied to the weaker player's outgoing garbage
   * in symmetric mode. Default: 0.5
   */
  symmetricFactor: number;
}

export const DEFAULT_CURVE_CONFIG: HandicapCurveConfig = {
  steepness: 0.01,
  midpoint: 400,
  delayScale: 0.5,
  messinessScale: 0.3,
  symmetricFactor: 0.5,
};

/** Intensity multiplier applied to the configured steepness. */
const INTENSITY_SCALE: Record<HandicapIntensity, number> = {
  off: 0,
  light: 0.5,
  standard: 1.0,
  heavy: 1.5,
};

/** Returns the effective steepness after applying intensity scaling. */
export function effectiveSteepness(
  baseSteepness: number,
  intensity: HandicapIntensity,
): number {
  return baseSteepness * INTENSITY_SCALE[intensity];
}
