import { test, expect } from "@playwright/test";
import { setupSoloGame } from "./helpers";

test.describe("board life — idle animations", () => {
  test.setTimeout(30_000);

  test("board canvas keeps repainting during idle with no input", async ({
    page,
  }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    // Instrument the canvas so we can count paint calls across a window.
    await page.evaluate(() => {
      const canvas = document.querySelector(
        '[data-testid="board-canvas"]',
      ) as HTMLCanvasElement | null;
      if (!canvas) throw new Error("board-canvas not found");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      const w = window as unknown as { __boardLifeFills__?: number };
      w.__boardLifeFills__ = 0;
      const orig = ctx.fillRect.bind(ctx);
      ctx.fillRect = (x: number, y: number, ww: number, h: number) => {
        (window as unknown as { __boardLifeFills__: number })
          .__boardLifeFills__++;
        return orig(x, y, ww, h);
      };
    });

    const readFills = () =>
      page.evaluate(
        () =>
          (window as unknown as { __boardLifeFills__?: number })
            .__boardLifeFills__ ?? 0,
      );

    const start = await readFills();
    await page.waitForTimeout(600);
    const mid = await readFills();
    await page.waitForTimeout(600);
    const end = await readFills();

    // rAF should keep firing → paint count climbs even with no input.
    expect(mid).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(mid);
  });

  test("pure board-life module exposes stable baseline at t=0", async ({
    page,
  }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const mod = await import("/src/atmosphere/board-life.ts").catch(
        () => null,
      );
      if (!mod) return null;
      return {
        shimmer: mod.computeShimmer("#00D4D4", 0, 0, 3),
        breathe: mod.computeBreathe(0, 1),
        glintInactive: mod.computeGlint(0, 10, 20).active,
      };
    });
    expect(result).not.toBeNull();
    expect(result!.shimmer.toLowerCase()).toBe("#00d4d4");
    expect(result!.breathe).toBe(1);
    expect(result!.glintInactive).toBe(false);
  });
});
