import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  HandicapSettings,
  DEFAULT_HANDICAP_SETTINGS,
  type HandicapSettingsValues,
} from "../ui/HandicapSettings";

function renderSettings(
  overrides?: Partial<HandicapSettingsValues>,
  disabled = false,
) {
  const onChange = vi.fn();
  const settings = { ...DEFAULT_HANDICAP_SETTINGS, ...overrides };
  render(
    <HandicapSettings settings={settings} onChange={onChange} disabled={disabled} />,
  );
  return { onChange, settings };
}

describe("HandicapSettings", () => {
  it("renders all intensity options", () => {
    renderSettings();
    const select = screen.getByLabelText("Intensity") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(["off", "light", "standard", "heavy"]);
  });

  it("defaults to boost only mode", () => {
    renderSettings();
    const select = screen.getByLabelText("Mode") as HTMLSelectElement;
    expect(select.value).toBe("boost");
  });

  it("allows changing to symmetric mode", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSettings({ intensity: "standard" });
    await user.selectOptions(screen.getByLabelText("Mode"), "symmetric");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "symmetric" }),
    );
  });

  it("defaults delay toggle to off", () => {
    renderSettings();
    const checkbox = screen.getByLabelText("Delay Modifier") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("defaults messiness toggle to off", () => {
    renderSettings();
    const checkbox = screen.getByLabelText("Messiness Modifier") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("calls onChange when delay toggle is checked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSettings({ intensity: "standard" });
    await user.click(screen.getByLabelText("Delay Modifier"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ delayEnabled: true }),
    );
  });

  it("calls onChange when messiness toggle is checked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSettings({ intensity: "standard" });
    await user.click(screen.getByLabelText("Messiness Modifier"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ messinessEnabled: true }),
    );
  });

  it("calls onChange when intensity changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSettings();
    await user.selectOptions(screen.getByLabelText("Intensity"), "heavy");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ intensity: "heavy" }),
    );
  });

  it("shows rating visibility toggle", () => {
    renderSettings();
    const checkbox = screen.getByLabelText("Show Ratings") as HTMLInputElement;
    expect(checkbox.checked).toBe(true); // default is visible
  });

  it("calls onChange when rating visibility is toggled", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSettings();
    await user.click(screen.getByLabelText("Show Ratings"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ ratingVisible: false }),
    );
  });

  it("disables all controls when disabled prop is true", () => {
    renderSettings({}, true);
    expect(screen.getByLabelText("Intensity")).toBeDisabled();
    expect(screen.getByLabelText("Mode")).toBeDisabled();
    expect(screen.getByLabelText("Targeting Bias")).toBeDisabled();
    expect(screen.getByLabelText("Delay Modifier")).toBeDisabled();
    expect(screen.getByLabelText("Messiness Modifier")).toBeDisabled();
    expect(screen.getByLabelText("Show Ratings")).toBeDisabled();
  });

  it("disables mode and modifiers when intensity is off", () => {
    renderSettings({ intensity: "off" });
    expect(screen.getByLabelText("Mode")).toBeDisabled();
    expect(screen.getByLabelText("Targeting Bias")).toBeDisabled();
    expect(screen.getByLabelText("Delay Modifier")).toBeDisabled();
    expect(screen.getByLabelText("Messiness Modifier")).toBeDisabled();
    // Intensity and rating visibility remain enabled
    expect(screen.getByLabelText("Intensity")).not.toBeDisabled();
    expect(screen.getByLabelText("Show Ratings")).not.toBeDisabled();
  });

  it("displays targeting bias value", () => {
    renderSettings({ targetingBiasStrength: 0.7 });
    expect(screen.getByText("0.70")).toBeInTheDocument();
  });
});
