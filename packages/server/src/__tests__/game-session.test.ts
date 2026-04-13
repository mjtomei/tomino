import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ServerMessage, PlayerId, RoomId } from "@tomino/shared";
import {
  GameSession,
  createGameSession,
  getGameSession,
  removeGameSession,
} from "../game-session.js";

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

const PLAYERS = [
  { id: "p1" as PlayerId, name: "Alice" },
  { id: "p2" as PlayerId, name: "Bob" },
  { id: "p3" as PlayerId, name: "Charlie" },
];

describe("GameSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clean up any lingering sessions
    removeGameSession("room-1");
  });

  // -----------------------------------------------------------------------
  // Player ID and index assignment
  // -----------------------------------------------------------------------

  describe("player index assignment", () => {
    it("assigns 0-based indexes in room player order", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS,
        broadcastToRoom: spy.broadcastToRoom,
      });

      expect(session.playerIndexes).toEqual({
        p1: 0,
        p2: 1,
        p3: 2,
      });
    });

    it("assigns consistent indexes regardless of creation", () => {
      const spy = createBroadcastSpy();
      const session1 = new GameSession({
        roomId: "room-1",
        players: PLAYERS,
        broadcastToRoom: spy.broadcastToRoom,
      });
      const session2 = new GameSession({
        roomId: "room-2",
        players: PLAYERS,
        broadcastToRoom: spy.broadcastToRoom,
      });

      // Same player order → same indexes
      expect(session1.playerIndexes).toEqual(session2.playerIndexes);
    });

    it("assigns indexes for 2-player room", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      expect(session.playerIndexes).toEqual({ p1: 0, p2: 1 });
    });
  });

  // -----------------------------------------------------------------------
  // Seed generation
  // -----------------------------------------------------------------------

  describe("seed generation", () => {
    it("generates a numeric seed", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      expect(typeof session.seed).toBe("number");
      expect(Number.isInteger(session.seed)).toBe(true);
      expect(session.seed).toBeGreaterThanOrEqual(0);
    });

    it("includes seed in gameStarted message", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      session.startCountdown();

      // Advance through all countdown ticks (3, 2, 1, 0) + delay before gameStarted
      vi.advanceTimersByTime(4000);

      const gameStarted = spy.messages.find((m) => m.msg.type === "gameStarted");
      expect(gameStarted).toBeDefined();
      if (gameStarted?.msg.type === "gameStarted") {
        expect(gameStarted.msg.seed).toBe(session.seed);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Countdown sequencing
  // -----------------------------------------------------------------------

  describe("countdown sequencing", () => {
    it("sends countdown 3 → 2 → 1 → 0 → gameStarted", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      session.startCountdown();

      // Immediately: countdown 3
      expect(spy.messages).toHaveLength(1);
      expect(spy.messages[0].msg.type).toBe("countdown");
      if (spy.messages[0].msg.type === "countdown") {
        expect(spy.messages[0].msg.count).toBe(3);
      }

      // After 1s: countdown 2
      vi.advanceTimersByTime(1000);
      expect(spy.messages).toHaveLength(2);
      if (spy.messages[1].msg.type === "countdown") {
        expect(spy.messages[1].msg.count).toBe(2);
      }

      // After 2s: countdown 1
      vi.advanceTimersByTime(1000);
      expect(spy.messages).toHaveLength(3);
      if (spy.messages[2].msg.type === "countdown") {
        expect(spy.messages[2].msg.count).toBe(1);
      }

      // After 3s: countdown 0 (Go!)
      vi.advanceTimersByTime(1000);
      expect(spy.messages).toHaveLength(4);
      if (spy.messages[3].msg.type === "countdown") {
        expect(spy.messages[3].msg.count).toBe(0);
      }

      // After 4s: gameStarted (delayed so "Go!" is visible)
      // Plus 2 targetingUpdated messages (one per player)
      vi.advanceTimersByTime(1000);
      expect(spy.messages).toHaveLength(7);
      expect(spy.messages[4].msg.type).toBe("gameStarted");
      expect(spy.messages[5].msg.type).toBe("targetingUpdated");
      expect(spy.messages[6].msg.type).toBe("targetingUpdated");
    });

    it("sends countdown messages to the correct room", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "test-room-42",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      session.startCountdown();

      for (const m of spy.messages) {
        expect(m.roomId).toBe("test-room-42");
      }
    });

    it("transitions state from countdown to playing after full sequence", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      expect(session.state).toBe("countdown");
      session.startCountdown();
      expect(session.state).toBe("countdown");

      vi.advanceTimersByTime(4000);
      expect(session.state).toBe("playing");
    });

    it("calls onGameStarted callback after countdown finishes", () => {
      const spy = createBroadcastSpy();
      const onGameStarted = vi.fn();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
        onGameStarted,
      });

      session.startCountdown();
      expect(onGameStarted).not.toHaveBeenCalled();

      vi.advanceTimersByTime(4000);
      expect(onGameStarted).toHaveBeenCalledTimes(1);
    });

    it("does not send extra countdown messages after countdown completes", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      session.startCountdown();
      vi.advanceTimersByTime(4000);

      // After countdown completes, no more countdown messages should be sent
      // (gameplay tick messages are expected — only checking no stray countdowns)
      const countdownsBefore = spy.messages.filter(
        (m) => m.msg.type === "countdown",
      ).length;
      vi.advanceTimersByTime(5000);
      const countdownsAfter = spy.messages.filter(
        (m) => m.msg.type === "countdown",
      ).length;
      expect(countdownsAfter).toBe(countdownsBefore);
    });
  });

  // -----------------------------------------------------------------------
  // Synchronized start timestamp validation
  // -----------------------------------------------------------------------

  describe("gameStarted message contents", () => {
    it("includes playerIndexes in gameStarted", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      session.startCountdown();
      vi.advanceTimersByTime(4000);

      const gameStarted = spy.messages.find((m) => m.msg.type === "gameStarted");
      expect(gameStarted).toBeDefined();
      if (gameStarted?.msg.type === "gameStarted") {
        expect(gameStarted.msg.playerIndexes).toEqual({ p1: 0, p2: 1 });
      }
    });

    it("includes initialStates for each player", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS,
        broadcastToRoom: spy.broadcastToRoom,
      });

      session.startCountdown();
      vi.advanceTimersByTime(4000);

      const gameStarted = spy.messages.find((m) => m.msg.type === "gameStarted");
      if (gameStarted?.msg.type === "gameStarted") {
        expect(Object.keys(gameStarted.msg.initialStates)).toEqual(["p1", "p2", "p3"]);
        // Each initial state should have an empty board at tick 0
        for (const state of Object.values(gameStarted.msg.initialStates)) {
          expect(state.tick).toBe(0);
          expect(state.score).toBe(0);
          expect(state.isGameOver).toBe(false);
          expect(state.board).toHaveLength(40); // BOARD_TOTAL_HEIGHT
          expect(state.board[0]).toHaveLength(10); // BOARD_WIDTH
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Cancellation (disconnect during countdown)
  // -----------------------------------------------------------------------

  describe("cancellation", () => {
    it("stops countdown when cancelled", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      session.startCountdown();
      expect(spy.messages).toHaveLength(1); // countdown 3

      vi.advanceTimersByTime(1000); // countdown 2
      expect(spy.messages).toHaveLength(2);

      session.cancel();
      expect(session.state).toBe("cancelled");

      // Should not send any more messages
      vi.advanceTimersByTime(5000);
      expect(spy.messages).toHaveLength(2);
    });

    it("calls onCancelled callback", () => {
      const spy = createBroadcastSpy();
      const onCancelled = vi.fn();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
        onCancelled,
      });

      session.startCountdown();
      session.cancel();

      expect(onCancelled).toHaveBeenCalledTimes(1);
    });

    it("cancel is idempotent", () => {
      const spy = createBroadcastSpy();
      const onCancelled = vi.fn();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
        onCancelled,
      });

      session.startCountdown();
      session.cancel();
      session.cancel();

      expect(onCancelled).toHaveBeenCalledTimes(1);
    });

    it("does not transition to playing after cancellation", () => {
      const spy = createBroadcastSpy();
      const session = new GameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      session.startCountdown();
      vi.advanceTimersByTime(1000);
      session.cancel();

      vi.advanceTimersByTime(5000);
      expect(session.state).toBe("cancelled");
    });
  });

  // -----------------------------------------------------------------------
  // Session registry
  // -----------------------------------------------------------------------

  describe("session registry", () => {
    it("creates and retrieves a session", () => {
      const spy = createBroadcastSpy();
      createGameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      const session = getGameSession("room-1");
      expect(session).toBeDefined();
      expect(session?.roomId).toBe("room-1");
    });

    it("returns undefined for non-existent session", () => {
      expect(getGameSession("nonexistent")).toBeUndefined();
    });

    it("removes a session", () => {
      const spy = createBroadcastSpy();
      createGameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      removeGameSession("room-1");
      expect(getGameSession("room-1")).toBeUndefined();
    });

    it("cancels existing session when creating a new one for the same room", () => {
      const spy = createBroadcastSpy();
      const onCancelled = vi.fn();
      createGameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
        onCancelled,
      });

      createGameSession({
        roomId: "room-1",
        players: PLAYERS.slice(0, 2),
        broadcastToRoom: spy.broadcastToRoom,
      });

      expect(onCancelled).toHaveBeenCalledTimes(1);
    });
  });
});
