import { describe, expect, it } from "vitest";

import { SRSRotation } from "./rotation-srs.js";
import { NRSRotation } from "./rotation-nrs.js";

// ---------------------------------------------------------------------------
// SRS kick offsets
// ---------------------------------------------------------------------------

describe("SRS kick offsets", () => {
  describe("JLSTZ kicks", () => {
    it("0>1", () => { expect(SRSRotation.getKickOffsets("T", 0, 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          -1,
          0,
        ],
        [
          -1,
          1,
        ],
        [
          0,
          -2,
        ],
        [
          -1,
          -2,
        ],
      ]
    `); });
    it("1>0", () => { expect(SRSRotation.getKickOffsets("T", 1, 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          1,
          0,
        ],
        [
          1,
          -1,
        ],
        [
          0,
          2,
        ],
        [
          1,
          2,
        ],
      ]
    `); });
    it("1>2", () => { expect(SRSRotation.getKickOffsets("T", 1, 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          1,
          0,
        ],
        [
          1,
          -1,
        ],
        [
          0,
          2,
        ],
        [
          1,
          2,
        ],
      ]
    `); });
    it("2>1", () => { expect(SRSRotation.getKickOffsets("T", 2, 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          -1,
          0,
        ],
        [
          -1,
          1,
        ],
        [
          0,
          -2,
        ],
        [
          -1,
          -2,
        ],
      ]
    `); });
    it("2>3", () => { expect(SRSRotation.getKickOffsets("T", 2, 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          1,
          0,
        ],
        [
          1,
          1,
        ],
        [
          0,
          -2,
        ],
        [
          1,
          -2,
        ],
      ]
    `); });
    it("3>2", () => { expect(SRSRotation.getKickOffsets("T", 3, 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          -1,
          0,
        ],
        [
          -1,
          -1,
        ],
        [
          0,
          2,
        ],
        [
          -1,
          2,
        ],
      ]
    `); });
    it("3>0", () => { expect(SRSRotation.getKickOffsets("T", 3, 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          -1,
          0,
        ],
        [
          -1,
          -1,
        ],
        [
          0,
          2,
        ],
        [
          -1,
          2,
        ],
      ]
    `); });
    it("0>3", () => { expect(SRSRotation.getKickOffsets("T", 0, 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          1,
          0,
        ],
        [
          1,
          1,
        ],
        [
          0,
          -2,
        ],
        [
          1,
          -2,
        ],
      ]
    `); });
  });

  describe("I-piece kicks", () => {
    it("0>1", () => { expect(SRSRotation.getKickOffsets("I", 0, 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          -2,
          0,
        ],
        [
          1,
          0,
        ],
        [
          -2,
          -1,
        ],
        [
          1,
          2,
        ],
      ]
    `); });
    it("1>0", () => { expect(SRSRotation.getKickOffsets("I", 1, 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          2,
          0,
        ],
        [
          -1,
          0,
        ],
        [
          2,
          1,
        ],
        [
          -1,
          -2,
        ],
      ]
    `); });
    it("1>2", () => { expect(SRSRotation.getKickOffsets("I", 1, 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          -1,
          0,
        ],
        [
          2,
          0,
        ],
        [
          -1,
          2,
        ],
        [
          2,
          -1,
        ],
      ]
    `); });
    it("2>1", () => { expect(SRSRotation.getKickOffsets("I", 2, 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          1,
          0,
        ],
        [
          -2,
          0,
        ],
        [
          1,
          -2,
        ],
        [
          -2,
          1,
        ],
      ]
    `); });
    it("2>3", () => { expect(SRSRotation.getKickOffsets("I", 2, 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          2,
          0,
        ],
        [
          -1,
          0,
        ],
        [
          2,
          1,
        ],
        [
          -1,
          -2,
        ],
      ]
    `); });
    it("3>2", () => { expect(SRSRotation.getKickOffsets("I", 3, 2)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          -2,
          0,
        ],
        [
          1,
          0,
        ],
        [
          -2,
          -1,
        ],
        [
          1,
          2,
        ],
      ]
    `); });
    it("3>0", () => { expect(SRSRotation.getKickOffsets("I", 3, 0)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          1,
          0,
        ],
        [
          -2,
          0,
        ],
        [
          1,
          -2,
        ],
        [
          -2,
          1,
        ],
      ]
    `); });
    it("0>3", () => { expect(SRSRotation.getKickOffsets("I", 0, 3)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
        [
          -1,
          0,
        ],
        [
          2,
          0,
        ],
        [
          -1,
          2,
        ],
        [
          2,
          -1,
        ],
      ]
    `); });
  });

  describe("O-piece kicks", () => {
    it("returns only [0,0]", () => {
      expect(SRSRotation.getKickOffsets("O", 0, 1)).toMatchInlineSnapshot(`
        [
          [
            0,
            0,
          ],
        ]
      `);
    });
  });
});

// ---------------------------------------------------------------------------
// NRS kick offsets — no wall kicks
// ---------------------------------------------------------------------------

describe("NRS kick offsets", () => {
  it("always returns [[0,0]] (no wall kicks)", () => {
    expect(NRSRotation.getKickOffsets("T", 0, 1)).toMatchInlineSnapshot(`
      [
        [
          0,
          0,
        ],
      ]
    `);
  });
});
