import type { PieceType, RuleSet, RotationSystem } from "@tetris/shared";
import { SRSRotation, NRSRotation } from "@tetris/shared";
import { PIECE_COLORS } from "./colors.js";

export interface NextQueueProps {
  queue: readonly PieceType[];
  ruleSet: RuleSet;
}

function getRotationSystem(ruleSet: RuleSet): RotationSystem {
  return ruleSet.rotationSystem === "srs" ? SRSRotation : NRSRotation;
}

function MiniPiece({ type, ruleSet, size }: { type: PieceType; ruleSet: RuleSet; size: number }) {
  const rs = getRotationSystem(ruleSet);
  const shape = rs.getShape(type, 0);
  const color = PIECE_COLORS[type];

  // Find bounding box of filled cells
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
  const svgW = cols * size;
  const svgH = rows * size;

  return (
    <svg width={svgW} height={svgH} data-testid={`mini-piece-${type}`}>
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

export function NextQueue({ queue, ruleSet }: NextQueueProps) {
  if (ruleSet.previewCount === 0 || queue.length === 0) {
    return null;
  }

  return (
    <div className="next-queue" data-testid="next-queue">
      <div className="panel-label">NEXT</div>
      {queue.map((type, i) => (
        <div key={i} className={`next-piece ${i === 0 ? "next-piece-first" : ""}`}>
          <MiniPiece type={type} ruleSet={ruleSet} size={i === 0 ? 20 : 16} />
        </div>
      ))}
    </div>
  );
}
