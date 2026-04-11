import { useEffect, useState } from "react";
import type { StatsResponse } from "@tetris/shared";
import { Sparkline } from "./Sparkline";
import "./StatsScreen.css";

interface StatsScreenProps {
  username: string;
  onBack: () => void;
}

export function StatsScreen({ username, onBack }: StatsScreenProps) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const res = await fetch(`/api/stats/${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: StatsResponse = await res.json();
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stats");
          setLoading(false);
        }
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return <div className="stats-loading">Loading stats...</div>;
  }

  if (error) {
    return (
      <div className="stats-screen">
        <div className="stats-header">
          <button className="stats-back-btn" onClick={onBack}>
            Back
          </button>
          <h1>Stats</h1>
        </div>
        <div className="stats-empty">Error: {error}</div>
      </div>
    );
  }

  if (!stats) return null;

  const { player, rankLabel, matchHistory, ratingHistory } = stats;

  return (
    <div className="stats-screen">
      <div className="stats-header">
        <button className="stats-back-btn" onClick={onBack}>
          Back
        </button>
        <h1>Stats for {username}</h1>
      </div>

      {player ? (
        <div className="stats-rating-card">
          <div>
            <div className="stats-rating-value">{Math.round(player.rating)}</div>
            <div className="stats-meta">
              RD: {Math.round(player.ratingDeviation)} &middot; {player.gamesPlayed} games
            </div>
          </div>
          <span className="stats-rank-badge" data-rank={rankLabel}>
            {rankLabel}
          </span>
        </div>
      ) : (
        <div className="stats-rating-card">
          <div className="stats-meta">No games played yet</div>
          <span className="stats-rank-badge" data-rank={rankLabel}>
            {rankLabel}
          </span>
        </div>
      )}

      <div className="stats-section">
        <h2>Rating Over Time</h2>
        <Sparkline data={ratingHistory} width={680} height={80} />
      </div>

      <div className="stats-section">
        <h2>Match History</h2>
        {matchHistory.length === 0 ? (
          <div className="stats-empty">No matches yet</div>
        ) : (
          <table className="stats-table">
            <thead>
              <tr>
                <th>Opponent</th>
                <th>Result</th>
                <th>Rating Change</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {matchHistory.map((match) => {
                const isWinner = match.winner === username;
                const opponent = isWinner ? match.loser : match.winner;
                const changes = match.ratingChanges?.[username];
                const delta = changes ? changes.after - changes.before : null;

                return (
                  <tr key={`${match.gameId}-${match.timestamp}`}>
                    <td>{opponent}</td>
                    <td>
                      <span className={isWinner ? "stats-result-win" : "stats-result-loss"}>
                        {isWinner ? "Win" : "Loss"}
                      </span>
                    </td>
                    <td>
                      {delta !== null ? (
                        <span
                          className={
                            delta >= 0 ? "stats-change-positive" : "stats-change-negative"
                          }
                        >
                          {delta >= 0 ? "+" : ""}
                          {Math.round(delta)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{new Date(match.timestamp).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
