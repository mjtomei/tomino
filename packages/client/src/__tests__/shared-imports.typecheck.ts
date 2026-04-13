/**
 * Verify that skill and handicap types are importable from @tomino/shared
 * in the client package (bundler module resolution).
 */

import type {
  PlayerProfile,
  PerformanceMetrics,
  MatchResult,
  SkillStore,
  HandicapModifiers,
  ModifierMatrix,
  TargetingBias,
  HandicapSettings,
} from "@tomino/shared";

import { modifierKey } from "@tomino/shared";

// Quick shape checks — if this compiles, imports work
const _profile: PlayerProfile = {
  username: "test",
  rating: 1500,
  ratingDeviation: 350,
  volatility: 0.06,
  gamesPlayed: 0,
};

const _metrics: PerformanceMetrics = {
  apm: 0,
  pps: 0,
  linesCleared: 0,
  tSpins: 0,
  maxCombo: 0,
};

const _result: MatchResult = {
  gameId: "g1",
  winner: "a",
  loser: "b",
  metrics: {},
  timestamp: 0,
};

const _mods: HandicapModifiers = {
  garbageMultiplier: 1,
  delayModifier: 1,
  messinessFactor: 1,
};

const _matrix: ModifierMatrix = new Map([[modifierKey("a", "b"), _mods]]);

const _bias: TargetingBias = { opponent: 1.0 };

const _settings: HandicapSettings = {
  intensity: "standard",
  mode: "boost",
  targetingBiasStrength: 0.7,
};

// Verify SkillStore is importable (used as a constraint below)
const _checkStore = (s: SkillStore) => s.getPlayer("test");

void [_profile, _metrics, _result, _mods, _matrix, _bias, _settings, _checkStore];
