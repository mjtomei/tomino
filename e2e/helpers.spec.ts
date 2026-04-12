import { test, expect } from "@playwright/test";
import { setupSoloGame, readScoreDisplay } from "./helpers";

test.describe("helpers smoke test", () => {
  test("setupSoloGame + readScoreDisplay returns score and level", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    const stats = await readScoreDisplay(page);
    expect(stats.score).toBeDefined();
    expect(stats.level).toBeDefined();
  });
});
