import type { PieceType, RuleSet, RotationSystem } from "@tetris/shared";
import { SRSRotation, NRSRotation } from "@tetris/shared";
import { PIECE_COLORS } from "./colors.js";

export interface HoldDisplayProps {
  hold: PieceType | null;
  holdUsed: boolean;
  ruleSet: RuleSet;
}

function getRotationSystem(ruleSet: RuleSet): RotationSystem {
  return ruleSet.rotationSystem === "srs" ? SRSRotation : NRSRotation;
}

function HoldPiece({ type, dimmed, ruleSet }: { type: PieceType; dimmed: boolean; ruleSet: RuleSet }) {
  const rs = getRotationSystem(ruleSet);
  const shape = rs.getShape(type, 0);
  const color = PIECE_COLORS[type];
  const size = 20;

  let minR = shape.length, maxR = 0, minC = shape[0]!.length, maxC = 0;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r]!.length; c++) {
      if (shape[r]![c]) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;

  return (
    <svg
      width={cols * size}
      height={rows * size}
      style={{ opacity: dimmed ? 0.4 : 1 }}
      data-testid="hold-piece"
    >
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          if (shape[minR + r]![minC + c]) {
            return (
              <rect
                key={`${r}-${c}`}
                x={c * size}
                y={r * size}
                width={size}
                height={size}
                fill={color}
                stroke="rgba(0,0,0,0.3)"
                strokeWidth={1}
              />
            );
          }
          return null;
        }),
      )}
    </svg>
  );
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
          <HoldPiece type={hold} dimmed={holdUsed} ruleSet={ruleSet} />
        ) : (
          <div className="hold-empty" />
        )}
      </div>
    </div>
  );
}
