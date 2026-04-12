import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LatencyIndicator } from "../ui/LatencyIndicator";
import {
  LATENCY_COLOR_GREEN,
  LATENCY_COLOR_YELLOW,
  LATENCY_COLOR_RED,
  LATENCY_COLOR_NEUTRAL,
} from "../net/latency";

function getIndicator(): HTMLElement {
  return screen.getByTestId("latency-indicator");
}

describe("LatencyIndicator", () => {
  it("renders a neutral placeholder when latency is null", () => {
    render(<LatencyIndicator latencyMs={null} />);
    const el = getIndicator();
    expect(el.textContent).toBe("— ms");
    expect(el.style.color).toBe(hexToRgb(LATENCY_COLOR_NEUTRAL));
  });

  it("renders green under 50 ms", () => {
    render(<LatencyIndicator latencyMs={20} />);
    const el = getIndicator();
    expect(el.textContent).toBe("20 ms");
    expect(el.style.color).toBe(hexToRgb(LATENCY_COLOR_GREEN));
  });

  it("renders yellow between 50 and 150 ms inclusive", () => {
    render(<LatencyIndicator latencyMs={150} />);
    const el = getIndicator();
    expect(el.textContent).toBe("150 ms");
    expect(el.style.color).toBe(hexToRgb(LATENCY_COLOR_YELLOW));
  });

  it("renders red above 150 ms", () => {
    render(<LatencyIndicator latencyMs={200} />);
    const el = getIndicator();
    expect(el.textContent).toBe("200 ms");
    expect(el.style.color).toBe(hexToRgb(LATENCY_COLOR_RED));
  });

  it("rounds fractional latency to the nearest integer", () => {
    render(<LatencyIndicator latencyMs={42.6} />);
    expect(getIndicator().textContent).toBe("43 ms");
  });
});

/**
 * jsdom normalizes inline colors to `rgb(...)`; convert the hex constants
 * so string comparisons match regardless of representation.
 */
function hexToRgb(hex: string): string {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgb(${r}, ${g}, ${b})`;
}
