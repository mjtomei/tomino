import type { RoomState } from "@tetris/shared";
import { HandicapSettings, type HandicapSettingsValues } from "./HandicapSettings";

interface WaitingRoomProps {
  room: RoomState;
  currentPlayerId: string;
  handicapSettings: HandicapSettingsValues;
  onHandicapSettingsChange: (settings: HandicapSettingsValues) => void;
  onLeave: () => void;
  onStart: () => void;
}

export function WaitingRoom({
  room,
  currentPlayerId,
  handicapSettings,
  onHandicapSettingsChange,
  onLeave,
  onStart,
}: WaitingRoomProps) {
  const isHost = room.hostId === currentPlayerId;
  const canStart = room.players.length >= 2;
  const showRatings = handicapSettings.ratingVisible;

  function handleCopyCode() {
    navigator.clipboard.writeText(room.id).catch(() => {
      // Clipboard API may not be available; ignore silently
    });
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Waiting Room</h1>

      <div style={styles.roomInfo}>
        <span style={styles.label}>Room Code:</span>
        <code style={styles.code}>{room.id}</code>
        <button onClick={handleCopyCode} style={styles.copyButton} aria-label="Copy room code">
          Copy
        </button>
      </div>

      <div style={styles.playerList}>
        <h2 style={styles.subtitle}>
          Players ({room.players.length}/{room.config.maxPlayers})
        </h2>
        <ul style={styles.list}>
          {room.players.map((player) => (
            <li key={player.id} style={styles.listItem}>
              <span>{player.name}</span>
              {showRatings && room.playerRatings?.[player.id] != null && (
                <span style={styles.ratingBadge}>
                  {room.playerRatings[player.id]}
                </span>
              )}
              {player.id === room.hostId && (
                <span style={styles.hostBadge}>Host</span>
              )}
              {player.id === currentPlayerId && (
                <span style={styles.youBadge}>You</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <HandicapSettings
        settings={handicapSettings}
        onChange={onHandicapSettingsChange}
        disabled={!isHost}
      />

      <div style={styles.actions}>
        {isHost ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            style={styles.startButton}
          >
            {canStart ? "Start Game" : "Need at least 2 players"}
          </button>
        ) : (
          <p style={styles.waitText}>Waiting for host to start...</p>
        )}
        <button onClick={onLeave} style={styles.leaveButton}>
          Leave Room
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    fontFamily: "system-ui, sans-serif",
    backgroundColor: "#1a1a2e",
    color: "#e0e0e0",
  },
  title: {
    fontSize: "2.5rem",
    marginBottom: "1.5rem",
  },
  roomInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "2rem",
  },
  label: {
    color: "#aaa",
  },
  code: {
    fontSize: "1.3rem",
    padding: "0.5rem 1rem",
    backgroundColor: "#16213e",
    borderRadius: "6px",
    fontFamily: "monospace",
    letterSpacing: "0.1em",
  },
  copyButton: {
    padding: "0.5rem 0.75rem",
    fontSize: "0.85rem",
    borderRadius: "4px",
    border: "1px solid #444",
    backgroundColor: "transparent",
    color: "#aaa",
    cursor: "pointer",
  },
  playerList: {
    width: "320px",
    marginBottom: "2rem",
  },
  subtitle: {
    fontSize: "1.1rem",
    marginBottom: "0.75rem",
    color: "#ccc",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  listItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.6rem 0.75rem",
    borderBottom: "1px solid #2a2a4a",
    fontSize: "1.05rem",
  },
  ratingBadge: {
    fontSize: "0.75rem",
    padding: "0.15rem 0.5rem",
    borderRadius: "4px",
    backgroundColor: "#2a2a4a",
    color: "#aaa",
    fontFamily: "monospace",
  },
  hostBadge: {
    fontSize: "0.75rem",
    padding: "0.15rem 0.5rem",
    borderRadius: "4px",
    backgroundColor: "#e2b714",
    color: "#1a1a2e",
    fontWeight: "bold" as const,
  },
  youBadge: {
    fontSize: "0.75rem",
    padding: "0.15rem 0.5rem",
    borderRadius: "4px",
    backgroundColor: "#0f3460",
    color: "#e0e0e0",
  },
  actions: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "1rem",
  },
  startButton: {
    padding: "1rem 2rem",
    fontSize: "1.2rem",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#27ae60",
    color: "#fff",
    cursor: "pointer",
  },
  waitText: {
    color: "#888",
    fontSize: "1.1rem",
  },
  leaveButton: {
    padding: "0.5rem 1.5rem",
    fontSize: "0.95rem",
    borderRadius: "6px",
    border: "1px solid #444",
    backgroundColor: "transparent",
    color: "#aaa",
    cursor: "pointer",
  },
};
