import { test, expect } from "@playwright/test";
import { setupSoloGame, sendKeyboardInput } from "./helpers";

test.describe("board visual effects", () => {
  test.setTimeout(30_000);

  test("board effects layer is mounted and particle system is reachable", async ({
    page,
  }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    // Initial state: window.__boardEffects__ is populated after the first
    // game-loop tick fires the effects diff.
    await page.waitForFunction(
      () => typeof (window as any).__boardEffects__ === "object",
      null,
      { timeout: 5_000 },
    );

    // Hard drop a few pieces to exercise onHardDropIntent + lock pulse paths.
    for (let i = 0; i < 4; i++) {
      await sendKeyboardInput(page, "hardDrop");
      await page.waitForTimeout(100);
    }

    // After some activity the particle system should have emitted particles
    // at least once. Counts decay as particles die, so we track the max
    // observed over a short window.
    const maxCount = await page.evaluate(async () => {
      let max = 0;
      const start = Date.now();
      while (Date.now() - start < 800) {
        const ref = (window as any).__boardEffects__;
        if (ref && typeof ref.count === "number" && ref.count > max) {
          max = ref.count;
        }
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      return max;
    });
    expect(maxCount).toBeGreaterThan(0);
  });
});
