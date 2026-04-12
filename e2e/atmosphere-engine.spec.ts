import { test, expect } from "@playwright/test";
import { setupSoloGame, sendKeyboardInput } from "./helpers";

interface AtmosphereReadout {
  intensity: number;
  danger: number;
  momentum: number;
  events: { type: string; magnitude: number }[];
}

async function readAtmosphere(page: import("@playwright/test").Page) {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __atmosphere__?: AtmosphereReadout;
    };
    return w.__atmosphere__ ?? null;
  });
}

async function waitForAtmosphere(
  page: import("@playwright/test").Page,
): Promise<AtmosphereReadout> {
  await page.waitForFunction(
    () =>
      (window as unknown as { __atmosphere__?: unknown }).__atmosphere__ !=
      null,
    null,
    { timeout: 5000 },
  );
  const a = await readAtmosphere(page);
  if (!a) throw new Error("atmosphere not exposed");
  return a;
}

test.describe("atmosphere engine — data layer contract", () => {
  test.setTimeout(60_000);

  test("exposes window.__atmosphere__ and reflects game progression", async ({
    page,
  }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    // --- Calm start: empty board, level 1. danger/momentum are 0.
    const calm = await waitForAtmosphere(page);
    expect(calm.danger).toBe(0);
    expect(calm.momentum).toBe(0);
    expect(calm.intensity).toBeLessThan(0.25);

    // --- Build a stack with hard drops so danger climbs.
    // Each hard drop locks a piece immediately. Alternate across columns
    // so we build height rather than clearing lines.
    for (let i = 0; i < 30; i++) {
      if (i % 2 === 0) {
        await sendKeyboardInput(page, "moveLeft");
        await sendKeyboardInput(page, "moveLeft");
      } else {
        await sendKeyboardInput(page, "moveRight");
        await sendKeyboardInput(page, "moveRight");
      }
      await sendKeyboardInput(page, "hardDrop");
    }

    // Give the atmosphere loop a few ticks to catch up.
    await page.waitForTimeout(200);

    const mid = await readAtmosphere(page);
    expect(mid).not.toBeNull();
    expect(mid!.danger).toBeGreaterThan(calm.danger);
    expect(mid!.intensity).toBeGreaterThan(calm.intensity);

    // --- Push the stack even higher toward top-out.
    for (let i = 0; i < 20; i++) {
      if (i % 2 === 0) {
        await sendKeyboardInput(page, "moveLeft");
      } else {
        await sendKeyboardInput(page, "moveRight");
      }
      await sendKeyboardInput(page, "hardDrop");
    }
    await page.waitForTimeout(200);

    const danger = await readAtmosphere(page);
    expect(danger).not.toBeNull();
    expect(danger!.danger).toBeGreaterThan(mid!.danger);
    // All continuous outputs stay in [0,1].
    expect(danger!.intensity).toBeGreaterThanOrEqual(0);
    expect(danger!.intensity).toBeLessThanOrEqual(1);
    expect(danger!.danger).toBeGreaterThanOrEqual(0);
    expect(danger!.danger).toBeLessThanOrEqual(1);
    expect(danger!.momentum).toBeGreaterThanOrEqual(0);
    expect(danger!.momentum).toBeLessThanOrEqual(1);
  });
});
