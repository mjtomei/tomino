import { test, expect } from "@playwright/test";
import { createPlayerContext, createRoom, joinRoom } from "./helpers";

test.describe("multiplayer lobby flow", () => {
  test("two players can create and join a room", async ({ browser }) => {
    // Player 1 creates a room
    const player1 = await createPlayerContext(browser, "Alice");
    const roomId = await createRoom(player1.page);

    // Room code should be a 5-character alphanumeric string
    expect(roomId).toMatch(/^[A-Z2-9]{5}$/);

    // Player 2 joins the room
    const player2 = await createPlayerContext(browser, "Bob");
    await joinRoom(player2.page, roomId);

    // Both players should see each other in the waiting room
    await expect(player1.page.getByText("Alice")).toBeVisible();
    await expect(player1.page.getByText("Bob")).toBeVisible();
    await expect(player2.page.getByText("Alice")).toBeVisible();
    await expect(player2.page.getByText("Bob")).toBeVisible();

    // Both should see the correct room code
    await expect(player1.page.locator("code")).toHaveText(roomId);
    await expect(player2.page.locator("code")).toHaveText(roomId);

    // Player 1 (host) should see the Start Game button (disabled needs 2 players — now enabled)
    await expect(
      player1.page.getByRole("button", { name: "Start Game" }),
    ).toBeEnabled();

    // Player 2 (non-host) should see "Waiting for host" message
    await expect(
      player2.page.getByText("Waiting for host to start..."),
    ).toBeVisible();

    // Cleanup
    await player1.context.close();
    await player2.context.close();
  });

  test("room code is displayed on both player pages", async ({ browser }) => {
    const player1 = await createPlayerContext(browser, "Charlie");
    const roomId = await createRoom(player1.page);

    const player2 = await createPlayerContext(browser, "Dana");
    await joinRoom(player2.page, roomId);

    // Verify room code label and value on both pages
    await expect(player1.page.getByText("Room Code:")).toBeVisible();
    await expect(player2.page.getByText("Room Code:")).toBeVisible();
    await expect(player1.page.locator("code")).toHaveText(roomId);
    await expect(player2.page.locator("code")).toHaveText(roomId);

    await player1.context.close();
    await player2.context.close();
  });
});
