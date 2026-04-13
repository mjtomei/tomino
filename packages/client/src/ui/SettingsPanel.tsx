import { useEffect, useRef } from "react";
import { useSettings, type EffectsIntensity } from "../atmosphere/settings-context.js";
import { useTheme } from "../atmosphere/theme-context.js";
import { THEMES } from "../atmosphere/themes.js";
import { GENRES } from "../atmosphere/genres.js";
import { PALETTES } from "./palettes.js";

const PIECE_PREVIEW_ORDER = ["I", "O", "T", "S", "Z", "J", "L"] as const;
import { SoundManager } from "../audio/sounds.js";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  onClose: () => void;
}

const EFFECTS_OPTIONS: readonly { id: EffectsIntensity; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "subtle", label: "Subtle" },
  { id: "full", label: "Full" },
];

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const {
    musicVolume,
    sfxVolume,
    masterMuted,
    effectsIntensity,
    setMusicVolume,
    setSfxVolume,
    setMasterMuted,
    setEffectsIntensity,
  } = useSettings();
  const { themeId, genreId, paletteId, setThemeId, setGenreId, setPaletteId } = useTheme();

  const previewRef = useRef<SoundManager | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

  useEffect(() => {
    return () => {
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  const previewGenre = (id: string) => {
    if (masterMuted || sfxVolume <= 0) return;
    previewRef.current?.dispose();
    const sm = new SoundManager(id);
    sm.volume = sfxVolume;
    previewRef.current = sm;
    sm.play("lineClear1");
  };

  return (
    <div
      className="settings-overlay"
      data-testid="settings-panel"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-panel" role="dialog" aria-label="Settings">
        <div className="settings-header">
          <h2>Settings</h2>
          <button
            className="settings-close"
            data-testid="settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <section className="settings-section">
          <h3>Audio</h3>
          <label className="settings-row">
            <span>Music Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={musicVolume}
              data-testid="music-volume-slider"
              onChange={(e) => setMusicVolume(Number(e.target.value))}
            />
            <span className="settings-value">{Math.round(musicVolume * 100)}%</span>
          </label>
          <label className="settings-row">
            <span>SFX Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sfxVolume}
              data-testid="sfx-volume-slider"
              onChange={(e) => setSfxVolume(Number(e.target.value))}
            />
            <span className="settings-value">{Math.round(sfxVolume * 100)}%</span>
          </label>
          <label className="settings-row">
            <span>Master Mute</span>
            <input
              type="checkbox"
              checked={masterMuted}
              data-testid="master-mute-toggle"
              onChange={(e) => setMasterMuted(e.target.checked)}
            />
          </label>
        </section>

        <section className="settings-section">
          <h3>Visual Effects</h3>
          <div className="settings-segmented" data-testid="effects-intensity-group">
            {EFFECTS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={
                  "settings-segment" +
                  (effectsIntensity === opt.id ? " active" : "")
                }
                data-testid={`effects-${opt.id}`}
                onClick={() => setEffectsIntensity(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>Theme</h3>
          <div className="settings-swatches" data-testid="theme-swatches">
            {Object.values(THEMES).map((t) => {
              const grad = t.palette.backgroundGradient;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={
                    "settings-swatch" + (themeId === t.id ? " active" : "")
                  }
                  data-testid={`theme-swatch-${t.id}`}
                  onClick={() => setThemeId(t.id)}
                  style={{
                    background: `linear-gradient(135deg, ${grad.join(", ")})`,
                    borderColor: t.palette.accent,
                  }}
                  aria-label={t.name}
                  aria-pressed={themeId === t.id}
                >
                  <span className="settings-swatch-label">{t.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-section">
          <h3>Genre</h3>
          <div className="settings-genres" data-testid="genre-list">
            {Object.values(GENRES).map((g) => (
              <button
                key={g.id}
                type="button"
                className={
                  "settings-genre" + (genreId === g.id ? " active" : "")
                }
                data-testid={`genre-option-${g.id}`}
                onClick={() => setGenreId(g.id)}
                onMouseEnter={() => previewGenre(g.id)}
                aria-pressed={genreId === g.id}
              >
                {g.name}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>Piece Palette</h3>
          <div className="settings-palettes" data-testid="palette-list">
            {Object.values(PALETTES).map((p) => (
              <button
                key={p.id}
                type="button"
                className={
                  "settings-palette" + (paletteId === p.id ? " active" : "")
                }
                data-testid={`palette-option-${p.id}`}
                onClick={() => setPaletteId(p.id)}
                aria-pressed={paletteId === p.id}
              >
                <span className="settings-palette-label">{p.name}</span>
                <span className="settings-palette-preview" aria-hidden="true">
                  {PIECE_PREVIEW_ORDER.map((pt) => (
                    <span
                      key={pt}
                      className="settings-palette-swatch"
                      style={{ background: p.colors[pt] }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
