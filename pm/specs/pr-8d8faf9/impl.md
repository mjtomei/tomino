# Implementation Spec: Game State Factory Helpers

## Requirements

### R1: `makeGameState(overrides?)`
Create a valid `GameStateSnapshot` (defined in `packages/shared/src/types.ts:100-118`) with sensible defaults. Accepts `Partial<GameStateSnapshot>` overrides that are spread over defaults.

**Defaults:**
- `tick: 0`
- `board`: empty 10x40 grid (matches `BOARD_WIDTH` x `BOARD_TOTAL_HEIGHT` from `types.ts:39-42`)
- `activePiece: null`
- `ghostY: null`
- `nextQueue: []`
- `holdPiece: null`
- `holdUsed: false`
- `score: 0`
- `level: 1`
- `linesCleared: 0`
- `pendingGarbage: []`
- `isGameOver: false`

### R2: `makePiece(type, overrides?)`
Create a valid `PieceState` (defined in `types.ts:16-23`) for a given `PieceType`. Accepts optional `Partial<Omit<PieceState, 'type'>>` overrides.

**Defaults:**
- `type`: required parameter
- `x: 3` (standard spawn column for most pieces — centers a 4-wide bounding box on a 10-wide board)
- `y: 0` (top of visible area)
- `rotation: 0` (spawn orientation)

### R3: `makeGarbageBatch(overrides?)`
Create a valid `GarbageBatch` (defined in `types.ts:89-94`) with sensible defaults.

**Defaults:**
- `lines: 1`
- `gapColumn: 0`

### R4: Files
- `packages/shared/src/__test-utils__/factories.ts` — factory implementations
- `packages/shared/src/__test-utils__/factories.test.ts` — tests
- `packages/shared/src/__test-utils__/index.ts` — barrel export

### R5: Tests
1. Defaults produce valid objects (correct types, correct board dimensions)
2. Overrides are applied correctly
3. Board dimensions are correct (10 wide, 40 tall)
4. Factory objects are independent (no shared references between calls)

## Implicit Requirements

### IR1: Board construction must match `Board` type from `types.ts`
`Board = Row[] = Cell[][]` where `Cell = PieceType | null`. The factory board must be `BOARD_TOTAL_HEIGHT` rows of `BOARD_WIDTH` null cells each. Must import constants from `types.ts` (not `engine/board.ts`) since the factory produces `GameStateSnapshot` objects which use the `types.ts` Board type.

### IR2: No shared mutable state between factory calls
Each call to `makeGameState()` must produce a fresh board array (and fresh row arrays). Two calls must not share array references. Similarly for `pendingGarbage` and `nextQueue` arrays.

### IR3: TypeScript strict mode compliance
The project uses `strict: true` with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`. However, test files are excluded from `tsconfig.json` compilation (`exclude: ["src/**/*.test.ts"]`). The factory source file (`factories.ts`) is NOT a test file and will be compiled, so it must pass strict checks. But since it's in `__test-utils__/` and not re-exported from the package `index.ts`, it's only imported by tests.

### IR4: Module resolution
Project uses `"moduleResolution": "nodenext"` which requires `.js` extensions in imports.

## Ambiguities

### A1: Board type — `Board` vs `Grid`
**Resolution:** Use `Board` (from `types.ts`) since `GameStateSnapshot` uses `Board`. The `Grid` type from `engine/board.ts` is the same shape but is the engine-internal type. Import `BOARD_WIDTH`, `BOARD_TOTAL_HEIGHT` from `../types.js`.

### A2: `makePiece` — should `type` be optional with a default?
The task says `makePiece(type, overrides?)`. **Resolution:** Keep `type` as required first parameter per the task description. This makes test intent clearer — you always know what piece you're creating.

### A3: Should `createGrid()` from `engine/board.ts` be reused?
**Resolution:** No — implement a simple inline board builder. The engine's `createGrid()` returns `Grid` (not `Board`), and importing engine internals from test utilities creates an unnecessary coupling. A simple `Array.from` loop is sufficient.

### A4: Should the `__test-utils__` directory be added to tsconfig excludes?
**Resolution:** No. The factory source is valid compilable TypeScript. Only the `.test.ts` file needs exclusion, and `src/**/*.test.ts` already covers it.

## Edge Cases

### E1: Override with nested objects
If a caller passes `makeGameState({ board: customBoard })`, the override replaces the entire board — no deep merge. This is the standard pattern used elsewhere (see `garbage.test.ts:31-42`).

### E2: Override `pendingGarbage` with populated array
Callers may pass `makeGameState({ pendingGarbage: [makeGarbageBatch()] })`. The factories should compose cleanly.

### E3: `level` default of 1 vs 0
Tetris levels are conventionally 1-indexed. Default to `level: 1` matching the existing test fixture in `messages.test.ts:85`.
