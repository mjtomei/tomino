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
  SkillStore,
} from "@tomino/shared";
import { ALL_TARGETING_STRATEGIES, EMOTE_KINDS } from "@tomino/shared";
import type {
  C2S_PlayerInput,
  C2S_RejoinRoom,
  C2S_SendEmote,
  C2S_SetTargetingStrategy,
  C2S_SetManualTarget,
} from "@tomino/shared";
import type { RoomStore } from "../room-store.js";
import {
  createGameSession,
  getGameSession,
  removeGameSession,
} from "../game-session.js";
import { computeModifierMatrix, type PlayerRating } from "../handicap-calculator.js";
import type { BalancingConfig } from "../balancing-init.js";
import {
  disconnectRegistry,
  DisconnectRegistry,
} from "../disconnect-handler.js";
import { clearRematchVotes } from "./rematch-handlers.js";
import { handlePostGame } from "../post-game-handler.js";

export interface GameHandlerContext {
  broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void;
  skillStore?: SkillStore;
  balancingConfig?: BalancingConfig;
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
    const matrix = computeModifierMatrix(playerRatings, settings, ctx.balancingConfig?.handicapCurve);
    handicapModifiers = serializeModifierMatrix(matrix);
    handicapMode = settings.mode;
  }

  // Clear any stale rematch votes from a previous game
  clearRematchVotes(roomId);

  // Determine whether this game is ranked (handicap enabled → ratings tracked)
  const isRanked = settings !== undefined && settings.intensity !== "off";

  const session = createGameSession({
    roomId,
    players: room.players,
    broadcastToRoom: ctx.broadcastToRoom,
    handicapModifiers,
    handicapMode,
    handicapDelayEnabled: settings?.delayEnabled ?? false,
    handicapMessinessEnabled: settings?.messinessEnabled ?? false,
    targetingSettings: room.targetingSettings,
    playerRatings: room.playerRatings,
    targetingBiasStrength: settings?.targetingBiasStrength,
    onGameStarted: () => {
      // Engines and tick loop are now managed by GameSession itself
    },
    onCancelled: () => {
      // Revert room to waiting so host can retry
      store.setStatus(roomId, "waiting");
      removeGameSession(roomId);
    },
    onGameEnd: (gameResult) => {
      const afterRatings = isRanked && ctx.skillStore
        ? handlePostGame(gameResult, ctx.skillStore, ctx.broadcastToRoom, ctx.balancingConfig?.rating)
            .then(async () => {
              // Update room player ratings for lobby display
              const updates = Object.keys(gameResult.placements).map(async (pid) => {
                const username = gameResult.playerNames[pid];
                if (!username) return;
                const profile = await ctx.skillStore!.getPlayer(username);
                if (profile) {
                  store.setPlayerRating(roomId, pid, profile.rating);
                }
              });
              await Promise.all(updates);
            })
            .catch((err) => {
              console.error("Post-game rating update failed:", err);
            })
        : Promise.resolve();

      afterRatings.then(() => {
        disconnectRegistry.clearRoom(roomId);
        store.setStatus(roomId, "finished");
        removeGameSession(roomId);
      });
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

/** Minimum ms between emotes per player to prevent spam. */
export const EMOTE_COOLDOWN_MS = 500;
const VALID_EMOTES: ReadonlySet<string> = new Set<string>(EMOTE_KINDS);
const emoteLastAt = new Map<PlayerId, number>();

/** Exposed for tests to reset global rate-limit state between cases. */
export function clearEmoteCooldowns(): void {
  emoteLastAt.clear();
}

export interface HandleSendEmoteDeps {
  now?: () => number;
}

/**
 * Handle a sendEmote message from a client.
 * Broadcasts a `playerEmote` to everyone in the room (including the sender).
 * Enforces a per-player cooldown so a malicious client can't flood the room.
 */
export function handleSendEmote(
  msg: C2S_SendEmote,
  playerId: PlayerId,
  ctx: GameHandlerContext,
  sendError: (code: ErrorCode, message: string) => void,
  deps: HandleSendEmoteDeps = {},
): void {
  const now = deps.now ?? Date.now;
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
  if (!VALID_EMOTES.has(msg.emote)) {
    sendError("INVALID_MESSAGE", `Invalid emote: ${msg.emote}`);
    return;
  }
  const t = now();
  const last = emoteLastAt.get(playerId) ?? 0;
  if (t - last < EMOTE_COOLDOWN_MS) {
    // Silently drop — client also throttles; no need to error.
    return;
  }
  emoteLastAt.set(playerId, t);

  ctx.broadcastToRoom(msg.roomId, {
    type: "playerEmote",
    roomId: msg.roomId,
    playerId,
    emote: msg.emote,
    timestamp: t,
  });
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
  _store?: RoomStore,
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
    // Cleanup (setStatus, removeGameSession, clearRoom) is handled by the
    // onGameEnd callback so that async rating updates complete before the
    // session is torn down.
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
