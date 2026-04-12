import { test, expect } from "@playwright/test";
import { setupSoloGame } from "./helpers";

test.describe("settings panel", () => {
  test("opens from the lobby, changes sfx volume, persists across reload", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#player-name").fill("SettingsTester");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByTestId("lobby-settings-btn").click();
    await expect(page.getByTestId("settings-panel")).toBeVisible();

    const sfxSlider = page.getByTestId("sfx-volume-slider");
    await sfxSlider.fill("0.15");

    await page.getByTestId("effects-subtle").click();
    await page.getByTestId("theme-swatch-aurora").click();

    const stored = await page.evaluate(() => ({
      sfx: localStorage.getItem("tetris.sfx.volume"),
      effects: localStorage.getItem("tetris.effects.intensity"),
      theme: localStorage.getItem("tetris.theme"),
    }));
    expect(stored.sfx).toBe("0.15");
    expect(stored.effects).toBe("subtle");
    expect(stored.theme).toBe("aurora");

    await page.getByTestId("settings-close").click();
    await expect(page.getByTestId("settings-panel")).toHaveCount(0);

    await page.reload();
    await page.locator("#player-name").fill("SettingsTester");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByTestId("lobby-settings-btn").click();
    await expect(page.getByTestId("sfx-volume-slider")).toHaveValue("0.15");
    await expect(page.getByTestId("effects-subtle")).toHaveClass(/active/);
  });

  test("opens from the pause overlay in solo play", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pause-overlay")).toBeVisible();

    await page.getByTestId("pause-settings-btn").click();
    await expect(page.getByTestId("settings-panel")).toBeVisible();

    const musicSlider = page.getByTestId("music-volume-slider");
    await musicSlider.fill("0.4");
    await expect(page.getByTestId("settings-close")).toBeVisible();

    await page.getByTestId("settings-close").click();
    await expect(page.getByTestId("settings-panel")).toHaveCount(0);
    await expect(page.getByTestId("pause-overlay")).toBeVisible();
  });
});
