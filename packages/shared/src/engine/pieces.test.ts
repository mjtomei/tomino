import { describe, expect, it } from "vitest";

import { ALL_PIECES, ALL_ROTATIONS } from "./pieces.js";
import type { PieceShape, PieceType, Rotation } from "./pieces.js";
import type { RotationSystem } from "./rotation.js";
import { SRSRotation } from "./rotation-srs.js";
import { ClassicRotation } from "./rotation-classic.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count filled cells in a shape. */
function filledCells(shape: PieceShape): number {
  let count = 0;
  for (const row of shape) {
    for (const cell of row) {
      if (cell) count++;
    }
  }
  return count;
}

/** Check that a shape is a valid rectangular grid of 0s and 1s. */
function assertValidShape(shape: PieceShape) {
  expect(shape.length).toBeGreaterThan(0);
  const width = shape[0]!.length;
  for (const row of shape) {
    expect(row.length).toBe(width);
    for (const cell of row) {
      expect(cell === 0 || cell === 1).toBe(true);
    }
  }
}

// ---------------------------------------------------------------------------
// Piece definitions
// ---------------------------------------------------------------------------

describe("piece constants", () => {
  it("ALL_PIECES contains all 7 standard pieces", () => {
    expect(ALL_PIECES).toEqual(["I", "O", "T", "S", "Z", "J", "L"]);
  });

  it("ALL_ROTATIONS contains 0-3", () => {
    expect(ALL_ROTATIONS).toEqual([0, 1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// SRS Rotation System
// ---------------------------------------------------------------------------

describe("SRSRotation", () => {
  const srs = SRSRotation;

  describe("interface compliance", () => {
    it("implements RotationSystem", () => {
      const _: RotationSystem = srs;
      expect(_).toBeDefined();
    });
  });

  describe("rotation states", () => {
    it("every piece has 4 rotation states", () => {
      for (const piece of ALL_PIECES) {
        expect(srs.getRotationCount(piece)).toBe(4);
      }
    });

    it("every piece returns valid shapes for all 4 rotations", () => {
      for (const piece of ALL_PIECES) {
        for (const rot of ALL_ROTATIONS) {
          const shape = srs.getShape(piece, rot);
          assertValidShape(shape);
        }
      }
    });

    it("every rotation of a piece has exactly 4 filled cells", () => {
      for (const piece of ALL_PIECES) {
        for (const rot of ALL_ROTATIONS) {
          const shape = srs.getShape(piece, rot);
          expect(
            filledCells(shape),
            `${piece} rotation ${rot} should have 4 filled cells`,
          ).toBe(4);
        }
      }
    });

    it("I-piece uses 4x4 bounding box", () => {
      for (const rot of ALL_ROTATIONS) {
        const shape = srs.getShape("I", rot);
        expect(shape.length).toBe(4);
        expect(shape[0]!.length).toBe(4);
      }
    });

    it("O-piece uses 2x2 bounding box", () => {
      for (const rot of ALL_ROTATIONS) {
        const shape = srs.getShape("O", rot);
        expect(shape.length).toBe(2);
        expect(shape[0]!.length).toBe(2);
      }
    });

    it("JLSTZ pieces use 3x3 bounding box", () => {
      const pieces: PieceType[] = ["J", "L", "S", "T", "Z"];
      for (const piece of pieces) {
        for (const rot of ALL_ROTATIONS) {
          const shape = srs.getShape(piece, rot);
          expect(shape.length).toBe(3);
          expect(shape[0]!.length).toBe(3);
        }
      }
    });
  });

  describe("spawn shapes (rotation 0)", () => {
    it("I-piece spawns as horizontal bar in row 1", () => {
      expect(srs.getShape("I", 0)).toEqual([
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
    });

    it("O-piece spawns as 2x2 block", () => {
      expect(srs.getShape("O", 0)).toEqual([
        [1, 1],
        [1, 1],
      ]);
    });

    it("T-piece spawns with flat side down", () => {
      expect(srs.getShape("T", 0)).toEqual([
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0],
      ]);
    });

    it("S-piece spawns in standard S shape", () => {
      expect(srs.getShape("S", 0)).toEqual([
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0],
      ]);
    });

    it("Z-piece spawns in standard Z shape", () => {
      expect(srs.getShape("Z", 0)).toEqual([
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0],
      ]);
    });

    it("J-piece spawns with corner top-left", () => {
      expect(srs.getShape("J", 0)).toEqual([
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0],
      ]);
    });

    it("L-piece spawns with corner top-right", () => {
      expect(srs.getShape("L", 0)).toEqual([
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0],
      ]);
    });
  });

  describe("O-piece rotation invariance", () => {
    it("all 4 rotation states are identical", () => {
      const base = srs.getShape("O", 0);
      expect(srs.getShape("O", 1)).toEqual(base);
      expect(srs.getShape("O", 2)).toEqual(base);
      expect(srs.getShape("O", 3)).toEqual(base);
    });
  });

  describe("wall kick tables", () => {
    it("JLSTZ pieces return 5 kick offsets for CW transitions", () => {
      const jlstz: PieceType[] = ["J", "L", "S", "T", "Z"];
      const cwTransitions: [Rotation, Rotation][] = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ];
      for (const piece of jlstz) {
        for (const [from, to] of cwTransitions) {
          const kicks = srs.getKickOffsets(piece, from, to);
          expect(
            kicks.length,
            `${piece} ${from}>${to} should have 5 kicks`,
          ).toBe(5);
          expect(kicks[0], "first kick should be [0,0]").toEqual([0, 0]);
        }
      }
    });

    it("JLSTZ pieces return 5 kick offsets for CCW transitions", () => {
      const jlstz: PieceType[] = ["J", "L", "S", "T", "Z"];
      const ccwTransitions: [Rotation, Rotation][] = [
        [1, 0],
        [2, 1],
        [3, 2],
        [0, 3],
      ];
      for (const piece of jlstz) {
        for (const [from, to] of ccwTransitions) {
          const kicks = srs.getKickOffsets(piece, from, to);
          expect(kicks.length).toBe(5);
          expect(kicks[0]).toEqual([0, 0]);
        }
      }
    });

    it("I-piece uses a different kick table from JLSTZ", () => {
      // The I-piece 0>1 kicks should differ from T-piece 0>1 kicks
      const iKicks = srs.getKickOffsets("I", 0, 1);
      const tKicks = srs.getKickOffsets("T", 0, 1);
      expect(iKicks).not.toEqual(tKicks);
    });

    it("I-piece has 5 kick offsets per transition", () => {
      const transitions: [Rotation, Rotation][] = [
        [0, 1], [1, 0], [1, 2], [2, 1],
        [2, 3], [3, 2], [3, 0], [0, 3],
      ];
      for (const [from, to] of transitions) {
        const kicks = srs.getKickOffsets("I", from, to);
        expect(kicks.length, `I ${from}>${to}`).toBe(5);
        expect(kicks[0]).toEqual([0, 0]);
      }
    });

    it("O-piece returns only [0,0] kick offset", () => {
      for (const from of ALL_ROTATIONS) {
        const to = ((from + 1) % 4) as Rotation;
        const kicks = srs.getKickOffsets("O", from, to);
        expect(kicks).toEqual([[0, 0]]);
      }
    });

    it("JLSTZ pieces share the same kick table", () => {
      const jlstz: PieceType[] = ["J", "L", "S", "T", "Z"];
      const transitions: [Rotation, Rotation][] = [
        [0, 1], [1, 0], [1, 2], [2, 1],
        [2, 3], [3, 2], [3, 0], [0, 3],
      ];
      for (const [from, to] of transitions) {
        const reference = srs.getKickOffsets("J", from, to);
        for (const piece of jlstz) {
          expect(
            srs.getKickOffsets(piece, from, to),
            `${piece} ${from}>${to} should match J`,
          ).toEqual(reference);
        }
      }
    });
  });

  describe("kick table snapshots", () => {
    it("SRS JLSTZ kick table matches specification", () => {
      const table: Record<string, readonly (readonly number[])[]> = {};
      const transitions: [Rotation, Rotation][] = [
        [0, 1], [1, 0], [1, 2], [2, 1],
        [2, 3], [3, 2], [3, 0], [0, 3],
      ];
      for (const [from, to] of transitions) {
        table[`${from}>${to}`] = srs.getKickOffsets("T", from, to);
      }
      expect(table).toMatchSnapshot();
    });

    it("SRS I-piece kick table matches specification", () => {
      const table: Record<string, readonly (readonly number[])[]> = {};
      const transitions: [Rotation, Rotation][] = [
        [0, 1], [1, 0], [1, 2], [2, 1],
        [2, 3], [3, 2], [3, 0], [0, 3],
      ];
      for (const [from, to] of transitions) {
        table[`${from}>${to}`] = srs.getKickOffsets("I", from, to);
      }
      expect(table).toMatchSnapshot();
    });
  });

  describe("shape snapshots", () => {
    for (const piece of ALL_PIECES) {
      it(`${piece}-piece all rotations match snapshot`, () => {
        const shapes = ALL_ROTATIONS.map((rot) => srs.getShape(piece, rot));
        expect(shapes).toMatchSnapshot();
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Classic Rotation System
// ---------------------------------------------------------------------------

describe("ClassicRotation", () => {
  const classicRot = ClassicRotation;

  describe("interface compliance", () => {
    it("implements RotationSystem", () => {
      const _: RotationSystem = classicRot;
      expect(_).toBeDefined();
    });
  });

  describe("rotation state counts", () => {
    it("I-piece has 2 rotation states", () => {
      expect(classicRot.getRotationCount("I")).toBe(2);
    });

    it("S-piece has 2 rotation states", () => {
      expect(classicRot.getRotationCount("S")).toBe(2);
    });

    it("Z-piece has 2 rotation states", () => {
      expect(classicRot.getRotationCount("Z")).toBe(2);
    });

    it("J-piece has 4 rotation states", () => {
      expect(classicRot.getRotationCount("J")).toBe(4);
    });

    it("L-piece has 4 rotation states", () => {
      expect(classicRot.getRotationCount("L")).toBe(4);
    });

    it("T-piece has 4 rotation states", () => {
      expect(classicRot.getRotationCount("T")).toBe(4);
    });

    it("O-piece has 1 rotation state", () => {
      expect(classicRot.getRotationCount("O")).toBe(1);
    });
  });

  describe("shapes", () => {
    it("every piece returns valid shapes for all rotations", () => {
      for (const piece of ALL_PIECES) {
        const count = classicRot.getRotationCount(piece);
        for (let r = 0; r < count; r++) {
          const shape = classicRot.getShape(piece, r as Rotation);
          assertValidShape(shape);
          expect(
            filledCells(shape),
            `${piece} rotation ${r}`,
          ).toBe(4);
        }
      }
    });

    it("I-piece rotation wraps after 2 states", () => {
      expect(classicRot.getShape("I", 2 as Rotation)).toEqual(classicRot.getShape("I", 0));
      expect(classicRot.getShape("I", 3 as Rotation)).toEqual(classicRot.getShape("I", 1));
    });

    it("S-piece rotation wraps after 2 states", () => {
      expect(classicRot.getShape("S", 2 as Rotation)).toEqual(classicRot.getShape("S", 0));
    });

    it("Z-piece rotation wraps after 2 states", () => {
      expect(classicRot.getShape("Z", 2 as Rotation)).toEqual(classicRot.getShape("Z", 0));
    });

    it("O-piece has a single state that wraps for all rotations", () => {
      const base = classicRot.getShape("O", 0);
      expect(classicRot.getShape("O", 1)).toEqual(base);
      expect(classicRot.getShape("O", 2 as Rotation)).toEqual(base);
      expect(classicRot.getShape("O", 3 as Rotation)).toEqual(base);
    });
  });

  describe("no wall kicks", () => {
    it("returns only [0,0] for all pieces and transitions", () => {
      for (const piece of ALL_PIECES) {
        for (const from of ALL_ROTATIONS) {
          const to = ((from + 1) % 4) as Rotation;
          const kicks = classicRot.getKickOffsets(piece, from, to);
          expect(kicks, `${piece} ${from}>${to}`).toEqual([[0, 0]]);
        }
      }
    });
  });

  describe("right-handed bias", () => {
    it("S-piece vertical state has cells biased right", () => {
      const vertical = classicRot.getShape("S", 1);
      // In right-handed Classic, the S vertical should have the column
      // of cells offset to the right side of the bounding box
      const rightColFilled = vertical.some(
        (row) => row[2] === 1,
      );
      expect(rightColFilled).toBe(true);
    });

    it("Z-piece vertical state has cells biased right", () => {
      const vertical = classicRot.getShape("Z", 1);
      const rightColFilled = vertical.some(
        (row) => row[2] === 1,
      );
      expect(rightColFilled).toBe(true);
    });

    it("I-piece vertical state rotates to the right", () => {
      const vertical = classicRot.getShape("I", 1);
      // Right-handed: vertical I sits in column 2 (0-indexed) of the 4x4 box
      for (const row of vertical) {
        const filledCol = row.indexOf(1);
        if (filledCol >= 0) {
          expect(filledCol).toBe(2);
        }
      }
    });
  });

  describe("shape snapshots", () => {
    for (const piece of ALL_PIECES) {
      it(`${piece}-piece all rotations match snapshot`, () => {
        const count = classicRot.getRotationCount(piece);
        const shapes = [];
        for (let r = 0; r < count; r++) {
          shapes.push(classicRot.getShape(piece, r as Rotation));
        }
        expect(shapes).toMatchSnapshot();
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-system tests
// ---------------------------------------------------------------------------

describe("RotationSystem interface", () => {
  const systems: [string, RotationSystem][] = [
    ["SRS", SRSRotation],
    ["Classic", ClassicRotation],
  ];

  for (const [name, system] of systems) {
    describe(name, () => {
      it("getShape returns a shape for every piece at rotation 0", () => {
        for (const piece of ALL_PIECES) {
          const shape = system.getShape(piece, 0);
          expect(shape).toBeDefined();
          assertValidShape(shape);
        }
      });

      it("getKickOffsets always includes [0,0] as first offset", () => {
        for (const piece of ALL_PIECES) {
          const kicks = system.getKickOffsets(piece, 0, 1);
          expect(kicks.length).toBeGreaterThan(0);
          expect(kicks[0]).toEqual([0, 0]);
        }
      });

      it("getRotationCount returns a positive number for every piece", () => {
        for (const piece of ALL_PIECES) {
          expect(system.getRotationCount(piece)).toBeGreaterThan(0);
        }
      });
    });
  }
});
