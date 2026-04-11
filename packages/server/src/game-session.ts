/**
 * Server-side game session.
 *
 * Manages the countdown → game start flow for a room. Assigns player indexes,
 * generates a shared seed, and produces initial game state snapshots.
 */

import type {
  Board,
  GameStateSnapshot,
  PlayerId,
  PlayerInfo,
  RoomId,
  ServerMessage,
} from "@tetris/shared";
import {
  BOARD_TOTAL_HEIGHT,
  BOARD_WIDTH,
} from "@tetris/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameSessionConfig {
  roomId: RoomId;
  players: readonly PlayerInfo[];
  /** Callback to broadcast a message to all players in the room. */
  broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void;
  /** Called when the countdown finishes and the game officially starts. */
  onGameStarted?: () => void;
  /** Called when the session is cancelled (e.g. player disconnect during countdown). */
  onCancelled?: () => void;
}

export type GameSessionState = "countdown" | "playing" | "cancelled";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_TOTAL_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null),
  );
}

function generateSeed(): number {
  // 32-bit integer seed
  return Math.floor(Math.random() * 0x7fffffff);
}

function createInitialSnapshot(): GameStateSnapshot {
  return {
    tick: 0,
    board: createEmptyBoard(),
    activePiece: null,
    ghostY: null,
    nextQueue: [],
    holdPiece: null,
    holdUsed: false,
    score: 0,
    level: 1,
    linesCleared: 0,
    pendingGarbage: [],
    isGameOver: false,
  };
}

// ---------------------------------------------------------------------------
// GameSession
// ---------------------------------------------------------------------------

const COUNTDOWN_INTERVAL_MS = 1_000;
const COUNTDOWN_START = 3;

export class GameSession {
  readonly roomId: RoomId;
  readonly seed: number;
  readonly playerIndexes: Record<PlayerId, number>;
  readonly initialStates: Record<PlayerId, GameStateSnapshot>;

  private _state: GameSessionState = "countdown";
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private currentCount: number = COUNTDOWN_START;
  private readonly broadcastToRoom: GameSessionConfig["broadcastToRoom"];
  private readonly onGameStarted?: () => void;
  private readonly onCancelled?: () => void;

  constructor(config: GameSessionConfig) {
    this.roomId = config.roomId;
    this.seed = generateSeed();
    this.broadcastToRoom = config.broadcastToRoom;
    this.onGameStarted = config.onGameStarted;
    this.onCancelled = config.onCancelled;

    // Assign player indexes (0-based, room order)
    this.playerIndexes = {};
    config.players.forEach((player, index) => {
      this.playerIndexes[player.id] = index;
    });

    // Generate initial states for each player
    this.initialStates = {};
    for (const player of config.players) {
      this.initialStates[player.id] = createInitialSnapshot();
    }
  }

  get state(): GameSessionState {
    return this._state;
  }

  /** Start the countdown sequence: 3 → 2 → 1 → 0 → gameStarted. */
  startCountdown(): void {
    if (this._state !== "countdown") return;
    this.currentCount = COUNTDOWN_START;
    this.sendCountdownTick();
  }

  /** Cancel the session (e.g. player disconnected during countdown). */
  cancel(): void {
    if (this._state === "cancelled") return;
    this._state = "cancelled";
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.onCancelled?.();
  }

  private sendCountdownTick(): void {
    if (this._state !== "countdown") return;

    this.broadcastToRoom(this.roomId, {
      type: "countdown",
      roomId: this.roomId,
      count: this.currentCount,
    });

    if (this.currentCount > 0) {
      this.currentCount--;
      this.countdownTimer = setTimeout(
        () => this.sendCountdownTick(),
        COUNTDOWN_INTERVAL_MS,
      );
    } else {
      // Countdown finished (sent count=0 "Go!") — now send gameStarted
      this.countdownTimer = null;
      this._state = "playing";

      this.broadcastToRoom(this.roomId, {
        type: "gameStarted",
        roomId: this.roomId,
        initialStates: this.initialStates,
        seed: this.seed,
        playerIndexes: this.playerIndexes,
      });

      this.onGameStarted?.();
    }
  }
}

// ---------------------------------------------------------------------------
// Session registry (maps roomId → active GameSession)
// ---------------------------------------------------------------------------

const sessions = new Map<RoomId, GameSession>();

export function getGameSession(roomId: RoomId): GameSession | undefined {
  return sessions.get(roomId);
}

export function createGameSession(config: GameSessionConfig): GameSession {
  // Cancel any existing session for this room
  const existing = sessions.get(config.roomId);
  if (existing) {
    existing.cancel();
  }

  const session = new GameSession(config);
  sessions.set(config.roomId, session);
  return session;
}

export function removeGameSession(roomId: RoomId): void {
  const session = sessions.get(roomId);
  if (session) {
    session.cancel();
    sessions.delete(roomId);
  }
}
