import type { Page } from "@playwright/test";

/** Game actions that can be sent as keyboard input. */
export type GameAction =
  | "moveLeft"
  | "moveRight"
  | "softDrop"
  | "hardDrop"
  | "rotateClockwise"
  | "rotateCounterClockwise"
  | "hold";

const ACTION_KEY_MAP: Record<GameAction, string> = {
  moveLeft: "ArrowLeft",
  moveRight: "ArrowRight",
  softDrop: "ArrowDown",
  hardDrop: "Space",
  rotateClockwise: "ArrowUp",
  rotateCounterClockwise: "z",
  hold: "c",
};

/**
 * Press the keyboard key corresponding to a game action.
 */
export async function sendKeyboardInput(
  page: Page,
  action: GameAction,
): Promise<void> {
  const key = ACTION_KEY_MAP[action];
  await page.keyboard.press(key);
}
