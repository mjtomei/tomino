/**
 * Rematch vote handling.
 *
 * After a game ends, players on the results screen can vote for a rematch.
 * When all players in the room vote yes, the room resets to "waiting" so the
 * host can start a new game. If a player leaves or disconnects during voting,
 * remaining players are returned to the waiting room.
 */

import type {
  PlayerId,
  RoomId,
  ServerMessage,
} from "@tetris/shared";
import type { RoomStore } from "../room-store.js";
import { removeGameSession } from "../game-session.js";

// ---------------------------------------------------------------------------
// Vote state (module-level, keyed by roomId)
// ---------------------------------------------------------------------------

const rematchVotes = new Map<RoomId, Set<PlayerId>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RematchHandlerContext {
  broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void;
  send: (msg: ServerMessage) => void;
}

/**
 * Record a player's rematch vote. Broadcasts vote status to the room.
 * If all players have voted, resets the room to "waiting".
 */
export function handleRequestRematch(
  playerId: PlayerId,
  roomId: RoomId,
  ctx: RematchHandlerContext,
  store: RoomStore,
): void {
  const room = store.getRoom(roomId);
  if (!room) {
    ctx.send({ type: "error", code: "ROOM_NOT_FOUND", message: "Room not found" });
    return;
  }

  if (room.status !== "finished") {
    ctx.send({ type: "error", code: "INVALID_MESSAGE", message: "Game is not finished" });
    return;
  }

  if (!room.players.some((p) => p.id === playerId)) {
    ctx.send({ type: "error", code: "NOT_IN_ROOM", message: "Not in this room" });
    return;
  }

  // Record vote
  let votes = rematchVotes.get(roomId);
  if (!votes) {
    votes = new Set();
    rematchVotes.set(roomId, votes);
  }

  // Ignore duplicate votes
  if (votes.has(playerId)) return;

  votes.add(playerId);

  const totalPlayers = room.players.length;

  // Broadcast current vote status
  ctx.broadcastToRoom(roomId, {
    type: "rematchUpdate",
    roomId,
    votes: [...votes],
    totalPlayers,
  });

  // Check for unanimity
  if (votes.size >= totalPlayers) {
    resetToWaiting(roomId, ctx, store);
  }
}

/**
 * Remove a player's rematch vote (called on leave/disconnect).
 * If remaining voters are now unanimous, triggers rematch acceptance.
 * Otherwise resets remaining players to the waiting room.
 */
export function removeRematchVote(
  roomId: RoomId,
  playerId: PlayerId,
  ctx: Pick<RematchHandlerContext, "broadcastToRoom">,
  store: RoomStore,
): void {
  const votes = rematchVotes.get(roomId);
  if (!votes) return;

  votes.delete(playerId);

  const room = store.getRoom(roomId);
  if (!room || room.players.length === 0) {
    rematchVotes.delete(roomId);
    return;
  }

  // If the room is still in "finished" status and has remaining players,
  // check if remaining voters are now unanimous; otherwise return to waiting
  if (room.status === "finished") {
    resetToWaiting(roomId, ctx, store);
  }
}

/**
 * Clear all rematch votes for a room.
 * Called when a new game starts or the room is deleted.
 */
export function clearRematchVotes(roomId: RoomId): void {
  rematchVotes.delete(roomId);
}

/** Check whether a room has any active rematch votes. */
export function hasRematchVotes(roomId: RoomId): boolean {
  const votes = rematchVotes.get(roomId);
  return votes !== undefined && votes.size > 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Reset room to waiting: clear votes, remove game session, broadcast. */
function resetToWaiting(
  roomId: RoomId,
  ctx: Pick<RematchHandlerContext, "broadcastToRoom">,
  store: RoomStore,
): void {
  rematchVotes.delete(roomId);
  removeGameSession(roomId);
  store.setStatus(roomId, "waiting");

  const room = store.getRoom(roomId);
  if (room) {
    ctx.broadcastToRoom(roomId, { type: "roomUpdated", room });
  }
}
