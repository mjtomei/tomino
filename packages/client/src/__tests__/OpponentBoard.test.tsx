import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { GameStateSnapshot, Board, Row } from "@tetris/shared";
import { BOARD_WIDTH, BOARD_TOTAL_HEIGHT, BUFFER_HEIGHT } from "@tetris/shared";
import { OpponentBoard, opponentCellSize } from "../ui/OpponentBoard.js";
import { renderOpponentBoard } from "../ui/OpponentBoardCanvas.js";

function emptyRow(): Row {
  return Array<null>(BOARD_WIDTH).fill(null);
}

function emptyBoard(): Board {
  return Array.from({ length: BOARD_TOTAL_HEIGHT }, emptyRow);
}

function makeSnapshot(overrides: Partial<GameStateSnapshot> = {}): GameStateSnapshot {
  return {
    tick: 0,
    board: emptyBoard(),
    activePiece: null,
    ghostY: null,
    nextQueue: [],
    holdPiece: null,
    holdUsed: false,
    score: 0,
    level: 1,
    linesCleared: 0,
    piecesPlaced: 0,
    pendingGarbage: [],
    isGameOver: false,
    ...overrides,
  };
}

function createMockCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: "",
    globalAlpha: 1,
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("opponentCellSize", () => {
  it("returns 15 for 0 or 1 opponent", () => {
    expect(opponentCellSize(0)).toBe(15);
    expect(opponentCellSize(1)).toBe(15);
  });
  it("shrinks as opponents grow", () => {
    expect(opponentCellSize(2)).toBe(12);
    expect(opponentCellSize(3)).toBe(10);
    expect(opponentCellSize(4)).toBe(8);
    expect(opponentCellSize(10)).toBe(8);
  });
});

describe("renderOpponentBoard", () => {
  it("draws only background for null snapshot", () => {
    const ctx = createMockCtx();
    renderOpponentBoard(ctx, null, 10);
    // Exactly one fillRect call (background)
    expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("draws a cell for every occupied board position", () => {
    const ctx = createMockCtx();
    const snap = makeSnapshot();
    // Place two cells in visible area
    snap.board[BUFFER_HEIGHT]![0] = "T";
    snap.board[BUFFER_HEIGHT + 5]![3] = "L";
    renderOpponentBoard(ctx, snap, 10);
    const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
    // background + 2 cells
    expect(calls.length).toBe(3);
  });

  it("draws the active piece shape", () => {
    const ctx = createMockCtx();
    const snap = makeSnapshot({
      activePiece: { type: "O", x: 4, y: BUFFER_HEIGHT, rotation: 0 },
    });
    renderOpponentBoard(ctx, snap, 10);
    const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
    // background + 4 O-piece cells
    expect(calls.length).toBe(5);
  });

  it("dims the rendering when game is over", () => {
    const ctx = createMockCtx();
    const snap = makeSnapshot({ isGameOver: true });
    snap.board[BUFFER_HEIGHT]![0] = "T";
    renderOpponentBoard(ctx, snap, 10);
    // globalAlpha is reset to 1 at the end
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe("OpponentBoard component", () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(createMockCtx());
  });

  it("renders a canvas with correct dimensions", () => {
    const { getByTestId } = render(
      <OpponentBoard playerName="Alice" snapshot={null} cellSize={10} />,
    );
    const canvas = getByTestId("opponent-canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(BOARD_WIDTH * 10);
    expect(canvas.height).toBe(20 * 10);
  });

  it("shows the player name", () => {
    const { getByTestId } = render(
      <OpponentBoard playerName="Alice" snapshot={null} cellSize={10} />,
    );
    const container = getByTestId("opponent-board");
    expect(container.textContent).toContain("Alice");
  });

  it("marks game-over players", () => {
    const snap = makeSnapshot({ isGameOver: true });
    const { getByTestId } = render(
      <OpponentBoard playerName="Bob" snapshot={snap} cellSize={10} />,
    );
    expect(getByTestId("opponent-board").textContent).toContain("✗");
  });
});
