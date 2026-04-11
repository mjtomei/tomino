import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatsScreen } from "../ui/StatsScreen";
import type { StatsResponse } from "@tetris/shared";

const mockStats: StatsResponse = {
  player: {
    username: "alice",
    rating: 1650,
    ratingDeviation: 200,
    volatility: 0.06,
    gamesPlayed: 15,
  },
  rankLabel: "Advanced",
  matchHistory: [
    {
      gameId: "g3",
      winner: "alice",
      loser: "bob",
      metrics: {},
      timestamp: 1700000000000,
      ratingChanges: { alice: { before: 1630, after: 1650 } },
    },
    {
      gameId: "g2",
      winner: "charlie",
      loser: "alice",
      metrics: {},
      timestamp: 1699900000000,
      ratingChanges: { alice: { before: 1650, after: 1630 } },
    },
  ],
  ratingHistory: [
    { timestamp: 1699900000000, rating: 1630 },
    { timestamp: 1700000000000, rating: 1650 },
  ],
};

const emptyStats: StatsResponse = {
  player: null,
  rankLabel: "Beginner",
  matchHistory: [],
  ratingHistory: [],
};

function mockFetchResponse(data: StatsResponse) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe("StatsScreen", () => {
  const onBack = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
    onBack.mockReset();
  });

  it("shows loading state initially", () => {
    // Never-resolving fetch to keep loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<StatsScreen username="alice" onBack={onBack} />);
    expect(screen.getByText("Loading stats...")).toBeInTheDocument();
  });

  it("renders player stats with mock data", async () => {
    mockFetchResponse(mockStats);
    render(<StatsScreen username="alice" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("1650")).toBeInTheDocument();
    });

    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByText("Stats for alice")).toBeInTheDocument();
    expect(screen.getByText(/15 games/)).toBeInTheDocument();
  });

  it("renders match history rows", async () => {
    mockFetchResponse(mockStats);
    render(<StatsScreen username="alice" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });

    expect(screen.getByText("charlie")).toBeInTheDocument();
    expect(screen.getByText("Win")).toBeInTheDocument();
    expect(screen.getByText("Loss")).toBeInTheDocument();
    expect(screen.getByText("+20")).toBeInTheDocument();
    expect(screen.getByText("-20")).toBeInTheDocument();
  });

  it("renders empty state for new player", async () => {
    mockFetchResponse(emptyStats);
    render(<StatsScreen username="newbie" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("No games played yet")).toBeInTheDocument();
    });

    expect(screen.getByText("No matches yet")).toBeInTheDocument();
    expect(screen.getByText("Beginner")).toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", async () => {
    mockFetchResponse(mockStats);
    const user = userEvent.setup();
    render(<StatsScreen username="alice" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("1650")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows error state on fetch failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    render(<StatsScreen username="alice" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });
});
