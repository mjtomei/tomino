/**
 * Convert a protocol `GameStateSnapshot` to an engine `GameState` for rendering.
 *
 * The existing UI components (BoardCanvas, Overlay, ScoreDisplay, etc.) accept
 * `GameState`. In multiplayer mode the authoritative state arrives as a
 * `GameStateSnapshot` from the prediction engine. This adapter bridges the two.
 */

import type {
  GameState,
  ActivePiece,
  PieceShape,
  GameStateSnapshot,
  ScoringState,
} from "@tomino/shared";
import { SRSRotation } from "@tomino/shared";

/**
 * Look up the piece shape for a given type and rotation using SRS.
 */
function getShape(type: string, rotation: number): PieceShape {
  return SRSRotation.getShape(
    type as Parameters<typeof SRSRotation.getShape>[0],
    rotation as Parameters<typeof SRSRotation.getShape>[1],
  );
}

/**
 * Convert a `GameStateSnapshot` (protocol) to a `GameState` (engine) that
 * can be consumed by all existing UI components.
 */
export function snapshotToGameState(
  snapshot: GameStateSnapshot,
  elapsedMs: number,
): GameState {
  let currentPiece: ActivePiece | null = null;
  if (snapshot.activePiece) {
    currentPiece = {
      type: snapshot.activePiece.type,
      col: snapshot.activePiece.x,
      row: snapshot.activePiece.y,
      rotation: snapshot.activePiece.rotation,
      shape: getShape(snapshot.activePiece.type, snapshot.activePiece.rotation),
    };
  }

  const scoring: ScoringState = {
    score: snapshot.score,
    level: snapshot.level,
    lines: snapshot.linesCleared,
    combo: -1,
    b2b: -1,
    startLevel: 1,
    piecesPlaced: snapshot.piecesPlaced,
  };

  return {
    status: snapshot.isGameOver ? "gameOver" : "playing",
    board: snapshot.board,
    currentPiece,
    ghostRow: snapshot.ghostY,
    hold: snapshot.holdPiece,
    holdUsed: snapshot.holdUsed,
    queue: snapshot.nextQueue,
    scoring,
    elapsedMs,
    gameMode: "marathon",
    endReason: snapshot.isGameOver ? "topOut" : undefined,
  };
}
