import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows name input when no name is stored", () => {
    render(<App />);
    expect(screen.getByLabelText("Enter your name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("shows lobby menu when name is already stored", () => {
    localStorage.setItem("tetris-player-name", "Alice");
    render(<App />);
    expect(screen.getByText("Welcome, Alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Room" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Room" })).toBeInTheDocument();
  });
});
