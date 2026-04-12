import type { GameModeConfig, ScoringState } from "@tetris/shared";

export interface ScoreDisplayProps {
  scoring: Readonly<ScoringState>;
  modeConfig: GameModeConfig;
  elapsedMs: number;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((Math.max(0, ms) % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
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
