import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ServerMessage, RoomId } from "@tetris/shared";
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
      vi.advanceTimersByTime(3000);

      const types = spy.messages.map((m) => m.msg.type);
      expect(types).toEqual([
        "countdown",   // 3
        "countdown",   // 2
        "countdown",   // 1
        "countdown",   // 0
        "gameStarted",
      ]);

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

    it("does not cancel if game is already playing", () => {
      const roomId = setupRoom();
      const spy = createBroadcastSpy();

      startGameCountdown(roomId, store, { broadcastToRoom: spy.broadcastToRoom });

      // Complete countdown
      vi.advanceTimersByTime(3000);
      const session = getGameSession(roomId);
      expect(session?.state).toBe("playing");

      // Disconnect during playing should not cancel
      const msgCountBefore = spy.messages.length;
      handleGameDisconnect("p2", roomId, { broadcastToRoom: spy.broadcastToRoom });

      expect(session?.state).toBe("playing"); // Not cancelled
      // No additional error message
      const errorMsgs = spy.messages.slice(msgCountBefore).filter((m) => m.msg.type === "error");
      expect(errorMsgs).toHaveLength(0);

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
