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
 * Helper: start a 3-player game from scratch.
 * Returns all three player handles and the room code.
 */
async function setupAndStart3PlayerGame(browser: Browser) {
  const player1 = await createPlayerContext(browser, "Alice");
  const roomId = await createRoom(player1.page);

  const player2 = await createPlayerContext(browser, "Bob");
  await joinRoom(player2.page, roomId);

  const player3 = await createPlayerContext(browser, "Charlie");
  await joinRoom(player3.page, roomId);

  // Host clicks "Start Game"
  const startBtn = player1.page.getByRole("button", { name: "Start Game" });
  await expect(startBtn).toBeEnabled();
  await startBtn.click();

  // Wait for game board to appear on all three pages
  await Promise.all([
    waitForGameState(player1.page, '[data-testid="game-multiplayer"]', {
      timeout: 15_000,
    }),
    waitForGameState(player2.page, '[data-testid="game-multiplayer"]', {
      timeout: 15_000,
    }),
    waitForGameState(player3.page, '[data-testid="game-multiplayer"]', {
      timeout: 15_000,
    }),
  ]);

  return { player1, player2, player3, roomId };
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

test.describe("3-player multiplayer", () => {
  // 3 browser contexts are heavier — use generous timeout
  test.setTimeout(120_000);

  test("three players can join a room and see each other", async ({
    browser,
  }) => {
    const player1 = await createPlayerContext(browser, "Alice");
    const player2 = await createPlayerContext(browser, "Bob");
    let player3: PlayerHandle | undefined;

    try {
      const roomId = await createRoom(player1.page);
      await joinRoom(player2.page, roomId);

      player3 = await createPlayerContext(browser, "Charlie");
      await joinRoom(player3.page, roomId);

      // All three players should see all three names
      for (const player of [player1, player2, player3]) {
        await expect(player.page.getByText("Alice")).toBeVisible();
        await expect(player.page.getByText("Bob")).toBeVisible();
        await expect(player.page.getByText("Charlie")).toBeVisible();
      }

      // Player count should show "3/"
      for (const player of [player1, player2, player3]) {
        await expect(player.page.getByText(/3\//)).toBeVisible();
      }

      // Host's Start Game button should be enabled
      await expect(
        player1.page.getByRole("button", { name: "Start Game" }),
      ).toBeEnabled();
    } finally {
      await player1.context.close();
      await player2.context.close();
      await player3?.context.close();
    }
  });

  test("3-player game: first elimination shows spectator overlay only for eliminated player", async ({
    browser,
  }) => {
    let player1: PlayerHandle | undefined;
    let player2: PlayerHandle | undefined;
    let player3: PlayerHandle | undefined;

    try {
      ({ player1, player2, player3 } =
        await setupAndStart3PlayerGame(browser));

      // Player 1 hard-drops rapidly to top out
      await forceTopOut(player1.page);

      // Player 1 should see the spectator overlay
      await expect(
        player1.page.locator('[data-testid="spectator-overlay"]'),
      ).toBeVisible({ timeout: 15_000 });

      // Spectator overlay should show "ELIMINATED" and "3rd" placement
      await expect(
        player1.page.locator('[data-testid="spectator-overlay"]'),
      ).toContainText("ELIMINATED");
      await expect(
        player1.page.locator('[data-testid="spectator-overlay"]'),
      ).toContainText("3rd");

      // Players 2 and 3 should NOT see the spectator overlay
      await expect(
        player2.page.locator('[data-testid="spectator-overlay"]'),
      ).not.toBeVisible();
      await expect(
        player3.page.locator('[data-testid="spectator-overlay"]'),
      ).not.toBeVisible();

      // Players 2 and 3 should still see the active game
      await expect(
        player2.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible();
      await expect(
        player3.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible();

      // Verify Players 2 and 3 can still interact (send a hard drop each)
      await sendKeyboardInput(player2.page, "hardDrop");
      await sendKeyboardInput(player3.page, "hardDrop");

      // They should still be in the active game (no results screen yet)
      await expect(
        player2.page.locator('[data-testid="game-results"]'),
      ).not.toBeVisible();
      await expect(
        player3.page.locator('[data-testid="game-results"]'),
      ).not.toBeVisible();
    } finally {
      await player1?.context.close();
      await player2?.context.close();
      await player3?.context.close();
    }
  });

  test("3-player game: second elimination ends game and shows correct placements", async ({
    browser,
  }) => {
    let player1: PlayerHandle | undefined;
    let player2: PlayerHandle | undefined;
    let player3: PlayerHandle | undefined;

    try {
      ({ player1, player2, player3 } =
        await setupAndStart3PlayerGame(browser));

      // Player 1 tops out first (3rd place)
      await forceTopOut(player1.page);
      await expect(
        player1.page.locator('[data-testid="spectator-overlay"]'),
      ).toBeVisible({ timeout: 15_000 });

      // Player 2 tops out second (2nd place)
      await forceTopOut(player2.page);

      // All three should see the results screen
      await expect(
        player1.page.locator('[data-testid="game-results"]'),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        player2.page.locator('[data-testid="game-results"]'),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        player3.page.locator('[data-testid="game-results"]'),
      ).toBeVisible({ timeout: 15_000 });

      // Player 3 (last standing) sees VICTORY and 1st
      await expect(player3.page.locator(".results-title")).toHaveText(
        "VICTORY",
      );
      await expect(
        player3.page.locator('[data-testid="results-placement"]'),
      ).toContainText("1st");

      // Player 2 sees DEFEATED and 2nd
      await expect(player2.page.locator(".results-title")).toHaveText(
        "DEFEATED",
      );
      await expect(
        player2.page.locator('[data-testid="results-placement"]'),
      ).toContainText("2nd");

      // Player 1 sees DEFEATED and 3rd
      await expect(player1.page.locator(".results-title")).toHaveText(
        "DEFEATED",
      );
      await expect(
        player1.page.locator('[data-testid="results-placement"]'),
      ).toContainText("3rd");

      // Every player's results table has 3 rows with all 3 names
      for (const player of [player1, player2, player3]) {
        await expect(
          player.page.locator(
            '[data-testid="results-table"] .results-row',
          ),
        ).toHaveCount(3);

        const table = player.page.locator('[data-testid="results-table"]');
        await expect(table).toContainText("Alice");
        await expect(table).toContainText("Bob");
        await expect(table).toContainText("Charlie");
      }
    } finally {
      await player1?.context.close();
      await player2?.context.close();
      await player3?.context.close();
    }
  });

  test("3-player game: opponent boards are shown for all opponents", async ({
    browser,
  }) => {
    let player1: PlayerHandle | undefined;
    let player2: PlayerHandle | undefined;
    let player3: PlayerHandle | undefined;

    try {
      ({ player1, player2, player3 } =
        await setupAndStart3PlayerGame(browser));

      // Each player should see exactly 2 opponent boards
      for (const player of [player1, player2, player3]) {
        await expect(
          player.page.locator('[data-testid="opponent-board"]'),
        ).toHaveCount(2);
      }
    } finally {
      await player1?.context.close();
      await player2?.context.close();
      await player3?.context.close();
    }
  });

  test("targeting selector appears in 3-player game", async ({ browser }) => {
    let player1: PlayerHandle | undefined;
    let player2: PlayerHandle | undefined;
    let player3: PlayerHandle | undefined;

    try {
      ({ player1, player2, player3 } =
        await setupAndStart3PlayerGame(browser));

      // Targeting selector should be visible on all three pages
      for (const player of [player1, player2, player3]) {
        await expect(
          player.page.locator('[data-testid="targeting-selector"]'),
        ).toBeVisible();
      }

      // Verify strategy buttons are present (at minimum "Random")
      for (const player of [player1, player2, player3]) {
        await expect(
          player.page.locator('[data-testid="targeting-btn-random"]'),
        ).toBeVisible();
      }

      // Click a different strategy button on Player 1 and verify it becomes active
      const attackersBtn = player1.page.locator(
        '[data-testid="targeting-btn-attackers"]',
      );
      await attackersBtn.click();

      // Active button gets background #4040d0 and font-weight bold
      await expect(attackersBtn).toHaveCSS("font-weight", "700");
      await expect(attackersBtn).toHaveCSS(
        "background-color",
        "rgb(64, 64, 208)",
      );
    } finally {
      await player1?.context.close();
      await player2?.context.close();
      await player3?.context.close();
    }
  });
});
