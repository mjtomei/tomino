import { describe, it, expect } from "vitest";
import {
  computeMenuAtmosphere,
  computeMenuEntryEvents,
  computeWaitingRoomIntensity,
} from "../menu-atmosphere.js";

describe("menu-atmosphere", () => {
  describe("computeWaitingRoomIntensity", () => {
    it("returns the calm floor for empty or single-player rooms", () => {
      expect(computeWaitingRoomIntensity(0, 4)).toBeCloseTo(0.15);
      expect(computeWaitingRoomIntensity(1, 4)).toBeCloseTo(0.15);
    });

    it("grows monotonically with player count", () => {
      const a = computeWaitingRoomIntensity(2, 4);
      const b = computeWaitingRoomIntensity(3, 4);
      const c = computeWaitingRoomIntensity(4, 4);
      expect(a).toBeGreaterThan(0.15);
      expect(b).toBeGreaterThan(a);
      expect(c).toBeGreaterThan(b);
      expect(c).toBeCloseTo(0.45, 5);
    });

    it("clamps player count above max to the max value", () => {
      expect(computeWaitingRoomIntensity(99, 4)).toBeCloseTo(0.45, 5);
    });

    it("handles max=1 without dividing by zero", () => {
      expect(computeWaitingRoomIntensity(1, 1)).toBeCloseTo(0.15);
      expect(computeWaitingRoomIntensity(0, 1)).toBeCloseTo(0.15);
    });
  });

  describe("computeMenuAtmosphere", () => {
    it("returns calm state for menu/name-input/joining views", () => {
      for (const view of ["menu", "name-input", "joining"] as const) {
        const state = computeMenuAtmosphere({ view });
        expect(state).not.toBeNull();
        expect(state!.intensity).toBeCloseTo(0.15);
        expect(state!.danger).toBe(0);
      }
    });

    it("returns null for countdown and playing views", () => {
      expect(computeMenuAtmosphere({ view: "playing" })).toBeNull();
      expect(computeMenuAtmosphere({ view: "countdown" })).toBeNull();
    });

    it("scales waiting room intensity with player count", () => {
      const a = computeMenuAtmosphere({
        view: "waiting",
        playerCount: 1,
        maxPlayers: 4,
      });
      const b = computeMenuAtmosphere({
        view: "waiting",
        playerCount: 4,
        maxPlayers: 4,
      });
      expect(a!.intensity).toBeLessThan(b!.intensity);
      expect(a!.danger).toBe(0);
      expect(b!.momentum).toBeGreaterThan(a!.momentum);
    });

    it("gives the winner a triumphant results state", () => {
      const win = computeMenuAtmosphere({
        view: "results",
        results: { winnerId: "p1", localPlayerId: "p1" },
      });
      const lose = computeMenuAtmosphere({
        view: "results",
        results: { winnerId: "p1", localPlayerId: "p2" },
      });
      expect(win!.momentum).toBeGreaterThan(lose!.momentum);
      expect(win!.intensity).toBeGreaterThan(lose!.intensity);
      expect(win!.danger).toBe(0);
    });
  });

  describe("computeMenuEntryEvents", () => {
    it("fires a quad event for the winner on results entry", () => {
      const events = computeMenuEntryEvents({
        view: "results",
        results: { winnerId: "p1", localPlayerId: "p1" },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("quad");
    });

    it("emits no events for non-winner on results", () => {
      const events = computeMenuEntryEvents({
        view: "results",
        results: { winnerId: "p1", localPlayerId: "p2" },
      });
      expect(events).toHaveLength(0);
    });

    it("emits no events for non-results views", () => {
      expect(computeMenuEntryEvents({ view: "menu" })).toHaveLength(0);
      expect(computeMenuEntryEvents({ view: "waiting" })).toHaveLength(0);
    });
  });
});
