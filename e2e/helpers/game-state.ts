import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface WaitForGameStateOptions {
  /** Timeout in milliseconds. Defaults to 10 000. */
  timeout?: number;
}

/**
 * Wait until a DOM element matching `selector` is visible on the page.
 * Useful for waiting on game state transitions (e.g., game started, game over).
 */
export async function waitForGameState(
  page: Page,
  selector: string,
  options: WaitForGameStateOptions = {},
): Promise<void> {
  const { timeout = 10_000 } = options;
  await expect(page.locator(selector)).toBeVisible({ timeout });
}
