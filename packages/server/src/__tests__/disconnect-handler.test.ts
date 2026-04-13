import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PlayerId, RoomId, ServerMessage } from "@tomino/shared";
import { RoomStore } from "../room-store.js";
import {
  handleGameDisconnect,
  handleRejoinRoom,
  startGameCountdown,
} from "../handlers/game-handlers.js";
import {
  getGameSession,
  removeGameSession,
} from "../game-session.js";
import {
  DisconnectRegistry,
  RECONNECT_WINDOW_MS,
} from "../disconnect-handler.js";

// ---------------------------------------------------------------------------
// Test helpers
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

function createSendSpy() {
  const messages: ServerMessage[] = [];
  return {
    messages,
    send: (msg: ServerMessage) => messages.push(msg),
  };
}

function setupPlayingSession(
  store: RoomStore,
  broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void,
): RoomId {
  const room = store.createRoom(
    { name: "Test", maxPlayers: 4 },
    { id: "p1", name: "Alice" },
  );
  store.addPlayer(room.id, { id: "p2", name: "Bob" });
  startGameCountdown(room.id, store, { broadcastToRoom });
  vi.advanceTimersByTime(4_000); // finish countdown
  return room.id;
}

// ---------------------------------------------------------------------------
// DisconnectRegistry
// ---------------------------------------------------------------------------

