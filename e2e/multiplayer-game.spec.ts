import { test, expect } from "@playwright/test";
import {
  createPlayerContext,
  createRoom,
  joinRoom,
  sendKeyboardInput,
  waitForGameState,
  type PlayerHandle,
} from "./helpers";

/**
 * Helper: start a 2-player game from scratch.
 * Returns both player handles and the room code.
 */
async function setupAndStartGame(browser: import("@playwright/test").Browser) {
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
 * Sends hard drops with short delays so the server can process each piece.
 */
async function forceTopOut(page: import("@playwright/test").Page) {
  // Hard drop ~25 pieces — enough to fill a 20-row board
  for (let i = 0; i < 25; i++) {
    await sendKeyboardInput(page, "hardDrop");
    // Small delay to let the engine process lock → spawn → next piece
    await page.waitForTimeout(150);
  }
}

test.describe("multiplayer game flow", () => {
  // These tests involve full game lifecycles; give them generous timeouts
  test.setTimeout(90_000);

  test("full game lifecycle — two players play until game over", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      // Both players should see the game board
      await expect(
        host.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible();
      await expect(
        guest.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible();

      // Alice (host) hard-drops rapidly to top out
      // Bob does nothing — just waits
      await forceTopOut(host.page);

      // Alice should see the spectator overlay (she topped out)
      await expect(
        host.page.locator('[data-testid="spectator-overlay"]'),
      ).toBeVisible({ timeout: 15_000 });

      // Both players should see the results screen
      await expect(
        host.page.locator('[data-testid="game-results"]'),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        guest.page.locator('[data-testid="game-results"]'),
      ).toBeVisible({ timeout: 15_000 });

      // Alice (loser) sees "DEFEATED", Bob (winner) sees "VICTORY"
      await expect(host.page.locator(".results-title")).toHaveText("DEFEATED");
      await expect(guest.page.locator(".results-title")).toHaveText("VICTORY");

      // Both see placement info
      await expect(
        host.page.locator('[data-testid="results-placement"]'),
      ).toContainText("2nd");
      await expect(
        guest.page.locator('[data-testid="results-placement"]'),
      ).toContainText("1st");

      // Results table should have rows for both players
      await expect(
        host.page.locator('[data-testid="results-table"] .results-row'),
      ).toHaveCount(2);
      await expect(
        guest.page.locator('[data-testid="results-table"] .results-row'),
      ).toHaveCount(2);

      // Both players' names should appear in the results
      await expect(
        host.page.locator('[data-testid="results-table"]'),
      ).toContainText("Alice");
      await expect(
        host.page.locator('[data-testid="results-table"]'),
      ).toContainText("Bob");
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("disconnect during game causes forfeit after timeout", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      // Both should be in the game
      await expect(
        host.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible();
      await expect(
        guest.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible();

      // Bob disconnects (close the browser context)
      await guest.context.close();
      guest = undefined; // prevent double-close in finally

      // Alice should see the disconnect overlay
      await expect(
        host.page.locator('[data-testid="disconnect-overlay"]'),
      ).toBeVisible({ timeout: 5_000 });

      // Wait for the 15-second reconnect timeout to expire.
      // The server forfeits the disconnected player after RECONNECT_WINDOW_MS (15s).
      // After forfeit, Alice (last player standing) wins → results screen appears.
      await expect(
        host.page.locator('[data-testid="game-results"]'),
      ).toBeVisible({ timeout: 25_000 });

      // Alice wins by forfeit
      await expect(host.page.locator(".results-title")).toHaveText("VICTORY");
      await expect(
        host.page.locator('[data-testid="results-placement"]'),
      ).toContainText("1st");
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });
});
