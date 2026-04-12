import { useEffect, useRef } from "react";
import { useAtmosphere } from "./use-atmosphere.js";
import { useTheme } from "./theme-context.js";
import {
  computeBackgroundParams,
  renderBackground,
} from "./background-renderers.js";
import type { AtmosphereState } from "./types.js";
import type { Theme } from "./themes.js";

export interface BackgroundCanvasProps {
  className?: string;
}

/**
 * Full-viewport canvas that renders the atmosphere- and theme-driven
 * background. Mount once per screen beneath the interactive UI.
 */
export function BackgroundCanvas({ className }: BackgroundCanvasProps) {
  const atmosphere = useAtmosphere();
  const { theme } = useTheme();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atmosphereRef = useRef<AtmosphereState>(atmosphere);
  const themeRef = useRef<Theme>(theme);

  atmosphereRef.current = atmosphere;
  themeRef.current = theme;

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
      const params = computeBackgroundParams(
        atmosphereRef.current,
        themeRef.current,
      );
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
