import { useState } from "react";
import { useLobby, makePlayerInfo } from "./net/lobby-client";
import { PlayerNameInput } from "./ui/PlayerNameInput";
import { Lobby } from "./ui/Lobby";
import { JoinDialog } from "./ui/JoinDialog";
import { WaitingRoom } from "./ui/WaitingRoom";
import { StatsScreen } from "./ui/StatsScreen";
import { Countdown } from "./ui/Countdown";

function App() {
  const lobby = useLobby();
  const [showStats, setShowStats] = useState(false);

  if (showStats) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#1a1a2e" }}>
        <StatsScreen username={lobby.playerName} onBack={() => setShowStats(false)} />
      </div>
    );
  }

  switch (lobby.state.view) {
    case "name-input":
      return (
        <PlayerNameInput
          initialName={lobby.playerName}
          onConfirm={(name) => {
            lobby.confirmName(name);
          }}
        />
      );

    case "menu":
      return (
        <Lobby
          playerName={lobby.playerName}
          connectionState={lobby.state.connectionState}
          error={lobby.state.error}
          onCreateRoom={lobby.createRoom}
          onJoinRoom={lobby.openJoinDialog}
          onViewStats={() => setShowStats(true)}
          onClearError={lobby.clearError}
        />
      );

    case "joining":
      return (
        <>
          <Lobby
            playerName={lobby.playerName}
            connectionState={lobby.state.connectionState}
            error={null}
            onCreateRoom={lobby.createRoom}
            onJoinRoom={lobby.openJoinDialog}
            onViewStats={() => setShowStats(true)}
            onClearError={lobby.clearError}
          />
          <JoinDialog
            error={lobby.state.error}
            onJoin={lobby.joinRoom}
            onCancel={lobby.closeJoinDialog}
          />
        </>
      );

    case "waiting":
      if (!lobby.state.room) return null;
      return (
        <WaitingRoom
          room={lobby.state.room}
          currentPlayerId={makePlayerInfo(lobby.playerName).id}
          onLeave={lobby.leaveRoom}
          onStart={lobby.startGame}
        />
      );

    case "countdown":
      return (
        <Countdown count={lobby.state.countdownValue ?? 3} />
      );

    case "playing": {
      const session = lobby.state.gameSession;
      const currentPlayerId = makePlayerInfo(lobby.playerName).id;
      const playerIndex = session?.playerIndexes[currentPlayerId] ?? 0;
      return (
        <div style={playingStyles.container}>
          <h1 style={playingStyles.title}>Game Active</h1>
          <p style={playingStyles.info}>
            Player #{playerIndex + 1} — Seed: {session?.seed}
          </p>
          <p style={playingStyles.subtitle}>
            Game board will be implemented in a future PR.
          </p>
        </div>
      );
    }
  }
}

const playingStyles = {
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
    marginBottom: "1rem",
  },
  info: {
    fontSize: "1.2rem",
    color: "#aaa",
    marginBottom: "0.5rem",
  },
  subtitle: {
    fontSize: "1rem",
    color: "#666",
  },
};

export default App;
