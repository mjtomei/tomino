/**
 * Settings context — user-facing audio/visual preferences.
 *
 * Owns master mute, sfx volume, and visual effects intensity. Music volume
 * lives in <MusicProvider> and is re-exposed here for UI convenience; the
 * master-mute toggle overrides both music mute and sfx playback.
 *
 * Persisted to localStorage. SettingsProvider must sit inside ThemeProvider
 * and MusicProvider so the UI can read theme/genre/music state alongside
 * these fields.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMusic } from "../audio/use-music.js";

export type EffectsIntensity = "off" | "subtle" | "full";

export interface SerializedSettings {
  sfxVolume: number;
  masterMuted: boolean;
  effectsIntensity: EffectsIntensity;
}

export const DEFAULT_SETTINGS: SerializedSettings = {
  sfxVolume: 0.8,
  masterMuted: false,
  effectsIntensity: "full",
};

const SFX_VOLUME_KEY = "tetris.sfx.volume";
const MASTER_MUTED_KEY = "tetris.master.muted";
const EFFECTS_INTENSITY_KEY = "tetris.effects.intensity";

const INTENSITIES: readonly EffectsIntensity[] = ["off", "subtle", "full"];

function isEffectsIntensity(v: unknown): v is EffectsIntensity {
  return typeof v === "string" && (INTENSITIES as readonly string[]).includes(v);
}

export function readSettings(storage?: Storage): SerializedSettings {
  const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  if (!s) return { ...DEFAULT_SETTINGS };

  let sfxVolume = DEFAULT_SETTINGS.sfxVolume;
  try {
    const raw = s.getItem(SFX_VOLUME_KEY);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n <= 1) sfxVolume = n;
    }
  } catch {
    // ignore
  }

  let masterMuted = DEFAULT_SETTINGS.masterMuted;
  try {
    masterMuted = s.getItem(MASTER_MUTED_KEY) === "1";
  } catch {
    // ignore
  }

  let effectsIntensity = DEFAULT_SETTINGS.effectsIntensity;
  try {
    const raw = s.getItem(EFFECTS_INTENSITY_KEY);
    if (isEffectsIntensity(raw)) effectsIntensity = raw;
  } catch {
    // ignore
  }

  return { sfxVolume, masterMuted, effectsIntensity };
}

export function writeSettings(settings: SerializedSettings, storage?: Storage): void {
  const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  if (!s) return;
  try {
    s.setItem(SFX_VOLUME_KEY, String(settings.sfxVolume));
    s.setItem(MASTER_MUTED_KEY, settings.masterMuted ? "1" : "0");
    s.setItem(EFFECTS_INTENSITY_KEY, settings.effectsIntensity);
  } catch {
    // ignore
  }
}

export interface SettingsContextValue {
  musicVolume: number;
  sfxVolume: number;
  masterMuted: boolean;
  effectsIntensity: EffectsIntensity;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setMasterMuted: (m: boolean) => void;
  setEffectsIntensity: (i: EffectsIntensity) => void;
}

const FALLBACK_VALUE: SettingsContextValue = {
  musicVolume: 0.8,
  sfxVolume: DEFAULT_SETTINGS.sfxVolume,
  masterMuted: DEFAULT_SETTINGS.masterMuted,
  effectsIntensity: DEFAULT_SETTINGS.effectsIntensity,
  setMusicVolume: () => {},
  setSfxVolume: () => {},
  setMasterMuted: () => {},
  setEffectsIntensity: () => {},
};

const SettingsContext = createContext<SettingsContextValue>(FALLBACK_VALUE);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const music = useMusic();
  const initial = useMemo(() => readSettings(), []);

  const [sfxVolume, setSfxVolumeState] = useState<number>(initial.sfxVolume);
  const [masterMuted, setMasterMutedState] = useState<boolean>(initial.masterMuted);
  const [effectsIntensity, setEffectsIntensityState] = useState<EffectsIntensity>(
    initial.effectsIntensity,
  );

  // Propagate master mute into the music engine on mount + whenever it changes.
  useEffect(() => {
    music.setMuted(masterMuted);
  }, [masterMuted, music]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(SFX_VOLUME_KEY, String(sfxVolume));
    } catch {
      // ignore
    }
  }, [sfxVolume]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(MASTER_MUTED_KEY, masterMuted ? "1" : "0");
    } catch {
      // ignore
    }
  }, [masterMuted]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(EFFECTS_INTENSITY_KEY, effectsIntensity);
    } catch {
      // ignore
    }
  }, [effectsIntensity]);

  const setSfxVolume = useCallback((v: number) => {
    if (!Number.isFinite(v)) return;
    setSfxVolumeState(Math.max(0, Math.min(1, v)));
  }, []);

  const setMasterMuted = useCallback((m: boolean) => {
    setMasterMutedState(m);
  }, []);

  const setEffectsIntensity = useCallback((i: EffectsIntensity) => {
    if (!isEffectsIntensity(i)) return;
    setEffectsIntensityState(i);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      musicVolume: music.volume,
      sfxVolume,
      masterMuted,
      effectsIntensity,
      setMusicVolume: music.setVolume,
      setSfxVolume,
      setMasterMuted,
      setEffectsIntensity,
    }),
    [
      music.volume,
      music.setVolume,
      sfxVolume,
      masterMuted,
      effectsIntensity,
      setSfxVolume,
      setMasterMuted,
      setEffectsIntensity,
    ],
  );

  return createElement(SettingsContext.Provider, { value }, children);
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}

export function effectsIntensityMultiplier(i: EffectsIntensity): number {
  switch (i) {
    case "off":
      return 0;
    case "subtle":
      return 0.5;
    case "full":
      return 1;
  }
}

export {
  SFX_VOLUME_KEY,
  MASTER_MUTED_KEY,
  EFFECTS_INTENSITY_KEY,
};
