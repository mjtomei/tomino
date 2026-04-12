import { test, expect } from "@playwright/test";
import { setupSoloGame, sendKeyboardInput } from "./helpers";

test.describe("piece animation", () => {
  test.setTimeout(60_000);

  test("board canvas stays responsive under rapid movement input", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    const canvas = page.locator('[data-testid="board-canvas"]');
    await expect(canvas).toBeVisible();

    // Fire a burst of lateral moves faster than the ~40ms move animation
    // can complete. The animator must never let the render lag the engine;
    // responsiveness-wise, the inputs should all be accepted without errors.
    for (let i = 0; i < 12; i++) {
      await sendKeyboardInput(page, "moveLeft");
    }
    for (let i = 0; i < 12; i++) {
      await sendKeyboardInput(page, "moveRight");
    }

    // A rotation, then a hard drop — animations must not block subsequent
    // inputs and the engine/render should stay in sync.
    await sendKeyboardInput(page, "rotateClockwise");
    await sendKeyboardInput(page, "hardDrop");

    await expect(canvas).toBeVisible();
    expect(errors).toEqual([]);
  });
});
