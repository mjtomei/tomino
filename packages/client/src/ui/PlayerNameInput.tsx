import { useState } from "react";

interface PlayerNameInputProps {
  initialName: string;
  onConfirm: (name: string) => void;
}

export function PlayerNameInput({ initialName, onConfirm }: PlayerNameInputProps) {
  const [name, setName] = useState(initialName);

  const trimmed = name.trim().slice(0, 20);
  const valid = trimmed.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valid) onConfirm(trimmed);
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Tetris</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <label htmlFor="player-name" style={styles.label}>
          Enter your name
        </label>
        <input
          id="player-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
          placeholder="Player name"
          style={styles.input}
        />
        <button type="submit" disabled={!valid} style={styles.button}>
          Continue
        </button>
      </form>
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
    marginBottom: "2rem",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "1rem",
  },
  label: {
    fontSize: "1.2rem",
    color: "#ccc",
  },
  input: {
    padding: "0.75rem 1rem",
    fontSize: "1.1rem",
    borderRadius: "6px",
    border: "1px solid #444",
    backgroundColor: "#16213e",
    color: "#e0e0e0",
    outline: "none",
    width: "240px",
    textAlign: "center" as const,
  },
  button: {
    padding: "0.75rem 2rem",
    fontSize: "1.1rem",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#0f3460",
    color: "#e0e0e0",
    cursor: "pointer",
  },
};
