import type { TargetingStrategyType } from "@tomino/shared";

const STRATEGY_LABELS: Record<TargetingStrategyType, string> = {
  random: "Random",
  attackers: "Attackers",
  kos: "KOs",
  manual: "Manual",
};

const STRATEGY_DESCRIPTIONS: Record<TargetingStrategyType, string> = {
  random: "Target a random opponent",
  attackers: "Target players targeting you",
  kos: "Target the player closest to losing",
  manual: "Click an opponent to target them",
};

interface TargetingSelectorProps {
  enabledStrategies: TargetingStrategyType[];
  activeStrategy: TargetingStrategyType;
  onStrategyChange: (strategy: TargetingStrategyType) => void;
  attackMultiplier?: number;
}

export function TargetingSelector({
  enabledStrategies,
  activeStrategy,
  onStrategyChange,
  attackMultiplier,
}: TargetingSelectorProps) {
  return (
    <div style={styles.container} data-testid="targeting-selector">
      <div style={styles.header}>
        <span style={styles.label}>Target</span>
        {attackMultiplier != null && attackMultiplier > 1 && (
          <span style={styles.attackBadge} data-testid="attack-power-badge">
            ATK {attackMultiplier.toFixed(2)}x
          </span>
        )}
      </div>
      <div style={styles.buttons}>
        {enabledStrategies.map((strategy) => (
          <button
            key={strategy}
            onClick={() => onStrategyChange(strategy)}
            style={
              strategy === activeStrategy
                ? styles.buttonActive
                : styles.button
            }
            title={STRATEGY_DESCRIPTIONS[strategy]}
            data-testid={`targeting-btn-${strategy}`}
          >
            {STRATEGY_LABELS[strategy]}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
    padding: "6px 8px",
    backgroundColor: "rgba(26, 26, 46, 0.9)",
    borderRadius: "6px",
    fontFamily: "system-ui, sans-serif",
    fontSize: "0.75rem",
    color: "#ccc",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  label: {
    fontWeight: "bold" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    fontSize: "0.65rem",
    color: "#888",
  },
  attackBadge: {
    padding: "1px 6px",
    borderRadius: "4px",
    backgroundColor: "#e2b714",
    color: "#1a1a2e",
    fontWeight: "bold" as const,
    fontSize: "0.7rem",
  },
  buttons: {
    display: "flex",
    gap: "4px",
  },
  button: {
    padding: "4px 8px",
    border: "1px solid #444",
    borderRadius: "4px",
    backgroundColor: "transparent",
    color: "#aaa",
    cursor: "pointer",
    fontSize: "0.7rem",
  },
  buttonActive: {
    padding: "4px 8px",
    border: "1px solid #4040d0",
    borderRadius: "4px",
    backgroundColor: "#4040d0",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.7rem",
    fontWeight: "bold" as const,
  },
};
