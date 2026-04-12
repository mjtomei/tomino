import type { GameStateSnapshot, PlayerId, RoomState } from "@tetris/shared";
import type { EliminationData } from "../net/lobby-client.js";
import { GameShell } from "./GameShell.js";
import { OpponentBoard, opponentCellSize } from "./OpponentBoard.js";
import { SpectatorOverlay } from "./SpectatorOverlay.js";

export interface GameMultiplayerProps {
  room: RoomState;
  currentPlayerId: PlayerId;
  seed?: number;
  opponentSnapshots: Record<PlayerId, GameStateSnapshot>;
  localElimination: EliminationData | null;
}

export function GameMultiplayer({
  room,
  currentPlayerId,
  seed,
  opponentSnapshots,
  localElimination,
}: GameMultiplayerProps) {
  const opponents = room.players.filter((p) => p.id !== currentPlayerId);
  const cellSize = opponentCellSize(opponents.length);

  return (
    <div
      data-testid="game-multiplayer"
      style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}
    >
      <div style={{ flex: "1 1 auto", position: "relative" }}>
        <GameShell seed={seed} />
        {localElimination && (
          <SpectatorOverlay placement={localElimination.placement} />
        )}
      </div>
      <div
        data-testid="opponent-boards"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "8px",
        }}
      >
        {opponents.map((p) => (
          <OpponentBoard
            key={p.id}
            playerName={p.name}
            snapshot={opponentSnapshots[p.id] ?? null}
            cellSize={cellSize}
          />
        ))}
      </div>
    </div>
  );
}
