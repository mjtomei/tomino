# Implementation Spec: State Transition Assertion Helpers

## Overview

Add focused assertion helpers in `packages/shared/src/__test-utils__/assertions.ts` that verify
engine state transitions. These compose with the existing board builder (`boardFromAscii`, `boardToAscii`,
`assertBoardEquals`) and game harness (`GameTestHarness`) to make transition tests readable and specific.

## Requirements

### R1: `assertLinesCleared(before, after, expectedCount)`
- **Params**: `before: GameStateSnapshot`, `after: GameStateSnapshot`, `expectedCount: number`
- Asserts `after.linesCleared - before.linesCleared === expectedCount`
- On mismatch, throws a descriptive error including expected count, actual delta, and both `linesCleared` values.
- Source types: `GameStateSnapshot.linesCleared` (`packages/shared/src/types.ts:113`)

### R2: `assertPieceLocked(state, expectedCells)`
- **Params**: `state: GameStateSnapshot`, `expectedCells: Array<{ row: number; col: number; type: PieceType }>`
- Asserts that each expected cell in `state.board` matches the given `type` (i.e., the piece was placed there).
- On mismatch, throws a descriptive error listing which cells don't match (expected vs actual).
- Board is `Board = Cell[][]` row-major (`packages/shared/src/types.ts:37`). Access: `state.board[row][col]`.

### R3: `assertGarbageInserted(before, after, batch)`
- **Params**: `before: GameStateSnapshot`, `after: GameStateSnapshot`, `batch: GarbageBatch`
- Asserts that `batch.lines` garbage rows were added at the bottom of the board.
- Each garbage row should be fully filled except for the gap column (`batch.gapColumn`), which should be `null`.
- The rows above the garbage should be the old rows shifted up by `batch.lines`.
- On mismatch, throws a descriptive error explaining what's wrong.
- `GarbageBatch` has `lines: number` and `gapColumn: number` (`packages/shared/src/types.ts:88-94`).

### R4: `assertSpawnedPiece(state, expectedType)`
- **Params**: `state: GameStateSnapshot`, `expectedType: PieceType`
- Asserts `state.activePiece !== null` and `state.activePiece.type === expectedType`.
- On mismatch, throws a descriptive error (no active piece, or wrong type).
- `PieceState.type` is `PieceType` (`packages/shared/src/types.ts:11-23`).

### R5: Export from index
- All four helpers must be exported from `packages/shared/src/__test-utils__/index.ts`.

### R6: Tests in `assertions.test.ts`
- Each helper correctly passes on valid transitions.
- Each helper throws descriptive errors on mismatches.
- Composability test: chain multiple assertions for a full lock→clear→garbage→spawn cycle.

## Implicit Requirements

1. **Type compatibility**: The assertions take `GameStateSnapshot` (from `types.ts`), not `Grid` (from `engine/board.ts`). Both `Board` and `Grid` are `Cell[][]`, so they're structurally compatible, but imports should reference the public types.

2. **Error messages must be descriptive**: The task explicitly requires "descriptive errors on mismatches." Each error message should include enough context to diagnose the failure without re-running with a debugger.

3. **No dependency on vitest internals**: The assertion helpers should throw plain `Error` objects (not use `expect`). This makes them framework-agnostic and composable — test files will use them directly and catch their throws with `expect(() => ...).toThrow()`.

4. **Board dimensions**: `BOARD_TOTAL_HEIGHT = 40`, `BOARD_WIDTH = 10`. The buffer zone (rows 0-19) is above the visible area (rows 20-39). Garbage rows are inserted at the bottom (high row indices).

5. **Immutability**: Assertion helpers must not mutate any state objects passed to them.

## Ambiguities

### A1: `assertPieceLocked` — what about cells NOT in expectedCells?
**Resolution**: Only check the specified cells. The helper verifies that specific board positions contain the expected piece type. It does NOT assert that no other cells changed — that would require a full board diff which is the job of `assertBoardEquals`.

### A2: `assertGarbageInserted` — how strict is the "shifted up" check?
**Resolution**: Compare the top `BOARD_TOTAL_HEIGHT - batch.lines` rows of `after.board` against the bottom `BOARD_TOTAL_HEIGHT - batch.lines` rows of `before.board` shifted up. This verifies the existing board content was preserved and shifted. The bottom `batch.lines` rows should be garbage rows (all filled except gap column). For the gap column check, any non-null `PieceType` value counts as "filled" (garbage uses a specific type internally but we just check non-null).

### A3: `assertGarbageInserted` — what PieceType is used for garbage cells?
**Resolution**: Check that garbage cells are non-null (any `PieceType`). The specific type used by `insertGarbageBatches` is an implementation detail. The gap column should be `null`.

### A4: `assertSpawnedPiece` — should it check spawn position?
**Resolution**: No. Only check piece type. Spawn position depends on the rotation system and piece type, and testing that is the engine's responsibility, not the assertion helper's.

## Edge Cases

1. **`assertLinesCleared` with zero expected**: Should work — verifying no lines were cleared is a valid assertion.

2. **`assertPieceLocked` with empty expectedCells**: Should pass trivially (no cells to check). This is technically valid but useless — not worth special-casing.

3. **`assertGarbageInserted` with multi-line batch**: Must verify all `batch.lines` garbage rows, not just one.

4. **`assertSpawnedPiece` when `activePiece` is null**: Should throw with a clear message like "Expected active piece of type X but no piece is active."

5. **`assertGarbageInserted` rows shifted off the top**: When garbage pushes rows up, the top rows of the before-board are lost. The comparison should only check the rows that remain.

6. **Board with existing content in buffer zone**: The assertions should work correctly regardless of whether the buffer zone has content.
