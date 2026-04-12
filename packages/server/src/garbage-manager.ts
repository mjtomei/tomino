/**
 * Server-side garbage distribution manager.
 *
 * Owns per-player pending-incoming queues, applies a configurable delay
 * before garbage is inserted, and cancels incoming garbage when a player
 * clears lines. Uses a pluggable `TargetingStrategy` to decide where outgoing
 * garbage goes; defaults to even-split across all opponents.
 */

import {
  BOARD_WIDTH,
  calculateGarbage,
  evenSplitStrategy,
} from "@tetris/shared";
import type {
  GarbageBatch,
  LineClearCount,
  PlayerId,
  TargetingStrategy,
  TSpinType,
} from "@tetris/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Default delay between a garbage line being queued and becoming ready. */
export const DEFAULT_GARBAGE_DELAY_MS = 500;

export interface GarbageManagerOptions {
  playerIds: readonly PlayerId[];
  /** Milliseconds between queue time and ready time. Defaults to 500ms. */
  delayMs?: number;
  /** Targeting strategy. Defaults to even-split. */
  targetingStrategy?: TargetingStrategy;
  /** Wall-clock source (ms). Defaults to `Date.now`. */
  now?: () => number;
  /** RNG for gap-column selection (0 ≤ r < 1). Defaults to `Math.random`. */
  gapRng?: () => number;
}

interface PendingEntry {
  batch: GarbageBatch;
  readyAt: number;
  senderId: PlayerId;
}

/** Outcome of a single `onLinesCleared` call. */
export interface LinesClearedOutcome {
  /** Total garbage the sender *attempted* to send before cancellation. */
  total: number;
  /** Lines cancelled from sender's own incoming queue. */
  cancelled: number;
  /** Residual lines actually routed to opponents after cancellation. */
  residualSent: number;
  /** Receivers whose queues were modified (cancellation or new enqueue). */
  affectedReceivers: PlayerId[];
}

// ---------------------------------------------------------------------------
// GarbageManager
// ---------------------------------------------------------------------------

export class GarbageManager {
  private players: PlayerId[];
  private targetingStrategy: TargetingStrategy;
  private readonly delayMs: number;
  private readonly now: () => number;
  private readonly gapRng: () => number;
  private readonly queues = new Map<PlayerId, PendingEntry[]>();

  constructor(options: GarbageManagerOptions) {
    this.players = [...options.playerIds];
    this.delayMs = options.delayMs ?? DEFAULT_GARBAGE_DELAY_MS;
    this.targetingStrategy = options.targetingStrategy ?? evenSplitStrategy;
    this.now = options.now ?? (() => Date.now());
    this.gapRng = options.gapRng ?? Math.random;
    for (const pid of this.players) {
      this.queues.set(pid, []);
    }
  }

  /** Swap in a different targeting strategy (used by tests / future PR). */
  setTargetingStrategy(strategy: TargetingStrategy): void {
    this.targetingStrategy = strategy;
  }

  /** Remove a player and their pending queue. */
  removePlayer(playerId: PlayerId): void {
    this.players = this.players.filter((id) => id !== playerId);
    this.queues.delete(playerId);
  }

  /** Read (immutable view of) a player's pending-incoming queue. */
  getPending(playerId: PlayerId): GarbageBatch[] {
    const q = this.queues.get(playerId);
    if (!q) return [];
    return q.map((e) => e.batch);
  }

  /**
   * Called when a player locks a piece and clears lines. Computes the
   * garbage sent, cancels from the sender's own queue first (FIFO), routes
   * the residual to opponents via the targeting strategy, and enqueues
   * delayed batches on each receiver.
   */
  onLinesCleared(
    sender: PlayerId,
    input: {
      linesCleared: LineClearCount;
      tSpin: TSpinType;
      combo: number;
      b2b: number;
    },
  ): LinesClearedOutcome {
    const affected = new Set<PlayerId>();
    const result = calculateGarbage(input);
    const total = result.total;

    if (total === 0) {
      return {
        total: 0,
        cancelled: 0,
        residualSent: 0,
        affectedReceivers: [],
      };
    }

    // 1. Cancel from sender's own pending incoming (FIFO).
    const senderQueue = this.queues.get(sender);
    let cancelled = 0;
    if (senderQueue && senderQueue.length > 0) {
      let remaining = total;
      while (remaining > 0 && senderQueue.length > 0) {
        const head = senderQueue[0]!;
        if (head.batch.lines <= remaining) {
          cancelled += head.batch.lines;
          remaining -= head.batch.lines;
          senderQueue.shift();
        } else {
          // Partial cancel — reduce the head entry in place.
          const reduced: PendingEntry = {
            ...head,
            batch: { ...head.batch, lines: head.batch.lines - remaining },
          };
          senderQueue[0] = reduced;
          cancelled += remaining;
          remaining = 0;
        }
      }
      if (cancelled > 0) affected.add(sender);
    }

    const residual = total - cancelled;
    if (residual <= 0) {
      return {
        total,
        cancelled,
        residualSent: 0,
        affectedReceivers: Array.from(affected),
      };
    }

    // 2. Route residual via targeting strategy.
    const allocations = this.targetingStrategy.resolveTargets(
      sender,
      this.players,
      { linesToSend: residual },
    );

    const readyAt = this.now() + this.delayMs;
    let placed = 0;
    for (const alloc of allocations) {
      if (alloc.lines <= 0) continue;
      const queue = this.queues.get(alloc.playerId);
      if (!queue) continue; // player removed mid-flight
      const batch: GarbageBatch = {
        lines: alloc.lines,
        gapColumn: this.chooseGapColumn(),
      };
      queue.push({ batch, readyAt, senderId: sender });
      affected.add(alloc.playerId);
      placed += alloc.lines;
    }

    return {
      total,
      cancelled,
      residualSent: placed,
      affectedReceivers: Array.from(affected),
    };
  }

  /**
   * Drain all entries on `playerId`'s queue whose `readyAt <= now`. Returns
   * the ready batches in FIFO order.
   */
  drainReady(playerId: PlayerId, now: number = this.now()): GarbageBatch[] {
    const queue = this.queues.get(playerId);
    if (!queue || queue.length === 0) return [];
    const drained: GarbageBatch[] = [];
    while (queue.length > 0 && queue[0]!.readyAt <= now) {
      drained.push(queue.shift()!.batch);
    }
    return drained;
  }

  private chooseGapColumn(): number {
    const r = this.gapRng();
    const col = Math.floor(r * BOARD_WIDTH);
    if (col < 0) return 0;
    if (col >= BOARD_WIDTH) return BOARD_WIDTH - 1;
    return col;
  }
}
