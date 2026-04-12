/**
 * Server-side game session.
 *
 * Manages the countdown → game start flow for a room. Assigns player indexes,
 * generates a shared seed, and produces initial game state snapshots.
 */

import type {
  GameStateSnapshot,
  HandicapMode,
  HandicapModifiers,
  InputAction,
  PlayerId,
  PlayerInfo,
  PlayerStats,
  RoomId,
  RuleSet,
  ServerMessage,
  TargetingStrategy,
} from "@tetris/shared";
import {
  modernRuleSet,
} from "@tetris/shared";
import { PlayerEngine, MULTIPLAYER_MODE_CONFIG } from "./player-engine.js";
import { GarbageManager } from "./garbage-manager.js";
import { BalancingMiddleware } from "./balancing-middleware.js";

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
  /** Serialized handicap modifier matrix to include in gameStarted. */
  handicapModifiers?: Record<string, HandicapModifiers>;
  /** Handicap mode to include in gameStarted. */
  handicapMode?: HandicapMode;
  /** Whether to apply the delayModifier field of the modifier matrix. */
  handicapDelayEnabled?: boolean;
  /** Whether to apply the messinessFactor field of the modifier matrix. */
  handicapMessinessEnabled?: boolean;
  /** Optional rule set override (defaults to modernRuleSet). */
  ruleSet?: RuleSet;
  /** Optional targeting strategy override for garbage distribution. */
  targetingStrategy?: TargetingStrategy;
  /** Optional garbage delay override in milliseconds. */
  garbageDelayMs?: number;
}

export type GameSessionState = "countdown" | "playing" | "cancelled" | "finished";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSeed(): number {
  // 32-bit integer seed
  return Math.floor(Math.random() * 0x7fffffff);
}

// ---------------------------------------------------------------------------
// GameSession
// ---------------------------------------------------------------------------

const COUNTDOWN_INTERVAL_MS = 1_000;
const COUNTDOWN_START = 3;

/** Tick interval in milliseconds (~60fps). */
const TICK_INTERVAL_MS = 1000 / 60;

export class GameSession {
  readonly roomId: RoomId;
  readonly seed: number;
  readonly playerIndexes: Record<PlayerId, number>;

  private _state: GameSessionState = "countdown";
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private currentCount: number = COUNTDOWN_START;
  private readonly broadcastToRoom: GameSessionConfig["broadcastToRoom"];
  private readonly onGameStarted?: () => void;
  private readonly onCancelled?: () => void;
  private readonly handicapModifiers?: Record<string, HandicapModifiers>;
  private readonly handicapMode?: HandicapMode;
  private readonly handicapDelayEnabled: boolean;
  private readonly handicapMessinessEnabled: boolean;
  private readonly playerNames: Record<PlayerId, string>;
  private readonly ruleSet: RuleSet;

  // -- Gameplay state --
  private readonly engines = new Map<PlayerId, PlayerEngine>();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number = 0;
  private readonly targetingStrategy?: TargetingStrategy;
  private readonly garbageDelayMs?: number;
  private garbageManager: GarbageManager | BalancingMiddleware | null = null;

  // -- Stats & elimination tracking --
  private gameStartTime: number = 0;
  private readonly playerStats = new Map<PlayerId, PlayerStats>();
  private readonly eliminations: PlayerId[] = [];

  constructor(config: GameSessionConfig) {
    this.roomId = config.roomId;
    this.seed = generateSeed();
    this.broadcastToRoom = config.broadcastToRoom;
    this.onGameStarted = config.onGameStarted;
    this.onCancelled = config.onCancelled;
    this.handicapModifiers = config.handicapModifiers;
    this.handicapMode = config.handicapMode;
    this.handicapDelayEnabled = config.handicapDelayEnabled ?? false;
    this.handicapMessinessEnabled = config.handicapMessinessEnabled ?? false;
    this.playerNames = Object.fromEntries(
      config.players.map((p) => [p.id, p.name]),
    );
    this.ruleSet = config.ruleSet ?? modernRuleSet();
    this.targetingStrategy = config.targetingStrategy;
    this.garbageDelayMs = config.garbageDelayMs;

    // Assign player indexes (0-based, room order)
    this.playerIndexes = {};
    config.players.forEach((player, index) => {
      this.playerIndexes[player.id] = index;
    });
  }

