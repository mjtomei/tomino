import type { RatingPoint } from "@tetris/shared";

interface SparklineProps {
  data: RatingPoint[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({
  data,
  width = 300,
  height = 60,
  color = "#4fc3f7",
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <svg width={width} height={height} role="img" aria-label="No rating data">
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#666"
          fontSize={12}
        >
          No data
        </text>
      </svg>
    );
  }

  const padding = 4;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const ratings = data.map((d) => d.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const range = maxRating - minRating || 1; // avoid division by zero

  const points = data.map((d, i) => {
    const x = padding + (data.length === 1 ? plotWidth / 2 : (i / (data.length - 1)) * plotWidth);
    const y = padding + plotHeight - ((d.rating - minRating) / range) * plotHeight;
    return `${x},${y}`;
  });

  if (data.length === 1) {
    const [x, y] = points[0]!.split(",");
    return (
      <svg width={width} height={height} role="img" aria-label="Rating history">
        <circle cx={x} cy={y} r={3} fill={color} />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} role="img" aria-label="Rating history">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
