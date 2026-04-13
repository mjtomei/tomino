/**
 * Opponent reaction detection and effect emission.
 *
 * Detects notable events (quad clears, heavy incoming garbage, elimination)
 * from successive `GameStateSnapshot` values, and provides particle burst
 * helpers used by `OpponentBoard` to render the visual reactions.
 */

import type { EmoteKind, GameStateSnapshot, PlayerId } from "@tomino/shared";
import type { ParticleSystem, EmitConfig } from "./particle-system.js";

export type OpponentReaction = "quad" | "heavyGarbage" | "eliminated";

export interface ReactionEvent {
  playerId: PlayerId;
  reaction: OpponentReaction;
  at: number;
}

const HEAVY_GARBAGE_THRESHOLD = 4;
const TETRIS_LINES = 4;

function sumPending(queue: GameStateSnapshot["pendingGarbage"]): number {
  let total = 0;
  for (const batch of queue) total += batch.lines;
  return total;
}

/**
 * Compare two snapshots for the same player and emit reaction events for
 * anything noteworthy that happened between them.
 *
 * Returns an empty array when `prev` is null (no baseline) or nothing changed.
 */
export function detectReactions(
  prev: GameStateSnapshot | null,
  next: GameStateSnapshot,
  playerId: PlayerId,
  now: number,
): ReactionEvent[] {
  if (!prev) return [];
  const events: ReactionEvent[] = [];

  if (next.linesCleared - prev.linesCleared >= TETRIS_LINES) {
    events.push({ playerId, reaction: "quad", at: now });
  }

  const prevPending = sumPending(prev.pendingGarbage);
  const nextPending = sumPending(next.pendingGarbage);
  if (nextPending - prevPending >= HEAVY_GARBAGE_THRESHOLD) {
    events.push({ playerId, reaction: "heavyGarbage", at: now });
  }

  if (!prev.isGameOver && next.isGameOver) {
    events.push({ playerId, reaction: "eliminated", at: now });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Particle effects
// ---------------------------------------------------------------------------

function burst(
  system: ParticleSystem,
  center: { x: number; y: number },
  count: number,
  overrides: Partial<EmitConfig> & Pick<EmitConfig, "shape" | "color">,
): void {
  const base: EmitConfig = {
    shape: overrides.shape,
    color: overrides.color,
    lifetime: overrides.lifetime ?? 0.9,
    size: overrides.size ?? 2.5,
    velocity: overrides.velocity ?? { x: 0, y: 0 },
    velocityJitter: overrides.velocityJitter ?? { x: 80, y: 80 },
    gravity: overrides.gravity,
    sizeCurve: overrides.sizeCurve ?? [1, 0.5],
    fade: overrides.fade ?? [1, 0],
    rotationSpeed: overrides.rotationSpeed,
    trailLength: overrides.trailLength,
    rotation: overrides.rotation,
  };
  system.emit(base, center, count);
}

export function playReactionEffect(
  system: ParticleSystem,
  reaction: OpponentReaction,
  center: { x: number; y: number },
): void {
  switch (reaction) {
    case "quad":
      burst(system, center, 30, {
        shape: "star",
        color: "#ffd84a",
        lifetime: 1.0,
        size: 3,
        velocityJitter: { x: 120, y: 120 },
      });
      return;
    case "heavyGarbage":
      burst(system, center, 24, {
        shape: "square",
        color: "#e74c3c",
        lifetime: 0.8,
        size: 2.5,
        velocity: { x: 0, y: 40 },
        velocityJitter: { x: 90, y: 40 },
        gravity: { x: 0, y: 200 },
      });
      return;
    case "eliminated":
      burst(system, center, 40, {
        shape: "diamond",
        color: "#bbbbbb",
        lifetime: 1.2,
        size: 3,
        velocityJitter: { x: 150, y: 150 },
      });
      return;
  }
}

const EMOTE_CONFIG: Record<
  EmoteKind,
  { shape: EmitConfig["shape"]; color: string; count: number; size: number }
> = {
  thumbsUp: { shape: "triangle", color: "#4ade80", count: 20, size: 3 },
  fire: { shape: "triangle", color: "#ff6b35", count: 30, size: 2.5 },
  wave: { shape: "line", color: "#60a5fa", count: 18, size: 3 },
  gg: { shape: "star", color: "#a78bfa", count: 22, size: 2.5 },
};

export function playEmoteEffect(
  system: ParticleSystem,
  emote: EmoteKind,
  center: { x: number; y: number },
): void {
  const cfg = EMOTE_CONFIG[emote];
  burst(system, center, cfg.count, {
    shape: cfg.shape,
    color: cfg.color,
    size: cfg.size,
    lifetime: 0.9,
    velocity: { x: 0, y: -40 },
    velocityJitter: { x: 70, y: 70 },
    gravity: { x: 0, y: 120 },
  });
}
