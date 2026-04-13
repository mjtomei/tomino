import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ServerMessage, RoomId, ErrorCode } from "@tomino/shared";
import { RoomStore } from "../room-store.js";
import {
  startGameCountdown,
  handleSendEmote,
  clearEmoteCooldowns,
  EMOTE_COOLDOWN_MS,
} from "../handlers/game-handlers.js";
import { removeGameSession } from "../game-session.js";

function createBroadcastSpy() {
  const messages: { roomId: RoomId; msg: ServerMessage }[] = [];
  return {
    messages,
    broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => {
      messages.push({ roomId, msg });
    },
  };
}

describe("handleSendEmote", () => {
  let store: RoomStore;
  let spy: ReturnType<typeof createBroadcastSpy>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new RoomStore();
    spy = createBroadcastSpy();
    clearEmoteCooldowns();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function startSession(): string {
    const room = store.createRoom(
      { name: "T", maxPlayers: 4 },
      { id: "p1", name: "Alice" },
    );
    store.addPlayer(room.id, { id: "p2", name: "Bob" });
    startGameCountdown(room.id, store, { broadcastToRoom: spy.broadcastToRoom });
    vi.advanceTimersByTime(4000);
    spy.messages.length = 0;
    return room.id;
  }

  function captureErrors() {
    const errors: Array<{ code: ErrorCode; message: string }> = [];
    return {
      errors,
      send: (code: ErrorCode, message: string) => errors.push({ code, message }),
    };
  }

  it("broadcasts playerEmote to the room on a valid emote from a player", () => {
    const roomId = startSession();
    const err = captureErrors();
    let now = 10_000;

    handleSendEmote(
      { type: "sendEmote", roomId, emote: "fire" },
      "p1",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
      { now: () => now },
    );

    expect(err.errors).toEqual([]);
    const emoteMsgs = spy.messages.filter((m) => m.msg.type === "playerEmote");
    expect(emoteMsgs).toHaveLength(1);
    const msg = emoteMsgs[0]!.msg;
    expect(msg).toMatchObject({
      type: "playerEmote",
      roomId,
      playerId: "p1",
      emote: "fire",
      timestamp: 10_000,
    });

    removeGameSession(roomId);
  });

  it("rejects unknown emote kinds", () => {
    const roomId = startSession();
    const err = captureErrors();
    handleSendEmote(
      // @ts-expect-error: intentionally invalid emote kind
      { type: "sendEmote", roomId, emote: "dance" },
      "p1",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
    );
    expect(err.errors).toHaveLength(1);
    expect(err.errors[0]!.code).toBe("INVALID_MESSAGE");
    expect(spy.messages.filter((m) => m.msg.type === "playerEmote")).toHaveLength(0);
    removeGameSession(roomId);
  });

  it("rejects when no session exists for the room", () => {
    const err = captureErrors();
    handleSendEmote(
      { type: "sendEmote", roomId: "ghost-room", emote: "gg" },
      "p1",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
    );
    expect(err.errors[0]!.code).toBe("ROOM_NOT_FOUND");
  });

  it("rejects when sender is not in the session", () => {
    const roomId = startSession();
    const err = captureErrors();
    handleSendEmote(
      { type: "sendEmote", roomId, emote: "wave" },
      "outsider",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
    );
    expect(err.errors[0]!.code).toBe("NOT_IN_ROOM");
    removeGameSession(roomId);
  });

  it("rate-limits: a second emote within the cooldown is dropped silently", () => {
    const roomId = startSession();
    const err = captureErrors();
    let now = 10_000;

    handleSendEmote(
      { type: "sendEmote", roomId, emote: "fire" },
      "p1",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
      { now: () => now },
    );
    now += Math.floor(EMOTE_COOLDOWN_MS / 2);
    handleSendEmote(
      { type: "sendEmote", roomId, emote: "fire" },
      "p1",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
      { now: () => now },
    );

    expect(spy.messages.filter((m) => m.msg.type === "playerEmote")).toHaveLength(1);
    expect(err.errors).toEqual([]);
    removeGameSession(roomId);
  });

  it("allows a second emote after the cooldown expires", () => {
    const roomId = startSession();
    const err = captureErrors();
    let now = 10_000;

    handleSendEmote(
      { type: "sendEmote", roomId, emote: "fire" },
      "p1",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
      { now: () => now },
    );
    now += EMOTE_COOLDOWN_MS + 1;
    handleSendEmote(
      { type: "sendEmote", roomId, emote: "gg" },
      "p1",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
      { now: () => now },
    );

    expect(spy.messages.filter((m) => m.msg.type === "playerEmote")).toHaveLength(2);
    removeGameSession(roomId);
  });

  it("cooldown is per-player (different players can emote concurrently)", () => {
    const roomId = startSession();
    const err = captureErrors();
    const now = 10_000;

    handleSendEmote(
      { type: "sendEmote", roomId, emote: "fire" },
      "p1",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
      { now: () => now },
    );
    handleSendEmote(
      { type: "sendEmote", roomId, emote: "wave" },
      "p2",
      { broadcastToRoom: spy.broadcastToRoom },
      err.send,
      { now: () => now },
    );

    expect(spy.messages.filter((m) => m.msg.type === "playerEmote")).toHaveLength(2);
    removeGameSession(roomId);
  });
});
