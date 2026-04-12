/**
 * Adapter: engine GameState → atmosphere GameSignals.
 *
 * Kept out of atmosphere-engine.ts to preserve the engine's zero-coupling
 * to the shared game types; this module is the single place where we
 * reach into `GameState` internals.
 */

import type { GameState, LineClearEvent, GarbageBatch } from "@tetris/shared";
import type { GameSignals, MultiplayerSignals } from "./types.js";
import { BOARD_VISIBLE_HEIGHT } from "./types.js";

const BOARD_BUFFER_ROWS = 20;
const BOARD_TOTAL_ROWS = 40;

/** Count filled rows measured from the bottom of the visible playfield. */
export function computeStackHeight(board: readonly (readonly unknown[])[]): number {
  for (let row = BOARD_BUFFER_ROWS; row < BOARD_TOTAL_ROWS; row++) {
    const r = board[row];
    if (!r) continue;
    for (let c = 0; c < r.length; c++) {
      if (r[c] != null) {
        return BOARD_TOTAL_ROWS - row;
      }
    }
  }
  return 0;
}

function sumGarbage(pending?: readonly GarbageBatch[] | null): number {
  if (!pending) return 0;
  let total = 0;
  for (const batch of pending) total += batch.lines;
  return Math.min(total, BOARD_VISIBLE_HEIGHT);
}

export interface SignalContext {
  pendingGarbage?: readonly GarbageBatch[] | null;
  lastLineClear?: LineClearEvent | null;
  multiplayer?: MultiplayerSignals;
}

export function gameStateToSignals(
  state: GameState,
  ctx: SignalContext = {},
): GameSignals {
  return {
    status: state.status,
    level: state.scoring.level,
    stackHeight: computeStackHeight(state.board),
    combo: state.scoring.combo,
    b2b: state.scoring.b2b,
    linesCleared: state.scoring.lines,
    pendingGarbage: sumGarbage(ctx.pendingGarbage),
    lastLineClear: ctx.lastLineClear ?? null,
    multiplayer: ctx.multiplayer,
  };
}
