import type { MatchResult, PlayerProfile } from "./skill-types.js";

export type RankLabel = "Beginner" | "Intermediate" | "Advanced" | "Expert";

export interface RankThreshold {
  min: number;
  label: RankLabel;
}

/**
 * Rating thresholds for rank labels, ordered from highest to lowest.
 * First match wins — check in order.
 */
export const RANK_THRESHOLDS: readonly RankThreshold[] = [
  { min: 1800, label: "Expert" },
  { min: 1500, label: "Advanced" },
  { min: 1200, label: "Intermediate" },
  { min: 0, label: "Beginner" },
];

export function getRankLabel(rating: number): RankLabel {
  for (const { min, label } of RANK_THRESHOLDS) {
    if (rating >= min) return label;
  }
  return "Beginner";
}

export interface RatingPoint {
  timestamp: number;
  rating: number;
}

export interface StatsResponse {
  player: PlayerProfile | null;
  rankLabel: RankLabel;
  matchHistory: MatchResult[];
  ratingHistory: RatingPoint[];
}
