import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  ServerMessage,
  PlayerId,
  PlayerStats,
  RoomId,
  S2C_GameOver,
  S2C_GameEnd,
} from "@tetris/shared";
import { boardFromAscii } from "@tetris/shared/__test-utils__/board-builder.js";
import {
  GameSession,
  createGameSession,
  removeGameSession,
} from "../game-session.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBroadcastSpy() {
  const messages: { roomId: RoomId; msg: ServerMessage }[] = [];
  return {
    messages,
    broadcastToRoom: (roomId: RoomId, msg: ServerMessage) => {
      messages.push({ roomId, msg });
    },
  };
}

function getMessagesByType<T extends ServerMessage>(
  messages: { roomId: RoomId; msg: ServerMessage }[],
  type: string,
): T[] {
  return messages.filter((m) => m.msg.type === type).map((m) => m.msg as T);
}

const TWO_PLAYERS = [
  { id: "p1" as PlayerId, name: "Alice" },
  { id: "p2" as PlayerId, name: "Bob" },
];

const THREE_PLAYERS = [
  { id: "p1" as PlayerId, name: "Alice" },
  { id: "p2" as PlayerId, name: "Bob" },
  { id: "p3" as PlayerId, name: "Charlie" },
];

function startSession(
  spy: ReturnType<typeof createBroadcastSpy>,
  players = TWO_PLAYERS,
) {
  const session = createGameSession({
    roomId: "room-1",
    players,
    broadcastToRoom: spy.broadcastToRoom,
  });
  session.startCountdown();
  vi.advanceTimersByTime(4000);
  return session;
}

/**
 * A near-topout board: 18 rows filled (leaving only 2 rows free in the
 * visible area). A single hard drop on this board will top out for most
 * piece types since pieces spawn in the buffer zone around row 18.
 */
const NEAR_TOPOUT_BOARD = boardFromAscii(`
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
XXXXXXXXX.
`);

/**
 * Set a player's board to near-topout state using boardFromAscii, then
 * hard drop until topped out.
 */
