import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RoomState } from "@tomino/shared";
import { WaitingRoom } from "../ui/WaitingRoom";
import { DEFAULT_HANDICAP_SETTINGS, type HandicapSettingsValues } from "../ui/HandicapSettings";

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

function renderWaitingRoom(
  overrides?: {
    room?: Partial<RoomState>;
    currentPlayerId?: string;
    handicapSettings?: Partial<HandicapSettingsValues>;
  },
) {
  const onLeave = vi.fn();
  const onStart = vi.fn();
  const onHandicapSettingsChange = vi.fn();
  const settings = { ...DEFAULT_HANDICAP_SETTINGS, ...overrides?.handicapSettings };
  render(
    <WaitingRoom
      room={makeRoom(overrides?.room)}
      currentPlayerId={overrides?.currentPlayerId ?? "player-1"}
      handicapSettings={settings}
      onHandicapSettingsChange={onHandicapSettingsChange}
      onLeave={onLeave}
      onStart={onStart}
    />,
  );
  return { onLeave, onStart, onHandicapSettingsChange };
}

describe("WaitingRoom", () => {
  it("shows room code", () => {
    renderWaitingRoom();
    expect(screen.getByText("ROOM-ABC")).toBeInTheDocument();
  });

  it("lists all players", () => {
    renderWaitingRoom();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows host badge on host player", () => {
    renderWaitingRoom({ currentPlayerId: "player-2" });
    expect(screen.getByText("Host")).toBeInTheDocument();
  });

  it("shows You badge on current player", () => {
    renderWaitingRoom();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows player count", () => {
    renderWaitingRoom();
    expect(screen.getByText("Players (2/4)")).toBeInTheDocument();
  });

  it("shows Start Game button for host when enough players", () => {
    renderWaitingRoom();
    expect(screen.getByRole("button", { name: "Start Game" })).toBeEnabled();
  });

  it("disables Start Game for host with only 1 player", () => {
    renderWaitingRoom({
      room: { players: [{ id: "player-1", name: "Alice" }] },
    });
    expect(
      screen.getByRole("button", { name: "Need at least 2 players" }),
    ).toBeDisabled();
  });

  it("shows waiting message for non-host", () => {
    renderWaitingRoom({ currentPlayerId: "player-2" });
    expect(screen.getByText("Waiting for host to start...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Game" })).toBeNull();
  });

  it("calls onStart when Start Game is clicked", async () => {
    const user = userEvent.setup();
    const { onStart } = renderWaitingRoom();
    await user.click(screen.getByRole("button", { name: "Start Game" }));
    expect(onStart).toHaveBeenCalled();
  });

  it("calls onLeave when Leave Room is clicked", async () => {
    const user = userEvent.setup();
    const { onLeave } = renderWaitingRoom();
    await user.click(screen.getByRole("button", { name: "Leave Room" }));
    expect(onLeave).toHaveBeenCalled();
  });

  it("renders the handicap settings panel", () => {
    renderWaitingRoom();
    expect(screen.getByText("Handicap Settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Intensity")).toBeInTheDocument();
  });

  it("shows player ratings when ratingVisible is true", () => {
    renderWaitingRoom({
      room: {
        playerRatings: { "player-1": 1600, "player-2": 1400 },
      },
      handicapSettings: { ratingVisible: true },
    });
    expect(screen.getByText("1600")).toBeInTheDocument();
    expect(screen.getByText("1400")).toBeInTheDocument();
  });

  it("hides player ratings when ratingVisible is false", () => {
    renderWaitingRoom({
      room: {
        playerRatings: { "player-1": 1600, "player-2": 1400 },
      },
      handicapSettings: { ratingVisible: false },
    });
    expect(screen.queryByText("1600")).toBeNull();
    expect(screen.queryByText("1400")).toBeNull();
  });

  it("non-host sees disabled handicap controls", () => {
    renderWaitingRoom({ currentPlayerId: "player-2" });
    expect(screen.getByLabelText("Intensity")).toBeDisabled();
  });

  it("host sees enabled handicap controls", () => {
    renderWaitingRoom({ currentPlayerId: "player-1" });
    expect(screen.getByLabelText("Intensity")).not.toBeDisabled();
  });
});
