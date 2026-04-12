import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  ClientMessage,
  ServerMessage,
  ServerMessageType,
} from "@tetris/shared";
import {
  LatencyTracker,
  computeLatency,
  latencyColor,
  LATENCY_COLOR_GREEN,
  LATENCY_COLOR_YELLOW,
  LATENCY_COLOR_RED,
  LATENCY_COLOR_NEUTRAL,
} from "../latency";
import type { ClientSocket, MessageHandler } from "../client-socket";

type TypedHandler = MessageHandler<ServerMessage>;

function createFakeSocket() {
  const listeners = new Map<string, Set<TypedHandler>>();
  const sent: ClientMessage[] = [];

  const fake = {
    state: "connected" as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn((msg: ClientMessage) => {
      sent.push(msg);
    }),
    on: vi.fn(<T extends ServerMessageType>(
      type: T,
      handler: MessageHandler<Extract<ServerMessage, { type: T }>>,
    ) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(handler as TypedHandler);
      return () => set!.delete(handler as TypedHandler);
    }),
    onAny: vi.fn(() => () => undefined),
    onConnection: vi.fn(() => () => undefined),
  } as unknown as ClientSocket;

  function fire(msg: ServerMessage): void {
    const set = listeners.get(msg.type);
    if (!set) return;
    for (const h of set) h(msg);
  }

  function hasListener(type: string): boolean {
    const set = listeners.get(type);
    return !!set && set.size > 0;
  }

  return { fake, sent, fire, hasListener };
}

describe("computeLatency", () => {
  it("returns the difference when received after sent", () => {
    expect(computeLatency(100, 175)).toBe(75);
  });

  it("clamps negative differences to 0", () => {
    expect(computeLatency(200, 150)).toBe(0);
  });

  it("returns 0 for identical timestamps", () => {
    expect(computeLatency(100, 100)).toBe(0);
  });
});

describe("latencyColor", () => {
  it("is neutral when latency is null", () => {
    expect(latencyColor(null)).toBe(LATENCY_COLOR_NEUTRAL);
  });

  it("is green below 50ms", () => {
    expect(latencyColor(0)).toBe(LATENCY_COLOR_GREEN);
    expect(latencyColor(49)).toBe(LATENCY_COLOR_GREEN);
  });

  it("is yellow at 50ms through 150ms inclusive", () => {
    expect(latencyColor(50)).toBe(LATENCY_COLOR_YELLOW);
    expect(latencyColor(100)).toBe(LATENCY_COLOR_YELLOW);
    expect(latencyColor(150)).toBe(LATENCY_COLOR_YELLOW);
  });

  it("is red above 150ms", () => {
    expect(latencyColor(151)).toBe(LATENCY_COLOR_RED);
    expect(latencyColor(9999)).toBe(LATENCY_COLOR_RED);
  });
});

describe("LatencyTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a ping immediately on start and then every interval", () => {
    const { fake, sent } = createFakeSocket();
    let now = 1000;
    const tracker = new LatencyTracker({
      socket: fake,
      intervalMs: 2000,
      now: () => now,
    });

    tracker.start();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ type: "ping", timestamp: 1000 });

    now = 3000;
    vi.advanceTimersByTime(2000);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ type: "ping", timestamp: 3000 });

    now = 5000;
    vi.advanceTimersByTime(2000);
    expect(sent).toHaveLength(3);
    expect(sent[2]).toEqual({ type: "ping", timestamp: 5000 });
  });

  it("computes latency from pong echo and notifies subscribers", () => {
    const { fake, fire } = createFakeSocket();
    let now = 1000;
    const tracker = new LatencyTracker({
      socket: fake,
      intervalMs: 2000,
      now: () => now,
    });

    const received: Array<number | null> = [];
    tracker.subscribe((ms) => received.push(ms));

    tracker.start();
    expect(tracker.getLatency()).toBeNull();

    now = 1075;
    fire({ type: "pong", timestamp: 1000 });

    expect(tracker.getLatency()).toBe(75);
    expect(received).toContain(75);
  });

  it("stop clears the interval, unsubscribes from pong, and resets latency", () => {
    const { fake, sent, fire, hasListener } = createFakeSocket();
    let now = 1000;
    const tracker = new LatencyTracker({
      socket: fake,
      intervalMs: 2000,
      now: () => now,
    });

    tracker.start();
    now = 1050;
    fire({ type: "pong", timestamp: 1000 });
    expect(tracker.getLatency()).toBe(50);
    expect(hasListener("pong")).toBe(true);

    tracker.stop();
    expect(tracker.getLatency()).toBeNull();
    expect(hasListener("pong")).toBe(false);

    const countAfterStop = sent.length;
    now = 5000;
    vi.advanceTimersByTime(10_000);
    expect(sent.length).toBe(countAfterStop);
  });
});
