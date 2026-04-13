import { Router } from "express";
import type { SkillStore, StatsResponse } from "@tomino/shared";
import { getRankLabel } from "@tomino/shared";

export function createStatsRouter(store: SkillStore): Router {
  const router = Router();

  router.get("/api/stats/:username", async (req, res) => {
    try {
      const { username } = req.params;
      const player = await store.getPlayer(username);
      const matchHistory = await store.getMatchHistory(username, 20);

      // Derive rating history from match results (chronological order)
      const ratingHistory: StatsResponse["ratingHistory"] = [];
      // matchHistory is most-recent-first; reverse for chronological order
      const chronological = [...matchHistory].reverse();
      for (const match of chronological) {
        const changes = match.ratingChanges?.[username];
        if (changes) {
          ratingHistory.push({
            timestamp: match.timestamp,
            rating: changes.after,
          });
        }
      }

      const rankLabel = player ? getRankLabel(player.rating) : "Beginner";

      const response: StatsResponse = {
        player,
        rankLabel,
        matchHistory,
        ratingHistory,
      };

      res.json(response);
    } catch (err) {
      console.error("Error fetching stats:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
