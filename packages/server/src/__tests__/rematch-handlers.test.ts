import { describe, it, expect, beforeEach } from "vitest";
import type { ServerMessage, RoomId, PlayerId } from "@tetris/shared";
import { RoomStore } from "../room-store.js";
import {
  handleRequestRematch,
  removeRematchVote,
  clearRematchVotes,
  hasRematchVotes,
  type RematchHandlerContext,
} from "../handlers/rematch-handlers.js";

function createBroadcastSpy() {
  const messages: { roomId: RoomId; msg: ServerMessage }[] = [];
  const sent: ServerMessage[] = [];
  return {
    messages,
    sent,
    broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => {
      messages.push({ roomId, msg });
    },
    send: (msg: ServerMessage) => {
      sent.push(msg);
    },
  };
}

function makeCtx(spy: ReturnType<typeof createBroadcastSpy>): RematchHandlerContext {
  return {
    broadcastToRoom: spy.broadcastToRoom,
    send: spy.send,
  };
}

describe("rematch-handlers", () => {
  let store: RoomStore;

  beforeEach(() => {
    store = new RoomStore();
  });

  function setupFinishedRoom(): string {
    const room = store.createRoom(
      { name: "Test", maxPlayers: 4 },
      { id: "host", name: "Host" },
    );
    store.addPlayer(room.id, { id: "p2", name: "P2" });
    store.setStatus(room.id, "finished");
    return room.id;
  }

  function setupFinishedRoom3Players(): string {
    const room = store.createRoom(
      { name: "Test", maxPlayers: 4 },
      { id: "host", name: "Host" },
    );
    store.addPlayer(room.id, { id: "p2", name: "P2" });
    store.addPlayer(room.id, { id: "p3", name: "P3" });
    store.setStatus(room.id, "finished");
    return room.id;
  }

  describe("handleRequestRematch", () => {
    it("records a vote and broadcasts update", () => {
      const roomId = setupFinishedRoom();
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("host", roomId, ctx, store);

      expect(hasRematchVotes(roomId)).toBe(true);
      expect(spy.messages).toHaveLength(1);
      const msg = spy.messages[0]!.msg;
      expect(msg.type).toBe("rematchUpdate");
      if (msg.type === "rematchUpdate") {
        expect(msg.votes).toEqual(["host"]);
        expect(msg.totalPlayers).toBe(2);
      }
    });

    it("ignores duplicate votes from the same player", () => {
      const roomId = setupFinishedRoom();
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("host", roomId, ctx, store);
      handleRequestRematch("host", roomId, ctx, store);

      // Only one broadcast (the first vote)
      expect(spy.messages).toHaveLength(1);
    });

    it("rejects vote when room not found", () => {
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("host", "XXXX" as RoomId, ctx, store);

      expect(spy.sent).toHaveLength(1);
      expect(spy.sent[0]!.type).toBe("error");
    });

    it("rejects vote when game is not finished", () => {
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        { id: "host", name: "Host" },
      );
      store.addPlayer(room.id, { id: "p2", name: "P2" });
      // status is "waiting", not "finished"

      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("host", room.id, ctx, store);

      expect(spy.sent).toHaveLength(1);
      expect(spy.sent[0]!.type).toBe("error");
    });

    it("rejects vote from player not in room", () => {
      const roomId = setupFinishedRoom();
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("stranger", roomId, ctx, store);

      expect(spy.sent).toHaveLength(1);
      expect(spy.sent[0]!.type).toBe("error");
    });
  });

  describe("unanimous rematch", () => {
    it("resets room to waiting when all players vote yes", () => {
      const roomId = setupFinishedRoom();
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("host", roomId, ctx, store);
      handleRequestRematch("p2", roomId, ctx, store);

      // Should have: rematchUpdate (vote 1), rematchUpdate (vote 2), roomUpdated
      const types = spy.messages.map((m) => m.msg.type);
      expect(types).toEqual(["rematchUpdate", "rematchUpdate", "roomUpdated"]);

      const room = store.getRoom(roomId);
      expect(room).toBeDefined();
      expect(room!.status).toBe("waiting");
      expect(hasRematchVotes(roomId)).toBe(false);
    });

    it("resets room to waiting with 3 players", () => {
      const roomId = setupFinishedRoom3Players();
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("host", roomId, ctx, store);
      handleRequestRematch("p2", roomId, ctx, store);

      // After 2 of 3 votes, still waiting
      const room1 = store.getRoom(roomId);
      expect(room1!.status).toBe("finished");

      handleRequestRematch("p3", roomId, ctx, store);

      // Now all 3 voted — room should be waiting
      const room2 = store.getRoom(roomId);
      expect(room2!.status).toBe("waiting");
    });

    it("preserves all players and host after rematch", () => {
      const roomId = setupFinishedRoom();
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("host", roomId, ctx, store);
      handleRequestRematch("p2", roomId, ctx, store);

      const room = store.getRoom(roomId);
      expect(room!.players).toHaveLength(2);
      expect(room!.hostId).toBe("host");
    });
  });

  describe("player leave during vote", () => {
    it("returns remaining players to waiting room when a player leaves", () => {
      const roomId = setupFinishedRoom3Players();
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      // One player votes, then another leaves
      handleRequestRematch("host", roomId, ctx, store);
      store.removePlayer("p3");
      removeRematchVote(roomId, "p3", ctx, store);

      const room = store.getRoom(roomId);
      expect(room!.status).toBe("waiting");
      expect(room!.players).toHaveLength(2);
      expect(hasRematchVotes(roomId)).toBe(false);
    });

    it("clears votes when room becomes empty", () => {
      const roomId = setupFinishedRoom();
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("host", roomId, ctx, store);
      store.removePlayer("host");
      store.removePlayer("p2");
      removeRematchVote(roomId, "p2", ctx, store);

      expect(hasRematchVotes(roomId)).toBe(false);
    });
  });

  describe("clearRematchVotes", () => {
    it("clears all votes for a room", () => {
      const roomId = setupFinishedRoom();
      const spy = createBroadcastSpy();
      const ctx = makeCtx(spy);

      handleRequestRematch("host", roomId, ctx, store);
      expect(hasRematchVotes(roomId)).toBe(true);

      clearRematchVotes(roomId);
      expect(hasRematchVotes(roomId)).toBe(false);
    });

    it("is a no-op for unknown rooms", () => {
      clearRematchVotes("XXXX" as RoomId);
      // Should not throw
    });
  });
});
