/**
 * Reconnection tracking for in-game disconnects.
 *
 * When a player disconnects while a game session is in progress, we give them
 * a short grace period to reconnect before forfeiting. This module owns the
 * per-(room, player) timers and exposes a small registry for game-handlers
 * and the WebSocket layer to coordinate.
 */

import type { PlayerId, RoomId } from "@tetris/shared";

export const RECONNECT_WINDOW_MS = 15_000;

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>;
  onTimeout: () => void;
}

export class DisconnectRegistry {
  private readonly entries = new Map<string, PendingEntry>();
  private readonly windowMs: number;

  constructor(windowMs: number = RECONNECT_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  get timeoutMs(): number {
    return this.windowMs;
  }

  private key(roomId: RoomId, playerId: PlayerId): string {
    return `${roomId}::${playerId}`;
  }

  /**
   * Register a pending disconnect. If one already exists for this (room,
   * player) pair, the previous timer is cleared and replaced — this keeps
   * rapid disconnect cycles from leaking timers.
   */
  register(
    roomId: RoomId,
    playerId: PlayerId,
    onTimeout: () => void,
  ): void {
    this.clear(roomId, playerId);
    const timer = setTimeout(() => {
      this.entries.delete(this.key(roomId, playerId));
      onTimeout();
    }, this.windowMs);
    this.entries.set(this.key(roomId, playerId), { timer, onTimeout });
  }

  /** Clear a pending disconnect (the player has reconnected in time). */
  clear(roomId: RoomId, playerId: PlayerId): boolean {
    const k = this.key(roomId, playerId);
    const entry = this.entries.get(k);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.entries.delete(k);
    return true;
  }

  isPending(roomId: RoomId, playerId: PlayerId): boolean {
    return this.entries.has(this.key(roomId, playerId));
  }

  /** Clear all pending disconnects for a room (e.g. on session end). */
  clearRoom(roomId: RoomId): void {
    const prefix = `${roomId}::`;
    for (const k of Array.from(this.entries.keys())) {
      if (k.startsWith(prefix)) {
        const entry = this.entries.get(k)!;
        clearTimeout(entry.timer);
        this.entries.delete(k);
      }
    }
  }

  /** Test helper: drop all pending entries without firing their callbacks. */
  clearAll(): void {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer);
    }
    this.entries.clear();
  }
}

/** Singleton used by the server at runtime. */
export const disconnectRegistry = new DisconnectRegistry();
