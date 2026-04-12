import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { GameState, ActivePiece, ScoringState } from "@tetris/shared";
import { createGrid, BUFFER_HEIGHT } from "@tetris/shared";
import { BoardCanvas, renderBoard } from "../ui/BoardCanvas.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function defaultScoring(): ScoringState {
  return { score: 0, level: 1, lines: 0, combo: -1, b2b: -1, startLevel: 1 };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    status: "playing",
    board: createGrid(),
    currentPiece: null,
    ghostRow: null,
    hold: null,
    holdUsed: false,
    queue: [],
    scoring: defaultScoring(),
    elapsedMs: 0,
    gameMode: "marathon",
    ...overrides,
  };
}

function makePiece(overrides: Partial<ActivePiece> = {}): ActivePiece {
  return {
    type: "T",
    row: 20,
    col: 3,
    rotation: 0,
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock canvas context
// ---------------------------------------------------------------------------

function createMockCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    font: "",
    textAlign: "start",
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BoardCanvas", () => {
  beforeEach(() => {
    // jsdom doesn't implement canvas — stub getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(createMockCtx());
  });

  it("renders a canvas element", () => {
    const state = makeState();
    const { getByTestId } = render(<BoardCanvas state={state} />);
    expect(getByTestId("board-canvas")).toBeInstanceOf(HTMLCanvasElement);
  });

  it("renders with custom cellSize", () => {
    const state = makeState();
    const { getByTestId } = render(<BoardCanvas state={state} cellSize={20} />);
    const canvas = getByTestId("board-canvas") as HTMLCanvasElement;
    // Total width = (5 + 0.5 + 10 + 0.5 + 5) * 20 = 21 * 20 = 420
    expect(canvas.width).toBe(420);
    // Total height = 20 * 20 = 400
    expect(canvas.height).toBe(400);
  });
});

describe("renderBoard", () => {
  it("draws placed cells on the board", () => {
    const ctx = createMockCtx();
    const state = makeState();
    // Place a T cell at visible row 0 (board row 20), col 5
    state.board[BUFFER_HEIGHT]![5] = "T";

    renderBoard(ctx, state, 30);

    // fillRect should have been called for the placed cell (main + highlight + shadow)
    const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
    // Board bg + clear + cell draws + panel bg => multiple calls; just verify > baseline
    expect(calls.length).toBeGreaterThan(0);
  });

  it("draws the active piece", () => {
    const ctx = createMockCtx();
    const piece = makePiece({ row: 20, col: 3 });
    const state = makeState({ currentPiece: piece });

    renderBoard(ctx, state, 30);

    // The T piece at rotation 0 has 4 filled cells, each drawn with 3 fillRect calls
    // (main + top/left highlight + bottom/right shadow = 3 per cell)
    // Plus board bg, clear, panels, etc.
    const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(4);
  });

  it("draws ghost piece when ghostRow is non-null", () => {
    const ctx = createMockCtx();
    const piece = makePiece({ row: 20, col: 3 });
    const state = makeState({ currentPiece: piece, ghostRow: 37 });

    renderBoard(ctx, state, 30);

    // Ghost cells use strokeRect
    const strokeCalls = (ctx.strokeRect as ReturnType<typeof vi.fn>).mock.calls;
    // 4 filled cells in T piece = 4 ghost strokeRect + 1 board border strokeRect
    expect(strokeCalls.length).toBeGreaterThanOrEqual(5);
  });

  it("does NOT draw ghost when ghostRow is null", () => {
    const ctx = createMockCtx();
    const piece = makePiece({ row: 20, col: 3 });
    const state = makeState({ currentPiece: piece, ghostRow: null });

    renderBoard(ctx, state, 30);

    // strokeRect calls: only the board border (1 call), no ghost cells
    const strokeCalls = (ctx.strokeRect as ReturnType<typeof vi.fn>).mock.calls;
    expect(strokeCalls.length).toBe(1); // board border only
  });

  it("does NOT draw ghost when ghost overlaps active piece", () => {
    const ctx = createMockCtx();
    const piece = makePiece({ row: 37, col: 3 });
    // Ghost at same row as piece — should be skipped
    const state = makeState({ currentPiece: piece, ghostRow: 37 });

    renderBoard(ctx, state, 30);

    const strokeCalls = (ctx.strokeRect as ReturnType<typeof vi.fn>).mock.calls;
    expect(strokeCalls.length).toBe(1); // board border only
  });

  it("draws hold piece when present", () => {
    const ctx = createMockCtx();
    const state = makeState({ hold: "J" });

    renderBoard(ctx, state, 30);

    // fillText should include "HOLD" and "NEXT" labels
    const textCalls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
    const labels = textCalls.map((c: unknown[]) => c[0]);
    expect(labels).toContain("HOLD");
  });

  it("does NOT draw hold piece contents when hold is null", () => {
    const ctx = createMockCtx();
    const state = makeState({ hold: null });

    // Count fillRect calls with hold null
    renderBoard(ctx, state, 30);
    const callsWithoutHold = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length;

    // Reset and draw with hold present
    const ctx2 = createMockCtx();
    const state2 = makeState({ hold: "J" });
    renderBoard(ctx2, state2, 30);
    const callsWithHold = (ctx2.fillRect as ReturnType<typeof vi.fn>).mock.calls.length;

    // Hold piece adds cells → more fillRect calls
    expect(callsWithHold).toBeGreaterThan(callsWithoutHold);
  });

  it("draws preview pieces from queue", () => {
    const ctx = createMockCtx();
    const state = makeState({ queue: ["I", "O", "T"] });

    renderBoard(ctx, state, 30);

    // fillText should include "NEXT"
    const textCalls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
    const labels = textCalls.map((c: unknown[]) => c[0]);
    expect(labels).toContain("NEXT");
  });

  it("clips active piece cells above the visible area", () => {
    const ctx = createMockCtx();
    // Piece at row 18 (buffer zone) — top 2 rows invisible, bottom rows at 20-21 visible
    const piece = makePiece({ row: 18, col: 3 });
    const state = makeState({ currentPiece: piece });

    renderBoard(ctx, state, 30);

    // Should still render without error — cells above visible area are skipped
    const calls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });
});
