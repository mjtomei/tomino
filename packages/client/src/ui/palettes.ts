import type { PieceType } from "@tomino/shared";

export type PaletteId = "synthwave" | "jewel" | "muted";

export interface Palette {
  id: PaletteId;
  name: string;
  colors: Record<PieceType, string>;
}

export const PALETTES: Record<PaletteId, Palette> = {
  synthwave: {
    id: "synthwave",
    name: "Synthwave",
    colors: {
      I: "#00F5D4",
      O: "#FEE440",
      T: "#9B5DE5",
      S: "#06D6A0",
      Z: "#EF476F",
      J: "#118AB2",
      L: "#FB8500",
    },
  },
  jewel: {
    id: "jewel",
    name: "Jewel",
    colors: {
      I: "#2A9D8F",
      O: "#E9C46A",
      T: "#9D4EDD",
      S: "#52B788",
      Z: "#E63946",
      J: "#3A86FF",
      L: "#E76F51",
    },
  },
  muted: {
    id: "muted",
    name: "Muted",
    colors: {
      I: "#8ECAE6",
      O: "#F4E285",
      T: "#CDB4DB",
      S: "#B5E48C",
      Z: "#E07A5F",
      J: "#6A7FDB",
      L: "#F4A261",
    },
  },
};

export const DEFAULT_PALETTE_ID: PaletteId = "synthwave";

export function getPalette(id: string): Palette {
  return PALETTES[id as PaletteId] ?? PALETTES[DEFAULT_PALETTE_ID];
}
