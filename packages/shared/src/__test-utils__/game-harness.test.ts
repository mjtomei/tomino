import { describe, expect, it } from "vitest";
import { GameTestHarness } from "./game-harness.js";
import { modernRuleSet, classicRuleSet, customRuleSet } from "../engine/rulesets.js";

describe("GameTestHarness", () => {
  describe("initialization", () => {
    it("initializes with correct defaults", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const state = harness.state;

      expect(state.tick).toBe(0);
      expect(state.score).toBe(0);
      expect(state.level).toBe(1);
      expect(state.linesCleared).toBe(0);
      expect(state.isGameOver).toBe(false);
      expect(state.holdPiece).toBeNull();
      expect(state.holdUsed).toBe(false);
      expect(state.pendingGarbage).toEqual([]);
    });

    it("spawns an active piece on creation", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const state = harness.state;

      expect(state.activePiece).not.toBeNull();
      expect(state.activePiece!.rotation).toBe(0);
    });

    it("populates the next queue", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const state = harness.state;

      // Modern ruleset has previewCount = 5
      expect(state.nextQueue.length).toBe(5);
    });

    it("calculates ghost piece position", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const state = harness.state;

      expect(state.ghostY).not.toBeNull();
      expect(state.ghostY!).toBeGreaterThan(state.activePiece!.y);
    });

    it("respects custom startLevel", () => {
      const harness = new GameTestHarness({ seed: 42, startLevel: 5 });
      expect(harness.state.level).toBe(5);
    });

    it("respects custom ruleSet", () => {
      const harness = new GameTestHarness({
        seed: 42,
        ruleSet: classicRuleSet(),
      });
      const state = harness.state;

      // Classic ruleset: previewCount = 1, no hold, no hard drop
      expect(state.nextQueue.length).toBe(1);
    });
  });

  describe("input()", () => {
    it("moves piece left", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const before = harness.state.activePiece!.x;

      harness.input("moveLeft");
      expect(harness.state.activePiece!.x).toBe(before - 1);
    });

    it("moves piece right", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const before = harness.state.activePiece!.x;

      harness.input("moveRight");
      expect(harness.state.activePiece!.x).toBe(before + 1);
    });

    it("soft drops piece down by one", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const before = harness.state.activePiece!.y;

      harness.input("softDrop");
      expect(harness.state.activePiece!.y).toBe(before + 1);
    });

    it("awards soft drop points", () => {
      const harness = new GameTestHarness({ seed: 42 });

      harness.input("softDrop");
      expect(harness.state.score).toBe(1);
    });

    it("rotates piece CW", () => {
      const harness = new GameTestHarness({ seed: 42 });

      harness.input("rotateCW");
      expect(harness.state.activePiece!.rotation).toBe(1);
    });

    it("rotates piece CCW", () => {
      const harness = new GameTestHarness({ seed: 42 });

      harness.input("rotateCCW");
      expect(harness.state.activePiece!.rotation).toBe(3);
    });

    it("hard drops and locks piece", () => {
      const harness = new GameTestHarness({ seed: 42 });

      harness.input("hardDrop");

      // After hard drop, a new piece should be spawned
      const state = harness.state;
      expect(state.score).toBeGreaterThan(0); // hard drop awards points
      // The piece type may or may not change (depends on seed), but the piece
      // should be at spawn position
      expect(state.activePiece).not.toBeNull();
      expect(state.activePiece!.rotation).toBe(0);
    });

    it("hold swaps piece", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const firstPiece = harness.state.activePiece!.type;

      harness.input("hold");

      const state = harness.state;
      expect(state.holdPiece).toBe(firstPiece);
      expect(state.holdUsed).toBe(true);
      // New piece should be different (came from queue)
      expect(state.activePiece).not.toBeNull();
    });

    it("hold is blocked when already used this drop", () => {
      const harness = new GameTestHarness({ seed: 42 });

      harness.input("hold");
      const afterFirstHold = harness.state.activePiece!.type;

      harness.input("hold"); // should be no-op
      expect(harness.state.activePiece!.type).toBe(afterFirstHold);
    });

    it("hold is no-op when disabled in ruleset", () => {
      const harness = new GameTestHarness({
        seed: 42,
        ruleSet: classicRuleSet(), // holdEnabled = false
      });
      const firstPiece = harness.state.activePiece!.type;

      harness.input("hold");
      expect(harness.state.activePiece!.type).toBe(firstPiece);
      expect(harness.state.holdPiece).toBeNull();
    });

    it("is no-op when game is over", () => {
      const harness = new GameTestHarness({ seed: 42 });

      // Force game over by filling the board — hard drop many pieces
      for (let i = 0; i < 200; i++) {
        if (harness.state.isGameOver) break;
        harness.input("hardDrop");
      }

      expect(harness.state.isGameOver).toBe(true);
      const stateAfterGameOver = harness.state;

      harness.input("moveLeft");
      // State should not change
      expect(harness.state.score).toBe(stateAfterGameOver.score);
    });
  });

  describe("inputs()", () => {
    it("applies actions in order", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const startX = harness.state.activePiece!.x;

      harness.inputs(["moveLeft", "moveLeft", "moveRight"]);

      // Net effect: one left
      expect(harness.state.activePiece!.x).toBe(startX - 1);
    });

    it("applies empty action list without error", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const before = harness.state;

      harness.inputs([]);
      expect(harness.state.activePiece!.x).toBe(before.activePiece!.x);
    });
  });

  describe("state", () => {
    it("returns a snapshot after each input", () => {
      const harness = new GameTestHarness({ seed: 42 });

      const s1 = harness.state;
      harness.input("moveLeft");
      const s2 = harness.state;

      // Snapshots should be independent objects
      expect(s1).not.toBe(s2);
      expect(s1.activePiece!.x).not.toBe(s2.activePiece!.x);
    });

    it("board is a deep copy (mutations do not affect engine)", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const state = harness.state;

      // Mutate the snapshot's board
      state.board[0]![0] = "T";

      // Engine's state should be unaffected
      const freshState = harness.state;
      expect(freshState.board[0]![0]).toBeNull();
    });
  });

  describe("tick() and tickUntil()", () => {
    it("tick advances the tick counter", () => {
      const harness = new GameTestHarness({ seed: 42 });

      harness.tick(5);
      expect(harness.state.tick).toBe(5);
    });

    it("tickUntil stops when predicate is true", () => {
      const harness = new GameTestHarness({ seed: 42 });

      const ticksAdvanced = harness.tickUntil((s) => s.tick >= 10);
      expect(harness.state.tick).toBe(10);
      expect(ticksAdvanced).toBe(10);
    });

    it("tickUntil respects maxTicks limit", () => {
      const harness = new GameTestHarness({ seed: 42 });

      const ticksAdvanced = harness.tickUntil(() => false, 50);
      expect(ticksAdvanced).toBe(50);
      expect(harness.state.tick).toBe(50);
    });

    it("tickUntil can advance until piece locks via gravity + lock delay", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const startY = harness.state.activePiece!.y;

      // Tick until the active piece has moved down (gravity) and a new one spawns at
      // the spawn row — detect via the Y position resetting after a lock
      let pieceLocked = false;
      const ticksAdvanced = harness.tickUntil((s) => {
        if (s.activePiece !== null && s.activePiece.y === startY && s.tick > 1) {
          // A piece is back at the spawn row after ticks have passed — a lock happened
          pieceLocked = true;
          return true;
        }
        return false;
      });

      expect(pieceLocked).toBe(true);
      expect(ticksAdvanced).toBeGreaterThan(0);
      expect(ticksAdvanced).toBeLessThan(10_000);
    });

    it("gravity drops piece over time", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const startY = harness.state.activePiece!.y;

      // Tick enough for at least one gravity drop (modern L1 = ~800ms = ~48 ticks)
      harness.tick(60);

      expect(harness.state.activePiece!.y).toBeGreaterThan(startY);
    });
  });

  describe("addGarbage()", () => {
    it("queues garbage to pending", () => {
      const harness = new GameTestHarness({ seed: 42 });

      harness.addGarbage([{ lines: 2, gapColumn: 3 }]);
      expect(harness.state.pendingGarbage).toEqual([
        { lines: 2, gapColumn: 3 },
      ]);
    });

    it("garbage is inserted after piece lock", () => {
      const harness = new GameTestHarness({ seed: 42 });

      harness.addGarbage([{ lines: 1, gapColumn: 5 }]);
      harness.input("hardDrop");

      // After lock, garbage should be inserted (pendingGarbage cleared)
      expect(harness.state.pendingGarbage).toEqual([]);
      // The bottom row should have the garbage (with a gap at column 5)
      const bottomRow = harness.state.board[harness.state.board.length - 1]!;
      expect(bottomRow[5]).toBeNull(); // gap
      // At least some cells should be filled (garbage)
      const filledCount = bottomRow.filter((c) => c !== null).length;
      expect(filledCount).toBe(9); // 10 - 1 gap
    });
  });

  describe("determinism", () => {
    it("same seed + inputs produce identical state", () => {
      function runGame(seed: number) {
        const harness = new GameTestHarness({ seed });
        harness.inputs(["moveLeft", "moveLeft", "rotateCW", "hardDrop"]);
        harness.inputs(["moveRight", "moveRight", "moveRight", "hardDrop"]);
        harness.inputs(["rotateCCW", "hardDrop"]);
        return harness.state;
      }

      const state1 = runGame(12345);
      const state2 = runGame(12345);

      expect(state1.board).toEqual(state2.board);
      expect(state1.score).toBe(state2.score);
      expect(state1.level).toBe(state2.level);
      expect(state1.linesCleared).toBe(state2.linesCleared);
      expect(state1.activePiece).toEqual(state2.activePiece);
      expect(state1.nextQueue).toEqual(state2.nextQueue);
      expect(state1.holdPiece).toBe(state2.holdPiece);
      expect(state1.ghostY).toBe(state2.ghostY);
    });

    it("different seeds produce different state", () => {
      function runGame(seed: number) {
        const harness = new GameTestHarness({ seed });
        harness.inputs(["hardDrop", "hardDrop", "hardDrop"]);
        return harness.state;
      }

      const state1 = runGame(1);
      const state2 = runGame(999);

      // Very unlikely for different seeds to produce identical boards
      expect(state1.board).not.toEqual(state2.board);
    });

    it("tick-based simulation is deterministic", () => {
      function runWithTicks(seed: number) {
        const harness = new GameTestHarness({ seed });
        harness.tick(100);
        harness.input("moveLeft");
        harness.tick(100);
        harness.input("hardDrop");
        return harness.state;
      }

      const state1 = runWithTicks(42);
      const state2 = runWithTicks(42);

      expect(state1.board).toEqual(state2.board);
      expect(state1.score).toBe(state2.score);
      expect(state1.tick).toBe(state2.tick);
    });
  });

  describe("state transitions", () => {
    it("piece lock → line clear → next piece spawn", () => {
      // Use a custom ruleset with instant lock for predictable behavior
      const ruleSet = customRuleSet(modernRuleSet(), { lockDelay: 0 });
      const harness = new GameTestHarness({ seed: 42, ruleSet });

      // Hard drop several pieces to try to fill lines
      for (let i = 0; i < 10; i++) {
        if (harness.state.isGameOver) break;
        harness.input("hardDrop");
      }

      // Verify we went through multiple piece spawns
      // After 10 hard drops, tick should still be 0 (hard drops are instant)
      expect(harness.state.tick).toBe(0);
      // Score should have accumulated from hard drops
      expect(harness.state.score).toBeGreaterThan(0);
    });

    it("hold → spawn from queue when hold is empty", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const firstPiece = harness.state.activePiece!.type;
      const expectedFromQueue = harness.state.nextQueue[0];

      harness.input("hold");

      expect(harness.state.holdPiece).toBe(firstPiece);
      // The new active piece should be what was next in queue
      expect(harness.state.activePiece!.type).toBe(expectedFromQueue);
    });

    it("hold → swap when hold has a piece", () => {
      const harness = new GameTestHarness({ seed: 42 });
      const firstPiece = harness.state.activePiece!.type;

      // Hold the first piece
      harness.input("hold");
      const secondPiece = harness.state.activePiece!.type;

      // Lock the second piece to reset holdUsed
      harness.input("hardDrop");

      // Now hold again — should get firstPiece back
      const thirdPiece = harness.state.activePiece!.type;
      harness.input("hold");
      expect(harness.state.activePiece!.type).toBe(firstPiece);
      expect(harness.state.holdPiece).toBe(thirdPiece);
    });
  });
});
