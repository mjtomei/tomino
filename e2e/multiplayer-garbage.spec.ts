import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  createRoom,
  joinRoom,
  waitForGameState,
  type PlayerHandle,
} from "./helpers";

/**
 * Create a player context with a WebSocket interceptor that captures all
 * incoming server messages AND exposes a helper to dispatch synthetic
 * server messages into the client (as if they came from the server).
 *
 * The interceptor is installed via `addInitScript` so it takes effect
 * before any WebSocket is created, letting us tap into the real game
 * socket that the client opens on page load.
 */
async function createInterceptedPlayer(
  browser: Browser,
  name: string,
): Promise<PlayerHandle> {
  const context: BrowserContext = await browser.newContext();

  await context.addInitScript(() => {
    const w = window as unknown as {
      __sockets: WebSocket[];
      __messages: { type: string; data: unknown }[];
    };
    w.__sockets = [];
    w.__messages = [];

    const OriginalWS = window.WebSocket;
    const originalAddEL = OriginalWS.prototype.addEventListener;

    // Track all WebSockets so we can dispatch synthetic messages to their
    // message handlers.
    const trackedListeners = new WeakMap<
      WebSocket,
      ((e: MessageEvent) => void)[]
    >();

    OriginalWS.prototype.addEventListener = function (
      this: WebSocket,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "message" && typeof listener === "function") {
        const fn = listener as (e: MessageEvent) => void;
        const existing = trackedListeners.get(this) ?? [];
        existing.push(fn);
        trackedListeners.set(this, existing);
        if (!w.__sockets.includes(this)) {
          w.__sockets.push(this);
        }

        const wrapped = (ev: MessageEvent) => {
          try {
            const parsed =
              typeof ev.data === "string" ? JSON.parse(ev.data) : null;
            if (parsed && typeof parsed.type === "string") {
              w.__messages.push({ type: parsed.type, data: parsed });
            }
          } catch {
            /* ignore */
          }
          fn(ev);
        };
        return originalAddEL.call(
          this,
          type,
          wrapped as EventListener,
          options,
        );
      }
      return originalAddEL.call(this, type, listener, options);
    };

    // Helper: dispatch a synthetic incoming message to all registered
    // message handlers on the most recently opened socket.
    (w as unknown as { __injectMessage: (payload: string) => void }).__injectMessage = (
      payload: string,
    ) => {
      const socket = w.__sockets[w.__sockets.length - 1];
      if (!socket) throw new Error("No WebSocket to inject into");
      const listeners = trackedListeners.get(socket) ?? [];
      const event = new MessageEvent("message", { data: payload });
      for (const l of listeners) l(event);
    };
  });

  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#player-name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(`Welcome, ${name}`)).toBeVisible();

  return { context, page };
}

/**
 * Inject a synthetic server message into the client's WebSocket, as if
 * the server had sent it. This exercises the client's message handlers
 * without requiring real gameplay to trigger the event.
 */
async function injectServerMessage(
  page: Page,
  message: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((json) => {
    const w = window as unknown as {
      __injectMessage: (payload: string) => void;
    };
    w.__injectMessage(json);
  }, JSON.stringify(message));
}

async function setupGame(browser: Browser) {
  const host = await createInterceptedPlayer(browser, "Alice");
  const roomId = await createRoom(host.page);

  const guest = await createInterceptedPlayer(browser, "Bob");
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

  return { host, guest, roomId };
}

