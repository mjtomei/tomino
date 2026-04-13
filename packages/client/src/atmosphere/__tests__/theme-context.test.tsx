import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  ThemeProvider,
  useTheme,
  THEME_STORAGE_KEY,
  GENRE_STORAGE_KEY,
  PALETTE_STORAGE_KEY,
} from "../theme-context.js";
import { DEFAULT_THEME_ID } from "../themes.js";
import { DEFAULT_GENRE_ID } from "../genres.js";
import { DEFAULT_PALETTE_ID, PALETTES } from "../../ui/palettes.js";

function Probe() {
  const { themeId, genreId, paletteId, palette, setThemeId, setGenreId, setPaletteId } = useTheme();
  return (
    <div>
      <span data-testid="theme">{themeId}</span>
      <span data-testid="genre">{genreId}</span>
      <span data-testid="palette">{paletteId}</span>
      <span data-testid="palette-i">{palette.colors.I}</span>
      <button data-testid="set-aurora" onClick={() => setThemeId("aurora")}>
        aurora
      </button>
      <button data-testid="set-synth" onClick={() => setGenreId("synthwave")}>
        synth
      </button>
      <button data-testid="set-jewel" onClick={() => setPaletteId("jewel")}>
        jewel
      </button>
      <button data-testid="set-bad-palette" onClick={() => setPaletteId("nope")}>
        badp
      </button>
      <button data-testid="set-bad" onClick={() => setThemeId("nonsense")}>
        bad
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("provides defaults", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe(DEFAULT_THEME_ID);
    expect(screen.getByTestId("genre").textContent).toBe(DEFAULT_GENRE_ID);
  });

  it("switches theme and genre at runtime", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      screen.getByTestId("set-aurora").click();
      screen.getByTestId("set-synth").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("aurora");
    expect(screen.getByTestId("genre").textContent).toBe("synthwave");
  });

  it("persists selection to localStorage", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      screen.getByTestId("set-aurora").click();
      screen.getByTestId("set-synth").click();
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("aurora");
    expect(window.localStorage.getItem(GENRE_STORAGE_KEY)).toBe("synthwave");
  });

  it("ignores invalid theme ids", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      screen.getByTestId("set-bad").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe(DEFAULT_THEME_ID);
  });

  it("reads stored selection on mount", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "neon-city");
    window.localStorage.setItem(GENRE_STORAGE_KEY, "chiptune");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("neon-city");
    expect(screen.getByTestId("genre").textContent).toBe("chiptune");
  });

  it("exposes paletteId, palette, and switches at runtime with persistence", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("palette").textContent).toBe(DEFAULT_PALETTE_ID);
    expect(screen.getByTestId("palette-i").textContent).toBe(
      PALETTES[DEFAULT_PALETTE_ID].colors.I,
    );
    act(() => {
      screen.getByTestId("set-jewel").click();
    });
    expect(screen.getByTestId("palette").textContent).toBe("jewel");
    expect(screen.getByTestId("palette-i").textContent).toBe(PALETTES.jewel.colors.I);
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe("jewel");
  });

  it("ignores invalid palette ids", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      screen.getByTestId("set-bad-palette").click();
    });
    expect(screen.getByTestId("palette").textContent).toBe(DEFAULT_PALETTE_ID);
  });

  it("ignores garbage in storage", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "garbage");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe(DEFAULT_THEME_ID);
  });
});
