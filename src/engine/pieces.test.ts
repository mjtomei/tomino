import { describe, it, expect } from 'vitest';
import { PieceType, RotationState, ALL_PIECE_TYPES } from './pieces.js';
import { RotationSystem } from './rotation.js';
import { SRSRotation } from './rotation-srs.js';
import { NRSRotation } from './rotation-nrs.js';

const ALL_STATES = [RotationState.SPAWN, RotationState.R, RotationState.TWO, RotationState.L];

describe('SRSRotation', () => {
  const srs = new SRSRotation();

  describe('interface compliance', () => {
    it('implements RotationSystem', () => {
      const system: RotationSystem = srs;
      expect(system.getShape).toBeDefined();
      expect(system.getKickOffsets).toBeDefined();
      expect(system.getStateCount).toBeDefined();
    });
  });

  describe('rotation state counts', () => {
    it('every piece has 4 rotation states', () => {
      for (const piece of ALL_PIECE_TYPES) {
        expect(srs.getStateCount(piece)).toBe(4);
      }
    });
  });

  describe('shapes', () => {
    it('every piece/state returns exactly 4 cells', () => {
      for (const piece of ALL_PIECE_TYPES) {
        for (const state of ALL_STATES) {
          const shape = srs.getShape(piece, state);
          expect(shape).toHaveLength(4);
        }
      }
    });

    it('I-piece spawn is horizontal in row 1 of 4×4 box', () => {
      const shape = srs.getShape(PieceType.I, RotationState.SPAWN);
      expect(shape).toEqual([[1, 0], [1, 1], [1, 2], [1, 3]]);
    });

    it('I-piece R is vertical in col 2 of 4×4 box', () => {
      const shape = srs.getShape(PieceType.I, RotationState.R);
      expect(shape).toEqual([[0, 2], [1, 2], [2, 2], [3, 2]]);
    });

    it('O-piece shape is identical in all 4 states', () => {
      const spawn = srs.getShape(PieceType.O, RotationState.SPAWN);
      for (const state of ALL_STATES) {
        expect(srs.getShape(PieceType.O, state)).toEqual(spawn);
      }
    });

    it('T-piece spawn has T shape pointing up', () => {
      const shape = srs.getShape(PieceType.T, RotationState.SPAWN);
      // .X.
      // XXX
      expect(shape).toEqual([[0, 1], [1, 0], [1, 1], [1, 2]]);
    });

    it('T-piece R has T shape pointing right', () => {
      const shape = srs.getShape(PieceType.T, RotationState.R);
      // .X
      // .XX
      // .X
      expect(shape).toEqual([[0, 1], [1, 1], [1, 2], [2, 1]]);
    });

    it('S-piece spawn is S shape', () => {
      const shape = srs.getShape(PieceType.S, RotationState.SPAWN);
      // .XX
      // XX.
      expect(shape).toEqual([[0, 1], [0, 2], [1, 0], [1, 1]]);
    });

    it('Z-piece spawn is Z shape', () => {
      const shape = srs.getShape(PieceType.Z, RotationState.SPAWN);
      // XX.
      // .XX
      expect(shape).toEqual([[0, 0], [0, 1], [1, 1], [1, 2]]);
    });

    it('J-piece spawn has corner in top-left', () => {
      const shape = srs.getShape(PieceType.J, RotationState.SPAWN);
      // X..
      // XXX
      expect(shape).toEqual([[0, 0], [1, 0], [1, 1], [1, 2]]);
    });

    it('L-piece spawn has corner in top-right', () => {
      const shape = srs.getShape(PieceType.L, RotationState.SPAWN);
      // ..X
      // XXX
      expect(shape).toEqual([[0, 2], [1, 0], [1, 1], [1, 2]]);
    });

    it('all rotation states produce distinct shapes for non-O pieces', () => {
      for (const piece of ALL_PIECE_TYPES) {
        if (piece === PieceType.O) continue;
        const shapes = ALL_STATES.map(s => JSON.stringify(srs.getShape(piece, s)));
        const unique = new Set(shapes);
        expect(unique.size).toBe(4);
      }
    });
  });

  describe('JLSTZ kick table', () => {
    const jlstzPieces = [PieceType.J, PieceType.L, PieceType.S, PieceType.T, PieceType.Z];

    // All 8 rotation transitions (4 CW + 4 CCW)
    const transitions: [RotationState, RotationState][] = [
      [RotationState.SPAWN, RotationState.R],
      [RotationState.R, RotationState.TWO],
      [RotationState.TWO, RotationState.L],
      [RotationState.L, RotationState.SPAWN],
      [RotationState.SPAWN, RotationState.L],
      [RotationState.L, RotationState.TWO],
      [RotationState.TWO, RotationState.R],
      [RotationState.R, RotationState.SPAWN],
    ];

    it('has 5 kick offsets for each of the 8 transitions', () => {
      for (const piece of jlstzPieces) {
        for (const [from, to] of transitions) {
          const kicks = srs.getKickOffsets(piece, from, to);
          expect(kicks).toHaveLength(5);
        }
      }
    });

    it('first kick offset is always (0,0) — identity', () => {
      for (const piece of jlstzPieces) {
        for (const [from, to] of transitions) {
          const kicks = srs.getKickOffsets(piece, from, to);
          expect(kicks[0]).toEqual([0, 0]);
        }
      }
    });

    it('all JLSTZ pieces share the same kick offsets for each transition', () => {
      for (const [from, to] of transitions) {
        const reference = srs.getKickOffsets(PieceType.T, from, to);
        for (const piece of jlstzPieces) {
          expect(srs.getKickOffsets(piece, from, to)).toEqual(reference);
        }
      }
    });
  });

  describe('I-piece kick table', () => {
    const transitions: [RotationState, RotationState][] = [
      [RotationState.SPAWN, RotationState.R],
      [RotationState.R, RotationState.TWO],
      [RotationState.TWO, RotationState.L],
      [RotationState.L, RotationState.SPAWN],
      [RotationState.SPAWN, RotationState.L],
      [RotationState.L, RotationState.TWO],
      [RotationState.TWO, RotationState.R],
      [RotationState.R, RotationState.SPAWN],
    ];

    it('has 5 kick offsets for each of the 8 transitions', () => {
      for (const [from, to] of transitions) {
        const kicks = srs.getKickOffsets(PieceType.I, from, to);
        expect(kicks).toHaveLength(5);
      }
    });

    it('first kick offset is always (0,0)', () => {
      for (const [from, to] of transitions) {
        const kicks = srs.getKickOffsets(PieceType.I, from, to);
        expect(kicks[0]).toEqual([0, 0]);
      }
    });

    it('I-piece kicks differ from JLSTZ kicks', () => {
      // At least one transition should have different kicks
      const [from, to] = transitions[0];
      const iKicks = srs.getKickOffsets(PieceType.I, from, to);
      const tKicks = srs.getKickOffsets(PieceType.T, from, to);
      expect(iKicks).not.toEqual(tKicks);
    });

    it('I-piece 0→R kicks match SRS standard values', () => {
      // Reference: SRS standard I-piece kick data (positive x = right, positive y = up)
      const kicks = srs.getKickOffsets(PieceType.I, RotationState.SPAWN, RotationState.R);
      expect(kicks).toEqual([[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]]);
    });

    it('I-piece R→0 kicks are inverse of 0→R', () => {
      const kicks = srs.getKickOffsets(PieceType.I, RotationState.R, RotationState.SPAWN);
      expect(kicks).toEqual([[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]]);
    });
  });

  describe('O-piece kicks', () => {
    it('returns empty kick offsets for all transitions', () => {
      for (const from of ALL_STATES) {
        for (const to of ALL_STATES) {
          if (from === to) continue;
          expect(srs.getKickOffsets(PieceType.O, from, to)).toEqual([]);
        }
      }
    });
  });
});

