/**
 * Pure computation for screen-level post-processing effects.
 *
 * All functions here are deterministic and framework-free so they can be
 * unit-tested without React or DOM.
 */

import type { AtmosphereEventType } from "./types.js";

/** Maximum vignette alpha at danger = 1. */
export const VIGNETTE_MAX_OPACITY = 0.55;

/** Shake displacement in pixels, per event type. */
export const SHAKE_HARD_DROP_PX = 2;
export const SHAKE_GARBAGE_MIN_PX = 2;
export const SHAKE_GARBAGE_MAX_PX = 4;

/** Flash alpha ceiling for a 4-line (quad) clear. */
export const FLASH_MAX_OPACITY = 0.5;

/** Half-lives of exponential decay for transient effects (ms). */
export const SHAKE_HALF_LIFE_MS = 60;
export const FLASH_HALF_LIFE_MS = 80;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Vignette opacity grows with danger. Danger is already quadratic, so a
 * gentle linear scale keeps the final value in [0, VIGNETTE_MAX_OPACITY].
 */
export function computeVignetteOpacity(danger: number): number {
  return clamp01(danger) * VIGNETTE_MAX_OPACITY;
}

/**
 * Blend the theme accent with an alarm red, weighted by danger. At
 * danger = 0 the vignette is nearly pure accent; at danger = 1 it's
 * dominated by red.
 *
 * `accent` must be a 7-char hex string (e.g. "#4fd4ff"). Malformed input
 * falls back to pure red.
 */
export function computeVignetteColor(accent: string, danger: number): string {
  const red = { r: 0xff, g: 0x20, b: 0x30 };
  const a = parseHex(accent);
  if (!a) return `rgb(${red.r}, ${red.g}, ${red.b})`;
  const t = clamp01(danger);
  const r = Math.round(a.r * (1 - t) + red.r * t);
  const g = Math.round(a.g * (1 - t) + red.g * t);
  const b = Math.round(a.b * (1 - t) + red.b * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string" || hex.length !== 7 || hex[0] !== "#") return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

/**
 * Shake magnitude in pixels for a triggering event. Hard drops are a
 * small fixed thump; garbage scales with the number of lines received,
 * clamped to [MIN, MAX].
 */
export function computeShakeMagnitude(
  eventType: AtmosphereEventType | "hardDrop",
  magnitude: number,
): number {
  if (eventType === "hardDrop") return SHAKE_HARD_DROP_PX;
  if (eventType === "garbageReceived") {
    const m = Math.max(0, magnitude);
    const clamped = Math.min(m, 4);
    if (clamped <= 0) return 0;
    const t = (clamped - 1) / 3;
    return SHAKE_GARBAGE_MIN_PX + t * (SHAKE_GARBAGE_MAX_PX - SHAKE_GARBAGE_MIN_PX);
  }
  return 0;
}

/**
 * Flash alpha for a line-clear event. 1 line is a gentle blink, 4 lines
 * (quad) hits the ceiling.
 */
export function computeFlashOpacity(lines: number): number {
  if (lines <= 0) return 0;
  const clamped = Math.min(lines, 4);
  return (clamped / 4) * FLASH_MAX_OPACITY;
}

/**
 * Exponential decay toward 0 for a transient effect value.
 * `current * 0.5 ^ (dt / halfLife)`.
 */
export function decayTransient(
  current: number,
  dtMs: number,
  halfLifeMs: number,
): number {
  if (current <= 0 || halfLifeMs <= 0) return 0;
  const factor = Math.pow(0.5, dtMs / halfLifeMs);
  const next = current * factor;
  return next < 0.001 ? 0 : next;
}
