import type { PieceType, RuleSet } from "@tetris/shared";
import { PiecePreview } from "./PiecePreview.js";

export interface HoldDisplayProps {
  hold: PieceType | null;
  holdUsed: boolean;
  ruleSet: RuleSet;
}

export function HoldDisplay({ hold, holdUsed, ruleSet }: HoldDisplayProps) {
  if (!ruleSet.holdEnabled) {
    return null;
  }

  return (
    <div className="hold-display" data-testid="hold-display">
      <div className="panel-label">HOLD</div>
      <div className="hold-piece-container">
        {hold != null ? (
          <PiecePreview type={hold} ruleSet={ruleSet} size={20} dimmed={holdUsed} testId="hold-piece" />
        ) : (
          <div className="hold-empty" />
        )}
      </div>
    </div>
  );
}
