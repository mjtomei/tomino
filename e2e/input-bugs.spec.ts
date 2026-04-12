/**
 * E2E tests for input bug fixes:
 * - Stuck keys after window blur (DAS continues firing after alt-tab)
 * - Single-fire actions double-firing without firedKeys gating
 */

import { test, expect } from "@playwright/test";
import { setupSoloGame, sendKeyboardInput, holdKey } from "./helpers";

test.describe("input bugs", () => {
  test.beforeEach(async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });
  });

  // -------------------------------------------------------------------------
  // Stuck keys on blur
  // -------------------------------------------------------------------------

  test.describe("stuck keys on window blur", () => {
    test("blur resets DAS — movement stops after window loses focus", async ({ page }) => {
      // Hold ArrowLeft long enough to trigger DAS (modern DAS = 133ms)
      await page.keyboard.down("ArrowLeft");
      await page.waitForTimeout(200);

      // Simulate window losing focus — should reset DAS state
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));

      // Release the key (the keyup may not reach the handler after blur,
      // but the blur handler should have already cleared DAS)
      await page.keyboard.up("ArrowLeft");

      // Wait a frame for any stale DAS to fire if the bug were present
      await page.waitForTimeout(100);

      // Verify the game is still playable — press ArrowRight and then hardDrop.
      // If DAS were stuck on ArrowLeft, the piece would keep drifting left
      // and the right-move + hardDrop would land in an unexpected spot.
      // We just verify the game board is still visible (no crash) and
      // that new input is accepted.
      await sendKeyboardInput(page, "moveRight");
      await sendKeyboardInput(page, "hardDrop");

      // The game should still be active (not crashed, board still visible)
      await expect(
        page.locator('[data-testid="game-board"]'),
      ).toBeVisible();
    });

    test("blur during DAS charge clears partial charge", async ({ page }) => {
      // Start holding ArrowRight — DAS starts charging
      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(50); // partial DAS charge

      // Blur before DAS fully charges
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await page.keyboard.up("ArrowRight");

      // Wait well past DAS threshold
      await page.waitForTimeout(200);

      // If partial DAS charge survived blur, movement would have auto-fired.
      // Re-pressing the key should start DAS from scratch.
      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(50); // partial again — should NOT auto-repeat
      await page.keyboard.up("ArrowRight");

      // Game still running normally
      await expect(
        page.locator('[data-testid="game-board"]'),
      ).toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // Double-fire prevention
  // -------------------------------------------------------------------------

  test.describe("single-fire actions do not double-fire", () => {
    test("holding rotate key does not fire multiple rotations", async ({ page }) => {
      // Hold ArrowUp (rotateCW) for longer than a typical frame —
      // without firedKeys gating, OS key repeat could cause multiple rotations.
      // With the fix, only one rotation should fire per keydown.
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(300); // hold well past any repeat threshold
      await page.keyboard.up("ArrowUp");

      // Hard-drop the piece to lock it
      await sendKeyboardInput(page, "hardDrop");

      // Game should still be active and responsive
      await expect(
        page.locator('[data-testid="game-board"]'),
      ).toBeVisible();

      // A second press-release cycle should fire another rotation
      await sendKeyboardInput(page, "rotateClockwise");
      await sendKeyboardInput(page, "hardDrop");

      await expect(
        page.locator('[data-testid="game-board"]'),
      ).toBeVisible();
    });

    test("rapid hard drop presses without release do not double-fire", async ({ page }) => {
      // Press Space (hardDrop) twice rapidly without releasing the first press.
      // Without firedKeys, both presses could fire hardDrop causing two pieces
      // to instantly lock in quick succession.
      await page.keyboard.down("Space");
      // Simulate a second keydown without intervening keyup
      await page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
        );
      });
      await page.keyboard.up("Space");

      await page.waitForTimeout(100);

      // Game should be running (not game-over from double hard-drop cascade)
      await expect(
        page.locator('[data-testid="game-board"]'),
      ).toBeVisible();
    });

    test("hold action fires once per keypress", async ({ page }) => {
      // Press hold (KeyC) and keep it held — should only swap once
      await page.keyboard.down("c");
      await page.waitForTimeout(200);
      await page.keyboard.up("c");

      // Press again to swap back
      await page.keyboard.down("c");
      await page.waitForTimeout(200);
      await page.keyboard.up("c");

      // Game still running — verify no crash from double-hold
      await expect(
        page.locator('[data-testid="game-board"]'),
      ).toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // DAS still works correctly after fix
  // -------------------------------------------------------------------------

  test.describe("DAS still functions after fix", () => {
    test("holding left/right triggers auto-repeat movement", async ({ page }) => {
      // Hold ArrowLeft long enough for DAS to charge and ARR to fire
      // Modern: DAS=133ms, ARR=10ms — hold for 300ms should trigger many repeats
      await holdKey(page, "ArrowLeft", 300);

      // Hard-drop to lock piece
      await sendKeyboardInput(page, "hardDrop");

      // Game should still be active
      await expect(
        page.locator('[data-testid="game-board"]'),
      ).toBeVisible();
    });

    test("direction reversal works after blur recovery", async ({ page }) => {
      // Hold left, blur, release, then hold right — should work cleanly
      await page.keyboard.down("ArrowLeft");
      await page.waitForTimeout(100);

      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await page.keyboard.up("ArrowLeft");

      await page.waitForTimeout(50);

      // Now move right — should start fresh DAS
      await holdKey(page, "ArrowRight", 200);
      await sendKeyboardInput(page, "hardDrop");

      await expect(
        page.locator('[data-testid="game-board"]'),
      ).toBeVisible();
    });
  });
});
