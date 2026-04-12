/**
 * Loads and validates the balancing configuration file.
 *
 * Reads `balancing-config.json` from the data directory (or project root as
 * fallback), merges with hardcoded defaults, and exports typed config objects
 * consumable by existing modules.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RatingConfig } from "./rating-config.js";
import { GLICKO_CONFIG } from "./rating-config.js";
import type { HandicapCurveConfig } from "./handicap-config.js";
import { DEFAULT_CURVE_CONFIG } from "./handicap-config.js";
import type { HandicapIntensity, HandicapMode } from "@tetris/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntensityPresets {
  off: number;
  light: number;
  standard: number;
  heavy: number;
}

export interface DefaultHandicapSettings {
  intensity: HandicapIntensity;
  mode: HandicapMode;
  targetingBiasStrength: number;
  delayEnabled: boolean;
  messinessEnabled: boolean;
}

export interface BalancingConfig {
  rating: RatingConfig;
  handicapCurve: HandicapCurveConfig;
  intensityPresets: IntensityPresets;
  defaultHandicap: DefaultHandicapSettings;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_INTENSITY_PRESETS: IntensityPresets = {
  off: 0,
  light: 0.5,
  standard: 1.0,
  heavy: 1.5,
};

const DEFAULT_HANDICAP_SETTINGS: DefaultHandicapSettings = {
  intensity: "off",
  mode: "boost",
  targetingBiasStrength: 0.7,
  delayEnabled: false,
  messinessEnabled: false,
};

const DEFAULTS: BalancingConfig = {
  rating: { ...GLICKO_CONFIG },
  handicapCurve: { ...DEFAULT_CURVE_CONFIG },
  intensityPresets: { ...DEFAULT_INTENSITY_PRESETS },
  defaultHandicap: { ...DEFAULT_HANDICAP_SETTINGS },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function assertNumber(val: unknown, path: string): asserts val is number {
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new Error(`Invalid config: ${path} must be a finite number, got ${val}`);
  }
}

function assertPositive(val: unknown, path: string): void {
  assertNumber(val, path);
  if (val <= 0) {
    throw new Error(`Invalid config: ${path} must be positive, got ${val}`);
  }
}

function assertNonNegative(val: unknown, path: string): void {
  assertNumber(val, path);
  if (val < 0) {
    throw new Error(`Invalid config: ${path} must be non-negative, got ${val}`);
  }
}

function assertRange(val: unknown, path: string, min: number, max: number): void {
  assertNumber(val, path);
  if (val < min || val > max) {
    throw new Error(`Invalid config: ${path} must be in [${min}, ${max}], got ${val}`);
  }
}

const VALID_INTENSITIES = new Set<string>(["off", "light", "standard", "heavy"]);
const VALID_MODES = new Set<string>(["boost", "symmetric"]);

function validateConfig(config: BalancingConfig): void {
  // Rating
  assertPositive(config.rating.INITIAL_RATING, "rating.initialRating");
  assertPositive(config.rating.INITIAL_RD, "rating.initialRD");
  assertPositive(config.rating.INITIAL_VOLATILITY, "rating.initialVolatility");
  assertPositive(config.rating.TAU, "rating.tau");
  assertNonNegative(config.rating.CALIBRATION_GAMES, "rating.calibrationGames");
  assertNonNegative(config.rating.CALIBRATION_RD_FLOOR, "rating.calibrationRDFloor");

  // Handicap curve
  assertPositive(config.handicapCurve.steepness, "handicapCurve.steepness");
  assertPositive(config.handicapCurve.midpoint, "handicapCurve.midpoint");
  assertNonNegative(config.handicapCurve.delayScale, "handicapCurve.delayScale");
  assertNonNegative(config.handicapCurve.messinessScale, "handicapCurve.messinessScale");
  assertRange(config.handicapCurve.symmetricFactor, "handicapCurve.symmetricFactor", 0, 1);

  // Intensity presets
  for (const key of Object.keys(config.intensityPresets)) {
    if (!VALID_INTENSITIES.has(key)) {
      throw new Error(`Invalid config: unknown intensity preset "${key}"`);
    }
    assertNonNegative(
      (config.intensityPresets as Record<string, number>)[key],
      `intensityPresets.${key}`,
    );
  }

  // Default handicap settings
  if (!VALID_INTENSITIES.has(config.defaultHandicap.intensity)) {
    throw new Error(
      `Invalid config: defaultHandicap.intensity must be one of ${[...VALID_INTENSITIES].join(", ")}`,
    );
  }
  if (!VALID_MODES.has(config.defaultHandicap.mode)) {
    throw new Error(
      `Invalid config: defaultHandicap.mode must be one of ${[...VALID_MODES].join(", ")}`,
    );
  }
  assertRange(
    config.defaultHandicap.targetingBiasStrength,
    "defaultHandicap.targetingBiasStrength",
    0,
    1,
  );
}

// ---------------------------------------------------------------------------
// JSON → typed config mapping
// ---------------------------------------------------------------------------

function mapRatingConfig(json: Record<string, unknown>): Partial<RatingConfig> {
  const result: Partial<RatingConfig> = {};
  if ("initialRating" in json) result.INITIAL_RATING = json.initialRating as number;
  if ("initialRD" in json) result.INITIAL_RD = json.initialRD as number;
  if ("initialVolatility" in json) result.INITIAL_VOLATILITY = json.initialVolatility as number;
  if ("tau" in json) result.TAU = json.tau as number;
  if ("calibrationGames" in json) result.CALIBRATION_GAMES = json.calibrationGames as number;
  if ("calibrationRDFloor" in json) result.CALIBRATION_RD_FLOOR = json.calibrationRDFloor as number;
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load balancing config from disk. Looks for `balancing-config.json` first in
 * `dataDir`, then in the project root. Falls back to hardcoded defaults if
 * not found.
 */
