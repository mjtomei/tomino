/**
 * Full integration test — single-player, multiplayer, and adaptive balancing.
 *
 * Verifies the complete flow across all three systems working together:
 * single-player engine lifecycle, multiplayer garbage exchange through
 * GameSession, and adaptive skill-based balancing with post-game rating updates.
 *
 * Uses plan-17af8d3 testing infra throughout: seeded PRNG, GameTestHarness,
 * boardFromAscii, factories, and state transition assertions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  HandicapModifiers,
  MatchResult,
  PerformanceMetrics,
  PlayerId,
  PlayerProfile,
  RoomId,
  ServerMessage,
  SkillStore,
  TargetingStrategy,
} from "@tomino/shared";
import { modifierKey } from "@tomino/shared";
import { GameTestHarness } from "@tomino/shared/__test-utils__/game-harness.js";
import { makeGarbageBatch } from "@tomino/shared/__test-utils__/factories.js";
import { assertGarbageInserted } from "@tomino/shared/__test-utils__/assertions.js";
import {
  createGameSession,
  removeGameSession,
} from "../game-session.js";
import { BalancingMiddleware } from "../balancing-middleware.js";
import { computeModifierMatrix, type PlayerRating } from "../handicap-calculator.js";
import { handlePostGame } from "../post-game-handler.js";
import type { GameEndResult } from "../game-session.js";
import { getDefaultBalancingConfig } from "../balancing-init.js";
import { GLICKO_CONFIG } from "../rating-config.js";

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

const PLAYERS = [
  { id: "p1" as PlayerId, name: "Alice" },
  { id: "p2" as PlayerId, name: "Bob" },
];

function createBroadcastSpy() {
  const messages: { roomId: RoomId; msg: ServerMessage }[] = [];
  return {
    messages,
    broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => {
      messages.push({ roomId, msg });
    },
  };
}

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

function startSession(
  spy: ReturnType<typeof createBroadcastSpy>,
  overrides?: Partial<Parameters<typeof createGameSession>[0]>,
) {
  const session = createGameSession({
    roomId: "room-1",
    players: PLAYERS,
    broadcastToRoom: spy.broadcastToRoom,
    garbageDelayMs: 0,
    ...overrides,
  });
  session.startCountdown();
  vi.advanceTimersByTime(4000);
  return session;
}

/** Force all garbage from sender to a specific target. */
function toPlayerStrategy(targetId: PlayerId): TargetingStrategy {
  return {
    resolveTargets: (_sender, _players, ctx) =>
      ctx.linesToSend > 0
        ? [{ playerId: targetId, lines: ctx.linesToSend }]
        : [],
  };
}

// =========================================================================
// 1. Single-player lifecycle via GameTestHarness
// =========================================================================

