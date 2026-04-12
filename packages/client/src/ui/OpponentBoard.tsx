import { useRef, useEffect, useCallback } from "react";
import type { GameStateSnapshot, PlayerId } from "@tetris/shared";
import {
  renderOpponentBoard,
  opponentCanvasWidth,
  opponentCanvasHeight,
} from "./OpponentBoardCanvas.js";

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
}

export function OpponentBoard({
  playerName,
  playerId,
  snapshot,
  cellSize,
  isTargeted,
  isAttackingYou,
  onSelect,
}: OpponentBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const snapshotRef = useRef(snapshot);
  const rafRef = useRef<number>(0);

  snapshotRef.current = snapshot;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext("2d");
    }
    const ctx = ctxRef.current;
    if (!ctx) return;
    renderOpponentBoard(ctx, snapshotRef.current, cellSize);
  }, [cellSize]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [snapshot, draw]);

  const w = opponentCanvasWidth(cellSize);
  const h = opponentCanvasHeight(cellSize);
  const isGameOver = snapshot?.isGameOver ?? false;

  const handleClick = () => {
    if (playerId && onSelect && !isGameOver) {
      onSelect(playerId);
    }
  };

  let borderColor = "rgba(255,255,255,0.15)";
  if (isTargeted) {
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
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        data-testid="opponent-canvas"
        style={{
          display: "block",
          border: `2px solid ${borderColor}`,
          borderRadius: isTargeted ? "3px" : undefined,
          transition: "border-color 0.15s ease",
        }}
      />
    </div>
  );
}
