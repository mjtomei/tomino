import { describe, it, expect, beforeEach } from "vitest";
import { loadPlayerName, savePlayerName, makePlayerInfo } from "../net/lobby-client";

describe("lobby-client", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("player name persistence", () => {
    it("returns empty string when no name is stored", () => {
      expect(loadPlayerName()).toBe("");
    });

    it("saves and loads a player name", () => {
      savePlayerName("Alice");
      expect(loadPlayerName()).toBe("Alice");
    });

    it("overwrites existing name", () => {
      savePlayerName("Alice");
      savePlayerName("Bob");
      expect(loadPlayerName()).toBe("Bob");
    });
  });

  describe("makePlayerInfo", () => {
    it("returns PlayerInfo with given name", () => {
      const info = makePlayerInfo("Alice");
      expect(info.name).toBe("Alice");
      expect(info.id).toBeTruthy();
    });

    it("returns stable ID within the same session", () => {
      const info1 = makePlayerInfo("Alice");
      const info2 = makePlayerInfo("Bob");
      expect(info1.id).toBe(info2.id);
    });
  });
});
