import { describe, expect, it } from "vitest";
import {
  isC2SMessage,
  isS2CMessage,
  parseC2SMessage,
  parseS2CMessage,
  serializeMessage,
} from "../messages.js";
import type { ClientMessage, ServerMessage } from "../protocol.js";
import { CLIENT_MESSAGE_TYPES, SERVER_MESSAGE_TYPES } from "../protocol.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validC2SMessages: ClientMessage[] = [
  {
    type: "createRoom",
    config: { name: "Test Room", maxPlayers: 2 },
    player: { id: "p1", name: "Alice" },
  },
  {
    type: "joinRoom",
    roomId: "room-1",
    player: { id: "p2", name: "Bob" },
  },
  { type: "leaveRoom", roomId: "room-1" },
  { type: "startGame", roomId: "room-1" },
  {
    type: "playerInput",
    roomId: "room-1",
    action: "moveLeft",
    tick: 42,
  },
  { type: "ping", timestamp: Date.now() },
];

const validS2CMessages: ServerMessage[] = [
  {
    type: "roomCreated",
    room: {
      id: "room-1",
      config: { name: "Test Room", maxPlayers: 2 },
      status: "waiting",
      players: [{ id: "p1", name: "Alice" }],
      hostId: "p1",
    },
  },
  {
    type: "roomUpdated",
    room: {
      id: "room-1",
      config: { name: "Test Room", maxPlayers: 2 },
      status: "playing",
      players: [
        { id: "p1", name: "Alice" },
        { id: "p2", name: "Bob" },
      ],
      hostId: "p1",
    },
  },
  {
    type: "playerJoined",
    roomId: "room-1",
    player: { id: "p2", name: "Bob" },
  },
  { type: "playerLeft", roomId: "room-1", playerId: "p2" },
  {
    type: "gameStarted",
    roomId: "room-1",
    initialStates: {},
  },
  {
    type: "gameStateSnapshot",
    roomId: "room-1",
    playerId: "p1",
    state: {
      tick: 0,
      board: [],
      activePiece: null,
      ghostY: null,
      nextQueue: ["T", "I", "O"],
      holdPiece: null,
      holdUsed: false,
      score: 0,
      level: 1,
      linesCleared: 0,
      piecesPlaced: 0,
      pendingGarbage: [],
      isGameOver: false,
    },
  },
  { type: "gameOver", roomId: "room-1", playerId: "p1" },
  { type: "gameEnd", roomId: "room-1", winnerId: "p2" },
  {
    type: "garbageReceived",
    roomId: "room-1",
    playerId: "p2",
    senderId: "p1",
    garbage: { lines: 2, gapColumn: 5 },
  },
  {
    type: "garbageQueued",
    roomId: "room-1",
    playerId: "p2",
    pendingGarbage: [{ lines: 4, gapColumn: 3 }],
  },
  { type: "pong", timestamp: Date.now() },
  { type: "error", code: "ROOM_NOT_FOUND", message: "Room does not exist" },
  { type: "disconnected", reason: "Server shutting down" },
];

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe("isC2SMessage", () => {
  it("accepts all valid C2S messages", () => {
    for (const msg of validC2SMessages) {
      expect(isC2SMessage(msg)).toBe(true);
    }
  });

  it("rejects S2C messages", () => {
    for (const msg of validS2CMessages) {
      expect(isC2SMessage(msg)).toBe(false);
    }
  });

  it("rejects non-objects", () => {
    expect(isC2SMessage(null)).toBe(false);
    expect(isC2SMessage(undefined)).toBe(false);
    expect(isC2SMessage(42)).toBe(false);
    expect(isC2SMessage("ping")).toBe(false);
    expect(isC2SMessage([])).toBe(false);
  });

  it("rejects objects without type", () => {
    expect(isC2SMessage({ roomId: "room-1" })).toBe(false);
  });

  it("rejects unknown type strings", () => {
    expect(isC2SMessage({ type: "unknownAction" })).toBe(false);
  });
});

