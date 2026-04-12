import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  PlayerId,
  RoomId,
  ServerMessage,
  TargetingStrategy,
} from "@tetris/shared";
import { assertGarbageInserted } from "@tetris/shared/__test-utils__/assertions.js";
import { makeGarbageBatch } from "@tetris/shared/__test-utils__/factories.js";
import {
  createGameSession,
  removeGameSession,
} from "../game-session.js";

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

function startSession(
  spy: ReturnType<typeof createBroadcastSpy>,
  targetingStrategy?: TargetingStrategy,
) {
  const opts: Parameters<typeof createGameSession>[0] = {
    roomId: "room-1",
    players: PLAYERS,
    broadcastToRoom: spy.broadcastToRoom,
    garbageDelayMs: 0, // apply garbage immediately for deterministic tests
  };
  if (targetingStrategy) opts.targetingStrategy = targetingStrategy;
  const session = createGameSession(opts);
  session.startCountdown();
  vi.advanceTimersByTime(4000);
  return session;
}

describe("GameSession garbage integration", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    removeGameSession("room-1");
  });

  it("inserts a garbage batch into a player's board (assertGarbageInserted)", () => {
    const spy = createBroadcastSpy();
    const session = startSession(spy);

    const engine = session.getPlayerEngine("p2")!;
    const before = engine.getSnapshot();

    const batch = makeGarbageBatch({ lines: 2, gapColumn: 5 });
    engine.applyGarbage([batch]);

    const after = engine.getSnapshot();
    assertGarbageInserted(before, after, batch);
  });

  it("broadcasts garbageQueued when garbage is enqueued, and garbageReceived when applied", () => {
    const spy = createBroadcastSpy();
    // Force all garbage to p2 so we don't depend on line-clear calculation.
    const toP2: TargetingStrategy = {
      resolveTargets: (_s, _p, ctx) =>
        ctx.linesToSend > 0
          ? [{ playerId: "p2" as PlayerId, lines: ctx.linesToSend }]
          : [],
    };
    const session = startSession(spy, toP2);

    // Clear the broadcast log so we only see garbage-related messages.
    spy.messages.length = 0;

    // Simulate p1 clearing 4 lines by injecting a line-clear event directly
    // via the manager path: we reach in via the public engine.applyInput cycle
    // is too involved. Instead, call the manager's drainReady path by mutating
    // the engine's event. Use the untyped `any` handshake for the test.
    //
    // Easier: stage a line-clear event on the engine by calling the engine's
    // private path through applyInput + manual board mutation is out of scope.
    // We use the GarbageManager directly via the session's internal field.
    const anySession = session as unknown as {
      garbageManager: {
        onLinesCleared: (
          p: PlayerId,
          ev: {
            linesCleared: 4;
            tSpin: "none";
            combo: number;
            b2b: number;
          },
        ) => void;
      };
    };
    anySession.garbageManager.onLinesCleared("p1", {
      linesCleared: 4,
      tSpin: "none",
      combo: 0,
      b2b: -1,
    });

    // Advance one tick so onTick runs processGarbageFor (delay=0, so drains).
    vi.advanceTimersByTime(20);

    const queuedMsgs = spy.messages
      .map((m) => m.msg)
      .filter((m) => m.type === "garbageQueued");
    const receivedMsgs = spy.messages
      .map((m) => m.msg)
      .filter((m) => m.type === "garbageReceived");

    // At least one queuedMsg for p2 (when enqueued) and one for p2 (when drained → pending cleared).
    expect(
      queuedMsgs.some((m) => m.type === "garbageQueued" && m.playerId === "p2"),
    ).toBe(true);
    expect(
      receivedMsgs.some(
        (m) => m.type === "garbageReceived" && m.playerId === "p2",
      ),
    ).toBe(true);
  });
});
