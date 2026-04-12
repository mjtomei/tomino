/**
 * Core game types shared between client and server.
 */

import type { HandicapSettings } from "./handicap-types.js";

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

/** 0 = spawn, 1 = CW, 2 = 180, 3 = CCW */
export type RotationState = 0 | 1 | 2 | 3;

export interface PieceState {
  type: PieceType;
  /** Column of the piece origin (left edge of bounding box). */
  x: number;
  /** Row of the piece origin (top edge of bounding box). 0 = top visible row. */
  y: number;
  rotation: RotationState;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/**
 * A cell is either empty (null) or contains a piece type indicating its color.
 * The board is stored row-major: board[row][col].
 * Row 0 is the top of the visible area; negative indices (stored as extra rows
 * at the front) represent hidden rows above the skyline.
 */
export type Cell = PieceType | null;
export type Row = Cell[];
export type Board = Row[];

export const BOARD_WIDTH = 10;
export const BOARD_VISIBLE_HEIGHT = 20;
export const BOARD_BUFFER_HEIGHT = 20;
export const BOARD_TOTAL_HEIGHT = BOARD_VISIBLE_HEIGHT + BOARD_BUFFER_HEIGHT;

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

/** Opaque string identifier for a player (stable across reconnects). */
export type PlayerId = string;

export interface PlayerInfo {
  id: PlayerId;
  name: string;
}

// ---------------------------------------------------------------------------
// Room / Lobby
// ---------------------------------------------------------------------------

export type RoomId = string;

export type RoomStatus = "waiting" | "playing" | "finished";

export interface RoomConfig {
  name: string;
  maxPlayers: number;
}

export interface RoomState {
  id: RoomId;
  config: RoomConfig;
  status: RoomStatus;
  players: PlayerInfo[];
  /** The player who created the room and can start the game. */
  hostId: PlayerId;
  /** Lobby-configurable handicap settings. */
  handicapSettings?: HandicapSettings;
  /** Whether player ratings are visible in the waiting room. */
  ratingVisible?: boolean;
  /** Player ratings keyed by player ID (looked up from skill store on join). */
  playerRatings?: Record<PlayerId, number>;
}

// ---------------------------------------------------------------------------
// Garbage
// ---------------------------------------------------------------------------

/** A batch of garbage lines to be inserted at the bottom of the board. */
export interface GarbageBatch {
  /** Number of garbage lines in this batch. */
  lines: number;
  /** Column index (0-based) of the gap in each garbage line. */
  gapColumn: number;
}

// ---------------------------------------------------------------------------
// Game state snapshot
// ---------------------------------------------------------------------------

export interface GameStateSnapshot {
  /** Tick / frame number for ordering. */
  tick: number;
  board: Board;
  activePiece: PieceState | null;
  /** Ghost piece Y position (lowest valid Y for the active piece). */
  ghostY: number | null;
  nextQueue: PieceType[];
  holdPiece: PieceType | null;
  /** Whether the player has already used hold this turn. */
  holdUsed: boolean;
  score: number;
  level: number;
  linesCleared: number;
  /** Pending garbage that will be inserted after the current piece locks. */
  pendingGarbage: GarbageBatch[];
  /** Total pieces locked onto the board. */
  piecesPlaced: number;
  /** True if this player has topped out. */
  isGameOver: boolean;
}

// ---------------------------------------------------------------------------
// Input actions
// ---------------------------------------------------------------------------

export type InputAction =
  | "moveLeft"
  | "moveRight"
  | "rotateCW"
  | "rotateCCW"
  | "rotate180"
  | "softDrop"
  | "hardDrop"
  | "hold";
