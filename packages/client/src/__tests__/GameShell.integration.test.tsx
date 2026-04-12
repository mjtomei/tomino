import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GameShell } from "../ui/GameShell.js";

beforeEach(() => {
  (window as unknown as { AudioContext: unknown }).AudioContext = class {
    createGain() { return { gain: { value: 0, setValueAtTime: () => {} }, connect: () => {} }; }
    createOscillator() { return { frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, type: "sine", connect: () => {}, start: () => {}, stop: () => {} }; }
    get destination() { return {}; }
    get currentTime() { return 0; }
    close() { return Promise.resolve(); }
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    set fillStyle(_: string) {},
    set strokeStyle(_: string) {},
    set lineWidth(_: number) {},
    set font(_: string) {},
    set textAlign(_: string) {},
    set textBaseline(_: string) {},
    set globalAlpha(_: number) {},
  })) as unknown as HTMLCanvasElement["getContext"];
});

afterEach(() => {
  cleanup();
});

describe("GameShell integration", () => {
  const presets = ["classic", "modern"] as const;
  const modes = ["marathon", "sprint", "ultra", "zen"] as const;

  for (const preset of presets) {
    for (const mode of modes) {
      it(`initializes engine + renderer for ${preset} + ${mode} without errors`, () => {
        const errors: unknown[] = [];
        const origError = console.error;
        console.error = (...args: unknown[]) => errors.push(args);

        render(<GameShell seed={42} />);
        fireEvent.click(screen.getByTestId(`preset-${preset}`));
        fireEvent.click(screen.getByTestId(`mode-${mode}`));
        fireEvent.click(screen.getByTestId("start-play"));

        expect(screen.getByTestId("game-shell")).toBeInTheDocument();
        expect(screen.queryByTestId("start-screen")).toBeNull();

        console.error = origError;
        expect(errors).toEqual([]);
      });
    }
  }

  it("initializes custom preset without errors", () => {
    const errors: unknown[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    render(<GameShell seed={1} />);
    fireEvent.click(screen.getByTestId("preset-custom"));
    fireEvent.click(screen.getByTestId("mode-marathon"));
    fireEvent.click(screen.getByTestId("start-play"));

    expect(screen.getByTestId("game-shell")).toBeInTheDocument();

    console.error = origError;
    expect(errors).toEqual([]);
  });

  it("smoke: rapidly switching presets and modes on start screen", () => {
    render(<GameShell seed={1} />);
    const sequence = [
      "preset-classic", "mode-sprint",
      "preset-modern", "mode-ultra",
      "preset-custom", "mode-zen",
      "preset-modern", "mode-marathon",
    ];
    for (const testid of sequence) {
      fireEvent.click(screen.getByTestId(testid));
    }
    expect(screen.getByTestId("start-screen")).toBeInTheDocument();
    expect(screen.getByTestId("preset-modern")).toHaveClass("start-btn-active");
    expect(screen.getByTestId("mode-marathon")).toHaveClass("start-btn-active");
  });

  it("unmount after start does not throw", () => {
    const { unmount } = render(<GameShell seed={1} />);
    fireEvent.click(screen.getByTestId("preset-modern"));
    fireEvent.click(screen.getByTestId("mode-marathon"));
    fireEvent.click(screen.getByTestId("start-play"));
    expect(screen.getByTestId("game-shell")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });
});
