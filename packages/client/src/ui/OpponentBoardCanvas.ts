import type { GameStateSnapshot, PieceType } from "@tetris/shared";
import {
  BOARD_WIDTH,
  VISIBLE_HEIGHT,
  BUFFER_HEIGHT,
  SRSRotation,
} from "@tetris/shared";
import { PIECE_COLORS, BOARD_BG } from "./colors.js";

export const OPPONENT_BOARD_WIDTH_CELLS = BOARD_WIDTH;
export const OPPONENT_BOARD_HEIGHT_CELLS = VISIBLE_HEIGHT;

export function opponentCanvasWidth(cellSize: number): number {
  return OPPONENT_BOARD_WIDTH_CELLS * cellSize;
}

export function opponentCanvasHeight(cellSize: number): number {
  return OPPONENT_BOARD_HEIGHT_CELLS * cellSize;
}

export function renderOpponentBoard(
  ctx: CanvasRenderingContext2D,
  snapshot: GameStateSnapshot | null,
  cellSize: number,
): void {
  const w = opponentCanvasWidth(cellSize);
  const h = opponentCanvasHeight(cellSize);

  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, w, h);

  if (!snapshot) return;

  const dimmed = snapshot.isGameOver;
  if (dimmed) ctx.globalAlpha = 0.5;

  for (let visRow = 0; visRow < VISIBLE_HEIGHT; visRow++) {
    const boardRow = visRow + BUFFER_HEIGHT;
    const row = snapshot.board[boardRow];
    if (!row) continue;
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const cell = row[col];
      if (cell) {
        ctx.fillStyle = PIECE_COLORS[cell as PieceType];
        ctx.fillRect(col * cellSize, visRow * cellSize, cellSize, cellSize);
      }
    }
  }

  const piece = snapshot.activePiece;
  if (piece) {
    const shape = SRSRotation.getShape(piece.type, piece.rotation);
    ctx.fillStyle = PIECE_COLORS[piece.type];
    for (let r = 0; r < shape.length; r++) {
      const row = shape[r]!;
      for (let c = 0; c < row.length; c++) {
        if (!row[c]) continue;
        const visRow = piece.y + r - BUFFER_HEIGHT;
        if (visRow < 0 || visRow >= VISIBLE_HEIGHT) continue;
        const visCol = piece.x + c;
        if (visCol < 0 || visCol >= BOARD_WIDTH) continue;
        ctx.fillRect(visCol * cellSize, visRow * cellSize, cellSize, cellSize);
      }
    }
  }

  if (dimmed) ctx.globalAlpha = 1;
}
