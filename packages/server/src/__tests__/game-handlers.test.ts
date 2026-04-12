import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ServerMessage, RoomId, HandicapSettings } from "@tetris/shared";
import { modifierKey } from "@tetris/shared";
import { RoomStore } from "../room-store.js";
import {
  startGameCountdown,
  handleGameDisconnect,
} from "../handlers/game-handlers.js";
import { getGameSession, removeGameSession } from "../game-session.js";

function createBroadcastSpy() {
  const messages: { roomId: RoomId; msg: ServerMessage }[] = [];
  return {
    messages,
    broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => {
      messages.push({ roomId, msg });
    },
  };
}

describe("game-handlers", () => {
  let store: RoomStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new RoomStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupRoom(): string {
    const room = store.createRoom(
      { name: "Test", maxPlayers: 4 },
      { id: "host", name: "Host" },
    );
    store.addPlayer(room.id, { id: "p2", name: "P2" });
    return room.id;
  }

  describe("startGameCountdown", () => {
    it("creates a game session and starts countdown", () => {
      const roomId = setupRoom();
      const spy = createBroadcastSpy();

      startGameCountdown(roomId, store, { broadcastToRoom: spy.broadcastToRoom });

      const session = getGameSession(roomId);
      expect(session).toBeDefined();
      expect(session?.state).toBe("countdown");

      // First message is countdown=3
      expect(spy.messages[0].msg.type).toBe("countdown");

      removeGameSession(roomId);
    });

    it("sends full countdown then gameStarted", () => {
      const roomId = setupRoom();
      const spy = createBroadcastSpy();

      startGameCountdown(roomId, store, { broadcastToRoom: spy.broadcastToRoom });
      vi.advanceTimersByTime(4000);

      const types = spy.messages.map((m) => m.msg.type);
      expect(types).toEqual([
        "countdown",   // 3
        "countdown",   // 2
        "countdown",   // 1
        "countdown",   // 0
        "gameStarted",
        "targetingUpdated", // player A initial targeting
        "targetingUpdated", // player B initial targeting
      ]);

      removeGameSession(roomId);
    });
  });

  describe("handicap modifiers in gameStarted", () => {
    it("includes handicap modifiers in gameStarted when handicap is enabled", () => {
      const roomId = setupRoom();
      const spy = createBroadcastSpy();

      // Configure handicap settings and ratings
      const settings: HandicapSettings = {
        intensity: "standard",
        mode: "boost",
        targetingBiasStrength: 0,
      };
      store.setHandicapSettings(roomId, settings, true);
      store.setPlayerRating(roomId, "host", 1800);
      store.setPlayerRating(roomId, "p2", 1200);

      startGameCountdown(roomId, store, { broadcastToRoom: spy.broadcastToRoom });
      vi.advanceTimersByTime(4000);

      const gameStarted = spy.messages.find((m) => m.msg.type === "gameStarted");
      expect(gameStarted).toBeDefined();
      if (gameStarted?.msg.type === "gameStarted") {
        expect(gameStarted.msg.handicapModifiers).toBeDefined();
        expect(gameStarted.msg.handicapMode).toBe("boost");

        // Host (1800) → P2 (1200): gap 600, should have reduced multiplier
        const key = modifierKey("Host", "P2");
        const mod = gameStarted.msg.handicapModifiers![key];
        expect(mod).toBeDefined();
        expect(mod!.garbageMultiplier).toBeLessThan(1.0);

        // P2 → Host: gap -600, in boost mode weaker→stronger should be 1.0
        const reverseKey = modifierKey("P2", "Host");
        const reverseMod = gameStarted.msg.handicapModifiers![reverseKey];
        expect(reverseMod).toBeDefined();
        expect(reverseMod!.garbageMultiplier).toBe(1.0);
      }

      removeGameSession(roomId);
    });

    it("does not include handicap modifiers when intensity is off", () => {
      const roomId = setupRoom();
      const spy = createBroadcastSpy();

      const settings: HandicapSettings = {
        intensity: "off",
        mode: "boost",
        targetingBiasStrength: 0,
      };
      store.setHandicapSettings(roomId, settings, true);

      startGameCountdown(roomId, store, { broadcastToRoom: spy.broadcastToRoom });
      vi.advanceTimersByTime(4000);

      const gameStarted = spy.messages.find((m) => m.msg.type === "gameStarted");
      if (gameStarted?.msg.type === "gameStarted") {
        expect(gameStarted.msg.handicapModifiers).toBeUndefined();
      }

      removeGameSession(roomId);
    });

    it("uses default rating (1500) for players without stored ratings", () => {
      const roomId = setupRoom();
      const spy = createBroadcastSpy();

      const settings: HandicapSettings = {
        intensity: "standard",
        mode: "boost",
        targetingBiasStrength: 0,
      };
      store.setHandicapSettings(roomId, settings, true);
      // Only set one player's rating — the other defaults to 1500
      store.setPlayerRating(roomId, "host", 1500);

      startGameCountdown(roomId, store, { broadcastToRoom: spy.broadcastToRoom });
      vi.advanceTimersByTime(4000);

      const gameStarted = spy.messages.find((m) => m.msg.type === "gameStarted");
      if (gameStarted?.msg.type === "gameStarted") {
        // Equal ratings → both modifiers should be 1.0
        const key = modifierKey("Host", "P2");
        const mod = gameStarted.msg.handicapModifiers![key];
        expect(mod?.garbageMultiplier).toBe(1.0);
      }

      removeGameSession(roomId);
    });
  });

  describe("handleGameDisconnect during countdown", () => {
    it("cancels the session when a player disconnects during countdown", () => {
      const roomId = setupRoom();
      const spy = createBroadcastSpy();

      startGameCountdown(roomId, store, { broadcastToRoom: spy.broadcastToRoom });
      vi.advanceTimersByTime(1000); // countdown 3, 2

      handleGameDisconnect("p2", roomId, { broadcastToRoom: spy.broadcastToRoom });

      // Session is removed from registry on cancel (by onCancelled callback)
      expect(getGameSession(roomId)).toBeUndefined();

      // Should have sent an error message
      const errorMsg = spy.messages.find((m) => m.msg.type === "error");
      expect(errorMsg).toBeDefined();
    });

    it("reverts room status to waiting on cancellation", () => {
      const roomId = setupRoom();
      const spy = createBroadcastSpy();

      store.setStatus(roomId, "playing");
      startGameCountdown(roomId, store, { broadcastToRoom: spy.broadcastToRoom });

      handleGameDisconnect("p2", roomId, { broadcastToRoom: spy.broadcastToRoom });

      // The onCancelled callback reverts status
      expect(store.getRoom(roomId)?.status).toBe("waiting");

      removeGameSession(roomId);
    });

    it("opens a reconnect grace window on disconnect during playing (no immediate forfeit)", () => {
      const roomId = setupRoom();
      const spy = createBroadcastSpy();

      startGameCountdown(roomId, store, { broadcastToRoom: spy.broadcastToRoom });

      // Complete countdown + gameStarted delay
      vi.advanceTimersByTime(4000);
      const session = getGameSession(roomId);
      expect(session?.state).toBe("playing");

      // Disconnect during playing should NOT immediately mark game over —
      // it starts the reconnect grace window instead.
      const msgCountBefore = spy.messages.length;
      const result = handleGameDisconnect("p2", roomId, { broadcastToRoom: spy.broadcastToRoom }, store);
      expect(result.pendingReconnect).toBe(true);

      // No error message — this is handled gracefully
      const errorMsgs = spy.messages.slice(msgCountBefore).filter((m) => m.msg.type === "error");
      expect(errorMsgs).toHaveLength(0);

      // A playerDisconnected notice (not gameOver) should be broadcast.
      const notices = spy.messages.slice(msgCountBefore);
      expect(notices.some((m) => m.msg.type === "playerDisconnected")).toBe(true);
      expect(notices.some((m) => m.msg.type === "gameOver")).toBe(false);

      removeGameSession(roomId);
    });

    it("does nothing if no session exists", () => {
      const spy = createBroadcastSpy();

      // Should not throw
      handleGameDisconnect("p2", "nonexistent", { broadcastToRoom: spy.broadcastToRoom });
      expect(spy.messages).toHaveLength(0);
    });
  });
});
