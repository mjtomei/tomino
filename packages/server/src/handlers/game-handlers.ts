/**
 * Game-specific message handlers.
 *
 * Manages the game start flow: countdown → gameStarted → gameplay.
 * Handles player input during gameplay and disconnects.
 */

import type {
  ErrorCode,
  HandicapMode,
  HandicapModifiers,
  InputAction,
  PlayerId,
  RoomId,
  ServerMessage,
} from "@tetris/shared";
import { ALL_TARGETING_STRATEGIES } from "@tetris/shared";
import type { C2S_PlayerInput, C2S_RejoinRoom, C2S_SetTargetingStrategy, C2S_SetManualTarget } from "@tetris/shared";
import type { RoomStore } from "../room-store.js";
import {
  createGameSession,
  getGameSession,
  removeGameSession,
} from "../game-session.js";
import { computeModifierMatrix, type PlayerRating } from "../handicap-calculator.js";
import {
  disconnectRegistry,
  DisconnectRegistry,
} from "../disconnect-handler.js";
import { clearRematchVotes } from "./rematch-handlers.js";

export interface GameHandlerContext {
  broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void;
}

/** Default rating used when a player has no stored rating. */
const DEFAULT_RATING = 1500;

/**
 * Serialize a ModifierMatrix (Map) to a plain Record for JSON transport.
 */
function serializeModifierMatrix(
  matrix: Map<string, HandicapModifiers>,
): Record<string, HandicapModifiers> {
  const result: Record<string, HandicapModifiers> = {};
  for (const [key, value] of matrix) {
    result[key] = value;
  }
  return result;
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

  // Compute handicap modifier matrix if handicap is enabled
  let handicapModifiers: Record<string, HandicapModifiers> | undefined;
  let handicapMode: HandicapMode | undefined;
  const settings = room.handicapSettings;

  if (settings && settings.intensity !== "off") {
    const playerRatings: PlayerRating[] = room.players.map((p) => ({
      username: p.name,
      rating: room.playerRatings?.[p.id] ?? DEFAULT_RATING,
    }));
    const matrix = computeModifierMatrix(playerRatings, settings);
    handicapModifiers = serializeModifierMatrix(matrix);
    handicapMode = settings.mode;
  }

  // Clear any stale rematch votes from a previous game
  clearRematchVotes(roomId);

  const session = createGameSession({
    roomId,
    players: room.players,
    broadcastToRoom: ctx.broadcastToRoom,
    handicapModifiers,
    handicapMode,
    handicapDelayEnabled: settings?.delayEnabled ?? false,
    handicapMessinessEnabled: settings?.messinessEnabled ?? false,
    targetingSettings: room.targetingSettings,
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
  sendError: (code: ErrorCode, message: string) => void,
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
 * Handle a setTargetingStrategy message from a client.
 */
export function handleSetTargetingStrategy(
  msg: C2S_SetTargetingStrategy,
  playerId: PlayerId,
  sendError: (code: ErrorCode, message: string) => void,
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

  if (!session.getPlayerIds().includes(playerId)) {
    sendError("NOT_IN_ROOM", "Player is not in this game session");
    return;
  }

  if (!ALL_TARGETING_STRATEGIES.includes(msg.strategy)) {
    sendError("INVALID_MESSAGE", `Invalid targeting strategy: ${msg.strategy}`);
    return;
  }

  const ok = session.setPlayerStrategy(playerId, msg.strategy);
  if (!ok) {
    sendError("INVALID_MESSAGE", "Strategy not enabled for this game");
  }
}

/**
 * Handle a setManualTarget message from a client.
 */
export function handleSetManualTarget(
  msg: C2S_SetManualTarget,
  playerId: PlayerId,
  sendError: (code: ErrorCode, message: string) => void,
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

  if (!session.getPlayerIds().includes(playerId)) {
    sendError("NOT_IN_ROOM", "Player is not in this game session");
    return;
  }

  const ok = session.setManualTarget(playerId, msg.targetPlayerId);
  if (!ok) {
    sendError("INVALID_MESSAGE", "Invalid target player");
  }
}

/**
 * Handle a player disconnecting during an active game session.
 *
 * - countdown → cancel the session
 * - playing → start a reconnect grace window; on timeout the player forfeits
 */
export function handleGameDisconnect(
  playerId: PlayerId,
  roomId: RoomId,
  ctx: GameHandlerContext,
  store?: RoomStore,
  registry: DisconnectRegistry = disconnectRegistry,
): { pendingReconnect: boolean } {
  const session = getGameSession(roomId);
  if (!session) return { pendingReconnect: false };

  if (session.state === "countdown") {
    session.cancel();
    ctx.broadcastToRoom(roomId, {
      type: "error",
      code: "INTERNAL_ERROR",
      message: "Game cancelled — a player disconnected during countdown",
    });
    return { pendingReconnect: false };
  }

  if (session.state !== "playing") return { pendingReconnect: false };

  const marked = session.markDisconnected(playerId, registry.timeoutMs);
  if (!marked) return { pendingReconnect: false };

  registry.register(roomId, playerId, () => {
    const s = getGameSession(roomId);
    if (!s) return;
    s.forfeitPlayer(playerId);
    if (s.state === "finished") {
      if (store) store.setStatus(roomId, "finished");
      removeGameSession(roomId);
      registry.clearRoom(roomId);
    }
  });

  return { pendingReconnect: true };
}

/**
 * Handle a player reconnecting within the grace window. Clears the pending
 * forfeit, broadcasts `playerReconnected`, and sends the reconnecting player
 * a full `gameRejoined` payload so they can rehydrate their client state.
 *
 * Returns true on successful rejoin, false if the rejoin was rejected (no
 * session, not eligible, etc.).
 */
export function handleRejoinRoom(
  msg: C2S_RejoinRoom,
  playerId: PlayerId,
  ctx: GameHandlerContext & { send: (m: ServerMessage) => void },
  registry: DisconnectRegistry = disconnectRegistry,
): boolean {
  const session = getGameSession(msg.roomId);
  if (!session) {
    ctx.send({
      type: "error",
      code: "ROOM_NOT_FOUND",
      message: "No active game session for this room",
    });
    return false;
  }

  if (session.state !== "playing") {
    ctx.send({
      type: "error",
      code: "GAME_IN_PROGRESS",
      message: "Session is not in a rejoinable state",
    });
    return false;
  }

  if (!session.isDisconnected(playerId)) {
    ctx.send({
      type: "error",
      code: "NOT_IN_ROOM",
      message: "Player is not pending reconnect",
    });
    return false;
  }

  registry.clear(msg.roomId, playerId);
  session.markReconnected(playerId);

  ctx.send({
    type: "gameRejoined",
    roomId: msg.roomId,
    seed: session.seed,
    playerIndexes: session.playerIndexes,
    currentStates: session.getCurrentSnapshots(),
    handicapModifiers: session.handicapModifiers,
    handicapMode: session.handicapMode,
  });

  return true;
}
