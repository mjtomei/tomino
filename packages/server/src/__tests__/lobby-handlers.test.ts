import { describe, it, expect, beforeEach } from "vitest";
import { RoomStore } from "../room-store.js";
import {
  handleCreateRoom,
  handleJoinRoom,
  handleLeaveRoom,
  handleStartGame,
  handleUpdateRoomSettings,
  handleDisconnect,
  type HandlerContext,
} from "../handlers/lobby-handlers.js";
import type { ServerMessage, HandicapSettings } from "@tetris/shared";

function createMockContext(playerId: string): HandlerContext & {
  sent: ServerMessage[];
  broadcasts: { roomId: string; msg: ServerMessage }[];
  broadcastsExcept: { roomId: string; msg: ServerMessage; excluded: string }[];
} {
  const sent: ServerMessage[] = [];
  const broadcasts: { roomId: string; msg: ServerMessage }[] = [];
  const broadcastsExcept: {
    roomId: string;
    msg: ServerMessage;
    excluded: string;
  }[] = [];

  return {
    playerId,
    sent,
    broadcasts,
    broadcastsExcept,
    send: (msg) => sent.push(msg),
    broadcastToRoom: (roomId, msg) => broadcasts.push({ roomId, msg }),
    broadcastToRoomExcept: (roomId, msg, excludePlayerId) =>
      broadcastsExcept.push({ roomId, msg, excluded: excludePlayerId }),
  };
}

