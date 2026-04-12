import { describe, it, expect, beforeEach } from "vitest";
import type { GameState, PieceType } from "@tetris/shared";
import { BOARD_WIDTH, BUFFER_HEIGHT } from "@tetris/shared";
import { ParticleSystem } from "../particle-system";
import { BoardEffects } from "../board-effects";
import type { Theme } from "../themes";

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------

const BOARD_TOTAL_ROWS = 40;

const theme: Theme = {
  id: "test",
  name: "Test",
  palette: {
    backgroundGradient: ["#000"],
    particleColors: ["#ff0000", "#00ff00", "#0000ff"],
    accent: "#ffff00",
    boardBg: "#111",
    panelBg: "#222",
    gridLine: "#333",
  },
  particles: { shape: "square", sizeRange: [1, 2], trail: false },
  geometry: { pattern: "none", density: 0, movement: 0 },
};

/** Build an empty 40×10 board. */
function emptyBoard(): (PieceType | null)[][] {
  const rows: (PieceType | null)[][] = [];
  for (let r = 0; r < BOARD_TOTAL_ROWS; r++) {
    const row: (PieceType | null)[] = [];
    for (let c = 0; c < BOARD_WIDTH; c++) row.push(null);
    rows.push(row);
  }
  return rows;
}

function fillRow(
  board: (PieceType | null)[][],
  r: number,
  type: PieceType = "I",
): void {
  for (let c = 0; c < BOARD_WIDTH; c++) board[r]![c] = type;
}

function state(overrides: Partial<GameState> = {}): GameState {
  const base: GameState = {
    status: "playing",
    board: emptyBoard(),
    currentPiece: null,
    ghostRow: null,
    hold: null,
    holdUsed: false,
    queue: ["I", "O", "T", "S", "Z"],
    scoring: {
      score: 0,
      level: 1,
      lines: 0,
      combo: -1,
      b2b: -1,
      startLevel: 1,
      piecesPlaced: 0,
    },
    elapsedMs: 0,
    gameMode: "marathon",
  };
  return { ...base, ...overrides } as GameState;
}

// -------------------------------------------------------------------------
// Deterministic RNG
// -------------------------------------------------------------------------