export function loadBalancingConfig(dataDir?: string): BalancingConfig {
  const candidates: string[] = [];
  if (dataDir) {
    candidates.push(join(resolve(dataDir), "balancing-config.json"));
  }
  // Project root (two levels up from packages/server/src)
  candidates.push(join(resolve("."), "balancing-config.json"));

  let raw: string | undefined;
  let loadedFrom: string | undefined;

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        raw = readFileSync(candidate, "utf-8");
        loadedFrom = candidate;
        break;
      } catch {
        // Ignore read errors, try next candidate
      }
    }
  }

  if (!raw) {
    console.warn("[balancing] No balancing-config.json found — using defaults");
    return { ...DEFAULTS };
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.warn(`[balancing] Failed to parse ${loadedFrom}: ${err} — using defaults`);
    return { ...DEFAULTS };
  }

  // Deep-merge each section with defaults
  const config: BalancingConfig = {
    rating: {
      ...DEFAULTS.rating,
      ...(json.rating ? mapRatingConfig(json.rating as Record<string, unknown>) : {}),
    },
    handicapCurve: {
      ...DEFAULTS.handicapCurve,
      ...(json.handicapCurve as Partial<HandicapCurveConfig> ?? {}),
    },
    intensityPresets: {
      ...DEFAULTS.intensityPresets,
      ...(json.intensityPresets as Partial<IntensityPresets> ?? {}),
    },
    defaultHandicap: {
      ...DEFAULTS.defaultHandicap,
      ...(json.defaultHandicap as Partial<DefaultHandicapSettings> ?? {}),
    },
  };

  validateConfig(config);

  console.log(`[balancing] Loaded config from ${loadedFrom}`);
  return config;
}

/**
 * Returns a deep copy of the hardcoded defaults (useful for tests).
 */
export function getDefaultBalancingConfig(): BalancingConfig {
  return {
    rating: { ...DEFAULTS.rating },
    handicapCurve: { ...DEFAULTS.handicapCurve },
    intensityPresets: { ...DEFAULTS.intensityPresets },
    defaultHandicap: { ...DEFAULTS.defaultHandicap },
  };
}
