import { test, expect, type Browser } from "@playwright/test";
import {
  createPlayerContext,
  createRoom,
  joinRoom,
  waitForGameState,
  type PlayerHandle,
} from "./helpers";

async function setupAndStartGame(browser: Browser) {
  const host = await createPlayerContext(browser, "Alice");
  const roomId = await createRoom(host.page);

  const guest = await createPlayerContext(browser, "Bob");
  await joinRoom(guest.page, roomId);

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

test.describe("multiplayer emotes", () => {
  test.setTimeout(60_000);

  test("emote sent by one player appears on their opponent board for the other player", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      // Alice clicks the fire emote button
      await host.page
        .locator('[data-testid="emote-button-fire"]')
        .click();

      // From Bob's perspective, Alice's opponent board should show the
      // emote marker (data-emote attribute set on the canvas element).
      const aliceBoardOnBob = guest.page.locator(
        '[data-testid="opponent-board"][data-player-id="Alice"] [data-testid="opponent-canvas"]',
      );
      await expect(aliceBoardOnBob).toHaveAttribute("data-emote", "fire", {
        timeout: 5_000,
      });
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("emote picker is visible during multiplayer game", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      await expect(
        host.page.locator('[data-testid="emote-picker"]'),
      ).toBeVisible();
      await expect(
        host.page.locator('[data-testid="emote-button-thumbsUp"]'),
      ).toBeVisible();
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });
});
