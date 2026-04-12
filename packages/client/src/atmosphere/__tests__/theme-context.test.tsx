import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  ThemeProvider,
  useTheme,
  THEME_STORAGE_KEY,
  GENRE_STORAGE_KEY,
} from "../theme-context.js";
import { DEFAULT_THEME_ID } from "../themes.js";
import { DEFAULT_GENRE_ID } from "../genres.js";

function Probe() {
  const { themeId, genreId, setThemeId, setGenreId } = useTheme();
  return (
    <div>
      <span data-testid="theme">{themeId}</span>
      <span data-testid="genre">{genreId}</span>
      <button data-testid="set-aurora" onClick={() => setThemeId("aurora")}>
        aurora
      </button>
      <button data-testid="set-synth" onClick={() => setGenreId("synthwave")}>
        synth
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
