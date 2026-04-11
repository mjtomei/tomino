import { useState } from "react";
import { StatsScreen } from "./ui/StatsScreen";

type Screen = "menu" | "stats";

function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [username, setUsername] = useState("player1");

  if (screen === "stats") {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#1a1a2e" }}>
        <StatsScreen username={username} onBack={() => setScreen("menu")} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#1a1a2e",
        color: "#e0e0e0",
      }}
    >
      <h1 style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>Tetris</h1>
      <p style={{ color: "#888", marginBottom: "2rem" }}>Game coming soon...</p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <label htmlFor="username-input" style={{ color: "#888", fontSize: "0.9rem" }}>
            Username:
          </label>
          <input
            id="username-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              padding: "0.4rem 0.6rem",
              borderRadius: "4px",
              border: "1px solid #555",
              background: "#16213e",
              color: "#e0e0e0",
              fontSize: "0.9rem",
            }}
          />
        </div>
        <button
          onClick={() => setScreen("stats")}
          disabled={!username.trim()}
          style={{
            padding: "0.6rem 1.5rem",
            borderRadius: "4px",
            border: "1px solid #555",
            background: "#16213e",
            color: "#e0e0e0",
            cursor: username.trim() ? "pointer" : "not-allowed",
            fontSize: "1rem",
          }}
        >
          View Stats
        </button>
      </div>
    </div>
  );
}

export default App;
