import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonSkillStore } from "../skill-store.js";
import type { PlayerProfile, MatchResult } from "@tomino/shared";

function makePlayer(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    username: "alice",
    rating: 1500,
    ratingDeviation: 350,
    volatility: 0.06,
    gamesPlayed: 0,
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    gameId: "g1",
    winner: "alice",
    loser: "bob",
    metrics: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("JsonSkillStore", () => {
  let tmpDir: string;
  let filePath: string;
  let store: JsonSkillStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "skill-store-test-"));
    filePath = join(tmpDir, "ratings.json");
    store = new JsonSkillStore(filePath);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("file creation on first access", () => {
    it("auto-creates the data file on first write", async () => {
      const player = makePlayer();
      await store.upsertPlayer(player);

      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw);
      expect(data.players["alice"]).toEqual(player);
    });

    it("creates parent directories if needed", async () => {
      const nestedPath = join(tmpDir, "nested", "deep", "ratings.json");
      const nestedStore = new JsonSkillStore(nestedPath);

      await nestedStore.upsertPlayer(makePlayer());
      const raw = await readFile(nestedPath, "utf-8");
      expect(JSON.parse(raw).players["alice"]).toBeDefined();
    });
  });

  describe("getPlayer", () => {
    it("returns null for unknown username", async () => {
      const result = await store.getPlayer("nobody");
      expect(result).toBeNull();
    });

    it("returns the player after upsert", async () => {
      const player = makePlayer();
      await store.upsertPlayer(player);
      const result = await store.getPlayer("alice");
      expect(result).toEqual(player);
    });
  });

  describe("upsertPlayer", () => {
    it("inserts a new player", async () => {
      const player = makePlayer();
      await store.upsertPlayer(player);
      expect(await store.getPlayer("alice")).toEqual(player);
    });

    it("updates an existing player", async () => {
      await store.upsertPlayer(makePlayer());
      const updated = makePlayer({ rating: 1600, gamesPlayed: 5 });
      await store.upsertPlayer(updated);

      const result = await store.getPlayer("alice");
      expect(result?.rating).toBe(1600);
      expect(result?.gamesPlayed).toBe(5);
    });
  });

  describe("getLeaderboard", () => {
    it("returns empty array when no players exist", async () => {
      expect(await store.getLeaderboard()).toEqual([]);
    });

    it("returns players sorted by rating descending", async () => {
      await store.upsertPlayer(makePlayer({ username: "low", rating: 1200 }));
      await store.upsertPlayer(makePlayer({ username: "high", rating: 1800 }));
      await store.upsertPlayer(makePlayer({ username: "mid", rating: 1500 }));

      const board = await store.getLeaderboard();
      expect(board.map((p) => p.username)).toEqual(["high", "mid", "low"]);
    });

    it("breaks ties by games played then username", async () => {
      await store.upsertPlayer(
        makePlayer({ username: "bob", rating: 1500, gamesPlayed: 10 }),
      );
      await store.upsertPlayer(
        makePlayer({ username: "alice", rating: 1500, gamesPlayed: 10 }),
      );
      await store.upsertPlayer(
        makePlayer({ username: "charlie", rating: 1500, gamesPlayed: 20 }),
      );

      const board = await store.getLeaderboard();
      // charlie has most games, then alice/bob alphabetically
      expect(board.map((p) => p.username)).toEqual([
        "charlie",
        "alice",
        "bob",
      ]);
    });
  });

  describe("saveMatchResult / getMatchHistory", () => {
    it("returns empty array for user with no matches", async () => {
      expect(await store.getMatchHistory("alice", 10)).toEqual([]);
    });

    it("appends and retrieves match results", async () => {
      const match = makeMatch();
      await store.saveMatchResult(match);

      const history = await store.getMatchHistory("alice", 10);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(match);
    });

    it("returns matches where user is winner or loser", async () => {
      await store.saveMatchResult(
        makeMatch({ gameId: "g1", winner: "alice", loser: "bob" }),
      );
      await store.saveMatchResult(
        makeMatch({ gameId: "g2", winner: "charlie", loser: "alice" }),
      );
      await store.saveMatchResult(
        makeMatch({ gameId: "g3", winner: "bob", loser: "charlie" }),
      );

      const history = await store.getMatchHistory("alice", 10);
      expect(history).toHaveLength(2);
      expect(history.map((m) => m.gameId).sort()).toEqual(["g1", "g2"]);
    });

    it("returns most recent matches first", async () => {
      await store.saveMatchResult(makeMatch({ gameId: "g1", timestamp: 100 }));
      await store.saveMatchResult(makeMatch({ gameId: "g2", timestamp: 200 }));
      await store.saveMatchResult(makeMatch({ gameId: "g3", timestamp: 300 }));

      const history = await store.getMatchHistory("alice", 10);
      expect(history.map((m) => m.gameId)).toEqual(["g3", "g2", "g1"]);
    });

    it("respects the limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await store.saveMatchResult(
          makeMatch({ gameId: `g${i}`, timestamp: i }),
        );
      }

      const history = await store.getMatchHistory("alice", 3);
      expect(history).toHaveLength(3);
      // Most recent 3
      expect(history.map((m) => m.gameId)).toEqual(["g9", "g8", "g7"]);
    });

    it("returns empty for limit <= 0", async () => {
      await store.saveMatchResult(makeMatch());
      expect(await store.getMatchHistory("alice", 0)).toEqual([]);
      expect(await store.getMatchHistory("alice", -1)).toEqual([]);
    });
  });

  describe("concurrent write safety", () => {
    it("handles multiple simultaneous upserts without data loss", async () => {
      const usernames = Array.from({ length: 20 }, (_, i) => `player${i}`);

      // Fire all upserts concurrently
      await Promise.all(
        usernames.map((username) =>
          store.upsertPlayer(makePlayer({ username, rating: 1500 })),
        ),
      );

      const board = await store.getLeaderboard();
      expect(board).toHaveLength(20);

      // Every player should be present
      const names = new Set(board.map((p) => p.username));
      for (const username of usernames) {
        expect(names.has(username)).toBe(true);
      }
    });

    it("handles simultaneous match saves without data loss", async () => {
      const matches = Array.from({ length: 10 }, (_, i) =>
        makeMatch({ gameId: `g${i}`, timestamp: i }),
      );

      await Promise.all(matches.map((m) => store.saveMatchResult(m)));

      const history = await store.getMatchHistory("alice", 20);
      expect(history).toHaveLength(10);
    });
  });

  describe("corrupted JSON file", () => {
    it("throws a descriptive error on invalid JSON", async () => {
      const { writeFile: wf } = await import("node:fs/promises");
      await wf(filePath, "not valid json{{{", "utf-8");

      await expect(store.getPlayer("alice")).rejects.toThrow(SyntaxError);
    });
  });

  describe("atomic write", () => {
    it("writes valid JSON that can be re-read", async () => {
      const player = makePlayer();
      await store.upsertPlayer(player);

      // Create a second store instance reading the same file
      const store2 = new JsonSkillStore(filePath);
      const result = await store2.getPlayer("alice");
      expect(result).toEqual(player);
    });

    it("does not leave temp files behind", async () => {
      await store.upsertPlayer(makePlayer());

      const { readdir } = await import("node:fs/promises");
      const files = await readdir(tmpDir);
      // Only the ratings.json file should exist, no .tmp files
      expect(files.filter((f) => f.endsWith(".tmp"))).toEqual([]);
    });
  });
});
