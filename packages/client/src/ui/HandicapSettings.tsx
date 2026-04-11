import type { HandicapIntensity, HandicapMode, HandicapSettings as HandicapSettingsType } from "@tetris/shared";
import "./HandicapSettings.css";

export interface HandicapSettingsValues extends HandicapSettingsType {
  ratingVisible: boolean;
}

interface HandicapSettingsProps {
  settings: HandicapSettingsValues;
  onChange: (settings: HandicapSettingsValues) => void;
  disabled: boolean;
}

const INTENSITY_OPTIONS: { value: HandicapIntensity; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "light", label: "Light" },
  { value: "standard", label: "Standard" },
  { value: "heavy", label: "Heavy" },
];

const MODE_OPTIONS: { value: HandicapMode; label: string }[] = [
  { value: "boost", label: "Boost Only" },
  { value: "symmetric", label: "Symmetric" },
];

export const DEFAULT_HANDICAP_SETTINGS: HandicapSettingsValues = {
  intensity: "off",
  mode: "boost",
  targetingBiasStrength: 0.7,
  delayEnabled: false,
  messinessEnabled: false,
  ratingVisible: true,
};

export function HandicapSettings({
  settings,
  onChange,
  disabled,
}: HandicapSettingsProps) {
  const handicapActive = settings.intensity !== "off";

  return (
    <div className="handicap-settings">
      <h3>Handicap Settings</h3>

      <div className="handicap-field">
        <label className="handicap-label" htmlFor="handicap-intensity">
          Intensity
        </label>
        <select
          id="handicap-intensity"
          className="handicap-select"
          value={settings.intensity}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...settings, intensity: e.target.value as HandicapIntensity })
          }
        >
          {INTENSITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="handicap-field">
        <label className="handicap-label" htmlFor="handicap-mode">
          Mode
        </label>
        <select
          id="handicap-mode"
          className="handicap-select"
          value={settings.mode}
          disabled={disabled || !handicapActive}
          onChange={(e) =>
            onChange({ ...settings, mode: e.target.value as HandicapMode })
          }
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="handicap-field">
        <label className="handicap-label" htmlFor="handicap-bias">
          Targeting Bias
        </label>
        <div className="handicap-slider-group">
          <input
            id="handicap-bias"
            type="range"
            className="handicap-slider"
            min="0"
            max="1"
            step="0.05"
            value={settings.targetingBiasStrength}
            disabled={disabled || !handicapActive}
            onChange={(e) =>
              onChange({ ...settings, targetingBiasStrength: parseFloat(e.target.value) })
            }
          />
          <span className="handicap-slider-value">
            {settings.targetingBiasStrength.toFixed(2)}
          </span>
        </div>
      </div>

      <hr className="handicap-divider" />

      <div className="handicap-field">
        <label className="handicap-label" htmlFor="handicap-delay">
          Delay Modifier
        </label>
        <input
          id="handicap-delay"
          type="checkbox"
          className="handicap-checkbox"
          checked={settings.delayEnabled ?? false}
          disabled={disabled || !handicapActive}
          onChange={(e) =>
            onChange({ ...settings, delayEnabled: e.target.checked })
          }
        />
      </div>

      <div className="handicap-field">
        <label className="handicap-label" htmlFor="handicap-messiness">
          Messiness Modifier
        </label>
        <input
          id="handicap-messiness"
          type="checkbox"
          className="handicap-checkbox"
          checked={settings.messinessEnabled ?? false}
          disabled={disabled || !handicapActive}
          onChange={(e) =>
            onChange({ ...settings, messinessEnabled: e.target.checked })
          }
        />
      </div>

      <hr className="handicap-divider" />

      <div className="handicap-field">
        <label className="handicap-label" htmlFor="handicap-rating-visible">
          Show Ratings
        </label>
        <input
          id="handicap-rating-visible"
          type="checkbox"
          className="handicap-checkbox"
          checked={settings.ratingVisible}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...settings, ratingVisible: e.target.checked })
          }
        />
      </div>
    </div>
  );
}
