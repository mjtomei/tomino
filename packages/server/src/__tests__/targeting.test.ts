import { describe, it, expect } from "vitest";
import {
  randomStrategy,
  attackersStrategy,
  kosStrategy,
  manualStrategy,
  getStrategy,
} from "../targeting.js";
import type { TargetingContext } from "@tomino/shared";

const PLAYERS = ["p1", "p2", "p3", "p4"];

function makeContext(overrides: Partial<TargetingContext> = {}): TargetingContext {
  return {
    linesToSend: 4,
    rng: () => 0.0, // deterministic: always pick first
    ...overrides,
  };
}

describe("randomStrategy", () => {
  it("sends all lines to a single random opponent", () => {
    const result = randomStrategy.resolveTargets("p1", PLAYERS, makeContext());
    expect(result).toHaveLength(1);
    expect(result[0].playerId).not.toBe("p1");
    expect(result[0].lines).toBe(4);
  });

  it("excludes the sender", () => {
    const result = randomStrategy.resolveTargets("p1", PLAYERS, makeContext());
    expect(result.every((a) => a.playerId !== "p1")).toBe(true);
  });

  it("returns empty for no opponents", () => {
    const result = randomStrategy.resolveTargets("p1", ["p1"], makeContext());
    expect(result).toHaveLength(0);
  });

  it("returns empty for zero lines", () => {
    const result = randomStrategy.resolveTargets("p1", PLAYERS, makeContext({ linesToSend: 0 }));
    expect(result).toHaveLength(0);
  });

  it("picks different targets based on rng", () => {
    // rng=0 picks first opponent (p2)
    const r1 = randomStrategy.resolveTargets("p1", PLAYERS, makeContext({ rng: () => 0.0 }));
    expect(r1[0].playerId).toBe("p2");

    // rng=0.99 picks last opponent (p4)
    const r2 = randomStrategy.resolveTargets("p1", PLAYERS, makeContext({ rng: () => 0.99 }));
    expect(r2[0].playerId).toBe("p4");
  });
});

describe("attackersStrategy", () => {
  it("targets a player who is targeting the sender", () => {
    const ctx = makeContext({
      attackerGraph: { p2: "p1", p3: null, p4: null },
    });
    const result = attackersStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("p2");
    expect(result[0].lines).toBe(4);
  });

  it("picks randomly among multiple attackers", () => {
    const ctx = makeContext({
      attackerGraph: { p2: "p1", p3: "p1", p4: null },
      rng: () => 0.5, // picks second of the two attackers
    });
    const result = attackersStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(["p2", "p3"]).toContain(result[0].playerId);
  });

  it("falls back to random when no one targets sender", () => {
    const ctx = makeContext({
      attackerGraph: { p2: "p3", p3: null, p4: null },
    });
    const result = attackersStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).not.toBe("p1");
  });

  it("falls back to random when no attacker graph", () => {
    const result = attackersStrategy.resolveTargets("p1", PLAYERS, makeContext());
    expect(result).toHaveLength(1);
    expect(result[0].lines).toBe(4);
  });
});

describe("kosStrategy", () => {
  it("targets the opponent with the highest board", () => {
    const ctx = makeContext({
      boardHeights: { p1: 5, p2: 10, p3: 18, p4: 3 },
    });
    const result = kosStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("p3");
    expect(result[0].lines).toBe(4);
  });

  it("picks randomly among tied opponents", () => {
    const ctx = makeContext({
      boardHeights: { p1: 5, p2: 15, p3: 15, p4: 3 },
      rng: () => 0.0,
    });
    const result = kosStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(["p2", "p3"]).toContain(result[0].playerId);
  });

  it("falls back to random when no board heights available", () => {
    const result = kosStrategy.resolveTargets("p1", PLAYERS, makeContext());
    expect(result).toHaveLength(1);
    expect(result[0].playerId).not.toBe("p1");
  });

  it("excludes sender from height comparison", () => {
    // Sender has highest board but should not be targeted
    const ctx = makeContext({
      boardHeights: { p1: 20, p2: 5, p3: 3, p4: 1 },
    });
    const result = kosStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).not.toBe("p1");
    expect(result[0].playerId).toBe("p2"); // highest among opponents
  });
});

describe("manualStrategy", () => {
  it("targets the manually chosen player", () => {
    const ctx = makeContext({ manualTarget: "p3" });
    const result = manualStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("p3");
    expect(result[0].lines).toBe(4);
  });

  it("falls back to random when manual target is dead/absent", () => {
    const ctx = makeContext({ manualTarget: "p-dead" });
    const result = manualStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).not.toBe("p1");
  });

  it("falls back to random when no manual target set", () => {
    const ctx = makeContext({ manualTarget: null });
    const result = manualStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).not.toBe("p1");
  });

  it("does not target self even if manualTarget is sender", () => {
    // manualTarget=p1 but p1 is excluded from opponents
    const ctx = makeContext({ manualTarget: "p1" });
    const result = manualStrategy.resolveTargets("p1", PLAYERS, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].playerId).not.toBe("p1");
  });
});

describe("getStrategy", () => {
  it("returns the correct strategy for each type", () => {
    expect(getStrategy("random")).toBe(randomStrategy);
    expect(getStrategy("attackers")).toBe(attackersStrategy);
    expect(getStrategy("kos")).toBe(kosStrategy);
    expect(getStrategy("manual")).toBe(manualStrategy);
  });
});