  get state(): GameSessionState {
    return this._state;
  }

  /** Get a player's engine (for input handling). */
  getPlayerEngine(playerId: PlayerId): PlayerEngine | undefined {
    return this.engines.get(playerId);
  }

  /** Get all player IDs in this session. */
  getPlayerIds(): PlayerId[] {
    return Object.keys(this.playerIndexes);
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
    this.stopTickLoop();
    this.onCancelled?.();
  }

  /**
   * Apply a player input action. Returns the resulting snapshot if applied,
   * or undefined if the input was rejected.
   */
  applyInput(playerId: PlayerId, action: InputAction): GameStateSnapshot | undefined {
    if (this._state !== "playing") return undefined;
    const engine = this.engines.get(playerId);
    if (!engine || engine.isGameOver) return undefined;

    const applied = engine.applyInput(action);
    if (!applied) return undefined;

    this.processGarbageFor(playerId, engine);

    const snapshot = engine.getSnapshot();
    this.broadcastSnapshot(playerId, snapshot);

    // Check for game over triggered by this input (e.g., hard drop causes top-out)
    if (engine.isGameOver) {
      this.handlePlayerGameOver(playerId);
    }

    return snapshot;
  }

  /**
   * Mark a player as disconnected during gameplay.
   * Their engine is stopped and game-over is broadcast.
   */
  handlePlayerDisconnect(playerId: PlayerId): void {
    if (this._state !== "playing") return;
    const engine = this.engines.get(playerId);
    if (!engine || engine.isGameOver) return;

    // Capture stats while engine still exists, then delete it
    this.capturePlayerStats(playerId);
    this.engines.delete(playerId);
    this.eliminatePlayer(playerId, /* statsCaptured */ true);
  }

