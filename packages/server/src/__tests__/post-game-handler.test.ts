import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  MatchResult,
  PerformanceMetrics,
  PlayerProfile,
  RoomId,
  ServerMessage,
  SkillStore,
} from "@tetris/shared";
import { handlePostGame } from "../post-game-handler.js";
import type { GameEndResult } from "../game-session.js";
import { GLICKO_CONFIG } from "../rating-config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    username: "player",
    rating: GLICKO_CONFIG.INITIAL_RATING,
    ratingDeviation: GLICKO_CONFIG.INITIAL_RD,
    volatility: GLICKO_CONFIG.INITIAL_VOLATILITY,
    gamesPlayed: 0,
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    apm: 60,
    pps: 1.5,
    linesCleared: 40,
    tSpins: 3,
    maxCombo: 5,
    ...overrides,
  };
}

function createMockStore(profiles: Map<string, PlayerProfile> = new Map()): SkillStore & {
  savedPlayers: PlayerProfile[];
  savedMatches: MatchResult[];
} {
  const savedPlayers: PlayerProfile[] = [];
  const savedMatches: MatchResult[] = [];

  return {
    savedPlayers,
    savedMatches,
    getPlayer: vi.fn(async (username: string) => profiles.get(username) ?? null),
    upsertPlayer: vi.fn(async (profile: PlayerProfile) => {
      savedPlayers.push({ ...profile });
      profiles.set(profile.username, { ...profile });
    }),
    getLeaderboard: vi.fn(async () => []),
    getMatchHistory: vi.fn(async () => []),
    saveMatchResult: vi.fn(async (result: MatchResult) => {
      savedMatches.push({ ...result });
    }),
  };
}

