# Garbage Mechanics Engine — Implementation Spec

## Requirements

### R1: Garbage sent calculation (`src/engine/garbage.ts`)
Map line clears to garbage lines sent, using a `GarbageTable`:
- 1 line → 0 garbage
- 2 lines → 1 garbage
- 3 lines → 2 garbage
- 4 lines (Tetris) → 4 garbage

Consume `LineClearCount` and `TSpinType` from `scoring.ts`.
Return a numeric garbage-sent count.

### R2: T-spin garbage bonuses (`src/engine/garbage.ts`)
T-spin clears send extra garbage:
- T-spin single → 2 garbage
- T-spin double → 4 garbage
- T-spin triple → 6 garbage

Use the existing `TSpinType` ("none" | "mini" | "full") from `scoring.ts`.
Mini T-spins: the task description says "T-spin bonuses" without specifying mini.
Resolution: mini T-spins send 0 garbage (only full T-spins get the bonus table).
This matches standard Guideline behavior.

### R3: Back-to-back bonus (`src/engine/garbage.ts`)
Consecutive "difficult" clears (Tetrises or T-spins that clear lines) add +1 garbage.
Reuse the same `isDifficultClear` logic from `scoring-guideline.ts`:
a clear is "difficult" if `linesCleared === 4 || tSpin !== "none"` (with lines > 0).

The garbage engine needs its own B2B tracking state (separate from scoring B2B),
or it can accept the current B2B counter from `ScoringState`. Resolution: accept
the B2B counter value as a parameter — the caller already tracks it in `ScoringState.b2b`.
If `b2b > 0` (meaning this is at least the second consecutive difficult clear), add +1.

### R4: Combo table (`src/engine/garbage-table.ts`)
Escalating garbage for consecutive line clears. Standard Guideline combo table:
- Combo 0: 0 bonus
- Combo 1: 1
- Combo 2: 1
- Combo 3: 2
- Combo 4: 2
- Combo 5: 3
- Combo 6: 3
- Combo 7+: 4

Combo counter semantics match `ScoringState.combo`: -1 = inactive, 0 = first clear
in a streak (no bonus), 1+ = subsequent clears. The combo garbage is additive to
line-clear garbage.

### R5: Garbage receiving — row insertion (`src/engine/garbage.ts`)
Insert gray rows at the bottom of the board:
- Each garbage row is fully filled except for one gap column
- Gap column is specified per `GarbageBatch` (already defined in `types.ts`)
- Existing rows push up
- Rows pushed above the buffer zone (row 0) are discarded

The cell value for garbage rows: use a sentinel. Resolution: use `"G"` as a new
`Cell` value for garbage cells. However, `Cell` is currently `PieceType | null`,
and `PieceType` is a union of piece letters. Adding "G" would require changing
core types. Alternative: use an existing `PieceType` value like `"Z"` (gray-ish).
Better resolution: garbage rows are filled with a random piece type or a fixed one.
Standard practice is to use a distinct gray color. Since the engine is data-only
and rendering is client-side, we can use `"G"` — but this requires extending the
`Cell` type.

**Final resolution**: Keep `Cell = PieceType | null` unchanged. Introduce a
`GarbageCell` constant (e.g., `"S"` or any `PieceType`) that the garbage module
uses as a fill value. The caller can override this. This avoids touching core types.
Actually, the simplest approach: add an optional `cellType` to `GarbageBatch` or
just use a constant `GARBAGE_CELL: PieceType = "Z"` in the garbage module. The
visual representation is a rendering concern. Use a dedicated export constant
`GARBAGE_CELL_TYPE: PieceType = "Z"` that the client can map to gray.

### R6: Shared types (`shared/garbage-types.ts`)
The task says to create `shared/garbage-types.ts`. Since the project uses
`packages/shared/src/` structure, this will be `packages/shared/src/engine/garbage-types.ts`.
`GarbageBatch` already exists in `types.ts`. This file will hold:
- `GarbageState` — mutable state for tracking B2B, combo (if we track our own)
- `GarbageCalcResult` — result of a garbage calculation (lines sent, breakdown)
- Re-export or reference `GarbageBatch` from `types.ts`

### R7: Tests
All in `packages/shared/src/engine/garbage.test.ts`:
1. Garbage sent for each clear type (1→0, 2→1, 3→2, 4→4)
2. T-spin detection and bonus (T-spin single→2, double→4, triple→6)
3. Back-to-back tracking (+1 for consecutive difficult clears)
4. Combo counter and garbage table (escalating values)
5. Garbage row insertion with gap column
6. Board overflow from garbage (rows pushed past top are lost)

