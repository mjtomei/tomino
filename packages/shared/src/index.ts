/**
 * @tetris/shared — shared types and game logic
 *
 * This package contains:
 * - Game state types (board, pieces, scoring)
 * - Network protocol types (for multiplayer)
 * - Message parsing/validation helpers
 * - Skill rating types
 * - Handicap types
 */

export * from "./types.js";
export * from "./protocol.js";
export * from "./messages.js";

export type {
  PlayerProfile,
  PerformanceMetrics,
  MatchResult,
  SkillStore,
} from "./skill-types.js";

export type {
  HandicapModifiers,
  ModifierMatrix,
  ModifierMatrixKey,
  TargetingBias,
  HandicapIntensity,
  HandicapMode,
  HandicapSettings,
} from "./handicap-types.js";

export { modifierKey } from "./handicap-types.js";
