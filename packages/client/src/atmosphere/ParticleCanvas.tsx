import { useEffect, useRef } from "react";
import type { ParticleSystem } from "./particle-system";

interface ParticleCanvasProps {
  system: ParticleSystem;
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ParticleCanvas({
  system,
  width,
  height,
  className,
  style,
}: ParticleCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tick = (now: number): void => {
      const last = lastTimeRef.current;
      const dt = last == null ? 0 : (now - last) / 1000;
      lastTimeRef.current = now;
      system.update(dt);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      system.render(ctx);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
    };
  }, [system]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
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
