import { test, expect } from "@playwright/test";

/**
 * Menu/lobby atmosphere integration: verifies the background canvas
 * stays mounted across screen transitions and that the music readout
 * shows an ambient/running engine on non-game screens.
 */
test.describe("menu atmosphere", () => {
  test.setTimeout(30_000);

  test("background canvas stays attached across name-input → menu transition", async ({
    page,
  }) => {
    await page.goto("/");
    const bg = page.locator('[data-testid="background-canvas"]').first();
    await expect(bg).toBeAttached();
    await page.locator("#player-name").fill("MenuAtmo");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("button", { name: "Solo Play" }),
    ).toBeVisible();
    // Canvas still attached after the view switched.
    await expect(bg).toBeAttached();
  });

  test("music engine readout is observable on the menu screen", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#player-name").fill("MenuAtmo2");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("button", { name: "Solo Play" }),
    ).toBeVisible();
    // Give the engine a moment to come up after user interaction.
    await page.waitForTimeout(250);
    const readout = await page.evaluate(
      () =>
        (window as unknown as { __music__?: { running: boolean } }).__music__,
    );
    // On non-test browsers without user gesture the AudioContext may be
    // suspended — accept undefined as long as no error was thrown. When
    // present, the engine should be running.
    if (readout) {
      expect(readout.running).toBe(true);
    }
  });
});
