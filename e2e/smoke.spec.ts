import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("app loads with correct title and no console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");

    await expect(page).toHaveTitle("Tomino");

    // The first view is the player name input screen
    await expect(page.locator("#root")).not.toBeEmpty();

    expect(errors).toEqual([]);
  });
});
