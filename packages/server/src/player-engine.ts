/**
 * Server-side wrapper around TominoEngine for a single player.
 *
 * Manages a tick counter, converts engine state to protocol snapshots,
 * and provides an input application API that maps InputAction strings
 * to engine method calls.
 */

import type {
  GameStateSnapshot,
  GarbageBatch,
  InputAction,
  LineClearEvent,
  PlayerId,
  RuleSet,
  GameModeConfig,
} from "@tomino/shared";
import {
  TominoEngine,
  engineStateToSnapshot,
} from "@tomino/shared";

// ---------------------------------------------------------------------------
// Multiplayer mode config
// ---------------------------------------------------------------------------

/**
 * Game mode config for multiplayer: marathon-style with no goal limit.
 * Game runs until the player tops out.
 */
export const MULTIPLAYER_MODE_CONFIG: GameModeConfig = {
  mode: "marathon",
  goal: "none",
  goalValue: null,
  gravity: true,
  topOutEndsGame: true,
  displayStats: ["score", "level", "lines"],
};

// ---------------------------------------------------------------------------
// PlayerEngine
// ---------------------------------------------------------------------------

export interface PlayerEngineOptions {
  playerId: PlayerId;
  seed: number;
  ruleSet: RuleSet;
  modeConfig?: GameModeConfig;
  startLevel?: number;
}

export class PlayerEngine {
  readonly playerId: PlayerId;
  private readonly engine: TominoEngine;
  private tick = 0;
  private pendingGarbage: GarbageBatch[] = [];

  constructor(options: PlayerEngineOptions) {
    this.playerId = options.playerId;
    this.engine = new TominoEngine({
      ruleSet: options.ruleSet,
      modeConfig: options.modeConfig ?? MULTIPLAYER_MODE_CONFIG,
      seed: options.seed,
      startLevel: options.startLevel,
    });
    this.engine.start();
  }

  /** Whether this player's game is over. */
  get isGameOver(): boolean {
    return this.engine.getState().status === "gameOver";
  }

  /** Current tick number. */
  get currentTick(): number {
    return this.tick;
  }

  /**
   * Apply a player input action.
   * Returns true if the input was applied (game still playing), false otherwise.
   */
  applyInput(action: InputAction): boolean {
    const state = this.engine.getState();
    if (state.status !== "playing") return false;

    switch (action) {
      case "moveLeft":
        this.engine.moveLeft();
        break;
      case "moveRight":
        this.engine.moveRight();
        break;
      case "softDrop":
        this.engine.softDrop();
        break;
      case "hardDrop":
        this.engine.hardDrop();
        break;
      case "rotateCW":
        this.engine.rotateCW();
        break;
      case "rotateCCW":
        this.engine.rotateCCW();
        break;
      case "rotate180":
        // Engine has no rotate180 — apply two CW rotations
        this.engine.rotateCW();
        this.engine.rotateCW();
        break;
      case "hold":
        this.engine.hold();
        break;
      default:
        return false;
    }
    return true;
  }

  /**
   * Advance the engine by deltaMs and increment the tick counter.
   */
  advanceTick(deltaMs: number): void {
    this.engine.tick(deltaMs);
    this.tick++;
  }

  /**
   * Get the current state as a protocol GameStateSnapshot.
   */
  getSnapshot(): GameStateSnapshot {
    const snapshot = engineStateToSnapshot(this.engine.getState(), this.tick);
    return {
      ...snapshot,
      pendingGarbage: [...this.pendingGarbage],
    };
  }

  /** Pull and clear the engine's most recent line-clear event. */
  consumeLineClearEvent(): LineClearEvent | null {
    return this.engine.consumeLineClearEvent();
  }

  /** Insert garbage batches at the bottom of the player's board. */
  applyGarbage(batches: readonly GarbageBatch[]): void {
    this.engine.applyGarbage(batches);
  }

  /** Overwrite the server-tracked pending garbage queue (for snapshots). */
  setPendingGarbage(batches: readonly GarbageBatch[]): void {
    this.pendingGarbage = [...batches];
  }

  /** Read the server-tracked pending garbage queue. */
  getPendingGarbage(): readonly GarbageBatch[] {
    return this.pendingGarbage;
  }

  /**
   * Replace the board grid. TEST ONLY — for setting up specific board states
   * (e.g., near-topout boards via boardFromAscii).
   */
  _testSetBoard(grid: import("@tomino/shared").Grid): void {
    this.engine._testSetBoard(grid);
  }
}
