import { test, expect } from "@playwright/test";
import { setupSoloGame, readScoreDisplay } from "./helpers";

test.describe("single player", () => {
  test("classic NES marathon shows level 0 at start", async ({ page }) => {
    await setupSoloGame(page, { preset: "classic", mode: "marathon" });

    const stats = await readScoreDisplay(page);
    expect(stats.level).toBe(0);
  });
});
