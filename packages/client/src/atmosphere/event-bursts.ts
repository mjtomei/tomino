/**
 * Event bursts — abstract full-board visual responses to atmosphere events.
 *
 * Pure geometry + color selection. No React, no DOM. `EventBurstCanvas`
 * renders these; unit tests exercise the math directly.
 */

import type { AtmosphereEvent, GameSignals } from "./types.js";
import type { ThemePalette } from "./themes.js";

export type BurstKind = "ripple" | "starburst" | "sweep" | "chromatic";

export interface Burst {
  id: number;
  kind: BurstKind;
  startedAt: number;
  durationMs: number;
  /** Interpretation depends on kind: combo count, lines cleared, etc. */
  magnitude: number;
  color: string;
  secondaryColor: string;
}

export const BURST_DURATIONS: Record<BurstKind, number> = {
  ripple: 700,
  starburst: 600,
  sweep: 800,
  chromatic: 500,
};

let burstIdCounter = 0;
function nextId(): number {
  burstIdCounter += 1;
  return burstIdCounter;
}

function pickColor(palette: ThemePalette, index: number): string {
  const pool = palette.particleColors;
  if (pool.length === 0) return palette.accent;
  return pool[index % pool.length] as string;
}

/**
 * Convert one atmosphere event into zero or more bursts.
 *
 * `signals` is the *current* tick's signals (post-update), used to read
 * combo/b2b context that isn't on the event payload itself.
 */
export function createBursts(
  event: AtmosphereEvent,
  signals: GameSignals,
  now: number,
  palette: ThemePalette,
): Burst[] {
  const out: Burst[] = [];
  switch (event.type) {
    case "lineClear": {
      // Combo ripple — magnitude encodes combo depth (0 = solo clear).
      const comboDepth = Math.max(0, signals.combo);
      out.push({
        id: nextId(),
        kind: "ripple",
        startedAt: now,
        durationMs: BURST_DURATIONS.ripple,
        magnitude: comboDepth + event.magnitude, // lines added for intensity
        color: pickColor(palette, comboDepth),
        secondaryColor: pickColor(palette, comboDepth + 1),
      });
      // Back-to-back sweep — fires on every line clear while b2b is active.
      if (signals.b2b >= 1) {
        out.push({
          id: nextId(),
          kind: "sweep",
          startedAt: now,
          durationMs: BURST_DURATIONS.sweep,
          magnitude: signals.b2b,
          color: pickColor(palette, signals.b2b),
          secondaryColor: palette.accent,
        });
      }
      break;
    }
    case "tSpin": {
      out.push({
        id: nextId(),
        kind: "starburst",
        startedAt: now,
        durationMs: BURST_DURATIONS.starburst,
        magnitude: event.magnitude,
        color: palette.accent,
        secondaryColor: pickColor(palette, 0),
      });
      break;
    }
    case "tetris": {
      // Tetris: extra-bright ripple on top of the standard line-clear ripple.
      out.push({
        id: nextId(),
        kind: "ripple",
        startedAt: now,
        durationMs: BURST_DURATIONS.ripple + 200,
        magnitude: event.magnitude + 4,
        color: pickColor(palette, 2),
        secondaryColor: palette.accent,
      });
      break;
    }
    case "levelUp": {
      out.push({
        id: nextId(),
        kind: "chromatic",
        startedAt: now,
        durationMs: BURST_DURATIONS.chromatic,
        magnitude: event.magnitude,
        color: palette.accent,
        secondaryColor: pickColor(palette, event.magnitude),
      });
      break;
    }
    case "garbageReceived":
    case "garbageSent":
    case "opponentEliminated":
      // No dedicated full-screen burst — handled by multiplayer-effects.
      break;
  }
  return out;
}

/** Convert a full tick's event list into bursts. */
export function detectBursts(
  events: readonly AtmosphereEvent[],
  signals: GameSignals,
  now: number,
  palette: ThemePalette,
): Burst[] {
  const out: Burst[] = [];
  for (const ev of events) {
    out.push(...createBursts(ev, signals, now, palette));
  }
  return out;
}

/** 0..1 progress through the burst's lifetime. */
export function burstProgress(burst: Burst, now: number): number {
  const t = (now - burst.startedAt) / burst.durationMs;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

export function isBurstDone(burst: Burst, now: number): boolean {
  return now - burst.startedAt >= burst.durationMs;
}

/**
 * Ripple radius in pixels. Grows from 0 to `maxRadius`, with a slight
 * ease-out so the wave decelerates near the edge. Magnitude makes larger
 * ripples reach further.
 */
export function rippleRadius(
  burst: Burst,
  now: number,
  maxRadius: number,
): number {
  const p = burstProgress(burst, now);
  const eased = 1 - Math.pow(1 - p, 2);
  const scale = Math.min(1, 0.5 + burst.magnitude * 0.1);
  return eased * maxRadius * scale;
}

/** Ripple alpha — fades as it expands. */
export function rippleAlpha(burst: Burst, now: number): number {
  const p = burstProgress(burst, now);
  return Math.max(0, 1 - p);
}

export interface StarburstRays {
  count: number;
  angles: number[];
}

/** Ray count escalates with magnitude; minimum 6, maximum 24. */
export function starburstRays(burst: Burst): StarburstRays {
  const count = Math.max(6, Math.min(24, 6 + burst.magnitude * 4));
  const angles: number[] = [];
  for (let i = 0; i < count; i++) {
    angles.push((i / count) * Math.PI * 2);
  }
  return { count, angles };
}

/** Length of each ray as it shoots outward. */
export function starburstRayLength(
  burst: Burst,
  now: number,
  maxLength: number,
): number {
  const p = burstProgress(burst, now);
  const eased = 1 - Math.pow(1 - p, 3);
  return eased * maxLength;
}

/** X-position of the sweep's leading edge (in pixels from left). */
export function sweepOffsetX(burst: Burst, now: number, width: number): number {
  const p = burstProgress(burst, now);
  return p * width;
}

/** Sweep band thickness as a function of canvas width. */
export function sweepThickness(_burst: Burst, width: number): number {
  return Math.max(40, width * 0.25);
}

/** Chromatic overlay alpha — fast rise, slow fade. */
export function chromaticAlpha(burst: Burst, now: number): number {
  const p = burstProgress(burst, now);
  if (p < 0.2) return (p / 0.2) * 0.35;
  return Math.max(0, 0.35 * (1 - (p - 0.2) / 0.8));
}
