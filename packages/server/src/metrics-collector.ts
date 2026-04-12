/**
 * Per-player performance metrics collector.
 *
 * Lightweight observer that accumulates action count, piece locks, line
 * clears, T-spins, and combo peaks over a single game, then produces a
 * PerformanceMetrics snapshot when the game ends. All timestamps are
 * injected by the caller so the collector stays deterministic and testable
 * in isolation from the engine.
 */

import type { PerformanceMetrics } from "@tetris/shared";
import type { TSpinType } from "@tetris/shared";

export interface PieceLockEvent {
  /** Lines cleared by this lock (0..4). */
  linesCleared: number;
  /** T-spin classification of this lock. */
  tSpin: TSpinType;
  /** Combo counter after this lock (matches ScoringState.combo: -1 = no active combo). */
  combo: number;
}

export class MetricsCollector {
  private startedAtMs: number | null = null;
  private endedAtMs: number | null = null;
  private actionCount = 0;
  private pieceCount = 0;
  private linesCleared = 0;
  private tSpinCount = 0;
  private maxCombo = 0;

  /** Begin a new game timing window. Wipes previous counters. */
  start(nowMs: number): void {
    this.reset();
    this.startedAtMs = nowMs;
  }

  /** Record an accepted player input action (one call = one action for APM). */
  recordAction(): void {
    if (this.startedAtMs === null || this.endedAtMs !== null) return;
    this.actionCount++;
  }

  /** Record a piece lock event. Updates piece count, lines, T-spins, max combo. */
  recordPieceLock(event: PieceLockEvent): void {
    if (this.startedAtMs === null || this.endedAtMs !== null) return;
    this.pieceCount++;
    this.linesCleared += event.linesCleared;
    if (event.tSpin !== "none") {
      this.tSpinCount++;
    }
    if (event.combo > this.maxCombo) {
      this.maxCombo = event.combo;
    }
  }

  /** Freeze the duration used for APM/PPS. Idempotent — only the first call takes effect. */
  end(nowMs: number): void {
    if (this.startedAtMs === null || this.endedAtMs !== null) return;
    this.endedAtMs = nowMs;
  }

  /**
   * Produce the metrics snapshot. Until end() has been called the duration
   * is 0, which forces APM/PPS to 0 — callers should treat a pre-end
   * snapshot as not-yet-meaningful.
   */
  snapshot(): PerformanceMetrics {
    const durationMs =
      this.startedAtMs !== null && this.endedAtMs !== null
        ? this.endedAtMs - this.startedAtMs
        : 0;

    const apm = durationMs > 0 ? this.actionCount / (durationMs / 60_000) : 0;
    const pps = durationMs > 0 ? this.pieceCount / (durationMs / 1_000) : 0;

    return {
      apm,
      pps,
      linesCleared: this.linesCleared,
      tSpins: this.tSpinCount,
      maxCombo: this.maxCombo,
    };
  }

  /** Clear all accumulated state. Caller must start() again before recording events. */
  reset(): void {
    this.startedAtMs = null;
    this.endedAtMs = null;
    this.actionCount = 0;
    this.pieceCount = 0;
    this.linesCleared = 0;
    this.tSpinCount = 0;
    this.maxCombo = 0;
  }
}
