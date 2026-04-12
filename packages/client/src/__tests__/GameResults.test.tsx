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

describe("GameResults", () => {
  it("renders placements for all players", () => {
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p2"
        winnerId="p1"
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={() => {}}
        onRequestRematch={() => {}}
        rematchVotes={null}
      />,
    );

    expect(getByTestId("results-table")).toBeDefined();
    expect(getByTestId("results-row-p1")).toBeDefined();
    expect(getByTestId("results-row-p2")).toBeDefined();
    expect(getByTestId("results-row-p3")).toBeDefined();
  });

  it("shows VICTORY when local player is the winner", () => {
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p1"
        winnerId="p1"
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={() => {}}
        onRequestRematch={() => {}}
        rematchVotes={null}
      />,
    );

    const container = getByTestId("game-results");
    expect(container.textContent).toContain("VICTORY");
    expect(container.textContent).toContain("1st");
  });

  it("shows DEFEATED when local player lost", () => {
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p3"
        winnerId="p1"
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={() => {}}
        onRequestRematch={() => {}}
        rematchVotes={null}
      />,
    );

    const container = getByTestId("game-results");
    expect(container.textContent).toContain("DEFEATED");
    expect(container.textContent).toContain("3rd");
  });

  it("highlights the local player row", () => {
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p2"
        winnerId="p1"
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={() => {}}
        onRequestRematch={() => {}}
        rematchVotes={null}
      />,
    );

    const localRow = getByTestId("results-row-p2");
    expect(localRow.className).toContain("results-row-local");
  });

  it("displays stats values for each player", () => {
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p1"
        winnerId="p1"
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={() => {}}
        onRequestRematch={() => {}}
        rematchVotes={null}
      />,
    );

    const p1Row = getByTestId("results-row-p1");
    expect(p1Row.textContent).toContain("Alice");
    expect(p1Row.textContent).toContain("8"); // linesSent
    expect(p1Row.textContent).toContain("50"); // piecesPlaced
    expect(p1Row.textContent).toContain("5,000"); // score formatted
  });

  it("sorts players by placement (1st first)", () => {
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p3"
        winnerId="p1"
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={() => {}}
        onRequestRematch={() => {}}
        rematchVotes={null}
      />,
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
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={onBack}
        onRequestRematch={() => {}}
        rematchVotes={null}
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
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={() => {}}
        onRequestRematch={onRematch}
        rematchVotes={null}
      />,
    );

    const btn = getByTestId("rematch-btn");
    expect(btn.textContent).toBe("REMATCH");
    btn.click();
    expect(onRematch).toHaveBeenCalledOnce();
  });

  it("disables rematch button after clicking", () => {
    const { getByTestId } = render(
      <GameResults
        localPlayerId="p1"
        winnerId="p1"
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={() => {}}
        onRequestRematch={() => {}}
        rematchVotes={null}
      />,
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
        placements={PLACEMENTS}
        stats={STATS}
        playerNames={PLAYER_NAMES}
        onBackToLobby={() => {}}
        onRequestRematch={() => {}}
        rematchVotes={{ votes: ["p1"], totalPlayers: 3 }}
      />,
    );

    const status = getByTestId("rematch-status");
    expect(status.textContent).toContain("1/3");
  });
});