function makeRng(): () => number {
  let i = 0;
  return () => {
    i++;
    return (i * 0.3137) % 1;
  };
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe("BoardEffects", () => {
  let system: ParticleSystem;
  let effects: BoardEffects;

  beforeEach(() => {
    system = new ParticleSystem({ rng: makeRng() });
    effects = new BoardEffects({
      system,
      cellSize: 30,
      getTheme: () => theme,
      rng: makeRng(),
    });
  });

  it("no-ops on null prev state", () => {
    const events = effects.onFrame(null, state());
    expect(events).toEqual([]);
    expect(system.count()).toBe(0);
  });

  it("detects a single-row line clear and emits particles", () => {
    const prev = state();
    fillRow(prev.board as (PieceType | null)[][], BUFFER_HEIGHT + 19);
    const curr = state({
      scoring: { ...prev.scoring, lines: 1 },
    });
    const events = effects.onFrame(prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("lineClear");
    if (events[0]!.type === "lineClear") {
      expect(events[0]!.rows).toEqual([BUFFER_HEIGHT + 19]);
      expect(events[0]!.linesCleared).toBe(1);
    }
    expect(system.count()).toBeGreaterThan(0);
  });

  it("detects a tetris (4-line clear) with amplified particle count", () => {
    // Baseline single clear
    const prevSingle = state();
    fillRow(prevSingle.board as (PieceType | null)[][], BUFFER_HEIGHT + 19);
    const currSingle = state({
      scoring: { ...prevSingle.scoring, lines: 1 },
    });
    effects.onFrame(prevSingle, currSingle);
    const singleCount = system.count();
    system.clear();

    // Tetris
    const prevTetris = state();
    for (let r = BUFFER_HEIGHT + 16; r < BUFFER_HEIGHT + 20; r++) {
      fillRow(prevTetris.board as (PieceType | null)[][], r);
    }
    const currTetris = state({
      scoring: { ...prevTetris.scoring, lines: 4 },
    });
    const events = effects.onFrame(prevTetris, currTetris);
    expect(events[0]!.type).toBe("tetris");
    // Tetris spawns per-row dissolve (with 2× multiplier) plus a burst.
    expect(system.count()).toBeGreaterThan(singleCount);
  });

  it("detects a piece lock on queue shift with no line clear", () => {
    const piece = {
      type: "T" as PieceType,
      row: 36,
      col: 4,
      rotation: 0 as const,
      shape: [
        [false, true, false],
        [true, true, true],
        [false, false, false],
      ],
    };
    const prev = state({
      currentPiece: piece,
      queue: ["I", "O", "T", "S", "Z"],
    });
    const curr = state({
      currentPiece: null,
      queue: ["O", "T", "S", "Z", "L"],
    });
    const events = effects.onFrame(prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("lock");
    if (events[0]!.type === "lock") {
      expect(events[0]!.row).toBe(36);
      expect(events[0]!.col).toBe(4);
    }
    expect(system.count()).toBeGreaterThan(0);
  });

  it("does not emit a lock event when a line clear happens on the same tick", () => {
    const piece = {
      type: "I" as PieceType,
      row: 36,
      col: 3,
      rotation: 0 as const,
      shape: [[true, true, true, true]],
    };
    const prev = state({ currentPiece: piece });
    fillRow(prev.board as (PieceType | null)[][], BUFFER_HEIGHT + 19);
    const curr = state({
      currentPiece: null,
      queue: ["O", "T", "S", "Z", "L"],
      scoring: { ...prev.scoring, lines: 1 },
    });
    const events = effects.onFrame(prev, curr);
    expect(events.some((e) => e.type === "lock")).toBe(false);
    expect(events.some((e) => e.type === "lineClear")).toBe(true);
  });

  it("onHardDropIntent emits a vertical trail", () => {
    const piece = {
      type: "T" as PieceType,
      row: 20,
      col: 4,
      rotation: 0 as const,
      shape: [
        [false, true, false],
        [true, true, true],
        [false, false, false],
      ],
    };
    const s = state({ currentPiece: piece, ghostRow: 35 });
    const ev = effects.onHardDropIntent(s);
    expect(ev).not.toBeNull();
    expect(ev!.type).toBe("hardDrop");
    // One particle per row spanned (bounded to visible area).
    expect(system.count()).toBeGreaterThan(0);
  });

  it("onHardDropIntent returns null on non-playing state", () => {
    const s = state({ status: "paused" });
    expect(effects.onHardDropIntent(s)).toBeNull();
  });

  it("clear() empties the particle system", () => {
    const prev = state();
    fillRow(prev.board as (PieceType | null)[][], BUFFER_HEIGHT + 19);
    effects.onFrame(prev, state({ scoring: { ...prev.scoring, lines: 1 } }));
    expect(system.count()).toBeGreaterThan(0);
    effects.clear();
    expect(system.count()).toBe(0);
  });

  it("no-ops while paused", () => {
    const prev = state({ status: "paused" });
    const curr = state({
      status: "paused",
      scoring: { ...prev.scoring, lines: 1 },
    });
    const events = effects.onFrame(prev, curr);
    expect(events).toEqual([]);
    expect(system.count()).toBe(0);
  });

  it("uses theme colors for particles", () => {
    const prev = state();
    fillRow(prev.board as (PieceType | null)[][], BUFFER_HEIGHT + 19);
    effects.onFrame(prev, state({ scoring: { ...prev.scoring, lines: 1 } }));
    const colors = new Set(system.getParticles().map((p) => p.color));
    // Every emitted color is either from the theme palette or the white flash.
    const allowed = new Set<string>([
      ...theme.palette.particleColors,
      theme.palette.accent,
      "rgba(255,255,255,0.9)",
    ]);
    for (const c of colors) expect(allowed.has(c)).toBe(true);
  });
});
