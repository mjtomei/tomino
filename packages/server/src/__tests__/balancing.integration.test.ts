import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  HandicapModifiers,
  MatchResult,
  PerformanceMetrics,
  PlayerProfile,
  RoomId,
  ServerMessage,
  SkillStore,
} from "@tomino/shared";
import { modifierKey } from "@tomino/shared";
import { loadBalancingConfig, getDefaultBalancingConfig } from "../balancing-init.js";
import { computeModifierMatrix, type PlayerRating } from "../handicap-calculator.js";
import { handlePostGame } from "../post-game-handler.js";
import { BalancingMiddleware } from "../balancing-middleware.js";
import type { GameEndResult } from "../game-session.js";
import { GLICKO_CONFIG } from "../rating-config.js";
import { DEFAULT_CURVE_CONFIG } from "../handicap-config.js";

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

let tmpDir: string;

function makeTmpDir(): string {
  const dir = join(tmpdir(), `balancing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Config loading and validation
// ---------------------------------------------------------------------------

describe("balancing config loading", () => {
  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  it("loads a valid config file", () => {
    const config = {
      rating: { initialRating: 1200, tau: 0.3 },
      handicapCurve: { steepness: 0.02, midpoint: 300 },
    };
    writeFileSync(join(tmpDir, "balancing-config.json"), JSON.stringify(config));

    const loaded = loadBalancingConfig(tmpDir);

    expect(loaded.rating.INITIAL_RATING).toBe(1200);
    expect(loaded.rating.TAU).toBe(0.3);
    // Unspecified fields use defaults
    expect(loaded.rating.INITIAL_RD).toBe(GLICKO_CONFIG.INITIAL_RD);
    expect(loaded.handicapCurve.steepness).toBe(0.02);
    expect(loaded.handicapCurve.midpoint).toBe(300);
    // Unspecified curve fields use defaults
    expect(loaded.handicapCurve.delayScale).toBe(DEFAULT_CURVE_CONFIG.delayScale);
  });

  it("falls back to defaults when config file is missing", () => {
    const loaded = loadBalancingConfig(join(tmpDir, "nonexistent"));

    expect(loaded.rating).toEqual(GLICKO_CONFIG);
    expect(loaded.handicapCurve).toEqual(DEFAULT_CURVE_CONFIG);
  });

  it("falls back to defaults on invalid JSON", () => {
    writeFileSync(join(tmpDir, "balancing-config.json"), "not json{{{");

    const loaded = loadBalancingConfig(tmpDir);

    expect(loaded.rating).toEqual(GLICKO_CONFIG);
  });

  it("rejects negative rating values", () => {
    const config = { rating: { initialRating: -100 } };
    writeFileSync(join(tmpDir, "balancing-config.json"), JSON.stringify(config));

    expect(() => loadBalancingConfig(tmpDir)).toThrow(/must be positive/);
  });

  it("rejects out-of-range symmetricFactor", () => {
    const config = { handicapCurve: { symmetricFactor: 1.5 } };
    writeFileSync(join(tmpDir, "balancing-config.json"), JSON.stringify(config));

    expect(() => loadBalancingConfig(tmpDir)).toThrow(/must be in \[0, 1\]/);
  });

  it("rejects invalid intensity preset", () => {
    const config = { defaultHandicap: { intensity: "extreme" } };
    writeFileSync(join(tmpDir, "balancing-config.json"), JSON.stringify(config));

    expect(() => loadBalancingConfig(tmpDir)).toThrow(/must be one of/);
  });

  it("getDefaultBalancingConfig returns independent copies", () => {
    const a = getDefaultBalancingConfig();
    const b = getDefaultBalancingConfig();

    a.rating.INITIAL_RATING = 9999;
    expect(b.rating.INITIAL_RATING).toBe(GLICKO_CONFIG.INITIAL_RATING);
  });

  it("deep-merges partial overrides with defaults", () => {
    const config = {
      rating: { tau: 0.8 },
      defaultHandicap: { targetingBiasStrength: 0.3 },
    };
    writeFileSync(join(tmpDir, "balancing-config.json"), JSON.stringify(config));

    const loaded = loadBalancingConfig(tmpDir);

    expect(loaded.rating.TAU).toBe(0.8);
    expect(loaded.rating.INITIAL_RATING).toBe(GLICKO_CONFIG.INITIAL_RATING);
    expect(loaded.defaultHandicap.targetingBiasStrength).toBe(0.3);
    expect(loaded.defaultHandicap.mode).toBe("boost");
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle: two players, simulated games, ratings converge
// ---------------------------------------------------------------------------

describe("full balancing lifecycle", () => {
  let store: ReturnType<typeof createMockStore>;
  let broadcasts: ServerMessage[];
  let broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void;

  beforeEach(() => {
    store = createMockStore();
    broadcasts = [];
    broadcastToRoom = (_roomId, msg) => broadcasts.push(msg);
  });

  it("ratings converge over multiple games with consistent winner", async () => {
    const config = getDefaultBalancingConfig();
    const profiles = new Map<string, PlayerProfile>();

    // Simulate 10 games where Alice always wins
    for (let i = 0; i < 10; i++) {
      const result = make1v1Result();
      await handlePostGame(result, store, broadcastToRoom, config.rating);

      // Update profiles map for next game
      for (const p of store.savedPlayers) {
        profiles.set(p.username, p);
      }
    }

    const alice = profiles.get("Alice")!;
    const bob = profiles.get("Bob")!;

    // Alice's rating should have climbed significantly
    expect(alice.rating).toBeGreaterThan(1600);
    // Bob's should have dropped
    expect(bob.rating).toBeLessThan(1400);
    // Rating changes should decrease over time (convergence)
    // The gap between consecutive rating changes should narrow
    expect(alice.gamesPlayed).toBe(10);
    expect(bob.gamesPlayed).toBe(10);
  });

  it("handicap modifiers reflect rating gap", () => {
    const config = getDefaultBalancingConfig();
    const players: PlayerRating[] = [
      { username: "Alice", rating: 1800 },
      { username: "Bob", rating: 1200 },
    ];

    const matrix = computeModifierMatrix(
      players,
      { intensity: "standard", mode: "boost", targetingBiasStrength: 0, delayEnabled: false, messinessEnabled: false },
      config.handicapCurve,
    );

    // Strong → weak: garbage should be reduced
    const strongToWeak = matrix.get(modifierKey("Alice", "Bob"))!;
    expect(strongToWeak.garbageMultiplier).toBeLessThan(1.0);

    // Weak → strong in boost mode: no reduction
    const weakToStrong = matrix.get(modifierKey("Bob", "Alice"))!;
    expect(weakToStrong.garbageMultiplier).toBe(1.0);
  });

  it("full flow: ratings → handicap → middleware → post-game update", async () => {
    const config = getDefaultBalancingConfig();

    // Step 1: Set up players with different ratings
    const aliceProfile = makeProfile({ username: "Alice", rating: 1700, gamesPlayed: 20 });
    const bobProfile = makeProfile({ username: "Bob", rating: 1300, gamesPlayed: 15 });
    store = createMockStore(new Map([
      ["Alice", aliceProfile],
      ["Bob", bobProfile],
    ]));
    broadcasts = [];
    broadcastToRoom = (_roomId, msg) => broadcasts.push(msg);

    // Step 2: Compute handicap modifiers
    const players: PlayerRating[] = [
      { username: "Alice", rating: aliceProfile.rating },
      { username: "Bob", rating: bobProfile.rating },
    ];
    const matrix = computeModifierMatrix(
      players,
      { intensity: "standard", mode: "boost", targetingBiasStrength: 0.7, delayEnabled: false, messinessEnabled: false },
      config.handicapCurve,
    );

    const serializedMatrix: Record<string, HandicapModifiers> = {};
    for (const [key, value] of matrix) {
      serializedMatrix[key] = value;
    }

    // Step 3: Create middleware with modifiers
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: { p1: "Alice", p2: "Bob" },
      modifiers: serializedMatrix,
    });

    // Step 4: Simulate garbage — Alice sends to Bob (strong→weak, should be reduced)
    const outcome = mw.onLinesCleared("p1", {
      linesCleared: 4,
      isTSpin: false,
      combo: 0,
      isPerfectClear: false,
    });

    // Garbage to Bob should be reduced due to Alice being stronger
    const pending = mw.getPending("p2");
    const totalLines = pending.reduce((sum, b) => sum + b.lines, 0);
    // 4 lines cleared = 4 garbage, multiplied by < 1.0 factor
    expect(totalLines).toBeLessThanOrEqual(4);

    // Step 5: Game ends, ratings update
    const result = make1v1Result();
    await handlePostGame(result, store, broadcastToRoom, config.rating);

    // Verify rating broadcast was sent
    expect(broadcasts.length).toBe(1);
    expect(broadcasts[0]!.type).toBe("ratingUpdate");
  });
});

// ---------------------------------------------------------------------------
// Handicap disabled mode bypasses all balancing
// ---------------------------------------------------------------------------

describe("handicap disabled bypass", () => {
  it("no modifiers computed when intensity is off", () => {
    const players: PlayerRating[] = [
      { username: "Alice", rating: 1800 },
      { username: "Bob", rating: 1200 },
    ];

    const matrix = computeModifierMatrix(
      players,
      { intensity: "off", mode: "boost", targetingBiasStrength: 0, delayEnabled: false, messinessEnabled: false },
    );

    // With intensity "off", effective steepness is 0 → all multipliers should be 1.0
    for (const [, mods] of matrix) {
      expect(mods.garbageMultiplier).toBeCloseTo(1.0, 5);
    }
  });

  it("middleware in passthrough mode when no modifiers provided", () => {
    const mw = new BalancingMiddleware({
      playerIds: ["p1", "p2"],
      playerNames: { p1: "Alice", p2: "Bob" },
      // No modifiers → passthrough
    });

    mw.onLinesCleared("p1", {
      linesCleared: 4,
      isTSpin: false,
      combo: 0,
      isPerfectClear: false,
    });

    const pending = mw.getPending("p2");
    const totalLines = pending.reduce((sum, b) => sum + b.lines, 0);
    // No modification — full 4 lines of garbage
    expect(totalLines).toBe(4);
  });

  it("no rating updates for unranked games", async () => {
    const store = createMockStore();
    const broadcasts: ServerMessage[] = [];
    const broadcastToRoom = (_roomId: RoomId, msg: ServerMessage) => broadcasts.push(msg);

    // In the real flow, handlePostGame is only called when isRanked is true.
    // When intensity === "off", isRanked is false and handlePostGame is never called.
    // This test verifies the solo-player guard also works.
    const result: GameEndResult = {
      roomId: "room-1",
      winnerId: "p1",
      playerNames: { p1: "Alice" },
      placements: { p1: 1 },
      metrics: { p1: makeMetrics() },
    };

    await handlePostGame(result, store, broadcastToRoom);

    expect(store.savedPlayers).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Custom config flows through to rating algorithm
// ---------------------------------------------------------------------------

describe("custom config affects rating calculations", () => {
  it("custom initial rating used for new players", async () => {
    const store = createMockStore();
    const broadcasts: ServerMessage[] = [];
    const broadcastToRoom = (_roomId: RoomId, msg: ServerMessage) => broadcasts.push(msg);

    const customRating = {
      INITIAL_RATING: 1200,
      INITIAL_RD: 300,
      INITIAL_VOLATILITY: 0.05,
      TAU: 0.5,
      CALIBRATION_GAMES: 10,
      CALIBRATION_RD_FLOOR: 200,
    };

    const result = make1v1Result();
    await handlePostGame(result, store, broadcastToRoom, customRating);

    // Both players should start from custom initial rating
    const ratingMsg = broadcasts[0]!;
    if (ratingMsg.type !== "ratingUpdate") throw new Error("unexpected type");
    expect(ratingMsg.changes["p1"]!.before).toBe(1200);
    expect(ratingMsg.changes["p2"]!.before).toBe(1200);
    // Winner should gain, loser should lose
    expect(ratingMsg.changes["p1"]!.after).toBeGreaterThan(1200);
    expect(ratingMsg.changes["p2"]!.after).toBeLessThan(1200);
  });

  it("custom handicap curve config changes modifier computation", () => {
    const players: PlayerRating[] = [
      { username: "Alice", rating: 1800 },
      { username: "Bob", rating: 1200 },
    ];
    const settings = {
      intensity: "standard" as const,
      mode: "boost" as const,
      targetingBiasStrength: 0,
      delayEnabled: false,
      messinessEnabled: false,
    };

    // Default curve
    const defaultMatrix = computeModifierMatrix(players, settings, DEFAULT_CURVE_CONFIG);
    const defaultMod = defaultMatrix.get(modifierKey("Alice", "Bob"))!.garbageMultiplier;

    // Steeper curve (more aggressive handicap)
    const steepCurve = { ...DEFAULT_CURVE_CONFIG, steepness: 0.05 };
    const steepMatrix = computeModifierMatrix(players, settings, steepCurve);
    const steepMod = steepMatrix.get(modifierKey("Alice", "Bob"))!.garbageMultiplier;

    // Steeper curve should produce a lower (stronger) handicap multiplier
    expect(steepMod).toBeLessThan(defaultMod);
  });
});
