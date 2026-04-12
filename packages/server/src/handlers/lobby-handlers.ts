/**
 * Lobby message handlers.
 *
 * Each handler receives a parsed client message and a context object that
 * provides the player identity and functions to send messages back.
 */

import type {
  C2S_CreateRoom,
  C2S_JoinRoom,
  C2S_LeaveRoom,
  C2S_StartGame,
  C2S_UpdateRoomSettings,
  ErrorCode,
  HandicapIntensity,
  HandicapMode,
  HandicapSettings,
  PlayerId,
  ServerMessage,
  TargetingSettings,
  TargetingStrategyType,
} from "@tetris/shared";
import { ALL_TARGETING_STRATEGIES } from "@tetris/shared";
import type { RoomStore } from "../room-store.js";
import { startGameCountdown } from "./game-handlers.js";

/** Context provided to each handler by the WebSocket layer. */
export interface HandlerContext {
  /** The player ID of the sender. */
  playerId: PlayerId;
  /** Send a message to the sender. */
  send: (msg: ServerMessage) => void;
  /** Send a message to every player in a room. */
  broadcastToRoom: (roomId: string, msg: ServerMessage) => void;
  /** Send a message to every player in a room except one. */
  broadcastToRoomExcept: (
    roomId: string,
    msg: ServerMessage,
    excludePlayerId: PlayerId,
  ) => void;
}

function sendError(ctx: HandlerContext, code: ErrorCode, message: string) {
  ctx.send({ type: "error", code, message });
}

export function handleCreateRoom(
  msg: C2S_CreateRoom,
  ctx: HandlerContext,
  store: RoomStore,
): void {
  // Check if player is already in a room
  if (store.getRoomForPlayer(ctx.playerId)) {
    sendError(ctx, "INVALID_MESSAGE", "Already in a room");
    return;
  }

  const room = store.createRoom(msg.config, {
    id: ctx.playerId,
    name: msg.player.name,
  });

  ctx.send({ type: "roomCreated", room });
}

export function handleJoinRoom(
  msg: C2S_JoinRoom,
  ctx: HandlerContext,
  store: RoomStore,
): void {
  const result = store.addPlayer(msg.roomId, {
    id: ctx.playerId,
    name: msg.player.name,
  });

  if ("error" in result) {
    const code =
      result.code === "ALREADY_IN_ROOM"
        ? ("INVALID_MESSAGE" as ErrorCode)
        : (result.code as ErrorCode);
    sendError(ctx, code, result.error);
    return;
  }

  const room = result.ok;

  // Send full room state to the joining player
  ctx.send({ type: "roomUpdated", room });

  // Notify other players in the room
  ctx.broadcastToRoomExcept(room.id, {
    type: "playerJoined",
    roomId: room.id,
    player: { id: ctx.playerId, name: msg.player.name },
  }, ctx.playerId);
}

export function handleLeaveRoom(
  _msg: C2S_LeaveRoom,
  ctx: HandlerContext,
  store: RoomStore,
): void {
  const result = store.removePlayer(ctx.playerId);
  if (!result) {
    sendError(ctx, "NOT_IN_ROOM", "Not in a room");
    return;
  }

  // Notify remaining players
  if (result.room) {
    ctx.broadcastToRoom(result.roomId, {
      type: "playerLeft",
      roomId: result.roomId,
      playerId: ctx.playerId,
    });

    // If host changed, send updated room state
    if (result.hostChanged) {
      ctx.broadcastToRoom(result.roomId, {
        type: "roomUpdated",
        room: result.room,
      });
    }
  }
}

const VALID_INTENSITIES: ReadonlySet<string> = new Set<HandicapIntensity>(["off", "light", "standard", "heavy"]);
const VALID_MODES: ReadonlySet<string> = new Set<HandicapMode>(["boost", "symmetric"]);

function isValidHandicapSettings(s: unknown): s is HandicapSettings {
  if (typeof s !== "object" || s === null) return false;
  const obj = s as Record<string, unknown>;
  return (
    VALID_INTENSITIES.has(obj.intensity as string) &&
    VALID_MODES.has(obj.mode as string) &&
    typeof obj.targetingBiasStrength === "number" &&
    obj.targetingBiasStrength >= 0 &&
    obj.targetingBiasStrength <= 1 &&
    (obj.delayEnabled === undefined || typeof obj.delayEnabled === "boolean") &&
    (obj.messinessEnabled === undefined || typeof obj.messinessEnabled === "boolean")
  );
}

