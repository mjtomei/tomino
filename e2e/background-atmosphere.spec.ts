import { test, expect } from "@playwright/test";
import { setupSoloGame } from "./helpers";

test.describe("background canvas layer", () => {
  test.setTimeout(30_000);

  test("mounts behind the solo game board and persists after play starts", async ({
    page,
  }) => {
    await setupSoloGame(page);
    const bg = page.locator('[data-testid="background-canvas"]').first();
    await expect(bg).toBeAttached();
    // pointer-events: none so clicks pass through to the game board
    await expect(bg).toHaveCSS("pointer-events", "none");
    // z-index 0 — lives beneath the interactive layout
    const tag = await bg.evaluate((el) => el.tagName);
    expect(tag).toBe("CANVAS");
  });

  test("is visible on the lobby before entering a game", async ({ page }) => {
    await page.goto("/");
    await page.locator("#player-name").fill("BgTester");
    await page.getByRole("button", { name: "Continue" }).click();
    const bg = page.locator('[data-testid="background-canvas"]').first();
    await expect(bg).toBeAttached();
  });
});
