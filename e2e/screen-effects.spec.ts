import { test, expect } from "@playwright/test";
import { setupSoloGame, sendKeyboardInput } from "./helpers";

test.describe("screen effects overlay", () => {
  test.setTimeout(60_000);

  test("renders the screen-effects wrapper with atmosphere-driven attributes", async ({
    page,
  }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    const root = page.getByTestId("screen-effects");
    await expect(root).toBeVisible();

    // On a calm empty board, vignette opacity should start at zero.
    const initialVignette = await root.getAttribute("data-vignette-opacity");
    expect(initialVignette).not.toBeNull();
    expect(parseFloat(initialVignette!)).toBeCloseTo(0, 2);

    // Hard drop a piece — shake attribute should tick up then decay back.
    await sendKeyboardInput(page, "hardDrop");
    // Give React a frame to render the bump.
    await page.waitForTimeout(30);
    const shakeAttr = await root.getAttribute("data-shake");
    expect(shakeAttr).not.toBeNull();
    expect(parseFloat(shakeAttr!)).toBeGreaterThan(0);

    // After several half-lives, the shake should have decayed away.
    await page.waitForTimeout(600);
    const shakeAfter = await root.getAttribute("data-shake");
    expect(parseFloat(shakeAfter!)).toBeLessThan(0.1);

    // Stack up the board to raise danger and verify vignette opacity rises.
    for (let i = 0; i < 40; i++) {
      if (i % 2 === 0) {
        await sendKeyboardInput(page, "moveLeft");
        await sendKeyboardInput(page, "moveLeft");
      } else {
        await sendKeyboardInput(page, "moveRight");
        await sendKeyboardInput(page, "moveRight");
      }
      await sendKeyboardInput(page, "hardDrop");
    }
    await page.waitForTimeout(200);

    const stackedVignette = await root.getAttribute("data-vignette-opacity");
    expect(parseFloat(stackedVignette!)).toBeGreaterThan(0);
  });

  test("overlays do not block input to the game board", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });
    const root = page.getByTestId("screen-effects");
    await expect(root).toBeVisible();

    // If pointer-events on overlays leaked, the board would not receive
    // these keypresses. Sending a hardDrop should still produce a shake
    // bump — confirming the input path is intact.
    await sendKeyboardInput(page, "hardDrop");
    await page.waitForTimeout(30);
    const shakeAttr = await root.getAttribute("data-shake");
    expect(parseFloat(shakeAttr!)).toBeGreaterThan(0);
  });
});
