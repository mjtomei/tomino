import { useRef, useEffect, useCallback, useState } from "react";
import type { EmoteKind, GameStateSnapshot, PlayerId } from "@tomino/shared";
import {
  renderOpponentBoard,
  opponentCanvasWidth,
  opponentCanvasHeight,
} from "./OpponentBoardCanvas.js";
import { ParticleSystem } from "../atmosphere/particle-system.js";
import { ParticleCanvas } from "../atmosphere/ParticleCanvas.js";
import {
  playEmoteEffect,
  playReactionEffect,
  type OpponentReaction,
} from "../atmosphere/opponent-reactions.js";
import { useTheme } from "../atmosphere/theme-context.js";

export function opponentCellSize(opponentCount: number): number {
  if (opponentCount <= 1) return 15;
  if (opponentCount === 2) return 12;
  if (opponentCount === 3) return 10;
  return 8;
}

export interface OpponentBoardProps {
  playerName: string;
  playerId?: PlayerId;
  snapshot: GameStateSnapshot | null;
  cellSize: number;
  /** Whether this opponent is the current manual target. */
  isTargeted?: boolean;
  /** Whether this opponent is targeting the local player. */
  isAttackingYou?: boolean;
  /** Called when the player clicks this board (for manual targeting). */
  onSelect?: (playerId: PlayerId) => void;
  /** Latest emote received from this opponent (timestamp is the identity key). */
  activeEmote?: { emote: EmoteKind; timestamp: number } | null;
  /** Latest reaction pulse for this opponent (at is the identity key). */
  reactionPulse?: { reaction: OpponentReaction; at: number } | null;
}

const FLASH_DURATION_MS = 600;

const FLASH_COLOR: Record<OpponentReaction, string> = {
  quad: "#ffd84a",
  heavyGarbage: "#e74c3c",
  eliminated: "#ffffff",
};

export function OpponentBoard({
  playerName,
  playerId,
  snapshot,
  cellSize,
  isTargeted,
  isAttackingYou,
  onSelect,
  activeEmote,
  reactionPulse,
}: OpponentBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const snapshotRef = useRef(snapshot);
  const rafRef = useRef<number>(0);
  const systemRef = useRef<ParticleSystem | null>(null);
  if (!systemRef.current) {
    systemRef.current = new ParticleSystem({ maxParticles: 200 });
  }
  const lastEmoteTsRef = useRef<number | null>(null);
  const lastPulseAtRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<OpponentReaction | null>(null);
  const { palette } = useTheme();
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  snapshotRef.current = snapshot;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext("2d");
    }
    const ctx = ctxRef.current;
    if (!ctx) return;
    renderOpponentBoard(ctx, snapshotRef.current, cellSize, paletteRef.current);
  }, [cellSize]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [snapshot, draw]);

  const w = opponentCanvasWidth(cellSize);
  const h = opponentCanvasHeight(cellSize);

  // Fire a new emote burst when the emote timestamp changes.
  useEffect(() => {
    if (!activeEmote) return;
    if (lastEmoteTsRef.current === activeEmote.timestamp) return;
    lastEmoteTsRef.current = activeEmote.timestamp;
    const system = systemRef.current;
    if (!system) return;
    playEmoteEffect(system, activeEmote.emote, { x: w / 2, y: h / 3 });
  }, [activeEmote, w, h]);

  // Fire a new reaction pulse when the pulse "at" changes.
  useEffect(() => {
    if (!reactionPulse) return;
    if (lastPulseAtRef.current === reactionPulse.at) return;
    lastPulseAtRef.current = reactionPulse.at;
    const system = systemRef.current;
    if (!system) return;
    playReactionEffect(system, reactionPulse.reaction, { x: w / 2, y: h / 2 });
    setFlash(reactionPulse.reaction);
    const timer = setTimeout(() => setFlash(null), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [reactionPulse, w, h]);

  const isGameOver = snapshot?.isGameOver ?? false;

  const handleClick = () => {
    if (playerId && onSelect && !isGameOver) {
      onSelect(playerId);
    }
  };

  let borderColor = "rgba(255,255,255,0.15)";
  if (flash) {
    borderColor = FLASH_COLOR[flash];
  } else if (isTargeted) {
    borderColor = "#e74c3c"; // red for targeted
  } else if (isAttackingYou) {
    borderColor = "#e2b714"; // yellow for attackers
  }

  return (
    <div
      data-testid="opponent-board"
      data-player-id={playerName}
      onClick={handleClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "4px",
        color: "#ccc",
        fontSize: "0.75rem",
        fontFamily: "sans-serif",
        cursor: onSelect && !isGameOver ? "pointer" : "default",
      }}
    >
      <div
        style={{
          maxWidth: w,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: "2px",
          opacity: isGameOver ? 0.5 : 1,
        }}
      >
        {playerName}
        {isGameOver ? " \u2717" : ""}
        {isTargeted && !isGameOver ? " \u25C9" : ""}
      </div>
      <div style={{ position: "relative", width: w, height: h }}>
        <canvas
          ref={canvasRef}
          width={w}
          height={h}
          data-testid="opponent-canvas"
          data-flash={flash ?? undefined}
          data-emote={activeEmote?.emote ?? undefined}
          style={{
            display: "block",
            border: `2px solid ${borderColor}`,
            borderRadius: flash || isTargeted ? "3px" : undefined,
            boxShadow: flash ? `0 0 12px ${FLASH_COLOR[flash]}` : undefined,
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          }}
        />
        <ParticleCanvas system={systemRef.current} width={w} height={h} />
      </div>
    </div>
  );
}
