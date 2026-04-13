import type { PieceType, RuleSet, RotationSystem } from "@tomino/shared";
import { SRSRotation, ClassicRotation } from "@tomino/shared";
import { useTheme } from "../atmosphere/theme-context.js";

export function getRotationSystem(ruleSet: RuleSet): RotationSystem {
  return ruleSet.rotationSystem === "srs" ? SRSRotation : ClassicRotation;
}

export interface PiecePreviewProps {
  type: PieceType;
  ruleSet: RuleSet;
  size: number;
  dimmed?: boolean;
  testId?: string;
}

export function PiecePreview({ type, ruleSet, size, dimmed, testId }: PiecePreviewProps) {
  const rs = getRotationSystem(ruleSet);
  const shape = rs.getShape(type, 0);
  const { palette } = useTheme();
  const color = palette.colors[type];

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
      style={dimmed ? { opacity: 0.4 } : undefined}
      data-testid={testId}
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
