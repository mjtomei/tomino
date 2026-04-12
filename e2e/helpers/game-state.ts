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

export interface ScoreDisplayData {
  score?: number;
  level?: number;
  lines?: number;
  time?: string;
  remaining?: number;
}

/**
 * Read the score display panel and parse out all visible stat values.
 */
export async function readScoreDisplay(page: Page): Promise<ScoreDisplayData> {
  const container = page.locator('[data-testid="score-display"]');
  const rows = container.locator(".stat-row");
  const count = await rows.count();

  const result: ScoreDisplayData = {};

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const label = (await row.locator(".stat-label").textContent()) ?? "";
    const value = (await row.locator(".stat-value").textContent()) ?? "";

    switch (label.trim().toUpperCase()) {
      case "SCORE":
        result.score = Number(value.replace(/,/g, ""));
        break;
      case "LEVEL":
        result.level = Number(value);
        break;
      case "LINES":
        result.lines = Number(value);
        break;
      case "TIME":
        result.time = value.trim();
        break;
      case "REMAINING":
        result.remaining = Number(value);
        break;
    }
  }

  return result;
}

/**
 * Wait for the spectator/elimination overlay to appear (multiplayer).
 */
export async function waitForElimination(
  page: Page,
  timeoutMs: number = 10_000,
): Promise<void> {
  await expect(
    page.locator('[data-testid="spectator-overlay"]'),
  ).toBeVisible({ timeout: timeoutMs });
}
