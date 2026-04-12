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
import type { TargetingSettings, TargetingStrategyType } from "./targeting-types.js";

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
  targetingSettings?: TargetingSettings;
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

export interface C2S_SetTargetingStrategy {
  type: "setTargetingStrategy";
  roomId: RoomId;
  strategy: TargetingStrategyType;
}

export interface C2S_SetManualTarget {
  type: "setManualTarget";
  roomId: RoomId;
  targetPlayerId: PlayerId;
}

export interface C2S_RequestRematch {
  type: "requestRematch";
  roomId: RoomId;
}

/** Small fixed set of emote kinds that players can send during a game. */
export type EmoteKind = "thumbsUp" | "fire" | "wave" | "gg";

export const EMOTE_KINDS: readonly EmoteKind[] = [
  "thumbsUp",
  "fire",
  "wave",
  "gg",
] as const;

export interface C2S_SendEmote {
  type: "sendEmote";
  roomId: RoomId;
  emote: EmoteKind;
}

export type ClientMessage =
  | C2S_CreateRoom
  | C2S_JoinRoom
  | C2S_LeaveRoom
  | C2S_StartGame
  | C2S_UpdateRoomSettings
  | C2S_PlayerInput
  | C2S_Ping
  | C2S_RejoinRoom
  | C2S_SetTargetingStrategy
  | C2S_SetManualTarget
  | C2S_RequestRematch
  | C2S_SendEmote;

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
  "setTargetingStrategy",
  "setManualTarget",
  "requestRematch",
  "sendEmote",
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
  /** Targeting settings for this game (enabled strategies, default). */
  targetingSettings?: TargetingSettings;
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
  /** 1-indexed placement (last place = highest number). */
  placement: number;
}

/** Per-player stats included in the game-end summary. */
export interface PlayerStats {
  /** Lines of garbage sent to opponents (net, after cancellation). */
  linesSent: number;
  /** Lines of garbage received (inserted onto board). */
  linesReceived: number;
  /** Total pieces locked onto the board. */
  piecesPlaced: number;
  /** Milliseconds survived from game start. */
  survivalMs: number;
  /** Final score. */
  score: number;
  /** Total lines cleared. */
  linesCleared: number;
}

export interface S2C_GameEnd {
  type: "gameEnd";
  roomId: RoomId;
  /** The player who won (last one standing). */
  winnerId: PlayerId;
  /** 1-indexed placements for all players. */
  placements: Record<PlayerId, number>;
  /** Per-player stats summary. */
  stats: Record<PlayerId, PlayerStats>;
}

export interface S2C_GarbageReceived {
  type: "garbageReceived";
  roomId: RoomId;
  /** The player whose board the garbage is being inserted on. */
  playerId: PlayerId;
  /** The player whose attack produced this garbage, if known. */
  senderId?: PlayerId;
  garbage: GarbageBatch;
}

export interface S2C_GarbageQueued {
  type: "garbageQueued";
  roomId: RoomId;
  /** The player whose pending queue is being broadcast. */
  playerId: PlayerId;
  /** Updated full pending garbage queue for the receiving player. */
  pendingGarbage: GarbageBatch[];
}

export interface S2C_Pong {
  type: "pong";
  timestamp: number;
}

export interface S2C_TargetingUpdated {
  type: "targetingUpdated";
  roomId: RoomId;
  playerId: PlayerId;
  strategy: TargetingStrategyType;
  /** The manual target, if strategy is "manual". */
  targetPlayerId?: PlayerId;
}

export interface S2C_AttackPowerUpdated {
  type: "attackPowerUpdated";
  roomId: RoomId;
  playerId: PlayerId;
  multiplier: number;
  koCount: number;
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

export interface S2C_RematchUpdate {
  type: "rematchUpdate";
  roomId: RoomId;
  /** Player IDs who have voted for rematch so far. */
  votes: PlayerId[];
  /** Total number of players who need to vote. */
  totalPlayers: number;
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

/** Per-player rating change entry broadcast after a ranked game. */
export interface RatingChange {
  username: string;
  before: number;
  after: number;
}

export interface S2C_PlayerEmote {
  type: "playerEmote";
  roomId: RoomId;
  /** Player who sent the emote. */
  playerId: PlayerId;
  emote: EmoteKind;
  /** Server-side timestamp (ms since epoch) for animation sync. */
  timestamp: number;
}

export interface S2C_RatingUpdate {
  type: "ratingUpdate";
  roomId: RoomId;
  /** Rating changes for each player in the game, keyed by player ID. */
  changes: Record<PlayerId, RatingChange>;
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
  | S2C_TargetingUpdated
  | S2C_AttackPowerUpdated
  | S2C_Error
  | S2C_Disconnected
  | S2C_PlayerDisconnected
  | S2C_PlayerReconnected
  | S2C_GameRejoined
  | S2C_RematchUpdate
  | S2C_RatingUpdate
  | S2C_PlayerEmote;

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
  "targetingUpdated",
  "attackPowerUpdated",
  "error",
  "disconnected",
  "playerDisconnected",
  "playerReconnected",
  "gameRejoined",
  "rematchUpdate",
  "ratingUpdate",
  "playerEmote",
] as const;
