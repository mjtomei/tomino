import { describe, it, expect } from "vitest";

/**
 * Example test demonstrating patterns for server-side logic.
 *
 * Future tests in this package should follow this structure:
 * - Room management: create, join, leave, state transitions
 * - WebSocket message handling: validate message routing and responses
 * - State synchronization: verify server authoritative state
 */

describe("server package test setup", () => {
  it("runs in node environment", () => {
    expect(typeof process).toBe("object");
    expect(typeof process.version).toBe("string");
  });
});

describe("example: room management pattern", () => {
  // Demonstrates testing stateful server logic
  class Room {
    players = new Map<string, { ready: boolean }>();

    join(id: string) {
      if (this.players.size >= 2) return false;
      this.players.set(id, { ready: false });
      return true;
    }

    leave(id: string) {
      return this.players.delete(id);
    }

    setReady(id: string) {
      const player = this.players.get(id);
      if (player) player.ready = true;
    }

    allReady(): boolean {
      if (this.players.size < 2) return false;
      return [...this.players.values()].every((p) => p.ready);
    }
  }

  it("allows players to join up to capacity", () => {
    const room = new Room();
    expect(room.join("p1")).toBe(true);
    expect(room.join("p2")).toBe(true);
    expect(room.join("p3")).toBe(false);
  });

  it("tracks ready state for game start", () => {
    const room = new Room();
    room.join("p1");
    room.join("p2");
    expect(room.allReady()).toBe(false);

    room.setReady("p1");
    expect(room.allReady()).toBe(false);

    room.setReady("p2");
    expect(room.allReady()).toBe(true);
  });

  it("handles player disconnect", () => {
    const room = new Room();
    room.join("p1");
    room.join("p2");
    room.setReady("p1");
    room.setReady("p2");

    room.leave("p2");
    expect(room.allReady()).toBe(false);
    expect(room.players.size).toBe(1);
  });
});
