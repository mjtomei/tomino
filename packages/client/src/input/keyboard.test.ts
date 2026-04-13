import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KeyboardHandler } from "./keyboard.js";
import type { RuleSet, InputAction } from "@tomino/shared";
import { modernRuleSet, classicRuleSet } from "@tomino/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function press(code: string, target: EventTarget = document): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { code, bubbles: true }),
  );
}

function release(code: string, target: EventTarget = document): void {
  target.dispatchEvent(
    new KeyboardEvent("keyup", { code, bubbles: true }),
  );
}

function pressRepeat(code: string, target: EventTarget = document): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { code, bubbles: true, repeat: true }),
  );
}

interface TestContext {
  handler: KeyboardHandler;
  actions: InputAction[];
  pauseCalls: number;
  resumeCalls: number;
  paused: boolean;
  ruleSet: RuleSet;
}

function setup(ruleSetOverrides: Partial<RuleSet> = {}): TestContext {
  const ruleSet = { ...modernRuleSet(), ...ruleSetOverrides };
  const ctx: TestContext = {
    actions: [],
    pauseCalls: 0,
    resumeCalls: 0,
    paused: false,
    ruleSet,
    handler: null!,
  };

  ctx.handler = new KeyboardHandler({
    ruleSet,
    onAction: (a) => ctx.actions.push(a),
    onPause: () => {
      ctx.pauseCalls++;
      ctx.paused = true;
    },
    onResume: () => {
      ctx.resumeCalls++;
      ctx.paused = false;
    },
    isPaused: () => ctx.paused,
  });

  return ctx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KeyboardHandler", () => {
  let ctx: TestContext;

  afterEach(() => {
    ctx?.handler.dispose();
  });

  // -----------------------------------------------------------------------
  // Key → action mapping
  // -----------------------------------------------------------------------

  describe("key-to-action mapping", () => {
    beforeEach(() => {
      ctx = setup();
    });

    it("maps ArrowLeft to moveLeft", () => {
      press("ArrowLeft");
      expect(ctx.actions).toContain("moveLeft");
    });

    it("maps ArrowRight to moveRight", () => {
      press("ArrowRight");
      expect(ctx.actions).toContain("moveRight");
    });

    it("maps ArrowUp to rotateCW", () => {
      press("ArrowUp");
      expect(ctx.actions).toEqual(["rotateCW"]);
    });

    it("maps KeyZ to rotateCCW", () => {
      press("KeyZ");
      expect(ctx.actions).toEqual(["rotateCCW"]);
    });

    it("maps Space to hardDrop", () => {
      press("Space");
      expect(ctx.actions).toEqual(["hardDrop"]);
    });

    it("maps ArrowDown to softDrop", () => {
      press("ArrowDown");
      expect(ctx.actions).toEqual(["softDrop"]);
    });

    it("maps ShiftLeft to hold", () => {
      press("ShiftLeft");
      expect(ctx.actions).toEqual(["hold"]);
    });

    it("maps ShiftRight to hold", () => {
      press("ShiftRight");
      expect(ctx.actions).toEqual(["hold"]);
    });

    it("ignores unmapped keys", () => {
      press("KeyA");
      expect(ctx.actions).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // DAS delay before repeat
  // -----------------------------------------------------------------------

  describe("DAS delay", () => {
    beforeEach(() => {
      ctx = setup({ das: 200, arr: 50 });
    });

    it("fires one move immediately on key press", () => {
      press("ArrowLeft");
      expect(ctx.actions).toEqual(["moveLeft"]);
    });

    it("does not repeat before DAS charges", () => {
      press("ArrowLeft");
      ctx.actions.length = 0;

      // Advance 150ms — still within DAS delay (200ms)
      ctx.handler.update(150);
      expect(ctx.actions).toEqual([]);
    });

    it("starts repeating after DAS charges", () => {
      press("ArrowLeft");
      ctx.actions.length = 0;

      // Advance past DAS (200ms) + one ARR (50ms) = 250ms
      ctx.handler.update(250);
      // Should have at least one repeat
      expect(ctx.actions.length).toBeGreaterThanOrEqual(1);
      expect(ctx.actions.every((a) => a === "moveLeft")).toBe(true);
    });

    it("resets DAS on key release and re-press", () => {
      press("ArrowLeft");
      ctx.actions.length = 0;

      ctx.handler.update(150); // partial DAS
      release("ArrowLeft");
      press("ArrowLeft"); // re-press

      // Should fire one immediate move
      expect(ctx.actions).toEqual(["moveLeft"]);
      ctx.actions.length = 0;

      // Old DAS progress should be lost — 150ms should not trigger repeat
      ctx.handler.update(150);
      expect(ctx.actions).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // ARR repeat rate
  // -----------------------------------------------------------------------

  describe("ARR repeat rate", () => {
    beforeEach(() => {
      ctx = setup({ das: 100, arr: 50 });
    });

    it("fires moves at ARR interval after DAS charges", () => {
      press("ArrowRight");
      ctx.actions.length = 0;

      // Advance 100ms (DAS) + 150ms (3x ARR)
      ctx.handler.update(250);
      // Should fire 3 repeats (at 100, 150, 200, 250 — but first at DAS charge is 100,
      // then ARR at 150, 200, 250 = 3 ARR fires)
      const moveCount = ctx.actions.filter((a) => a === "moveRight").length;
      expect(moveCount).toBe(3);
    });

    it("accumulates fractional ARR correctly across frames", () => {
      press("ArrowRight");
      ctx.actions.length = 0;

      // Charge DAS
      ctx.handler.update(100);
      ctx.actions.length = 0;

      // Two frames of 30ms each = 60ms total, ARR=50 → should fire once
      ctx.handler.update(30);
      ctx.handler.update(30);
      const moveCount = ctx.actions.filter((a) => a === "moveRight").length;
      expect(moveCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // ARR=0 instant teleport
  // -----------------------------------------------------------------------

  describe("ARR=0 instant move", () => {
    beforeEach(() => {
      ctx = setup({ das: 100, arr: 0 });
    });

    it("fires multiple moves in one frame after DAS charges", () => {
      press("ArrowLeft");
      ctx.actions.length = 0;

      // Charge DAS
      ctx.handler.update(100);
      // ARR=0 should fire multiple moves (teleport)
      const moveCount = ctx.actions.filter((a) => a === "moveLeft").length;
      expect(moveCount).toBe(10); // MAX_TELEPORT_MOVES
    });

    it("fires teleport on subsequent frames while held", () => {
      press("ArrowLeft");
      ctx.handler.update(100); // charge DAS
      ctx.actions.length = 0;

      ctx.handler.update(16); // next frame
      const moveCount = ctx.actions.filter((a) => a === "moveLeft").length;
      expect(moveCount).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // Action gating
  // -----------------------------------------------------------------------

  describe("hard drop gating", () => {
    it("fires hard drop when hardDropEnabled is true", () => {
      ctx = setup({ hardDropEnabled: true });
      press("Space");
      expect(ctx.actions).toEqual(["hardDrop"]);
    });

    it("ignores hard drop when hardDropEnabled is false", () => {
      ctx = setup({ hardDropEnabled: false });
      press("Space");
      expect(ctx.actions).toEqual([]);
    });
  });

  describe("hold gating", () => {
    it("fires hold when holdEnabled is true", () => {
      ctx = setup({ holdEnabled: true });
      press("ShiftLeft");
      expect(ctx.actions).toEqual(["hold"]);
    });

    it("ignores hold when holdEnabled is false", () => {
      ctx = setup({ holdEnabled: false });
      press("ShiftLeft");
      expect(ctx.actions).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Non-repeating actions
  // -----------------------------------------------------------------------

  describe("non-repeating actions", () => {
    beforeEach(() => {
      ctx = setup();
    });

    it("rotation fires once per press", () => {
      press("ArrowUp");
      press("ArrowUp"); // second press without release — should not fire
      expect(ctx.actions).toEqual(["rotateCW"]);
    });

    it("rotation fires again after release and re-press", () => {
      press("ArrowUp");
      release("ArrowUp");
      press("ArrowUp");
      expect(ctx.actions).toEqual(["rotateCW", "rotateCW"]);
    });

    it("hard drop fires once per press", () => {
      press("Space");
      press("Space");
      expect(ctx.actions).toEqual(["hardDrop"]);
    });

    it("hold fires once per press", () => {
      press("ShiftLeft");
      press("ShiftLeft");
      expect(ctx.actions).toEqual(["hold"]);
    });

    it("ignores OS key repeat events", () => {
      press("ArrowUp");
      pressRepeat("ArrowUp");
      pressRepeat("ArrowUp");
      expect(ctx.actions).toEqual(["rotateCW"]);
    });
  });

  // -----------------------------------------------------------------------
  // Direction priority
  // -----------------------------------------------------------------------

  describe("direction priority", () => {
    beforeEach(() => {
      ctx = setup({ das: 200, arr: 50 });
    });

    it("last pressed direction wins", () => {
      press("ArrowLeft");
      ctx.actions.length = 0;

      press("ArrowRight");
      // Should fire immediate moveRight
      expect(ctx.actions).toEqual(["moveRight"]);
      ctx.actions.length = 0;

      // DAS should be charging for right, not left
      ctx.handler.update(200);
      expect(ctx.actions.every((a) => a === "moveRight")).toBe(true);
    });

    it("falls back to first direction when second is released", () => {
      press("ArrowLeft");
      press("ArrowRight");
      ctx.actions.length = 0;

      release("ArrowRight");
      // Should switch back to left and fire immediate move
      expect(ctx.actions).toEqual(["moveLeft"]);
    });

    it("clears DAS when all directions released", () => {
      press("ArrowLeft");
      ctx.actions.length = 0;

      release("ArrowLeft");
      ctx.handler.update(300); // well past DAS
      expect(ctx.actions).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Soft drop
  // -----------------------------------------------------------------------

  describe("soft drop", () => {
    beforeEach(() => {
      ctx = setup();
    });

    it("fires on press", () => {
      press("ArrowDown");
      expect(ctx.actions).toEqual(["softDrop"]);
    });

    it("fires every frame while held", () => {
      press("ArrowDown");
      ctx.actions.length = 0;

      ctx.handler.update(16);
      ctx.handler.update(16);
      ctx.handler.update(16);
      expect(ctx.actions).toEqual(["softDrop", "softDrop", "softDrop"]);
    });

    it("stops firing after release", () => {
      press("ArrowDown");
      ctx.actions.length = 0;

      release("ArrowDown");
      ctx.handler.update(16);
      expect(ctx.actions).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Pause toggle
  // -----------------------------------------------------------------------

  describe("pause toggle", () => {
    beforeEach(() => {
      ctx = setup();
    });

    it("calls onPause when not paused", () => {
      press("Escape");
      expect(ctx.pauseCalls).toBe(1);
      expect(ctx.resumeCalls).toBe(0);
    });

    it("calls onResume when paused", () => {
      press("Escape"); // pause
      release("Escape");
      press("Escape"); // resume
      expect(ctx.pauseCalls).toBe(1);
      expect(ctx.resumeCalls).toBe(1);
    });

    it("does not fire gameplay actions while paused", () => {
      press("Escape"); // pause
      ctx.actions.length = 0;

      press("ArrowLeft");
      press("ArrowUp");
      press("Space");
      expect(ctx.actions).toEqual([]);
    });

    it("does not process DAS/ARR updates while paused", () => {
      press("ArrowLeft");
      ctx.actions.length = 0;

      press("Escape"); // pause
      ctx.handler.update(500); // well past DAS
      expect(ctx.actions).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Blur resets
  // -----------------------------------------------------------------------

  describe("blur resets keys", () => {
    beforeEach(() => {
      ctx = setup({ das: 100, arr: 50 });
    });

    it("clears all held state on blur", () => {
      press("ArrowLeft");
      press("ArrowDown");
      ctx.actions.length = 0;

      window.dispatchEvent(new Event("blur"));

      ctx.handler.update(200); // past DAS
      expect(ctx.actions).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Dispose
  // -----------------------------------------------------------------------

  describe("dispose", () => {
    it("stops all callbacks after dispose", () => {
      ctx = setup();
      ctx.handler.dispose();
      ctx.actions.length = 0;

      press("ArrowLeft");
      press("ArrowUp");
      press("Space");
      press("Escape");
      expect(ctx.actions).toEqual([]);
      expect(ctx.pauseCalls).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Classic rule set integration
  // -----------------------------------------------------------------------

  describe("classic rule set", () => {
    beforeEach(() => {
      ctx = setup(classicRuleSet());
    });

    it("uses classic DAS timing (267ms)", () => {
      press("ArrowRight");
      ctx.actions.length = 0;

      // 200ms — modern DAS would have charged, classic should not
      ctx.handler.update(200);
      expect(ctx.actions).toEqual([]);

      // 267ms + 100ms ARR = 367ms total — classic DAS charges and fires one ARR
      ctx.handler.update(167);
      expect(ctx.actions.length).toBeGreaterThanOrEqual(1);
      expect(ctx.actions[0]).toBe("moveRight");
    });

    it("ignores hard drop (hardDropEnabled=false)", () => {
      press("Space");
      expect(ctx.actions).toEqual([]);
    });

    it("ignores hold (holdEnabled=false)", () => {
      press("ShiftLeft");
      expect(ctx.actions).toEqual([]);
    });
  });
});
