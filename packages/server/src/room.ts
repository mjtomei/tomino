/**
 * Room code generation and room factory helpers.
 */

import type { PlayerInfo, RoomConfig, RoomState } from "@tomino/shared";

// Uppercase alphanumeric excluding confusable characters: 0/O, 1/I/L
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ2345678";
const CODE_LENGTH = 5;

/** Generate a random room code (5 uppercase alphanumeric characters). */
export function generateRoomCode(existingCodes: ReadonlySet<string>): string {
  const maxAttempts = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  throw new Error("Failed to generate unique room code after max attempts");
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

/** Clamp and validate maxPlayers from client config. */
export function validateMaxPlayers(maxPlayers: number): number {
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(maxPlayers)));
}

/** Create a new RoomState from config and the creating player. */
export function createRoomState(
  roomId: string,
  config: RoomConfig,
  host: PlayerInfo,
): RoomState {
  return {
    id: roomId,
    config: {
      name: config.name,
      maxPlayers: validateMaxPlayers(config.maxPlayers),
    },
    status: "waiting",
    players: [host],
    hostId: host.id,
  };
}
