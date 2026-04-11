/**
 * Type compilation check for handicap types.
 * This file is never executed — it only needs to compile.
 * If `tsc -b` passes, these types are correctly defined and importable.
 */

import type {
  HandicapModifiers,
  ModifierMatrix,
  ModifierMatrixKey,
  TargetingBias,
  HandicapIntensity,
  HandicapMode,
  HandicapSettings,
} from "../handicap-types.js";

import { modifierKey } from "../handicap-types.js";

// --- HandicapModifiers ---
const mods: HandicapModifiers = {
  garbageMultiplier: 0.6,
  delayModifier: 1.0,
  messinessFactor: 0.8,
};
mods satisfies HandicapModifiers;

// --- ModifierMatrix ---
const matrix: ModifierMatrix = new Map();
const key: ModifierMatrixKey = modifierKey("alice", "bob");
matrix.set(key, mods);
// Access may be undefined due to noUncheckedIndexedAccess (Map.get returns T | undefined)
const _retrieved: HandicapModifiers | undefined = matrix.get(key);
void _retrieved;

// --- TargetingBias ---
const bias: TargetingBias = {
  alice: 0.6,
  bob: 0.4,
};
bias satisfies TargetingBias;

// Empty bias (valid for 2-player where targeting is a no-op)
const emptyBias: TargetingBias = {};
emptyBias satisfies TargetingBias;

// --- HandicapIntensity ---
const intensities: HandicapIntensity[] = ["off", "light", "standard", "heavy"];
void intensities;

// --- HandicapMode ---
const modes: HandicapMode[] = ["boost", "symmetric"];
void modes;

// --- HandicapSettings ---
const settingsMinimal: HandicapSettings = {
  intensity: "standard",
  mode: "boost",
  targetingBiasStrength: 0.7,
};
settingsMinimal satisfies HandicapSettings;

const settingsFull: HandicapSettings = {
  intensity: "heavy",
  mode: "symmetric",
  targetingBiasStrength: 1.0,
  delayEnabled: true,
  messinessEnabled: true,
};
settingsFull satisfies HandicapSettings;

// Suppress unused variable warnings
void [mods, matrix, key, bias, emptyBias, settingsMinimal, settingsFull];
