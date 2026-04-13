/** Darker variant for cell borders (beveled look). */
export function darken(hex: string, amount = 0.3): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `#${Math.round(r * f).toString(16).padStart(2, "0")}${Math.round(g * f).toString(16).padStart(2, "0")}${Math.round(b * f).toString(16).padStart(2, "0")}`;
}

/** Lighter variant for cell highlight edge. */
export function lighten(hex: string, amount = 0.3): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = amount;
  return `#${Math.round(r + (255 - r) * f).toString(16).padStart(2, "0")}${Math.round(g + (255 - g) * f).toString(16).padStart(2, "0")}${Math.round(b + (255 - b) * f).toString(16).padStart(2, "0")}`;
}

/** Background color for the board. */
export const BOARD_BG = "#0A0A0A";

/** Side panel background. */
export const PANEL_BG = "#111111";
