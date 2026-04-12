import type {
  GarbageBatch,
  GameStateSnapshot,
  PlayerId,
  RoomState,
  TargetingStrategyType,
  TargetingSettings,
} from "@tetris/shared";
import type { HandicapIndicatorData } from "./HandicapIndicator.js";
import type { EliminationData, PlayerTargetingState, PlayerAttackPower } from "../net/lobby-client.js";
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

  return (
    <div
      data-testid="game-multiplayer"
      style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}
    >
      <div style={{ flex: "1 1 auto", position: "relative" }}>
        <GameShell seed={seed} pendingGarbage={localPendingGarbage} handicap={handicap} />
        {localElimination && (
          <SpectatorOverlay placement={localElimination.placement} />
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
