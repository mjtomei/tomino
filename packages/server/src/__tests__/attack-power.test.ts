import { describe, it, expect } from "vitest";
import { attackPowerForKOs, AttackPowerTracker } from "../attack-power.js";

describe("attackPowerForKOs", () => {
  it("returns 1.0x for 0 KOs", () => {
    expect(attackPowerForKOs(0)).toBe(1.0);
  });

  it("returns 1.25x for 1 KO", () => {
    expect(attackPowerForKOs(1)).toBe(1.25);
  });

  it("returns 1.5x for 2 KOs", () => {
    expect(attackPowerForKOs(2)).toBe(1.5);
  });

  it("returns 1.5x for 3 KOs (between thresholds)", () => {
    expect(attackPowerForKOs(3)).toBe(1.5);
  });

  it("returns 1.75x for 4 KOs", () => {
    expect(attackPowerForKOs(4)).toBe(1.75);
  });

  it("returns 1.75x for 5 KOs (between thresholds)", () => {
    expect(attackPowerForKOs(5)).toBe(1.75);
  });

  it("returns 2.0x for 6 KOs", () => {
    expect(attackPowerForKOs(6)).toBe(2.0);
  });

  it("returns 2.0x for 10+ KOs", () => {
    expect(attackPowerForKOs(10)).toBe(2.0);
  });
});

describe("AttackPowerTracker", () => {
  const PLAYERS = ["p1", "p2", "p3"];

  it("initializes all players at 1.0x", () => {
    const tracker = new AttackPowerTracker(PLAYERS);
    expect(tracker.getMultiplier("p1")).toBe(1.0);
    expect(tracker.getMultiplier("p2")).toBe(1.0);
    expect(tracker.getState("p1")).toEqual({ koCount: 0, multiplier: 1.0 });
  });

  it("returns 1.0x for unknown player", () => {
    const tracker = new AttackPowerTracker(PLAYERS);
    expect(tracker.getMultiplier("unknown")).toBe(1.0);
  });

  it("increases multiplier on KO at threshold", () => {
    const tracker = new AttackPowerTracker(PLAYERS);
    const result = tracker.recordKO("p1");
    expect(result).toEqual({ multiplier: 1.25, koCount: 1 });
    expect(tracker.getMultiplier("p1")).toBe(1.25);
  });

  it("returns null when KO does not change multiplier", () => {
    const tracker = new AttackPowerTracker(PLAYERS);
    tracker.recordKO("p1"); // 1 KO → 1.25x (change)
    // 2 KOs → 1.5x (change)
    const result2 = tracker.recordKO("p1");
    expect(result2).toEqual({ multiplier: 1.5, koCount: 2 });
    // 3 KOs → still 1.5x (no change)
    const result3 = tracker.recordKO("p1");
    expect(result3).toBeNull();
    expect(tracker.getMultiplier("p1")).toBe(1.5);
  });

  it("tracks KOs independently per player", () => {
    const tracker = new AttackPowerTracker(PLAYERS);
    tracker.recordKO("p1");
    tracker.recordKO("p1");
    tracker.recordKO("p2");
    expect(tracker.getMultiplier("p1")).toBe(1.5);
    expect(tracker.getMultiplier("p2")).toBe(1.25);
    expect(tracker.getMultiplier("p3")).toBe(1.0);
  });

  it("returns null for KO on unknown player", () => {
    const tracker = new AttackPowerTracker(PLAYERS);
    expect(tracker.recordKO("unknown")).toBeNull();
  });

  it("removePlayer cleans up state", () => {
    const tracker = new AttackPowerTracker(PLAYERS);
    tracker.recordKO("p1");
    tracker.removePlayer("p1");
    expect(tracker.getMultiplier("p1")).toBe(1.0); // default for unknown
    expect(tracker.recordKO("p1")).toBeNull();
  });

  it("reaches 2.0x after 6 KOs", () => {
    const tracker = new AttackPowerTracker(PLAYERS);
    for (let i = 0; i < 6; i++) {
      tracker.recordKO("p1");
    }
    expect(tracker.getMultiplier("p1")).toBe(2.0);
    expect(tracker.getState("p1")).toEqual({ koCount: 6, multiplier: 2.0 });
  });
});
