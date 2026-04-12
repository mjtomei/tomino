import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ServerMessage, PlayerId, RoomId, GameStateSnapshot } from "@tetris/shared";
import { createRNG } from "@tetris/shared";
import {
  GameSession,
  createGameSession,
  removeGameSession,
} from "../game-session.js";
import { makeGameState, makePiece } from "@tetris/shared/__test-utils__/factories.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBroadcastSpy() {
  const messages: { roomId: RoomId; msg: ServerMessage }[] = [];
  return {
    messages,
    broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => {
      messages.push({ roomId, msg });
    },
  };
}

function getMessagesByType(
  messages: { roomId: RoomId; msg: ServerMessage }[],
  type: string,
): ServerMessage[] {
  return messages.filter((m) => m.msg.type === type).map((m) => m.msg);
}

const PLAYERS = [
  { id: "p1" as PlayerId, name: "Alice" },
  { id: "p2" as PlayerId, name: "Bob" },
];

/** Fast-forward through countdown to get to playing state. */
function startSession(spy: ReturnType<typeof createBroadcastSpy>) {
  const session = createGameSession({
    roomId: "room-1",
    players: PLAYERS,
    broadcastToRoom: spy.broadcastToRoom,
  });
  session.startCountdown();

  // Fast-forward through countdown (3→2→1→0→gameStarted)
  vi.advanceTimersByTime(4000);

  return session;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GameSession gameplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    removeGameSession("room-1");
  });

  describe("engine initialization", () => {
    it("creates engines for each player after countdown", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      expect(session.state).toBe("playing");
      expect(session.getPlayerEngine("p1")).toBeDefined();
      expect(session.getPlayerEngine("p2")).toBeDefined();
    });

    it("engines share the same seed for deterministic piece sequences", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      const engine1 = session.getPlayerEngine("p1")!;
      const engine2 = session.getPlayerEngine("p2")!;

      // Same seed → same initial piece
      expect(engine1.getSnapshot().activePiece!.type).toBe(
        engine2.getSnapshot().activePiece!.type,
      );
      expect(engine1.getSnapshot().nextQueue).toEqual(
        engine2.getSnapshot().nextQueue,
      );
    });

    it("uses seeded PRNG (createRNG) for determinism", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Verify seed is a valid number
      expect(typeof session.seed).toBe("number");
      expect(session.seed).toBeGreaterThanOrEqual(0);

      // Verify createRNG produces consistent results with same seed
      const rng1 = createRNG(session.seed);
      const rng2 = createRNG(session.seed);
      expect(rng1.next()).toBe(rng2.next());
    });
  });

  describe("input application and state broadcast", () => {
    it("applies input and broadcasts state snapshot", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      const msgCountBefore = spy.messages.length;
      session.applyInput("p1", "moveLeft");

      const newMessages = spy.messages.slice(msgCountBefore);
      const snapshots = newMessages.filter(
        (m) => m.msg.type === "gameStateSnapshot",
      );
      expect(snapshots.length).toBe(1);

      const snapshotMsg = snapshots[0]!.msg as any;
      expect(snapshotMsg.playerId).toBe("p1");
      expect(snapshotMsg.state).toBeDefined();
    });

    it("input on player 1 does not affect player 2 board", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      const p2Before = session.getPlayerEngine("p2")!.getSnapshot();

      // Apply several inputs to player 1
      session.applyInput("p1", "moveLeft");
      session.applyInput("p1", "moveLeft");
      session.applyInput("p1", "hardDrop");

      const p2After = session.getPlayerEngine("p2")!.getSnapshot();

      // Player 2's piece should not have moved
      expect(p2After.activePiece).toEqual(p2Before.activePiece);
    });

    it("rejects input when session is not playing", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS,
        broadcastToRoom: spy.broadcastToRoom,
      });
      // Don't start countdown — session is still in "countdown" state

      const result = session.applyInput("p1", "moveLeft");
      expect(result).toBeUndefined();
    });

    it("rejects input for unknown player", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      const result = session.applyInput("unknown-player", "moveLeft");
      expect(result).toBeUndefined();
    });

    it("rejects input for game-over player", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Force player 1 to game over
      let drops = 0;
      while (!session.getPlayerEngine("p1")!.isGameOver && drops < 200) {
        session.applyInput("p1", "hardDrop");
        drops++;
      }

      const result = session.applyInput("p1", "moveLeft");
      expect(result).toBeUndefined();
    });
  });

  describe("gravity tick progression", () => {
    it("tick loop advances engine state", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      const tickBefore = session.getPlayerEngine("p1")!.currentTick;

      // Advance time for some ticks (~100ms = ~6 ticks at 60fps)
      vi.advanceTimersByTime(100);

      const tickAfter = session.getPlayerEngine("p1")!.currentTick;
      expect(tickAfter).toBeGreaterThan(tickBefore);
    });

    it("broadcasts state changes during gravity ticks", () => {
      const spy = createBroadcastSpy();
      startSession(spy);

      const msgCountBefore = spy.messages.length;

      // Advance enough time for gravity to move a piece
      vi.advanceTimersByTime(2000);

      const snapshots = spy.messages
        .slice(msgCountBefore)
        .filter((m) => m.msg.type === "gameStateSnapshot");

      // Should have broadcast some state updates
      expect(snapshots.length).toBeGreaterThan(0);
    });
  });

  describe("game over and game end", () => {
    it("broadcasts gameOver when player tops out", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Force player 1 to game over via rapid hard drops
      let drops = 0;
      while (!session.getPlayerEngine("p1")!.isGameOver && drops < 200) {
        session.applyInput("p1", "hardDrop");
        drops++;
      }

      const gameOverMsgs = getMessagesByType(spy.messages, "gameOver");
      expect(gameOverMsgs.length).toBeGreaterThanOrEqual(1);

      const gameOverMsg = gameOverMsgs.find(
        (m) => (m as any).playerId === "p1",
      );
      expect(gameOverMsg).toBeDefined();
    });

    it("broadcasts gameEnd with winner when last player remains", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Force player 1 to game over
      let drops = 0;
      while (!session.getPlayerEngine("p1")!.isGameOver && drops < 200) {
        session.applyInput("p1", "hardDrop");
        drops++;
      }

      const gameEndMsgs = getMessagesByType(spy.messages, "gameEnd");
      expect(gameEndMsgs.length).toBe(1);
      expect((gameEndMsgs[0] as any).winnerId).toBe("p2");
    });

    it("stops tick loop after all players finish", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Force both players to game over
      for (const pid of ["p1", "p2"]) {
        let drops = 0;
        while (
          session.getPlayerEngine(pid)?.isGameOver === false &&
          drops < 200
        ) {
          session.applyInput(pid, "hardDrop");
          drops++;
        }
      }

      expect(session.state).toBe("finished");

      // Further time advancement should not produce new messages
      const msgCountAfter = spy.messages.length;
      vi.advanceTimersByTime(1000);
      // At most a few stragglers from the last tick interval
      expect(spy.messages.length - msgCountAfter).toBeLessThanOrEqual(1);
    });
  });

  describe("player disconnect during gameplay", () => {
    it("broadcasts gameOver for disconnected player", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      session.handlePlayerDisconnect("p1");

      const gameOverMsgs = getMessagesByType(spy.messages, "gameOver");
      const p1GameOver = gameOverMsgs.find(
        (m) => (m as any).playerId === "p1",
      );
      expect(p1GameOver).toBeDefined();
    });

    it("declares winner after disconnect", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      session.handlePlayerDisconnect("p1");

      const gameEndMsgs = getMessagesByType(spy.messages, "gameEnd");
      expect(gameEndMsgs.length).toBe(1);
      expect((gameEndMsgs[0] as any).winnerId).toBe("p2");
    });

    it("ignores disconnect for already game-over player", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Force player 1 to game over first
      let drops = 0;
      while (!session.getPlayerEngine("p1")!.isGameOver && drops < 200) {
        session.applyInput("p1", "hardDrop");
        drops++;
      }

      const msgCountBefore = spy.messages.length;
      session.handlePlayerDisconnect("p1");

      // No additional gameOver message for already finished player
      const newGameOverMsgs = spy.messages
        .slice(msgCountBefore)
        .filter((m) => m.msg.type === "gameOver");
      expect(newGameOverMsgs.length).toBe(0);
    });
  });

  describe("multi-player session with independent engines", () => {
    it("each player has independent game state", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Move player 1 left, player 2 right
      session.applyInput("p1", "moveLeft");
      session.applyInput("p2", "moveRight");

      const s1 = session.getPlayerEngine("p1")!.getSnapshot();
      const s2 = session.getPlayerEngine("p2")!.getSnapshot();

      // Their pieces should be at different positions
      expect(s1.activePiece!.x).not.toBe(s2.activePiece!.x);
    });

    it("same seed produces same initial piece for all players", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      const ids = session.getPlayerIds();
      const pieces = ids.map(
        (id) => session.getPlayerEngine(id)!.getSnapshot().activePiece!.type,
      );

      // All players start with the same piece type
      expect(new Set(pieces).size).toBe(1);
    });
  });
});
