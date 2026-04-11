import type { GameMode, GameModeConfig, RuleSet } from "./types.js";

// ---------------------------------------------------------------------------
// Rule set presets
// ---------------------------------------------------------------------------

/** Classic (NES-style) rule set. */
export function classicRuleSet(): RuleSet {
  return {
    name: "Classic",
    rotationSystem: "nrs",
    lockDelay: 0,
    lockResets: 0,
    holdEnabled: false,
    hardDropEnabled: false,
    ghostEnabled: false,
    randomizer: "pure-random",
    scoringSystem: "nes",
    gravityCurve: "nes",
    das: 267,
    arr: 100,
    sdf: 2,
    previewCount: 1,
  };
}

/** Modern (Guideline / tetr.io-style) rule set. */
export function modernRuleSet(): RuleSet {
  return {
    name: "Modern",
    rotationSystem: "srs",
    lockDelay: 500,
    lockResets: 15,
    holdEnabled: true,
    hardDropEnabled: true,
    ghostEnabled: true,
    randomizer: "7bag",
    scoringSystem: "guideline",
    gravityCurve: "guideline",
    das: 133,
    arr: 10,
    sdf: Infinity,
    previewCount: 5,
  };
}

/**
 * Create a custom rule set by applying partial overrides on top of a base preset.
 *
 * @param base - The base rule set to start from.
 * @param overrides - Fields to override. Omitted fields keep their base values.
 * @returns A new RuleSet with overrides applied.
 */
export function customRuleSet(
  base: RuleSet,
  overrides: Partial<RuleSet>,
): RuleSet {
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Game mode definitions
// ---------------------------------------------------------------------------

/** Marathon — endless play until top-out. */
export const marathonMode: GameModeConfig = {
  mode: "marathon",
  goal: "none",
  goalValue: null,
  gravity: true,
  topOutEndsGame: true,
  displayStats: ["score", "level", "lines"],
};

/** Sprint (40L) — clear 40 lines as fast as possible. */
export const sprintMode: GameModeConfig = {
  mode: "sprint",
  goal: "lines",
  goalValue: 40,
  gravity: true,
  topOutEndsGame: true,
  displayStats: ["timer", "linesRemaining"],
};

/** Ultra — maximize score within a 3-minute time limit. */
export const ultraMode: GameModeConfig = {
  mode: "ultra",
  goal: "time",
  goalValue: 180_000,
  gravity: true,
  topOutEndsGame: true,
  displayStats: ["timer", "score"],
};

/** Zen — no gravity, no game over. Practice mode. */
export const zenMode: GameModeConfig = {
  mode: "zen",
  goal: "none",
  goalValue: null,
  gravity: false,
  topOutEndsGame: false,
  displayStats: ["lines", "score"],
};

/** All game mode configs, keyed by mode name. */
export const gameModes: Record<GameMode, GameModeConfig> = {
  marathon: marathonMode,
  sprint: sprintMode,
  ultra: ultraMode,
  zen: zenMode,
};
