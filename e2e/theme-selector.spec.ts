import { test, expect } from "@playwright/test";

test.describe("theme selector", () => {
  test("selects a theme and genre, persists across reload", async ({ page }) => {
    await page.goto("/");
    await page.locator("#player-name").fill("ThemeTester");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByTestId("start-screen")).toBeVisible();
    await expect(page.getByTestId("theme-selector")).toBeVisible();

    await page.getByTestId("theme-select").selectOption("aurora");
    await page.getByTestId("genre-select").selectOption("synthwave");

    await expect(page.getByTestId("theme-select")).toHaveValue("aurora");
    await expect(page.getByTestId("genre-select")).toHaveValue("synthwave");

    const stored = await page.evaluate(() => ({
      theme: localStorage.getItem("tetris.theme"),
      genre: localStorage.getItem("tetris.genre"),
    }));
    expect(stored).toEqual({ theme: "aurora", genre: "synthwave" });

    await page.reload();
    await page.locator("#player-name").fill("ThemeTester");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByTestId("theme-select")).toHaveValue("aurora");
    await expect(page.getByTestId("genre-select")).toHaveValue("synthwave");
  });
});
