import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClientSocket } from "../net/client-socket";

// Minimal mock WebSocket for jsdom (which doesn't have a real WebSocket)
class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  private handlers = new Map<string, Set<(ev: unknown) => void>>();

  constructor(public url: string) {
    // Auto-connect on next tick
    setTimeout(() => this._emit("open", {}), 0);
  }

  addEventListener(type: string, handler: (ev: unknown) => void) {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
  }

  removeEventListener(type: string, handler: (ev: unknown) => void) {
    this.handlers.get(type)?.delete(handler);
  }

  send = vi.fn();

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this._emit("close", {});
  }

  // Test helpers
  _emit(type: string, event: unknown) {
    if (type === "open") this.readyState = MockWebSocket.OPEN;
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const h of handlers) h(event);
    }
  }

  _receiveMessage(data: string) {
    this._emit("message", { data });
  }
}

describe("ClientSocket", () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    // @ts-expect-error — mock
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("connects and reports connected state", async () => {
    const socket = new ClientSocket();
    const states: string[] = [];
    socket.onConnection((s) => states.push(s));

    socket.connect("ws://localhost:3001");
    expect(states).toContain("connecting");

    // Wait for auto-connect
    await new Promise((r) => setTimeout(r, 10));
    expect(states).toContain("connected");
    expect(socket.state).toBe("connected");
  });

  it("reports disconnected state on close", async () => {
    const socket = new ClientSocket();
    const states: string[] = [];
    socket.onConnection((s) => states.push(s));

    socket.connect("ws://localhost:3001");
    await new Promise((r) => setTimeout(r, 10));

    socket.disconnect();
    expect(socket.state).toBe("disconnected");
    expect(states).toContain("disconnected");
  });

  it("dispatches typed messages to subscribers", async () => {
    const socket = new ClientSocket();
    socket.connect("ws://localhost:3001");
    await new Promise((r) => setTimeout(r, 10));

    const received: unknown[] = [];
    socket.on("roomCreated", (msg) => received.push(msg));

    // Simulate receiving a valid server message
    const mockWs = (socket as unknown as { ws: MockWebSocket }).ws;
    const roomCreatedMsg = JSON.stringify({
      type: "roomCreated",
      room: {
        id: "R1",
        config: { name: "Test", maxPlayers: 4 },
        status: "waiting",
        players: [{ id: "p1", name: "Alice" }],
        hostId: "p1",
      },
    });
    mockWs._receiveMessage(roomCreatedMsg);

    expect(received).toHaveLength(1);
    expect(received[0]).toHaveProperty("type", "roomCreated");
  });

  it("dispatches to wildcard listeners", async () => {
    const socket = new ClientSocket();
    socket.connect("ws://localhost:3001");
    await new Promise((r) => setTimeout(r, 10));

    const received: unknown[] = [];
    socket.onAny((msg) => received.push(msg));

    const mockWs = (socket as unknown as { ws: MockWebSocket }).ws;
    mockWs._receiveMessage(JSON.stringify({ type: "pong", timestamp: 123 }));

    expect(received).toHaveLength(1);
  });

  it("ignores invalid messages", async () => {
    const socket = new ClientSocket();
    socket.connect("ws://localhost:3001");
    await new Promise((r) => setTimeout(r, 10));

    const received: unknown[] = [];
    socket.onAny((msg) => received.push(msg));

    const mockWs = (socket as unknown as { ws: MockWebSocket }).ws;
    mockWs._receiveMessage("not json");
    mockWs._receiveMessage(JSON.stringify({ type: "unknownType" }));

    expect(received).toHaveLength(0);
  });

  it("unsubscribe removes the listener", async () => {
    const socket = new ClientSocket();
    socket.connect("ws://localhost:3001");
    await new Promise((r) => setTimeout(r, 10));

    const received: unknown[] = [];
    const unsub = socket.on("pong", (msg) => received.push(msg));
    unsub();

    const mockWs = (socket as unknown as { ws: MockWebSocket }).ws;
    mockWs._receiveMessage(JSON.stringify({ type: "pong", timestamp: 123 }));

    expect(received).toHaveLength(0);
  });

  it("sends serialized messages", async () => {
    const socket = new ClientSocket();
    socket.connect("ws://localhost:3001");
    await new Promise((r) => setTimeout(r, 10));

    const mockWs = (socket as unknown as { ws: MockWebSocket }).ws;
    socket.send({ type: "ping", timestamp: 999 });

    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "ping", timestamp: 999 }),
    );
  });
});
