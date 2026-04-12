/**
 * Board builder test utilities — construct and compare boards using ASCII art.
 */

import { expect } from "vitest";
import type { Cell, Grid } from "../engine/board.js";
import { BOARD_HEIGHT, BOARD_WIDTH, createGrid } from "../engine/board.js";
import type { PieceType } from "../engine/pieces.js";

const VALID_CHARS = new Set([
  ".",
  "X",
  "I",
  "O",
  "T",
  "S",
  "Z",
  "J",
  "L",
]);

function charToCell(ch: string): Cell {
  if (ch === ".") return null;
  if (ch === "X") return "T";
  return ch as PieceType;
}

function cellToChar(cell: Cell): string {
  return cell === null ? "." : cell;
}

/**
 * Build a Grid from an ASCII-art string.
 *
 * - `.` = empty cell
 * - `X` = generic filled cell (stored as "T")
 * - `I`, `O`, `T`, `S`, `Z`, `J`, `L` = that piece type
 *
 * Leading/trailing blank lines are stripped. If fewer than 40 rows are given,
 * empty rows are prepended (partial boards specify the bottom of the playfield).
 */
export function boardFromAscii(ascii: string): Grid {
  const lines = ascii.split("\n");

  // Strip leading and trailing blank lines
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();

  if (lines.length === 0) return createGrid();

  if (lines.length > BOARD_HEIGHT) {
    throw new Error(
      `Too many rows: got ${lines.length}, max is ${BOARD_HEIGHT}`,
    );
  }

  // Validate and parse each line
  const rows: Cell[][] = lines.map((line, i) => {
    const trimmed = line.trim();
    if (trimmed.length !== BOARD_WIDTH) {
      throw new Error(
        `Row ${i} has width ${trimmed.length}, expected ${BOARD_WIDTH}: "${trimmed}"`,
      );
    }
    return [...trimmed].map((ch, col) => {
      if (!VALID_CHARS.has(ch)) {
        throw new Error(
          `Invalid character '${ch}' at row ${i}, col ${col}`,
        );
      }
      return charToCell(ch);
    });
  });

  // Pad with empty rows at the top
  const padCount = BOARD_HEIGHT - rows.length;
  const grid: Grid = [];
  for (let i = 0; i < padCount; i++) {
    grid.push(Array.from<Cell>({ length: BOARD_WIDTH }).fill(null));
  }
  grid.push(...rows);

  return grid;
}

/**
 * Convert a Grid to an ASCII-art string (all 40 rows, no trimming).
 */
export function boardToAscii(grid: Grid): string {
  return grid.map((row) => row.map(cellToChar).join("")).join("\n");
}

/** Create a fresh empty 40×10 grid. */
export function emptyBoard(): Grid {
  return createGrid();
}

/**
 * Assert that two boards are equal, showing an ASCII diff on failure.
 */
export function assertBoardEquals(actual: Grid, expected: Grid): void {
  const actualAscii = boardToAscii(actual);
  const expectedAscii = boardToAscii(expected);
  expect(actualAscii).toBe(expectedAscii);
}