  // -------------------------------------------------------------------------
  // Countdown flow
  // -------------------------------------------------------------------------

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
      // Countdown finished (sent count=0 "Go!") — delay gameStarted so
      // clients have time to display the "Go!" overlay before transitioning.
      this.countdownTimer = setTimeout(() => {
        if (this._state !== "countdown") return;
        this.countdownTimer = null;
        this._state = "playing";

        // Create player engines
        this.initializeEngines();

        // Build initial states from the real engine snapshots
        const initialStates: Record<PlayerId, GameStateSnapshot> = {};
        for (const [pid, engine] of this.engines) {
          initialStates[pid] = engine.getSnapshot();
        }

        this.broadcastToRoom(this.roomId, {
          type: "gameStarted",
          roomId: this.roomId,
          initialStates,
          seed: this.seed,
          playerIndexes: this.playerIndexes,
          handicapModifiers: this.handicapModifiers,
          handicapMode: this.handicapMode,
        });

        // Start the server tick loop
        this.startTickLoop();

        this.onGameStarted?.();
      }, COUNTDOWN_INTERVAL_MS);
    }
  }

  // -------------------------------------------------------------------------
  // Engine initialization
  // -------------------------------------------------------------------------

  private initializeEngines(): void {
    const playerIds = Object.keys(this.playerIndexes);
    this.gameStartTime = Date.now();
    for (const playerId of playerIds) {
      const engine = new PlayerEngine({
        playerId,
        seed: this.seed,
        ruleSet: this.ruleSet,
        modeConfig: MULTIPLAYER_MODE_CONFIG,
      });
      this.engines.set(playerId, engine);
      this.playerStats.set(playerId, {
        linesSent: 0,
        linesReceived: 0,
        piecesPlaced: 0,
        survivalMs: 0,
        score: 0,
        linesCleared: 0,
      });
    }

    this.garbageManager = new BalancingMiddleware({
      playerIds,
      playerNames: this.playerNames,
      ...(this.handicapModifiers !== undefined
        ? { modifiers: this.handicapModifiers }
        : {}),
      ...(this.targetingStrategy !== undefined
        ? { targetingStrategy: this.targetingStrategy }
        : {}),
      ...(this.garbageDelayMs !== undefined
        ? { delayMs: this.garbageDelayMs }
        : {}),
      delayEnabled: this.handicapDelayEnabled,
      messinessEnabled: this.handicapMessinessEnabled,
    });
  }

  // -------------------------------------------------------------------------
  // Tick loop
  // -------------------------------------------------------------------------

  private startTickLoop(): void {
    this.lastTickTime = Date.now();
    this.tickInterval = setInterval(() => this.onTick(), TICK_INTERVAL_MS);
  }

  private stopTickLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private onTick(): void {
    if (this._state !== "playing") {
      this.stopTickLoop();
      return;
    }

    const now = Date.now();
    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;

    for (const [playerId, engine] of this.engines) {
      if (engine.isGameOver) continue;

      const prevSnapshot = engine.getSnapshot();
      engine.advanceTick(deltaMs);

      this.processGarbageFor(playerId, engine);

      const currSnapshot = engine.getSnapshot();

      // Only broadcast if state changed
      if (!snapshotsEqual(prevSnapshot, currSnapshot)) {
        this.broadcastSnapshot(playerId, currSnapshot);
      }

      // Check for game over caused by gravity/lock
      if (currSnapshot.isGameOver && !prevSnapshot.isGameOver) {
        this.handlePlayerGameOver(playerId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Garbage processing (line-clear events + delayed drain)
  // -------------------------------------------------------------------------

  private processGarbageFor(playerId: PlayerId, engine: PlayerEngine): void {
    const gm = this.garbageManager;
    if (!gm) return;

    // 1. Any line clears from the player's latest action? → enqueue garbage.
    const event = engine.consumeLineClearEvent();
    if (event) {
      const outcome = gm.onLinesCleared(playerId, event);
      if (outcome.residualSent > 0) {
        const stats = this.playerStats.get(playerId);
        if (stats) stats.linesSent += outcome.residualSent;
      }
      for (const receiverId of outcome.affectedReceivers) {
        this.syncPendingGarbage(receiverId);
      }
    }

    // 2. Drain any ready incoming garbage and apply to this player's board.
    const ready = gm.drainReady(playerId);
    if (ready.length > 0) {
      const stats = this.playerStats.get(playerId);
      if (stats) {
        for (const batch of ready) stats.linesReceived += batch.lines;
      }
      engine.applyGarbage(ready);
      for (const batch of ready) {
        this.broadcastToRoom(this.roomId, {
          type: "garbageReceived",
          roomId: this.roomId,
          playerId,
          garbage: batch,
        });
      }
      this.syncPendingGarbage(playerId);
    }
  }

  private syncPendingGarbage(playerId: PlayerId): void {
    const gm = this.garbageManager;
    if (!gm) return;
    const engine = this.engines.get(playerId);
    if (!engine) return;
    const pending = gm.getPending(playerId);
    engine.setPendingGarbage(pending);
    this.broadcastToRoom(this.roomId, {
      type: "garbageQueued",
      roomId: this.roomId,
      playerId,
      pendingGarbage: pending,
    });
  }

  // -------------------------------------------------------------------------
  // Snapshot broadcasting
  // -------------------------------------------------------------------------

  private broadcastSnapshot(
    playerId: PlayerId,
    snapshot: GameStateSnapshot,
  ): void {
    this.broadcastToRoom(this.roomId, {
      type: "gameStateSnapshot",
      roomId: this.roomId,
      playerId,
      state: snapshot,
    });
  }

  // -------------------------------------------------------------------------
  // Game over / winner detection
  // -------------------------------------------------------------------------

  private handlePlayerGameOver(playerId: PlayerId): void {
    this.eliminatePlayer(playerId);
  }

  /** Common elimination path for both game-over and disconnect. */
  private eliminatePlayer(playerId: PlayerId, statsCaptured = false): void {
    if (!statsCaptured) this.capturePlayerStats(playerId);
    this.eliminations.push(playerId);
    this.garbageManager?.removePlayer(playerId);

    const totalPlayers = Object.keys(this.playerIndexes).length;
    const placement = totalPlayers - this.eliminations.indexOf(playerId);

    this.broadcastToRoom(this.roomId, {
      type: "gameOver",
      roomId: this.roomId,
      playerId,
      placement,
    });
    this.checkForWinner(playerId);
  }

  /**
   * Snapshot a player's current engine stats into playerStats.
   * Called at elimination time (before engine may be deleted).
   */
  private capturePlayerStats(playerId: PlayerId): void {
    const stats = this.playerStats.get(playerId);
    if (!stats) return;

    const engine = this.engines.get(playerId);
    if (engine) {
      const snapshot = engine.getSnapshot();
      stats.piecesPlaced = snapshot.piecesPlaced;
      stats.score = snapshot.score;
      stats.linesCleared = snapshot.linesCleared;
    }
    stats.survivalMs = Date.now() - this.gameStartTime;
  }

  /**
   * Check whether the session should end. `lastOutPlayerId` is the player
   * who most recently topped out or disconnected — used as the "winner" in
   * the 0-remaining edge case (they lasted longest).
   */
  private checkForWinner(lastOutPlayerId?: PlayerId): void {
    const activePlayers: PlayerId[] = [];
    for (const [playerId, engine] of this.engines) {
      if (!engine.isGameOver) {
        activePlayers.push(playerId);
      }
    }

    if (activePlayers.length <= 1) {
      this.stopTickLoop();

      let winnerId: PlayerId | undefined;
      if (activePlayers.length === 1) {
        winnerId = activePlayers[0];
      } else if (lastOutPlayerId !== undefined) {
        // All players are out — the last one to top out lasted longest
        winnerId = lastOutPlayerId;
      }

      if (winnerId !== undefined) {
        // Capture winner's stats (they weren't eliminated)
        this.capturePlayerStats(winnerId);

        // Build placements: winner = 1st, eliminations in reverse = 2nd, 3rd, ...
        const placements: Record<PlayerId, number> = {};
        placements[winnerId] = 1;
        let place = 2;
        for (let i = this.eliminations.length - 1; i >= 0; i--) {
          const pid = this.eliminations[i]!;
          if (pid === winnerId) continue; // winner already assigned 1st
          placements[pid] = place++;
        }

        // Collect stats
        const stats: Record<PlayerId, PlayerStats> = {};
        for (const [pid, s] of this.playerStats) {
          stats[pid] = { ...s };
        }

        this.broadcastToRoom(this.roomId, {
          type: "gameEnd",
          roomId: this.roomId,
          winnerId,
          placements,
          stats,
        });
      }
      this._state = "finished";
    }
  }
}

/**
 * Quick equality check for two snapshots — used to avoid broadcasting
 * unchanged state on tick. Compares only gameplay-relevant fields; `tick` is
 * excluded because it is always incremented by `advanceTick` and would make
 * the check trivially false every time.
 */
function snapshotsEqual(a: GameStateSnapshot, b: GameStateSnapshot): boolean {
  if (a.score !== b.score) return false;
  if (a.level !== b.level) return false;
  if (a.linesCleared !== b.linesCleared) return false;
  if (a.piecesPlaced !== b.piecesPlaced) return false;
  if (a.isGameOver !== b.isGameOver) return false;
  if (a.holdPiece !== b.holdPiece) return false;
  if (a.holdUsed !== b.holdUsed) return false;
  if (a.ghostY !== b.ghostY) return false;

  // Active piece comparison
  if (a.activePiece === null && b.activePiece === null) {
    // both null — equal
  } else if (a.activePiece === null || b.activePiece === null) {
    return false;
  } else if (
    a.activePiece.type !== b.activePiece.type ||
    a.activePiece.x !== b.activePiece.x ||
    a.activePiece.y !== b.activePiece.y ||
    a.activePiece.rotation !== b.activePiece.rotation
  ) {
    return false;
  }

  // Queue comparison
  if (a.nextQueue.length !== b.nextQueue.length) return false;
  for (let i = 0; i < a.nextQueue.length; i++) {
    if (a.nextQueue[i] !== b.nextQueue[i]) return false;
  }

  // Board comparison — only if other fields matched (most expensive)
  for (let r = 0; r < a.board.length; r++) {
    const rowA = a.board[r]!;
    const rowB = b.board[r]!;
    for (let c = 0; c < rowA.length; c++) {
      if (rowA[c] !== rowB[c]) return false;
    }
  }

  return true;
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
