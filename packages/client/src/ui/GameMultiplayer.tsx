import type { GarbageBatch, GameStateSnapshot, PlayerId, RoomState } from "@tetris/shared";
import { GameShell } from "./GameShell.js";
import { OpponentBoard, opponentCellSize } from "./OpponentBoard.js";

export interface GameMultiplayerProps {
  room: RoomState;
  currentPlayerId: PlayerId;
  seed?: number;
  opponentSnapshots: Record<PlayerId, GameStateSnapshot>;
  /** Pending garbage for the local player. */
  localPendingGarbage?: GarbageBatch[];
}

export function GameMultiplayer({
  room,
  currentPlayerId,
  seed,
  opponentSnapshots,
  localPendingGarbage,
}: GameMultiplayerProps) {
  const opponents = room.players.filter((p) => p.id !== currentPlayerId);
  const cellSize = opponentCellSize(opponents.length);

  return (
    <div
      data-testid="game-multiplayer"
      style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}
    >
      <div style={{ flex: "1 1 auto" }}>
        <GameShell seed={seed} pendingGarbage={localPendingGarbage} />
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
