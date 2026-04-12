import { test, expect } from "@playwright/test";
import { setupSoloGame, sendKeyboardInput } from "./helpers";

interface FlowReadout {
  active: boolean;
  level: number;
  sustainedMs: number;
}

interface AtmosphereReadout {
  intensity: number;
  danger: number;
  momentum: number;
  flow: FlowReadout;
}

async function readAtmosphere(page: import("@playwright/test").Page) {
  return await page.evaluate(() => {
    const w = window as unknown as { __atmosphere__?: AtmosphereReadout };
    return w.__atmosphere__ ?? null;
  });
}

test.describe("flow state — Zone mode data contract", () => {
  test.setTimeout(60_000);

  test("exposes flow field with safe defaults and tracks play", async ({
    page,
  }) => {
    await setupSoloGame(page, { preset: "modern", mode: "marathon" });

    await page.waitForFunction(
      () =>
        (window as unknown as { __atmosphere__?: unknown }).__atmosphere__ !=
        null,
      null,
      { timeout: 5000 },
    );

    const initial = await readAtmosphere(page);
    expect(initial).not.toBeNull();
    expect(initial!.flow).toBeDefined();
    expect(initial!.flow.active).toBe(false);
    expect(initial!.flow.level).toBe(0);
    expect(initial!.flow.sustainedMs).toBe(0);

    // Drop a few pieces to confirm the flow field remains well-formed
    // through real game updates. We are not asserting flow.active=true
    // here — flow detection sensitivity is a subjective/feel setting
    // exercised by unit tests.
    for (let i = 0; i < 10; i++) {
      await sendKeyboardInput(page, i % 2 === 0 ? "moveLeft" : "moveRight");
      await sendKeyboardInput(page, "hardDrop");
    }
    await page.waitForTimeout(200);

    const after = await readAtmosphere(page);
    expect(after).not.toBeNull();
    expect(after!.flow).toBeDefined();
    expect(typeof after!.flow.active).toBe("boolean");
    expect(after!.flow.level).toBeGreaterThanOrEqual(0);
    expect(after!.flow.level).toBeLessThanOrEqual(1);
  });
});