## Implicit Requirements

### IR1: Module exports
New modules must be exported from `packages/shared/src/index.ts` so server and
client can import them.

### IR2: Grid mutation semantics
`insertGarbage` must follow the same pattern as `clearLines` — mutate the grid
in place and maintain the 40-row invariant.

### IR3: Determinism
Given the same inputs, garbage calculation must produce identical results.
`GarbageBatch.gapColumn` is provided externally (the caller decides the gap),
so the garbage module itself is fully deterministic.

### IR4: Independence from scoring system
The garbage engine should work independently of which scoring system is active.
It takes `LineClearCount`, `TSpinType`, combo counter, and B2B counter as inputs.
NES mode typically has no garbage (single-player), but the garbage module should
still be callable — the caller decides whether to use it.

### IR5: State transition ordering
Garbage insertion happens AFTER line clears, matching the existing
`GameStateSnapshot.pendingGarbage` description: "Pending garbage that will be
inserted after the current piece locks." The sequence is:
piece lock → line clear → garbage sent calculation → pending garbage insertion → next piece spawn.

## Ambiguities

### A1: Mini T-spin garbage — **[RESOLVED]**
Task says "T-spin single→2, double→4, triple→6" without mentioning mini T-spins.
**Resolution**: Mini T-spins send 0 garbage (standard Guideline behavior). Only
full T-spins use the bonus table.

### A2: Garbage cell representation — **[RESOLVED]**
No `PieceType` represents garbage. **Resolution**: Export a `GARBAGE_CELL_TYPE`
constant set to a `PieceType` value. The rendering layer maps this to gray. This
avoids changing the `Cell` type union.

### A3: Combo table values — **[RESOLVED]**
Task says "escalating garbage for consecutive line clears" but doesn't specify
exact values. **Resolution**: Use the standard Guideline combo garbage table
(0, 1, 1, 2, 2, 3, 3, 4 for combos 0–7+).

### A4: Perfect clear garbage — **[RESOLVED]**
Task doesn't mention perfect clears. **Resolution**: Not included in this PR.
Perfect clear garbage (10 lines) can be added later if needed.

### A5: Garbage cancellation — **[RESOLVED]**
Task doesn't mention offsetting/cancellation (where outgoing garbage cancels
pending incoming garbage). **Resolution**: Not in scope. The caller handles
cancellation logic at the game loop level, not in the garbage calculation module.

### A6: Where to put files — **[RESOLVED]**
Task says `src/engine/garbage.ts` and `shared/garbage-types.ts`. PR notes say
to build in `packages/shared`. **Resolution**: All files go under
`packages/shared/src/engine/` following the existing module pattern:
- `packages/shared/src/engine/garbage-types.ts`
- `packages/shared/src/engine/garbage-table.ts`
- `packages/shared/src/engine/garbage.ts`
- `packages/shared/src/engine/garbage.test.ts`

## Edge Cases

### E1: Garbage insertion overflow
When garbage rows push existing content above the buffer zone top (row 0),
those rows are silently discarded. This can cause game-over if the active piece
would overlap — but that's the caller's responsibility to detect.

### E2: Empty board garbage insertion
Inserting garbage into an empty board should work correctly — just place garbage
rows at the bottom with empty rows above.

### E3: Combo counter at boundary
Combo counter of -1 (inactive) should produce 0 combo garbage. The first clear
in a streak (combo = 0) also produces 0 combo garbage.

### E4: B2B counter at boundary
B2B counter of -1 or 0 should produce no B2B bonus. Only b2b > 0 adds +1.

### E5: Zero-line clears with T-spin
A T-spin with 0 lines cleared: sends 0 garbage (no lines cleared = no garbage
sent, even though scoring awards points). This matches standard behavior.

### E6: Multiple garbage batches
`pendingGarbage` is an array of `GarbageBatch`. Each batch may have a different
gap column. They should be inserted sequentially (first batch at bottom, then
next batch pushes it up further).

### E7: Gap column bounds
`gapColumn` must be in range [0, BOARD_WIDTH-1]. The insertion function should
not validate this (trust internal code per project conventions), but tests should
verify correct behavior at boundaries (column 0 and column 9).
