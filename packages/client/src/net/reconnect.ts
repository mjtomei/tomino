/**
 * Auto-reconnect helper for in-game disconnects.
 *
 * Wraps a ClientSocket and, when the connection drops unexpectedly during
 * a playing session, schedules retries with exponential backoff up to a
 * total time budget (the server's reconnect window). On each successful
 * connect we emit a `rejoinRoom` message so the server can restore state.
 */

import type { PlayerInfo, RoomId } from "@tetris/shared";
import type { ClientSocket } from "./client-socket.js";

export const DEFAULT_RECONNECT_WINDOW_MS = 15_000;
const INITIAL_DELAY_MS = 250;
const MAX_DELAY_MS = 2_000;

export interface ReconnectControllerOptions {
  socket: ClientSocket;
  serverUrl: string;
  roomId: RoomId;
  player: PlayerInfo;
  /** Total budget (matches server's RECONNECT_WINDOW_MS). */
  windowMs?: number;
  onAttempt?: (attempt: number) => void;
  onGaveUp?: () => void;
}

export class ReconnectController {
  private readonly opts: Required<
    Omit<ReconnectControllerOptions, "onAttempt" | "onGaveUp">
  > & {
    onAttempt?: (attempt: number) => void;
    onGaveUp?: () => void;
  };
  private startTime: number = 0;
  private attempt: number = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active: boolean = false;

  constructor(options: ReconnectControllerOptions) {
    this.opts = {
      windowMs: DEFAULT_RECONNECT_WINDOW_MS,
      ...options,
    };
  }

  /** Begin the reconnect loop. Safe to call multiple times; second call is a no-op. */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.startTime = Date.now();
    this.attempt = 0;
    this.scheduleNext();
  }

  /** Cancel any pending retry. */
  cancel(): void {
    this.active = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    if (!this.active) return;
    const elapsed = Date.now() - this.startTime;
    if (elapsed >= this.opts.windowMs) {
      this.active = false;
      this.opts.onGaveUp?.();
      return;
    }

    const delay = Math.min(
      MAX_DELAY_MS,
      INITIAL_DELAY_MS * 2 ** this.attempt,
    );
    this.timer = setTimeout(() => this.tryConnect(), delay);
  }

  private tryConnect(): void {
    if (!this.active) return;
    this.attempt++;
    this.opts.onAttempt?.(this.attempt);
    const { socket, serverUrl, roomId, player } = this.opts;

    // Subscribe once to the first state change after connect attempt.
    const unsub = socket.onConnection((state) => {
      if (state === "connected") {
        unsub();
        this.active = false;
        socket.send({ type: "rejoinRoom", roomId, player });
      } else if (state === "disconnected") {
        unsub();
        this.scheduleNext();
      }
    });
    socket.connect(serverUrl);
  }
}
