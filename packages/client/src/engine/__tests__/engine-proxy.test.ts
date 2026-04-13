import { describe, it, expect } from "vitest";
import { modernRuleSet } from "@tomino/shared";
import { EngineProxy } from "../engine-proxy";

const SEED = 12345;

describe("EngineProxy", () => {
  it("produces a valid initial snapshot", () => {
    const proxy = new EngineProxy({ seed: SEED, ruleSet: modernRuleSet() });
    const snap = proxy.getSnapshot();
    expect(snap.tick).toBe(0);
    expect(snap.activePiece).not.toBeNull();
    expect(snap.nextQueue.length).toBeGreaterThan(0);
    expect(snap.isGameOver).toBe(false);
  });

  it("is deterministic given the same seed", () => {
    const a = new EngineProxy({ seed: SEED, ruleSet: modernRuleSet() });
    const b = new EngineProxy({ seed: SEED, ruleSet: modernRuleSet() });
    for (const action of ["moveLeft", "moveRight", "rotateCW"] as const) {
      a.applyInput(action);
      b.applyInput(action);
    }
    const snapA = a.getSnapshot();
    const snapB = b.getSnapshot();
    expect(snapA.activePiece).toEqual(snapB.activePiece);
    expect(snapA.nextQueue).toEqual(snapB.nextQueue);
  });

  it("moveLeft decreases active piece x", () => {
    const proxy = new EngineProxy({ seed: SEED, ruleSet: modernRuleSet() });
    const x0 = proxy.getSnapshot().activePiece!.x;
    proxy.applyInput("moveLeft");
    expect(proxy.getSnapshot().activePiece!.x).toBe(x0 - 1);
  });

  it("reset restores fresh engine state", () => {
    const proxy = new EngineProxy({ seed: SEED, ruleSet: modernRuleSet() });
    const initial = proxy.getSnapshot();
    proxy.applyInput("moveLeft");
    proxy.applyInput("moveLeft");
    proxy.reset();
    const afterReset = proxy.getSnapshot();
    expect(afterReset.activePiece).toEqual(initial.activePiece);
    expect(proxy.currentTick).toBe(0);
  });

  it("advanceTick increments tick counter", () => {
    const proxy = new EngineProxy({ seed: SEED, ruleSet: modernRuleSet() });
    proxy.advanceTick(16);
    proxy.advanceTick(16);
    expect(proxy.currentTick).toBe(2);
    expect(proxy.getSnapshot().tick).toBe(2);
  });
});
