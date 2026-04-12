/**
 * Full integration E2E test — verifies the complete user-facing flow:
 * multiplayer game with results screen showing placements, stats, and UI controls.
 *
 * Uses plan-17af8d3 Playwright E2E helpers: createPlayerContext, createRoom,
 * joinRoom, sendKeyboardInput, waitForGameState.
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  createPlayerContext,
  createRoom,
  joinRoom,
  sendKeyboardInput,
  waitForGameState,
  type PlayerHandle,
} from "./helpers";

/**
 * Start a 2-player game from scratch.
 * Returns both player handles and the room code.
 */
async function setupAndStartGame(browser: Browser) {
  const host = await createPlayerContext(browser, "Alice");
  const roomId = await createRoom(host.page);

  const guest = await createPlayerContext(browser, "Bob");
  await joinRoom(guest.page, roomId);

  // Host clicks "Start Game"
  const startBtn = host.page.getByRole("button", { name: "Start Game" });
  await expect(startBtn).toBeEnabled();
  await startBtn.click();

  // Wait for countdown to finish and game board to appear on both pages
  await Promise.all([
    waitForGameState(host.page, '[data-testid="game-multiplayer"]', {
      timeout: 15_000,
    }),
    waitForGameState(guest.page, '[data-testid="game-multiplayer"]', {
      timeout: 15_000,
    }),
  ]);

  return { host, guest, roomId };
}

/**
 * Rapidly hard-drop pieces to fill the board and trigger a top-out.
 */
async function forceTopOut(page: Page) {
  for (let i = 0; i < 25; i++) {
    await sendKeyboardInput(page, "hardDrop");
    await page.waitForTimeout(150);
  }
}

test.describe("full integration E2E", () => {
  test.setTimeout(90_000);

  test("multiplayer game shows complete results with stats", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      // Alice (host) hard-drops rapidly to top out
      await forceTopOut(host.page);

      // Wait for the results screen to appear on both pages
      await expect(
        host.page.locator('[data-testid="game-results"]'),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        guest.page.locator('[data-testid="game-results"]'),
      ).toBeVisible({ timeout: 15_000 });

      // === Placements ===
      // Alice (loser) sees "DEFEATED", Bob (winner) sees "VICTORY"
      await expect(host.page.locator(".results-title")).toHaveText("DEFEATED");
      await expect(guest.page.locator(".results-title")).toHaveText("VICTORY");

      await expect(
        host.page.locator('[data-testid="results-placement"]'),
      ).toContainText("2nd");
      await expect(
        guest.page.locator('[data-testid="results-placement"]'),
      ).toContainText("1st");

      // === Results table with stats ===
      // Both players' names should appear in the results table
      const hostTable = host.page.locator('[data-testid="results-table"]');
      await expect(hostTable).toContainText("Alice");
      await expect(hostTable).toContainText("Bob");

      // Results table should have rows for both players
      const hostRows = host.page.locator(
        '[data-testid="results-table"] .results-row',
      );
      await expect(hostRows).toHaveCount(2);

      // Each row should contain stat cells with numeric values
      // (Sent, Recv, Pieces, Lines, Score, Time columns)
      for (const pid of ["p1", "p2"]) {
        const row = host.page.locator(`[data-testid="results-row-${pid}"]`);
        // Row should exist and have stat cells
        await expect(row).toBeVisible();
        const statCells = row.locator(".cell-stat");
        // 6 stat columns: Sent, Recv, Pieces, Lines, Score, Time
        await expect(statCells).toHaveCount(6);
      }

      // === UI controls ===
      // Rematch, Back to Lobby, and View Stats buttons should be present
      await expect(
        host.page.locator('[data-testid="rematch-btn"]'),
      ).toBeVisible();
      await expect(
        host.page.locator('[data-testid="back-to-lobby"]'),
      ).toBeVisible();
      await expect(
        host.page.locator('[data-testid="view-stats"]'),
      ).toBeVisible();
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });
});
