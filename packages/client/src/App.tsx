import { useState } from "react";
import { useLobby, makePlayerInfo } from "./net/lobby-client";
import { PlayerNameInput } from "./ui/PlayerNameInput";
import { Lobby } from "./ui/Lobby";
import { JoinDialog } from "./ui/JoinDialog";
import { WaitingRoom } from "./ui/WaitingRoom";
import { StatsScreen } from "./ui/StatsScreen";

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
          handicapSettings={lobby.handicapSettings}
          onHandicapSettingsChange={lobby.updateHandicapSettings}
          onLeave={lobby.leaveRoom}
          onStart={lobby.startGame}
        />
      );
  }
}

export default App;
