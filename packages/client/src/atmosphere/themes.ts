import type { ParticleShape } from "./particle-system";
export type { ParticleShape };
export type GeometryPattern = "none" | "grid" | "hexagons" | "waves" | "stars";

export interface ThemePalette {
  backgroundGradient: string[];
  particleColors: string[];
  accent: string;
  boardBg: string;
  panelBg: string;
  gridLine: string;
}

export interface ParticleStyle {
  shape: ParticleShape;
  sizeRange: [number, number];
  trail: boolean;
}

export interface BackgroundGeometry {
  pattern: GeometryPattern;
  density: number;
  movement: number;
}

export interface Theme {
  id: string;
  name: string;
  palette: ThemePalette;
  particles: ParticleStyle;
  geometry: BackgroundGeometry;
}

export const THEMES: Record<string, Theme> = {
  "deep-ocean": {
    id: "deep-ocean",
    name: "Deep Ocean",
    palette: {
      backgroundGradient: ["#001730", "#003355", "#004a6b"],
      particleColors: ["#4fd4ff", "#00a0c4", "#ffffff"],
      accent: "#4fd4ff",
      boardBg: "#021a2b",
      panelBg: "#012033",
      gridLine: "rgba(120, 200, 255, 0.08)",
    },
    particles: { shape: "circle", sizeRange: [1, 3], trail: true },
    geometry: { pattern: "waves", density: 0.4, movement: 0.3 },
  },
  "neon-city": {
    id: "neon-city",
    name: "Neon City",
    palette: {
      backgroundGradient: ["#0a0014", "#1a0033", "#330066"],
      particleColors: ["#ff00aa", "#00eaff", "#ffee00"],
      accent: "#ff00aa",
      boardBg: "#0f0020",
      panelBg: "#140028",
      gridLine: "rgba(255, 0, 170, 0.12)",
    },
    particles: { shape: "square", sizeRange: [2, 4], trail: false },
    geometry: { pattern: "grid", density: 0.7, movement: 0.5 },
  },
  void: {
    id: "void",
    name: "Void",
    palette: {
      backgroundGradient: ["#000000", "#0a0a0a", "#111111"],
      particleColors: ["#ffffff", "#888888"],
      accent: "#ffffff",
      boardBg: "#0a0a0a",
      panelBg: "#111111",
      gridLine: "rgba(255, 255, 255, 0.06)",
    },
    particles: { shape: "circle", sizeRange: [1, 2], trail: false },
    geometry: { pattern: "none", density: 0, movement: 0 },
  },
  aurora: {
    id: "aurora",
    name: "Aurora",
    palette: {
      backgroundGradient: ["#001a0d", "#004d2e", "#00806b"],
      particleColors: ["#7fffd4", "#9f7fff", "#ff9fe0"],
      accent: "#7fffd4",
      boardBg: "#011a14",
      panelBg: "#01261c",
      gridLine: "rgba(127, 255, 212, 0.1)",
    },
    particles: { shape: "star", sizeRange: [2, 5], trail: true },
    geometry: { pattern: "waves", density: 0.5, movement: 0.8 },
  },
};

export const DEFAULT_THEME_ID = "void";

export function getTheme(id: string): Theme {
  return THEMES[id] ?? (THEMES[DEFAULT_THEME_ID] as Theme);
}

export function validateTheme(theme: Theme): string[] {
  const errors: string[] = [];
  if (!theme.id) errors.push("missing id");
  if (!theme.name) errors.push("missing name");
  if (theme.palette.backgroundGradient.length < 2)
    errors.push("gradient needs >=2 stops");
  if (theme.palette.particleColors.length === 0)
    errors.push("no particle colors");
  if (!theme.palette.accent) errors.push("missing accent");
  if (theme.particles.sizeRange[0] > theme.particles.sizeRange[1])
    errors.push("invalid size range");
  if (theme.geometry.density < 0 || theme.geometry.density > 1)
    errors.push("density out of range");
  return errors;
}
