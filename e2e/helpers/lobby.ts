import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * From the lobby menu, click "Create Room" and wait for the waiting room.
 * Returns the generated room code.
 */
export async function createRoom(page: Page): Promise<string> {
  // Wait for the button to be enabled (WebSocket connected)
  const createBtn = page.getByRole("button", { name: "Create Room" });
  await expect(createBtn).toBeEnabled();
  await createBtn.click();

  // Wait for the waiting room to appear
  await expect(page.getByRole("heading", { name: "Waiting Room" })).toBeVisible();

  // Extract the room code from the <code> element
  const roomCode = await page.locator("code").textContent();
  if (!roomCode) {
    throw new Error("Room code not found in waiting room");
  }

  return roomCode.trim();
}

/**
 * From the lobby menu, open the join dialog, enter the room code, and join.
 * Waits until the waiting room is visible.
 */
export async function joinRoom(page: Page, roomId: string): Promise<void> {
  // Wait for the button to be enabled (WebSocket connected)
  const joinBtn = page.getByRole("button", { name: "Join Room" });
  await expect(joinBtn).toBeEnabled();
  await joinBtn.click();

  // Wait for the join dialog
  const dialog = page.getByRole("dialog", { name: "Join Room" });
  await expect(dialog).toBeVisible();

  // Fill in the room code and submit
  await page.locator("#room-code").fill(roomId);
  await dialog.getByRole("button", { name: "Join" }).click();

  // Wait for the waiting room to appear
  await expect(page.getByRole("heading", { name: "Waiting Room" })).toBeVisible();
}
