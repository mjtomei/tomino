import type { GarbageBatch } from "@tomino/shared";
import { VISIBLE_HEIGHT } from "@tomino/shared";
import "./GarbageMeter.css";

export interface GarbageMeterProps {
  /** Pending garbage batches. */
  pendingGarbage: GarbageBatch[];
  /** Pixel size of each cell — meter height matches board height. */
  cellSize: number;
}

/** Total pending lines, capped at VISIBLE_HEIGHT. */
export function computeMeterLines(batches: readonly GarbageBatch[]): number {
  let total = 0;
  for (const b of batches) total += b.lines;
  return Math.min(total, VISIBLE_HEIGHT);
}

/**
 * Vertical garbage meter rendered on the left edge of the board.
 * Shows pending incoming garbage as a red bar that fills from the bottom.
 */
export function GarbageMeter({ pendingGarbage, cellSize }: GarbageMeterProps) {
  const lines = computeMeterLines(pendingGarbage);
  if (lines === 0) return null;

  const boardHeight = VISIBLE_HEIGHT * cellSize;
  const barHeight = lines * cellSize;
  const danger = lines >= VISIBLE_HEIGHT * 0.75;

  return (
    <div
      className="garbage-meter"
      data-testid="garbage-meter"
      style={{ height: boardHeight }}
    >
      <div
        className={`garbage-meter-bar${danger ? " danger" : ""}`}
        data-testid="garbage-meter-bar"
        style={{ height: barHeight }}
      />
    </div>
  );
}
