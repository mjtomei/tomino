import type { PlayerProfile } from "@tomino/shared";
import { GLICKO_CONFIG, type RatingConfig } from "./rating-config.js";

/** Glicko-2 scale factor: 173.7178 per the Glickman paper. */
const SCALE = 173.7178;

/** Convergence tolerance for the volatility iteration. */
const EPSILON = 1e-6;

/** Maximum iterations for the volatility algorithm (safety bound). */
const MAX_ITERATIONS = 50;

// ---------------------------------------------------------------------------
// Glicko-2 scale conversions
// ---------------------------------------------------------------------------

function toGlicko2(rating: number, rd: number, cfg: RatingConfig): { mu: number; phi: number } {
  return {
    mu: (rating - cfg.INITIAL_RATING) / SCALE,
    phi: rd / SCALE,
  };
}

function fromGlicko2(mu: number, phi: number, cfg: RatingConfig): { rating: number; rd: number } {
  return {
    rating: mu * SCALE + cfg.INITIAL_RATING,
    rd: phi * SCALE,
  };
}

// ---------------------------------------------------------------------------
// Glicko-2 helper functions
// ---------------------------------------------------------------------------

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

// ---------------------------------------------------------------------------
// Volatility update via Illinois method (Glickman 2013, Step 5)
// ---------------------------------------------------------------------------

function computeNewVolatility(
  sigma: number,
  phi: number,
  v: number,
  delta: number,
  tau: number,
): number {
  const a = Math.log(sigma * sigma);
  const tau2 = tau * tau;
  const phi2 = phi * phi;
  const delta2 = delta * delta;

  function f(x: number): number {
    const ex = Math.exp(x);
    const num1 = ex * (delta2 - phi2 - v - ex);
    const den1 = 2 * (phi2 + v + ex) * (phi2 + v + ex);
    return num1 / den1 - (x - a) / tau2;
  }

  // Initial bracket: A = a, B chosen per the paper
  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    B = a - k * tau;
    while (f(B) < 0) {
      k++;
      B = a - k * tau;
    }
  }

  let fA = f(A);
  let fB = f(B);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (Math.abs(B - A) < EPSILON) break;

    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);

    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      // Illinois step: halve fA
      fA = fA / 2;
    }

    B = C;
    fB = fC;
  }

  return Math.exp(A / 2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute updated ratings for a winner/loser pair using the Glicko-2 algorithm.
 *
 * Pure function — no mutations, no side effects.
 * Returns new PlayerProfile objects with updated rating, ratingDeviation,
 * volatility, and gamesPlayed.
 */
export function updateRatings(
  winner: PlayerProfile,
  loser: PlayerProfile,
  config?: Partial<RatingConfig>,
): { winner: PlayerProfile; loser: PlayerProfile } {
  const cfg: RatingConfig = { ...GLICKO_CONFIG, ...config };

  // Step 1: Convert to Glicko-2 scale
  const w = toGlicko2(winner.rating, winner.ratingDeviation, cfg);
  const l = toGlicko2(loser.rating, loser.ratingDeviation, cfg);

  // Step 2: Compute g, E, and v for each player
  // Winner (score = 1)
  const gPhiL = g(l.phi);
  const eW = expectedScore(w.mu, l.mu, l.phi);
  const vW = 1 / (gPhiL * gPhiL * eW * (1 - eW));
  const deltaW = vW * gPhiL * (1 - eW);

  // Loser (score = 0)
  const gPhiW = g(w.phi);
  const eL = expectedScore(l.mu, w.mu, w.phi);
  const vL = 1 / (gPhiW * gPhiW * eL * (1 - eL));
  const deltaL = vL * gPhiW * (0 - eL);

  // Step 3: Compute new volatility
  const sigmaW = computeNewVolatility(winner.volatility, w.phi, vW, deltaW, cfg.TAU);
  const sigmaL = computeNewVolatility(loser.volatility, l.phi, vL, deltaL, cfg.TAU);

  // Step 4: Pre-rating period RD update (φ* = sqrt(φ² + σ'²))
  const phiStarW = Math.sqrt(w.phi * w.phi + sigmaW * sigmaW);
  const phiStarL = Math.sqrt(l.phi * l.phi + sigmaL * sigmaL);

  // Step 5: New RD (φ' = 1 / sqrt(1/φ*² + 1/v))
  const phiPrimeW = 1 / Math.sqrt(1 / (phiStarW * phiStarW) + 1 / vW);
  const phiPrimeL = 1 / Math.sqrt(1 / (phiStarL * phiStarL) + 1 / vL);

  // Step 6: New rating (μ' = μ + φ'² × g(φ_j) × (s - E))
  const muPrimeW = w.mu + phiPrimeW * phiPrimeW * gPhiL * (1 - eW);
  const muPrimeL = l.mu + phiPrimeL * phiPrimeL * gPhiW * (0 - eL);

  // Convert back to Glicko scale
  const wResult = fromGlicko2(muPrimeW, phiPrimeW, cfg);
  const lResult = fromGlicko2(muPrimeL, phiPrimeL, cfg);

  // Apply calibration RD floor
  const wGames = winner.gamesPlayed + 1;
  const lGames = loser.gamesPlayed + 1;

  const wRd = wGames <= cfg.CALIBRATION_GAMES
    ? Math.max(wResult.rd, cfg.CALIBRATION_RD_FLOOR)
    : wResult.rd;
  const lRd = lGames <= cfg.CALIBRATION_GAMES
    ? Math.max(lResult.rd, cfg.CALIBRATION_RD_FLOOR)
    : lResult.rd;

  return {
    winner: {
      username: winner.username,
      rating: wResult.rating,
      ratingDeviation: wRd,
      volatility: sigmaW,
      gamesPlayed: wGames,
    },
    loser: {
      username: loser.username,
      rating: lResult.rating,
      ratingDeviation: lRd,
      volatility: sigmaL,
      gamesPlayed: lGames,
    },
  };
}
