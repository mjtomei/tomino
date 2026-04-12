import { test, expect } from "@playwright/test";

test.describe("event bursts", () => {
  test("event-bursts module is importable and produces burst geometry", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await expect(page).toHaveTitle("Tetris");

    const result = await page.evaluate(async () => {
      const mod = await import(
        "/src/atmosphere/event-bursts.ts"
      ).catch(() => null);
      if (!mod) return null;

      const palette = {
        backgroundGradient: ["#000", "#111"],
        particleColors: ["#ff0", "#0ff"],
        accent: "#fff",
        boardBg: "#000",
        panelBg: "#000",
        gridLine: "rgba(0,0,0,0.1)",
      };
      const sig = {
        status: "playing",
        level: 5,
        stackHeight: 4,
        combo: 3,
        b2b: 1,
        linesCleared: 10,
        pendingGarbage: 0,
      };

      const bursts = mod.detectBursts(
        [
          { type: "lineClear", magnitude: 2 },
          { type: "tSpin", magnitude: 2 },
          { type: "levelUp", magnitude: 6 },
        ],
        sig,
        0,
        palette,
      );
      const kinds = bursts.map((b: { kind: string }) => b.kind).sort();

      const rays = mod.starburstRays({
        id: 0,
        kind: "starburst",
        startedAt: 0,
        durationMs: 600,
        magnitude: 3,
        color: "#fff",
        secondaryColor: "#000",
      });

      const r = mod.rippleRadius(
        {
          id: 0,
          kind: "ripple",
          startedAt: 0,
          durationMs: 700,
          magnitude: 1,
          color: "#fff",
          secondaryColor: "#000",
        },
        350,
        200,
      );

      return { kinds, rayCount: rays.count, midRadius: r };
    });

    expect(result).not.toBeNull();
    expect(result!.kinds).toContain("ripple");
    expect(result!.kinds).toContain("sweep");
    expect(result!.kinds).toContain("starburst");
    expect(result!.kinds).toContain("chromatic");
    expect(result!.rayCount).toBeGreaterThanOrEqual(6);
    expect(result!.midRadius).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("event burst canvas mounts in the game board", async ({ page }) => {
    await page.goto("/");
    // Start a solo game via the start screen
    const start = page.getByRole("button", { name: /start/i }).first();
    if (await start.isVisible().catch(() => false)) {
      await start.click();
    }
    await expect(page.locator('[data-testid="event-burst-canvas"]')).toBeVisible();
  });
});