const VALID_STRATEGIES: ReadonlySet<string> = new Set<TargetingStrategyType>(ALL_TARGETING_STRATEGIES);

function isValidTargetingSettings(s: unknown): s is TargetingSettings {
  if (typeof s !== "object" || s === null) return false;
  const obj = s as Record<string, unknown>;
  if (!Array.isArray(obj.enabledStrategies)) return false;
  if (obj.enabledStrategies.length === 0) return false;
  for (const strat of obj.enabledStrategies) {
    if (!VALID_STRATEGIES.has(strat as string)) return false;
  }
  if (typeof obj.defaultStrategy !== "string") return false;
  if (!VALID_STRATEGIES.has(obj.defaultStrategy)) return false;
  if (!(obj.enabledStrategies as string[]).includes(obj.defaultStrategy)) return false;
  return true;
}

export function handleUpdateRoomSettings(
  msg: C2S_UpdateRoomSettings,
  ctx: HandlerContext,
  store: RoomStore,
): void {
  const room = store.getRoom(msg.roomId);
  if (!room) {
    sendError(ctx, "ROOM_NOT_FOUND", "Room not found");
    return;
  }

  if (room.hostId !== ctx.playerId) {
    sendError(ctx, "NOT_HOST", "Only the host can change settings");
    return;
  }

  if (room.status !== "waiting") {
    sendError(ctx, "GAME_IN_PROGRESS", "Cannot change settings during a game");
    return;
  }

  if (!isValidHandicapSettings(msg.handicapSettings)) {
    sendError(ctx, "INVALID_MESSAGE", "Invalid handicap settings");
    return;
  }

  if (typeof msg.ratingVisible !== "boolean") {
    sendError(ctx, "INVALID_MESSAGE", "ratingVisible must be a boolean");
    return;
  }

  if (msg.targetingSettings !== undefined && !isValidTargetingSettings(msg.targetingSettings)) {
    sendError(ctx, "INVALID_MESSAGE", "Invalid targeting settings");
    return;
  }

  store.setHandicapSettings(msg.roomId, msg.handicapSettings, msg.ratingVisible);

  if (msg.targetingSettings !== undefined) {
    store.setTargetingSettings(msg.roomId, msg.targetingSettings);
  }

  ctx.broadcastToRoom(msg.roomId, {
    type: "roomUpdated",
    room: store.getRoom(msg.roomId)!,
  });
}

export function handleStartGame(
  msg: C2S_StartGame,
  ctx: HandlerContext,
  store: RoomStore,
): void {
  const room = store.getRoom(msg.roomId);
  if (!room) {
    sendError(ctx, "ROOM_NOT_FOUND", "Room not found");
    return;
  }

  if (room.hostId !== ctx.playerId) {
    sendError(ctx, "NOT_HOST", "Only the host can start the game");
    return;
  }

  if (room.status !== "waiting") {
    sendError(ctx, "GAME_IN_PROGRESS", "Game is already in progress");
    return;
  }

  if (room.players.length < 2) {
    sendError(
      ctx,
      "INVALID_MESSAGE",
      "Need at least 2 players to start",
    );
    return;
  }

  // Store final handicap settings snapshot if provided
  if (msg.handicapSettings) {
    if (!isValidHandicapSettings(msg.handicapSettings)) {
      sendError(ctx, "INVALID_MESSAGE", "Invalid handicap settings");
      return;
    }
    store.setHandicapSettings(msg.roomId, msg.handicapSettings, room.ratingVisible ?? true);
  }

  store.setStatus(msg.roomId, "playing");

  // Start the countdown → gameStarted flow via the game session manager.
  startGameCountdown(msg.roomId, store, {
    broadcastToRoom: ctx.broadcastToRoom,
  });
}

/**
 * Handle player disconnect — clean up their room membership.
 * Called by the WebSocket layer when a connection drops.
 */
export function handleDisconnect(
  playerId: PlayerId,
  ctx: Pick<HandlerContext, "broadcastToRoom">,
  store: RoomStore,
): void {
  const result = store.removePlayer(playerId);
  if (!result || !result.room) return;

  ctx.broadcastToRoom(result.roomId, {
    type: "playerLeft",
    roomId: result.roomId,
    playerId,
  });

  if (result.hostChanged) {
    ctx.broadcastToRoom(result.roomId, {
      type: "roomUpdated",
      room: result.room,
    });
  }
}