describe("isS2CMessage", () => {
  it("accepts all valid S2C messages", () => {
    for (const msg of validS2CMessages) {
      expect(isS2CMessage(msg)).toBe(true);
    }
  });

  it("rejects C2S messages", () => {
    for (const msg of validC2SMessages) {
      expect(isS2CMessage(msg)).toBe(false);
    }
  });

  it("rejects non-objects", () => {
    expect(isS2CMessage(null)).toBe(false);
    expect(isS2CMessage(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Message type lists are complete
// ---------------------------------------------------------------------------

describe("message type lists", () => {
  it("CLIENT_MESSAGE_TYPES has no duplicates", () => {
    const set = new Set(CLIENT_MESSAGE_TYPES);
    expect(set.size).toBe(CLIENT_MESSAGE_TYPES.length);
  });

  it("SERVER_MESSAGE_TYPES has no duplicates", () => {
    const set = new Set(SERVER_MESSAGE_TYPES);
    expect(set.size).toBe(SERVER_MESSAGE_TYPES.length);
  });

  it("C2S and S2C type strings are disjoint", () => {
    const c2sSet = new Set<string>(CLIENT_MESSAGE_TYPES);
    for (const t of SERVER_MESSAGE_TYPES) {
      expect(c2sSet.has(t)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

describe("parseC2SMessage", () => {
  it("parses valid JSON into a ClientMessage", () => {
    for (const msg of validC2SMessages) {
      const json = JSON.stringify(msg);
      const parsed = parseC2SMessage(json);
      expect(parsed).toEqual(msg);
    }
  });

  it("returns null for invalid JSON", () => {
    expect(parseC2SMessage("{bad json")).toBe(null);
    expect(parseC2SMessage("")).toBe(null);
  });

  it("returns null for valid JSON with unknown type", () => {
    expect(parseC2SMessage('{"type":"foobar"}')).toBe(null);
  });

  it("returns null for valid JSON that is not an object", () => {
    expect(parseC2SMessage('"just a string"')).toBe(null);
    expect(parseC2SMessage("42")).toBe(null);
    expect(parseC2SMessage("null")).toBe(null);
    expect(parseC2SMessage("true")).toBe(null);
  });

  it("returns null for S2C messages", () => {
    for (const msg of validS2CMessages) {
      expect(parseC2SMessage(JSON.stringify(msg))).toBe(null);
    }
  });
});

describe("parseS2CMessage", () => {
  it("parses valid JSON into a ServerMessage", () => {
    for (const msg of validS2CMessages) {
      const json = JSON.stringify(msg);
      const parsed = parseS2CMessage(json);
      expect(parsed).toEqual(msg);
    }
  });

  it("returns null for invalid JSON", () => {
    expect(parseS2CMessage("not json")).toBe(null);
  });

  it("returns null for C2S messages", () => {
    for (const msg of validC2SMessages) {
      expect(parseS2CMessage(JSON.stringify(msg))).toBe(null);
    }
  });
});

// ---------------------------------------------------------------------------
// Round-trip serialization
// ---------------------------------------------------------------------------

describe("round-trip serialization", () => {
  it("C2S messages survive serialize → parse", () => {
    for (const msg of validC2SMessages) {
      const serialized = serializeMessage(msg);
      const parsed = parseC2SMessage(serialized);
      expect(parsed).toEqual(msg);
    }
  });

  it("S2C messages survive serialize → parse", () => {
    for (const msg of validS2CMessages) {
      const serialized = serializeMessage(msg);
      const parsed = parseS2CMessage(serialized);
      expect(parsed).toEqual(msg);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("extra fields on the message are preserved through parsing", () => {
    const msg = { type: "ping", timestamp: 123, extraField: "hello" };
    const parsed = parseC2SMessage(JSON.stringify(msg));
    expect(parsed).not.toBe(null);
    expect((parsed as unknown as Record<string, unknown>).extraField).toBe(
      "hello",
    );
  });

  it("type field with numeric value is rejected", () => {
    expect(parseC2SMessage('{"type": 123}')).toBe(null);
  });

  it("empty object is rejected", () => {
    expect(parseC2SMessage("{}")).toBe(null);
    expect(parseS2CMessage("{}")).toBe(null);
  });

  it("array is rejected", () => {
    expect(parseC2SMessage("[]")).toBe(null);
    expect(parseS2CMessage("[]")).toBe(null);
  });
});
