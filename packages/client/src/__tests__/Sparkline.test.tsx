import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "../ui/Sparkline";

describe("Sparkline", () => {
  it("renders 'No data' for empty data", () => {
    const { container } = render(<Sparkline data={[]} />);
    const text = container.querySelector("text");
    expect(text?.textContent).toBe("No data");
  });

  it("renders a circle for a single data point", () => {
    const { container } = render(
      <Sparkline data={[{ timestamp: 1000, rating: 1500 }]} />,
    );
    expect(container.querySelector("circle")).not.toBeNull();
    expect(container.querySelector("polyline")).toBeNull();
  });

  it("renders a polyline for multiple data points", () => {
    const data = [
      { timestamp: 1000, rating: 1500 },
      { timestamp: 2000, rating: 1520 },
      { timestamp: 3000, rating: 1510 },
    ];
    const { container } = render(<Sparkline data={data} />);
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
    // 3 points = 3 coordinate pairs in the points attribute
    const points = polyline!.getAttribute("points")!.split(" ");
    expect(points).toHaveLength(3);
  });

  it("renders with custom dimensions", () => {
    const data = [
      { timestamp: 1000, rating: 1500 },
      { timestamp: 2000, rating: 1520 },
    ];
    const { container } = render(<Sparkline data={data} width={200} height={40} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("200");
    expect(svg?.getAttribute("height")).toBe("40");
  });

  it("has accessible aria-label", () => {
    const { container } = render(
      <Sparkline data={[{ timestamp: 1000, rating: 1500 }]} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Rating history");
  });
});
