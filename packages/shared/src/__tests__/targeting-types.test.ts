import { describe, it, expect } from "vitest";
import { evenSplitStrategy } from "../targeting-types.js";
import type { TargetingStrategy } from "../targeting-types.js";

describe("evenSplitStrategy", () => {
  it("excludes the sender from opponents", () => {
    const out = evenSplitStrategy.resolveTargets(
      "p1",
      ["p1", "p2"],
      { linesToSend: 4 },
    );
    expect(out).toEqual([{ playerId: "p2", lines: 4 }]);
  });

  it("splits evenly across 2 opponents", () => {
    const out = evenSplitStrategy.resolveTargets(
      "p1",
      ["p1", "p2", "p3"],
      { linesToSend: 4 },
    );
    expect(out).toEqual([
      { playerId: "p2", lines: 2 },
      { playerId: "p3", lines: 2 },
    ]);
  });

  it("distributes remainder in deterministic order (3 opponents)", () => {
    const out = evenSplitStrategy.resolveTargets(
      "p1",
      ["p1", "p2", "p3", "p4"],
      { linesToSend: 4 },
    );
    // 4 / 3 = 1 base, remainder 1 → p2 gets extra
    expect(out).toEqual([
      { playerId: "p2", lines: 2 },
      { playerId: "p3", lines: 1 },
      { playerId: "p4", lines: 1 },
    ]);
  });

  it("gives each opponent one line when linesToSend < n", () => {
    const out = evenSplitStrategy.resolveTargets(
      "p1",
      ["p1", "p2", "p3", "p4"],
      { linesToSend: 2 },
    );
    expect(out).toEqual([
      { playerId: "p2", lines: 1 },
      { playerId: "p3", lines: 1 },
    ]);
  });

  it("returns empty with no opponents", () => {
    const out = evenSplitStrategy.resolveTargets("p1", ["p1"], {
      linesToSend: 4,
    });
    expect(out).toEqual([]);
  });

  it("returns empty when linesToSend is 0", () => {
    const out = evenSplitStrategy.resolveTargets(
      "p1",
      ["p1", "p2", "p3"],
      { linesToSend: 0 },
    );
    expect(out).toEqual([]);
  });

  it("accepts a stub strategy via the TargetingStrategy interface", () => {
    const stub: TargetingStrategy = {
      resolveTargets: (_sender, _players, ctx) => [
        { playerId: "target", lines: ctx.linesToSend },
      ],
    };
    const out = stub.resolveTargets("p1", ["p1", "p2"], { linesToSend: 3 });
    expect(out).toEqual([{ playerId: "target", lines: 3 }]);
  });
});
