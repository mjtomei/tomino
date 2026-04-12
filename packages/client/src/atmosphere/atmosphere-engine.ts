/**
 * AtmosphereEngine — pure reactive state machine (no React, no DOM).
 *
 * Given a stream of GameSignals, produces AtmosphereState with continuous
 * values (intensity, danger, momentum) and edge-detected events
 * (lineClear, tSpin, tetris, levelUp, garbageReceived).
 */

import type {
  AtmosphereEvent,
  AtmosphereState,
  FlowState,
  GameSignals,
} from "./types.js";
import {
  BOARD_VISIBLE_HEIGHT,
  INITIAL_ATMOSPHERE_STATE,
  INITIAL_FLOW_STATE,
} from "./types.js";
import { FlowDetector } from "./flow-detection.js";

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Guideline gravity saturates around level 20. */
const SPEED_LEVEL_CAP = 20;

/**
 * Intensity: 60% level-driven, 40% stack-driven. A calm empty board at
 * level 1 sits near 0; a mid-level mid-stack game is near 0.5; max level
 * with near-top stack tops out at 1.
 */
function computeIntensity(level: number, stackHeight: number): number {
  const levelNorm = clamp01(Math.max(0, level - 1) / (SPEED_LEVEL_CAP - 1));
  const stackNorm = clamp01(stackHeight / BOARD_VISIBLE_HEIGHT);
  return clamp01(levelNorm * 0.6 + stackNorm * 0.4);
}

/**
 * Aggregate match-wide pressure: number of live opponents, volume of
 * garbage flying in both directions, and eliminations so far. 0..1.
 * Exported for reuse by multiplayer-effects and tests.
 */
export function computeMatchIntensity(mp: {
  opponentCount: number;
  eliminations: number;
  garbageSent: number;
  garbageReceivedTotal: number;
}): number {
  const opponents = clamp01(mp.opponentCount / 8) * 0.3;
  const garbage = clamp01((mp.garbageSent + mp.garbageReceivedTotal) / 40) * 0.4;
  const elim =
    clamp01(mp.eliminations / Math.max(1, mp.opponentCount + mp.eliminations)) *
    0.3;
  return clamp01(opponents + garbage + elim);
}

/**
 * Danger: quadratic ramp on stack height so it stays low until the stack is
 * past mid-board, plus a small contribution from pending garbage (each line
 * of pending garbage effectively raises the stack).
 */
function computeDanger(stackHeight: number, pendingGarbage: number): number {
  const effective = stackHeight + pendingGarbage * 0.7;
  const raw = clamp01(effective / BOARD_VISIBLE_HEIGHT);
  return clamp01(raw * raw * 1.1);
}

/**
 * Momentum: combo contributes 0.12 per step, b2b contributes 0.15 per step.
 * Both -1 (inactive) clamp to 0. Saturates at 1.
 */
function computeMomentum(combo: number, b2b: number): number {
  const c = Math.max(0, combo);
  const b = Math.max(0, b2b);
  return clamp01(c * 0.12 + b * 0.15);
}

export interface AtmosphereEngineOptions {
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export class AtmosphereEngine {
  private prev: GameSignals | null = null;
  private state: AtmosphereState = INITIAL_ATMOSPHERE_STATE;
  private readonly flow = new FlowDetector();
  private readonly now: () => number;

  constructor(opts: AtmosphereEngineOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  getState(): AtmosphereState {
    return this.state;
  }

  /** Reset prev-state tracking — call when the game restarts. */
  reset(): void {
    this.prev = null;
    this.state = INITIAL_ATMOSPHERE_STATE;
    this.flow.reset();
  }

  /**
   * Push a new signal snapshot. Returns the fresh AtmosphereState.
   * Events are only emitted on the tick they occur.
   */
  update(signals: GameSignals): AtmosphereState {
    const events: AtmosphereEvent[] = [];

    // Continuous outputs — paused/idle/gameOver hold the last computed values
    // for intensity/danger/momentum so downstream visuals don't flicker.
    let intensity: number;
    let danger: number;
    let momentum: number;
    if (signals.status === "playing") {
      intensity = computeIntensity(signals.level, signals.stackHeight);
      if (signals.multiplayer) {
        const match = computeMatchIntensity(signals.multiplayer);
        intensity = clamp01(intensity * 0.75 + match * 0.25);
      }
      danger = computeDanger(signals.stackHeight, signals.pendingGarbage);
      momentum = computeMomentum(signals.combo, signals.b2b);
    } else {
      intensity = this.state.intensity;
      danger = this.state.danger;
      momentum = this.state.momentum;
    }

    // Edge-detected events. Only fire when we have a previous snapshot AND
    // the player is currently playing — avoids spurious events on reset.
    const prev = this.prev;
    if (prev && signals.status === "playing" && prev.status === "playing") {
      // Line clear: linesCleared delta > 0.
      const linesDelta = signals.linesCleared - prev.linesCleared;
      if (linesDelta > 0) {
        events.push({ type: "lineClear", magnitude: linesDelta });
        const last = signals.lastLineClear;
        if (last && last.tSpin !== "none") {
          events.push({ type: "tSpin", magnitude: last.linesCleared });
        }
        if (linesDelta >= 4) {
          events.push({ type: "tetris", magnitude: linesDelta });
        }
      }

      // Level up.
      if (signals.level > prev.level) {
        events.push({ type: "levelUp", magnitude: signals.level });
      }

      // Multiplayer garbage received.
      const prevGarb = prev.multiplayer?.garbageReceivedTotal ?? 0;
      const currGarb = signals.multiplayer?.garbageReceivedTotal ?? 0;
      if (currGarb > prevGarb) {
        events.push({
          type: "garbageReceived",
          magnitude: currGarb - prevGarb,
        });
      }

      // Multiplayer garbage sent.
      const prevSent = prev.multiplayer?.garbageSent ?? 0;
      const currSent = signals.multiplayer?.garbageSent ?? 0;
      if (currSent > prevSent) {
        events.push({ type: "garbageSent", magnitude: currSent - prevSent });
      }

      // Opponent eliminated.
      const prevElim = prev.multiplayer?.eliminations ?? 0;
      const currElim = signals.multiplayer?.eliminations ?? 0;
      if (currElim > prevElim) {
        events.push({
          type: "opponentEliminated",
          magnitude: currElim - prevElim,
        });
      }
    }

    const flowReadout = this.flow.update(signals, this.now());
    const flow: FlowState = {
      active: flowReadout.active,
      level: flowReadout.level,
      sustainedMs: flowReadout.sustainedMs,
    };

    this.prev = signals;
    this.state = { intensity, danger, momentum, flow, events };
    return this.state;
  }
}

// Re-export so consumers can import from the same module.
export { INITIAL_FLOW_STATE };
