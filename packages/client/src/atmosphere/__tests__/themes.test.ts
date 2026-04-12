import { describe, it, expect } from "vitest";
import { THEMES, DEFAULT_THEME_ID, getTheme, validateTheme } from "../themes.js";

describe("themes", () => {
  it("ships at least 4 themes", () => {
    expect(Object.keys(THEMES).length).toBeGreaterThanOrEqual(4);
  });

  it("has default theme in registry", () => {
    expect(THEMES[DEFAULT_THEME_ID]).toBeDefined();
  });

  it("all theme keys match their id field", () => {
    for (const [key, theme] of Object.entries(THEMES)) {
      expect(theme.id).toBe(key);
    }
  });

  it("all themes validate without errors", () => {
    for (const theme of Object.values(THEMES)) {
      expect(validateTheme(theme)).toEqual([]);
    }
  });

  it("ships expected themes", () => {
    expect(Object.values(THEMES).map((t) => t.name).sort()).toEqual(
      ["Aurora", "Deep Ocean", "Neon City", "Void"],
    );
  });

  it("getTheme falls back to default for unknown id", () => {
    expect(getTheme("does-not-exist").id).toBe(DEFAULT_THEME_ID);
  });

  it("validateTheme flags bad data", () => {
    const bad = {
      ...THEMES[DEFAULT_THEME_ID],
      palette: {
        ...THEMES[DEFAULT_THEME_ID].palette,
        backgroundGradient: ["#fff"],
        particleColors: [],
        accent: "",
      },
    };
    expect(validateTheme(bad).length).toBeGreaterThan(0);
  });
});
