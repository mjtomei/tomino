/**
 * Game-specific message handlers.
 *
 * Manages the game start flow: countdown → gameStarted.
 * Integrates with lobby-handlers' handleStartGame.
 */

import type { PlayerId, RoomId, ServerMessage } from "@tetris/shared";
import type { RoomStore } from "../room-store.js";
import {
  createGameSession,
  getGameSession,
  removeGameSession,
} from "../game-session.js";

export interface GameHandlerContext {
  broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void;
}

/**
 * Initiate the game start countdown for a room.
 * Called after lobby validation (host check, player count, etc.) passes.
 */
export function startGameCountdown(
  roomId: RoomId,
  store: RoomStore,
  ctx: GameHandlerContext,
): void {
  const room = store.getRoom(roomId);
  if (!room) return;

  const session = createGameSession({
    roomId,
    players: room.players,
    broadcastToRoom: ctx.broadcastToRoom,
    onGameStarted: () => {
      // Game is now running — future PRs will add tick processing here
    },
    onCancelled: () => {
      // Revert room to waiting so host can retry
      store.setStatus(roomId, "waiting");
      removeGameSession(roomId);
    },
  });

  session.startCountdown();
}

/**
 * Handle a player disconnecting during an active game session.
 * If in countdown, cancel the session.
 */
export function handleGameDisconnect(
  _playerId: PlayerId,
  roomId: RoomId,
  ctx: GameHandlerContext,
): void {
  const session = getGameSession(roomId);
  if (!session) return;

  if (session.state === "countdown") {
    // Cancel the game — can't start with missing players
    session.cancel();

    ctx.broadcastToRoom(roomId, {
      type: "error",
      code: "INTERNAL_ERROR",
      message: "Game cancelled — a player disconnected during countdown",
    });
  }
  // If game is already playing, we don't cancel (future PR will handle in-game disconnect)
}
