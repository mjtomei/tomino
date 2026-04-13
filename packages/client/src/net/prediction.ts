/**
 * Client-side prediction and reconciliation.
 *
 * The `PredictionEngine` wraps an `EngineProxy` (a deterministic local copy
 * of the game) and keeps an input history tagged with monotonic sequence
 * numbers. Local inputs are applied immediately so the UI feels responsive;
 * authoritative server state is folded in via `onServerState`. Stale
 * snapshots are dropped, acked inputs are pruned from the pending buffer,
 * and `reconcile()` rebuilds the local engine by replaying the remaining
 * input history — used when server state diverges from local prediction.
 */

import type {
  GameModeConfig,
  GameStateSnapshot,
  InputAction,
  RuleSet,
} from "@tomino/shared";
import { EngineProxy, MULTIPLAYER_MODE_CONFIG } from "../engine/engine-proxy.js";

export interface PredictionEngineOptions {
  seed: number;
  ruleSet: RuleSet;
  modeConfig?: GameModeConfig;
  startLevel?: number;
}

export interface RecordedInput {
  seq: number;
  action: InputAction;
}

export interface OnServerStateResult {
  /** True if the snapshot was accepted (not out-of-order). */
  accepted: boolean;
  /** Number of pending inputs pruned by the ack. */
  prunedInputs: number;
}

export class PredictionEngine {
  private proxy: EngineProxy;

  /** All locally-applied inputs that have not yet been pruned by ack. */
  private history: RecordedInput[] = [];
  private nextSeqCounter = 1;
  private ackedSeq = 0;
  private latestServerTick = -1;
  private latestServerSnapshot: GameStateSnapshot | null = null;

  constructor(options: PredictionEngineOptions) {
    this.proxy = new EngineProxy({
      seed: options.seed,
      ruleSet: options.ruleSet,
      modeConfig: options.modeConfig ?? MULTIPLAYER_MODE_CONFIG,
      startLevel: options.startLevel,
    });
  }

  /**
   * Apply an input locally and record it as pending.
   * Returns the assigned sequence number, or 0 if the input was dropped
   * because the local engine is already in a non-playing state — dropped
   * inputs must not be recorded, otherwise a later `reconcile()` would
   * replay them on a fresh engine and incorrectly resurrect the game.
   */
  applyLocalInput(action: InputAction): number {
    if (this.proxy.isGameOver) return 0;
    const seq = this.nextSeqCounter++;
    this.history.push({ seq, action });
    this.proxy.applyInput(action);
    return seq;
  }

  /** Advance the local engine clock for gravity / lock delay. */
  advanceTick(deltaMs: number): void {
    this.proxy.advanceTick(deltaMs);
  }

  /**
   * Fold a server-authoritative snapshot into local prediction.
   * Out-of-order (older `tick`) snapshots are dropped. If `ackInputSeq` is
   * provided, inputs with `seq <= ackInputSeq` are pruned from the pending
   * buffer (they have been processed server-side).
   */
  onServerState(
    snapshot: GameStateSnapshot,
    ackInputSeq?: number,
  ): OnServerStateResult {
    if (snapshot.tick <= this.latestServerTick) {
      return { accepted: false, prunedInputs: 0 };
    }
    this.latestServerTick = snapshot.tick;
    this.latestServerSnapshot = snapshot;

    let pruned = 0;
    if (ackInputSeq !== undefined && ackInputSeq > this.ackedSeq) {
      const before = this.history.length;
      this.history = this.history.filter((h) => h.seq > ackInputSeq);
      pruned = before - this.history.length;
      this.ackedSeq = ackInputSeq;
    }

    return { accepted: true, prunedInputs: pruned };
  }

  /**
   * Snap the local engine to match server state by rebuilding from seed and
   * replaying all remaining (unpruned) history. Called when divergence is
   * detected or when the caller wants to force a resync.
   */
  reconcile(): void {
    this.proxy.reset();
    for (const h of this.history) {
      this.proxy.applyInput(h.action);
    }
  }

  /** The current locally-predicted snapshot (updated on every local input). */
  getPredictedSnapshot(): GameStateSnapshot {
    return this.proxy.getSnapshot();
  }

  /** The most recent server snapshot received (or null if none yet). */
  getServerSnapshot(): GameStateSnapshot | null {
    return this.latestServerSnapshot;
  }

  /** Pending unacked inputs (those with `seq > ackedSeq`). */
  get pendingInputs(): readonly RecordedInput[] {
    return this.history.filter((h) => h.seq > this.ackedSeq);
  }

  /** Highest input sequence number currently acked by the server. */
  get lastAckedSeq(): number {
    return this.ackedSeq;
  }

  /** Next sequence number that will be assigned. */
  get nextSeq(): number {
    return this.nextSeqCounter;
  }

  /** Highest server tick observed so far (or -1 if none). */
  get latestTick(): number {
    return this.latestServerTick;
  }

  /** Whether the local predicted engine has reached game-over. */
  get isGameOver(): boolean {
    return this.proxy.isGameOver;
  }
}
