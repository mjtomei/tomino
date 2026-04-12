import { describe, it, expect } from "vitest";
import { GENRES, DEFAULT_GENRE_ID, getGenre, validateGenre } from "../genres.js";

describe("genres", () => {
  it("ships at least 4 genres", () => {
    expect(Object.keys(GENRES).length).toBeGreaterThanOrEqual(4);
  });

  it("has default genre", () => {
    expect(GENRES[DEFAULT_GENRE_ID]).toBeDefined();
  });

  it("keys match ids", () => {
    for (const [k, g] of Object.entries(GENRES)) expect(g.id).toBe(k);
  });

  it("all genres validate", () => {
    for (const g of Object.values(GENRES)) expect(validateGenre(g)).toEqual([]);
  });

  it("all layer patterns are 16 steps", () => {
    for (const g of Object.values(GENRES)) {
      for (const layer of g.layers) {
        expect(layer.pattern.steps).toHaveLength(16);
      }
    }
  });

  it("getGenre falls back to default for unknown", () => {
    expect(getGenre("nope").id).toBe(DEFAULT_GENRE_ID);
  });

  it("validateGenre catches invalid pattern length", () => {
    const g = GENRES[DEFAULT_GENRE_ID];
    const bad = {
      ...g,
      layers: [
        {
          ...g.layers[0],
          pattern: { steps: [1, 0, 1] },
        },
      ],
    };
    expect(validateGenre(bad).length).toBeGreaterThan(0);
  });

  it("ships expected genres", () => {
    expect(Object.values(GENRES).map((g) => g.name).sort()).toEqual(
      ["Ambient", "Chiptune", "Minimal Techno", "Synthwave"],
    );
  });
});
