/**
 * Atmosphere engine types — the data-layer contract for PR pr-c052338.
 *
 * Pure data types. No React, no DOM, no engine coupling beyond the shared
 * LineClearEvent structure.
 */

import type { LineClearEvent, GameStatus } from "@tetris/shared";

/** Multiplayer signal inputs. Populated in multiplayer games; zeros in solo. */
export interface MultiplayerSignals {
  opponentCount: number;
  eliminations: number;
  garbageSent: number;
  /** Cumulative garbage lines received. Delta is used for event detection. */
  garbageReceivedTotal: number;
}

/** Everything the atmosphere engine needs for one update tick. */
export interface GameSignals {
  status: GameStatus;
  level: number;
  /** Number of non-empty rows, measured from the bottom. 0..BOARD_VISIBLE_HEIGHT. */
  stackHeight: number;
  /** Current combo counter; -1 means inactive. */
  combo: number;
  /** Current back-to-back counter; -1 means inactive. */
  b2b: number;
  /** Cumulative cleared lines. Delta drives lineClear events. */
  linesCleared: number;
  /** Pending garbage line total (sum across batches). */
  pendingGarbage: number;
  /** Optional last line-clear event for tSpin/tetris classification. */
  lastLineClear?: LineClearEvent | null;
  multiplayer?: MultiplayerSignals;
}

export type AtmosphereEventType =
  | "lineClear"
  | "tSpin"
  | "tetris"
  | "levelUp"
  | "garbageReceived"
  | "garbageSent"
  | "opponentEliminated";

export interface AtmosphereEvent {
  type: AtmosphereEventType;
  /** Numeric payload — lines cleared, garbage received, new level, etc. */
  magnitude: number;
}

/** The continuous + discrete output of the atmosphere engine. */
export interface AtmosphereState {
  /** 0..1 — overall energy from level + stack pressure. */
  intensity: number;
  /** 0..1 — how close the player is to topping out. */
  danger: number;
  /** 0..1 — combo/b2b streak energy. */
  momentum: number;
  /** Events detected on the most recent update tick (cleared each tick). */
  events: readonly AtmosphereEvent[];
}

export const BOARD_VISIBLE_HEIGHT = 20;

export const INITIAL_ATMOSPHERE_STATE: AtmosphereState = {
  intensity: 0,
  danger: 0,
  momentum: 0,
  events: [],
};
