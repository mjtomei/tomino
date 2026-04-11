import { describe, it, expect } from "vitest";

/**
 * Example test demonstrating patterns for shared game logic.
 *
 * Future tests in this package should follow this structure:
 * - Pure function tests for rotation, scoring, board state
 * - Deterministic: given the same inputs, always the same output
 * - Snapshot tests for lookup tables (e.g., SRS kick tables)
 */

describe("shared package test setup", () => {
  it("runs in node environment", () => {
    expect(typeof globalThis).toBe("object");
    expect(typeof window).toBe("undefined");
  });

  it("supports TypeScript features", () => {
    type Piece = { x: number; y: number; rotation: number };
    const piece: Piece = { x: 5, y: 0, rotation: 0 };
    expect(piece).toMatchObject({ x: 5, y: 0, rotation: 0 });
  });
});

describe("example: deterministic game logic pattern", () => {
  // Demonstrates testing pure functions with deterministic output
  function rotate(rotation: number, clockwise: boolean): number {
    return clockwise ? (rotation + 1) % 4 : (rotation + 3) % 4;
  }

  it("rotates clockwise through 4 states", () => {
    expect(rotate(0, true)).toBe(1);
    expect(rotate(1, true)).toBe(2);
    expect(rotate(2, true)).toBe(3);
    expect(rotate(3, true)).toBe(0);
  });

  it("rotates counter-clockwise through 4 states", () => {
    expect(rotate(0, false)).toBe(3);
    expect(rotate(1, false)).toBe(0);
    expect(rotate(2, false)).toBe(1);
    expect(rotate(3, false)).toBe(2);
  });
});
