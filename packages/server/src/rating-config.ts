/** Tunable constants for the Glicko-2 rating system. */
export interface RatingConfig {
  /** Starting rating for new players. */
  INITIAL_RATING: number;
  /** Starting rating deviation for new players. */
  INITIAL_RD: number;
  /** Starting volatility for new players. */
  INITIAL_VOLATILITY: number;
  /** System constant constraining volatility change over time. */
  TAU: number;
  /** Number of games in the calibration period. */
  CALIBRATION_GAMES: number;
  /** Minimum RD during calibration for faster convergence. */
  CALIBRATION_RD_FLOOR: number;
}

export const GLICKO_CONFIG: RatingConfig = {
  INITIAL_RATING: 1500,
  INITIAL_RD: 350,
  INITIAL_VOLATILITY: 0.06,
  TAU: 0.5,
  CALIBRATION_GAMES: 10,
  CALIBRATION_RD_FLOOR: 200,
};
