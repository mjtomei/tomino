/** Handicap modifiers for a directed sender→receiver pair.
 *  All fields are multipliers (0.0–1.0 reduces, 1.0 = no change). */
export interface HandicapModifiers {
  /** Multiplier applied to garbage line count (0.0 = full immunity). */
  garbageMultiplier: number;
  /** Multiplier for garbage delay window. */
  delayModifier: number;
  /** Multiplier for garbage gap randomization (lower = cleaner). */
  messinessFactor: number;
}

/** Modifier matrix for all sender→receiver pairs in a game.
 *  Key format: `${senderUsername}→${receiverUsername}`. */
export type ModifierMatrix = Map<string, HandicapModifiers>;

/** Build a ModifierMatrix key from sender and receiver usernames. */
export type ModifierMatrixKey = `${string}→${string}`;

/** Construct a modifier matrix key. */
export function modifierKey(sender: string, receiver: string): ModifierMatrixKey {
  return `${sender}→${receiver}`;
}

/** Weight distribution across opponents for auto-targeting.
 *  Keyed by opponent username, values are relative weights (sum to 1.0). */
export type TargetingBias = Record<string, number>;

/** Handicap intensity levels. */
export type HandicapIntensity = "off" | "light" | "standard" | "heavy";

/** Handicap mode: boost-only (default) or symmetric. */
export type HandicapMode = "boost" | "symmetric";

/** Lobby-configurable handicap settings. */
export interface HandicapSettings {
  intensity: HandicapIntensity;
  mode: HandicapMode;
  /** Auto-targeting bias strength: 0.0 = uniform, 1.0 = fully skill-weighted. */
  targetingBiasStrength: number;
  /** Whether to apply delay modifiers to garbage. Off by default. */
  delayEnabled?: boolean;
  /** Whether to apply messiness modifiers to garbage. Off by default. */
  messinessEnabled?: boolean;
}
