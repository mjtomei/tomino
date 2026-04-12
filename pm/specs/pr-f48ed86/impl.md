# Implementation Spec: Snapshot Tests for Piece Shapes and SRS Kick Tables

## Requirements

### R1: Inline snapshot tests for all SRS piece shapes (28 snapshots)
- File: `packages/shared/src/engine/piece-data.test.ts`
- Import `SRSRotation` from `./rotation-srs.js` and `ALL_PIECES`/`ALL_ROTATIONS` from `./pieces.js`
- For each of the 7 piece types (I, O, T, S, Z, J, L) x 4 rotations (0, 1, 2, 3), call `SRSRotation.getShape(piece, rotation)` and assert with `toMatchInlineSnapshot()`
- 28 individual inline snapshots lock down every SRS piece shape

### R2: Inline snapshot tests for NRS piece shapes
- Same file: `piece-data.test.ts`
- Import `NRSRotation` from `./rotation-nrs.js`
- For each piece, snapshot all rotation states (variable count: I=2, O=1, S=2, Z=2, T=4, J=4, L=4 = 21 states)
- Use `NRSRotation.getRotationCount(piece)` to determine how many rotations to snapshot

### R3: Inline snapshot tests for SRS kick offset tables
- File: `packages/shared/src/engine/kick-tables.test.ts`
- Import `SRSRotation` from `./rotation-srs.js`
- Snapshot JLSTZ kick offsets for all 8 transitions (0>1, 1>0, 1>2, 2>1, 2>3, 3>2, 3>0, 0>3) — use T-piece as representative since all JLSTZ share the same table
- Snapshot I-piece kick offsets for all 8 transitions separately
- Snapshot O-piece kick offsets (single [0,0])

### R4: NRS kick offsets (if applicable)
- NRS has no wall kicks — always returns `[[0,0]]`
- A single snapshot test confirming this is sufficient

## Implicit Requirements

- Tests use `vitest` (`describe`, `it`, `expect` from "vitest") — consistent with all existing test files
- Imports use `.js` extension (ESM style), matching existing codebase convention
- Each snapshot is individual per piece/rotation (not grouped per piece) to make diffs precise — 28 SRS shape snapshots, not 7
- Inline snapshots require running `vitest --update` to populate the snapshot strings initially

## Ambiguities

1. **Individual vs grouped snapshots for shapes**: The task says "28 snapshots" (7x4), implying one snapshot per piece-per-rotation for SRS. The existing `pieces.test.ts` groups all 4 rotations of a piece into one snapshot. **Resolution**: Use individual snapshots per rotation as implied by the "28 snapshots" count — this gives more precise diffs when a single rotation changes.

2. **Relationship to existing `pieces.test.ts`**: The existing file already has external snapshot tests. **Resolution**: The new files are additive — they provide inline snapshots that are self-contained (no external `.snap` file dependency). The existing `pieces.test.ts` retains its behavioral tests and external snapshots. No changes to existing files.

3. **Kick table test file naming**: Task says `kick-tables.test.ts` — this tests data accessed through the `RotationSystem` interface (there are no standalone exported kick table constants). **Resolution**: Use `SRSRotation.getKickOffsets()` and `NRSRotation.getKickOffsets()` to access the kick data.

## Edge Cases

- **O-piece SRS rotations**: All 4 rotation states are identical `[[1,1],[1,1]]`. Still snapshot all 4 individually since the task says 7x4=28.
- **NRS rotation wrapping**: `NRSRotation.getShape("I", 2)` wraps to state 0 via `rotation % count`. Snapshot only the distinct states (0..count-1) per piece.
- **NRS O-piece**: Only 1 rotation state. Single snapshot.
