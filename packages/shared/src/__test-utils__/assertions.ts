/**
 * State transition assertion helpers for verifying engine behavior.
 *
 * These throw plain Errors (not vitest assertions) so they're composable
 * and framework-agnostic. Test files catch throws with expect().toThrow().
 */

import type { GameStateSnapshot, GarbageBatch, PieceType } from "../types.js";
import { BOARD_TOTAL_HEIGHT, BOARD_WIDTH } from "../types.js";

/**
 * Assert that the expected number of lines were cleared between two states.
 */
export function assertLinesCleared(
  before: GameStateSnapshot,
  after: GameStateSnapshot,
  expectedCount: number,
): void {
  const actual = after.linesCleared - before.linesCleared;
  if (actual !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} lines cleared, but ${actual} were cleared ` +
        `(before: ${before.linesCleared}, after: ${after.linesCleared})`,
    );
  }
}

/**
 * Assert that specific board cells contain expected piece types (i.e., a piece was locked there).
 */
export function assertPieceLocked(
  state: GameStateSnapshot,
  expectedCells: ReadonlyArray<{ row: number; col: number; type: PieceType }>,
): void {
  const mismatches: string[] = [];

  for (const { row, col, type } of expectedCells) {
    if (row < 0 || row >= BOARD_TOTAL_HEIGHT || col < 0 || col >= BOARD_WIDTH) {
      mismatches.push(
        `(${row}, ${col}): out of bounds (board is ${BOARD_TOTAL_HEIGHT}×${BOARD_WIDTH})`,
      );
      continue;
    }
    const actual = state.board[row]![col];
    if (actual !== type) {
      mismatches.push(
        `(${row}, ${col}): expected "${type}", got ${actual === null ? "empty" : `"${actual}"`}`,
      );
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Piece lock assertion failed — ${mismatches.length} cell(s) don't match:\n` +
        mismatches.map((m) => `  ${m}`).join("\n"),
    );
  }
}

/**
 * Assert that a garbage batch was inserted: existing rows shifted up,
 * and new garbage rows added at the bottom with the correct gap.
 */
export function assertGarbageInserted(
  before: GameStateSnapshot,
  after: GameStateSnapshot,
  batch: GarbageBatch,
): void {
  const { lines, gapColumn } = batch;
  const errors: string[] = [];

  // Check that the top rows of 'after' match the shifted-up rows from 'before'
  const preserved = BOARD_TOTAL_HEIGHT - lines;
  for (let row = 0; row < preserved; row++) {
    const beforeRow = before.board[row + lines];
    const afterRow = after.board[row];
    if (!beforeRow || !afterRow) continue;
    for (let col = 0; col < BOARD_WIDTH; col++) {
      if (afterRow[col] !== beforeRow[col]) {
        errors.push(
          `Shifted row mismatch at (${row}, ${col}): ` +
            `expected ${beforeRow[col] === null ? "empty" : `"${beforeRow[col]}"`}, ` +
            `got ${afterRow[col] === null ? "empty" : `"${afterRow[col]}"`}`,
        );
      }
    }
  }

  // Check garbage rows at the bottom
  for (let i = 0; i < lines; i++) {
    const row = BOARD_TOTAL_HEIGHT - lines + i;
    const garbageRow = after.board[row];
    if (!garbageRow) {
      errors.push(`Missing garbage row at index ${row}`);
      continue;
    }
    for (let col = 0; col < BOARD_WIDTH; col++) {
      if (col === gapColumn) {
        if (garbageRow[col] !== null) {
          errors.push(
            `Garbage row ${row}, gap column ${col}: expected empty, got "${garbageRow[col]}"`,
          );
        }
      } else {
        if (garbageRow[col] === null) {
          errors.push(
            `Garbage row ${row}, column ${col}: expected filled, got empty`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Garbage insertion assertion failed (${lines} line(s), gap at column ${gapColumn}):\n` +
        errors.map((e) => `  ${e}`).join("\n"),
    );
  }
}

/**
 * Assert that a piece of the expected type has been spawned (is the active piece).
 */
export function assertSpawnedPiece(
  state: GameStateSnapshot,
  expectedType: PieceType,
): void {
  if (state.activePiece === null) {
    throw new Error(
      `Expected active piece of type "${expectedType}" but no piece is active`,
    );
  }
  if (state.activePiece.type !== expectedType) {
    throw new Error(
      `Expected active piece of type "${expectedType}", got "${state.activePiece.type}"`,
    );
  }
}
