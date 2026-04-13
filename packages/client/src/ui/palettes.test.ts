import { describe, it, expect } from "vitest";
import { PALETTES, DEFAULT_PALETTE_ID, getPalette } from "./palettes.js";

const PIECE_TYPES = ["I", "O", "T", "S", "Z", "J", "L"] as const;
const HEX = /^#[0-9A-F]{6}$/i;

describe("palettes", () => {
  it.each(Object.values(PALETTES))("$name has all 7 piece colors as 7-char hex", (palette) => {
    for (const pt of PIECE_TYPES) {
      const c = palette.colors[pt];
      expect(c).toBeDefined();
      expect(c).toMatch(HEX);
    }
  });

  it("has synthwave as the default", () => {
    expect(DEFAULT_PALETTE_ID).toBe("synthwave");
    expect(PALETTES.synthwave).toBeDefined();
  });

  it("getPalette returns the requested palette", () => {
    expect(getPalette("jewel").id).toBe("jewel");
    expect(getPalette("muted").id).toBe("muted");
  });

  it("getPalette falls back to default for unknown id", () => {
    expect(getPalette("nope").id).toBe(DEFAULT_PALETTE_ID);
  });
});
