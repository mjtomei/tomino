interface LobbyProps {
  playerName: string;
  connectionState: "disconnected" | "connecting" | "connected";
  error: string | null;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onViewStats: () => void;
  onClearError: () => void;
}

export function Lobby({
  playerName,
  connectionState,
  error,
  onCreateRoom,
  onJoinRoom,
  onViewStats,
  onClearError,
}: LobbyProps) {
  const connected = connectionState === "connected";

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Tetris</h1>
      <p style={styles.greeting}>Welcome, {playerName}</p>

      {connectionState === "connecting" && (
        <p style={styles.status}>Connecting to server...</p>
      )}
      {connectionState === "disconnected" && (
        <p style={styles.statusError}>Not connected to server</p>
      )}

      {error && (
        <div style={styles.error} role="alert">
          <span>{error}</span>
          <button onClick={onClearError} style={styles.errorClose} aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}

      <div style={styles.buttons}>
        <button
          onClick={onCreateRoom}
          disabled={!connected}
          style={styles.button}
        >
          Create Room
        </button>
        <button
          onClick={onJoinRoom}
          disabled={!connected}
          style={styles.button}
        >
          Join Room
        </button>
        <button
          onClick={onViewStats}
          style={styles.button}
        >
          View Stats
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
    fontSize: "3rem",
    marginBottom: "0.5rem",
  },
  greeting: {
    fontSize: "1.1rem",
    color: "#aaa",
    marginBottom: "2rem",
  },
  status: {
    color: "#888",
    marginBottom: "1rem",
  },
  statusError: {
    color: "#e74c3c",
    marginBottom: "1rem",
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.75rem 1rem",
    marginBottom: "1rem",
    borderRadius: "6px",
    backgroundColor: "#4a1a1a",
    color: "#e74c3c",
  },
  errorClose: {
    background: "none",
    border: "none",
    color: "#e74c3c",
    fontSize: "1.2rem",
    cursor: "pointer",
    padding: "0 0.25rem",
  },
  buttons: {
    display: "flex",
    gap: "1rem",
  },
  button: {
    padding: "1rem 2rem",
    fontSize: "1.2rem",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#0f3460",
    color: "#e0e0e0",
    cursor: "pointer",
    minWidth: "160px",
  },
};
