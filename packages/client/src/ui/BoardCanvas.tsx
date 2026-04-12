import { useRef, useEffect, useCallback } from "react";
import type { GameState, PieceType, PieceShape } from "@tetris/shared";
import { BOARD_WIDTH, VISIBLE_HEIGHT, BUFFER_HEIGHT, SRSRotation } from "@tetris/shared";
import { PIECE_COLORS, darken, lighten, BOARD_BG, GRID_LINE_COLOR, PANEL_BG } from "./colors.js";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Width of the side panels (hold / preview) in cells. */
const SIDE_PANEL_CELLS = 5;

/** Gap between side panels and the board, in cells. */
const PANEL_GAP = 0.5;

/** Total canvas width in cells. */
const TOTAL_WIDTH_CELLS =
  SIDE_PANEL_CELLS + PANEL_GAP + BOARD_WIDTH + PANEL_GAP + SIDE_PANEL_CELLS;

/** Total canvas height in cells. */
const TOTAL_HEIGHT_CELLS = VISIBLE_HEIGHT;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BoardCanvasProps {
  state: GameState;
  /** Pixel size of each cell. Default: 30. */
  cellSize?: number;
  /**
   * Draw the hold / next side panels inside the canvas. Default: true.
   * Set to false when the surrounding UI provides DOM-based hold/next displays.
   */
  showSidePanels?: boolean;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  const border = Math.max(1, size * 0.06);

  // Main fill
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);

  // Top + left highlight
  ctx.fillStyle = lighten(color, 0.35);
  ctx.fillRect(x, y, size, border);           // top
  ctx.fillRect(x, y, border, size);            // left

  // Bottom + right shadow
  ctx.fillStyle = darken(color, 0.35);
  ctx.fillRect(x, y + size - border, size, border);  // bottom
  ctx.fillRect(x + size - border, y, border, size);   // right
}

function drawGhostCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  const inset = 2;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
  ctx.globalAlpha = 1;
}

function drawPieceShape(
  ctx: CanvasRenderingContext2D,
  shape: PieceShape,
  color: string,
  originX: number,
  originY: number,
  cellSize: number,
): void {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r]!.length; c++) {
      if (shape[r]![c]) {
        drawCell(ctx, originX + c * cellSize, originY + r * cellSize, cellSize, color);
      }
    }
  }
}

