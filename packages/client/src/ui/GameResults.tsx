import type { PlayerId, PlayerStats } from "@tetris/shared";
import { formatTime, placementLabel } from "./formatTime.js";
import "./GameResults.css";

export interface GameResultsProps {
  localPlayerId: PlayerId;
  winnerId: PlayerId;
  placements: Record<PlayerId, number>;
  stats: Record<PlayerId, PlayerStats>;
  playerNames: Record<PlayerId, string>;
  onBackToLobby: () => void;
}

export function GameResults({
  localPlayerId,
  winnerId,
  placements,
  stats,
  playerNames,
  onBackToLobby,
}: GameResultsProps) {
  // Sort players by placement (1st first)
  const sortedPlayers = Object.keys(placements).sort(
    (a, b) => placements[a]! - placements[b]!,
  );

  const localPlacement = placements[localPlayerId] ?? 0;
  const isWinner = localPlayerId === winnerId;

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
        </div>
        {sortedPlayers.map((pid) => {
          const place = placements[pid]!;
          const s = stats[pid];
          const isLocal = pid === localPlayerId;
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
            </div>
          );
        })}
      </div>

      <div className="results-buttons">
        <button className="overlay-btn" onClick={onBackToLobby} data-testid="back-to-lobby">
          BACK TO LOBBY
        </button>
      </div>
    </div>
  );
}
