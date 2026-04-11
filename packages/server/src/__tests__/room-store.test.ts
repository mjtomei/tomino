import { describe, it, expect } from "vitest";
import { RoomStore } from "../room-store.js";

function makePlayer(id: string, name?: string) {
  return { id, name: name ?? `Player ${id}` };
}

describe("RoomStore", () => {
  describe("createRoom", () => {
    it("creates a room and returns its state", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );

      expect(room.id).toHaveLength(5);
      expect(room.status).toBe("waiting");
      expect(room.hostId).toBe("p1");
      expect(room.players).toHaveLength(1);
      expect(store.roomCount).toBe(1);
    });

    it("tracks the player-to-room mapping", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );

      expect(store.getRoomForPlayer("p1")).toBe(room);
      expect(store.getRoomIdForPlayer("p1")).toBe(room.id);
    });

    it("throws if the player is already in a room", () => {
      const store = new RoomStore();
      store.createRoom({ name: "Room1", maxPlayers: 4 }, makePlayer("p1"));

      expect(() =>
        store.createRoom({ name: "Room2", maxPlayers: 4 }, makePlayer("p1")),
      ).toThrow("already in a room");
    });

    it("generates unique room codes", () => {
      const store = new RoomStore();
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const room = store.createRoom(
          { name: `Room ${i}`, maxPlayers: 4 },
          makePlayer(`p${i}`),
        );
        expect(codes.has(room.id)).toBe(false);
        codes.add(room.id);
      }
    });
  });

  describe("addPlayer", () => {
    it("adds a player to an existing room", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );

      const result = store.addPlayer(room.id, makePlayer("p2"));
      expect("ok" in result).toBe(true);
      if ("ok" in result) {
        expect(result.ok.players).toHaveLength(2);
      }
    });

    it("rejects when room is full", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 2 },
        makePlayer("p1"),
      );
      store.addPlayer(room.id, makePlayer("p2"));

      const result = store.addPlayer(room.id, makePlayer("p3"));
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.code).toBe("ROOM_FULL");
      }
    });

    it("rejects when room does not exist", () => {
      const store = new RoomStore();
      const result = store.addPlayer("ZZZZZ", makePlayer("p1"));
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.code).toBe("ROOM_NOT_FOUND");
      }
    });

    it("rejects when game is in progress", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );
      store.setStatus(room.id, "playing");

      const result = store.addPlayer(room.id, makePlayer("p2"));
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.code).toBe("GAME_IN_PROGRESS");
      }
    });

    it("rejects when player is already in a room", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );

      const result = store.addPlayer(room.id, makePlayer("p1"));
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.code).toBe("ALREADY_IN_ROOM");
      }
    });
  });

  describe("removePlayer", () => {
    it("removes a player and returns room info", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );
      store.addPlayer(room.id, makePlayer("p2"));

      const result = store.removePlayer("p2");
      expect(result).not.toBeNull();
      expect(result!.room).not.toBeNull();
      expect(result!.room!.players).toHaveLength(1);
      expect(result!.hostChanged).toBe(false);
    });

    it("deletes the room when the last player leaves", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );

      const result = store.removePlayer("p1");
      expect(result).not.toBeNull();
      expect(result!.room).toBeNull();
      expect(store.roomCount).toBe(0);
    });

    it("transfers host when the host leaves", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("host"),
      );
      store.addPlayer(room.id, makePlayer("p2"));
      store.addPlayer(room.id, makePlayer("p3"));

      const result = store.removePlayer("host");
      expect(result).not.toBeNull();
      expect(result!.hostChanged).toBe(true);
      expect(result!.room!.hostId).toBe("p2");
    });

    it("does not change host when a non-host leaves", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("host"),
      );
      store.addPlayer(room.id, makePlayer("p2"));

      const result = store.removePlayer("p2");
      expect(result!.hostChanged).toBe(false);
      expect(result!.room!.hostId).toBe("host");
    });

    it("returns null for a player not in any room", () => {
      const store = new RoomStore();
      expect(store.removePlayer("nobody")).toBeNull();
    });

    it("cleans up player-room mapping", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );
      store.addPlayer(room.id, makePlayer("p2"));

      store.removePlayer("p2");
      expect(store.getRoomForPlayer("p2")).toBeUndefined();
      // p2 can now join another room
      const room2 = store.createRoom(
        { name: "Test2", maxPlayers: 4 },
        makePlayer("p2"),
      );
      expect(room2).toBeDefined();
    });
  });

  describe("setStatus", () => {
    it("changes the room status", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );

      expect(store.setStatus(room.id, "playing")).toBe(true);
      expect(store.getRoom(room.id)!.status).toBe("playing");
    });

    it("returns false for non-existent room", () => {
      const store = new RoomStore();
      expect(store.setStatus("ZZZZZ", "playing")).toBe(false);
    });
  });

  describe("deleteRoom", () => {
    it("removes the room and cleans up all player mappings", () => {
      const store = new RoomStore();
      const room = store.createRoom(
        { name: "Test", maxPlayers: 4 },
        makePlayer("p1"),
      );
      store.addPlayer(room.id, makePlayer("p2"));

      expect(store.deleteRoom(room.id)).toBe(true);
      expect(store.roomCount).toBe(0);
      expect(store.getRoomForPlayer("p1")).toBeUndefined();
      expect(store.getRoomForPlayer("p2")).toBeUndefined();
    });

    it("returns false for non-existent room", () => {
      const store = new RoomStore();
      expect(store.deleteRoom("ZZZZZ")).toBe(false);
    });
  });
});
