import type { GameModeConfig, ScoringState } from "@tetris/shared";
import { formatTime } from "./formatTime.js";

export interface ScoreDisplayProps {
  scoring: Readonly<ScoringState>;
  modeConfig: GameModeConfig;
  elapsedMs: number;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-row">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export function ScoreDisplay({ scoring, modeConfig, elapsedMs }: ScoreDisplayProps) {
  const stats = modeConfig.displayStats;

  return (
    <div className="score-display" data-testid="score-display">
      {stats.map((stat) => {
        switch (stat) {
          case "score":
            return <StatRow key={stat} label="SCORE" value={scoring.score.toLocaleString()} />;
          case "level":
            return <StatRow key={stat} label="LEVEL" value={scoring.level} />;
          case "lines":
            return <StatRow key={stat} label="LINES" value={scoring.lines} />;
          case "timer":
            if (modeConfig.goal === "time" && modeConfig.goalValue != null) {
              // Ultra: count down
              return <StatRow key={stat} label="TIME" value={formatTime(modeConfig.goalValue - elapsedMs)} />;
            }
            // Sprint: count up
            return <StatRow key={stat} label="TIME" value={formatTime(elapsedMs)} />;
          case "linesRemaining":
            return (
              <StatRow
                key={stat}
                label="REMAINING"
                value={Math.max(0, (modeConfig.goalValue ?? 0) - scoring.lines)}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