/** Draw a mini piece centered in a box (for hold / preview). */
function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  pieceType: PieceType,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  cellSize: number,
  dimmed = false,
): void {
  const shape = SRSRotation.getShape(pieceType, 0);
  const cols = shape[0]!.length;
  const rows = shape.length;

  // Compute bounding box of filled cells
  let minR = rows, maxR = 0, minC = cols, maxC = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (shape[r]![c]) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  const filledW = (maxC - minC + 1) * cellSize;
  const filledH = (maxR - minR + 1) * cellSize;
  const offsetX = boxX + (boxW - filledW) / 2 - minC * cellSize;
  const offsetY = boxY + (boxH - filledH) / 2 - minR * cellSize;

  if (dimmed) ctx.globalAlpha = 0.4;
  drawPieceShape(ctx, shape, PIECE_COLORS[pieceType], offsetX, offsetY, cellSize);
  if (dimmed) ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

export function renderBoard(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cellSize: number,
  showSidePanels = true,
): void {
  const boardX = showSidePanels ? (SIDE_PANEL_CELLS + PANEL_GAP) * cellSize : 0;
  const boardW = BOARD_WIDTH * cellSize;
  const boardH = VISIBLE_HEIGHT * cellSize;
  const canvasW = showSidePanels ? TOTAL_WIDTH_CELLS * cellSize : boardW;
  const canvasH = TOTAL_HEIGHT_CELLS * cellSize;

  // Clear
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // -- Board background --
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(boardX, 0, boardW, boardH);

  // -- Placed cells --
  for (let visRow = 0; visRow < VISIBLE_HEIGHT; visRow++) {
    const boardRow = visRow + BUFFER_HEIGHT;
    const row = state.board[boardRow];
    if (!row) continue;
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const cell = row[col];
      if (cell) {
        drawCell(ctx, boardX + col * cellSize, visRow * cellSize, cellSize, PIECE_COLORS[cell]);
      }
    }
  }

  // -- Ghost piece --
  if (state.ghostRow != null && state.currentPiece) {
    const { shape, col, type } = state.currentPiece;
    const ghostRow = state.ghostRow;
    // Only draw ghost if it's not at the same position as the active piece
    if (ghostRow !== state.currentPiece.row) {
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r]!.length; c++) {
          if (shape[r]![c]) {
            const visRow = ghostRow + r - BUFFER_HEIGHT;
            if (visRow >= 0 && visRow < VISIBLE_HEIGHT) {
              drawGhostCell(
                ctx,
                boardX + (col + c) * cellSize,
                visRow * cellSize,
                cellSize,
                PIECE_COLORS[type],
              );
            }
          }
        }
      }
    }
  }

  // -- Active piece --
  if (state.currentPiece) {
    const { shape, row, col, type } = state.currentPiece;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r]!.length; c++) {
        if (shape[r]![c]) {
          const visRow = row + r - BUFFER_HEIGHT;
          if (visRow >= 0 && visRow < VISIBLE_HEIGHT) {
            drawCell(
              ctx,
              boardX + (col + c) * cellSize,
              visRow * cellSize,
              cellSize,
              PIECE_COLORS[type],
            );
          }
        }
      }
    }
  }

  // -- Grid lines --
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;
  for (let r = 1; r < VISIBLE_HEIGHT; r++) {
    const y = r * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(boardX, y);
    ctx.lineTo(boardX + boardW, y);
    ctx.stroke();
  }
  for (let c = 1; c < BOARD_WIDTH; c++) {
    const x = boardX + c * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, boardH);
    ctx.stroke();
  }

  // -- Board border --
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  ctx.strokeRect(boardX, 0, boardW, boardH);

  if (!showSidePanels) return;

  // -- Hold panel (left) --
  const holdPanelX = 0;
  const holdPanelW = SIDE_PANEL_CELLS * cellSize;
  const holdBoxH = 3 * cellSize;
  const holdLabelY = cellSize * 0.3;

  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(holdPanelX, 0, holdPanelW, holdBoxH + cellSize);

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `${cellSize * 0.45}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("HOLD", holdPanelX + holdPanelW / 2, holdLabelY + cellSize * 0.45);

  if (state.hold != null) {
    drawMiniPiece(
      ctx,
      state.hold,
      holdPanelX,
      cellSize,
      holdPanelW,
      holdBoxH,
      cellSize * 0.7,
      state.holdUsed,
    );
  }

  // -- Preview panel (right) --
  const previewPanelX = boardX + boardW + PANEL_GAP * cellSize;
  const previewPanelW = SIDE_PANEL_CELLS * cellSize;
  const previewSlotH = 3 * cellSize;
  const maxPreview = Math.min(state.queue.length, 5);
  const previewTotalH = cellSize + previewSlotH * maxPreview;

  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(previewPanelX, 0, previewPanelW, previewTotalH);

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `${cellSize * 0.45}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("NEXT", previewPanelX + previewPanelW / 2, holdLabelY + cellSize * 0.45);

  for (let i = 0; i < maxPreview; i++) {
    const pieceType = state.queue[i]!;
    const slotY = cellSize + i * previewSlotH;
    const miniSize = i === 0 ? cellSize * 0.7 : cellSize * 0.55;
    drawMiniPiece(ctx, pieceType, previewPanelX, slotY, previewPanelW, previewSlotH, miniSize);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BoardCanvas({ state, cellSize = 30, showSidePanels = true }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const stateRef = useRef(state);
  const rafRef = useRef<number>(0);

  stateRef.current = state;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext("2d");
    }
    const ctx = ctxRef.current;
    if (!ctx) return;
    renderBoard(ctx, stateRef.current, cellSize, showSidePanels);
  }, [cellSize, showSidePanels]);

  // Schedule a draw on each state change
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state, draw]);

  const canvasW = showSidePanels
    ? TOTAL_WIDTH_CELLS * cellSize
    : BOARD_WIDTH * cellSize;
  const canvasH = TOTAL_HEIGHT_CELLS * cellSize;

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
      data-testid="board-canvas"
      style={{ display: "block" }}
    />
  );
}