describe("Full integration — single-player, multiplayer, and adaptive balancing", () => {
  describe("single-player lifecycle via GameTestHarness", () => {
    it("deterministic piece sequence with seeded PRNG", () => {
      const h1 = new GameTestHarness({ seed: 42 });
      const h2 = new GameTestHarness({ seed: 42 });

      // Both start with the same active piece
      expect(h1.state.activePiece!.type).toBe(h2.state.activePiece!.type);
      expect(h1.state.nextQueue).toEqual(h2.state.nextQueue);

      // After identical inputs, states remain identical
      const actions = ["moveLeft", "moveLeft", "hardDrop"] as const;
      h1.inputs([...actions]);
      h2.inputs([...actions]);

      expect(h1.state.activePiece!.type).toBe(h2.state.activePiece!.type);
      expect(h1.state.score).toBe(h2.state.score);
      expect(h1.state.linesCleared).toBe(h2.state.linesCleared);
    });

    it("different seeds produce different piece sequences", () => {
      const h1 = new GameTestHarness({ seed: 42 });
      const h2 = new GameTestHarness({ seed: 99 });

      // Collect the first 7+ pieces from each
      const pieces1: string[] = [h1.state.activePiece!.type, ...h1.state.nextQueue];
      const pieces2: string[] = [h2.state.activePiece!.type, ...h2.state.nextQueue];

      // Extremely unlikely to match with different seeds
      expect(pieces1).not.toEqual(pieces2);
    });

    it("piece lock → line clear → score update cycle", () => {
      const harness = new GameTestHarness({ seed: 42 });

      // Place multiple pieces via hard drops and track scoring
      const before = harness.state;
      for (let i = 0; i < 10; i++) {
        harness.input("hardDrop");
      }
      const after = harness.state;

      // Pieces should have been placed
      expect(after.piecesPlaced).toBeGreaterThan(before.piecesPlaced);
      // Score should have increased (at minimum from hard drops)
      expect(after.score).toBeGreaterThan(before.score);
    });

    it("garbage insertion shifts board and fills bottom rows with gap", () => {
      const harness = new GameTestHarness({ seed: 42 });

      const gapColumn = 4;
      const garbageLines = 3;
      const batch = makeGarbageBatch({ lines: garbageLines, gapColumn });

      // Garbage is pending until next piece lock
      harness.addGarbage([batch]);
      harness.input("hardDrop");

      const after = harness.state;
      const board = after.board;
      const totalRows = board.length; // 40

      // Bottom `garbageLines` rows should be garbage with correct gap
      for (let i = 0; i < garbageLines; i++) {
        const row = board[totalRows - garbageLines + i]!;
        for (let col = 0; col < row.length; col++) {
          if (col === gapColumn) {
            expect(row[col]).toBeNull();
          } else {
            expect(row[col]).not.toBeNull();
          }
        }
      }
    });

    it("game over via top-out after rapid hard drops", () => {
      const harness = new GameTestHarness({ seed: 42 });

      // Rapid hard drops will fill up the board
      let drops = 0;
      while (!harness.state.isGameOver && drops < 200) {
        harness.input("hardDrop");
        drops++;
      }

      expect(harness.state.isGameOver).toBe(true);
      expect(drops).toBeGreaterThan(0);
      expect(drops).toBeLessThan(200); // should top out well before 200
    });

    it("state transition ordering: lock → clear → garbage → spawn", () => {
      const harness = new GameTestHarness({ seed: 42 });

      // Queue garbage before a hard drop
      const gapColumn = 7;
      const garbageLines = 2;
      const batch = makeGarbageBatch({ lines: garbageLines, gapColumn });
      harness.addGarbage([batch]);

      const beforeDrop = harness.state;

      harness.input("hardDrop");

      const afterDrop = harness.state;

      // 1. Piece was locked (pieces placed incremented)
      expect(afterDrop.piecesPlaced).toBe(beforeDrop.piecesPlaced + 1);

      // 2. Garbage was inserted after lock (bottom rows are garbage with gap)
      const board = afterDrop.board;
      const totalRows = board.length;
      for (let i = 0; i < garbageLines; i++) {
        const row = board[totalRows - garbageLines + i]!;
        expect(row[gapColumn]).toBeNull(); // gap
        const filledCount = row.filter((c) => c !== null).length;
        expect(filledCount).toBe(row.length - 1); // all filled except gap
      }

      // 3. New piece spawned after garbage
      expect(afterDrop.activePiece).not.toBeNull();

      // 4. Pending garbage should be cleared (it was consumed)
      expect(afterDrop.pendingGarbage).toHaveLength(0);
    });

    it("hold piece swaps current and prevents double hold", () => {
      const harness = new GameTestHarness({ seed: 42 });

      const firstPiece = harness.state.activePiece!.type;
      expect(harness.state.holdPiece).toBeNull();

      // Hold the first piece
      harness.input("hold");

      // Hold piece should be set to the first piece
      expect(harness.state.holdPiece).toBe(firstPiece);
      // A new piece spawned
      const secondPiece = harness.state.activePiece!.type;
      expect(harness.state.holdUsed).toBe(true);

      // Can't hold again until the next piece is placed
      harness.input("hold");
      // Active piece should still be the same (hold was rejected)
      expect(harness.state.activePiece!.type).toBe(secondPiece);
      expect(harness.state.holdPiece).toBe(firstPiece);
    });
  });

  // =========================================================================
  // 2. Multiplayer garbage exchange via GameSession
  // =========================================================================

  describe("multiplayer garbage exchange via GameSession", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.useRealTimers();
      removeGameSession("room-1");
    });

    it("line clear by player A queues garbage for player B", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy, {
        targetingStrategy: toPlayerStrategy("p2" as PlayerId),
      });

      // Access internal garbage manager to simulate a line clear
      const gm = (session as any).garbageManager;
      spy.messages.length = 0;

      gm.onLinesCleared("p1", {
        linesCleared: 4,
        tSpin: "none",
        combo: 0,
        b2b: -1,
      });

      // Advance one tick so garbage is drained (delay=0)
      vi.advanceTimersByTime(20);

      // Player B should have garbage queued
      const queuedMsgs = spy.messages
        .map((m) => m.msg)
        .filter((m) => m.type === "garbageQueued");
      expect(queuedMsgs.some((m) => (m as any).playerId === "p2")).toBe(true);
    });

    it("garbage insertion on opponent board verified with assertGarbageInserted", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      const engine = session.getPlayerEngine("p2")!;
      const before = engine.getSnapshot();

      const batch = makeGarbageBatch({ lines: 2, gapColumn: 5 });
      engine.applyGarbage([batch]);

      const after = engine.getSnapshot();
      assertGarbageInserted(before, after, batch);
    });

    it("garbage pressure leads to game end with correct winner", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy, {
        targetingStrategy: toPlayerStrategy("p2" as PlayerId),
      });

      const gm = (session as any).garbageManager;

      // Send repeated large garbage waves to p2 to force a top-out
      for (let i = 0; i < 10; i++) {
        gm.onLinesCleared("p1", {
          linesCleared: 4,
          tSpin: "none",
          combo: 0,
          b2b: -1,
        });
        // Advance time to drain garbage and process ticks
        vi.advanceTimersByTime(100);
      }

      // Continue ticking to let garbage insertion top out p2
      vi.advanceTimersByTime(5000);

      // p2 should have topped out from garbage pressure
      const gameEndMsgs = spy.messages
        .filter((m) => m.msg.type === "gameEnd")
        .map((m) => m.msg);

      expect(gameEndMsgs).toHaveLength(1);
      expect((gameEndMsgs[0] as any).winnerId).toBe("p1");
    });

    it("both players share seed and start with identical pieces", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      const e1 = session.getPlayerEngine("p1")!;
      const e2 = session.getPlayerEngine("p2")!;

      const s1 = e1.getSnapshot();
      const s2 = e2.getSnapshot();

      // Same starting piece
      expect(s1.activePiece!.type).toBe(s2.activePiece!.type);
      // Same next queue
      expect(s1.nextQueue).toEqual(s2.nextQueue);
    });

    it("inputs on one player do not affect the other", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      const p2Before = session.getPlayerEngine("p2")!.getSnapshot();

      // Move and drop on p1
      session.applyInput("p1", "moveLeft");
      session.applyInput("p1", "moveLeft");
      session.applyInput("p1", "hardDrop");

      const p2After = session.getPlayerEngine("p2")!.getSnapshot();

      // p2's piece should not have moved
      expect(p2After.activePiece).toEqual(p2Before.activePiece);
    });
  });

  // =========================================================================
  // 3. Adaptive balancing end-to-end
  // =========================================================================

  describe("adaptive balancing end-to-end", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.useRealTimers();
      removeGameSession("room-1");
    });

    it("handicapped session reduces strong→weak garbage", () => {
      const config = getDefaultBalancingConfig();

      // Compute modifiers for a 600-point rating gap
      const players: PlayerRating[] = [
        { username: "Alice", rating: 1800 },
        { username: "Bob", rating: 1200 },
      ];
      const matrix = computeModifierMatrix(
        players,
        { intensity: "standard", mode: "boost", targetingBiasStrength: 0, delayEnabled: false, messinessEnabled: false },
        config.handicapCurve,
      );

      const serializedMatrix: Record<string, HandicapModifiers> = {};
      for (const [key, value] of matrix) {
        serializedMatrix[key] = value;
      }

      // Create a BalancingMiddleware with these modifiers
      // Use deterministic rounding (always round down) to make assertions predictable
      const mw = new BalancingMiddleware({
        playerIds: ["p1" as PlayerId, "p2" as PlayerId],
        playerNames: { p1: "Alice", p2: "Bob" },
        modifiers: serializedMatrix,
        delayMs: 0,
        rounderRng: () => 0.99, // always round down for predictability
      });

      // Alice (strong, 1800) sends 4-line clear to Bob (weak, 1200)
      mw.onLinesCleared("p1" as PlayerId, {
        linesCleared: 4,
        tSpin: "none",
        combo: 0,
        b2b: -1,
      });

      const pendingForBob = mw.getPending("p2" as PlayerId);
      const totalLinesToBob = pendingForBob.reduce((sum, b) => sum + b.lines, 0);

      // Strong→weak garbage should be reduced (< 4 lines)
      expect(totalLinesToBob).toBeLessThan(4);
      expect(totalLinesToBob).toBeGreaterThanOrEqual(0);

      // Bob (weak, 1200) sends 4-line clear to Alice (strong, 1800)
      mw.onLinesCleared("p2" as PlayerId, {
        linesCleared: 4,
        tSpin: "none",
        combo: 0,
        b2b: -1,
      });

      const pendingForAlice = mw.getPending("p1" as PlayerId);
      const totalLinesToAlice = pendingForAlice.reduce((sum, b) => sum + b.lines, 0);

      // Weak→strong in boost mode: unmodified (4 lines)
      expect(totalLinesToAlice).toBe(4);
    });

    it("equal-rated players get identity modifiers (no effect on gameplay)", () => {
      const config = getDefaultBalancingConfig();
      const players: PlayerRating[] = [
        { username: "Alice", rating: 1500 },
        { username: "Bob", rating: 1500 },
      ];

      const matrix = computeModifierMatrix(
        players,
        { intensity: "standard", mode: "boost", targetingBiasStrength: 0, delayEnabled: false, messinessEnabled: false },
        config.handicapCurve,
      );

      // Both directions should have multipliers near 1.0
      const aToB = matrix.get(modifierKey("Alice", "Bob"))!;
      const bToA = matrix.get(modifierKey("Bob", "Alice"))!;

      expect(aToB.garbageMultiplier).toBeCloseTo(1.0, 1);
      expect(bToA.garbageMultiplier).toBeCloseTo(1.0, 1);
    });

    it("post-game rating update broadcasts correct changes", async () => {
      const store = createMockStore();
      const broadcasts: ServerMessage[] = [];
      const broadcastToRoom = (_roomId: RoomId, msg: ServerMessage) =>
        broadcasts.push(msg);

      const result: GameEndResult = {
        roomId: "room-1",
        winnerId: "p1" as PlayerId,
        playerNames: { p1: "Alice", p2: "Bob" },
        placements: { p1: 1, p2: 2 },
        metrics: {
          p1: makeMetrics({ apm: 80 }),
          p2: makeMetrics({ apm: 50 }),
        },
      };

      await handlePostGame(result, store, broadcastToRoom);

      // Rating update should have been broadcast
      expect(broadcasts).toHaveLength(1);
      const msg = broadcasts[0]! as any;
      expect(msg.type).toBe("ratingUpdate");

      // Winner's rating should increase, loser's should decrease
      expect(msg.changes.p1.after).toBeGreaterThan(msg.changes.p1.before);
      expect(msg.changes.p2.after).toBeLessThan(msg.changes.p2.before);

      // Both players should have been persisted
      expect(store.savedPlayers).toHaveLength(2);
      expect(store.savedMatches).toHaveLength(1);
    });

    it("forfeit triggers valid post-game rating update", async () => {
      const spy = createBroadcastSpy();
      const store = createMockStore();

      let gameEndResult: GameEndResult | undefined;
      const session = startSession(spy, {
        onGameEnd: (result) => {
          gameEndResult = result;
        },
      });

      // Player 2 disconnects and is forfeited
      session.forfeitPlayer("p2" as PlayerId);

      // The session should have ended
      expect(session.state).toBe("finished");

      // onGameEnd must have been called
      expect(gameEndResult).toBeDefined();

      const postGameBroadcasts: ServerMessage[] = [];
      await handlePostGame(
        gameEndResult!,
        store,
        (_roomId, msg) => postGameBroadcasts.push(msg),
      );

      expect(postGameBroadcasts).toHaveLength(1);
      const msg = postGameBroadcasts[0]! as any;
      expect(msg.type).toBe("ratingUpdate");
      // p1 wins, p2 loses
      expect(msg.changes.p1.after).toBeGreaterThan(msg.changes.p1.before);
      expect(msg.changes.p2.after).toBeLessThan(msg.changes.p2.before);
    });

    it("full pipeline: ratings → modifiers → session → gameplay → post-game → updated ratings", async () => {
      const config = getDefaultBalancingConfig();

      // Step 1: Establish player ratings
      const aliceProfile = makeProfile({ username: "Alice", rating: 1700, gamesPlayed: 20 });
      const bobProfile = makeProfile({ username: "Bob", rating: 1300, gamesPlayed: 15 });
      const store = createMockStore(
        new Map([
          ["Alice", { ...aliceProfile }],
          ["Bob", { ...bobProfile }],
        ]),
      );

      // Step 2: Compute handicap modifiers from ratings
      const players: PlayerRating[] = [
        { username: "Alice", rating: aliceProfile.rating },
        { username: "Bob", rating: bobProfile.rating },
      ];
      const matrix = computeModifierMatrix(
        players,
        { intensity: "standard", mode: "boost", targetingBiasStrength: 0, delayEnabled: false, messinessEnabled: false },
        config.handicapCurve,
      );

      // Verify strong→weak is reduced
      const strongToWeak = matrix.get(modifierKey("Alice", "Bob"))!;
      expect(strongToWeak.garbageMultiplier).toBeLessThan(1.0);

      // Step 3: Create game session with modifiers
      const serializedMatrix: Record<string, HandicapModifiers> = {};
      for (const [key, value] of matrix) {
        serializedMatrix[key] = value;
      }

      let gameEndResult: GameEndResult | undefined;
      const spy = createBroadcastSpy();
      const session = startSession(spy, {
        handicapModifiers: serializedMatrix,
        onGameEnd: (result) => {
          gameEndResult = result;
        },
      });

      // Step 4: Simulate gameplay — Alice (p1) tops out, Bob (p2) wins
      let drops = 0;
      while (!session.getPlayerEngine("p1")!.isGameOver && drops < 200) {
        session.applyInput("p1", "hardDrop");
        drops++;
      }

      // Allow game-end processing
      vi.advanceTimersByTime(100);

      // Step 5: Game should have ended
      expect(session.state).toBe("finished");

      // Step 6: onGameEnd must have been called
      expect(gameEndResult).toBeDefined();

      // Step 7: Run post-game rating updates
      const postGameBroadcasts: ServerMessage[] = [];
      await handlePostGame(
        gameEndResult!,
        store,
        (_roomId, msg) => postGameBroadcasts.push(msg),
      );

      // Rating update broadcast
      expect(postGameBroadcasts).toHaveLength(1);
      const msg = postGameBroadcasts[0]! as any;
      expect(msg.type).toBe("ratingUpdate");

      // Bob (winner) gains rating, Alice (loser) loses
      // Note: p2 = Bob = winner in this scenario
      expect(msg.changes.p2.after).toBeGreaterThan(msg.changes.p2.before);
      expect(msg.changes.p1.after).toBeLessThan(msg.changes.p1.before);

      // Profiles should be persisted
      expect(store.savedPlayers.length).toBeGreaterThanOrEqual(2);

      // Verify consistency: final stored ratings match broadcast
      const bobFinal = store.savedPlayers.find((p) => p.username === "Bob");
      const aliceFinal = store.savedPlayers.find((p) => p.username === "Alice");
      expect(bobFinal).toBeDefined();
      expect(aliceFinal).toBeDefined();
      expect(bobFinal!.rating).toBe(msg.changes.p2.after);
      expect(aliceFinal!.rating).toBe(msg.changes.p1.after);
    });
  });
});
