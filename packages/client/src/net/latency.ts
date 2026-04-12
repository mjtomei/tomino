/**
 * Round-trip latency measurement over the game protocol's ping/pong.
 *
 * `LatencyTracker` periodically sends `ping` messages through a `ClientSocket`
 * and computes RTT when the matching `pong` echoes back. Subscribers receive
 * the latest value; a tiny React hook adapter is exported for UI binding.
 */

import { useEffect, useState } from "react";
import type { ClientSocket } from "./client-socket.js";

export const LATENCY_PING_INTERVAL_MS = 2000;

export const LATENCY_COLOR_GREEN = "#4caf50";
export const LATENCY_COLOR_YELLOW = "#ffc107";
export const LATENCY_COLOR_RED = "#f44336";
export const LATENCY_COLOR_NEUTRAL = "#888";

export function computeLatency(sentAt: number, receivedAt: number): number {
  const rtt = receivedAt - sentAt;
  return rtt < 0 ? 0 : rtt;
}

export function latencyColor(latencyMs: number | null): string {
  if (latencyMs === null) return LATENCY_COLOR_NEUTRAL;
  if (latencyMs < 50) return LATENCY_COLOR_GREEN;
  if (latencyMs <= 150) return LATENCY_COLOR_YELLOW;
  return LATENCY_COLOR_RED;
}

export type LatencyListener = (latencyMs: number | null) => void;

export interface LatencyTrackerOptions {
  socket: ClientSocket;
  intervalMs?: number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => ReturnType<typeof globalThis.setInterval>;
  clearInterval?: (handle: ReturnType<typeof globalThis.setInterval>) => void;
}

export class LatencyTracker {
  private readonly socket: ClientSocket;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly _setInterval: (fn: () => void, ms: number) => ReturnType<typeof globalThis.setInterval>;
  private readonly _clearInterval: (handle: ReturnType<typeof globalThis.setInterval>) => void;

  private timer: ReturnType<typeof globalThis.setInterval> | null = null;
  private unsubscribePong: (() => void) | null = null;
  private latencyMs: number | null = null;
  private readonly listeners = new Set<LatencyListener>();

  constructor(options: LatencyTrackerOptions) {
    this.socket = options.socket;
    this.intervalMs = options.intervalMs ?? LATENCY_PING_INTERVAL_MS;
    this.now = options.now ?? (() => performance.now());
    this._setInterval = options.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
    this._clearInterval = options.clearInterval ?? ((h) => globalThis.clearInterval(h));
  }

  start(): void {
    if (this.timer !== null) return;
    this.latencyMs = null;
    this.unsubscribePong = this.socket.on("pong", (msg) => {
      const rtt = computeLatency(msg.timestamp, this.now());
      this.latencyMs = rtt;
      this.emit();
    });
    this.sendPing();
    this.timer = this._setInterval(() => this.sendPing(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      this._clearInterval(this.timer);
      this.timer = null;
    }
    if (this.unsubscribePong) {
      this.unsubscribePong();
      this.unsubscribePong = null;
    }
    this.latencyMs = null;
    this.emit();
  }

  getLatency(): number | null {
    return this.latencyMs;
  }

  subscribe(listener: LatencyListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private sendPing(): void {
    this.socket.send({ type: "ping", timestamp: this.now() });
  }

  private emit(): void {
    for (const l of this.listeners) l(this.latencyMs);
  }
}

/**
 * React hook that runs a `LatencyTracker` against a socket while `enabled`,
 * returning the latest measured round-trip latency in ms (null before first
 * pong).
 */
export function useLatency(socket: ClientSocket | null, enabled: boolean): number | null {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    if (!socket || !enabled) {
      setLatencyMs(null);
      return;
    }
    const tracker = new LatencyTracker({ socket });
    const unsubscribe = tracker.subscribe(setLatencyMs);
    tracker.start();
    return () => {
      unsubscribe();
      tracker.stop();
    };
  }, [socket, enabled]);

  return latencyMs;
}
