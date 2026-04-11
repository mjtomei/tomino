/**
 * Hold piece logic — swap current piece with held piece.
 * One hold per drop, respects holdEnabled from rule set.
 */

import type { PieceType } from "./pieces.js";

/** State of the hold mechanic. */
export interface HoldState {
  /** The currently held piece, or null if none. */
  readonly heldPiece: PieceType | null;
  /** Whether hold has been used during the current drop. */
  readonly holdUsedThisDrop: boolean;
}

/** Create the initial hold state (empty, unused). */
export function createHoldState(): HoldState {
  return { heldPiece: null, holdUsedThisDrop: false };
}

/** Result of a hold attempt. */
export interface HoldResult {
  /** The piece the player should now control, or null if caller must pull from randomizer. */
  readonly newCurrent: PieceType | null;
  /** Updated hold state. */
  readonly newState: HoldState;
}

/**
 * Attempt to hold the current piece.
 *
 * Returns the previously held piece as newCurrent (or null if hold was empty,
 * meaning the caller should pull the next piece from the randomizer).
 * Returns the current piece unchanged if hold is disabled or already used this drop.
 */
export function holdPiece(
  current: PieceType,
  state: HoldState,
  holdEnabled: boolean,
): HoldResult {
  if (!holdEnabled || state.holdUsedThisDrop) {
    return { newCurrent: current, newState: state };
  }

  return {
    newCurrent: state.heldPiece,
    newState: { heldPiece: current, holdUsedThisDrop: true },
  };
}

/** Reset the hold-used flag (call on piece lock). */
export function resetHoldFlag(state: HoldState): HoldState {
  return { ...state, holdUsedThisDrop: false };
}
