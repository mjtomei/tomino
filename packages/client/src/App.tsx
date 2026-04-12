import { useState, useMemo } from "react";
import { useLobby, makePlayerInfo } from "./net/lobby-client";
import { PlayerNameInput } from "./ui/PlayerNameInput";
import { Lobby } from "./ui/Lobby";
import { JoinDialog } from "./ui/JoinDialog";
import { WaitingRoom } from "./ui/WaitingRoom";
import { StatsScreen } from "./ui/StatsScreen";
import { Countdown } from "./ui/Countdown";
import { computeIndicatorData } from "./ui/handicap-indicator";
import { GameShell } from "./ui/GameShell";
import { LatencyIndicator } from "./ui/LatencyIndicator";
import { useLatency } from "./net/latency";
import { GameMultiplayer } from "./ui/GameMultiplayer";
import { GameResults } from "./ui/GameResults";
import { DisconnectOverlay } from "./ui/DisconnectOverlay";

function App() {
  const lobby = useLobby();
  const [showStats, setShowStats] = useState(false);
  const [showSolo, setShowSolo] = useState(false);

  // Compute handicap indicator data (must be called unconditionally as a hook)
  const currentPlayerId = makePlayerInfo(lobby.playerName).id;
  const session = lobby.state.gameSession;
  const handicapData = useMemo(() => {
    if (!session?.handicapModifiers || !lobby.state.room) return undefined;
    const opponents = lobby.state.room.players
      .filter((p) => p.id !== currentPlayerId)
      .map((p) => p.name);
    return computeIndicatorData(
      lobby.playerName,
      opponents,
      session.handicapModifiers,
      session.handicapMode,
    );
  }, [session?.handicapModifiers, session?.handicapMode, lobby.state.room, currentPlayerId, lobby.playerName]);

  const latencyMs = useLatency(lobby.socket, lobby.state.view === "playing");

  if (showStats) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#1a1a2e" }}>
        <StatsScreen username={lobby.playerName} onBack={() => setShowStats(false)} />
      </div>
    );
  }

  if (showSolo) {
    return <GameShell onBack={() => setShowSolo(false)} />;
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
          onSoloPlay={() => setShowSolo(true)}
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
            onSoloPlay={() => setShowSolo(true)}
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
          targetingSettings={lobby.lobbyTargetingSettings}
          onTargetingSettingsChange={lobby.updateTargetingSettings}
          onLeave={lobby.leaveRoom}
          onStart={lobby.startGame}
        />
      );

    case "countdown":
      return (
        <Countdown count={lobby.state.countdownValue ?? 3} />
      );

    case "playing": {
      if (!lobby.state.room) return null;
      // Determine disconnect overlay to show (self-reconnecting or peer disconnected)
      const peerDisconnect = lobby.state.disconnectedPeers[0];
      const peerName = peerDisconnect
        ? lobby.state.room.players.find((p) => p.id === peerDisconnect.playerId)?.name ?? "Opponent"
        : null;
      return (
        <>
          <GameMultiplayer
            room={lobby.state.room}
            currentPlayerId={currentPlayerId}
            seed={session?.seed}
            opponentSnapshots={lobby.state.opponentStates}
            localPendingGarbage={lobby.state.localPendingGarbage}
            localElimination={lobby.state.localElimination}
            targetingStates={lobby.state.targetingStates}
            attackPowers={lobby.state.attackPowers}
            targetingSettings={lobby.state.targetingSettings}
            handicap={handicapData}
            onStrategyChange={lobby.setTargetingStrategy}
            onManualTarget={lobby.setManualTarget}
            socket={lobby.socket}
            gameSession={session}
            recentEmotes={lobby.state.recentEmotes}
            onSendEmote={lobby.sendEmote}
          />
          {lobby.state.selfReconnecting && lobby.state.selfReconnectStartedAt != null && lobby.state.selfReconnectTimeoutMs != null && (
            <DisconnectOverlay
              label={"Reconnecting\u2026"}
              timeoutMs={lobby.state.selfReconnectTimeoutMs}
              startedAt={lobby.state.selfReconnectStartedAt}
            />
          )}
          {peerDisconnect && peerName && (
            <DisconnectOverlay
              label={`${peerName} disconnected`}
              timeoutMs={peerDisconnect.timeoutMs}
              startedAt={peerDisconnect.startedAt}
            />
          )}
          <LatencyIndicator latencyMs={latencyMs} />
        </>
      );
    }

    case "results": {
      if (!lobby.state.room || !lobby.state.gameEndData) return null;
      const playerNames: Record<string, string> = {};
      for (const p of lobby.state.room.players) {
        playerNames[p.id] = p.name;
      }
      return (
        <div style={{ minHeight: "100vh", backgroundColor: "#1a1a2e", color: "#e0e0e0", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <GameResults
            localPlayerId={currentPlayerId}
            winnerId={lobby.state.gameEndData.winnerId}
            placements={lobby.state.gameEndData.placements}
            stats={lobby.state.gameEndData.stats}
            playerNames={playerNames}
            onBackToLobby={lobby.leaveRoom}
            onRequestRematch={lobby.requestRematch}
            onViewStats={() => setShowStats(true)}
            rematchVotes={lobby.state.rematchVotes}
            ratingChanges={lobby.state.gameEndData.ratingChanges}
            handicapModifiers={session?.handicapModifiers}
          />
        </div>
      );
    }
  }
}

export default App;
