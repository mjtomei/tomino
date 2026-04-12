import { test, expect } from "@playwright/test";

test.describe("particle system", () => {
  test("app loads with particle engine available and no console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await expect(page).toHaveTitle("Tetris");
    await expect(page.locator("#root")).not.toBeEmpty();

    // Sanity check: create a ParticleSystem in-page and emit/update to
    // verify the module is importable from the built client bundle path.
    const count = await page.evaluate(async () => {
      const mod = await import(
        "/src/atmosphere/particle-system.ts"
      ).catch(() => null);
      if (!mod) return -1;
      const sys = new mod.ParticleSystem();
      sys.emit(
        {
          shape: "circle",
          color: "#fff",
          lifetime: 1,
          velocity: { x: 10, y: 0 },
          size: 2,
        },
        { x: 0, y: 0 },
        5,
      );
      sys.update(0.05);
      return sys.count();
    });
    expect(count).toBe(5);
    expect(errors).toEqual([]);
  });
});
