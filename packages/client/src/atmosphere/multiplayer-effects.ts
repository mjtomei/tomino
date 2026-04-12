/**
 * Multiplayer atmosphere effects — spatial particle bursts for
 * garbage-incoming, garbage-sent, and opponent-eliminated events.
 *
 * Pure helpers (math + ParticleSystem.emit calls). No React, no DOM.
 * The GameMultiplayer component subscribes to atmosphere events each
 * frame and calls `playMultiplayerEffect` with a direction derived from
 * the opponent layout.
 */

import type { ParticleSystem, EmitConfig } from "./particle-system.js";
import type {
  AtmosphereEvent,
  MultiplayerSignals,
} from "./types.js";

export { computeMatchIntensity } from "./atmosphere-engine.js";

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Map an opponent's slot in the vertical column layout to an approximate
 * unit direction vector from the local player's board.
 *
 * Opponents are stacked vertically to the right (see
 * `GameMultiplayer.tsx` render). Slot 0 is top-right.
 */
export function computeOpponentDirection(
  slot: number,
  total: number,
): Vec2 {
  if (total <= 0) return { x: 1, y: 0 };
  const mid = (total - 1) / 2;
  const dx = 1;
  const dy = total === 1 ? 0 : (slot - mid) / Math.max(1, mid);
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Average direction of a set of opponent slots. Returns {1, 0} if the
 * set is empty.
 */
export function averageDirection(
  slots: readonly number[],
  total: number,
): Vec2 {
  if (slots.length === 0) return { x: 1, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const s of slots) {
    const d = computeOpponentDirection(s, total);
    sx += d.x;
    sy += d.y;
  }
  const len = Math.hypot(sx, sy) || 1;
  return { x: sx / len, y: sy / len };
}

export interface MultiplayerEffectContext {
  /** Local board center in particle-system coordinates. */
  center: Vec2;
  /** Incoming direction (unit vector) — where attackers are. */
  incomingDir: Vec2;
  /** Outgoing direction (unit vector) — where local player is targeting. */
  outgoingDir: Vec2;
  /** Radius at which to spawn "incoming" particles before they drift in. */
  spawnRadius: number;
}

function baseConfig(
  shape: EmitConfig["shape"],
  color: string,
  velocity: Vec2,
  overrides: Partial<EmitConfig> = {},
): EmitConfig {
  return {
    shape,
    color,
    velocity,
    lifetime: overrides.lifetime ?? 1.0,
    size: overrides.size ?? 2.5,
    velocityJitter: overrides.velocityJitter ?? { x: 40, y: 40 },
    gravity: overrides.gravity,
    sizeCurve: overrides.sizeCurve ?? [1, 0.6],
    fade: overrides.fade ?? [1, 0],
    rotationSpeed: overrides.rotationSpeed,
    trailLength: overrides.trailLength,
    rotation: overrides.rotation,
  };
}

/**
 * Translate one multiplayer atmosphere event into a particle emission.
 * Returns the number of particles emitted (0 for unrelated events).
 */
export function playMultiplayerEffect(
  system: ParticleSystem,
  event: AtmosphereEvent,
  ctx: MultiplayerEffectContext,
): number {
  switch (event.type) {
    case "garbageReceived": {
      // Pressure: particles spawn off-board on the incoming side and
      // drift toward the board center.
      const count = Math.min(40, 8 + event.magnitude * 6);
      const spawn: Vec2 = {
        x: ctx.center.x + ctx.incomingDir.x * ctx.spawnRadius,
        y: ctx.center.y + ctx.incomingDir.y * ctx.spawnRadius,
      };
      const speed = 140 + event.magnitude * 15;
      system.emit(
        baseConfig(
          "square",
          "#e74c3c",
          { x: -ctx.incomingDir.x * speed, y: -ctx.incomingDir.y * speed },
          {
            lifetime: 0.9,
            size: 3,
            velocityJitter: { x: 40, y: 40 },
          },
        ),
        spawn,
        count,
      );
      return count;
    }
    case "garbageSent": {
      // Outward burst from local center toward the target opponent.
      const count = Math.min(30, 6 + event.magnitude * 5);
      const speed = 220 + event.magnitude * 20;
      system.emit(
        baseConfig(
          "diamond",
          "#ffd84a",
          { x: ctx.outgoingDir.x * speed, y: ctx.outgoingDir.y * speed },
          {
            lifetime: 0.8,
            size: 2.5,
            velocityJitter: { x: 60, y: 60 },
          },
        ),
        ctx.center,
        count,
      );
      return count;
    }
    case "opponentEliminated": {
      // Distant shockwave: a ring of slow-moving particles offset in the
      // incoming direction (toward the cluster of opponents).
      const count = 24;
      const origin: Vec2 = {
        x: ctx.center.x + ctx.incomingDir.x * ctx.spawnRadius * 0.7,
        y: ctx.center.y + ctx.incomingDir.y * ctx.spawnRadius * 0.7,
      };
      system.emit(
        baseConfig(
          "star",
          "#bbbbbb",
          { x: 0, y: 0 },
          {
            lifetime: 1.4,
            size: 2,
            velocityJitter: { x: 100, y: 100 },
            fade: [0.6, 0],
          },
        ),
        origin,
        count,
      );
      return count;
    }
    default:
      return 0;
  }
}

/**
 * Extract a MultiplayerSignals snapshot from the props available to
 * GameMultiplayer. Computes cumulative garbage sent/received and
 * eliminations from opponent snapshots + local pending garbage history.
 *
 * Pure function — state tracking is the caller's responsibility.
 */
export function buildMultiplayerSignals(input: {
  opponentCount: number;
  eliminations: number;
  garbageSent: number;
  garbageReceivedTotal: number;
}): MultiplayerSignals {
  return {
    opponentCount: input.opponentCount,
    eliminations: input.eliminations,
    garbageSent: input.garbageSent,
    garbageReceivedTotal: input.garbageReceivedTotal,
  };
}
