import { describe, expect, it } from "vitest";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../engine/board.js";
import {
  assertBoardEquals,
  boardFromAscii,
  boardToAscii,
  emptyBoard,
} from "./board-builder.js";

describe("boardFromAscii / boardToAscii", () => {
  it("round-trips a full 40-row board", () => {
    // Build a 40-line ASCII string: 39 empty rows + 1 filled row at the bottom
    const lines: string[] = [];
    for (let i = 0; i < 39; i++) lines.push("..........");
    lines.push("TTTTTTTTTT");
    const ascii = lines.join("\n");

    const grid = boardFromAscii(ascii);
    const result = boardToAscii(grid);
    expect(result).toBe(ascii);
  });

  it("round-trips with all piece types", () => {
    const lines: string[] = [];
    for (let i = 0; i < 39; i++) lines.push("..........");
    lines.push("IOTSZ.JL..");
    const ascii = lines.join("\n");

    const grid = boardFromAscii(ascii);
    expect(grid[39]).toEqual(["I", "O", "T", "S", "Z", null, "J", "L", null, null]);

    const result = boardToAscii(grid);
    expect(result).toBe(ascii);
  });

  it("pads partial boards (only bottom rows specified)", () => {
    const ascii = `
XXXXXXXXXX
..........
    `.trim();

    const grid = boardFromAscii(ascii);
    expect(grid).toHaveLength(BOARD_HEIGHT);

    // Top 38 rows should be empty
    for (let r = 0; r < 38; r++) {
      expect(grid[r]!.every((c) => c === null)).toBe(true);
    }

    // Row 38: all T (from X)
    expect(grid[38]!.every((c) => c === "T")).toBe(true);

    // Row 39: all empty
    expect(grid[39]!.every((c) => c === null)).toBe(true);
  });

  it("preserves piece-type colors through round-trip", () => {
    const bottomRow = "IOTTSZJL..";
    const grid = boardFromAscii(bottomRow);

    // The single row should be at the bottom (row 39)
    expect(grid[39]).toEqual(["I", "O", "T", "T", "S", "Z", "J", "L", null, null]);

    // Round-trip: boardToAscii produces all 40 rows
    const full = boardToAscii(grid);
    const outputLines = full.split("\n");
    expect(outputLines).toHaveLength(BOARD_HEIGHT);
    expect(outputLines[39]).toBe(bottomRow);

    // Top 39 rows should be all dots
    for (let i = 0; i < 39; i++) {
      expect(outputLines[i]).toBe("..........");
    }
  });

  it("maps X to T (generic filled)", () => {
    const grid = boardFromAscii("XXXXXXXXXX");
    expect(grid[39]!.every((c) => c === "T")).toBe(true);

    // boardToAscii outputs T, not X
    const output = boardToAscii(grid);
    expect(output.split("\n")[39]).toBe("TTTTTTTTTT");
  });

  it("throws on invalid row width", () => {
    expect(() => boardFromAscii("XXXXX")).toThrow(/width 5.*expected 10/);
    expect(() => boardFromAscii("XXXXXXXXXXX")).toThrow(/width 11.*expected 10/);
  });

  it("throws on invalid characters", () => {
    expect(() => boardFromAscii("XXXXQXXXXX")).toThrow(/Invalid character 'Q'/);
  });

  it("throws on too many rows", () => {
    const lines = Array.from({ length: 41 }, () => "..........").join("\n");
    expect(() => boardFromAscii(lines)).toThrow(/Too many rows/);
  });

  it("handles empty/whitespace input as empty board", () => {
    const grid = boardFromAscii("\n  \n\n");
    expect(grid).toHaveLength(BOARD_HEIGHT);
    expect(grid.every((row) => row.every((c) => c === null))).toBe(true);
  });
});

describe("emptyBoard", () => {
  it("returns a 40×10 grid of nulls", () => {
    const grid = emptyBoard();
    expect(grid).toHaveLength(BOARD_HEIGHT);
    for (const row of grid) {
      expect(row).toHaveLength(BOARD_WIDTH);
      expect(row.every((c) => c === null)).toBe(true);
    }
  });

  it("returns a fresh grid each call", () => {
    const a = emptyBoard();
    const b = emptyBoard();
    expect(a).not.toBe(b);
    a[0]![0] = "T";
    expect(b[0]![0]).toBeNull();
  });
});

describe("assertBoardEquals", () => {
  it("passes for identical boards", () => {
    const a = boardFromAscii("XXXXXXXXXX");
    const b = boardFromAscii("XXXXXXXXXX");
    assertBoardEquals(a, b);
  });

  it("fails with readable diff for different boards", () => {
    const a = boardFromAscii("XXXXXXXXXX");
    const b = emptyBoard();
    expect(() => assertBoardEquals(a, b)).toThrow();
  });
});
