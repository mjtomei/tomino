import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";

/**
 * Example test demonstrating patterns for React component testing.
 *
 * Future tests in this package should follow this structure:
 * - Render components with React Testing Library
 * - Query by accessible roles/text, not implementation details
 * - Use @testing-library/user-event for interactions
 */

describe("App", () => {
  it("renders the game title", () => {
    render(<App />);
    expect(screen.getByText("Tetris")).toBeInTheDocument();
  });

  it("renders the placeholder message", () => {
    render(<App />);
    expect(screen.getByText("Game coming soon...")).toBeInTheDocument();
  });
});