function make1v1Result(overrides: Partial<GameEndResult> = {}): GameEndResult {
  return {
    roomId: "room-1",
    winnerId: "p1",
    playerNames: { p1: "Alice", p2: "Bob" },
    placements: { p1: 1, p2: 2 },
    metrics: {
      p1: makeMetrics({ apm: 80 }),
      p2: makeMetrics({ apm: 50 }),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handlePostGame", () => {
  let store: ReturnType<typeof createMockStore>;
  let broadcasts: ServerMessage[];
  let broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void;

  beforeEach(() => {
    store = createMockStore();
    broadcasts = [];
    broadcastToRoom = (_roomId, msg) => broadcasts.push(msg);
  });

  // -----------------------------------------------------------------------
  // 1v1 rating update after game end
  // -----------------------------------------------------------------------

  describe("1v1 rating update", () => {
    it("updates both players' ratings after a game", async () => {
      const result = make1v1Result();
      await handlePostGame(result, store, broadcastToRoom);

      expect(store.savedPlayers).toHaveLength(2);
      const winner = store.savedPlayers.find((p) => p.username === "Alice")!;
      const loser = store.savedPlayers.find((p) => p.username === "Bob")!;

      expect(winner.rating).toBeGreaterThan(GLICKO_CONFIG.INITIAL_RATING);
      expect(loser.rating).toBeLessThan(GLICKO_CONFIG.INITIAL_RATING);
      expect(winner.gamesPlayed).toBe(1);
      expect(loser.gamesPlayed).toBe(1);
    });

    it("creates one match result for 1v1", async () => {
      const result = make1v1Result();
      await handlePostGame(result, store, broadcastToRoom);

      expect(store.savedMatches).toHaveLength(1);
      const match = store.savedMatches[0]!;
      expect(match.winner).toBe("Alice");
      expect(match.loser).toBe("Bob");
    });

    it("uses existing profiles when available", async () => {
      const existingProfiles = new Map([
        ["Alice", makeProfile({ username: "Alice", rating: 1600, gamesPlayed: 10 })],
        ["Bob", makeProfile({ username: "Bob", rating: 1400, gamesPlayed: 8 })],
      ]);
      store = createMockStore(existingProfiles);

      const result = make1v1Result();
      await handlePostGame(result, store, broadcastToRoom);

      const winner = store.savedPlayers.find((p) => p.username === "Alice")!;
      const loser = store.savedPlayers.find((p) => p.username === "Bob")!;

      // Winner was already higher rated — should still gain
      expect(winner.rating).toBeGreaterThan(1600);
      expect(loser.rating).toBeLessThan(1400);
      expect(winner.gamesPlayed).toBe(11);
      expect(loser.gamesPlayed).toBe(9);
    });

    it("creates default profiles for new players", async () => {
      const result = make1v1Result();
      await handlePostGame(result, store, broadcastToRoom);

      // getPlayer was called for both
      expect(store.getPlayer).toHaveBeenCalledWith("Alice");
      expect(store.getPlayer).toHaveBeenCalledWith("Bob");

      // Profiles were created from defaults
      const winner = store.savedPlayers.find((p) => p.username === "Alice")!;
      expect(winner.gamesPlayed).toBe(1); // started at 0
    });
  });

  // -----------------------------------------------------------------------
  // 3+ player pairwise updates
  // -----------------------------------------------------------------------

  describe("3+ player pairwise updates", () => {
    it("creates one match result per loser in a 3-player game", async () => {
      const result: GameEndResult = {
        roomId: "room-1",
        winnerId: "p1",
        playerNames: { p1: "Alice", p2: "Bob", p3: "Carol" },
        placements: { p1: 1, p2: 2, p3: 3 },
        metrics: {
          p1: makeMetrics(),
          p2: makeMetrics(),
          p3: makeMetrics(),
        },
      };

      await handlePostGame(result, store, broadcastToRoom);

      // 2 match results: winner vs each loser
      expect(store.savedMatches).toHaveLength(2);
      expect(store.savedMatches.every((m) => m.winner === "Alice")).toBe(true);
      const losers = store.savedMatches.map((m) => m.loser).sort();
      expect(losers).toEqual(["Bob", "Carol"]);
    });

    it("shares the same gameId across all match results", async () => {
      const result: GameEndResult = {
        roomId: "room-1",
        winnerId: "p1",
        playerNames: { p1: "Alice", p2: "Bob", p3: "Carol" },
        placements: { p1: 1, p2: 2, p3: 3 },
        metrics: {
          p1: makeMetrics(),
          p2: makeMetrics(),
          p3: makeMetrics(),
        },
      };

      await handlePostGame(result, store, broadcastToRoom);

      const gameIds = new Set(store.savedMatches.map((m) => m.gameId));
      expect(gameIds.size).toBe(1);
    });

    it("accumulates winner rating across pairwise matches", async () => {
      const result: GameEndResult = {
        roomId: "room-1",
        winnerId: "p1",
        playerNames: { p1: "Alice", p2: "Bob", p3: "Carol" },
        placements: { p1: 1, p2: 2, p3: 3 },
        metrics: {
          p1: makeMetrics(),
          p2: makeMetrics(),
          p3: makeMetrics(),
        },
      };

      await handlePostGame(result, store, broadcastToRoom);

      const winner = store.savedPlayers.find((p) => p.username === "Alice")!;
      // Winner played 2 rated matches (one per loser)
      expect(winner.gamesPlayed).toBe(2);
      // Winner gained from both matches
      expect(winner.rating).toBeGreaterThan(GLICKO_CONFIG.INITIAL_RATING);
    });

    it("updates each loser independently", async () => {
      const profiles = new Map([
        ["Alice", makeProfile({ username: "Alice" })],
        ["Bob", makeProfile({ username: "Bob", rating: 1600 })],
        ["Carol", makeProfile({ username: "Carol", rating: 1300 })],
      ]);
      store = createMockStore(profiles);

      const result: GameEndResult = {
        roomId: "room-1",
        winnerId: "p1",
        playerNames: { p1: "Alice", p2: "Bob", p3: "Carol" },
        placements: { p1: 1, p2: 2, p3: 3 },
        metrics: {
          p1: makeMetrics(),
          p2: makeMetrics(),
          p3: makeMetrics(),
        },
      };

      await handlePostGame(result, store, broadcastToRoom);

      // Both losers should lose rating (each played 1 rated match)
      const bob = store.savedPlayers.find((p) => p.username === "Bob")!;
      const carol = store.savedPlayers.find((p) => p.username === "Carol")!;
      expect(bob.rating).toBeLessThan(1600);
      expect(carol.rating).toBeLessThan(1300);
      expect(bob.gamesPlayed).toBe(1);
      expect(carol.gamesPlayed).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Disconnect counts as loss
  // -----------------------------------------------------------------------

  describe("disconnect counts as loss", () => {
    it("disconnected player appears in placements and gets rated as loser", async () => {
      // In a real game, the disconnected player would have been eliminated
      // via forfeitPlayer → eliminatePlayer and would appear in placements.
      // The post-game handler just sees the final placements.
      const result = make1v1Result();
      await handlePostGame(result, store, broadcastToRoom);

      const loser = store.savedPlayers.find((p) => p.username === "Bob")!;
      expect(loser.rating).toBeLessThan(GLICKO_CONFIG.INITIAL_RATING);
    });
  });

  // -----------------------------------------------------------------------
  // Metrics snapshot stored with match result
  // -----------------------------------------------------------------------

  describe("metrics snapshot stored with match result", () => {
    it("includes performance metrics in match results keyed by username", async () => {
      const result = make1v1Result({
        metrics: {
          p1: makeMetrics({ apm: 120, pps: 2.5 }),
          p2: makeMetrics({ apm: 45, pps: 1.0 }),
        },
      });

      await handlePostGame(result, store, broadcastToRoom);

      const match = store.savedMatches[0]!;
      expect(match.metrics["Alice"]).toEqual(
        expect.objectContaining({ apm: 120, pps: 2.5 }),
      );
      expect(match.metrics["Bob"]).toEqual(
        expect.objectContaining({ apm: 45, pps: 1.0 }),
      );
    });

    it("includes rating changes in match results", async () => {
      const result = make1v1Result();
      await handlePostGame(result, store, broadcastToRoom);

      const match = store.savedMatches[0]!;
      expect(match.ratingChanges).toBeDefined();
      expect(match.ratingChanges!["Alice"]).toBeDefined();
      expect(match.ratingChanges!["Bob"]).toBeDefined();
      expect(match.ratingChanges!["Alice"]!.before).toBe(GLICKO_CONFIG.INITIAL_RATING);
      expect(match.ratingChanges!["Alice"]!.after).toBeGreaterThan(GLICKO_CONFIG.INITIAL_RATING);
      expect(match.ratingChanges!["Bob"]!.before).toBe(GLICKO_CONFIG.INITIAL_RATING);
      expect(match.ratingChanges!["Bob"]!.after).toBeLessThan(GLICKO_CONFIG.INITIAL_RATING);
    });
  });

  // -----------------------------------------------------------------------
  // Rating broadcast message format
  // -----------------------------------------------------------------------

  describe("rating broadcast message format", () => {
    it("broadcasts a ratingUpdate message with per-player changes", async () => {
      const result = make1v1Result();
      await handlePostGame(result, store, broadcastToRoom);

      expect(broadcasts).toHaveLength(1);
      const msg = broadcasts[0]!;
      expect(msg).toMatchObject({
        type: "ratingUpdate",
        roomId: "room-1",
      });

      // Type narrow and check changes
      if (msg.type !== "ratingUpdate") throw new Error("unexpected type");
      expect(msg.changes["p1"]).toEqual(
        expect.objectContaining({
          username: "Alice",
          before: GLICKO_CONFIG.INITIAL_RATING,
        }),
      );
      expect(msg.changes["p1"]!.after).toBeGreaterThan(GLICKO_CONFIG.INITIAL_RATING);

      expect(msg.changes["p2"]).toEqual(
        expect.objectContaining({
          username: "Bob",
          before: GLICKO_CONFIG.INITIAL_RATING,
        }),
      );
      expect(msg.changes["p2"]!.after).toBeLessThan(GLICKO_CONFIG.INITIAL_RATING);
    });

    it("includes all players in 3+ player broadcasts", async () => {
      const result: GameEndResult = {
        roomId: "room-1",
        winnerId: "p1",
        playerNames: { p1: "Alice", p2: "Bob", p3: "Carol" },
        placements: { p1: 1, p2: 2, p3: 3 },
        metrics: {
          p1: makeMetrics(),
          p2: makeMetrics(),
          p3: makeMetrics(),
        },
      };

      await handlePostGame(result, store, broadcastToRoom);

      expect(broadcasts).toHaveLength(1);
      const msg = broadcasts[0]!;
      if (msg.type !== "ratingUpdate") throw new Error("unexpected type");
      expect(Object.keys(msg.changes).sort()).toEqual(["p1", "p2", "p3"]);
    });
  });

  // -----------------------------------------------------------------------
  // No update when handicap is disabled (skipped for solo / < 2 players)
  // -----------------------------------------------------------------------

  describe("no update for solo games", () => {
    it("skips rating updates when there is only 1 player", async () => {
      const result: GameEndResult = {
        roomId: "room-1",
        winnerId: "p1",
        playerNames: { p1: "Alice" },
        placements: { p1: 1 },
        metrics: { p1: makeMetrics() },
      };

      await handlePostGame(result, store, broadcastToRoom);

      expect(store.savedPlayers).toHaveLength(0);
      expect(store.savedMatches).toHaveLength(0);
      expect(broadcasts).toHaveLength(0);
    });
  });
});
