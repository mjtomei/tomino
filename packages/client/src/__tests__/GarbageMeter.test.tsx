import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { GarbageBatch } from "@tetris/shared";
import { VISIBLE_HEIGHT } from "@tetris/shared";
import { GarbageMeter, computeMeterLines } from "../ui/GarbageMeter.js";

function batch(lines: number, gapColumn = 0): GarbageBatch {
  return { lines, gapColumn };
}

// ---------------------------------------------------------------------------
// computeMeterLines
// ---------------------------------------------------------------------------

describe("computeMeterLines", () => {
  it("returns 0 for empty array", () => {
    expect(computeMeterLines([])).toBe(0);
  });

  it("sums lines from a single batch", () => {
    expect(computeMeterLines([batch(3)])).toBe(3);
  });

  it("sums lines from multiple batches", () => {
    expect(computeMeterLines([batch(2), batch(3), batch(1)])).toBe(6);
  });

  it("caps at VISIBLE_HEIGHT", () => {
    expect(computeMeterLines([batch(25)])).toBe(VISIBLE_HEIGHT);
  });

  it("caps aggregate at VISIBLE_HEIGHT", () => {
    expect(computeMeterLines([batch(12), batch(12)])).toBe(VISIBLE_HEIGHT);
  });

  it("returns exact VISIBLE_HEIGHT without capping", () => {
    expect(computeMeterLines([batch(VISIBLE_HEIGHT)])).toBe(VISIBLE_HEIGHT);
  });
});

// ---------------------------------------------------------------------------
// GarbageMeter component
// ---------------------------------------------------------------------------

describe("GarbageMeter", () => {
  const CELL_SIZE = 30;

  it("renders nothing when pendingGarbage is empty", () => {
    const { queryByTestId } = render(
      <GarbageMeter pendingGarbage={[]} cellSize={CELL_SIZE} />,
    );
    expect(queryByTestId("garbage-meter")).toBeNull();
  });

  it("renders a meter with correct height for pending garbage", () => {
    const { getByTestId } = render(
      <GarbageMeter pendingGarbage={[batch(5)]} cellSize={CELL_SIZE} />,
    );
    const meter = getByTestId("garbage-meter");
    expect(meter.style.height).toBe(`${VISIBLE_HEIGHT * CELL_SIZE}px`);

    const bar = getByTestId("garbage-meter-bar");
    expect(bar.style.height).toBe(`${5 * CELL_SIZE}px`);
  });

  it("caps bar height at board height for overflow", () => {
    const { getByTestId } = render(
      <GarbageMeter pendingGarbage={[batch(25)]} cellSize={CELL_SIZE} />,
    );
    const bar = getByTestId("garbage-meter-bar");
    expect(bar.style.height).toBe(`${VISIBLE_HEIGHT * CELL_SIZE}px`);
  });

  it("sums multiple batches", () => {
    const { getByTestId } = render(
      <GarbageMeter pendingGarbage={[batch(2), batch(3)]} cellSize={CELL_SIZE} />,
    );
    const bar = getByTestId("garbage-meter-bar");
    expect(bar.style.height).toBe(`${5 * CELL_SIZE}px`);
  });

  it("applies danger class when lines >= 75% of VISIBLE_HEIGHT", () => {
    const dangerLines = Math.ceil(VISIBLE_HEIGHT * 0.75);
    const { getByTestId } = render(
      <GarbageMeter pendingGarbage={[batch(dangerLines)]} cellSize={CELL_SIZE} />,
    );
    const bar = getByTestId("garbage-meter-bar");
    expect(bar.classList.contains("danger")).toBe(true);
  });

  it("does not apply danger class when lines < 75% of VISIBLE_HEIGHT", () => {
    const { getByTestId } = render(
      <GarbageMeter pendingGarbage={[batch(3)]} cellSize={CELL_SIZE} />,
    );
    const bar = getByTestId("garbage-meter-bar");
    expect(bar.classList.contains("danger")).toBe(false);
  });

  it("updates bar height on re-render (garbage cancellation)", () => {
    const { getByTestId, rerender } = render(
      <GarbageMeter pendingGarbage={[batch(4)]} cellSize={CELL_SIZE} />,
    );
    expect(getByTestId("garbage-meter-bar").style.height).toBe(`${4 * CELL_SIZE}px`);

    rerender(
      <GarbageMeter pendingGarbage={[batch(1)]} cellSize={CELL_SIZE} />,
    );
    expect(getByTestId("garbage-meter-bar").style.height).toBe(`${1 * CELL_SIZE}px`);
  });

  it("updates bar height on re-render (garbage added)", () => {
    const { getByTestId, rerender } = render(
      <GarbageMeter pendingGarbage={[batch(3)]} cellSize={CELL_SIZE} />,
    );
    expect(getByTestId("garbage-meter-bar").style.height).toBe(`${3 * CELL_SIZE}px`);

    rerender(
      <GarbageMeter pendingGarbage={[batch(3), batch(2)]} cellSize={CELL_SIZE} />,
    );
    expect(getByTestId("garbage-meter-bar").style.height).toBe(`${5 * CELL_SIZE}px`);
  });

  it("transitions from visible to hidden when garbage fully cancelled", () => {
    const { queryByTestId, rerender } = render(
      <GarbageMeter pendingGarbage={[batch(3)]} cellSize={CELL_SIZE} />,
    );
    expect(queryByTestId("garbage-meter")).not.toBeNull();

    rerender(
      <GarbageMeter pendingGarbage={[]} cellSize={CELL_SIZE} />,
    );
    expect(queryByTestId("garbage-meter")).toBeNull();
  });

  it("scales with cellSize", () => {
    const { getByTestId } = render(
      <GarbageMeter pendingGarbage={[batch(4)]} cellSize={15} />,
    );
    const bar = getByTestId("garbage-meter-bar");
    expect(bar.style.height).toBe(`${4 * 15}px`);
  });
});
