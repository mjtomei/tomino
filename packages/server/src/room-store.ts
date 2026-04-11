/**
 * In-memory room store.
 *
 * Provides CRUD operations for rooms and a reverse player→room lookup
 * so disconnects can be cleaned up without scanning every room.
 */

import type {
  PlayerId,
  PlayerInfo,
  RoomId,
  RoomState,
  RoomStatus,
} from "@tetris/shared";
import { generateRoomCode, createRoomState } from "./room.js";
import type { RoomConfig } from "@tetris/shared";

export class RoomStore {
  private readonly rooms = new Map<RoomId, RoomState>();
  /** Reverse lookup: which room is a player currently in? */
  private readonly playerRooms = new Map<PlayerId, RoomId>();

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getRoom(roomId: RoomId): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  getRoomForPlayer(playerId: PlayerId): RoomState | undefined {
    const roomId = this.playerRooms.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getRoomIdForPlayer(playerId: PlayerId): RoomId | undefined {
    return this.playerRooms.get(playerId);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get activeRoomCodes(): ReadonlySet<RoomId> {
    return new Set(this.rooms.keys());
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Create a new room. Returns the created RoomState.
   * Throws if the host player is already in a room.
   */
  createRoom(config: RoomConfig, host: PlayerInfo): RoomState {
    if (this.playerRooms.has(host.id)) {
      throw new Error(`Player ${host.id} is already in a room`);
    }

    const roomId = generateRoomCode(this.activeRoomCodes);
    const room = createRoomState(roomId, config, host);
    this.rooms.set(roomId, room);
    this.playerRooms.set(host.id, roomId);
    return room;
  }

  /**
   * Add a player to an existing room. Returns the updated RoomState.
   * Returns an error string if the operation fails, or the RoomState on success.
   */
  addPlayer(
    roomId: RoomId,
    player: PlayerInfo,
  ): { ok: RoomState } | { error: string; code: string } {
    if (this.playerRooms.has(player.id)) {
      return { error: "Player is already in a room", code: "ALREADY_IN_ROOM" };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { error: "Room not found", code: "ROOM_NOT_FOUND" };
    }
    if (room.status !== "waiting") {
      return { error: "Game is already in progress", code: "GAME_IN_PROGRESS" };
    }
    if (room.players.length >= room.config.maxPlayers) {
      return { error: "Room is full", code: "ROOM_FULL" };
    }

    room.players.push(player);
    this.playerRooms.set(player.id, roomId);
    return { ok: room };
  }

  /**
   * Remove a player from their room. Returns info about what happened.
   * If the room becomes empty, it is deleted.
   * If the removed player was the host, host transfers to the next player.
   */
  removePlayer(playerId: PlayerId): {
    roomId: RoomId;
    room: RoomState | null; // null if room was deleted
    hostChanged: boolean;
  } | null {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(playerId);
      return null;
    }

    // Remove the player
    room.players = room.players.filter((p) => p.id !== playerId);
    this.playerRooms.delete(playerId);

    // Room empty → delete it
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return { roomId, room: null, hostChanged: false };
    }

    // Host transfer if needed
    let hostChanged = false;
    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
      hostChanged = true;
    }

    return { roomId, room, hostChanged };
  }

  /** Set the room status. Returns false if room not found. */
  setStatus(roomId: RoomId, status: RoomStatus): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.status = status;
    return true;
  }

  /** Delete a room and clean up all player mappings. */
  deleteRoom(roomId: RoomId): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    for (const player of room.players) {
      this.playerRooms.delete(player.id);
    }
    this.rooms.delete(roomId);
    return true;
  }
}
