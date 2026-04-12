/**
 * Compute effective handicap multipliers for the local player
 * from the modifier matrix sent at game start.
 */

import type { HandicapModifiers, HandicapMode } from "@tetris/shared";
import { modifierKey } from "@tetris/shared";
import type { HandicapIndicatorData } from "./HandicapIndicator.js";

/**
 * Compute the handicap indicator data for a given player.
 *
 * @param localPlayerName - The local player's display name.
 * @param opponentNames - Array of opponent display names.
 * @param modifiers - Serialized modifier matrix (key: "sender→receiver").
 * @param mode - Handicap mode ("boost" or "symmetric").
 * @returns Indicator data, or undefined if no handicap is active.
 */
export function computeIndicatorData(
  localPlayerName: string,
  opponentNames: string[],
  modifiers: Record<string, HandicapModifiers>,
  mode?: HandicapMode,
): HandicapIndicatorData | undefined {
  if (opponentNames.length === 0) return undefined;

  // Compute minimum incoming multiplier (strongest protection)
  let minIncoming = Infinity;
  for (const opponent of opponentNames) {
    const key = modifierKey(opponent, localPlayerName);
    const mod = modifiers[key];
    if (mod) {
      minIncoming = Math.min(minIncoming, mod.garbageMultiplier);
    }
  }
  if (!isFinite(minIncoming)) return undefined;

  const result: HandicapIndicatorData = {
    incomingMultiplier: minIncoming,
  };

  // In symmetric mode, compute minimum outgoing multiplier
  if (mode === "symmetric") {
    let minOutgoing = Infinity;
    for (const opponent of opponentNames) {
      const key = modifierKey(localPlayerName, opponent);
      const mod = modifiers[key];
      if (mod) {
        minOutgoing = Math.min(minOutgoing, mod.garbageMultiplier);
      }
    }
    if (isFinite(minOutgoing) && Math.abs(minOutgoing - 1.0) > 1e-6) {
      result.outgoingMultiplier = minOutgoing;
    }
  }

  return result;
}
