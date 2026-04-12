import { useEffect, useRef } from "react";
import { useAtmosphere } from "./use-atmosphere.js";
import { useTheme } from "./theme-context.js";
import {
  computeBackgroundParams,
  renderBackground,
  type BackgroundParams,
} from "./background-renderers.js";
import type { AtmosphereState } from "./types.js";
import type { Theme } from "./themes.js";

export interface BackgroundCanvasProps {
  className?: string;
  /**
   * Optional atmosphere state that overrides the game-driven state
   * (used by menu/lobby/results screens). Changes are crossfaded over
   * CROSSFADE_MS for smooth screen transitions.
   */
  override?: AtmosphereState | null;
}

const CROSSFADE_MS = 600;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColors(a: string[], b: string[], t: number): string[] {
  const n = Math.max(a.length, b.length);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const ca = a[i % Math.max(1, a.length)] ?? "#000000";
    const cb = b[i % Math.max(1, b.length)] ?? "#000000";
    out.push(mix(ca, cb, t));
  }
  return out;
}

function mix(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a;
  const r = Math.round(lerp(pa[0], pb[0], t));
  const g = Math.round(lerp(pa[1], pb[1], t));
  const bl = Math.round(lerp(pa[2], pb[2], t));
  return `#${hex(r)}${hex(g)}${hex(bl)}`;
}

function parse(h: string): [number, number, number] | null {
  if (!h.startsWith("#")) return null;
  const s = h.slice(1);
  if (s.length === 6) {
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ];
  }
  return null;
}

function hex(n: number): string {
  const v = Math.max(0, Math.min(255, n));
  return v.toString(16).padStart(2, "0");
}

function lerpParams(
  a: BackgroundParams,
  b: BackgroundParams,
  t: number,
): BackgroundParams {
  return {
    density: lerp(a.density, b.density, t),
    speed: lerp(a.speed, b.speed, t),
    warmth: lerp(a.warmth, b.warmth, t),
    agitation: lerp(a.agitation, b.agitation, t),
    gradient: lerpColors(a.gradient, b.gradient, t),
    elementColors: lerpColors(a.elementColors, b.elementColors, t),
  };
}

/**
 * Full-viewport canvas that renders the atmosphere- and theme-driven
 * background. Mount once per screen beneath the interactive UI.
 */
export function BackgroundCanvas({ className, override }: BackgroundCanvasProps) {
  const atmosphere = useAtmosphere();
  const { theme } = useTheme();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atmosphereRef = useRef<AtmosphereState>(override ?? atmosphere);
  const overrideRef = useRef<AtmosphereState | null | undefined>(override);
  const themeRef = useRef<Theme>(theme);

  // Crossfade bookkeeping: we only start a fade on screen transitions
  // (override identity change) or theme change. While in live game
  // mode (no override) the RAF loop reads atmosphereRef.current each
  // frame so gameplay visuals remain live, not lagged.
  const fromParamsRef = useRef<BackgroundParams | null>(null);
  const fadeStartRef = useRef<number>(0);
  const lastRenderedRef = useRef<BackgroundParams | null>(null);

  atmosphereRef.current = override ?? atmosphere;
  overrideRef.current = override;
  themeRef.current = theme;

  useEffect(() => {
    // Snapshot whatever we last rendered and start a fade toward the
    // new source. The RAF loop computes the target each frame from
    // the current ref values.
    fromParamsRef.current = lastRenderedRef.current;
    fadeStartRef.current =
      typeof performance !== "undefined" ? performance.now() : 0;
  }, [override, theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let disposed = false;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    fit();

    const loop = (tMs: number) => {
      if (disposed) return;
      const size = {
        width: canvas.width / (window.devicePixelRatio || 1),
        height: canvas.height / (window.devicePixelRatio || 1),
      };
      const target = computeBackgroundParams(
        atmosphereRef.current,
        themeRef.current,
      );
      const from = fromParamsRef.current;
      let params: BackgroundParams;
      if (from) {
        const elapsed = tMs - fadeStartRef.current;
        const t = Math.max(0, Math.min(1, elapsed / CROSSFADE_MS));
        params = lerpParams(from, target, t);
        if (t >= 1) fromParamsRef.current = null;
      } else {
        params = target;
      }
      lastRenderedRef.current = params;
      if (ctx.clearRect) ctx.clearRect(0, 0, size.width, size.height);
      renderBackground(ctx, params, themeRef.current, size, tMs);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    window.addEventListener("resize", fit);

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      data-testid="background-canvas"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
