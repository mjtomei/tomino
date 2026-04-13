/**
 * Balancing middleware — wraps the garbage pipeline to apply per-pair
 * handicap modifiers between the garbage calculator and network distribution.
 *
 * Public API mirrors `GarbageManager` so `GameSession` can swap it in.
 * When no modifier matrix is provided, delegates to an inner `GarbageManager`
 * for identical passthrough behavior.
 */

import {
  BOARD_WIDTH,
  calculateGarbage,
  evenSplitStrategy,
  modifierKey,
} from "@tomino/shared";
import type {
  GarbageBatch,
  HandicapModifiers,
  LineClearCount,
  ModifierMatrixKey,
  PlayerId,
  TargetingStrategy,
  TSpinType,
} from "@tomino/shared";
import {
  GarbageManager,
  DEFAULT_GARBAGE_DELAY_MS,
  type LinesClearedOutcome,
} from "./garbage-manager.js";

export interface BalancingMiddlewareOptions {
  playerIds: readonly PlayerId[];
  /** Map from PlayerId to username; required for modifier matrix lookup. */
  playerNames: Record<PlayerId, string>;
  /** Serialized modifier matrix. When undefined, middleware is a passthrough. */
  modifiers?: Record<string, HandicapModifiers>;
  delayMs?: number;
  targetingStrategy?: TargetingStrategy;
  now?: () => number;
  /** RNG for default gap-column selection (0 ≤ r < 1). */
  gapRng?: () => number;
  /** RNG for probabilistic rounding (0 ≤ r < 1). */
  rounderRng?: () => number;
  delayEnabled?: boolean;
  messinessEnabled?: boolean;
}

interface PendingEntry {
  batch: GarbageBatch;
  readyAt: number;
  senderId: PlayerId;
}

const IDENTITY: HandicapModifiers = {
  garbageMultiplier: 1.0,
  delayModifier: 1.0,
  messinessFactor: 1.0,
};

export class BalancingMiddleware {
  private players: PlayerId[];
  private readonly playerNames: Record<PlayerId, string>;
  private readonly modifiers?: Record<string, HandicapModifiers>;
  private readonly delayMs: number;
  private targetingStrategy: TargetingStrategy;
  private readonly now: () => number;
  private readonly gapRng: () => number;
  private readonly rounderRng: () => number;
  private readonly delayEnabled: boolean;
  private readonly messinessEnabled: boolean;
  private readonly queues = new Map<PlayerId, PendingEntry[]>();

  /** Passthrough inner manager — used only when `modifiers` is undefined. */
  private readonly passthrough?: GarbageManager;

  constructor(options: BalancingMiddlewareOptions) {
    this.players = [...options.playerIds];
    this.playerNames = { ...options.playerNames };
    this.modifiers = options.modifiers;
    this.delayMs = options.delayMs ?? DEFAULT_GARBAGE_DELAY_MS;
    this.targetingStrategy = options.targetingStrategy ?? evenSplitStrategy;
    this.now = options.now ?? (() => Date.now());
    this.gapRng = options.gapRng ?? Math.random;
    this.rounderRng = options.rounderRng ?? Math.random;
    this.delayEnabled = options.delayEnabled ?? false;
    this.messinessEnabled = options.messinessEnabled ?? false;

    for (const pid of this.players) {
      this.queues.set(pid, []);
    }

    if (!this.modifiers) {
      const passOpts: ConstructorParameters<typeof GarbageManager>[0] = {
        playerIds: options.playerIds,
        delayMs: this.delayMs,
        targetingStrategy: this.targetingStrategy,
        now: this.now,
        gapRng: this.gapRng,
      };
      this.passthrough = new GarbageManager(passOpts);
    }
  }

  setTargetingStrategy(strategy: TargetingStrategy): void {
    this.targetingStrategy = strategy;
    this.passthrough?.setTargetingStrategy(strategy);
  }

