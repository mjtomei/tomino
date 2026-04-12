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
 * Helper: start a 2-player game from scratch.
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
 * Sends hard drops with short delays so the server can process each piece.
 */
async function forceTopOut(page: Page) {
  for (let i = 0; i < 25; i++) {
    await sendKeyboardInput(page, "hardDrop");
    await page.waitForTimeout(150);
  }
}

/**
 * Play a game to completion: host tops out, both players see results screen.
 */
async function playToCompletion(host: PlayerHandle, guest: PlayerHandle) {
  await forceTopOut(host.page);

  // Wait for results screen on both pages
  await Promise.all([
    expect(host.page.locator('[data-testid="game-results"]')).toBeVisible({
      timeout: 15_000,
    }),
    expect(guest.page.locator('[data-testid="game-results"]')).toBeVisible({
      timeout: 15_000,
    }),
  ]);
}

test.describe("multiplayer rematch flow", () => {
  test.setTimeout(90_000);

  test("clicking rematch shows waiting state", async ({ browser }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));
      await playToCompletion(host, guest);

      // Click the rematch button on the host's results screen
      const rematchBtn = host.page.locator('[data-testid="rematch-btn"]');
      await rematchBtn.click();

      // Button should become disabled and show "WAITING..."
      await expect(rematchBtn).toBeDisabled();
      await expect(rematchBtn).toHaveText("WAITING...");

      // Rematch status should show 1/2 voted
      await expect(
        host.page.locator('[data-testid="rematch-status"]'),
      ).toHaveText("1/2 voted for rematch");
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("opponent sees rematch vote count update", async ({ browser }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));
      await playToCompletion(host, guest);

      // Host votes for rematch
      await host.page.locator('[data-testid="rematch-btn"]').click();

      // Guest should see the vote count update (broadcast from server)
      await expect(
        guest.page.locator('[data-testid="rematch-status"]'),
      ).toHaveText("1/2 voted for rematch");

      // Guest's rematch button should still show "REMATCH" (hasn't voted yet)
      await expect(
        guest.page.locator('[data-testid="rematch-btn"]'),
      ).toHaveText("REMATCH");
      await expect(
        guest.page.locator('[data-testid="rematch-btn"]'),
      ).toBeEnabled();
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("both players accepting rematch starts a new game", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));
      await playToCompletion(host, guest);

      // Both players click rematch
      await host.page.locator('[data-testid="rematch-btn"]').click();
      await guest.page.locator('[data-testid="rematch-btn"]').click();

      // Server resets room to "waiting" — both players return to waiting room
      await Promise.all([
        expect(
          host.page.getByRole("heading", { name: "Waiting Room" }),
        ).toBeVisible({ timeout: 15_000 }),
        expect(
          guest.page.getByRole("heading", { name: "Waiting Room" }),
        ).toBeVisible({ timeout: 15_000 }),
      ]);

      // Results screen should no longer be visible
      await expect(
        host.page.locator('[data-testid="game-results"]'),
      ).not.toBeVisible();
      await expect(
        guest.page.locator('[data-testid="game-results"]'),
      ).not.toBeVisible();

      // Both players should still be in the room together
      await expect(host.page.getByText("Alice")).toBeVisible();
      await expect(host.page.getByText("Bob")).toBeVisible();
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("back to lobby returns both players to lobby", async ({ browser }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));
      await playToCompletion(host, guest);

      // Host clicks "Back to Lobby"
      await host.page.locator('[data-testid="back-to-lobby"]').click();

      // Host should see the lobby menu
      await expect(
        host.page.getByRole("button", { name: "Create Room" }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        host.page.getByRole("button", { name: "Join Room" }),
      ).toBeVisible();

      // Guest stays on results screen (no rematch votes existed, so
      // resetToWaiting is not called — guest's view stays on "results")
      // but the guest is NOT stuck: they can leave themselves
      await expect(
        guest.page.locator('[data-testid="game-results"]'),
      ).toBeVisible();

      // Guest clicks "Back to Lobby" to return to the lobby menu
      await guest.page.locator('[data-testid="back-to-lobby"]').click();

      await expect(
        guest.page.getByRole("button", { name: "Create Room" }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        guest.page.getByRole("button", { name: "Join Room" }),
      ).toBeVisible();
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("rematch button cannot be clicked twice", async ({ browser }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));
      await playToCompletion(host, guest);

      const rematchBtn = host.page.locator('[data-testid="rematch-btn"]');

      // First click — vote registered
      await rematchBtn.click();
      await expect(rematchBtn).toBeDisabled();
      await expect(
        host.page.locator('[data-testid="rematch-status"]'),
      ).toHaveText("1/2 voted for rematch");

      // Attempt a second click (force: true bypasses Playwright's disabled check)
      await rematchBtn.click({ force: true });

      // Vote count should still be 1/2, not 2/2
      // Use a short wait to ensure no async update changes it
      await host.page.waitForTimeout(500);
      await expect(
        host.page.locator('[data-testid="rematch-status"]'),
      ).toHaveText("1/2 voted for rematch");
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });
});
