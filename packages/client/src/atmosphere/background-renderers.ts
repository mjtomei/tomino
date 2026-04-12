/**
 * Pure background-geometry computation + canvas rendering.
 *
 * Given an AtmosphereState and a Theme, derives per-frame parameters
 * (density, speed, warmth, agitation, colors) and draws a gradient
 * field plus a geometric pattern onto a 2D canvas context.
 *
 * Kept dependency-free so it can be unit-tested without a DOM.
 */

import type { AtmosphereState } from "./types.js";
import type { Theme, GeometryPattern } from "./themes.js";

export interface BackgroundParams {
  /** 0..1 — element density multiplier after atmosphere boost. */
  density: number;
  /** 0..1 — movement/animation speed. */
  speed: number;
  /** 0..1 — warmth (0 cool, 1 warm). */
  warmth: number;
  /** 0..1 — jitter magnitude for agitated movement. */
  agitation: number;
  /** Gradient stops after danger shift. */
  gradient: string[];
  /** Accent palette for geometric elements after danger shift. */
  elementColors: string[];
}

const DANGER_RED = "#ff2a1a";
const DANGER_DARK = "#160000";

/** Clamp 0..1. */
function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim();
  if (!h.startsWith("#")) return null;
  const s = h.slice(1);
  if (s.length === 3) {
    const r = parseInt(s[0]! + s[0]!, 16);
    const g = parseInt(s[1]! + s[1]!, 16);
    const b = parseInt(s[2]! + s[2]!, 16);
    return [r, g, b];
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => {
    const x = Math.max(0, Math.min(255, Math.round(n)));
    return x.toString(16).padStart(2, "0");
  };
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linearly blend two hex colors. t=0 → a, t=1 → b. Non-hex falls back to `a`. */
export function mixColor(a: string, b: string, t: number): string {
  const u = clamp01(t);
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  return toHex(
    pa[0] + (pb[0] - pa[0]) * u,
    pa[1] + (pb[1] - pa[1]) * u,
    pa[2] + (pb[2] - pa[2]) * u,
  );
}

/** Shift a color toward the danger red (or dark for deep danger). */
export function shiftTowardDanger(hex: string, danger: number): string {
  const d = clamp01(danger);
  if (d <= 0) return hex;
  const reddened = mixColor(hex, DANGER_RED, d * 0.55);
  // Above 0.7 danger, also darken slightly.
  if (d > 0.7) return mixColor(reddened, DANGER_DARK, (d - 0.7) * 0.6);
  return reddened;
}

/**
 * Derive per-frame rendering parameters from atmosphere + theme.
 * Pure — same inputs always yield the same outputs.
 */
export function computeBackgroundParams(
  atmosphere: AtmosphereState,
  theme: Theme,
): BackgroundParams {
  const intensity = clamp01(atmosphere.intensity);
  const danger = clamp01(atmosphere.danger);
  const momentum = clamp01(atmosphere.momentum);

  const baseDensity = theme.geometry.density;
  const baseMovement = theme.geometry.movement;

  // Density grows with intensity; movement with intensity + momentum.
  const density = clamp01(baseDensity * (0.4 + intensity * 0.8) + intensity * 0.15);
  const speed = clamp01(baseMovement * (0.3 + intensity * 0.9) + momentum * 0.3);
  const warmth = clamp01(intensity * 0.6 + danger * 0.5);
  const agitation = clamp01(danger * 0.9 + momentum * 0.2);

  const gradient = theme.palette.backgroundGradient.map((c) =>
    shiftTowardDanger(c, danger),
  );
  const elementColors = theme.palette.particleColors.map((c) =>
    shiftTowardDanger(c, danger),
  );

  return { density, speed, warmth, agitation, gradient, elementColors };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const MAX_ELEMENTS = 200;

interface Size {
  width: number;
  height: number;
}

function drawGradient(
  ctx: CanvasRenderingContext2D,
  gradient: string[],
  size: Size,
): void {
  if (!ctx.createLinearGradient) return;
  const g = ctx.createLinearGradient(0, 0, 0, size.height);
  const stops = gradient.length >= 2 ? gradient : [...gradient, ...gradient];
  for (let i = 0; i < stops.length; i++) {
    g.addColorStop(i / (stops.length - 1), stops[i]!);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size.width, size.height);
}

function pickColor(colors: string[], i: number): string {
  if (colors.length === 0) return "#ffffff";
  return colors[i % colors.length]!;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  p: BackgroundParams,
  size: Size,
  tMs: number,
): void {
  const cells = 8 + Math.round(p.density * 14); // 8..22 columns
  const cellSize = size.width / cells;
  const phase = (tMs * 0.00008 * (0.3 + p.speed)) % 1;
  ctx.strokeStyle = pickColor(p.elementColors, 0);
  ctx.globalAlpha = 0.08 + p.density * 0.18;
  ctx.lineWidth = 1;
  for (let x = 0; x <= cells + 1; x++) {
    const gx = ((x + phase) * cellSize) % (size.width + cellSize) - cellSize;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, size.height);
    ctx.stroke();
  }
  const rows = Math.ceil(size.height / cellSize);
  for (let y = 0; y <= rows + 1; y++) {
    const gy = ((y - phase) * cellSize) % (size.height + cellSize);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(size.width, gy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawWaves(
  ctx: CanvasRenderingContext2D,
  p: BackgroundParams,
  size: Size,
  tMs: number,
): void {
  const lines = Math.min(MAX_ELEMENTS, 4 + Math.round(p.density * 12));
  const amp = 20 + p.agitation * 40;
  const phase = tMs * 0.0006 * (0.3 + p.speed);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < lines; i++) {
    const y = (i / lines) * size.height;
    ctx.strokeStyle = pickColor(p.elementColors, i);
    ctx.globalAlpha = 0.08 + p.density * 0.12;
    ctx.beginPath();
    for (let x = 0; x <= size.width; x += 16) {
      const yy =
        y +
        Math.sin((x * 0.01) + phase + i * 0.4) * amp +
        Math.sin(phase * 1.7 + i) * (p.agitation * 10);
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  p: BackgroundParams,
  size: Size,
  tMs: number,
): void {
  const count = Math.min(MAX_ELEMENTS, 20 + Math.round(p.density * 160));
  const phase = tMs * 0.0004 * (0.3 + p.speed);
  for (let i = 0; i < count; i++) {
    // Deterministic pseudo-positions from index.
    const rx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const ry = (Math.cos(i * 78.233) * 12345.6789) % 1;
    const x = (Math.abs(rx) * size.width + phase * 40 * (i % 3)) % size.width;
    const y = (Math.abs(ry) * size.height) % size.height;
    const r = 0.8 + ((i % 5) / 5) * (1 + p.density * 2);
    ctx.fillStyle = pickColor(p.elementColors, i);
    ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(phase * 2 + i));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHexagons(
  ctx: CanvasRenderingContext2D,
  p: BackgroundParams,
  size: Size,
  tMs: number,
): void {
  const rad = 24 + (1 - p.density) * 20;
  const hStep = rad * 1.5;
  const vStep = rad * Math.sqrt(3);
  const phase = tMs * 0.00015 * (0.3 + p.speed);
  ctx.strokeStyle = pickColor(p.elementColors, 0);
  ctx.globalAlpha = 0.1 + p.density * 0.15;
  ctx.lineWidth = 1;
  let idx = 0;
  for (let cy = -vStep; cy < size.height + vStep && idx < MAX_ELEMENTS; cy += vStep) {
    for (let cx = -hStep; cx < size.width + hStep && idx < MAX_ELEMENTS; cx += hStep) {
      const yOff = (Math.round(cx / hStep) % 2) * (vStep / 2);
      const jitter = Math.sin(phase + idx) * p.agitation * 6;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        const px = cx + Math.cos(a) * rad + jitter;
        const py = cy + yOff + Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      idx++;
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw one background frame into `ctx`. Intended to be called from a
 * requestAnimationFrame loop. All state is passed in — no internal
 * mutable state.
 */
export function renderBackground(
  ctx: CanvasRenderingContext2D,
  params: BackgroundParams,
  theme: Theme,
  size: Size,
  tMs: number,
): void {
  if (size.width <= 0 || size.height <= 0) return;
  drawGradient(ctx, params.gradient, size);
  const pattern: GeometryPattern = theme.geometry.pattern;
  switch (pattern) {
    case "grid":
      drawGrid(ctx, params, size, tMs);
      break;
    case "waves":
      drawWaves(ctx, params, size, tMs);
      break;
    case "stars":
      drawStars(ctx, params, size, tMs);
      break;
    case "hexagons":
      drawHexagons(ctx, params, size, tMs);
      break;
    case "none":
    default:
      break;
  }
}
