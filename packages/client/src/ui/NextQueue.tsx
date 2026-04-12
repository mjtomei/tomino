import type { PieceType, RuleSet } from "@tetris/shared";
import { PiecePreview } from "./PiecePreview.js";

export interface NextQueueProps {
  queue: readonly PieceType[];
  ruleSet: RuleSet;
}

export function NextQueue({ queue, ruleSet }: NextQueueProps) {
  if (ruleSet.previewCount === 0 || queue.length === 0) {
    return null;
  }

  return (
    <div className="next-queue" data-testid="next-queue">
      <div className="panel-label">NEXT</div>
      {queue.map((type, i) => (
        <div key={i} className={`next-piece ${i === 0 ? "next-piece-first" : ""}`}>
          <PiecePreview type={type} ruleSet={ruleSet} size={i === 0 ? 20 : 16} testId={`mini-piece-${type}`} />
        </div>
      ))}
    </div>
  );
}
