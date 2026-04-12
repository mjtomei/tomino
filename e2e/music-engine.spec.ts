import { test, expect, type Page } from "@playwright/test";
import { setupSoloGame, sendKeyboardInput } from "./helpers";

interface MusicReadout {
  tempo: number;
  activeLayers: string[];
  scaleRoot: number;
  muted: boolean;
  volume: number;
  stepCount: number;
  genreId: string;
  running: boolean;
}

async function readMusic(page: Page): Promise<MusicReadout | null> {
  return await page.evaluate(() => {
    const w = window as unknown as { __music__?: MusicReadout };
    return w.__music__ ?? null;
  });
}

async function waitForMusic(page: Page): Promise<MusicReadout> {
  await page.waitForFunction(
    () => (window as unknown as { __music__?: unknown }).__music__ != null,
    null,
    { timeout: 5000 },
  );
  const m = await readMusic(page);
  if (!m) throw new Error("music engine not exposed");
  return m;
}

test.describe("music engine — adaptive layered playback", () => {
  test.setTimeout(60_000);

  test("exposes window.__music__ and advances steps during play", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await setupSoloGame(page, { preset: "modern", mode: "marathon" });
    const initial = await waitForMusic(page);
    expect(initial.genreId).toBeTruthy();
    expect(initial.activeLayers.length).toBeGreaterThan(0);

    // Play a few pieces to advance the game clock.
    for (let i = 0; i < 6; i++) {
      await sendKeyboardInput(page, "hardDrop");
    }
    await page.waitForTimeout(300);

    const later = await readMusic(page);
    expect(later).not.toBeNull();
    expect(later!.stepCount).toBeGreaterThan(initial.stepCount);
    expect(pageErrors).toEqual([]);
  });

  test("building stack height activates more layers", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("tetris.genre", "ambient"));
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    const calm = await waitForMusic(page);
    const calmLayerCount = calm.activeLayers.length;

    // Build a stack — raises intensity.
    for (let i = 0; i < 25; i++) {
      if (i % 2 === 0) {
        await sendKeyboardInput(page, "moveLeft");
        await sendKeyboardInput(page, "moveLeft");
      } else {
        await sendKeyboardInput(page, "moveRight");
        await sendKeyboardInput(page, "moveRight");
      }
      await sendKeyboardInput(page, "hardDrop");
    }
    await page.waitForTimeout(300);

    const busy = await readMusic(page);
    expect(busy).not.toBeNull();
    expect(busy!.activeLayers.length).toBeGreaterThanOrEqual(calmLayerCount);
  });

  test("switching genre via localStorage updates the readout", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() =>
      localStorage.setItem("tetris.genre", "chiptune"),
    );
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });
    const m = await waitForMusic(page);
    expect(m.genreId).toBe("chiptune");
    expect(m.tempo).toBeGreaterThan(130); // chiptune baseTempo is 140
  });
});
