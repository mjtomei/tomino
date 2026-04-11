import { useState } from "react";

interface JoinDialogProps {
  error: string | null;
  onJoin: (roomId: string) => void;
  onCancel: () => void;
}

export function JoinDialog({ error, onJoin, onCancel }: JoinDialogProps) {
  const [roomCode, setRoomCode] = useState("");

  const trimmed = roomCode.trim();
  const valid = trimmed.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valid) onJoin(trimmed);
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.dialog} role="dialog" aria-label="Join Room">
        <h2 style={styles.heading}>Join Room</h2>

        {error && (
          <p style={styles.error} role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label htmlFor="room-code" style={styles.label}>
            Room Code
          </label>
          <input
            id="room-code"
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            autoFocus
            placeholder="Enter room code"
            style={styles.input}
          />
          <div style={styles.buttons}>
            <button
              type="button"
              onClick={onCancel}
              style={styles.cancelButton}
            >
              Cancel
            </button>
            <button type="submit" disabled={!valid} style={styles.joinButton}>
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    fontFamily: "system-ui, sans-serif",
  },
  dialog: {
    backgroundColor: "#16213e",
    borderRadius: "12px",
    padding: "2rem",
    minWidth: "320px",
    color: "#e0e0e0",
  },
  heading: {
    margin: "0 0 1.5rem",
    fontSize: "1.5rem",
    textAlign: "center" as const,
  },
  error: {
    padding: "0.5rem 0.75rem",
    marginBottom: "1rem",
    borderRadius: "6px",
    backgroundColor: "#4a1a1a",
    color: "#e74c3c",
    textAlign: "center" as const,
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  },
  label: {
    fontSize: "0.9rem",
    color: "#aaa",
  },
  input: {
    padding: "0.75rem 1rem",
    fontSize: "1.1rem",
    borderRadius: "6px",
    border: "1px solid #444",
    backgroundColor: "#1a1a2e",
    color: "#e0e0e0",
    outline: "none",
    textAlign: "center" as const,
  },
  buttons: {
    display: "flex",
    gap: "1rem",
    justifyContent: "center",
    marginTop: "0.5rem",
  },
  cancelButton: {
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
    borderRadius: "6px",
    border: "1px solid #444",
    backgroundColor: "transparent",
    color: "#aaa",
    cursor: "pointer",
  },
  joinButton: {
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#0f3460",
    color: "#e0e0e0",
    cursor: "pointer",
  },
};
