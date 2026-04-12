/**
 * Flow-state detection — "Zone mode".
 *
 * Consumes the same GameSignals stream the AtmosphereEngine uses and
 * maintains a rolling window of recent play quality. When a composite
 * score stays high for long enough, the detector reports `active: true`;
 * a hard break (top-out, big garbage, topping stack) exits immediately.
 *
 * Pure — no DOM, no React, no Date.now by default (clock is injected).
 */

import type { GameSignals } from "./types.js";

export interface FlowReadout {
  /** True once the smoothed score has been high for long enough. */
  active: boolean;
  /** 0..1 — smoothed score used to drive visuals/audio. */
  level: number;
  /** ms the raw score has been above entry threshold. */
  sustainedMs: number;
  /** Raw (unsmoothed) composite score this tick. */
  rawScore: number;
  /** Rolling clears-per-minute over the window. */
  clearsPerMinute: number;
}

export const INITIAL_FLOW_READOUT: FlowReadout = {
  active: false,
  level: 0,
  sustainedMs: 0,
  rawScore: 0,
  clearsPerMinute: 0,
};

export interface FlowDetectorOptions {
  /** Rolling window length in ms. */
  windowMs?: number;
  /** Raw score needed to begin accumulating sustain. */
  entryThreshold?: number;
  /** Sustain time required to flip `active` to true. */
  sustainedEntryMs?: number;
  /** Below this the soft-exit timer runs. */
  exitThreshold?: number;
  /** Time below exitThreshold before active→false (soft exit). */
  sustainedExitMs?: number;
  /** Time-constant for smoothed level (ms). */
  smoothingTauMs?: number;
}

interface ClearEntry {
  t: number;
  lines: number;
}

interface HeightEntry {
  t: number;
  height: number;
}

const DEFAULTS: Required<FlowDetectorOptions> = {
  windowMs: 30_000,
  entryThreshold: 0.72,
  sustainedEntryMs: 4_000,
  exitThreshold: 0.45,
  sustainedExitMs: 800,
  smoothingTauMs: 250,
};

export class FlowDetector {
  private readonly opts: Required<FlowDetectorOptions>;
  private clears: ClearEntry[] = [];
  private heights: HeightEntry[] = [];
  private prev: GameSignals | null = null;
  private lastNow: number | null = null;
  private sustainedMs = 0;
  private belowMs = 0;
  private level = 0;
  private active = false;
  private rawScore = 0;
  private clearsPerMinute = 0;

  constructor(opts: FlowDetectorOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  reset(): void {
    this.clears = [];
    this.heights = [];
    this.prev = null;
    this.lastNow = null;
    this.sustainedMs = 0;
    this.belowMs = 0;
    this.level = 0;
    this.active = false;
    this.rawScore = 0;
    this.clearsPerMinute = 0;
  }

  getReadout(): FlowReadout {
    return {
      active: this.active,
      level: this.level,
      sustainedMs: this.sustainedMs,
      rawScore: this.rawScore,
      clearsPerMinute: this.clearsPerMinute,
    };
  }

  update(signals: GameSignals, now: number): FlowReadout {
    const prev = this.prev;
    const lastNow = this.lastNow ?? now;
    const dt = Math.max(0, now - lastNow);
    this.lastNow = now;

    // Non-playing states freeze the detector. Active flow is preserved
    // briefly so a quick pause→resume doesn't kick the player out.
    if (signals.status !== "playing") {
      this.prev = signals;
      return this.getReadout();
    }

    // Track new line clears in the rolling window.
    if (prev && prev.status === "playing") {
      const linesDelta = signals.linesCleared - prev.linesCleared;
      if (linesDelta > 0) {
        this.clears.push({ t: now, lines: linesDelta });
      }

      // Hard-break detectors.
      const garbPrev = prev.multiplayer?.garbageReceivedTotal ?? 0;
      const garbCurr = signals.multiplayer?.garbageReceivedTotal ?? 0;
      const bigGarbage = garbCurr - garbPrev >= 2;
      const toppingOut = signals.stackHeight >= 17;
      // Combo drop from positive → inactive without clearing any line
      // this tick = missed an opportunity to extend combo (misdrop proxy).
      const comboDropped =
        prev.combo > 0 && signals.combo < 0 && linesDelta === 0;

      if (bigGarbage || toppingOut || comboDropped) {
        this.hardBreak();
        this.prev = signals;
        return this.getReadout();
      }
    }

    // Stack-height sample.
    this.heights.push({ t: now, height: signals.stackHeight });

    // Prune window.
    const cutoff = now - this.opts.windowMs;
    while (this.clears.length && this.clears[0]!.t < cutoff) this.clears.shift();
    while (this.heights.length && this.heights[0]!.t < cutoff)
      this.heights.shift();

    // Compute rolling metrics.
    const totalLines = this.clears.reduce((s, c) => s + c.lines, 0);
    const minutes = this.opts.windowMs / 60_000;
    this.clearsPerMinute = totalLines / minutes;

    const avgHeight =
      this.heights.length === 0
        ? signals.stackHeight
        : this.heights.reduce((s, h) => s + h.height, 0) / this.heights.length;

    // --- Composite raw score ---------------------------------------------
    // Target: ~24 clears/min (≈ one clear every 2.5s) lands at 1.0.
    const cpmScore = clamp01(this.clearsPerMinute / 24);
    // Low stack bonus: ≤8 rows is fully rewarded; 16+ pays nothing.
    const heightScore = clamp01(1 - Math.max(0, avgHeight - 8) / 8);
    // Combo/b2b presence.
    const comboScore = signals.combo > 0 ? clamp01(signals.combo / 4) : 0;
    const b2bScore = signals.b2b > 0 ? clamp01(signals.b2b / 4) : 0;

    const raw =
      cpmScore * 0.5 +
      heightScore * 0.25 +
      comboScore * 0.15 +
      b2bScore * 0.1;
    this.rawScore = clamp01(raw);

    // --- Sustain timing (hysteresis) --------------------------------------
    if (this.rawScore >= this.opts.entryThreshold) {
      this.sustainedMs += dt;
      this.belowMs = 0;
      if (this.sustainedMs >= this.opts.sustainedEntryMs) {
        this.active = true;
      }
    } else if (this.rawScore < this.opts.exitThreshold) {
      this.belowMs += dt;
      // Only decay the sustain counter once we're below exit threshold;
      // a small dip between entry/exit keeps the runway.
      this.sustainedMs = Math.max(0, this.sustainedMs - dt);
      if (this.active && this.belowMs >= this.opts.sustainedExitMs) {
        this.active = false;
      }
    } else {
      // In the hysteresis band: hold.
      this.belowMs = 0;
    }

    // Smoothed level — exponential lerp toward raw score (or 0 if !active).
    const target = this.active ? 1 : this.rawScore * 0.6;
    const alpha = dt <= 0 ? 0 : 1 - Math.exp(-dt / this.opts.smoothingTauMs);
    this.level = clamp01(this.level + (target - this.level) * alpha);

    this.prev = signals;
    return this.getReadout();
  }

  private hardBreak(): void {
    this.active = false;
    this.sustainedMs = 0;
    this.belowMs = 0;
    this.level = 0;
    this.rawScore = 0;
    this.clears = [];
    this.heights = [];
    this.clearsPerMinute = 0;
  }
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
