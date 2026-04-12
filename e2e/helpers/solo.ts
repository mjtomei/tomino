import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface SetupSoloGameOptions {
  preset?: "classic" | "modern" | "custom";
  mode?: "marathon" | "sprint" | "ultra" | "zen";
}

/**
 * Navigate to the app, go through the name input and lobby,
 * then start a solo game with the given preset and mode.
 */
export async function setupSoloGame(
  page: Page,
  options: SetupSoloGameOptions = {},
): Promise<void> {
  const { preset = "modern", mode = "marathon" } = options;

  // Navigate to app root
  await page.goto("/");

  // Fill in player name and proceed
  await page.locator("#player-name").fill("TestPlayer");
  await page.getByRole("button", { name: "Continue" }).click();

  // Click "Solo Play" from the lobby menu
  await page.getByRole("button", { name: "Solo Play" }).click();

  // Wait for the start screen
  await expect(page.locator('[data-testid="start-screen"]')).toBeVisible();

  // Select ruleset preset
  await page.locator(`[data-testid="preset-${preset}"]`).click();

  // Select game mode
  await page.locator(`[data-testid="mode-${mode}"]`).click();

  // Start the game
  await page.locator('[data-testid="start-play"]').click();

  // Wait for the game board or canvas to be visible
  await expect(
    page.locator('[data-testid="game-board"], [data-testid="board-canvas"]').first(),
  ).toBeVisible();
}
