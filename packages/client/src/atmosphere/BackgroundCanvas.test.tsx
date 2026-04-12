import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BackgroundCanvas } from "./BackgroundCanvas.js";
import { AtmosphereProvider } from "./use-atmosphere.js";
import { ThemeProvider } from "./theme-context.js";

describe("BackgroundCanvas", () => {
  it("mounts a canvas element with the test id", () => {
    const { getByTestId, unmount } = render(
      <ThemeProvider>
        <AtmosphereProvider>
          <BackgroundCanvas />
        </AtmosphereProvider>
      </ThemeProvider>,
    );
    const el = getByTestId("background-canvas");
    expect(el.tagName).toBe("CANVAS");
    unmount();
    cleanup();
  });

  it("mounts with an override atmosphere state without crashing", () => {
    const override = {
      intensity: 0.5,
      danger: 0,
      momentum: 0.3,
      events: [],
    };
    const { getByTestId, unmount } = render(
      <ThemeProvider>
        <AtmosphereProvider>
          <BackgroundCanvas override={override} />
        </AtmosphereProvider>
      </ThemeProvider>,
    );
    expect(getByTestId("background-canvas").tagName).toBe("CANVAS");
    unmount();
    cleanup();
  });
});