describe('NRSRotation', () => {
  const nrs = new NRSRotation();

  describe('interface compliance', () => {
    it('implements RotationSystem', () => {
      const system: RotationSystem = nrs;
      expect(system.getShape).toBeDefined();
      expect(system.getKickOffsets).toBeDefined();
      expect(system.getStateCount).toBeDefined();
    });
  });

  describe('rotation state counts', () => {
    it('I has 2 rotation states', () => {
      expect(nrs.getStateCount(PieceType.I)).toBe(2);
    });

    it('S has 2 rotation states', () => {
      expect(nrs.getStateCount(PieceType.S)).toBe(2);
    });

    it('Z has 2 rotation states', () => {
      expect(nrs.getStateCount(PieceType.Z)).toBe(2);
    });

    it('J has 4 rotation states', () => {
      expect(nrs.getStateCount(PieceType.J)).toBe(4);
    });

    it('L has 4 rotation states', () => {
      expect(nrs.getStateCount(PieceType.L)).toBe(4);
    });

    it('T has 4 rotation states', () => {
      expect(nrs.getStateCount(PieceType.T)).toBe(4);
    });

    it('O has 1 rotation state', () => {
      expect(nrs.getStateCount(PieceType.O)).toBe(1);
    });
  });

  describe('shapes', () => {
    it('every piece/state returns exactly 4 cells', () => {
      for (const piece of ALL_PIECE_TYPES) {
        const count = nrs.getStateCount(piece);
        for (let s = 0; s < count; s++) {
          const shape = nrs.getShape(piece, s as RotationState);
          expect(shape).toHaveLength(4);
        }
      }
    });

    it('I-piece toggles between horizontal and vertical', () => {
      const horiz = nrs.getShape(PieceType.I, RotationState.SPAWN);
      const vert = nrs.getShape(PieceType.I, RotationState.R);
      // Horizontal: all same row
      const horizRows = new Set(horiz.map(c => c[0]));
      expect(horizRows.size).toBe(1);
      // Vertical: all same col
      const vertCols = new Set(vert.map(c => c[1]));
      expect(vertCols.size).toBe(1);
    });

    it('O-piece has a single state', () => {
      const shape = nrs.getShape(PieceType.O, RotationState.SPAWN);
      expect(shape).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    });

    it('O-piece wraps higher states back to state 0', () => {
      const spawn = nrs.getShape(PieceType.O, RotationState.SPAWN);
      expect(nrs.getShape(PieceType.O, RotationState.R)).toEqual(spawn);
      expect(nrs.getShape(PieceType.O, RotationState.TWO)).toEqual(spawn);
      expect(nrs.getShape(PieceType.O, RotationState.L)).toEqual(spawn);
    });

    it('2-state pieces wrap state 2 back to state 0', () => {
      for (const piece of [PieceType.I, PieceType.S, PieceType.Z]) {
        const spawn = nrs.getShape(piece, RotationState.SPAWN);
        expect(nrs.getShape(piece, RotationState.TWO)).toEqual(spawn);
      }
    });

    it('S-piece spawn is S-shaped', () => {
      const shape = nrs.getShape(PieceType.S, RotationState.SPAWN);
      expect(shape).toEqual([[0, 1], [0, 2], [1, 0], [1, 1]]);
    });

    it('Z-piece spawn is Z-shaped', () => {
      const shape = nrs.getShape(PieceType.Z, RotationState.SPAWN);
      expect(shape).toEqual([[0, 0], [0, 1], [1, 1], [1, 2]]);
    });

    it('T-piece has 4 distinct shapes', () => {
      const shapes = ALL_STATES.map(s => JSON.stringify(nrs.getShape(PieceType.T, s)));
      expect(new Set(shapes).size).toBe(4);
    });

    it('J-piece has 4 distinct shapes', () => {
      const shapes = ALL_STATES.map(s => JSON.stringify(nrs.getShape(PieceType.J, s)));
      expect(new Set(shapes).size).toBe(4);
    });

    it('L-piece has 4 distinct shapes', () => {
      const shapes = ALL_STATES.map(s => JSON.stringify(nrs.getShape(PieceType.L, s)));
      expect(new Set(shapes).size).toBe(4);
    });
  });

  describe('kick offsets', () => {
    it('returns empty array for all pieces and transitions', () => {
      for (const piece of ALL_PIECE_TYPES) {
        for (const from of ALL_STATES) {
          for (const to of ALL_STATES) {
            if (from === to) continue;
            expect(nrs.getKickOffsets(piece, from, to)).toEqual([]);
          }
        }
      }
    });
  });
});

describe('both systems', () => {
  it('implement the same RotationSystem interface', () => {
    const srs: RotationSystem = new SRSRotation();
    const nrs: RotationSystem = new NRSRotation();
    // Both can be assigned to the interface type — TypeScript enforces this at compile time
    // Runtime check: both have the same methods
    expect(typeof srs.getShape).toBe('function');
    expect(typeof srs.getKickOffsets).toBe('function');
    expect(typeof srs.getStateCount).toBe('function');
    expect(typeof nrs.getShape).toBe('function');
    expect(typeof nrs.getKickOffsets).toBe('function');
    expect(typeof nrs.getStateCount).toBe('function');
  });

  it('both define shapes for all 7 piece types', () => {
    const srs = new SRSRotation();
    const nrs = new NRSRotation();
    for (const piece of ALL_PIECE_TYPES) {
      expect(srs.getShape(piece, RotationState.SPAWN)).toHaveLength(4);
      expect(nrs.getShape(piece, RotationState.SPAWN)).toHaveLength(4);
    }
  });
});
