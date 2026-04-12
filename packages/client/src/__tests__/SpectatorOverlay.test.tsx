import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SpectatorOverlay } from "../ui/SpectatorOverlay.js";

describe("SpectatorOverlay", () => {
  it("renders elimination message with placement", () => {
    const { getByTestId } = render(<SpectatorOverlay placement={3} />);

    const overlay = getByTestId("spectator-overlay");
    expect(overlay.textContent).toContain("ELIMINATED");
    expect(overlay.textContent).toContain("3rd");
  });

  it("shows correct ordinal for 2nd place", () => {
    const { getByTestId } = render(<SpectatorOverlay placement={2} />);

    expect(getByTestId("spectator-overlay").textContent).toContain("2nd");
  });

  it("shows spectating message", () => {
    const { getByTestId } = render(<SpectatorOverlay placement={4} />);

    expect(getByTestId("spectator-overlay").textContent).toContain("Spectating");
  });

  it("uses overlay CSS class for consistent styling", () => {
    const { getByTestId } = render(<SpectatorOverlay placement={2} />);

    expect(getByTestId("spectator-overlay").className).toContain("overlay");
  });
});
