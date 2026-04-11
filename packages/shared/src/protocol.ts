/**
 * Network protocol message types for client ↔ server communication.
 *
 * Every message carries a `type` string literal discriminant so the receiver
 * can exhaustively match on it.
 */

import type {
  GameStateSnapshot,
  GarbageBatch,
  InputAction,
  PlayerId,
  PlayerInfo,
  RoomConfig,
  RoomId,
  RoomState,
} from "./types.js";

// ---------------------------------------------------------------------------
// Client → Server (C2S)
// ---------------------------------------------------------------------------

export interface C2S_CreateRoom {
  type: "createRoom";
  config: RoomConfig;
  player: PlayerInfo;
}

export interface C2S_JoinRoom {
  type: "joinRoom";
  roomId: RoomId;
  player: PlayerInfo;
}

export interface C2S_LeaveRoom {
  type: "leaveRoom";
  roomId: RoomId;
}

export interface C2S_StartGame {
  type: "startGame";
  roomId: RoomId;
}

export interface C2S_PlayerInput {
  type: "playerInput";
  roomId: RoomId;
  action: InputAction;
  /** Client-side tick at which this input was generated. */
  tick: number;
}

export interface C2S_Ping {
  type: "ping";
  timestamp: number;
}

export type ClientMessage =
  | C2S_CreateRoom
  | C2S_JoinRoom
  | C2S_LeaveRoom
  | C2S_StartGame
  | C2S_PlayerInput
  | C2S_Ping;

export type ClientMessageType = ClientMessage["type"];

export const CLIENT_MESSAGE_TYPES: readonly ClientMessageType[] = [
  "createRoom",
  "joinRoom",
  "leaveRoom",
  "startGame",
  "playerInput",
  "ping",
] as const;

// ---------------------------------------------------------------------------
// Server → Client (S2C)
// ---------------------------------------------------------------------------

export interface S2C_RoomCreated {
  type: "roomCreated";
  room: RoomState;
}

export interface S2C_RoomUpdated {
  type: "roomUpdated";
  room: RoomState;
}

export interface S2C_PlayerJoined {
  type: "playerJoined";
  roomId: RoomId;
  player: PlayerInfo;
}

export interface S2C_PlayerLeft {
  type: "playerLeft";
  roomId: RoomId;
  playerId: PlayerId;
}

export interface S2C_GameStarted {
  type: "gameStarted";
  roomId: RoomId;
  /** Per-player initial snapshots keyed by player ID. */
  initialStates: Record<PlayerId, GameStateSnapshot>;
}

export interface S2C_GameStateSnapshot {
  type: "gameStateSnapshot";
  roomId: RoomId;
  playerId: PlayerId;
  state: GameStateSnapshot;
}

export interface S2C_GameOver {
  type: "gameOver";
  roomId: RoomId;
  /** The player who topped out. */
  playerId: PlayerId;
}

export interface S2C_GameEnd {
  type: "gameEnd";
  roomId: RoomId;
  /** The player who won (last one standing). */
  winnerId: PlayerId;
}

export interface S2C_GarbageReceived {
  type: "garbageReceived";
  roomId: RoomId;
  garbage: GarbageBatch;
}

export interface S2C_GarbageQueued {
  type: "garbageQueued";
  roomId: RoomId;
  /** Updated full pending garbage queue for the receiving player. */
  pendingGarbage: GarbageBatch[];
}

export interface S2C_Pong {
  type: "pong";
  timestamp: number;
}

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "GAME_IN_PROGRESS"
  | "NOT_HOST"
  | "NOT_IN_ROOM"
  | "INVALID_MESSAGE"
  | "INTERNAL_ERROR";

export interface S2C_Error {
  type: "error";
  code: ErrorCode;
  message: string;
}

export interface S2C_Disconnected {
  type: "disconnected";
  reason: string;
}

export type ServerMessage =
  | S2C_RoomCreated
  | S2C_RoomUpdated
  | S2C_PlayerJoined
  | S2C_PlayerLeft
  | S2C_GameStarted
  | S2C_GameStateSnapshot
  | S2C_GameOver
  | S2C_GameEnd
  | S2C_GarbageReceived
  | S2C_GarbageQueued
  | S2C_Pong
  | S2C_Error
  | S2C_Disconnected;

export type ServerMessageType = ServerMessage["type"];

export const SERVER_MESSAGE_TYPES: readonly ServerMessageType[] = [
  "roomCreated",
  "roomUpdated",
  "playerJoined",
  "playerLeft",
  "gameStarted",
  "gameStateSnapshot",
  "gameOver",
  "gameEnd",
  "garbageReceived",
  "garbageQueued",
  "pong",
  "error",
  "disconnected",
] as const;