test.describe("multiplayer garbage", () => {
  test.setTimeout(90_000);

  test("garbageQueued event updates the receiving player's garbage meter", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupGame(browser));

      // Extract Bob's player ID and the room ID from the intercepted
      // gameStarted message. The server sends `gameStarted` with the full
      // roomId and an initialStates map keyed by playerId. Bob is the one
      // whose PlayerInfo.name === "Bob" in the room's players list.
      const { bobPlayerId, roomId } = await guest.page.evaluate(() => {
        const w = window as unknown as {
          __messages: {
            type: string;
            data: {
              type: string;
              roomId?: string;
              room?: { id: string; players: { id: string; name: string }[] };
              initialStates?: Record<string, unknown>;
            };
          }[];
        };
        let roomId: string | null = null;
        let bobId: string | null = null;
        for (const m of w.__messages) {
          if (m.data.type === "gameStarted" && m.data.roomId) {
            roomId = m.data.roomId;
          }
          if (m.data.type === "roomUpdated" && m.data.room) {
            roomId = m.data.room.id;
            const bob = m.data.room.players.find((p) => p.name === "Bob");
            if (bob) bobId = bob.id;
          }
        }
        return { bobPlayerId: bobId, roomId };
      });
      expect(bobPlayerId).toBeTruthy();
      expect(roomId).toBeTruthy();

      // Initially, the garbage meter should NOT be visible on Bob's page
      // (no garbage pending).
      await expect(
        guest.page.locator('[data-testid="garbage-meter"]'),
      ).not.toBeVisible();

      // Inject a synthetic `garbageQueued` message into Bob's client.
      // This simulates the server broadcasting that Bob has 5 pending
      // garbage lines. If the client's `garbageQueued` handler is
      // correctly wired up, Bob's garbage meter will appear.
      await injectServerMessage(guest.page, {
        type: "garbageQueued",
        roomId: roomId,
        playerId: bobPlayerId,
        pendingGarbage: [{ lines: 5, gapColumn: 3 }],
      });

      // The garbage meter should now be visible on Bob's page
      await expect(
        guest.page.locator('[data-testid="garbage-meter"]'),
      ).toBeVisible({ timeout: 5_000 });

      // The bar should have non-zero height (5 lines pending)
      const bar = guest.page.locator('[data-testid="garbage-meter-bar"]');
      await expect(bar).toBeVisible();
      const height = await bar.evaluate(
        (el) => parseFloat((el as HTMLElement).style.height) || 0,
      );
      expect(height).toBeGreaterThan(0);

      // Now inject an update with a larger queue (10 lines) — the meter
      // should grow.
      await injectServerMessage(guest.page, {
        type: "garbageQueued",
        roomId: roomId,
        playerId: bobPlayerId,
        pendingGarbage: [
          { lines: 5, gapColumn: 3 },
          { lines: 5, gapColumn: 7 },
        ],
      });

      const largerHeight = await bar.evaluate(
        (el) => parseFloat((el as HTMLElement).style.height) || 0,
      );
      expect(largerHeight).toBeGreaterThan(height);

      // Inject an empty queue — the meter should disappear.
      await injectServerMessage(guest.page, {
        type: "garbageQueued",
        roomId: roomId,
        playerId: bobPlayerId,
        pendingGarbage: [],
      });

      await expect(
        guest.page.locator('[data-testid="garbage-meter"]'),
      ).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });

  test("garbageQueued for a different player does not update local meter", async ({
    browser,
  }) => {
    let host: PlayerHandle | undefined;
    let guest: PlayerHandle | undefined;

    try {
      ({ host, guest } = await setupGame(browser));

      const roomId = await guest.page.evaluate(() => {
        const w = window as unknown as {
          __messages: {
            data: { type: string; room?: { id: string } };
          }[];
        };
        for (const m of w.__messages) {
          if (m.data.type === "roomUpdated" && m.data.room) {
            return m.data.room.id;
          }
        }
        return null;
      });
      expect(roomId).toBeTruthy();

      // Inject a garbageQueued event targeting a DIFFERENT player
      // (not Bob). Bob's meter should remain invisible.
      await injectServerMessage(guest.page, {
        type: "garbageQueued",
        roomId: roomId,
        playerId: "some-other-player-id",
        pendingGarbage: [{ lines: 8, gapColumn: 5 }],
      });

      // Give the client a moment to process (should do nothing)
      await guest.page.waitForTimeout(500);

      await expect(
        guest.page.locator('[data-testid="garbage-meter"]'),
      ).not.toBeVisible();
    } finally {
      await host?.context.close();
      await guest?.context.close();
    }
  });
});
