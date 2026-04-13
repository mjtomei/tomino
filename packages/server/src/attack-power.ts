/**
 * Attack power multiplier tracker.
 *
 * Each player's attack power starts at 1.0x and increases as they score KOs.
 * The multiplier is applied to outgoing garbage at distribution time.
 *
 * Thresholds:
 *   0 KOs → 1.0x
 *   1 KO  → 1.25x
 *   2 KOs → 1.5x
 *   4 KOs → 1.75x
 *   6+ KOs → 2.0x
 */

import type { PlayerId } from "@tomino/shared";

/** KO thresholds in ascending order: [minKOs, multiplier]. */
const ATTACK_POWER_THRESHOLDS: readonly [number, number][] = [
  [6, 2.0],
  [4, 1.75],
  [2, 1.5],
  [1, 1.25],
  [0, 1.0],
];

/** Compute the attack power multiplier for a given KO count. */
export function attackPowerForKOs(koCount: number): number {
  for (const [minKOs, multiplier] of ATTACK_POWER_THRESHOLDS) {
    if (koCount >= minKOs) return multiplier;
  }
  return 1.0;
}

export interface AttackPowerState {
  koCount: number;
  multiplier: number;
}

/**
 * Tracks per-player attack power state for a game session.
 */
export class AttackPowerTracker {
  private readonly state = new Map<PlayerId, AttackPowerState>();

  constructor(playerIds: readonly PlayerId[]) {
    for (const id of playerIds) {
      this.state.set(id, { koCount: 0, multiplier: 1.0 });
    }
  }

  /** Get the current attack power multiplier for a player. */
  getMultiplier(playerId: PlayerId): number {
    return this.state.get(playerId)?.multiplier ?? 1.0;
  }

  /** Get the full state for a player. */
  getState(playerId: PlayerId): AttackPowerState {
    return this.state.get(playerId) ?? { koCount: 0, multiplier: 1.0 };
  }

  /**
   * Record a KO for the given player. Returns the new multiplier, or null
   * if the multiplier did not change.
   */
  recordKO(playerId: PlayerId): { multiplier: number; koCount: number } | null {
    const s = this.state.get(playerId);
    if (!s) return null;
    const prevMultiplier = s.multiplier;
    s.koCount++;
    s.multiplier = attackPowerForKOs(s.koCount);
    if (s.multiplier === prevMultiplier) return null;
    return { multiplier: s.multiplier, koCount: s.koCount };
  }

  /** Remove a player (disconnected / topped out). */
  removePlayer(playerId: PlayerId): void {
    this.state.delete(playerId);
  }
}