describe("lobby handlers", () => {
  let store: RoomStore;

  beforeEach(() => {
    store = new RoomStore();
  });

  describe("handleCreateRoom", () => {
    it("creates a room and sends roomCreated", () => {
      const ctx = createMockContext("p1");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "p1", name: "Alice" },
        },
        ctx,
        store,
      );

      expect(ctx.sent).toHaveLength(1);
      expect(ctx.sent[0].type).toBe("roomCreated");
      if (ctx.sent[0].type === "roomCreated") {
        expect(ctx.sent[0].room.hostId).toBe("p1");
        expect(ctx.sent[0].room.status).toBe("waiting");
        expect(ctx.sent[0].room.players[0].name).toBe("Alice");
      }
      expect(store.roomCount).toBe(1);
    });

    it("rejects if player is already in a room", () => {
      const ctx = createMockContext("p1");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Room1", maxPlayers: 4 },
          player: { id: "p1", name: "Alice" },
        },
        ctx,
        store,
      );

      const ctx2 = createMockContext("p1");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Room2", maxPlayers: 4 },
          player: { id: "p1", name: "Alice" },
        },
        ctx2,
        store,
      );

      expect(ctx2.sent).toHaveLength(1);
      expect(ctx2.sent[0].type).toBe("error");
    });
  });

  describe("handleJoinRoom", () => {
    it("adds player and sends roomUpdated to joiner, playerJoined to others", () => {
      // Create room first
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;

      // Join room
      const joinCtx = createMockContext("p2");
      handleJoinRoom(
        {
          type: "joinRoom",
          roomId,
          player: { id: "p2", name: "Bob" },
        },
        joinCtx,
        store,
      );

      // Joiner receives roomUpdated
      expect(joinCtx.sent).toHaveLength(1);
      expect(joinCtx.sent[0].type).toBe("roomUpdated");

      // Others receive playerJoined (broadcast excluding joiner)
      expect(joinCtx.broadcastsExcept).toHaveLength(1);
      expect(joinCtx.broadcastsExcept[0].msg.type).toBe("playerJoined");
      expect(joinCtx.broadcastsExcept[0].excluded).toBe("p2");
    });

    it("rejects with ROOM_NOT_FOUND for invalid code", () => {
      const ctx = createMockContext("p1");
      handleJoinRoom(
        {
          type: "joinRoom",
          roomId: "ZZZZZ",
          player: { id: "p1", name: "Alice" },
        },
        ctx,
        store,
      );

      expect(ctx.sent).toHaveLength(1);
      expect(ctx.sent[0].type).toBe("error");
      if (ctx.sent[0].type === "error") {
        expect(ctx.sent[0].code).toBe("ROOM_NOT_FOUND");
      }
    });

    it("rejects with ROOM_FULL when at capacity", () => {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 2 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;

      // Fill the room
      const p2Ctx = createMockContext("p2");
      handleJoinRoom(
        { type: "joinRoom", roomId, player: { id: "p2", name: "P2" } },
        p2Ctx,
        store,
      );

      // Try to add a third player
      const p3Ctx = createMockContext("p3");
      handleJoinRoom(
        { type: "joinRoom", roomId, player: { id: "p3", name: "P3" } },
        p3Ctx,
        store,
      );

      expect(p3Ctx.sent[0].type).toBe("error");
      if (p3Ctx.sent[0].type === "error") {
        expect(p3Ctx.sent[0].code).toBe("ROOM_FULL");
      }
    });

    it("rejects with GAME_IN_PROGRESS when game has started", () => {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;

      // Add second player and start game
      store.addPlayer(roomId, { id: "p2", name: "P2" });
      store.setStatus(roomId, "playing");

      const joinCtx = createMockContext("p3");
      handleJoinRoom(
        { type: "joinRoom", roomId, player: { id: "p3", name: "P3" } },
        joinCtx,
        store,
      );

      expect(joinCtx.sent[0].type).toBe("error");
      if (joinCtx.sent[0].type === "error") {
        expect(joinCtx.sent[0].code).toBe("GAME_IN_PROGRESS");
      }
    });
  });

  describe("handleLeaveRoom", () => {
    it("removes player and broadcasts playerLeft", () => {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;
      store.addPlayer(roomId, { id: "p2", name: "P2" });

      const leaveCtx = createMockContext("p2");
      handleLeaveRoom(
        { type: "leaveRoom", roomId },
        leaveCtx,
        store,
      );

      expect(leaveCtx.broadcasts).toHaveLength(1);
      expect(leaveCtx.broadcasts[0].msg.type).toBe("playerLeft");
    });

    it("broadcasts roomUpdated when host leaves and transfers", () => {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;
      store.addPlayer(roomId, { id: "p2", name: "P2" });

      const leaveCtx = createMockContext("host");
      handleLeaveRoom(
        { type: "leaveRoom", roomId },
        leaveCtx,
        store,
      );

      // Should get playerLeft + roomUpdated (for host change)
      expect(leaveCtx.broadcasts).toHaveLength(2);
      expect(leaveCtx.broadcasts[0].msg.type).toBe("playerLeft");
      expect(leaveCtx.broadcasts[1].msg.type).toBe("roomUpdated");
      if (leaveCtx.broadcasts[1].msg.type === "roomUpdated") {
        expect(leaveCtx.broadcasts[1].msg.room.hostId).toBe("p2");
      }
    });

    it("sends error when player is not in a room", () => {
      const ctx = createMockContext("nobody");
      handleLeaveRoom(
        { type: "leaveRoom", roomId: "ZZZZZ" },
        ctx,
        store,
      );

      expect(ctx.sent).toHaveLength(1);
      expect(ctx.sent[0].type).toBe("error");
      if (ctx.sent[0].type === "error") {
        expect(ctx.sent[0].code).toBe("NOT_IN_ROOM");
      }
    });
  });

  describe("handleStartGame", () => {
    function setupRoom(store: RoomStore) {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;
      store.addPlayer(roomId, { id: "p2", name: "P2" });
      return roomId;
    }

    it("starts the game and broadcasts gameStarted", () => {
      const roomId = setupRoom(store);
      const ctx = createMockContext("host");

      handleStartGame({ type: "startGame", roomId }, ctx, store);

      expect(ctx.broadcasts).toHaveLength(1);
      expect(ctx.broadcasts[0].msg.type).toBe("gameStarted");
      expect(store.getRoom(roomId)!.status).toBe("playing");
    });

    it("rejects if sender is not the host", () => {
      const roomId = setupRoom(store);
      const ctx = createMockContext("p2");

      handleStartGame({ type: "startGame", roomId }, ctx, store);

      expect(ctx.sent).toHaveLength(1);
      expect(ctx.sent[0].type).toBe("error");
      if (ctx.sent[0].type === "error") {
        expect(ctx.sent[0].code).toBe("NOT_HOST");
      }
    });

    it("rejects with fewer than 2 players", () => {
      // Create a room with only the host
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Solo", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;

      const ctx = createMockContext("host");
      handleStartGame({ type: "startGame", roomId }, ctx, store);

      expect(ctx.sent).toHaveLength(1);
      expect(ctx.sent[0].type).toBe("error");
    });

    it("rejects if room does not exist", () => {
      const ctx = createMockContext("host");
      handleStartGame({ type: "startGame", roomId: "ZZZZZ" }, ctx, store);

      expect(ctx.sent[0].type).toBe("error");
      if (ctx.sent[0].type === "error") {
        expect(ctx.sent[0].code).toBe("ROOM_NOT_FOUND");
      }
    });

    it("rejects if game is already in progress", () => {
      const roomId = setupRoom(store);
      store.setStatus(roomId, "playing");

      const ctx = createMockContext("host");
      handleStartGame({ type: "startGame", roomId }, ctx, store);

      expect(ctx.sent[0].type).toBe("error");
      if (ctx.sent[0].type === "error") {
        expect(ctx.sent[0].code).toBe("GAME_IN_PROGRESS");
      }
    });
  });

  describe("handleDisconnect", () => {
    it("removes disconnected player from their room", () => {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;
      store.addPlayer(roomId, { id: "p2", name: "P2" });

      const broadcasts: { roomId: string; msg: ServerMessage }[] = [];
      handleDisconnect(
        "p2",
        { broadcastToRoom: (rid, msg) => broadcasts.push({ roomId: rid, msg }) },
        store,
      );

      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0].msg.type).toBe("playerLeft");
      expect(store.getRoom(roomId)!.players).toHaveLength(1);
    });

    it("transfers host and broadcasts roomUpdated on host disconnect", () => {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;
      store.addPlayer(roomId, { id: "p2", name: "P2" });

      const broadcasts: { roomId: string; msg: ServerMessage }[] = [];
      handleDisconnect(
        "host",
        { broadcastToRoom: (rid, msg) => broadcasts.push({ roomId: rid, msg }) },
        store,
      );

      expect(broadcasts).toHaveLength(2);
      expect(broadcasts[0].msg.type).toBe("playerLeft");
      expect(broadcasts[1].msg.type).toBe("roomUpdated");
      if (broadcasts[1].msg.type === "roomUpdated") {
        expect(broadcasts[1].msg.room.hostId).toBe("p2");
      }
    });

    it("deletes room when last player disconnects", () => {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );

      const broadcasts: { roomId: string; msg: ServerMessage }[] = [];
      handleDisconnect(
        "host",
        { broadcastToRoom: (rid, msg) => broadcasts.push({ roomId: rid, msg }) },
        store,
      );

      expect(store.roomCount).toBe(0);
      // No broadcasts since no one is left
      expect(broadcasts).toHaveLength(0);
    });

    it("does nothing for a player not in any room", () => {
      const broadcasts: { roomId: string; msg: ServerMessage }[] = [];
      handleDisconnect(
        "ghost",
        { broadcastToRoom: (rid, msg) => broadcasts.push({ roomId: rid, msg }) },
        store,
      );

      expect(broadcasts).toHaveLength(0);
    });
  });

  describe("handleUpdateRoomSettings", () => {
    const validSettings: HandicapSettings = {
      intensity: "standard",
      mode: "boost",
      targetingBiasStrength: 0.7,
      delayEnabled: false,
      messinessEnabled: false,
    };

    function setupRoom(store: RoomStore) {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;
      store.addPlayer(roomId, { id: "p2", name: "P2" });
      return roomId;
    }

    it("updates settings and broadcasts roomUpdated", () => {
      const roomId = setupRoom(store);
      const ctx = createMockContext("host");

      handleUpdateRoomSettings(
        {
          type: "updateRoomSettings",
          roomId,
          handicapSettings: validSettings,
          ratingVisible: true,
        },
        ctx,
        store,
      );

      expect(ctx.broadcasts).toHaveLength(1);
      expect(ctx.broadcasts[0].msg.type).toBe("roomUpdated");
      const room = store.getRoom(roomId)!;
      expect(room.handicapSettings).toEqual(validSettings);
      expect(room.ratingVisible).toBe(true);
    });

    it("rejects if sender is not the host", () => {
      const roomId = setupRoom(store);
      const ctx = createMockContext("p2");

      handleUpdateRoomSettings(
        {
          type: "updateRoomSettings",
          roomId,
          handicapSettings: validSettings,
          ratingVisible: true,
        },
        ctx,
        store,
      );

      expect(ctx.sent).toHaveLength(1);
      expect(ctx.sent[0].type).toBe("error");
      if (ctx.sent[0].type === "error") {
        expect(ctx.sent[0].code).toBe("NOT_HOST");
      }
    });

    it("rejects for nonexistent room", () => {
      const ctx = createMockContext("host");
      handleUpdateRoomSettings(
        {
          type: "updateRoomSettings",
          roomId: "ZZZZZ",
          handicapSettings: validSettings,
          ratingVisible: true,
        },
        ctx,
        store,
      );

      expect(ctx.sent[0].type).toBe("error");
      if (ctx.sent[0].type === "error") {
        expect(ctx.sent[0].code).toBe("ROOM_NOT_FOUND");
      }
    });

    it("rejects if game is in progress", () => {
      const roomId = setupRoom(store);
      store.setStatus(roomId, "playing");
      const ctx = createMockContext("host");

      handleUpdateRoomSettings(
        {
          type: "updateRoomSettings",
          roomId,
          handicapSettings: validSettings,
          ratingVisible: true,
        },
        ctx,
        store,
      );

      expect(ctx.sent[0].type).toBe("error");
      if (ctx.sent[0].type === "error") {
        expect(ctx.sent[0].code).toBe("GAME_IN_PROGRESS");
      }
    });

    it("rejects invalid targeting bias strength", () => {
      const roomId = setupRoom(store);
      const ctx = createMockContext("host");

      handleUpdateRoomSettings(
        {
          type: "updateRoomSettings",
          roomId,
          handicapSettings: { ...validSettings, targetingBiasStrength: 1.5 },
          ratingVisible: true,
        },
        ctx,
        store,
      );

      expect(ctx.sent[0].type).toBe("error");
      if (ctx.sent[0].type === "error") {
        expect(ctx.sent[0].code).toBe("INVALID_MESSAGE");
      }
    });
  });

  describe("handleStartGame with handicap settings", () => {
    function setupRoom(store: RoomStore) {
      const hostCtx = createMockContext("host");
      handleCreateRoom(
        {
          type: "createRoom",
          config: { name: "Test", maxPlayers: 4 },
          player: { id: "host", name: "Host" },
        },
        hostCtx,
        store,
      );
      const roomId = (hostCtx.sent[0] as { type: "roomCreated"; room: { id: string } }).room.id;
      store.addPlayer(roomId, { id: "p2", name: "P2" });
      return roomId;
    }

    it("stores handicap settings when starting game", () => {
      const roomId = setupRoom(store);
      const ctx = createMockContext("host");
      const settings: HandicapSettings = {
        intensity: "heavy",
        mode: "symmetric",
        targetingBiasStrength: 0.5,
        delayEnabled: true,
        messinessEnabled: true,
      };

      handleStartGame(
        { type: "startGame", roomId, handicapSettings: settings },
        ctx,
        store,
      );

      expect(ctx.broadcasts).toHaveLength(1);
      expect(ctx.broadcasts[0].msg.type).toBe("gameStarted");
      const room = store.getRoom(roomId)!;
      expect(room.handicapSettings).toEqual(settings);
      expect(room.status).toBe("playing");
    });

    it("starts game without handicap settings (backward compatible)", () => {
      const roomId = setupRoom(store);
      const ctx = createMockContext("host");

      handleStartGame({ type: "startGame", roomId }, ctx, store);

      expect(ctx.broadcasts).toHaveLength(1);
      expect(ctx.broadcasts[0].msg.type).toBe("gameStarted");
    });
  });
});
