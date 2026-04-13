import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  PlayerId,
  RoomId,
  ServerMessage,
  S2C_TargetingUpdated,
  S2C_AttackPowerUpdated,
  S2C_GameStarted,
} from "@tomino/shared";
import {
  createGameSession,
  removeGameSession,
} from "../game-session.js";

const PLAYERS = [
  { id: "p1" as PlayerId, name: "Alice" },
  { id: "p2" as PlayerId, name: "Bob" },
  { id: "p3" as PlayerId, name: "Carol" },
];

function createBroadcastSpy() {
  const messages: { roomId: RoomId; msg: ServerMessage }[] = [];
  return {
    messages,
    broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => {
      messages.push({ roomId, msg });
    },
    messagesOfType<T extends ServerMessage>(type: T["type"]): (T & ServerMessage)[] {
      return messages
        .filter((m) => m.msg.type === type)
        .map((m) => m.msg as T & ServerMessage);
    },
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

describe("Targeting integration", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    removeGameSession("room-1");
  });

  describe("initial targeting state", () => {
    it("broadcasts targetingUpdated for each player after gameStarted", () => {
      const spy = createBroadcastSpy();
      startSession(spy);

      const targeting = spy.messagesOfType<S2C_TargetingUpdated>("targetingUpdated");
      expect(targeting).toHaveLength(3); // one per player
      const playerIds = targeting.map((m) => m.playerId).sort();
      expect(playerIds).toEqual(["p1", "p2", "p3"]);
      // Default strategy is "random"
      expect(targeting[0].strategy).toBe("random");
    });

    it("includes targetingSettings in gameStarted", () => {
      const spy = createBroadcastSpy();
      startSession(spy, {
        targetingSettings: {
          enabledStrategies: ["random", "kos"],
          defaultStrategy: "kos",
        },
      });

      const gameStarted = spy.messagesOfType<S2C_GameStarted>("gameStarted");
      expect(gameStarted).toHaveLength(1);
      expect(gameStarted[0].targetingSettings).toEqual({
        enabledStrategies: ["random", "kos"],
        defaultStrategy: "kos",
      });

      // Initial strategy should be the default
      const targeting = spy.messagesOfType<S2C_TargetingUpdated>("targetingUpdated");
      expect(targeting[0].strategy).toBe("kos");
    });
  });

  describe("strategy switching", () => {
    it("changes strategy mid-game", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);
      spy.messages.length = 0; // clear startup messages

      const ok = session.setPlayerStrategy("p1", "kos");
      expect(ok).toBe(true);

      const targeting = spy.messagesOfType<S2C_TargetingUpdated>("targetingUpdated");
      expect(targeting).toHaveLength(1);
      expect(targeting[0].playerId).toBe("p1");
      expect(targeting[0].strategy).toBe("kos");
    });

    it("rejects switching to a non-enabled strategy", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy, {
        targetingSettings: {
          enabledStrategies: ["random", "kos"],
          defaultStrategy: "random",
        },
      });
      spy.messages.length = 0;

      const ok = session.setPlayerStrategy("p1", "manual");
      expect(ok).toBe(false);
      expect(spy.messages).toHaveLength(0);
    });

    it("rejects switching when game is not playing", () => {
      const spy = createBroadcastSpy();
      const session = createGameSession({
        roomId: "room-1",
        players: PLAYERS,
        broadcastToRoom: spy.broadcastToRoom,
      });
      // Don't start countdown — session is in "countdown" state
      const ok = session.setPlayerStrategy("p1", "kos");
      expect(ok).toBe(false);
    });
  });

  describe("manual targeting", () => {
    it("sets a manual target and broadcasts update", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);
      spy.messages.length = 0;

      const ok = session.setManualTarget("p1", "p2");
      expect(ok).toBe(true);

      const targeting = spy.messagesOfType<S2C_TargetingUpdated>("targetingUpdated");
      expect(targeting).toHaveLength(1);
      expect(targeting[0].playerId).toBe("p1");
      expect(targeting[0].strategy).toBe("manual");
      expect(targeting[0].targetPlayerId).toBe("p2");
    });

    it("rejects targeting self", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);
      spy.messages.length = 0;

      const ok = session.setManualTarget("p1", "p1");
      expect(ok).toBe(false);
      expect(spy.messages).toHaveLength(0);
    });

    it("rejects manual target when manual strategy is not enabled", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy, {
        targetingSettings: {
          enabledStrategies: ["random", "kos"],
          defaultStrategy: "random",
        },
      });
      spy.messages.length = 0;

      const ok = session.setManualTarget("p1", "p2");
      expect(ok).toBe(false);
      expect(spy.messages).toHaveLength(0);
    });

    it("rejects targeting a dead player", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Force p2 to game over by disconnecting
      session.markDisconnected("p2", 15000);
      session.forfeitPlayer("p2");
      spy.messages.length = 0;

      const ok = session.setManualTarget("p1", "p2");
      expect(ok).toBe(false);
      expect(spy.messages).toHaveLength(0);
    });

    it("auto-switches to manual strategy on manual target selection", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);
      spy.messages.length = 0;

      // Player starts on "random", selects a target
      session.setManualTarget("p1", "p3");
      const targeting = spy.messagesOfType<S2C_TargetingUpdated>("targetingUpdated");
      expect(targeting[0].strategy).toBe("manual");
    });
  });

  describe("dead target fallback", () => {
    it("resets manual target when targeted player disconnects", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      session.setManualTarget("p1", "p2");
      spy.messages.length = 0;

      // p2 disconnects
      session.markDisconnected("p2", 15000);
      session.forfeitPlayer("p2");

      const targeting = spy.messagesOfType<S2C_TargetingUpdated>("targetingUpdated");
      // p1's targeting should be updated to random fallback
      const p1Update = targeting.find((m) => m.playerId === "p1");
      expect(p1Update).toBeDefined();
      expect(p1Update!.strategy).toBe("random");
      expect(p1Update!.targetPlayerId).toBeUndefined();
    });
  });

  describe("settings validation", () => {
    it("uses default settings when none provided", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);
      // All strategies should be enabled by default
      const ok1 = session.setPlayerStrategy("p1", "random");
      const ok2 = session.setPlayerStrategy("p1", "attackers");
      const ok3 = session.setPlayerStrategy("p1", "kos");
      const ok4 = session.setPlayerStrategy("p1", "manual");
      expect(ok1).toBe(true);
      expect(ok2).toBe(true);
      expect(ok3).toBe(true);
      expect(ok4).toBe(true);
    });
  });
});
