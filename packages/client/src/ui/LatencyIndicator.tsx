import type { CSSProperties } from "react";
import { latencyColor } from "../net/latency.js";

export interface LatencyIndicatorProps {
  latencyMs: number | null;
}

const containerStyle: CSSProperties = {
  position: "fixed",
  top: "0.5rem",
  right: "0.5rem",
  padding: "0.25rem 0.5rem",
  fontSize: "0.8rem",
  fontFamily: "monospace",
  backgroundColor: "rgba(26, 26, 46, 0.85)",
  borderRadius: "4px",
  zIndex: 10,
};

export function LatencyIndicator({ latencyMs }: LatencyIndicatorProps) {
  const color = latencyColor(latencyMs);
  const text = latencyMs === null ? "— ms" : `${Math.round(latencyMs)} ms`;
  return (
    <div style={{ ...containerStyle, color }} data-testid="latency-indicator">
      {text}
    </div>
  );
}
