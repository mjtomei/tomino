/**
 * Post-game rating update handler.
 *
 * After a multiplayer game ends, collects performance metrics, runs the
 * Glicko-2 algorithm pairwise (winner vs each loser), persists updated
 * profiles and match results, and broadcasts rating changes to the room.
 */

import type {
  MatchResult,
  PerformanceMetrics,
  PlayerProfile,
  PlayerId,
  RatingChange,
  RoomId,
  ServerMessage,
  SkillStore,
} from "@tetris/shared";
import type { GameEndResult } from "./game-session.js";
import { updateRatings } from "./rating-algorithm.js";
import { GLICKO_CONFIG } from "./rating-config.js";
import { randomUUID } from "node:crypto";

/** Create a default profile for a player who has never been rated. */
function defaultProfile(username: string): PlayerProfile {
  return {
    username,
    rating: GLICKO_CONFIG.INITIAL_RATING,
    ratingDeviation: GLICKO_CONFIG.INITIAL_RD,
    volatility: GLICKO_CONFIG.INITIAL_VOLATILITY,
    gamesPlayed: 0,
  };
}

/**
 * Process post-game rating updates for a completed game.
 *
 * - Fetches (or creates) player profiles from the store
 * - Runs Glicko-2 pairwise: winner vs each loser (cumulative for the winner)
 * - Persists updated profiles and match results
 * - Broadcasts a ratingUpdate message to the room
 *
 * Skipped when there are fewer than 2 players (no opponents to rate against).
 */
export async function handlePostGame(
  result: GameEndResult,
  store: SkillStore,
  broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => void,
): Promise<void> {
  const { roomId, winnerId, playerNames, placements, metrics } = result;
  const playerIds = Object.keys(placements);

  // Need at least 2 players for a rated game
  if (playerIds.length < 2) return;

  const winnerName = playerNames[winnerId]!;
  const loserIds = playerIds.filter((pid) => pid !== winnerId);

  // Fetch all player profiles (or create defaults for new players)
  const profiles = new Map<string, PlayerProfile>();
  for (const pid of playerIds) {
    const username = playerNames[pid]!;
    const existing = await store.getPlayer(username);
    profiles.set(pid, existing ?? defaultProfile(username));
  }

  const gameId = randomUUID();
  const timestamp = Date.now();

  // Build the metrics record keyed by username (MatchResult uses usernames)
  const metricsByUsername: Record<string, PerformanceMetrics> = {};
  for (const pid of playerIds) {
    const username = playerNames[pid]!;
    if (metrics[pid]) {
      metricsByUsername[username] = metrics[pid];
    }
  }

  // Track rating changes for the broadcast
  const ratingChanges: Record<PlayerId, RatingChange> = {};

  // Record the winner's starting rating before any updates
  const winnerBefore = profiles.get(winnerId)!.rating;

  // Pairwise updates: winner vs each loser (cumulative for the winner)
  for (const loserId of loserIds) {
    const winnerProfile = profiles.get(winnerId)!;
    const loserProfile = profiles.get(loserId)!;
    const loserBefore = loserProfile.rating;

    const updated = updateRatings(winnerProfile, loserProfile);

    // Update profiles in the map (winner accumulates across pairwise matches)
    profiles.set(winnerId, updated.winner);
    profiles.set(loserId, updated.loser);

    // Build and save the match result
    const matchRatingChanges: Record<string, { before: number; after: number }> = {
      [winnerProfile.username]: {
        before: winnerProfile.rating,
        after: updated.winner.rating,
      },
      [loserProfile.username]: {
        before: loserBefore,
        after: updated.loser.rating,
      },
    };

    const matchResult: MatchResult = {
      gameId,
      winner: winnerProfile.username,
      loser: loserProfile.username,
      metrics: metricsByUsername,
      timestamp,
      ratingChanges: matchRatingChanges,
    };

    await store.saveMatchResult(matchResult);

    // Persist the loser's updated profile immediately
    await store.upsertPlayer(updated.loser);

    // Track loser's rating change for the broadcast
    ratingChanges[loserId] = {
      username: loserProfile.username,
      before: loserBefore,
      after: updated.loser.rating,
    };
  }

  // Persist the winner's final accumulated profile
  const winnerFinal = profiles.get(winnerId)!;
  await store.upsertPlayer(winnerFinal);

  // Track winner's overall rating change (before first match → after last)
  ratingChanges[winnerId] = {
    username: winnerName,
    before: winnerBefore,
    after: winnerFinal.rating,
  };

  // Broadcast rating updates to all players in the room
  broadcastToRoom(roomId, {
    type: "ratingUpdate",
    roomId,
    changes: ratingChanges,
  });
}
