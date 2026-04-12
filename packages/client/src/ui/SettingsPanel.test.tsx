import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel } from "./SettingsPanel.js";
import { SettingsProvider } from "../atmosphere/settings-context.js";
import { MusicProvider } from "../audio/use-music.js";
import { ThemeProvider } from "../atmosphere/theme-context.js";

function renderPanel(onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <ThemeProvider>
        <MusicProvider>
          <SettingsProvider>
            <SettingsPanel onClose={onClose} />
          </SettingsProvider>
        </MusicProvider>
      </ThemeProvider>,
    ),
  };
}

describe("SettingsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders all control groups", () => {
    renderPanel();
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
    expect(screen.getByTestId("music-volume-slider")).toBeInTheDocument();
    expect(screen.getByTestId("sfx-volume-slider")).toBeInTheDocument();
    expect(screen.getByTestId("master-mute-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("effects-intensity-group")).toBeInTheDocument();
    expect(screen.getByTestId("theme-swatches")).toBeInTheDocument();
    expect(screen.getByTestId("genre-list")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.click(screen.getByTestId("settings-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape", () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("updates sfx volume slider", () => {
    renderPanel();
    const slider = screen.getByTestId("sfx-volume-slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0.3" } });
    expect(slider.value).toBe("0.3");
    expect(localStorage.getItem("tetris.sfx.volume")).toBe("0.3");
  });

  it("toggles master mute", async () => {
    const user = userEvent.setup();
    renderPanel();
    const toggle = screen.getByTestId("master-mute-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(localStorage.getItem("tetris.master.muted")).toBe("1");
  });

  it("selects effects intensity", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId("effects-subtle"));
    expect(localStorage.getItem("tetris.effects.intensity")).toBe("subtle");
  });

  it("selects a theme swatch", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId("theme-swatch-aurora"));
    expect(localStorage.getItem("tetris.theme")).toBe("aurora");
  });

  it("selects a genre", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId("genre-option-chiptune"));
    expect(localStorage.getItem("tetris.genre")).toBe("chiptune");
  });
});
