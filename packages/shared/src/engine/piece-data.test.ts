import { describe, expect, it } from "vitest";

import { SRSRotation } from "./rotation-srs.js";
import { NRSRotation } from "./rotation-nrs.js";

// ---------------------------------------------------------------------------
// SRS piece shapes — 7 pieces x 4 rotations = 28 inline snapshots
// ---------------------------------------------------------------------------

describe("SRS piece shapes", () => {
  describe("I-piece", () => {
    it("rotation 0", () => { expect(SRSRotation.getShape("I", 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
          1,
        ],
        [
          0,
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(SRSRotation.getShape("I", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          1,
          0,
        ],
        [
          0,
          0,
          1,
          0,
        ],
        [
          0,
          0,
          1,
          0,
        ],
        [
          0,
          0,
          1,
          0,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(SRSRotation.getShape("I", 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
          1,
        ],
        [
          0,
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(SRSRotation.getShape("I", 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
          0,
        ],
        [
          0,
          1,
          0,
          0,
        ],
        [
          0,
          1,
          0,
          0,
        ],
        [
          0,
          1,
          0,
          0,
        ],
      ]
    `); });
  });

  describe("O-piece", () => {
    it("rotation 0", () => { expect(SRSRotation.getShape("O", 0)).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
        ],
        [
          1,
          1,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(SRSRotation.getShape("O", 1)).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
        ],
        [
          1,
          1,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(SRSRotation.getShape("O", 2)).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
        ],
        [
          1,
          1,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(SRSRotation.getShape("O", 3)).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
        ],
        [
          1,
          1,
        ],
      ]
    `); });
  });

  describe("T-piece", () => {
    it("rotation 0", () => { expect(SRSRotation.getShape("T", 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(SRSRotation.getShape("T", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          1,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(SRSRotation.getShape("T", 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(SRSRotation.getShape("T", 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          1,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
  });

  describe("S-piece", () => {
    it("rotation 0", () => { expect(SRSRotation.getShape("S", 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          1,
        ],
        [
          1,
          1,
          0,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(SRSRotation.getShape("S", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          1,
        ],
        [
          0,
          0,
          1,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(SRSRotation.getShape("S", 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          0,
          1,
          1,
        ],
        [
          1,
          1,
          0,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(SRSRotation.getShape("S", 3)).toMatchInlineSnapshot(`
      [
        [
          1,
          0,
          0,
        ],
        [
          1,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
  });

  describe("Z-piece", () => {
    it("rotation 0", () => { expect(SRSRotation.getShape("Z", 0)).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
          0,
        ],
        [
          0,
          1,
          1,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(SRSRotation.getShape("Z", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          1,
        ],
        [
          0,
          1,
          1,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(SRSRotation.getShape("Z", 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          1,
          1,
          0,
        ],
        [
          0,
          1,
          1,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(SRSRotation.getShape("Z", 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          1,
          1,
          0,
        ],
        [
          1,
          0,
          0,
        ],
      ]
    `); });
  });

  describe("J-piece", () => {
    it("rotation 0", () => { expect(SRSRotation.getShape("J", 0)).toMatchInlineSnapshot(`
      [
        [
          1,
          0,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(SRSRotation.getShape("J", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          1,
        ],
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(SRSRotation.getShape("J", 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          0,
          1,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(SRSRotation.getShape("J", 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
        [
          1,
          1,
          0,
        ],
      ]
    `); });
  });

  describe("L-piece", () => {
    it("rotation 0", () => { expect(SRSRotation.getShape("L", 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          1,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(SRSRotation.getShape("L", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          1,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(SRSRotation.getShape("L", 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          1,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(SRSRotation.getShape("L", 3)).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
  });
});

// ---------------------------------------------------------------------------
// NRS piece shapes — variable rotation counts per piece
// ---------------------------------------------------------------------------

describe("NRS piece shapes", () => {
  describe("I-piece (2 states)", () => {
    it("rotation 0", () => { expect(NRSRotation.getShape("I", 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
          1,
        ],
        [
          0,
          0,
          0,
          0,
        ],
        [
          0,
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(NRSRotation.getShape("I", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          1,
          0,
        ],
        [
          0,
          0,
          1,
          0,
        ],
        [
          0,
          0,
          1,
          0,
        ],
        [
          0,
          0,
          1,
          0,
        ],
      ]
    `); });
  });

  describe("O-piece (1 state)", () => {
    it("rotation 0", () => { expect(NRSRotation.getShape("O", 0)).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
        ],
        [
          1,
          1,
        ],
      ]
    `); });
  });

  describe("T-piece (4 states)", () => {
    it("rotation 0", () => { expect(NRSRotation.getShape("T", 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(NRSRotation.getShape("T", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          1,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(NRSRotation.getShape("T", 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(NRSRotation.getShape("T", 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          1,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
  });

  describe("S-piece (2 states)", () => {
    it("rotation 0", () => { expect(NRSRotation.getShape("S", 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          1,
        ],
        [
          1,
          1,
          0,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(NRSRotation.getShape("S", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          1,
        ],
        [
          0,
          0,
          1,
        ],
      ]
    `); });
  });

  describe("Z-piece (2 states)", () => {
    it("rotation 0", () => { expect(NRSRotation.getShape("Z", 0)).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
          0,
        ],
        [
          0,
          1,
          1,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(NRSRotation.getShape("Z", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          1,
        ],
        [
          0,
          1,
          1,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
  });

  describe("J-piece (4 states)", () => {
    it("rotation 0", () => { expect(NRSRotation.getShape("J", 0)).toMatchInlineSnapshot(`
      [
        [
          1,
          0,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(NRSRotation.getShape("J", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          1,
        ],
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(NRSRotation.getShape("J", 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          0,
          1,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(NRSRotation.getShape("J", 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
        [
          1,
          1,
          0,
        ],
      ]
    `); });
  });

  describe("L-piece (4 states)", () => {
    it("rotation 0", () => { expect(NRSRotation.getShape("L", 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          1,
        ],
        [
          1,
          1,
          1,
        ],
        [
          0,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 1", () => { expect(NRSRotation.getShape("L", 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          1,
        ],
      ]
    `); });
    it("rotation 2", () => { expect(NRSRotation.getShape("L", 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
        ],
        [
          1,
          0,
          0,
        ],
      ]
    `); });
    it("rotation 3", () => { expect(NRSRotation.getShape("L", 3)).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
        [
          0,
          1,
          0,
        ],
      ]
    `); });
  });
});
