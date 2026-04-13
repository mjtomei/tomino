import { describe, it, expect } from "vitest";
import type { ActivePiece } from "@tomino/shared";
import {
  PieceAnimator,
  SPAWN_MS,
  MOVE_MS,
  ROTATE_MS,
} from "../ui/piece-animation.js";

function makePiece(over: Partial<ActivePiece> = {}): ActivePiece {
  return {
    type: "T",
    row: 20,
    col: 4,
    rotation: 0,
    shape: [
      [false, true, false],
      [true, true, true],
      [false, false, false],
    ],
    ...over,
  };
}

describe("PieceAnimator", () => {
  it("fades in a newly spawned piece over SPAWN_MS", () => {
    const a = new PieceAnimator();
    const p = makePiece();
    const r0 = a.update(p, 0);
    expect(r0.alpha).toBeCloseTo(0, 5);
    expect(r0.animating).toBe(true);

    const rMid = a.update(p, SPAWN_MS / 2);
    expect(rMid.alpha).toBeCloseTo(0.5, 2);

    const rEnd = a.update(p, SPAWN_MS);
    expect(rEnd.alpha).toBeCloseTo(1, 5);
  });

  it("treats a type change as a fresh spawn (re-fades in)", () => {
    const a = new PieceAnimator();
    a.update(makePiece({ type: "T" }), 0);
    a.update(makePiece({ type: "T" }), SPAWN_MS); // fully in

    const r = a.update(makePiece({ type: "L" }), SPAWN_MS + 10);
    expect(r.alpha).toBeCloseTo(0, 5);
  });

  it("tweens lateral movement over MOVE_MS", () => {
    const a = new PieceAnimator();
    a.update(makePiece({ col: 4 }), 0);
    a.update(makePiece({ col: 4 }), SPAWN_MS); // rest

    const t0 = SPAWN_MS;
    a.update(makePiece({ col: 5 }), t0); // move right 1
    const mid = a.update(makePiece({ col: 5 }), t0 + MOVE_MS / 2);
    expect(mid.renderCol).toBeCloseTo(4.5, 2);
    expect(mid.animating).toBe(true);

    const end = a.update(makePiece({ col: 5 }), t0 + MOVE_MS);
    expect(end.renderCol).toBeCloseTo(5, 5);
  });

  it("at rest, rendered position equals logical position exactly", () => {
    const a = new PieceAnimator();
    const p = makePiece({ row: 10, col: 3 });
    a.update(p, 0);
    const r = a.update(p, SPAWN_MS + MOVE_MS + ROTATE_MS + 100);
    expect(r.renderRow).toBe(10);
    expect(r.renderCol).toBe(3);
    expect(r.alpha).toBe(1);
    expect(r.rotationOffset).toBe(0);
    expect(r.animating).toBe(false);
  });

  it("compresses under rapid inputs: never lags more than 1 cell", () => {
    const a = new PieceAnimator();
    a.update(makePiece({ col: 0 }), 0);
    a.update(makePiece({ col: 0 }), SPAWN_MS); // past spawn

    // Rapid moves — one every 10ms, 10 moves total, each +1 col.
    let logical = 0;
    let t = SPAWN_MS;
    for (let i = 1; i <= 10; i++) {
      logical = i;
      t += 10;
      const r = a.update(makePiece({ col: logical }), t);
      expect(Math.abs(r.renderCol - logical)).toBeLessThanOrEqual(1.0001);
    }
  });

  it("snaps on hard-drop-sized row jumps (> 2 cells)", () => {
    const a = new PieceAnimator();
    a.update(makePiece({ row: 5 }), 0);
    a.update(makePiece({ row: 5 }), SPAWN_MS);

    const t = SPAWN_MS + 1;
    // Immediately query after big jump — render row should == logical.
    const r = a.update(makePiece({ row: 15 }), t);
    expect(r.renderRow).toBe(15);
  });

  it("tweens single-row soft-drop movement", () => {
    const a = new PieceAnimator();
    a.update(makePiece({ row: 5 }), 0);
    a.update(makePiece({ row: 5 }), SPAWN_MS);

    const t = SPAWN_MS;
    a.update(makePiece({ row: 6 }), t);
    const mid = a.update(makePiece({ row: 6 }), t + MOVE_MS / 2);
    expect(mid.renderRow).toBeCloseTo(5.5, 2);
  });

  it("animates rotation with a nonzero offset that eases to 0", () => {
    const a = new PieceAnimator();
    a.update(makePiece({ rotation: 0 }), 0);
    a.update(makePiece({ rotation: 0 }), SPAWN_MS);

    const t = SPAWN_MS;
    const r0 = a.update(makePiece({ rotation: 1 }), t);
    // CW rotation: initial offset is -PI/2, easing to 0.
    expect(r0.rotationOffset).toBeCloseTo(-Math.PI / 2, 5);

    const mid = a.update(makePiece({ rotation: 1 }), t + ROTATE_MS / 2);
    expect(Math.abs(mid.rotationOffset)).toBeGreaterThan(0);
    expect(Math.abs(mid.rotationOffset)).toBeLessThan(Math.PI / 2);

    const end = a.update(makePiece({ rotation: 1 }), t + ROTATE_MS);
    expect(end.rotationOffset).toBeCloseTo(0, 5);
  });

  it("resets when the piece becomes null", () => {
    const a = new PieceAnimator();
    a.update(makePiece(), 0);
    a.update(null, 10);
    // After null, the next piece of the same type spawns fresh (fades in).
    const r = a.update(makePiece(), 20);
    expect(r.alpha).toBeCloseTo(0, 5);
  });
});
