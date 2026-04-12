import { useEffect, useRef, useState } from "react";
import type {
  EmoteKind,
  GarbageBatch,
  GameStateSnapshot,
  PlayerId,
  RoomId,
  RoomState,
  TargetingStrategyType,
  TargetingSettings,
} from "@tetris/shared";
import type { HandicapIndicatorData } from "./HandicapIndicator.js";
import type {
  ActiveEmote,
  EliminationData,
  PlayerTargetingState,
  PlayerAttackPower,
} from "../net/lobby-client.js";
import {
  detectReactions,
  type OpponentReaction,
} from "../atmosphere/opponent-reactions.js";
import { EmotePicker } from "./EmotePicker.js";
import type { GameSessionData } from "../net/game-client.js";
import type { ClientSocket } from "../net/client-socket.js";
import { GameClient } from "../net/game-client.js";
import { GameShell } from "./GameShell.js";
import { OpponentBoard, opponentCellSize } from "./OpponentBoard.js";
import { SpectatorOverlay } from "./SpectatorOverlay.js";
import { TargetingSelector } from "./TargetingSelector.js";

export interface GameMultiplayerProps {
  room: RoomState;
  currentPlayerId: PlayerId;
  seed?: number;
  opponentSnapshots: Record<PlayerId, GameStateSnapshot>;
  /** Pending garbage for the local player. */
  localPendingGarbage?: GarbageBatch[];
  localElimination: EliminationData | null;
  targetingStates?: Record<PlayerId, PlayerTargetingState>;
  attackPowers?: Record<PlayerId, PlayerAttackPower>;
  targetingSettings?: TargetingSettings | null;
  /** Handicap indicator data for the local player's board. */
  handicap?: HandicapIndicatorData;
  onStrategyChange?: (strategy: TargetingStrategyType) => void;
  onManualTarget?: (targetPlayerId: PlayerId) => void;
  /** Socket for constructing GameClient. */
  socket?: ClientSocket | null;
  /** Game session data from the server. */
  gameSession?: GameSessionData | null;
  /** Latest emote per player from the lobby state. */
  recentEmotes?: Record<PlayerId, ActiveEmote>;
  /** Called when the local player triggers an emote. */
  onSendEmote?: (emote: EmoteKind) => void;
}

export function GameMultiplayer({
  room,
  currentPlayerId,
  seed,
  opponentSnapshots,
  localPendingGarbage,
  localElimination,
  targetingStates,
  attackPowers,
  targetingSettings,
  handicap,
  onStrategyChange,
  onManualTarget,
  socket,
  gameSession,
  recentEmotes,
  onSendEmote,
}: GameMultiplayerProps) {
  const opponents = room.players.filter((p) => p.id !== currentPlayerId);
  const cellSize = opponentCellSize(opponents.length);

  const myTargeting = targetingStates?.[currentPlayerId];
  const activeStrategy = myTargeting?.strategy ?? targetingSettings?.defaultStrategy ?? "random";
  const myManualTarget = myTargeting?.targetPlayerId;
  const myAttackPower = attackPowers?.[currentPlayerId];

  // Determine which opponents are targeting the local player
  const attackersSet = new Set<PlayerId>();
  if (targetingStates) {
    for (const [pid, ts] of Object.entries(targetingStates)) {
      if (pid === currentPlayerId) continue;
      if (ts.strategy === "manual" && ts.targetPlayerId === currentPlayerId) {
        attackersSet.add(pid);
      }
    }
  }

  // -- Opponent reaction detection --
  // Track previous snapshots to diff against on each update; emit reaction
  // pulses that child OpponentBoards render as flashes + particle bursts.
  const prevSnapshotsRef = useRef<Record<PlayerId, GameStateSnapshot>>({});
  const [reactionPulses, setReactionPulses] = useState<
    Record<PlayerId, { reaction: OpponentReaction; at: number }>
  >({});

  useEffect(() => {
    const prev = prevSnapshotsRef.current;
    const updates: Record<PlayerId, { reaction: OpponentReaction; at: number }> = {};
    const now = Date.now();
    for (const [pid, snap] of Object.entries(opponentSnapshots)) {
      const events = detectReactions(prev[pid] ?? null, snap, pid, now);
      if (events.length > 0) {
        // Prefer the "biggest" reaction; elimination > tetris > heavyGarbage
        const priority: Record<OpponentReaction, number> = {
          eliminated: 3,
          tetris: 2,
          heavyGarbage: 1,
        };
        const chosen = events.reduce((a, b) =>
          priority[b.reaction] > priority[a.reaction] ? b : a,
        );
        updates[pid] = { reaction: chosen.reaction, at: chosen.at };
      }
    }
    prevSnapshotsRef.current = opponentSnapshots;
    if (Object.keys(updates).length > 0) {
      setReactionPulses((prevPulses) => ({ ...prevPulses, ...updates }));
    }
  }, [opponentSnapshots]);

  // -- GameClient lifecycle --
  // GameClient subscribes to socket events in its constructor (side effect),
  // so we must use useEffect for correct cleanup — not useMemo.
  const [gameClient, setGameClient] = useState<GameClient | null>(null);

  useEffect(() => {
    if (!socket || !gameSession) {
      setGameClient(null);
      return;
    }
    const client = new GameClient({
      socket,
      roomId: room.id as RoomId,
      localPlayerId: currentPlayerId,
      session: gameSession,
    });
    setGameClient(client);
    return () => {
      client.dispose();
    };
  }, [socket, gameSession, room.id, currentPlayerId]);

  // Wait for GameClient to be ready before rendering (avoids flash of
  // SoloGameShell StartScreen while the effect constructs the client).
  if (socket && gameSession && !gameClient) {
    return null;
  }

  return (
    <div
      data-testid="game-multiplayer"
      style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}
    >
      <div style={{ flex: "1 1 auto", position: "relative" }}>
        <GameShell
          seed={seed}
          pendingGarbage={localPendingGarbage}
          handicap={handicap}
          gameClient={gameClient ?? undefined}
        />
        {localElimination && (
          <SpectatorOverlay placement={localElimination.placement} />
        )}
        {onSendEmote && (
          <div style={emotePickerStyle}>
            <EmotePicker onEmote={onSendEmote} />
          </div>
        )}
        {targetingSettings && (
          <div style={selectorStyle}>
            <TargetingSelector
              enabledStrategies={targetingSettings.enabledStrategies}
              activeStrategy={activeStrategy}
              onStrategyChange={(s) => onStrategyChange?.(s)}
              attackMultiplier={myAttackPower?.multiplier}
            />
          </div>
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
            playerId={p.id}
            snapshot={opponentSnapshots[p.id] ?? null}
            cellSize={cellSize}
            isTargeted={myManualTarget === p.id}
            isAttackingYou={attackersSet.has(p.id)}
            onSelect={onManualTarget}
            activeEmote={recentEmotes?.[p.id] ?? null}
            reactionPulse={reactionPulses[p.id] ?? null}
          />
        ))}
      </div>
    </div>
  );
}

const selectorStyle = {
  position: "absolute" as const,
  bottom: "8px",
  left: "8px",
  zIndex: 5,
};

const emotePickerStyle = {
  position: "absolute" as const,
  bottom: "8px",
  right: "8px",
  zIndex: 5,
};
