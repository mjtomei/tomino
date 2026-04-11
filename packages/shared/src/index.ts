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

export type {
  RankLabel,
  RankThreshold,
  RatingPoint,
  StatsResponse,
} from "./stats-types.js";

export { RANK_THRESHOLDS, getRankLabel } from "./stats-types.js";

export type {
  GameGoal,
  GameMode,
  GameModeConfig,
  RuleSet,
} from "./engine/types.js";

export {
  classicRuleSet,
  customRuleSet,
  gameModes,
  marathonMode,
  modernRuleSet,
  sprintMode,
  ultraMode,
  zenMode,
} from "./engine/rulesets.js";

export type {
  PieceType,
  Rotation,
  PieceShape,
} from "./engine/pieces.js";

export { ALL_PIECES, ALL_ROTATIONS } from "./engine/pieces.js";

export type {
  KickOffset,
  RotationSystem,
} from "./engine/rotation.js";

export { SRSRotation } from "./engine/rotation-srs.js";
export { NRSRotation } from "./engine/rotation-nrs.js";

export type { Randomizer } from "./engine/randomizer.js";
export { createRandomizer, seededRng } from "./engine/randomizer.js";
export { SevenBagRandomizer } from "./engine/randomizer-7bag.js";
export { PureRandomRandomizer } from "./engine/randomizer-pure.js";

export type { HoldState, HoldResult } from "./engine/hold.js";
export { createHoldState, holdPiece, resetHoldFlag } from "./engine/hold.js";

export type {
  LineClearCount,
  TSpinType,
  ScoringState,
  ScoringSystem,
} from "./engine/scoring.js";

export { createScoringState, detectTSpin } from "./engine/scoring.js";
export { GuidelineScoring } from "./engine/scoring-guideline.js";
export { NESScoring } from "./engine/scoring-nes.js";
export { guidelineDropInterval, nesDropInterval } from "./engine/gravity.js";

export type { Cell, Grid } from "./engine/board.js";

export {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BUFFER_HEIGHT,
  VISIBLE_HEIGHT,
  clearLines,
  createGrid,
  findCompletedRows,
  placePiece,
} from "./engine/board.js";
