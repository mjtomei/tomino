import { useState } from "react";
import type { RuleSet, GameMode, GameModeConfig } from "@tomino/shared";
import { classicRuleSet, modernRuleSet, gameModes } from "@tomino/shared";
import { CustomRuleSetPanel } from "./CustomRuleSetPanel.js";
import { ThemeSelector } from "./ThemeSelector.js";

export interface StartScreenProps {
  onStart: (ruleSet: RuleSet, modeConfig: GameModeConfig) => void;
}

type PresetKey = "classic" | "modern" | "custom";

const PRESET_LABELS: Record<PresetKey, string> = {
  classic: "Classic",
  modern: "Modern",
  custom: "Custom",
};

const MODE_LABELS: Record<GameMode, string> = {
  marathon: "Marathon",
  sprint: "Sprint",
  ultra: "Ultra",
  zen: "Zen",
};

const MODE_DESCRIPTIONS: Record<GameMode, string> = {
  marathon: "Play until you top out",
  sprint: "Clear 40 lines as fast as possible",
  ultra: "Maximize score in 3 minutes",
  zen: "No gravity, no game over",
};

export function StartScreen({ onStart }: StartScreenProps) {
  const [preset, setPreset] = useState<PresetKey>("modern");
  const [mode, setMode] = useState<GameMode>("marathon");
  const [customRules, setCustomRules] = useState<RuleSet>(modernRuleSet());

  const getActiveRuleSet = (): RuleSet => {
    switch (preset) {
      case "classic":
        return classicRuleSet();
      case "modern":
        return modernRuleSet();
      case "custom":
        return { ...customRules, name: "Custom" };
    }
  };

  const handlePresetChange = (key: PresetKey) => {
    setPreset(key);
    if (key === "classic") {
      setCustomRules(classicRuleSet());
    } else if (key === "modern") {
      setCustomRules(modernRuleSet());
    }
  };

  const handleStart = () => {
    onStart(getActiveRuleSet(), gameModes[mode]);
  };

  return (
    <div className="start-screen" data-testid="start-screen">
      <h1 className="start-title">TOMINO</h1>

      <div className="start-section">
        <h2 className="start-section-title">Rule Set</h2>
        <div className="start-button-group">
          {(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => (
            <button
              key={key}
              className={`start-btn ${preset === key ? "start-btn-active" : ""}`}
              onClick={() => handlePresetChange(key)}
              data-testid={`preset-${key}`}
            >
              {PRESET_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <CustomRuleSetPanel ruleSet={customRules} onChange={setCustomRules} />
      )}

      <div className="start-section">
        <h2 className="start-section-title">Game Mode</h2>
        <div className="start-button-group">
          {(Object.keys(MODE_LABELS) as GameMode[]).map((key) => (
            <button
              key={key}
              className={`start-btn ${mode === key ? "start-btn-active" : ""}`}
              onClick={() => setMode(key)}
              data-testid={`mode-${key}`}
            >
              <div className="mode-btn-label">{MODE_LABELS[key]}</div>
              <div className="mode-btn-desc">{MODE_DESCRIPTIONS[key]}</div>
            </button>
          ))}
        </div>
      </div>

      <ThemeSelector />

      <button className="start-play-btn" onClick={handleStart} data-testid="start-play">
        PLAY
      </button>
    </div>
  );
}
