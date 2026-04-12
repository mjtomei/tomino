import { test, expect } from "@playwright/test";
import { setupSoloGame, holdKey } from "./helpers";

test.describe("input bugs", () => {
  test("holding an arrow key does not scroll the page", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    // Ensure the page starts at scroll position 0
    const scrollBefore = await page.evaluate(() => document.documentElement.scrollTop);
    expect(scrollBefore).toBe(0);

    // Hold ArrowDown long enough to trigger browser key-repeat events
    await holdKey(page, "ArrowDown", 500);

    const scrollAfter = await page.evaluate(() => document.documentElement.scrollTop);
    expect(scrollAfter).toBe(0);
  });
});
