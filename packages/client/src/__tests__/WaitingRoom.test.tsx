import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RoomState } from "@tetris/shared";
import { WaitingRoom } from "../ui/WaitingRoom";

function makeRoom(overrides?: Partial<RoomState>): RoomState {
  return {
    id: "ROOM-ABC",
    config: { name: "Test Room", maxPlayers: 4 },
    status: "waiting",
    players: [
      { id: "player-1", name: "Alice" },
      { id: "player-2", name: "Bob" },
    ],
    hostId: "player-1",
    ...overrides,
  };
}

describe("WaitingRoom", () => {
  it("shows room code", () => {
    render(
      <WaitingRoom
        room={makeRoom()}
        currentPlayerId="player-1"
        onLeave={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText("ROOM-ABC")).toBeInTheDocument();
  });

  it("lists all players", () => {
    render(
      <WaitingRoom
        room={makeRoom()}
        currentPlayerId="player-1"
        onLeave={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows host badge on host player", () => {
    render(
      <WaitingRoom
        room={makeRoom()}
        currentPlayerId="player-2"
        onLeave={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText("Host")).toBeInTheDocument();
  });

  it("shows You badge on current player", () => {
    render(
      <WaitingRoom
        room={makeRoom()}
        currentPlayerId="player-1"
        onLeave={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows player count", () => {
    render(
      <WaitingRoom
        room={makeRoom()}
        currentPlayerId="player-1"
        onLeave={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText("Players (2/4)")).toBeInTheDocument();
  });

  it("shows Start Game button for host when enough players", () => {
    render(
      <WaitingRoom
        room={makeRoom()}
        currentPlayerId="player-1"
        onLeave={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Start Game" })).toBeEnabled();
  });

  it("disables Start Game for host with only 1 player", () => {
    const room = makeRoom({
      players: [{ id: "player-1", name: "Alice" }],
    });
    render(
      <WaitingRoom
        room={room}
        currentPlayerId="player-1"
        onLeave={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Need at least 2 players" }),
    ).toBeDisabled();
  });

  it("shows waiting message for non-host", () => {
    render(
      <WaitingRoom
        room={makeRoom()}
        currentPlayerId="player-2"
        onLeave={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText("Waiting for host to start...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Game" })).toBeNull();
  });

  it("calls onStart when Start Game is clicked", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <WaitingRoom
        room={makeRoom()}
        currentPlayerId="player-1"
        onLeave={vi.fn()}
        onStart={onStart}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Start Game" }));
    expect(onStart).toHaveBeenCalled();
  });

  it("calls onLeave when Leave Room is clicked", async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(
      <WaitingRoom
        room={makeRoom()}
        currentPlayerId="player-1"
        onLeave={onLeave}
        onStart={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Leave Room" }));
    expect(onLeave).toHaveBeenCalled();
  });
});
