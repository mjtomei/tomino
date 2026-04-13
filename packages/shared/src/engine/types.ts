/** Identifies a game mode. */
export type GameMode = "marathon" | "sprint" | "ultra" | "zen";

/**
 * Complete rule set configuration for a tetromino-stacking game.
 * Plain data — serializable (except `sdf: Infinity`) so it can be saved,
 * shared, and sent over the wire for multiplayer.
 */
export interface RuleSet {
  /** Human-readable name for this rule set. */
  name: string;

  // -- Rotation --

  /** Rotation system: SRS (4-state, wall kicks) or Classic (2-state I/S/Z, no kicks). */
  rotationSystem: "srs" | "classic";

  // -- Lock behavior --

  /** Lock delay in milliseconds. 0 = instant lock (classic). */
  lockDelay: number;
  /** Maximum move/rotate resets before forced lock. 0 = no resets. */
  lockResets: number;

  // -- Features --

  /** Whether the hold piece mechanic is available. */
  holdEnabled: boolean;
  /** Whether hard drop (instant drop + lock) is available. */
  hardDropEnabled: boolean;
  /** Whether the ghost piece (landing preview) is shown. */
  ghostEnabled: boolean;

  // -- Randomizer --

  /** Piece generation strategy. */
  randomizer: "7bag" | "pure-random";

  // -- Scoring --

  /** Scoring formula to use. */
  scoringSystem: "guideline" | "classic";

  // -- Gravity / speed --

  /** Level-to-drop-interval mapping. */
  gravityCurve: "guideline" | "classic";

  // -- DAS / ARR --

  /** Delayed Auto Shift — initial delay before auto-repeat, in ms. */
  das: number;
  /** Auto Repeat Rate — repeat interval in ms. 0 = instant. */
  arr: number;
  /** Soft Drop Factor — gravity multiplier during soft drop. Infinity = instant. */
  sdf: number;

  // -- Starting level --

  /** Default starting level for this rule set (0 for classic, 1 for modern). */
  startLevel: number;

  // -- Preview --

  /** Number of next pieces shown (0–6). */
  previewCount: number;
}

/** What kind of goal ends a game mode (besides top-out). */
export type GameGoal = "none" | "lines" | "time" | "level";

/** Configuration for a game mode — controls start/end conditions and display. */
export interface GameModeConfig {
  /** Which mode this config represents. */
  mode: GameMode;
  /** What type of goal ends the game. */
  goal: GameGoal;
  /** Target value for the goal (40 lines, 180000 ms, etc.), or null if no target. */
  goalValue: number | null;
  /** Whether gravity applies. False for Zen. */
  gravity: boolean;
  /** Whether topping out ends the game. False for Zen. */
  topOutEndsGame: boolean;
  /** Stats to display in the UI during this mode. */
  displayStats: readonly string[];
}
