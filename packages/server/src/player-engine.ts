/**
 * Server-side wrapper around TetrisEngine for a single player.
 *
 * Manages a tick counter, converts engine state to protocol snapshots,
 * and provides an input application API that maps InputAction strings
 * to engine method calls.
 */

import type {
  GameStateSnapshot,
  InputAction,
  PlayerId,
  RuleSet,
  GameModeConfig,
} from "@tetris/shared";
import {
  TetrisEngine,
  engineStateToSnapshot,
} from "@tetris/shared";

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
  private readonly engine: TetrisEngine;
  private tick = 0;

  constructor(options: PlayerEngineOptions) {
    this.playerId = options.playerId;
    this.engine = new TetrisEngine({
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
    return engineStateToSnapshot(this.engine.getState(), this.tick);
  }
}
