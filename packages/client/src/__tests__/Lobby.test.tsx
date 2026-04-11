import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lobby } from "../ui/Lobby";

const defaultProps = {
  playerName: "Alice",
  connectionState: "connected" as const,
  error: null,
  onCreateRoom: vi.fn(),
  onJoinRoom: vi.fn(),
  onClearError: vi.fn(),
};

describe("Lobby", () => {
  it("renders title and player greeting", () => {
    render(<Lobby {...defaultProps} />);
    expect(screen.getByText("Tetris")).toBeInTheDocument();
    expect(screen.getByText("Welcome, Alice")).toBeInTheDocument();
  });

  it("renders Create Room and Join Room buttons", () => {
    render(<Lobby {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Create Room" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Join Room" })).toBeEnabled();
  });

  it("disables buttons when disconnected", () => {
    render(<Lobby {...defaultProps} connectionState="disconnected" />);
    expect(screen.getByRole("button", { name: "Create Room" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Join Room" })).toBeDisabled();
  });

  it("shows connecting status", () => {
    render(<Lobby {...defaultProps} connectionState="connecting" />);
    expect(screen.getByText("Connecting to server...")).toBeInTheDocument();
  });

  it("shows error message with dismiss button", async () => {
    const user = userEvent.setup();
    const onClearError = vi.fn();
    render(
      <Lobby {...defaultProps} error="Room not found" onClearError={onClearError} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Room not found");

    await user.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(onClearError).toHaveBeenCalled();
  });

  it("calls onCreateRoom when Create Room is clicked", async () => {
    const user = userEvent.setup();
    const onCreateRoom = vi.fn();
    render(<Lobby {...defaultProps} onCreateRoom={onCreateRoom} />);

    await user.click(screen.getByRole("button", { name: "Create Room" }));
    expect(onCreateRoom).toHaveBeenCalled();
  });

  it("calls onJoinRoom when Join Room is clicked", async () => {
    const user = userEvent.setup();
    const onJoinRoom = vi.fn();
    render(<Lobby {...defaultProps} onJoinRoom={onJoinRoom} />);

    await user.click(screen.getByRole("button", { name: "Join Room" }));
    expect(onJoinRoom).toHaveBeenCalled();
  });
});
