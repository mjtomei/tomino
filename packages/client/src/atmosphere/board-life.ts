/**
 * Pure math for "board life" idle animations.
 *
 * Everything here is deterministic in (nowMs, intensity, seed) so it can be
 * tested without a canvas and produces stable output for snapshot renders.
 */

// ---------------------------------------------------------------------------
// Color space helpers
// ---------------------------------------------------------------------------

export interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

/** Convert `#rrggbb` to HSL. Accepts uppercase or lowercase. */
export function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      default:
        h = ((r - g) / d + 4) * 60;
    }
  }
  return { h, s, l };
}

/** Convert HSL back to `#rrggbb`. */
export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  if (ss === 0) {
    const v = Math.round(ll * 255);
    const hex = v.toString(16).padStart(2, "0");
    return `#${hex}${hex}${hex}`;
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hk = hh / 360;
  const hue2rgb = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const r = Math.round(hue2rgb(hk + 1 / 3) * 255);
  const g = Math.round(hue2rgb(hk) * 255);
  const b = Math.round(hue2rgb(hk - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Peak lightness excursion as a fraction of range (0..1). 2% target. */
export const SHIMMER_LIGHTNESS_AMPLITUDE = 0.02;
/** Peak hue excursion in degrees, ±. */
export const SHIMMER_HUE_AMPLITUDE = 12;
/** Shimmer cycle period (ms). */
export const SHIMMER_PERIOD_MS = 5200;
/** How strongly the theme accent pulls the hue center (0..1). */
export const ACCENT_PULL = 0.1;

/** Grid pulse period (ms). */
export const GRID_PULSE_PERIOD_MS = 4800;
/** Max grid line alpha. */
export const GRID_PULSE_MAX_ALPHA = 0.12;
/** Base (quiet) grid line alpha. */
export const GRID_PULSE_BASE_ALPHA = 0.06;

/** Highlight breathe period (ms). */
export const BREATHE_PERIOD_MS = 4000;
/** Highlight multiplier amplitude (±). */
export const BREATHE_AMPLITUDE = 0.1;

/** Glint cadence (ms). */
export const GLINT_INTERVAL_MS = 7000;
/** How long a single glint lasts (ms). */
export const GLINT_DURATION_MS = 900;
/** Board-diagonals per glint sweep. */
export const GLINT_FALLOFF_CELLS = 1.6;

// ---------------------------------------------------------------------------
// Shimmer
// ---------------------------------------------------------------------------

/**
 * Compute a subtle shimmer-adjusted color for a placed cell.
 *
 * - At `nowMs === 0` and `intensity === 0` returns the exact base color.
 * - Lightness amplitude is capped by {@link SHIMMER_LIGHTNESS_AMPLITUDE}.
 * - Hue excursion is capped by {@link SHIMMER_HUE_AMPLITUDE} and pulled
 *   slightly toward `accentHex` when provided.
 */
export function computeShimmer(
  baseHex: string,
  nowMs: number,
  intensity: number,
  cellSeed: number,
  accentHex?: string,
): string {
  if (nowMs === 0 && intensity === 0) return baseHex;
  const base = hexToHsl(baseHex);
  const amp = Math.max(0, Math.min(1, intensity));
  // Per-cell phase offset from seed (deterministic, in [0, 2π)).
  const phase = (cellSeed * 0.6180339887) % 1;
  const t = (nowMs / SHIMMER_PERIOD_MS + phase) * Math.PI * 2;
  const wave = Math.sin(t);
  const lDelta = wave * SHIMMER_LIGHTNESS_AMPLITUDE * (0.5 + 0.5 * amp);
  let hTarget = base.h;
  if (accentHex) {
    const accent = hexToHsl(accentHex);
    // Shortest-path interpolation toward accent hue.
    let diff = accent.h - base.h;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    hTarget = base.h + diff * ACCENT_PULL;
  }
  const hDelta = Math.cos(t) * SHIMMER_HUE_AMPLITUDE * (0.5 + 0.5 * amp);
  const h = hTarget + hDelta;
  const l = base.l + lDelta;
  return hslToHex(h, base.s, l);
}

// ---------------------------------------------------------------------------
// Grid pulse
// ---------------------------------------------------------------------------

export interface GridPulse {
  alpha: number;
}

/** Slow, intensity-modulated alpha for grid lines. */
export function computeGridPulse(nowMs: number, intensity: number): GridPulse {
  const amp = Math.max(0, Math.min(1, intensity));
  if (nowMs === 0 && amp === 0) return { alpha: GRID_PULSE_BASE_ALPHA };
  const t = (nowMs / GRID_PULSE_PERIOD_MS) * Math.PI * 2;
  const wave = 0.5 + 0.5 * Math.sin(t);
  const span = GRID_PULSE_MAX_ALPHA - GRID_PULSE_BASE_ALPHA;
  const alpha = GRID_PULSE_BASE_ALPHA + span * wave * (0.4 + 0.6 * amp);
  return { alpha };
}

// ---------------------------------------------------------------------------
// Breathing highlights
// ---------------------------------------------------------------------------

/**
 * Multiplier (~0.9..1.1) for the edge-highlight strength in `drawCell`.
 * Returns exactly 1 when `nowMs === 0`.
 */
export function computeBreathe(nowMs: number, intensity: number): number {
  if (nowMs === 0) return 1;
  const amp = Math.max(0, Math.min(1, intensity));
  const t = (nowMs / BREATHE_PERIOD_MS) * Math.PI * 2;
  return 1 + Math.sin(t) * BREATHE_AMPLITUDE * (0.6 + 0.4 * amp);
}

// ---------------------------------------------------------------------------
// Specular glints
// ---------------------------------------------------------------------------

export interface GlintState {
  active: boolean;
  /** Center of the sweep in fractional column space. */
  headCol: number;
  /** Center of the sweep in fractional row space. */
  headRow: number;
  /** 0..1 envelope strength (fades in/out at ends of duration). */
  strength: number;
  /** Falloff width in cells (diagonal distance). */
  falloff: number;
}

const INACTIVE_GLINT: GlintState = {
  active: false,
  headCol: 0,
  headRow: 0,
  strength: 0,
  falloff: GLINT_FALLOFF_CELLS,
};

/**
 * Deterministic per-frame glint state. A new glint is scheduled every
 * {@link GLINT_INTERVAL_MS}; each lasts {@link GLINT_DURATION_MS} and sweeps
 * diagonally across a `width x height` cell grid.
 */
export function computeGlint(
  nowMs: number,
  boardWidth: number,
  boardHeight: number,
): GlintState {
  if (nowMs <= 0 || boardWidth <= 0 || boardHeight <= 0) return INACTIVE_GLINT;
  const epoch = Math.floor(nowMs / GLINT_INTERVAL_MS);
  const startMs = epoch * GLINT_INTERVAL_MS;
  const elapsed = nowMs - startMs;
  if (elapsed > GLINT_DURATION_MS) return INACTIVE_GLINT;
  const progress = elapsed / GLINT_DURATION_MS; // 0..1
  // Sine envelope so strength eases in and out.
  const strength = Math.sin(progress * Math.PI);
  // Alternate sweep direction per epoch.
  const direction = epoch % 2 === 0 ? 1 : -1;
  // Sweep along the diagonal: head travels from (−falloff,−falloff) to
  // (width+falloff, height+falloff), mapped via progress.
  const totalCols = boardWidth + GLINT_FALLOFF_CELLS * 2;
  const totalRows = boardHeight + GLINT_FALLOFF_CELLS * 2;
  const headCol =
    direction === 1
      ? -GLINT_FALLOFF_CELLS + progress * totalCols
      : boardWidth + GLINT_FALLOFF_CELLS - progress * totalCols;
  const headRow = -GLINT_FALLOFF_CELLS + progress * totalRows;
  return {
    active: true,
    headCol,
    headRow,
    strength,
    falloff: GLINT_FALLOFF_CELLS,
  };
}

/**
 * Contribution of a glint to a specific cell (0..1). Uses diagonal distance
 * from the sweep head with a linear falloff inside {@link GlintState.falloff}.
 */
export function glintContribution(
  glint: GlintState,
  col: number,
  row: number,
): number {
  if (!glint.active) return 0;
  // Project onto the perpendicular to the sweep direction: diagonal lines
  // (col + row = const) form the wavefront.
  const d = Math.abs(col + row - (glint.headCol + glint.headRow)) / Math.SQRT2;
  if (d >= glint.falloff) return 0;
  return (1 - d / glint.falloff) * glint.strength;
}
