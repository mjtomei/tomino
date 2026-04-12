import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { PlayerId, PlayerStats } from "@tetris/shared";
import { GameResults } from "../ui/GameResults.js";

const PLACEMENTS: Record<PlayerId, number> = {
  p1: 1,
  p2: 2,
  p3: 3,
};

const STATS: Record<PlayerId, PlayerStats> = {
  p1: { linesSent: 8, linesReceived: 2, piecesPlaced: 50, survivalMs: 120000, score: 5000, linesCleared: 12 },
  p2: { linesSent: 5, linesReceived: 4, piecesPlaced: 40, survivalMs: 90000, score: 3000, linesCleared: 8 },
  p3: { linesSent: 1, linesReceived: 6, piecesPlaced: 20, survivalMs: 45000, score: 1000, linesCleared: 3 },
};

const PLAYER_NAMES: Record<PlayerId, string> = {
  p1: "Alice",
  p2: "Bob",
  p3: "Charlie",
};

const DEFAULT_PROPS = {
  placements: PLACEMENTS,
  stats: STATS,
  playerNames: PLAYER_NAMES,
  onBackToLobby: () => {},
  onRequestRematch: () => {},
  onViewStats: () => {},
  rematchVotes: null,
};

describe("GameResults", () => {
  it("renders placements for all players", () => {
    const { getByTestId } = render(
      <GameResults localPlayerId="p2" winnerId="p1" {...DEFAULT_PROPS} />,
    );

    expect(getByTestId("results-table")).toBeDefined();
    expect(getByTestId("results-row-p1")).toBeDefined();
    expect(getByTestId("results-row-p2")).toBeDefined();
    expect(getByTestId("results-row-p3")).toBeDefined();
  });

  it("shows VICTORY when local player is the winner", () => {
    const { getByTestId } = render(
      <GameResults localPlayerId="p1" winnerId="p1" {...DEFAULT_PROPS} />,
    );

    const container = getByTestId("game-results");
    expect(container.textContent).toContain("VICTORY");
    expect(container.textContent).toContain("1st");
  });

  it("shows DEFEATED when local player lost", () => {
    const { getByTestId } = render(
      <GameResults localPlayerId="p3" winnerId="p1" {...DEFAULT_PROPS} />,
    );

    const container = getByTestId("game-results");
    expect(container.textContent).toContain("DEFEATED");
    expect(container.textContent).toContain("3rd");
  });

  it("highlights the local player row", () => {
    const { getByTestId } = render(
      <GameResults localPlayerId="p2" winnerId="p1" {...DEFAULT_PROPS} />,
    );

    const localRow = getByTestId("results-row-p2");
    expect(localRow.className).toContain("results-row-local");
  });

  it("displays stats values for each player", () => {
    const { getByTestId } = render(
      <GameResults localPlayerId="p1" winnerId="p1" {...DEFAULT_PROPS} />,
    );

    const p1Row = getByTestId("results-row-p1");
    expect(p1Row.textContent).toContain("Alice");
    expect(p1Row.textContent).toContain("8"); // linesSent
    expect(p1Row.textContent).toContain("50"); // piecesPlaced
    expect(p1Row.textContent).toContain("5,000"); // score formatted
  });

  it("sorts players by placement (1st first)", () => {
    const { getByTestId } = render(
      <GameResults localPlayerId="p3" winnerId="p1" {...DEFAULT_PROPS} />,
    );

    const table = getByTestId("results-table");
    const rows = table.querySelectorAll(".results-row");
    expect(rows[0]!.textContent).toContain("Alice"); // 1st
    expect(rows[1]!.textContent).toContain("Bob"); // 2nd
    expect(rows[2]!.textContent).toContain("Charlie"); // 3rd
  });

  it("calls onBackToLobby when button is clicked", () => {
    const onBack = vi.fn();
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p1"
        winnerId="p1"
        {...DEFAULT_PROPS}
        onBackToLobby={onBack}
      />,
    );

    getByTestId("back-to-lobby").click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("renders rematch button and calls onRequestRematch when clicked", () => {
    const onRematch = vi.fn();
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p1"
        winnerId="p1"
        {...DEFAULT_PROPS}
        onRequestRematch={onRematch}
      />,
    );

    const btn = getByTestId("rematch-btn");
    expect(btn.textContent).toBe("REMATCH");
    btn.click();
    expect(onRematch).toHaveBeenCalledOnce();
  });

  it("disables rematch button after clicking", () => {
    const { getByTestId } = render(
      <GameResults localPlayerId="p1" winnerId="p1" {...DEFAULT_PROPS} />,
    );

    const btn = getByTestId("rematch-btn") as HTMLButtonElement;
    fireEvent.click(btn);
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("WAITING...");
  });

  it("shows vote progress when rematchVotes is provided", () => {
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p1"
        winnerId="p1"
        {...DEFAULT_PROPS}
        rematchVotes={{ votes: ["p1"], totalPlayers: 3 }}
      />,
    );

    const status = getByTestId("rematch-status");
    expect(status.textContent).toContain("1/3");
  });

  it("displays rating changes when provided", () => {
    const ratingChanges = {
      p1: { username: "Alice", before: 1500, after: 1530 },
      p2: { username: "Bob", before: 1500, after: 1480 },
      p3: { username: "Charlie", before: 1500, after: 1470 },
    };
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p2"
        winnerId="p1"
        {...DEFAULT_PROPS}
        ratingChanges={ratingChanges}
      />,
    );

    // Winner should show positive delta
    const p1Rating = getByTestId("rating-p1");
    expect(p1Rating.textContent).toContain("1530");
    expect(p1Rating.textContent).toContain("+30");

    // Loser should show negative delta
    const p2Rating = getByTestId("rating-p2");
    expect(p2Rating.textContent).toContain("1480");
    expect(p2Rating.textContent).toContain("-20");
  });

  it("does not show rating column when no ratingChanges provided", () => {
    const { queryByTestId } = render(
      <GameResults localPlayerId="p1" winnerId="p1" {...DEFAULT_PROPS} />,
    );

    expect(queryByTestId("rating-p1")).toBeNull();
  });

  it("shows handicap summary when modifiers are non-trivial", () => {
    const handicapModifiers = {
      "Alice\u2192Bob": { garbageMultiplier: 0.6, delayModifier: 1.0, messinessFactor: 0.5 },
      "Bob\u2192Alice": { garbageMultiplier: 1.0, delayModifier: 1.0, messinessFactor: 0.5 },
      "Alice\u2192Charlie": { garbageMultiplier: 0.8, delayModifier: 1.0, messinessFactor: 0.5 },
      "Charlie\u2192Alice": { garbageMultiplier: 1.0, delayModifier: 1.0, messinessFactor: 0.5 },
      "Bob\u2192Charlie": { garbageMultiplier: 0.9, delayModifier: 1.0, messinessFactor: 0.5 },
      "Charlie\u2192Bob": { garbageMultiplier: 1.0, delayModifier: 1.0, messinessFactor: 0.5 },
    };
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p1"
        winnerId="p1"
        {...DEFAULT_PROPS}
        handicapModifiers={handicapModifiers}
      />,
    );

    const summary = getByTestId("handicap-summary");
    expect(summary.textContent).toContain("Handicap Active");
    // Bob receives 0.6x from Alice (min incoming)
    expect(summary.textContent).toContain("0.6x");
  });

  it("calls onViewStats when View Stats button is clicked", () => {
    const onViewStats = vi.fn();
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p1"
        winnerId="p1"
        {...DEFAULT_PROPS}
        onViewStats={onViewStats}
      />,
    );

    getByTestId("view-stats").click();
    expect(onViewStats).toHaveBeenCalledOnce();
  });
});
