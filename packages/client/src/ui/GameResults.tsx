import { useState } from "react";
import type { PlayerId, PlayerStats, HandicapModifiers, HandicapMode } from "@tetris/shared";
import { formatTime, placementLabel } from "./formatTime.js";
import type { RematchVoteData, RatingChangeData } from "../net/lobby-client";
import "./GameResults.css";

export interface GameResultsProps {
  localPlayerId: PlayerId;
  winnerId: PlayerId;
  placements: Record<PlayerId, number>;
  stats: Record<PlayerId, PlayerStats>;
  playerNames: Record<PlayerId, string>;
  onBackToLobby: () => void;
  onRequestRematch: () => void;
  onViewStats: () => void;
  rematchVotes: RematchVoteData | null;
  /** Rating changes per player, arrives async after game end. */
  ratingChanges?: Record<PlayerId, RatingChangeData>;
  /** Handicap modifier matrix from the game session (key: "sender→receiver"). */
  handicapModifiers?: Record<string, HandicapModifiers>;
  /** Handicap mode used in the game. */
  handicapMode?: HandicapMode;
}

/**
 * Compute per-player incoming garbage multiplier (min across all opponents).
 * Returns only entries where at least one multiplier differs from 1.0.
 */
function computeHandicapSummary(
  playerNames: Record<PlayerId, string>,
  modifiers: Record<string, HandicapModifiers>,
): Record<PlayerId, number> | null {
  const names = Object.entries(playerNames);
  const summary: Record<PlayerId, number> = {};
  let hasNonTrivial = false;

  for (const [pid, name] of names) {
    let minMult = Infinity;
    for (const [otherPid, otherName] of names) {
      if (otherPid === pid) continue;
      const key = `${otherName}\u2192${name}`;
      const mod = modifiers[key];
      if (mod) {
        minMult = Math.min(minMult, mod.garbageMultiplier);
      }
    }
    if (isFinite(minMult)) {
      summary[pid] = minMult;
      if (Math.abs(minMult - 1.0) > 1e-6) hasNonTrivial = true;
    }
  }

  return hasNonTrivial ? summary : null;
}

export function GameResults({
  localPlayerId,
  winnerId,
  placements,
  stats,
  playerNames,
  onBackToLobby,
  onRequestRematch,
  onViewStats,
  rematchVotes,
  ratingChanges,
  handicapModifiers,
}: GameResultsProps) {
  const [hasVoted, setHasVoted] = useState(false);
  // Sort players by placement (1st first)
  const sortedPlayers = Object.keys(placements).sort(
    (a, b) => placements[a]! - placements[b]!,
  );

  const localPlacement = placements[localPlayerId] ?? 0;
  const isWinner = localPlayerId === winnerId;

  const hasRatings = ratingChanges !== undefined;

  const handicapSummary = handicapModifiers
    ? computeHandicapSummary(playerNames, handicapModifiers)
    : null;

  return (
    <div className="game-results" data-testid="game-results">
      <h2 className="results-title">
        {isWinner ? "VICTORY" : "DEFEATED"}
      </h2>
      <p className="results-placement" data-testid="results-placement">
        You placed {placementLabel(localPlacement)}
      </p>

      <div className="results-table" data-testid="results-table">
        <div className="results-header">
          <span className="results-cell cell-place">#</span>
          <span className="results-cell cell-name">Player</span>
          <span className="results-cell cell-stat">Sent</span>
          <span className="results-cell cell-stat">Recv</span>
          <span className="results-cell cell-stat">Pieces</span>
          <span className="results-cell cell-stat">Lines</span>
          <span className="results-cell cell-stat">Score</span>
          <span className="results-cell cell-stat">Time</span>
          {hasRatings && (
            <span className="results-cell cell-rating">Rating</span>
          )}
        </div>
        {sortedPlayers.map((pid, idx) => {
          const place = placements[pid]!;
          const s = stats[pid];
          const isLocal = pid === localPlayerId;
          const rc = ratingChanges?.[pid];
          const delta = rc ? rc.after - rc.before : undefined;

          return (
            <div
              key={pid}
              className={`results-row${isLocal ? " results-row-local" : ""}${place === 1 ? " results-row-winner" : ""}`}
              data-testid={`results-row-${pid}`}
            >
              <span className="results-cell cell-place">{placementLabel(place)}</span>
              <span className="results-cell cell-name">{playerNames[pid] ?? pid}</span>
              <span className="results-cell cell-stat">{s?.linesSent ?? 0}</span>
              <span className="results-cell cell-stat">{s?.linesReceived ?? 0}</span>
              <span className="results-cell cell-stat">{s?.piecesPlaced ?? 0}</span>
              <span className="results-cell cell-stat">{s?.linesCleared ?? 0}</span>
              <span className="results-cell cell-stat">{(s?.score ?? 0).toLocaleString()}</span>
              <span className="results-cell cell-stat">{formatTime(s?.survivalMs ?? 0)}</span>
              {hasRatings && (
                <span
                  className="results-cell cell-rating rating-reveal"
                  style={{ animationDelay: `${idx * 0.15}s` }}
                  data-testid={`rating-${pid}`}
                >
                  {rc ? (
                    <>
                      <span className="rating-value">{Math.round(rc.after)}</span>
                      <span
                        className={`rating-delta ${delta! >= 0 ? "rating-positive" : "rating-negative"}`}
                      >
                        {delta! >= 0 ? "+" : ""}{Math.round(delta!)}
                      </span>
                    </>
                  ) : (
                    "..."
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {handicapSummary && (
        <div className="handicap-summary" data-testid="handicap-summary">
          <div className="handicap-summary-title">Handicap Active</div>
          <div className="handicap-summary-items">
            {sortedPlayers.map((pid) => {
              const mult = handicapSummary[pid];
              if (mult === undefined) return null;
              const isProtected = mult < 1.0 - 1e-6;
              return (
                <span key={pid} className="handicap-summary-item">
                  <span className="handicap-player-name">{playerNames[pid] ?? pid}</span>
                  <span className={`handicap-mult${isProtected ? " handicap-protected" : ""}`}>
                    {mult.toFixed(1)}x
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="results-buttons">
        <button
          className="overlay-btn overlay-btn-primary"
          disabled={hasVoted}
          onClick={() => {
            setHasVoted(true);
            onRequestRematch();
          }}
          data-testid="rematch-btn"
        >
          {hasVoted ? "WAITING..." : "REMATCH"}
        </button>
        <button className="overlay-btn" onClick={onBackToLobby} data-testid="back-to-lobby">
          BACK TO LOBBY
        </button>
        <button className="overlay-btn" onClick={onViewStats} data-testid="view-stats">
          VIEW STATS
        </button>
      </div>
      {rematchVotes && (
        <p className="rematch-status" data-testid="rematch-status">
          {rematchVotes.votes.length}/{rematchVotes.totalPlayers} voted for rematch
        </p>
      )}
    </div>
  );
}
