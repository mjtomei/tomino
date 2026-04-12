import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  DEFAULT_SETTINGS,
  EFFECTS_INTENSITY_KEY,
  MASTER_MUTED_KEY,
  SFX_VOLUME_KEY,
  SettingsProvider,
  effectsIntensityMultiplier,
  readSettings,
  useSettings,
  writeSettings,
} from "./settings-context.js";
import { MusicProvider } from "../audio/use-music.js";
import { ThemeProvider } from "./theme-context.js";

describe("settings serialization", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when storage is empty", () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips through writeSettings/readSettings", () => {
    const s = { sfxVolume: 0.42, masterMuted: true, effectsIntensity: "subtle" as const };
    writeSettings(s);
    expect(readSettings()).toEqual(s);
  });

  it("clamps invalid sfx volume back to default", () => {
    localStorage.setItem(SFX_VOLUME_KEY, "not-a-number");
    expect(readSettings().sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
  });

  it("rejects out-of-range sfx volume", () => {
    localStorage.setItem(SFX_VOLUME_KEY, "1.5");
    expect(readSettings().sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
  });

  it("rejects unknown effects-intensity value", () => {
    localStorage.setItem(EFFECTS_INTENSITY_KEY, "bogus");
    expect(readSettings().effectsIntensity).toBe(DEFAULT_SETTINGS.effectsIntensity);
  });

  it("reads master-muted flag", () => {
    localStorage.setItem(MASTER_MUTED_KEY, "1");
    expect(readSettings().masterMuted).toBe(true);
  });
});

describe("effectsIntensityMultiplier", () => {
  it("maps off/subtle/full to 0/0.5/1", () => {
    expect(effectsIntensityMultiplier("off")).toBe(0);
    expect(effectsIntensityMultiplier("subtle")).toBe(0.5);
    expect(effectsIntensityMultiplier("full")).toBe(1);
  });
});

describe("SettingsProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function Harness({ onReady }: { onReady: (v: ReturnType<typeof useSettings>) => void }) {
    const v = useSettings();
    onReady(v);
    return null;
  }

  function renderProvider(onReady: (v: ReturnType<typeof useSettings>) => void) {
    return render(
      <ThemeProvider>
        <MusicProvider>
          <SettingsProvider>
            <Harness onReady={onReady} />
          </SettingsProvider>
        </MusicProvider>
      </ThemeProvider>,
    );
  }

  it("provides default values when storage is empty", () => {
    let captured: ReturnType<typeof useSettings> | null = null;
    renderProvider((v) => {
      captured = v;
    });
    expect(captured).not.toBeNull();
    expect(captured!.sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
    expect(captured!.masterMuted).toBe(DEFAULT_SETTINGS.masterMuted);
    expect(captured!.effectsIntensity).toBe(DEFAULT_SETTINGS.effectsIntensity);
  });

  it("reads initial values from storage", () => {
    localStorage.setItem(SFX_VOLUME_KEY, "0.25");
    localStorage.setItem(MASTER_MUTED_KEY, "1");
    localStorage.setItem(EFFECTS_INTENSITY_KEY, "subtle");

    let captured: ReturnType<typeof useSettings> | null = null;
    renderProvider((v) => {
      captured = v;
    });

    expect(captured!.sfxVolume).toBe(0.25);
    expect(captured!.masterMuted).toBe(true);
    expect(captured!.effectsIntensity).toBe("subtle");
  });

  it("writes to localStorage when values change", () => {
    let captured: ReturnType<typeof useSettings> | null = null;
    renderProvider((v) => {
      captured = v;
    });

    act(() => {
      captured!.setSfxVolume(0.1);
      captured!.setMasterMuted(true);
      captured!.setEffectsIntensity("off");
    });

    expect(localStorage.getItem(SFX_VOLUME_KEY)).toBe("0.1");
    expect(localStorage.getItem(MASTER_MUTED_KEY)).toBe("1");
    expect(localStorage.getItem(EFFECTS_INTENSITY_KEY)).toBe("off");
  });

  it("clamps sfx volume setter", () => {
    let captured: ReturnType<typeof useSettings> | null = null;
    renderProvider((v) => {
      captured = v;
    });
    act(() => {
      captured!.setSfxVolume(5);
    });
    expect(captured!.sfxVolume).toBe(1);
    act(() => {
      captured!.setSfxVolume(-1);
    });
    expect(captured!.sfxVolume).toBe(0);
  });
});
