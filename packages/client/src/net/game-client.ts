/**
 * Client-side game session state and multiplayer game client.
 *
 * `GameSessionData` holds the data received from the server when a game
 * starts (player index, seed, initial snapshots). `GameClient` wires a
 * `PredictionEngine` to a `ClientSocket` — local inputs are applied
 * immediately to the predicted engine and sent to the server in the same
 * call; authoritative `gameStateSnapshot` messages for the local player
 * are folded back into the prediction engine.
 */

import type {
  GameModeConfig,
  GameStateSnapshot,
  HandicapMode,
  HandicapModifiers,
  InputAction,
  PlayerId,
  RoomId,
  RuleSet,
} from "@tomino/shared";
import { modernRuleSet } from "@tomino/shared";
import type { ClientSocket } from "./client-socket.js";
import { PredictionEngine } from "./prediction.js";

export interface GameSessionData {
  /** Shared random seed for deterministic piece generation. */
  seed: number;
  /** Maps each player ID to their 0-based player index. */
  playerIndexes: Record<PlayerId, number>;
  /** Per-player initial snapshots keyed by player ID. */
  initialStates: Record<PlayerId, GameStateSnapshot>;
  /** Serialized modifier matrix (key: "sender→receiver"). */
  handicapModifiers?: Record<string, HandicapModifiers>;
  /** Handicap mode (boost or symmetric). */
  handicapMode?: HandicapMode;
}

export interface GameClientOptions {
  socket: ClientSocket;
  roomId: RoomId;
  localPlayerId: PlayerId;
  session: GameSessionData;
  ruleSet?: RuleSet;
  modeConfig?: GameModeConfig;
}

/**
 * Multiplayer game client for the local player.
 *
 * Constructed after `gameStarted` is received; holds the prediction engine
 * seeded with the same RNG seed as the server and routes inputs / state
 * updates between the socket and the prediction engine.
 */
export class GameClient {
  readonly roomId: RoomId;
  readonly localPlayerId: PlayerId;
  readonly session: GameSessionData;
  readonly prediction: PredictionEngine;

  private readonly socket: ClientSocket;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(options: GameClientOptions) {
    this.socket = options.socket;
    this.roomId = options.roomId;
    this.localPlayerId = options.localPlayerId;
    this.session = options.session;
    this.prediction = new PredictionEngine({
      seed: options.session.seed,
      ruleSet: options.ruleSet ?? modernRuleSet(),
      modeConfig: options.modeConfig,
    });

    // Forward authoritative snapshots for the local player into prediction.
    this.unsubscribers.push(
      this.socket.on("gameStateSnapshot", (msg) => {
        if (msg.roomId !== this.roomId) return;
        if (msg.playerId !== this.localPlayerId) return;
        this.prediction.onServerState(msg.state);
      }),
    );
  }

  /**
   * Apply a local input: updates predicted state immediately and forwards
   * the input to the server tagged with its sequence number.
   */
  sendInput(action: InputAction): number {
    const seq = this.prediction.applyLocalInput(action);
    if (seq === 0) return 0;
    this.socket.send({
      type: "playerInput",
      roomId: this.roomId,
      action,
      tick: seq,
    });
    return seq;
  }

  /** Advance the local engine clock for gravity / lock delay. */
  advanceTick(deltaMs: number): void {
    this.prediction.advanceTick(deltaMs);
  }

  /** The snapshot the UI should render — the locally-predicted state. */
  getRenderSnapshot(): GameStateSnapshot {
    return this.prediction.getPredictedSnapshot();
  }

  /** Tear down socket subscriptions. */
  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
  }
}
