/**
 * Client-side multiplayer engine wrapper.
 *
 * Mirrors the server-side `PlayerEngine` API so the client can run a
 * deterministic local copy of the game using the same seed and ruleset.
 * Used by the prediction engine to produce immediate-response snapshots
 * before authoritative server state arrives.
 */

import type {
  GameModeConfig,
  GameStateSnapshot,
  InputAction,
  RuleSet,
} from "@tomino/shared";
import { TominoEngine, engineStateToSnapshot } from "@tomino/shared";

/** Default mode config used by the multiplayer client (matches server). */
export const MULTIPLAYER_MODE_CONFIG: GameModeConfig = {
  mode: "marathon",
  goal: "none",
  goalValue: null,
  gravity: true,
  topOutEndsGame: true,
  displayStats: ["score", "level", "lines"],
};

export interface EngineProxyOptions {
  seed: number;
  ruleSet: RuleSet;
  modeConfig?: GameModeConfig;
  startLevel?: number;
}

export class EngineProxy {
  private readonly opts: EngineProxyOptions;
  private engine: TominoEngine;
  private tick = 0;

  constructor(options: EngineProxyOptions) {
    this.opts = options;
    this.engine = this.buildEngine();
  }

  private buildEngine(): TominoEngine {
    const engine = new TominoEngine({
      ruleSet: this.opts.ruleSet,
      modeConfig: this.opts.modeConfig ?? MULTIPLAYER_MODE_CONFIG,
      seed: this.opts.seed,
      startLevel: this.opts.startLevel,
    });
    engine.start();
    return engine;
  }

  /** Whether the local game has ended (top-out or quit). */
  get isGameOver(): boolean {
    return this.engine.getState().status === "gameOver";
  }

  /** Current tick counter (incremented on each `advanceTick`). */
  get currentTick(): number {
    return this.tick;
  }

  /**
   * Apply a player input action.
   * Returns true if accepted (game was playing), false otherwise.
   */
  applyInput(action: InputAction): boolean {
    if (this.engine.getState().status !== "playing") return false;

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

  /** Advance the local engine clock. */
  advanceTick(deltaMs: number): void {
    this.engine.tick(deltaMs);
    this.tick++;
  }

  /** Current state as a protocol `GameStateSnapshot`. */
  getSnapshot(): GameStateSnapshot {
    return engineStateToSnapshot(this.engine.getState(), this.tick);
  }

  /** Tear down the engine and rebuild it from the original seed/rule set. */
  reset(): void {
    this.engine = this.buildEngine();
    this.tick = 0;
  }
}
