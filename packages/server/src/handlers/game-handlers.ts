/**
 * Game-specific message handlers.
 *
 * Manages the game start flow: countdown → gameStarted → gameplay.
 * Handles player input during gameplay and disconnects.
 */

import type {
  InputAction,
  PlayerId,
  RoomId,
  ServerMessage,
} from "@tetris/shared";
import type { C2S_PlayerInput } from "@tetris/shared";
import type { RoomStore } from "../room-store.js";
import {
  createGameSession,
  getGameSession,
  removeGameSession,
  type GameSessionState,
} from "../game-session.js";

export interface GameHandlerContext {
  broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void;
}

/** Valid input actions for validation. */
const VALID_ACTIONS: ReadonlySet<string> = new Set<InputAction>([
  "moveLeft",
  "moveRight",
  "rotateCW",
  "rotateCCW",
  "rotate180",
  "softDrop",
  "hardDrop",
  "hold",
]);

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
      // Engines and tick loop are now managed by GameSession itself
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
 * Handle a playerInput message from a client.
 * Validates the input and forwards it to the session's engine.
 */
export function handlePlayerInput(
  msg: C2S_PlayerInput,
  playerId: PlayerId,
  sendError: (code: string, message: string) => void,
): void {
  const session = getGameSession(msg.roomId);
  if (!session) {
    sendError("ROOM_NOT_FOUND", "No active game session for this room");
    return;
  }

  if (session.state !== "playing") {
    sendError("INVALID_MESSAGE", "Game is not in progress");
    return;
  }

  // Validate player is in the session
  if (!session.getPlayerIds().includes(playerId)) {
    sendError("NOT_IN_ROOM", "Player is not in this game session");
    return;
  }

  // Validate action
  if (!VALID_ACTIONS.has(msg.action)) {
    sendError("INVALID_MESSAGE", `Invalid input action: ${msg.action}`);
    return;
  }

  // Apply the input — the session handles broadcasting
  session.applyInput(playerId, msg.action);
}

/**
 * Handle a player disconnecting during an active game session.
 * If in countdown, cancel the session.
 * If playing, mark the player as game over.
 */
export function handleGameDisconnect(
  playerId: PlayerId,
  roomId: RoomId,
  ctx: GameHandlerContext,
  store?: RoomStore,
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
  } else if (session.state === "playing") {
    // Mark disconnected player as game over
    session.handlePlayerDisconnect(playerId);

    // handlePlayerDisconnect may transition the session to "finished"
    // (TS can't see the mutation through the method call, so re-read state)
    if ((session.state as GameSessionState) === "finished") {
      if (store) {
        store.setStatus(roomId, "finished");
      }
      removeGameSession(roomId);
    }
  }
}
