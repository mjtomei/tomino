import { describe, it, expect } from "vitest";
import { generateRoomCode, validateMaxPlayers, createRoomState } from "../room.js";

describe("generateRoomCode", () => {
  it("generates a 5-character code", () => {
    const code = generateRoomCode(new Set());
    expect(code).toHaveLength(5);
  });

  it("uses only uppercase alphanumeric characters (no confusables)", () => {
    const confusable = /[01OIL]/;
    const validChar = /^[ABCDEFGHJKMNPQRSTUVWXYZ2345678]+$/;
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode(new Set());
      expect(code).toMatch(validChar);
      expect(code).not.toMatch(confusable);
    }
  });

  it("generates unique codes across 1000 iterations", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode(codes);
      expect(codes.has(code)).toBe(false);
      codes.add(code);
    }
    expect(codes.size).toBe(1000);
  });

  it("avoids existing codes", () => {
    const existing = new Set(["AAAAA"]);
    // Generating a code should never return one that's already in the set
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode(existing);
      expect(code).not.toBe("AAAAA");
    }
  });
});

describe("validateMaxPlayers", () => {
  it("clamps values below 2 to 2", () => {
    expect(validateMaxPlayers(0)).toBe(2);
    expect(validateMaxPlayers(1)).toBe(2);
    expect(validateMaxPlayers(-5)).toBe(2);
  });

  it("clamps values above 8 to 8", () => {
    expect(validateMaxPlayers(10)).toBe(8);
    expect(validateMaxPlayers(100)).toBe(8);
  });

  it("floors fractional values", () => {
    expect(validateMaxPlayers(3.9)).toBe(3);
    expect(validateMaxPlayers(4.1)).toBe(4);
  });

  it("passes through valid values", () => {
    expect(validateMaxPlayers(2)).toBe(2);
    expect(validateMaxPlayers(4)).toBe(4);
    expect(validateMaxPlayers(8)).toBe(8);
  });
});

describe("createRoomState", () => {
  it("creates a room in waiting status with the host as first player", () => {
    const host = { id: "p1", name: "Alice" };
    const room = createRoomState("ABC12", { name: "Test Room", maxPlayers: 4 }, host);

    expect(room.id).toBe("ABC12");
    expect(room.config.name).toBe("Test Room");
    expect(room.config.maxPlayers).toBe(4);
    expect(room.status).toBe("waiting");
    expect(room.players).toEqual([host]);
    expect(room.hostId).toBe("p1");
  });

  it("clamps maxPlayers in config", () => {
    const host = { id: "p1", name: "Alice" };
    const room = createRoomState("ABC12", { name: "Big Room", maxPlayers: 99 }, host);
    expect(room.config.maxPlayers).toBe(8);
  });
});