function forceTopOut(session: GameSession, playerId: PlayerId): void {
  const engine = session.getPlayerEngine(playerId)!;
  engine._testSetBoard(NEAR_TOPOUT_BOARD.map((row) => [...row]));
  let drops = 0;
  while (!engine.isGameOver && drops < 50) {
    session.applyInput(playerId, "hardDrop");
    drops++;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GameSession elimination and stats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    removeGameSession("room-1");
  });

  describe("top-out triggers elimination", () => {
    it("broadcasts gameOver with placement when player tops out", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      forceTopOut(session, "p1");

      const gameOvers = getMessagesByType<S2C_GameOver>(spy.messages, "gameOver");
      const p1GameOver = gameOvers.find((m) => m.playerId === "p1");
      expect(p1GameOver).toBeDefined();
      expect(p1GameOver!.placement).toBe(2); // last place in 2-player
    });
  });

  describe("last-player-standing win condition", () => {
    it("declares winner with placements when one player remains", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      forceTopOut(session, "p1");

      const gameEnds = getMessagesByType<S2C_GameEnd>(spy.messages, "gameEnd");
      expect(gameEnds).toHaveLength(1);
      expect(gameEnds[0]!.winnerId).toBe("p2");
      expect(gameEnds[0]!.placements).toEqual({ p1: 2, p2: 1 });
    });

    it("session transitions to finished", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      forceTopOut(session, "p1");

      expect(session.state).toBe("finished");
    });
  });

  describe("multi-elimination ordering", () => {
    it("assigns placements based on elimination order in 3-player game", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy, THREE_PLAYERS);

      // p1 eliminated first → last place (3rd)
      forceTopOut(session, "p1");
      // p2 eliminated second → 2nd place
      forceTopOut(session, "p2");

      const gameOvers = getMessagesByType<S2C_GameOver>(spy.messages, "gameOver");
      const p1GO = gameOvers.find((m) => m.playerId === "p1");
      const p2GO = gameOvers.find((m) => m.playerId === "p2");
      expect(p1GO!.placement).toBe(3); // first eliminated = last place
      expect(p2GO!.placement).toBe(2);

      const gameEnds = getMessagesByType<S2C_GameEnd>(spy.messages, "gameEnd");
      expect(gameEnds).toHaveLength(1);
      expect(gameEnds[0]!.winnerId).toBe("p3");
      expect(gameEnds[0]!.placements).toEqual({ p1: 3, p2: 2, p3: 1 });
    });
  });

  describe("stats accumulation", () => {
    it("includes stats for all players in gameEnd message", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Play a few pieces for p1 before topout
      session.applyInput("p1", "moveLeft");
      session.applyInput("p1", "hardDrop");
      session.applyInput("p1", "hardDrop");

      forceTopOut(session, "p1");

      const gameEnds = getMessagesByType<S2C_GameEnd>(spy.messages, "gameEnd");
      expect(gameEnds).toHaveLength(1);

      const stats = gameEnds[0]!.stats;
      expect(stats["p1"]).toBeDefined();
      expect(stats["p2"]).toBeDefined();

      // p1 placed at least 2 pieces before topout
      expect(stats["p1"]!.piecesPlaced).toBeGreaterThanOrEqual(2);
      expect(stats["p1"]!.survivalMs).toBeGreaterThanOrEqual(0);
      expect(typeof stats["p1"]!.linesSent).toBe("number");
      expect(typeof stats["p1"]!.linesReceived).toBe("number");
      expect(typeof stats["p1"]!.score).toBe("number");
      expect(typeof stats["p1"]!.linesCleared).toBe("number");
    });

    it("winner stats are captured at game-end time", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // p2 plays some moves
      session.applyInput("p2", "moveRight");
      session.applyInput("p2", "hardDrop");

      forceTopOut(session, "p1");

      const stats = getMessagesByType<S2C_GameEnd>(spy.messages, "gameEnd")[0]!.stats;
      // Winner (p2) should have at least 1 piece placed
      expect(stats["p2"]!.piecesPlaced).toBeGreaterThanOrEqual(1);
    });
  });

  describe("disconnect counts as elimination", () => {
    it("disconnected player gets worst available placement", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy, THREE_PLAYERS);

      session.markDisconnected("p1", 10_000);
      session.forfeitPlayer("p1");

      const gameOvers = getMessagesByType<S2C_GameOver>(spy.messages, "gameOver");
      const p1GO = gameOvers.find((m) => m.playerId === "p1");
      expect(p1GO).toBeDefined();
      expect(p1GO!.placement).toBe(3); // last place in 3-player

      // Game should continue (2 players remain)
      expect(session.state).toBe("playing");
    });

    it("stats are captured before engine deletion on disconnect", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Play a piece before disconnecting
      session.applyInput("p1", "hardDrop");
      session.markDisconnected("p1", 10_000);
      session.forfeitPlayer("p1");

      const gameEnds = getMessagesByType<S2C_GameEnd>(spy.messages, "gameEnd");
      expect(gameEnds).toHaveLength(1);

      const stats = gameEnds[0]!.stats;
      expect(stats["p1"]!.piecesPlaced).toBeGreaterThanOrEqual(1);
    });
  });

  describe("simultaneous elimination ordering", () => {
    it("deterministic ordering when two players top out in same call sequence", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy, THREE_PLAYERS);

      // Eliminate p1, then p3 in quick succession
      forceTopOut(session, "p1");
      forceTopOut(session, "p3");

      const gameEnds = getMessagesByType<S2C_GameEnd>(spy.messages, "gameEnd");
      expect(gameEnds).toHaveLength(1);
      expect(gameEnds[0]!.placements).toEqual({ p1: 3, p3: 2, p2: 1 });
    });

    it("correct placements when all players top out (last-out wins)", () => {
      const spy = createBroadcastSpy();
      const session = startSession(spy);

      // Both players top out — last one out wins
      forceTopOut(session, "p1");
      forceTopOut(session, "p2");

      const gameEnds = getMessagesByType<S2C_GameEnd>(spy.messages, "gameEnd");
      expect(gameEnds).toHaveLength(1);
      expect(gameEnds[0]!.winnerId).toBe("p2");
      expect(gameEnds[0]!.placements).toEqual({ p1: 2, p2: 1 });
    });
  });
});
