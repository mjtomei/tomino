import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { GameState, ScoringState, RuleSet, GameModeConfig } from "@tetris/shared";
import {
  createGrid,
  modernRuleSet,
  classicRuleSet,
  marathonMode,
  sprintMode,
  ultraMode,
  zenMode,
} from "@tetris/shared";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function defaultScoring(overrides: Partial<ScoringState> = {}): ScoringState {
  return { score: 0, level: 1, lines: 0, combo: -1, b2b: -1, startLevel: 1, ...overrides };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    status: "playing",
    board: createGrid(),
    currentPiece: null,
    ghostRow: null,
    hold: null,
    holdUsed: false,
    queue: [],
    scoring: defaultScoring(),
    elapsedMs: 0,
    gameMode: "marathon",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ScoreDisplay tests
// ---------------------------------------------------------------------------

import { ScoreDisplay } from "../ui/ScoreDisplay.js";

describe("ScoreDisplay", () => {
  it("renders marathon stats (score, level, lines)", () => {
    const { container } = render(
      <ScoreDisplay
        scoring={defaultScoring({ score: 12345, level: 5, lines: 42 })}
        modeConfig={marathonMode}
        elapsedMs={60000}
      />,
    );

    expect(container.textContent).toContain("SCORE");
    expect(container.textContent).toContain("12,345");
    expect(container.textContent).toContain("LEVEL");
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("LINES");
    expect(container.textContent).toContain("42");
  });

  it("renders sprint stats (timer counting up, lines remaining)", () => {
    const { container } = render(
      <ScoreDisplay
        scoring={defaultScoring({ lines: 15 })}
        modeConfig={sprintMode}
        elapsedMs={65_120}
      />,
    );

    expect(container.textContent).toContain("TIME");
    expect(container.textContent).toContain("1:05");
    expect(container.textContent).toContain("REMAINING");
    expect(container.textContent).toContain("25");
  });

  it("renders ultra stats (timer counting down, score)", () => {
    const { container } = render(
      <ScoreDisplay
        scoring={defaultScoring({ score: 9999 })}
        modeConfig={ultraMode}
        elapsedMs={60_000}
      />,
    );

    expect(container.textContent).toContain("TIME");
    // 180000 - 60000 = 120000ms = 2:00
    expect(container.textContent).toContain("2:00");
    expect(container.textContent).toContain("9,999");
  });

  it("renders zen stats (lines, score)", () => {
    const { container } = render(
      <ScoreDisplay
        scoring={defaultScoring({ lines: 100, score: 50000 })}
        modeConfig={zenMode}
        elapsedMs={0}
      />,
    );

    expect(container.textContent).toContain("LINES");
    expect(container.textContent).toContain("100");
    expect(container.textContent).toContain("50,000");
  });

  it("clamps lines remaining to 0", () => {
    const { container } = render(
      <ScoreDisplay
        scoring={defaultScoring({ lines: 45 })}
        modeConfig={sprintMode}
        elapsedMs={0}
      />,
    );

    expect(container.textContent).toContain("REMAINING");
    expect(container.textContent).toContain("0");
    expect(container.textContent).not.toContain("-5");
  });
});

// ---------------------------------------------------------------------------
// NextQueue tests
// ---------------------------------------------------------------------------

import { NextQueue } from "../ui/NextQueue.js";

describe("NextQueue", () => {
  it("renders the correct number of preview pieces", () => {
    const { container } = render(
      <NextQueue
        queue={["I", "T", "O", "S", "Z"]}
        ruleSet={modernRuleSet()}
      />,
    );

    const pieces = container.querySelectorAll("[data-testid^='mini-piece-']");
    expect(pieces.length).toBe(5);
  });

  it("respects previewCount=1 for classic", () => {
    const classic = classicRuleSet();
    const { container } = render(
      <NextQueue
        queue={["I"]}
        ruleSet={classic}
      />,
    );

    const pieces = container.querySelectorAll("[data-testid^='mini-piece-']");
    expect(pieces.length).toBe(1);
  });

  it("returns null when previewCount is 0", () => {
    const customRules = { ...modernRuleSet(), previewCount: 0 };
    const { container } = render(
      <NextQueue queue={[]} ruleSet={customRules} />,
    );

    expect(container.querySelector("[data-testid='next-queue']")).toBeNull();
  });

  it("returns null when queue is empty", () => {
    const { container } = render(
      <NextQueue queue={[]} ruleSet={modernRuleSet()} />,
    );

    expect(container.querySelector("[data-testid='next-queue']")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HoldDisplay tests
// ---------------------------------------------------------------------------

import { HoldDisplay } from "../ui/HoldDisplay.js";

describe("HoldDisplay", () => {
  it("renders when hold is enabled", () => {
    render(
      <HoldDisplay hold="T" holdUsed={false} ruleSet={modernRuleSet()} />,
    );

    expect(screen.getByTestId("hold-display")).toBeInTheDocument();
    expect(screen.getByTestId("hold-piece")).toBeInTheDocument();
  });

  it("hides when hold is disabled", () => {
    const { container } = render(
      <HoldDisplay hold="T" holdUsed={false} ruleSet={classicRuleSet()} />,
    );

    expect(container.querySelector("[data-testid='hold-display']")).toBeNull();
  });

  it("dims piece when holdUsed is true", () => {
    render(
      <HoldDisplay hold="T" holdUsed={true} ruleSet={modernRuleSet()} />,
    );

    const svg = screen.getByTestId("hold-piece");
    expect(svg.style.opacity).toBe("0.4");
  });

  it("renders empty container when no piece held", () => {
    render(
      <HoldDisplay hold={null} holdUsed={false} ruleSet={modernRuleSet()} />,
    );

    expect(screen.getByTestId("hold-display")).toBeInTheDocument();
    expect(screen.queryByTestId("hold-piece")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Overlay tests
// ---------------------------------------------------------------------------

import { Overlay } from "../ui/Overlay.js";

describe("Overlay", () => {
  const handlers = {
    onResume: vi.fn(),
    onPlayAgain: vi.fn(),
    onQuit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows pause overlay when paused", () => {
    render(
      <Overlay
        state={makeState({ status: "paused" })}
        modeConfig={marathonMode}
        {...handlers}
      />,
    );

    expect(screen.getByTestId("pause-overlay")).toBeInTheDocument();
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
  });

  it("shows game over overlay when gameOver", () => {
    render(
      <Overlay
        state={makeState({ status: "gameOver", endReason: "topOut" })}
        modeConfig={marathonMode}
        {...handlers}
      />,
    );

    expect(screen.getByTestId("gameover-overlay")).toBeInTheDocument();
    expect(screen.getByText("TOP OUT")).toBeInTheDocument();
  });

  it("shows sprint complete message", () => {
    render(
      <Overlay
        state={makeState({ status: "gameOver", endReason: "goalReached", gameMode: "sprint" })}
        modeConfig={sprintMode}
        {...handlers}
      />,
    );

    expect(screen.getByText("SPRINT COMPLETE!")).toBeInTheDocument();
  });

  it("shows ultra time's up message", () => {
    render(
      <Overlay
        state={makeState({ status: "gameOver", endReason: "goalReached", gameMode: "ultra" })}
        modeConfig={ultraMode}
        {...handlers}
      />,
    );

    expect(screen.getByText("TIME'S UP!")).toBeInTheDocument();
  });

  it("calls onResume when resume button clicked", () => {
    render(
      <Overlay
        state={makeState({ status: "paused" })}
        modeConfig={marathonMode}
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByText("RESUME"));
    expect(handlers.onResume).toHaveBeenCalledOnce();
  });

  it("calls onQuit when quit button clicked on pause", () => {
    render(
      <Overlay
        state={makeState({ status: "paused" })}
        modeConfig={marathonMode}
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByText("QUIT"));
    expect(handlers.onQuit).toHaveBeenCalledOnce();
  });

  it("calls onPlayAgain when play again button clicked", () => {
    render(
      <Overlay
        state={makeState({ status: "gameOver", endReason: "topOut" })}
        modeConfig={marathonMode}
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByText("PLAY AGAIN"));
    expect(handlers.onPlayAgain).toHaveBeenCalledOnce();
  });

  it("renders nothing when playing", () => {
    const { container } = render(
      <Overlay
        state={makeState({ status: "playing" })}
        modeConfig={marathonMode}
        {...handlers}
      />,
    );

    expect(container.querySelector(".overlay")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StartScreen tests
// ---------------------------------------------------------------------------

import { StartScreen } from "../ui/StartScreen.js";

describe("StartScreen", () => {
  it("renders preset and mode buttons", () => {
    render(<StartScreen onStart={vi.fn()} />);

    expect(screen.getByTestId("preset-classic")).toBeInTheDocument();
    expect(screen.getByTestId("preset-modern")).toBeInTheDocument();
    expect(screen.getByTestId("preset-custom")).toBeInTheDocument();

    expect(screen.getByTestId("mode-marathon")).toBeInTheDocument();
    expect(screen.getByTestId("mode-sprint")).toBeInTheDocument();
    expect(screen.getByTestId("mode-ultra")).toBeInTheDocument();
    expect(screen.getByTestId("mode-zen")).toBeInTheDocument();
  });

  it("defaults to modern preset and marathon mode", () => {
    render(<StartScreen onStart={vi.fn()} />);

    expect(screen.getByTestId("preset-modern")).toHaveClass("start-btn-active");
    expect(screen.getByTestId("mode-marathon")).toHaveClass("start-btn-active");
  });

  it("shows custom panel when custom preset selected", () => {
    render(<StartScreen onStart={vi.fn()} />);

    expect(screen.queryByTestId("custom-panel")).toBeNull();

    fireEvent.click(screen.getByTestId("preset-custom"));
    expect(screen.getByTestId("custom-panel")).toBeInTheDocument();
  });

  it("hides custom panel when switching back to preset", () => {
    render(<StartScreen onStart={vi.fn()} />);

    fireEvent.click(screen.getByTestId("preset-custom"));
    expect(screen.getByTestId("custom-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("preset-classic"));
    expect(screen.queryByTestId("custom-panel")).toBeNull();
  });

  it("calls onStart with correct ruleSet and modeConfig", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    // Select classic + sprint
    fireEvent.click(screen.getByTestId("preset-classic"));
    fireEvent.click(screen.getByTestId("mode-sprint"));
    fireEvent.click(screen.getByTestId("start-play"));

    expect(onStart).toHaveBeenCalledOnce();
    const [ruleSet, modeConfig] = onStart.mock.calls[0]!;
    expect(ruleSet.name).toBe("Classic");
    expect(ruleSet.rotationSystem).toBe("nrs");
    expect(ruleSet.holdEnabled).toBe(false);
    expect(ruleSet.previewCount).toBe(1);
    expect(modeConfig.mode).toBe("sprint");
  });

  it("calls onStart with modern ruleSet by default", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    fireEvent.click(screen.getByTestId("start-play"));

    const [ruleSet, modeConfig] = onStart.mock.calls[0]!;
    expect(ruleSet.name).toBe("Modern");
    expect(ruleSet.rotationSystem).toBe("srs");
    expect(ruleSet.holdEnabled).toBe(true);
    expect(ruleSet.previewCount).toBe(5);
    expect(modeConfig.mode).toBe("marathon");
  });

  it("passes custom name when custom preset selected", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    fireEvent.click(screen.getByTestId("preset-custom"));
    fireEvent.click(screen.getByTestId("start-play"));

    const [ruleSet] = onStart.mock.calls[0]!;
    expect(ruleSet.name).toBe("Custom");
  });
});

// ---------------------------------------------------------------------------
// CustomRuleSetPanel tests
// ---------------------------------------------------------------------------

import { CustomRuleSetPanel } from "../ui/CustomRuleSetPanel.js";

describe("CustomRuleSetPanel", () => {
  it("renders all configurable fields", () => {
    const { container } = render(
      <CustomRuleSetPanel ruleSet={modernRuleSet()} onChange={vi.fn()} />,
    );

    expect(container.textContent).toContain("Rotation");
    expect(container.textContent).toContain("Randomizer");
    expect(container.textContent).toContain("Scoring");
    expect(container.textContent).toContain("Hold Enabled");
    expect(container.textContent).toContain("Hard Drop");
    expect(container.textContent).toContain("Ghost Piece");
    expect(container.textContent).toContain("Preview Count");
    expect(container.textContent).toContain("DAS");
    expect(container.textContent).toContain("ARR");
  });

  it("calls onChange when a checkbox is toggled", () => {
    const onChange = vi.fn();
    render(
      <CustomRuleSetPanel ruleSet={modernRuleSet()} onChange={onChange} />,
    );

    // Find the "Hold Enabled" checkbox
    const holdCheckbox = screen.getByRole("checkbox", { name: /hold enabled/i });
    fireEvent.click(holdCheckbox);

    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0]![0] as RuleSet;
    expect(updated.holdEnabled).toBe(false);
  });
});
