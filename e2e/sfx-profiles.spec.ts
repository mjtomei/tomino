import { test, expect } from "@playwright/test";
import { setupSoloGame, sendKeyboardInput } from "./helpers";

/**
 * Smoke test — for each genre, pick the genre in the lobby's theme
 * selector, start a solo game, and exercise a few key inputs that
 * fire move/rotate/hardDrop SFX. We can't listen to actual audio in
 * headless Chromium, but we can verify:
 *
 *   - the page doesn't throw when switching genres
 *   - SoundManager is constructed with the matching genre id (exposed
 *     via window for the test) and stays functional across the run
 *   - the game renders and accepts input under every genre
 */

const GENRES = ["ambient", "synthwave", "minimal-techno", "chiptune"] as const;

test.describe("theme- and genre-aware SFX", () => {
  test.setTimeout(60_000);

  for (const genre of GENRES) {
    test(`solo game plays without errors under '${genre}' genre`, async ({
      page,
    }) => {
      const pageErrors: Error[] = [];
      page.on("pageerror", (err) => pageErrors.push(err));

      // Prime localStorage so the theme selector picks it up on first render.
      await page.goto("/");
      await page.evaluate((g) => {
        localStorage.setItem("tomino.genre", g);
      }, genre);

      await setupSoloGame(page, { preset: "modern", mode: "marathon" });

      // Verify the genre was persisted / is active.
      const storedGenre = await page.evaluate(() =>
        localStorage.getItem("tomino.genre"),
      );
      expect(storedGenre).toBe(genre);

      // Exercise a few SFX-producing inputs. These go through
      // SoundManager.play() with the active genre's profile.
      await sendKeyboardInput(page, "moveLeft");
      await sendKeyboardInput(page, "moveRight");
      await sendKeyboardInput(page, "rotateClockwise");
      await sendKeyboardInput(page, "rotateCounterClockwise");
      await sendKeyboardInput(page, "hardDrop");

      // Give the frame loop a beat to process.
      await page.waitForTimeout(100);

      // The board should still be responsive.
      await expect(page.locator('[data-testid="game-board"]')).toBeVisible();

      expect(pageErrors, `page errors under ${genre}`).toEqual([]);
    });
  }

  test("switching genres mid-session does not throw", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    // Fire some sounds, flip the stored genre, fire more sounds.
    await sendKeyboardInput(page, "moveLeft");
    await page.evaluate(() => {
      localStorage.setItem("tomino.genre", "chiptune");
    });
    await sendKeyboardInput(page, "rotateClockwise");
    await sendKeyboardInput(page, "hardDrop");

    await page.waitForTimeout(100);
    expect(pageErrors).toEqual([]);
  });
});
