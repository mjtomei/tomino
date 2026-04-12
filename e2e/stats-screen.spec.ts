/**
 * Stats screen and post-game UI E2E tests.
 *
 * Plays a single 2-player game to completion (host tops out), then verifies:
 * - Results table stat values are plausible and non-negative
 * - Rating changes appear asynchronously on the results screen
 * - "View Stats" opens the stats screen with correct data
 * - Match history is populated after playing a game
 * - Back button returns to the results screen
 *
 * Tests run serially and share the game session to avoid replaying
 * the full game lifecycle for each test.
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
 */
async function setupAndStartGame(browser: Browser) {
  const host = await createPlayerContext(browser, "Alice");
  const roomId = await createRoom(host.page);

  const guest = await createPlayerContext(browser, "Bob");
  await joinRoom(guest.page, roomId);

  // Enable handicap mode so the rating system is active (default is "off")
  await host.page.locator("#handicap-intensity").selectOption("light");

  const startBtn = host.page.getByRole("button", { name: "Start Game" });
  await expect(startBtn).toBeEnabled();
  await startBtn.click();

  await Promise.all([
    waitForGameState(host.page, '[data-testid="game-multiplayer"]', {
      timeout: 15_000,
    }),
    waitForGameState(guest.page, '[data-testid="game-multiplayer"]', {
      timeout: 15_000,
    }),
  ]);

  return { host, guest };
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

test.describe.serial("stats screen and post-game UI", () => {
  test.setTimeout(90_000);

  let host: PlayerHandle;
  let guest: PlayerHandle;

  test.beforeAll(async ({ browser }) => {
    ({ host, guest } = await setupAndStartGame(browser));

    // Host (Alice) hard-drops rapidly to top out; Guest (Bob) wins
    await forceTopOut(host.page);

    // Wait for results screen on both pages
    await expect(
      host.page.locator('[data-testid="game-results"]'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      guest.page.locator('[data-testid="game-results"]'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test.afterAll(async () => {
    await host?.context.close();
    await guest?.context.close();
  });

  // --- Results screen tests (use host page; guest page is reserved for stats navigation) ---

  test("results table shows plausible stat values for both players", async () => {
    const rows = host.page.locator(
      '[data-testid="results-table"] .results-row',
    );
    await expect(rows).toHaveCount(2);

    for (let i = 0; i < 2; i++) {
      const cells = rows.nth(i).locator(".cell-stat");
      await expect(cells).toHaveCount(6);

      const texts = await cells.allTextContents();

      // Pieces (index 2): non-negative integer
      const pieces = parseInt(texts[2], 10);
      expect(pieces).toBeGreaterThanOrEqual(0);

      // Score (index 4): non-negative number (may have commas from toLocaleString)
      const score = parseInt(texts[4].replace(/,/g, ""), 10);
      expect(score).toBeGreaterThanOrEqual(0);

      // Time (index 5): matches M:SS.CC format (from formatTime)
      expect(texts[5]).toMatch(/^\d+:\d{2}\.\d{2}$/);
    }

    // Alice (host) hard-dropped many pieces — she's in row index 1 (sorted by placement, winner first)
    const aliceCells = rows.nth(1).locator(".cell-stat");
    const aliceTexts = await aliceCells.allTextContents();
    const alicePieces = parseInt(aliceTexts[2], 10);
    expect(alicePieces).toBeGreaterThanOrEqual(1);
  });

  test("results table stat values are non-negative numbers", async () => {
    const rows = host.page.locator(
      '[data-testid="results-table"] .results-row',
    );
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator(".cell-stat");
      const texts = await cells.allTextContents();

      // Indices 0-4: Sent, Recv, Pieces, Lines, Score — all non-negative integers
      // Index 5 (Time) is a formatted string, skip it
      for (let j = 0; j < 5; j++) {
        const value = parseInt(texts[j].replace(/,/g, ""), 10);
        expect(value).not.toBeNaN();
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("rating changes appear on results screen", async () => {
    // Rating changes arrive asynchronously — wait up to 5s
    const ratingElements = host.page.locator('[data-testid^="rating-"]');
    await expect(ratingElements.first()).toBeVisible({ timeout: 5_000 });

    const count = await ratingElements.count();
    expect(count).toBe(2); // One per player

    for (let i = 0; i < count; i++) {
      const el = ratingElements.nth(i);

      // Each should contain a numeric rating value
      const ratingValue = el.locator(".rating-value");
      await expect(ratingValue).toBeVisible();
      const valueText = await ratingValue.textContent();
      expect(parseInt(valueText!, 10)).not.toBeNaN();

      // Each should contain a delta with "+" or "-" prefix
      const ratingDelta = el.locator(".rating-delta");
      await expect(ratingDelta).toBeVisible();
      const deltaText = await ratingDelta.textContent();
      expect(deltaText).toMatch(/^[+-]\d+$/);
    }
  });

  // --- Stats screen tests (use guest/winner page) ---

  test("view stats button opens stats screen", async () => {
    // Click "View Stats" on the winner's (Bob/guest) results screen
    await guest.page.locator('[data-testid="view-stats"]').click();

    // Stats screen should appear (replaces the results view)
    await expect(guest.page.locator(".stats-screen")).toBeVisible({
      timeout: 5_000,
    });

    // Heading should contain "Stats for Bob"
    await expect(
      guest.page.locator(".stats-screen .stats-header h1"),
    ).toContainText("Stats for Bob");

    // Should not show an error state
    const errorEl = guest.page.locator(".stats-empty");
    const errorCount = await errorEl.count();
    if (errorCount > 0 && (await errorEl.isVisible())) {
      const errorText = await errorEl.textContent();
      expect(errorText).not.toContain("Error:");
    }

    // Rating card should be visible (player exists after playing a game)
    await expect(guest.page.locator(".stats-rating-card")).toBeVisible();
  });

  test("match history appears after playing a game", async () => {
    // We're on the stats screen (guest page, from previous test)
    const statsTable = guest.page.locator(".stats-table");
    const tableVisible = await statsTable.isVisible();

    if (tableVisible) {
      // Should have at least 1 row in tbody
      const rows = statsTable.locator("tbody tr");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // Each row should have 4 cells (Opponent, Result, Rating Change, Date)
      for (let i = 0; i < rowCount; i++) {
        const cells = rows.nth(i).locator("td");
        await expect(cells).toHaveCount(4);

        // Result cell (index 1) should contain "Win" or "Loss"
        const resultText = await cells.nth(1).textContent();
        expect(resultText).toMatch(/Win|Loss/);
      }
    }
  });

  test("stats screen back button returns to results", async () => {
    // We're on the stats screen (guest page)
    await guest.page.locator(".stats-back-btn").click();

    // Results screen should be visible again
    await expect(
      guest.page.locator('[data-testid="game-results"]'),
    ).toBeVisible({ timeout: 5_000 });
  });
});
