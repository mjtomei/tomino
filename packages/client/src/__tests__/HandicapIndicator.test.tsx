import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HandicapIndicator } from "../ui/HandicapIndicator.js";

describe("HandicapIndicator", () => {
  it("renders incoming multiplier", () => {
    render(<HandicapIndicator handicap={{ incomingMultiplier: 0.6 }} />);
    expect(screen.getByText("0.6x")).toBeTruthy();
    expect(screen.getByText("Handicap")).toBeTruthy();
  });

  it("shows shield icon when protected (multiplier < 1.0)", () => {
    render(<HandicapIndicator handicap={{ incomingMultiplier: 0.6 }} />);
    expect(screen.getByTestId("shield-icon")).toBeTruthy();
  });

  it("does NOT show shield icon for neutral multiplier (1.0)", () => {
    render(<HandicapIndicator handicap={{ incomingMultiplier: 1.0 }} />);
    expect(screen.queryByTestId("shield-icon")).toBeNull();
  });

  it("renders outgoing multiplier when provided", () => {
    render(
      <HandicapIndicator
        handicap={{ incomingMultiplier: 0.5, outgoingMultiplier: 0.8 }}
      />,
    );
    expect(screen.getByText("0.5x")).toBeTruthy();
    expect(screen.getByText("Out: 0.8x")).toBeTruthy();
  });

  it("does NOT render outgoing multiplier when not provided", () => {
    render(<HandicapIndicator handicap={{ incomingMultiplier: 0.6 }} />);
    expect(screen.queryByText(/Out:/)).toBeNull();
  });

  it("uses green color for protected multiplier", () => {
    render(<HandicapIndicator handicap={{ incomingMultiplier: 0.6 }} />);
    const text = screen.getByText("0.6x");
    expect(text.style.color).toBe("rgb(76, 175, 80)"); // #4CAF50
  });

  it("uses gray color for neutral multiplier", () => {
    render(<HandicapIndicator handicap={{ incomingMultiplier: 1.0 }} />);
    const text = screen.getByText("1.0x");
    expect(text.style.color).toBe("rgb(136, 136, 136)"); // #888888
  });
});
