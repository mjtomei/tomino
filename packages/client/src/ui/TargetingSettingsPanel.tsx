import type { TargetingSettings, TargetingStrategyType } from "@tomino/shared";
import { ALL_TARGETING_STRATEGIES, DEFAULT_TARGETING_SETTINGS } from "@tomino/shared";

const STRATEGY_LABELS: Record<TargetingStrategyType, string> = {
  random: "Random",
  attackers: "Attackers",
  kos: "KOs",
  manual: "Manual",
};

interface TargetingSettingsPanelProps {
  settings: TargetingSettings;
  onChange: (settings: TargetingSettings) => void;
  disabled: boolean;
}

export { DEFAULT_TARGETING_SETTINGS };

export function TargetingSettingsPanel({
  settings,
  onChange,
  disabled,
}: TargetingSettingsPanelProps) {
  const handleToggleStrategy = (strategy: TargetingStrategyType) => {
    const enabled = settings.enabledStrategies.includes(strategy);
    let newEnabled: TargetingStrategyType[];
    if (enabled) {
      // Don't allow disabling if it's the last one
      if (settings.enabledStrategies.length <= 1) return;
      newEnabled = settings.enabledStrategies.filter((s) => s !== strategy);
    } else {
      newEnabled = [...settings.enabledStrategies, strategy];
    }
    // If default is no longer enabled, switch to first enabled
    let newDefault = settings.defaultStrategy;
    if (!newEnabled.includes(newDefault)) {
      newDefault = newEnabled[0]!;
    }
    onChange({ enabledStrategies: newEnabled, defaultStrategy: newDefault });
  };

  const handleDefaultChange = (strategy: TargetingStrategyType) => {
    if (!settings.enabledStrategies.includes(strategy)) return;
    onChange({ ...settings, defaultStrategy: strategy });
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Targeting</h3>
      <div style={styles.section}>
        <span style={styles.label}>Enabled Strategies</span>
        <div style={styles.checkboxGroup}>
          {ALL_TARGETING_STRATEGIES.map((strategy) => (
            <label key={strategy} style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.enabledStrategies.includes(strategy)}
                onChange={() => handleToggleStrategy(strategy)}
                disabled={disabled}
              />
              {STRATEGY_LABELS[strategy]}
            </label>
          ))}
        </div>
      </div>
      <div style={styles.section}>
        <span style={styles.label}>Default Strategy</span>
        <select
          id="targeting-default-strategy"
          value={settings.defaultStrategy}
          onChange={(e) => handleDefaultChange(e.target.value as TargetingStrategyType)}
          disabled={disabled}
          style={styles.select}
        >
          {settings.enabledStrategies.map((s) => (
            <option key={s} value={s}>
              {STRATEGY_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: "320px",
    marginBottom: "1.5rem",
    padding: "0.75rem",
    backgroundColor: "#16213e",
    borderRadius: "8px",
  },
  title: {
    fontSize: "1rem",
    marginTop: 0,
    marginBottom: "0.75rem",
    color: "#ccc",
  },
  section: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.4rem",
    marginBottom: "0.75rem",
  },
  label: {
    fontSize: "0.85rem",
    color: "#aaa",
  },
  checkboxGroup: {
    display: "flex",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.85rem",
    color: "#ccc",
    cursor: "pointer",
  },
  select: {
    padding: "0.4rem 0.5rem",
    borderRadius: "4px",
    border: "1px solid #444",
    backgroundColor: "#1a1a2e",
    color: "#ccc",
    fontSize: "0.85rem",
  },
};
