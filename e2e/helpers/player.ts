import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface PlayerHandle {
  context: BrowserContext;
  page: Page;
}

/**
 * Create an isolated player session: new browser context, navigate to the app,
 * enter the player name, and wait until the lobby menu is ready.
 */
export async function createPlayerContext(
  browser: Browser,
  name: string,
): Promise<PlayerHandle> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");

  // Fill in the player name and submit
  await page.locator("#player-name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();

  // Wait for the lobby menu to appear (confirms name was accepted)
  await expect(page.getByText(`Welcome, ${name}`)).toBeVisible();

  return { context, page };
}
