/**
 * Menu/lobby/waiting/results atmosphere state computation.
 *
 * Produces an AtmosphereState-shaped object to drive BackgroundCanvas
 * (and ambient music) on non-game screens. Pure — no React, no DOM.
 */

import type { AtmosphereState, AtmosphereEvent } from "./types.js";

export type MenuView =
  | "name-input"
  | "menu"
  | "joining"
  | "waiting"
  | "countdown"
  | "playing"
  | "results";

export interface MenuResultsInput {
  winnerId: string;
  localPlayerId: string;
}

export interface MenuAtmosphereInput {
  view: MenuView;
  /** Player count in the current room (0 if none). */
  playerCount?: number;
  /** Room capacity (defaults to 4 if unknown). */
  maxPlayers?: number;
  /** Results screen context — drives winner vs. loser feel. */
  results?: MenuResultsInput;
}

const CALM: AtmosphereState = {
  intensity: 0.15,
  danger: 0,
  momentum: 0.05,
  events: [],
};

const WAITING_MIN_INTENSITY = 0.15;
const WAITING_MAX_INTENSITY = 0.45;

/**
 * Scale intensity with room fullness. Empty/single-player rooms sit at
 * the calm floor; a full room reaches a gently energized level.
 */
export function computeWaitingRoomIntensity(
  playerCount: number,
  maxPlayers: number,
): number {
  const cap = Math.max(1, maxPlayers);
  const count = Math.max(0, Math.min(cap, playerCount));
  if (count <= 1) return WAITING_MIN_INTENSITY;
  const frac = (count - 1) / Math.max(1, cap - 1);
  return (
    WAITING_MIN_INTENSITY +
    (WAITING_MAX_INTENSITY - WAITING_MIN_INTENSITY) * frac
  );
}

/**
 * Compute an atmosphere-shaped state for the current non-game view.
 * Returns `null` for `playing`/`countdown` — those screens use the real
 * game-driven atmosphere.
 */
export function computeMenuAtmosphere(
  input: MenuAtmosphereInput,
): AtmosphereState | null {
  switch (input.view) {
    case "playing":
    case "countdown":
      return null;
    case "waiting": {
      const intensity = computeWaitingRoomIntensity(
        input.playerCount ?? 0,
        input.maxPlayers ?? 4,
      );
      return {
        intensity,
        danger: 0,
        momentum: 0.05 + intensity * 0.1,
        events: [],
      };
    }
    case "results": {
      const r = input.results;
      if (r && r.winnerId === r.localPlayerId) {
        return {
          intensity: 0.55,
          danger: 0,
          momentum: 0.7,
          events: [],
        };
      }
      return {
        intensity: 0.2,
        danger: 0,
        momentum: 0.1,
        events: [],
      };
    }
    case "name-input":
    case "menu":
    case "joining":
    default:
      return CALM;
  }
}

/**
 * One-shot events fired on entering a particular view — e.g., a winner
 * triad stab on the results screen. The caller is responsible for only
 * firing these once per view entry.
 */
export function computeMenuEntryEvents(
  input: MenuAtmosphereInput,
): readonly AtmosphereEvent[] {
  if (input.view !== "results") return [];
  const r = input.results;
  if (!r) return [];
  if (r.winnerId === r.localPlayerId) {
    return [{ type: "tetris", magnitude: 4 }];
  }
  return [];
}
