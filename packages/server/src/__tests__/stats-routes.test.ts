import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import { JsonSkillStore } from "../skill-store.js";
import { createStatsRouter } from "../stats-routes.js";
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

/** Lightweight request helper using the app directly. */
async function request(app: express.Express, path: string) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to get address"));
        return;
      }
      fetch(`http://127.0.0.1:${addr.port}${path}`)
        .then(async (res) => {
          const body = await res.json();
          server.close();
          resolve({ status: res.status, body: body as Record<string, unknown> });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe("stats-routes", () => {
  let tmpDir: string;
  let store: JsonSkillStore;
  let app: express.Express;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "stats-routes-test-"));
    store = new JsonSkillStore(join(tmpDir, "ratings.json"));
    app = express();
    app.use(createStatsRouter(store));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns default state for unknown player", async () => {
    const { status, body } = await request(app, "/api/stats/unknown");
    expect(status).toBe(200);
    expect(body.player).toBeNull();
    expect(body.rankLabel).toBe("Beginner");
    expect(body.matchHistory).toEqual([]);
    expect(body.ratingHistory).toEqual([]);
  });

  it("returns player profile and rank label", async () => {
    await store.upsertPlayer(makePlayer({ username: "alice", rating: 1850 }));
    const { body } = await request(app, "/api/stats/alice");
    expect(body.player).toMatchObject({ username: "alice", rating: 1850 });
    expect(body.rankLabel).toBe("Expert");
  });

  it("returns match history most-recent-first", async () => {
    await store.saveMatchResult(makeMatch({ gameId: "g1", timestamp: 1000 }));
    await store.saveMatchResult(makeMatch({ gameId: "g2", timestamp: 2000 }));
    await store.saveMatchResult(makeMatch({ gameId: "g3", timestamp: 3000 }));

    const { body } = await request(app, "/api/stats/alice");
    const history = body.matchHistory as MatchResult[];
    expect(history).toHaveLength(3);
    expect(history[0].gameId).toBe("g3");
    expect(history[2].gameId).toBe("g1");
  });

  it("returns rating history in chronological order", async () => {
    await store.saveMatchResult(
      makeMatch({
        gameId: "g1",
        timestamp: 1000,
        ratingChanges: { alice: { before: 1500, after: 1520 } },
      }),
    );
    await store.saveMatchResult(
      makeMatch({
        gameId: "g2",
        timestamp: 2000,
        ratingChanges: { alice: { before: 1520, after: 1545 } },
      }),
    );

    const { body } = await request(app, "/api/stats/alice");
    const ratingHistory = body.ratingHistory as { timestamp: number; rating: number }[];
    expect(ratingHistory).toHaveLength(2);
    // Chronological: oldest first
    expect(ratingHistory[0]).toEqual({ timestamp: 1000, rating: 1520 });
    expect(ratingHistory[1]).toEqual({ timestamp: 2000, rating: 1545 });
  });

  it("skips matches without ratingChanges in rating history", async () => {
    await store.saveMatchResult(makeMatch({ gameId: "g1", timestamp: 1000 }));
    await store.saveMatchResult(
      makeMatch({
        gameId: "g2",
        timestamp: 2000,
        ratingChanges: { alice: { before: 1500, after: 1520 } },
      }),
    );

    const { body } = await request(app, "/api/stats/alice");
    const ratingHistory = body.ratingHistory as { timestamp: number; rating: number }[];
    expect(ratingHistory).toHaveLength(1);
    expect(ratingHistory[0].rating).toBe(1520);
  });

  it("maps rank labels to correct thresholds", async () => {
    const cases: [number, string][] = [
      [1100, "Beginner"],
      [1200, "Intermediate"],
      [1499, "Intermediate"],
      [1500, "Advanced"],
      [1799, "Advanced"],
      [1800, "Expert"],
      [2100, "Expert"],
    ];

    for (const [rating, expectedRank] of cases) {
      await store.upsertPlayer(makePlayer({ username: `p${rating}`, rating }));
      const { body } = await request(app, `/api/stats/p${rating}`);
      expect(body.rankLabel).toBe(expectedRank);
    }
  });
});
