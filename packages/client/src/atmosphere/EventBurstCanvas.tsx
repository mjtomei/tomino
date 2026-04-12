import { useEffect, useRef } from "react";
import { useAtmosphere, useLatestSignalsRef } from "./use-atmosphere.js";
import { useTheme } from "./theme-context.js";
import {
  type Burst,
  burstProgress,
  chromaticAlpha,
  detectBursts,
  isBurstDone,
  rippleAlpha,
  rippleRadius,
  starburstRayLength,
  starburstRays,
  sweepOffsetX,
  sweepThickness,
} from "./event-bursts.js";
import type { GameSignals } from "./types.js";

interface EventBurstCanvasProps {
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
}

const FALLBACK_SIGNALS: GameSignals = {
  status: "playing",
  level: 1,
  stackHeight: 0,
  combo: 0,
  b2b: 0,
  linesCleared: 0,
  pendingGarbage: 0,
};

export function EventBurstCanvas({
  width,
  height,
  className,
  style,
}: EventBurstCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const burstsRef = useRef<Burst[]>([]);
  const rafRef = useRef<number | null>(null);
  const { theme } = useTheme();
  const paletteRef = useRef(theme.palette);
  paletteRef.current = theme.palette;

  const atmosphere = useAtmosphere();
  const signalsRef = useLatestSignalsRef();

  useEffect(() => {
    if (atmosphere.events.length === 0) return;
    const now = performance.now();
    const signals = signalsRef.current ?? FALLBACK_SIGNALS;
    const fresh = detectBursts(
      atmosphere.events,
      signals,
      now,
      paletteRef.current,
    );
    burstsRef.current.push(...fresh);
  }, [atmosphere.events, signalsRef]);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxRadius = Math.hypot(cx, cy);

      const active: Burst[] = [];
      for (const b of burstsRef.current) {
        if (isBurstDone(b, now)) continue;
        active.push(b);
        switch (b.kind) {
          case "ripple": {
            const r = rippleRadius(b, now, maxRadius);
            const a = rippleAlpha(b, now);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = b.secondaryColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            break;
          }
          case "starburst": {
            const { angles } = starburstRays(b);
            const len = starburstRayLength(b, now, maxRadius);
            const a = 1 - burstProgress(b, now);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 2;
            for (const theta of angles) {
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + Math.cos(theta) * len, cy + Math.sin(theta) * len);
              ctx.stroke();
            }
            ctx.restore();
            break;
          }
          case "sweep": {
            const x = sweepOffsetX(b, now, canvas.width);
            const thickness = sweepThickness(b, canvas.width);
            const grad = ctx.createLinearGradient(x - thickness, 0, x, 0);
            grad.addColorStop(0, "rgba(0,0,0,0)");
            grad.addColorStop(1, b.color);
            ctx.save();
            ctx.globalAlpha = 0.6 * (1 - burstProgress(b, now));
            ctx.fillStyle = grad;
            ctx.fillRect(x - thickness, 0, thickness, canvas.height);
            ctx.restore();
            break;
          }
          case "chromatic": {
            const a = chromaticAlpha(b, now);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = b.color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
            break;
          }
        }
      }
      burstsRef.current = active;
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      data-testid="event-burst-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}
