import { test, expect, type Page } from "@playwright/test";
import { createPlayerContext, createRoom, joinRoom } from "./helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a 2-player room and return both handles + the room code. */
async function setupRoom(browser: import("@playwright/test").Browser) {
  const host = await createPlayerContext(browser, "Alice");
  const roomId = await createRoom(host.page);
  const guest = await createPlayerContext(browser, "Bob");
  await joinRoom(guest.page, roomId);
  return { host, guest, roomId };
}

/** Locate the default-strategy <select> inside the Targeting section. */
function targetingSelect(page: Page) {
  return page.locator("#targeting-default-strategy");
}

// ---------------------------------------------------------------------------
// Handicap settings — host
// ---------------------------------------------------------------------------

test.describe("room settings", () => {
  test.describe("handicap settings — host", () => {
    test("shows default handicap values", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        await expect(p.locator("#handicap-intensity")).toHaveValue("off");
        await expect(p.locator("#handicap-mode")).toHaveValue("boost");
        await expect(p.locator("#handicap-bias")).toHaveValue("0.7");
        await expect(p.locator("#handicap-delay")).not.toBeChecked();
        await expect(p.locator("#handicap-messiness")).not.toBeChecked();
        await expect(p.locator("#handicap-rating-visible")).toBeChecked();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("host can change intensity", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        for (const value of ["light", "standard", "heavy", "off"] as const) {
          await p.locator("#handicap-intensity").selectOption(value);
          await expect(p.locator("#handicap-intensity")).toHaveValue(value);
        }
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("dependent controls disabled when intensity is off", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        // Default intensity is "off"
        await expect(p.locator("#handicap-intensity")).toHaveValue("off");

        // Dependent controls should be disabled
        await expect(p.locator("#handicap-mode")).toBeDisabled();
        await expect(p.locator("#handicap-bias")).toBeDisabled();
        await expect(p.locator("#handicap-delay")).toBeDisabled();
        await expect(p.locator("#handicap-messiness")).toBeDisabled();

        // Intensity and Show Ratings should still be enabled
        await expect(p.locator("#handicap-intensity")).toBeEnabled();
        await expect(p.locator("#handicap-rating-visible")).toBeEnabled();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("dependent controls enabled when intensity is active", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        await p.locator("#handicap-intensity").selectOption("standard");

        await expect(p.locator("#handicap-mode")).toBeEnabled();
        await expect(p.locator("#handicap-bias")).toBeEnabled();
        await expect(p.locator("#handicap-delay")).toBeEnabled();
        await expect(p.locator("#handicap-messiness")).toBeEnabled();
        await expect(p.locator("#handicap-rating-visible")).toBeEnabled();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("host can change mode", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        // Enable handicap first
        await p.locator("#handicap-intensity").selectOption("standard");

        await p.locator("#handicap-mode").selectOption("symmetric");
        await expect(p.locator("#handicap-mode")).toHaveValue("symmetric");

        await p.locator("#handicap-mode").selectOption("boost");
        await expect(p.locator("#handicap-mode")).toHaveValue("boost");
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("host can adjust targeting bias slider", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        await p.locator("#handicap-intensity").selectOption("light");

        // Range inputs need the native value setter to trigger React onChange
        await p.locator("#handicap-bias").evaluate((el: HTMLInputElement) => {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, "value",
          )!.set!;
          setter.call(el, "0.5");
          el.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await expect(p.locator("#handicap-bias")).toHaveValue("0.5");
        await expect(p.locator(".handicap-slider-value")).toHaveText("0.50");
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("host can toggle delay and messiness checkboxes", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        await p.locator("#handicap-intensity").selectOption("heavy");

        // Toggle delay on
        await p.locator("#handicap-delay").check();
        await expect(p.locator("#handicap-delay")).toBeChecked();

        // Toggle messiness on
        await p.locator("#handicap-messiness").check();
        await expect(p.locator("#handicap-messiness")).toBeChecked();

        // Toggle both off
        await p.locator("#handicap-delay").uncheck();
        await expect(p.locator("#handicap-delay")).not.toBeChecked();
        await p.locator("#handicap-messiness").uncheck();
        await expect(p.locator("#handicap-messiness")).not.toBeChecked();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("host can toggle show ratings independently of intensity", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        // Intensity is "off" by default — show ratings should still be toggleable
        await expect(p.locator("#handicap-intensity")).toHaveValue("off");
        await expect(p.locator("#handicap-rating-visible")).toBeEnabled();

        await p.locator("#handicap-rating-visible").uncheck();
        await expect(p.locator("#handicap-rating-visible")).not.toBeChecked();

        await p.locator("#handicap-rating-visible").check();
        await expect(p.locator("#handicap-rating-visible")).toBeChecked();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("rapid intensity toggle correctly re-disables dependent controls", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        await p.locator("#handicap-intensity").selectOption("standard");
        await expect(p.locator("#handicap-mode")).toBeEnabled();

        await p.locator("#handicap-intensity").selectOption("off");
        await expect(p.locator("#handicap-mode")).toBeDisabled();
        await expect(p.locator("#handicap-bias")).toBeDisabled();
        await expect(p.locator("#handicap-delay")).toBeDisabled();
        await expect(p.locator("#handicap-messiness")).toBeDisabled();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Targeting settings — host
  // -------------------------------------------------------------------------

  test.describe("targeting settings — host", () => {
    test("shows default targeting values", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        // All four strategies should be checked
        await expect(p.getByLabel("Random")).toBeChecked();
        await expect(p.getByLabel("Attackers")).toBeChecked();
        await expect(p.getByLabel("KOs")).toBeChecked();
        await expect(p.getByLabel("Manual")).toBeChecked();

        // Default strategy should be "random"
        await expect(targetingSelect(p)).toHaveValue("random");
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("host can toggle strategy checkboxes", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        // Uncheck "Manual"
        await p.getByLabel("Manual").uncheck();
        await expect(p.getByLabel("Manual")).not.toBeChecked();

        // Re-check "Manual"
        await p.getByLabel("Manual").check();
        await expect(p.getByLabel("Manual")).toBeChecked();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("cannot disable last strategy", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        // Uncheck all except "random"
        await p.getByLabel("Attackers").uncheck();
        await p.getByLabel("KOs").uncheck();
        await p.getByLabel("Manual").uncheck();

        // Try to uncheck "Random" — should remain checked
        await p.getByLabel("Random").click();
        await expect(p.getByLabel("Random")).toBeChecked();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("disabling default strategy auto-switches default", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        // Default is "random"
        await expect(targetingSelect(p)).toHaveValue("random");

        // Uncheck "random" — default should switch to next enabled ("attackers")
        await p.getByLabel("Random").uncheck();
        await expect(p.getByLabel("Random")).not.toBeChecked();
        await expect(targetingSelect(p)).toHaveValue("attackers");
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("disabled strategy removed from default dropdown options", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        const sel = targetingSelect(p);

        // All 4 options initially
        await expect(sel.locator("option")).toHaveCount(4);

        // Uncheck "manual"
        await p.getByLabel("Manual").uncheck();
        await expect(sel.locator("option")).toHaveCount(3);

        // Re-check "manual"
        await p.getByLabel("Manual").check();
        await expect(sel.locator("option")).toHaveCount(4);
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("host can change default strategy", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = host.page;
        await targetingSelect(p).selectOption("kos");
        await expect(targetingSelect(p)).toHaveValue("kos");

        await targetingSelect(p).selectOption("attackers");
        await expect(targetingSelect(p)).toHaveValue("attackers");
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Non-host controls
  // -------------------------------------------------------------------------

  test.describe("non-host controls", () => {
    test("all handicap controls disabled for non-host", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = guest.page;
        await expect(p.locator("#handicap-intensity")).toBeDisabled();
        await expect(p.locator("#handicap-mode")).toBeDisabled();
        await expect(p.locator("#handicap-bias")).toBeDisabled();
        await expect(p.locator("#handicap-delay")).toBeDisabled();
        await expect(p.locator("#handicap-messiness")).toBeDisabled();
        await expect(p.locator("#handicap-rating-visible")).toBeDisabled();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("all targeting controls disabled for non-host", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        const p = guest.page;
        await expect(p.getByLabel("Random")).toBeDisabled();
        await expect(p.getByLabel("Attackers")).toBeDisabled();
        await expect(p.getByLabel("KOs")).toBeDisabled();
        await expect(p.getByLabel("Manual")).toBeDisabled();
        await expect(targetingSelect(p)).toBeDisabled();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Settings sync
  // -------------------------------------------------------------------------

  test.describe("settings sync", () => {
    test("handicap changes sync to non-host", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        // Host changes intensity
        await host.page.locator("#handicap-intensity").selectOption("heavy");

        // Non-host should see the updated value
        await expect(guest.page.locator("#handicap-intensity")).toHaveValue("heavy");
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("targeting changes sync to non-host", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        // Host unchecks "Manual"
        await host.page.getByLabel("Manual").uncheck();

        // Non-host should see "Manual" unchecked
        await expect(guest.page.getByLabel("Manual")).not.toBeChecked();

        // Host changes default strategy
        await targetingSelect(host.page).selectOption("kos");
        await expect(targetingSelect(guest.page)).toHaveValue("kos");
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });

    test("show ratings toggle syncs to non-host", async ({ browser }) => {
      const { host, guest } = await setupRoom(browser);
      try {
        // Host unchecks show ratings
        await host.page.locator("#handicap-rating-visible").uncheck();
        await expect(guest.page.locator("#handicap-rating-visible")).not.toBeChecked();

        // Host re-checks
        await host.page.locator("#handicap-rating-visible").check();
        await expect(guest.page.locator("#handicap-rating-visible")).toBeChecked();
      } finally {
        await host.context.close();
        await guest.context.close();
      }
    });
  });
});
