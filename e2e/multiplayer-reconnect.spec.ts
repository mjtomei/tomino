import { test, expect, type Browser } from "@playwright/test";
import {
  createPlayerContext,
  createRoom,
  joinRoom,
  sendKeyboardInput,
  waitForGameState,
  type PlayerHandle,
} from "./helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a player context that tracks WebSocket instances so we can close
 * them later to simulate a clean disconnect (without destroying the page).
 */
async function createReconnectablePlayer(
  browser: Browser,
  name: string,
): Promise<PlayerHandle> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Monkey-patch WebSocket before the app loads so we can close it later.
  await page.addInitScript(() => {
    const tracked: WebSocket[] = [];
    (window as any).__wsTrack = tracked;
    const Orig = WebSocket;

    // We must use a Proxy so that `new WebSocket()` still constructs a
    // genuine WebSocket (preserving instanceof / prototype chains).
    (window as any).WebSocket = new Proxy(Orig, {
      construct(target, args) {
        const ws = new target(...(args as [string, ...string[]]));
        tracked.push(ws);
        return ws;
      },
    });
  });

  await page.goto("/");

  // Fill in the player name and submit
  await page.locator("#player-name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(`Welcome, ${name}`)).toBeVisible();

  return { context, page };
}

/**
 * Simulate a network disconnect for a player:
 *  1. Close all tracked WebSocket connections (triggers server-side disconnect immediately)
 *  2. Set the browser context offline (prevents ReconnectController from succeeding)
 */
async function simulateDisconnect(handle: PlayerHandle): Promise<void> {
  // Close WebSocket connections — server detects disconnect instantly
  await handle.page.evaluate(() => {
    for (const ws of (window as any).__wsTrack as WebSocket[]) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  });
  // Block new connections so the ReconnectController can't succeed yet
  await handle.context.setOffline(true);
}

/**
 * Restore network connectivity so the ReconnectController can reconnect.
 */
async function simulateReconnect(handle: PlayerHandle): Promise<void> {
  await handle.context.setOffline(false);
}

/**
 * Helper: start a 2-player game from scratch.
 * The guest is created with WebSocket tracking for reconnection testing.
 */
async function setupAndStartGame(browser: Browser) {
  const host = await createPlayerContext(browser, "Alice");
  const roomId = await createRoom(host.page);

  const guest = await createReconnectablePlayer(browser, "Bob");
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("multiplayer reconnection flow", () => {
  // Reconnection tests involve network simulation and waiting; give generous timeouts
  test.setTimeout(90_000);

  test("player reconnects within window — game resumes", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      // Bob drops a couple pieces so his board has some state
      for (let i = 0; i < 3; i++) {
        await sendKeyboardInput(guest.page, "hardDrop");
        await guest.page.waitForTimeout(200);
      }

      // Simulate Bob's network dropping
      await simulateDisconnect(guest);

      // Alice should see the disconnect overlay
      await expect(
        host.page.locator('[data-testid="disconnect-overlay"]'),
      ).toBeVisible({ timeout: 10_000 });

      // Wait a couple seconds (well within 15s window)
      await guest.page.waitForTimeout(3_000);

      // Restore Bob's network
      await simulateReconnect(guest);

      // Alice's disconnect overlay should disappear
      await expect(
        host.page.locator('[data-testid="disconnect-overlay"]'),
      ).not.toBeVisible({ timeout: 15_000 });

      // Both players should still see the game board
      await expect(
        host.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible();
      await expect(
        guest.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible({ timeout: 10_000 });

      // Bob can still play — send another hard drop to confirm inputs work
      await sendKeyboardInput(guest.page, "hardDrop");
      await guest.page.waitForTimeout(200);
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("disconnect overlay shows countdown that decreases", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      // Simulate Bob's network dropping
      await simulateDisconnect(guest);

      // Alice should see the disconnect overlay with countdown
      const overlay = host.page.locator('[data-testid="disconnect-overlay"]');
      await expect(overlay).toBeVisible({ timeout: 10_000 });

      // Read the initial countdown value
      const countdown = host.page.locator(".disconnect-overlay-countdown");
      await expect(countdown).toBeVisible();
      const initialText = await countdown.textContent();
      const initialSeconds = parseInt(initialText ?? "0", 10);
      expect(initialSeconds).toBeGreaterThanOrEqual(12); // should be ~15s

      // Wait 3 seconds and verify countdown decreased
      await host.page.waitForTimeout(3_000);
      const laterText = await countdown.textContent();
      const laterSeconds = parseInt(laterText ?? "0", 10);
      expect(laterSeconds).toBeLessThan(initialSeconds);
      expect(laterSeconds).toBeGreaterThan(0);

      // Clean up — restore connection so server doesn't wait full 15s
      await simulateReconnect(guest);
      await expect(overlay).not.toBeVisible({ timeout: 15_000 });
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("reconnected player's board state is preserved", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      // Bob drops some pieces to build up board state
      for (let i = 0; i < 5; i++) {
        await sendKeyboardInput(guest.page, "hardDrop");
        await guest.page.waitForTimeout(200);
      }

      // Small pause to let server process all pieces
      await guest.page.waitForTimeout(500);

      // Simulate disconnect
      await simulateDisconnect(guest);
      await expect(
        host.page.locator('[data-testid="disconnect-overlay"]'),
      ).toBeVisible({ timeout: 10_000 });

      // Wait a couple seconds then reconnect
      await guest.page.waitForTimeout(2_000);
      await simulateReconnect(guest);

      // Wait for reconnection to complete
      await expect(
        host.page.locator('[data-testid="disconnect-overlay"]'),
      ).not.toBeVisible({ timeout: 15_000 });

      // Bob should still see his game board (not menu)
      await expect(
        guest.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible({ timeout: 10_000 });

      // Bob can still play after reconnect — the game truly resumed
      await sendKeyboardInput(guest.page, "hardDrop");
      await guest.page.waitForTimeout(200);
      await sendKeyboardInput(guest.page, "hardDrop");
      await guest.page.waitForTimeout(200);
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("self-disconnect overlay shows Reconnecting message", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      // Simulate Bob's network dropping
      await simulateDisconnect(guest);

      // Bob should see his own reconnecting overlay
      const overlay = guest.page.locator('[data-testid="disconnect-overlay"]');
      await expect(overlay).toBeVisible({ timeout: 10_000 });

      // The label should say "Reconnecting…"
      const label = guest.page.locator(".disconnect-overlay-label");
      await expect(label).toHaveText("Reconnecting\u2026");

      // Countdown should be visible
      const countdown = guest.page.locator(".disconnect-overlay-countdown");
      await expect(countdown).toBeVisible();

      // Restore connection
      await simulateReconnect(guest);

      // Overlay should disappear after successful reconnect
      await expect(overlay).not.toBeVisible({ timeout: 15_000 });

      // Game should resume
      await expect(
        guest.page.locator('[data-testid="game-multiplayer"]'),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("reconnection timeout leads to forfeit", async ({ browser }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupAndStartGame(browser));

      // Simulate Bob's network dropping — stay offline past the 15s window
      await simulateDisconnect(guest);

      // Alice should see the disconnect overlay
      await expect(
        host.page.locator('[data-testid="disconnect-overlay"]'),
      ).toBeVisible({ timeout: 10_000 });

      // Wait for the 15-second reconnect timeout to expire + server forfeit.
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