  removePlayer(playerId: PlayerId): void {
    this.players = this.players.filter((id) => id !== playerId);
    this.queues.delete(playerId);
    this.passthrough?.removePlayer(playerId);
  }

  getPending(playerId: PlayerId): GarbageBatch[] {
    if (this.passthrough) return this.passthrough.getPending(playerId);
    const q = this.queues.get(playerId);
    if (!q) return [];
    return q.map((e) => e.batch);
  }

  drainReady(playerId: PlayerId, now: number = this.now()): GarbageBatch[] {
    if (this.passthrough) return this.passthrough.drainReady(playerId, now);
    const queue = this.queues.get(playerId);
    if (!queue || queue.length === 0) return [];
    const drained: GarbageBatch[] = [];
    while (queue.length > 0 && queue[0]!.readyAt <= now) {
      drained.push(queue.shift()!.batch);
    }
    return drained;
  }

  onLinesCleared(
    sender: PlayerId,
    input: {
      linesCleared: LineClearCount;
      tSpin: TSpinType;
      combo: number;
      b2b: number;
    },
  ): LinesClearedOutcome {
    if (this.passthrough) return this.passthrough.onLinesCleared(sender, input);

    const affected = new Set<PlayerId>();
    const result = calculateGarbage(input);
    const total = result.total;

    if (total === 0) {
      return { total: 0, cancelled: 0, residualSent: 0, affectedReceivers: [] };
    }

    // Cancel from sender's own pending incoming (FIFO) using unmodified total.
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

    const allocations = this.targetingStrategy.resolveTargets(
      sender,
      this.players,
      { linesToSend: residual },
    );

    const nowMs = this.now();
    let placed = 0;
    for (const alloc of allocations) {
      if (alloc.lines <= 0) continue;
      const queue = this.queues.get(alloc.playerId);
      if (!queue) continue;

      const mods = this.lookupModifiers(sender, alloc.playerId);
      const rawLines = alloc.lines * mods.garbageMultiplier;
      const modifiedLines = this.probabilisticRound(rawLines);
      if (modifiedLines <= 0) continue;

      const delayFactor = this.delayEnabled ? mods.delayModifier : 1.0;
      const readyAt = nowMs + this.delayMs * delayFactor;

      const gapColumn = this.messinessEnabled
        ? this.chooseGapColumnWithMessiness(mods.messinessFactor)
        : this.chooseGapColumn();

      const batch: GarbageBatch = { lines: modifiedLines, gapColumn };
      queue.push({ batch, readyAt, senderId: sender });
      affected.add(alloc.playerId);
      placed += modifiedLines;
    }

    return {
      total,
      cancelled,
      residualSent: placed,
      affectedReceivers: Array.from(affected),
    };
  }

  private lookupModifiers(sender: PlayerId, receiver: PlayerId): HandicapModifiers {
    if (!this.modifiers) return IDENTITY;
    const senderName = this.playerNames[sender];
    const receiverName = this.playerNames[receiver];
    if (senderName === undefined || receiverName === undefined) return IDENTITY;
    const key: ModifierMatrixKey = modifierKey(senderName, receiverName);
    return this.modifiers[key] ?? IDENTITY;
  }

  private probabilisticRound(x: number): number {
    if (x <= 0) return 0;
    const floor = Math.floor(x);
    const frac = x - floor;
    if (frac === 0) return floor;
    return this.rounderRng() < frac ? floor + 1 : floor;
  }

  private chooseGapColumn(): number {
    const r = this.gapRng();
    const col = Math.floor(r * BOARD_WIDTH);
    if (col < 0) return 0;
    if (col >= BOARD_WIDTH) return BOARD_WIDTH - 1;
    return col;
  }

  private chooseGapColumnWithMessiness(messinessFactor: number): number {
    // With probability `messinessFactor` use the random gap; otherwise use
    // a canonical column (0). messiness=1 → fully random (default behavior),
    // messiness=0 → deterministic clean gap.
    if (this.rounderRng() < messinessFactor) {
      return this.chooseGapColumn();
    }
    return 0;
  }
}
