# Implementation Spec: Reference Verification — SRS Rotation and Wall Kicks

**PR:** pr-511ada6
**File:** `packages/shared/src/__tests__/reference-srs.test.ts` (new)

## Requirements

### R1: Validate raw kick table data against the SRS specification

Cross-check the kick offset values returned by `SRSRotation.getKickOffsets()` (defined in `packages/shared/src/engine/rotation-srs.ts:227-257`) against the canonical SRS wall kick data from the Tetris Wiki / Hard Drop Wiki.

This differs from the existing `packages/shared/src/engine/kick-tables.test.ts` which uses **inline snapshots** (regression detection). The reference test must define the expected values as **hardcoded constants derived independently from the SRS specification**, providing an independent oracle rather than a self-referential snapshot.

Specifically:
- All 8 JLSTZ kick transitions (0>1, 1>0, 1>2, 2>1, 2>3, 3>2, 3>0, 0>3), each with 5 offsets
- All 8 I-piece kick transitions, each with 5 offsets
- O-piece: single `[0,0]` offset for any transition
- Verify every JLSTZ piece (J, L, S, T, Z) returns the same kick table (shared table)

**Source code:** `SRSRotation` exported from `rotation-srs.ts:263`, implements `RotationSystem` interface from `rotation.ts:13`. Key method: `getKickOffsets(piece, fromRotation, toRotation)`.

### R2: Validate behavioral outcomes of wall kicks

Test that `tryRotate()` (from `packages/shared/src/engine/movement.ts:83-110`) produces correct results when wall kicks are needed, verifying the kick offsets are applied correctly in the rotation pipeline.

Key behaviors to verify:
- **Kick application**: `gridRow = row - dy`, `gridCol = col + dx` (movement.ts:101-102)
- **Kick priority**: First non-colliding kick in the ordered list wins
- **Kick failure**: All 5 kicks collide → rotation returns null
- **O-piece behavior**: Only `[0,0]` tested, so rotation never shifts position

## Implicit Requirements

### IR1: Coordinate convention consistency

The SRS specification uses (x, y) where +y = up. Our `KickOffset` type (`rotation.ts:11`) is `[dx, dy]` where +x = right, +y = up. The `tryRotate` function converts: `kickRow = row - dy` (up = negative row), `kickCol = col + dx`. Tests must verify this conversion is correct — a sign error here would pass data tests but fail behavioral tests.

### IR2: Kick table derivation method

The TetrisWiki presents SRS kicks via an "offset data" table per rotation state, where the actual kick for A→B is `offset_A[i] - offset_B[i]`. Our code stores the pre-computed final kick values directly. The reference test should encode the expected values as final kick values (matching our storage format) but derived from the wiki's offset data table to serve as an independent cross-check.

### IR3: Shape correctness is a prerequisite

Kick behavioral tests depend on correct piece shapes. Shape validation already exists in `packages/shared/src/engine/piece-data.test.ts`. This test should not duplicate shape validation but may reference shapes via `SRSRotation.getShape()` for setting up behavioral scenarios.

### IR4: All JLSTZ pieces share identical kick data

`rotation-srs.ts:277` selects the kick table based on `piece === "I"` vs JLSTZ. The reference test should verify that all 5 JLSTZ pieces return identical kick offsets for the same transition, confirming the table-sharing logic.

### IR5: Board dimensions

Behavioral tests use `createGrid()` which creates a 10x40 grid (board.ts:14-15). The visible playfield is rows 20-39, buffer zone rows 0-19. Tests should place pieces in the visible zone (row >= 20) for realistic scenarios.

## Ambiguities

### A1: Scope of "behavioral outcomes" — **[RESOLVED]**

The task says "behavioral outcomes" but doesn't specify which scenarios. Resolution: focus on scenarios that exercise each category of kick:
- Basic rotation (no kick needed, test 1 succeeds)
- Left wall kick (piece against left boundary)
- Right wall kick (piece against right boundary)
- Floor kick (piece near bottom, kicks upward)
- Kick blocked by placed pieces (not just walls)
- All kicks fail (rotation denied)
- I-piece specific kicks (wider offsets than JLSTZ)
- Kick priority (verify the Nth kick is used when kicks 1..N-1 are blocked)

### A2: Which piece to use for JLSTZ behavioral tests — **[RESOLVED]**

Since JLSTZ share kick data, behavioral tests can use T-piece as representative. Include one test confirming another JLSTZ piece (e.g., S) behaves identically to verify table sharing.

### A3: Test file location — **[RESOLVED]**

Task specifies `packages/shared/src/__tests__/reference-srs.test.ts`. This is in the `__tests__` directory (cross-cutting tests) rather than `engine/` (unit tests co-located with source). This is appropriate since the test is a reference verification crossing multiple modules (rotation-srs.ts + movement.ts).

## Edge Cases

### E1: Kick near buffer zone boundary

A piece near row 0 (top of the buffer zone) attempting a kick with positive dy (upward) could push `kickRow` negative, which should collide. Verify `tryRotate` returns null when all kicks go out of bounds upward.

### E2: I-piece large kicks

I-piece kicks can shift by up to 2 cells horizontally. Verify the I-piece at col 0 can kick right by 2 (or left by 2 at col 7+). These are the most dramatic kicks in SRS.

### E3: Kick index selection

When kick tests 1-3 are blocked but test 4 succeeds, verify the returned position matches kick 4's offset — not an earlier or later one. This confirms the ordered iteration in `tryRotate` (movement.ts:99-106).

### E4: Reverse rotation symmetry

For JLSTZ, the kick offsets for reverse transitions (e.g., 0>1 vs 1>0) are negations of each other. This is a structural property of the SRS offset table that should be verified.

## Implementation Plan

1. **Reference data constants**: Define `REFERENCE_JLSTZ_KICKS` and `REFERENCE_I_KICKS` as plain objects, with values derived from the SRS specification's offset data tables.

2. **Data validation suite** (`describe("SRS kick table data — reference verification")`):
   - Assert each transition's kick offsets match the reference exactly (deep equality, not snapshots)
   - Assert all JLSTZ pieces return identical offsets
   - Assert O-piece returns `[[0,0]]` for all transitions
   - Assert every transition has exactly 5 kick tests (I/JLSTZ) or 1 (O)
   - Assert test 1 is always `[0,0]`

3. **Behavioral validation suite** (`describe("SRS wall kick behavior — reference verification")`):
   - Basic rotation without kick
   - Wall kick scenarios (left, right, floor)
   - I-piece specific kicks
   - Kick priority / index selection
   - All-kicks-fail scenario
   - O-piece position invariance
