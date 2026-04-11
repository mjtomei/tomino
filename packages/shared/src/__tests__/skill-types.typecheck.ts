/**
 * Type compilation check for skill types.
 * This file is never executed — it only needs to compile.
 * If `tsc -b` passes, these types are correctly defined and importable.
 */

import type {
  PlayerProfile,
  PerformanceMetrics,
  MatchResult,
  SkillStore,
} from "../skill-types.js";

// --- PlayerProfile ---
const profile: PlayerProfile = {
  username: "alice",
  rating: 1500,
  ratingDeviation: 350,
  volatility: 0.06,
  gamesPlayed: 0,
};
profile satisfies PlayerProfile;

// --- PerformanceMetrics ---
const metrics: PerformanceMetrics = {
  apm: 60,
  pps: 1.5,
  linesCleared: 40,
  tSpins: 3,
  maxCombo: 7,
};
metrics satisfies PerformanceMetrics;

// --- MatchResult ---
const result: MatchResult = {
  gameId: "game-001",
  winner: "alice",
  loser: "bob",
  metrics: { alice: metrics, bob: metrics },
  timestamp: Date.now(),
};
result satisfies MatchResult;

// MatchResult with optional ratingChanges
const resultWithRatings: MatchResult = {
  ...result,
  ratingChanges: {
    alice: { before: 1500, after: 1520 },
    bob: { before: 1500, after: 1480 },
  },
};
resultWithRatings satisfies MatchResult;

// --- SkillStore interface shape check ---
// Verify method signatures
type _GetPlayer = (username: string) => Promise<PlayerProfile | null>;
type _UpsertPlayer = (profile: PlayerProfile) => Promise<void>;
type _GetLeaderboard = () => Promise<PlayerProfile[]>;
type _GetMatchHistory = (username: string, limit: number) => Promise<MatchResult[]>;
type _SaveMatchResult = (result: MatchResult) => Promise<void>;

// These assignments verify the interface methods match expected signatures
const _checkMethods = (store: SkillStore) => {
  const _gp: _GetPlayer = store.getPlayer;
  const _up: _UpsertPlayer = store.upsertPlayer;
  const _gl: _GetLeaderboard = store.getLeaderboard;
  const _gmh: _GetMatchHistory = store.getMatchHistory;
  const _smr: _SaveMatchResult = store.saveMatchResult;
  void [_gp, _up, _gl, _gmh, _smr];
};
void _checkMethods;

// Suppress unused variable warnings
void [profile, metrics, result, resultWithRatings];
