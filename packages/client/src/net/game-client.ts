/**
 * Client-side game session state.
 *
 * Holds the data received from the server when a game starts:
 * player index, seed, and initial game state snapshots.
 */

import type {
  GameStateSnapshot,
  HandicapMode,
  HandicapModifiers,
  PlayerId,
} from "@tetris/shared";

export interface GameSessionData {
  /** Shared random seed for deterministic piece generation. */
  seed: number;
  /** Maps each player ID to their 0-based player index. */
  playerIndexes: Record<PlayerId, number>;
  /** Per-player initial snapshots keyed by player ID. */
  initialStates: Record<PlayerId, GameStateSnapshot>;
  /** Serialized modifier matrix (key: "sender→receiver"). */
  handicapModifiers?: Record<string, HandicapModifiers>;
  /** Handicap mode (boost or symmetric). */
  handicapMode?: HandicapMode;
}
