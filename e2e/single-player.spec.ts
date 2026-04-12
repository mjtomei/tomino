import { test, expect } from "@playwright/test";
import {
  setupSoloGame,
  readScoreDisplay,
  sendKeyboardInput,
} from "./helpers";

test.describe("single-player game modes", () => {
  test.setTimeout(60_000);

  // -------------------------------------------------------------------------
  // Game mode startup tests
  // -------------------------------------------------------------------------

  test("marathon modern shows score, level, and lines", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    const stats = await readScoreDisplay(page);
    expect(stats.score).toBeGreaterThanOrEqual(0);
    expect(stats.level).toBeGreaterThanOrEqual(0);
    expect(stats.lines).toBeGreaterThanOrEqual(0);
  });

  test("sprint mode shows timer and lines remaining", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "sprint" });

    await expect(
      page.locator('[data-testid="stat-timer"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="stat-linesRemaining"]'),
    ).toBeVisible();

    const stats = await readScoreDisplay(page);
    expect(stats.remaining).toBe(40);
  });

  test("ultra mode shows timer and score", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "ultra" });

    await expect(
      page.locator('[data-testid="stat-timer"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="stat-score"]'),
    ).toBeVisible();

    // Timer counts down from 3:00.00 — by the time we read it, a few
    // frames may have elapsed, so just verify it's near 3 minutes.
    const stats = await readScoreDisplay(page);
    expect(stats.time).toMatch(/^[23]:\d{2}\.\d{2}$/);
  });

  test("zen mode shows lines and score, no game over on top-out", async ({
    page,
  }) => {
    await setupSoloGame(page, { preset: "modern", mode: "zen" });

    // Verify lines and score stats are shown
    await expect(
      page.locator('[data-testid="stat-lines"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="stat-score"]'),
    ).toBeVisible();

    // Hard-drop 30 pieces to fill the board past row 20
    for (let i = 0; i < 30; i++) {
      await sendKeyboardInput(page, "hardDrop");
      await page.waitForTimeout(150);
    }

    // Verify no game-over overlay appeared
    await expect(
      page.locator('[data-testid="gameover-overlay"]'),
    ).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Piece interaction tests
  // -------------------------------------------------------------------------

  test("hard drop increases score", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    const before = await readScoreDisplay(page);
    expect(before.score).toBe(0);

    await sendKeyboardInput(page, "hardDrop");
    await page.waitForTimeout(200);

    const after = await readScoreDisplay(page);
    expect(after.score).toBeGreaterThan(0);
  });

  test("hold piece swaps current piece", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    // Hold display container is visible (modern has holdEnabled)
    await expect(
      page.locator('[data-testid="hold-display"]'),
    ).toBeVisible();

    // No piece held yet
    await expect(
      page.locator('[data-testid="hold-piece"]'),
    ).not.toBeVisible();

    // Press hold key
    await sendKeyboardInput(page, "hold");
    await page.waitForTimeout(200);

    // Now a piece should be in the hold slot
    await expect(
      page.locator('[data-testid="hold-piece"]'),
    ).toBeVisible();
  });

  test("next queue shows preview pieces", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    await expect(
      page.locator('[data-testid="next-queue"]'),
    ).toBeVisible();

    // Modern preset has previewCount: 5, so at least 1 preview piece
    const pieces = page.locator('[data-testid="next-queue"] [data-testid^="mini-piece-"]');
    await expect(pieces.first()).toBeVisible();
    expect(await pieces.count()).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Game state tests
  // -------------------------------------------------------------------------

  test("pause and unpause", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    // Pause the game
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="pause-overlay"]'),
    ).toBeVisible();

    // Unpause the game
    await page.keyboard.press("Escape");
    await expect(
      page.locator('[data-testid="pause-overlay"]'),
    ).not.toBeVisible();

    // Game continues — score display still visible
    await expect(
      page.locator('[data-testid="score-display"]'),
    ).toBeVisible();
  });

  test("game over on top-out shows overlay", async ({ page }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    // Hard-drop pieces rapidly to fill the board
    for (let i = 0; i < 25; i++) {
      await sendKeyboardInput(page, "hardDrop");
      await page.waitForTimeout(100);
    }

    // Game-over overlay should appear
    await expect(
      page.locator('[data-testid="gameover-overlay"]'),
    ).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // Ruleset selection tests
  // -------------------------------------------------------------------------

  test("classic preset disables hold and hard drop", async ({ page }) => {
    await setupSoloGame(page, { preset: "classic", mode: "marathon" });

    // Classic has holdEnabled: false — hold display should not exist
    await expect(
      page.locator('[data-testid="hold-display"]'),
    ).not.toBeVisible();

    // Press hold key — hold-piece should not appear
    await sendKeyboardInput(page, "hold");
    await page.waitForTimeout(200);
    await expect(
      page.locator('[data-testid="hold-piece"]'),
    ).not.toBeVisible();

    // Classic has hardDropEnabled: false — Space should not change score
    const before = await readScoreDisplay(page);
    await sendKeyboardInput(page, "hardDrop");
    await page.waitForTimeout(200);
    const after = await readScoreDisplay(page);
    expect(after.score).toBe(before.score);
  });
});
