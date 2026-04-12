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

import type { HandicapSettings, HandicapMode, HandicapModifiers } from "./handicap-types.js";

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
  /** Final handicap settings snapshot for the game. */
  handicapSettings?: HandicapSettings;
}

export interface C2S_UpdateRoomSettings {
  type: "updateRoomSettings";
  roomId: RoomId;
  handicapSettings: HandicapSettings;
  ratingVisible: boolean;
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

export interface C2S_RejoinRoom {
  type: "rejoinRoom";
  roomId: RoomId;
  player: PlayerInfo;
}

export type ClientMessage =
  | C2S_CreateRoom
  | C2S_JoinRoom
  | C2S_LeaveRoom
  | C2S_StartGame
  | C2S_UpdateRoomSettings
  | C2S_PlayerInput
  | C2S_Ping
  | C2S_RejoinRoom;

export type ClientMessageType = ClientMessage["type"];

export const CLIENT_MESSAGE_TYPES: readonly ClientMessageType[] = [
  "createRoom",
  "joinRoom",
  "leaveRoom",
  "startGame",
  "updateRoomSettings",
  "playerInput",
  "ping",
  "rejoinRoom",
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

export interface S2C_Countdown {
  type: "countdown";
  roomId: RoomId;
  /** Countdown value: 3, 2, 1, or 0 (Go). */
  count: number;
}

export interface S2C_GameStarted {
  type: "gameStarted";
  roomId: RoomId;
  /** Per-player initial snapshots keyed by player ID. */
  initialStates: Record<PlayerId, GameStateSnapshot>;
  /** Shared random seed for deterministic piece generation. */
  seed: number;
  /** Maps each player ID to their 0-based player index. */
  playerIndexes: Record<PlayerId, number>;
  /** Serialized modifier matrix for handicap indicators (key: "sender→receiver"). */
  handicapModifiers?: Record<string, HandicapModifiers>;
  /** Handicap mode so clients know whether to show outgoing multipliers. */
  handicapMode?: HandicapMode;
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

export interface S2C_PlayerDisconnected {
  type: "playerDisconnected";
  roomId: RoomId;
  playerId: PlayerId;
  /** Milliseconds the player has to reconnect before forfeiting. */
  timeoutMs: number;
}

export interface S2C_PlayerReconnected {
  type: "playerReconnected";
  roomId: RoomId;
  playerId: PlayerId;
}

export interface S2C_GameRejoined {
  type: "gameRejoined";
  roomId: RoomId;
  seed: number;
  playerIndexes: Record<PlayerId, number>;
  /** Current snapshots for every player in the session. */
  currentStates: Record<PlayerId, GameStateSnapshot>;
  handicapModifiers?: Record<string, HandicapModifiers>;
  handicapMode?: HandicapMode;
}

export type ServerMessage =
  | S2C_RoomCreated
  | S2C_RoomUpdated
  | S2C_PlayerJoined
  | S2C_PlayerLeft
  | S2C_Countdown
  | S2C_GameStarted
  | S2C_GameStateSnapshot
  | S2C_GameOver
  | S2C_GameEnd
  | S2C_GarbageReceived
  | S2C_GarbageQueued
  | S2C_Pong
  | S2C_Error
  | S2C_Disconnected
  | S2C_PlayerDisconnected
  | S2C_PlayerReconnected
  | S2C_GameRejoined;

export type ServerMessageType = ServerMessage["type"];

export const SERVER_MESSAGE_TYPES: readonly ServerMessageType[] = [
  "roomCreated",
  "roomUpdated",
  "playerJoined",
  "playerLeft",
  "countdown",
  "gameStarted",
  "gameStateSnapshot",
  "gameOver",
  "gameEnd",
  "garbageReceived",
  "garbageQueued",
  "pong",
  "error",
  "disconnected",
  "playerDisconnected",
  "playerReconnected",
  "gameRejoined",
] as const;