describe("DisconnectRegistry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onTimeout after the configured window", () => {
    const registry = new DisconnectRegistry(5_000);
    const cb = vi.fn();
    registry.register("r1", "p1", cb);
    expect(registry.isPending("r1", "p1")).toBe(true);
    vi.advanceTimersByTime(4_999);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(registry.isPending("r1", "p1")).toBe(false);
  });

  it("clear() prevents onTimeout from firing", () => {
    const registry = new DisconnectRegistry(5_000);
    const cb = vi.fn();
    registry.register("r1", "p1", cb);
    expect(registry.clear("r1", "p1")).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(cb).not.toHaveBeenCalled();
  });

  it("re-registering replaces the previous timer (rapid cycle safe)", () => {
    const registry = new DisconnectRegistry(5_000);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    registry.register("r1", "p1", cb1);
    vi.advanceTimersByTime(3_000);
    registry.register("r1", "p1", cb2);
    vi.advanceTimersByTime(5_000);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it("clearRoom clears all pending entries in a room", () => {
    const registry = new DisconnectRegistry(5_000);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    registry.register("r1", "p1", cb1);
    registry.register("r1", "p2", cb2);
    registry.clearRoom("r1");
    vi.advanceTimersByTime(10_000);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// End-to-end disconnect flows via game-handlers
// ---------------------------------------------------------------------------

describe("disconnect handling — in-game", () => {
  let store: RoomStore;
  let registry: DisconnectRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new RoomStore();
    registry = new DisconnectRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
    registry.clearAll();
  });

  it("reconnection within window restores state", () => {
    const spy = createBroadcastSpy();
    const roomId = setupPlayingSession(store, spy.broadcastToRoom);
    const session = getGameSession(roomId)!;

    // p2 disconnects
    const result = handleGameDisconnect(
      "p2" as PlayerId,
      roomId,
      { broadcastToRoom: spy.broadcastToRoom },
      store,
      registry,
    );
    expect(result.pendingReconnect).toBe(true);
    expect(session.isDisconnected("p2")).toBe(true);

    // Wait partial window then reconnect
    vi.advanceTimersByTime(5_000);

    const sendSpy = createSendSpy();
    const ok = handleRejoinRoom(
      { type: "rejoinRoom", roomId, player: { id: "p2", name: "Bob" } },
      "p2",
      { broadcastToRoom: spy.broadcastToRoom, send: sendSpy.send },
      registry,
    );
    expect(ok).toBe(true);
    expect(session.isDisconnected("p2")).toBe(false);

    // Player got a gameRejoined payload with full session state
    const rejoined = sendSpy.messages.find((m) => m.type === "gameRejoined");
    expect(rejoined).toBeDefined();
    if (rejoined?.type === "gameRejoined") {
      expect(rejoined.seed).toBe(session.seed);
      expect(rejoined.playerIndexes).toEqual({ p1: 0, p2: 1 });
      expect(Object.keys(rejoined.currentStates).sort()).toEqual(["p1", "p2"]);
    }

    // After full window, no forfeit should fire
    vi.advanceTimersByTime(RECONNECT_WINDOW_MS + 1_000);
    expect(session.state).toBe("playing");

    removeGameSession(roomId);
  });

  it("forfeits player when reconnect timer expires", async () => {
    const spy = createBroadcastSpy();
    const roomId = setupPlayingSession(store, spy.broadcastToRoom);
    const session = getGameSession(roomId)!;

    handleGameDisconnect(
      "p2",
      roomId,
      { broadcastToRoom: spy.broadcastToRoom },
      store,
      registry,
    );

    const msgCountBefore = spy.messages.length;
    vi.advanceTimersByTime(RECONNECT_WINDOW_MS + 10);

    // After expiry, a gameOver for p2 should have been broadcast
    const newMessages = spy.messages.slice(msgCountBefore);
    const gameOver = newMessages.find(
      (m) => m.msg.type === "gameOver" && (m.msg as any).playerId === "p2",
    );
    expect(gameOver).toBeDefined();

    // And a gameEnd declaring p1 the winner (only one remaining)
    const gameEnd = newMessages.find((m) => m.msg.type === "gameEnd");
    expect(gameEnd).toBeDefined();
    if (gameEnd?.msg.type === "gameEnd") {
      expect(gameEnd.msg.winnerId).toBe("p1");
    }
    // Session cleanup is async (onGameEnd runs through a promise chain).
    // Flush microtasks so the cleanup completes.
    await vi.advanceTimersByTimeAsync(0);
    // Session should be finished and torn down
    expect(getGameSession(roomId)).toBeUndefined();
    expect(store.getRoom(roomId)?.status).toBe("finished");
  });

  it("broadcasts playerDisconnected / playerReconnected to peers", () => {
    const spy = createBroadcastSpy();
    const roomId = setupPlayingSession(store, spy.broadcastToRoom);

    handleGameDisconnect(
      "p2",
      roomId,
      { broadcastToRoom: spy.broadcastToRoom },
      store,
      registry,
    );

    const pDisc = spy.messages.find((m) => m.msg.type === "playerDisconnected");
    expect(pDisc).toBeDefined();
    if (pDisc?.msg.type === "playerDisconnected") {
      expect(pDisc.msg.playerId).toBe("p2");
      expect(pDisc.msg.timeoutMs).toBe(RECONNECT_WINDOW_MS);
    }

    const sendSpy = createSendSpy();
    handleRejoinRoom(
      { type: "rejoinRoom", roomId, player: { id: "p2", name: "Bob" } },
      "p2",
      { broadcastToRoom: spy.broadcastToRoom, send: sendSpy.send },
      registry,
    );

    const pReconn = spy.messages.find((m) => m.msg.type === "playerReconnected");
    expect(pReconn).toBeDefined();
    if (pReconn?.msg.type === "playerReconnected") {
      expect(pReconn.msg.playerId).toBe("p2");
    }

    removeGameSession(roomId);
  });

  it("rapid disconnect/reconnect cycling does not leak timers or duplicate broadcasts", () => {
    const spy = createBroadcastSpy();
    const roomId = setupPlayingSession(store, spy.broadcastToRoom);
    const session = getGameSession(roomId)!;

    for (let i = 0; i < 5; i++) {
      handleGameDisconnect(
        "p2",
        roomId,
        { broadcastToRoom: spy.broadcastToRoom },
        store,
        registry,
      );
      expect(session.isDisconnected("p2")).toBe(true);

      const sendSpy = createSendSpy();
      handleRejoinRoom(
        { type: "rejoinRoom", roomId, player: { id: "p2", name: "Bob" } },
        "p2",
        { broadcastToRoom: spy.broadcastToRoom, send: sendSpy.send },
        registry,
      );
      expect(session.isDisconnected("p2")).toBe(false);
      vi.advanceTimersByTime(100);
    }

    // After many cycles, after a full window elapses there should still be
    // no forfeit — all timers cleared.
    const beforeCount = spy.messages.filter((m) => m.msg.type === "gameOver").length;
    vi.advanceTimersByTime(RECONNECT_WINDOW_MS + 1_000);
    const afterCount = spy.messages.filter((m) => m.msg.type === "gameOver").length;
    expect(afterCount).toBe(beforeCount);
    expect(session.state).toBe("playing");

    // Exactly one disconnect broadcast per cycle
    const discCount = spy.messages.filter(
      (m) => m.msg.type === "playerDisconnected",
    ).length;
    expect(discCount).toBe(5);

    removeGameSession(roomId);
  });

  it("second disconnect while already pending is a no-op", () => {
    const spy = createBroadcastSpy();
    const roomId = setupPlayingSession(store, spy.broadcastToRoom);

    const r1 = handleGameDisconnect(
      "p2",
      roomId,
      { broadcastToRoom: spy.broadcastToRoom },
      store,
      registry,
    );
    expect(r1.pendingReconnect).toBe(true);

    const r2 = handleGameDisconnect(
      "p2",
      roomId,
      { broadcastToRoom: spy.broadcastToRoom },
      store,
      registry,
    );
    expect(r2.pendingReconnect).toBe(false);

    const discBroadcasts = spy.messages.filter(
      (m) => m.msg.type === "playerDisconnected",
    );
    expect(discBroadcasts).toHaveLength(1);

    removeGameSession(roomId);
  });

  it("rejoin fails for player not pending reconnect", () => {
    const spy = createBroadcastSpy();
    const roomId = setupPlayingSession(store, spy.broadcastToRoom);
    const sendSpy = createSendSpy();

    const ok = handleRejoinRoom(
      { type: "rejoinRoom", roomId, player: { id: "p2", name: "Bob" } },
      "p2",
      { broadcastToRoom: spy.broadcastToRoom, send: sendSpy.send },
      registry,
    );
    expect(ok).toBe(false);
    const err = sendSpy.messages.find((m) => m.type === "error");
    expect(err).toBeDefined();

    removeGameSession(roomId);
  });

  it("disconnected player's engine does not advance during the window", () => {
    const spy = createBroadcastSpy();
    const roomId = setupPlayingSession(store, spy.broadcastToRoom);
    const session = getGameSession(roomId)!;

    const before = session.getPlayerEngine("p2")!.getSnapshot();
    handleGameDisconnect(
      "p2",
      roomId,
      { broadcastToRoom: spy.broadcastToRoom },
      store,
      registry,
    );

    // Let several tick intervals pass
    vi.advanceTimersByTime(500);
    const after = session.getPlayerEngine("p2")!.getSnapshot();
    // The frozen player's tick counter should be unchanged (no advanceTick calls)
    expect(after.tick).toBe(before.tick);

    // Reset so cleanup is clean
    const sendSpy = createSendSpy();
    handleRejoinRoom(
      { type: "rejoinRoom", roomId, player: { id: "p2", name: "Bob" } },
      "p2",
      { broadcastToRoom: spy.broadcastToRoom, send: sendSpy.send },
      registry,
    );
    removeGameSession(roomId);
  });
});

// ---------------------------------------------------------------------------
// Lobby-room disconnect — immediate cleanup (no game session)
// ---------------------------------------------------------------------------

describe("disconnect handling — lobby", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("disconnect without a game session is a no-op (pendingReconnect=false)", () => {
    const store = new RoomStore();
    const spy = createBroadcastSpy();
    const registry = new DisconnectRegistry();

    store.createRoom(
      { name: "Test", maxPlayers: 4 },
      { id: "p1", name: "Alice" },
    );

    const result = handleGameDisconnect(
      "p1",
      "nonexistent",
      { broadcastToRoom: spy.broadcastToRoom },
      store,
      registry,
    );
    expect(result.pendingReconnect).toBe(false);
  });

  // The waiting-room removal path is driven by handleDisconnect in
  // lobby-handlers (unchanged). Here we just verify handleGameDisconnect
  // doesn't try to start a reconnect window when the session is still in
  // countdown.
  it("countdown disconnect still cancels the session (no reconnect window)", () => {
    const store = new RoomStore();
    const spy = createBroadcastSpy();
    const registry = new DisconnectRegistry();

    const room = store.createRoom(
      { name: "Test", maxPlayers: 4 },
      { id: "p1", name: "Alice" },
    );
    store.addPlayer(room.id, { id: "p2", name: "Bob" });
    startGameCountdown(room.id, store, { broadcastToRoom: spy.broadcastToRoom });

    const result = handleGameDisconnect(
      "p2",
      room.id,
      { broadcastToRoom: spy.broadcastToRoom },
      store,
      registry,
    );

    expect(result.pendingReconnect).toBe(false);
    expect(getGameSession(room.id)).toBeUndefined();
    // No playerDisconnected broadcast — countdown gets cancelled instead
    const pDisc = spy.messages.find((m) => m.msg.type === "playerDisconnected");
    expect(pDisc).toBeUndefined();
  });
});
