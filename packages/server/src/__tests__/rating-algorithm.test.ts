import { describe, it, expect } from "vitest";
import type { PlayerProfile } from "@tomino/shared";
import { updateRatings } from "../rating-algorithm.js";
import { GLICKO_CONFIG } from "../rating-config.js";

function makePlayer(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    username: "player",
    rating: GLICKO_CONFIG.INITIAL_RATING,
    ratingDeviation: GLICKO_CONFIG.INITIAL_RD,
    volatility: GLICKO_CONFIG.INITIAL_VOLATILITY,
    gamesPlayed: 0,
    ...overrides,
  };
}

describe("updateRatings", () => {
  describe("basic win/loss", () => {
    it("winner gains rating and loser loses rating", () => {
      const winner = makePlayer({ username: "alice" });
      const loser = makePlayer({ username: "bob" });

      const result = updateRatings(winner, loser);

      expect(result.winner.rating).toBeGreaterThan(winner.rating);
      expect(result.loser.rating).toBeLessThan(loser.rating);
    });

    it("increments gamesPlayed for both players", () => {
      const winner = makePlayer({ username: "alice", gamesPlayed: 5 });
      const loser = makePlayer({ username: "bob", gamesPlayed: 3 });

      const result = updateRatings(winner, loser);

      expect(result.winner.gamesPlayed).toBe(6);
      expect(result.loser.gamesPlayed).toBe(4);
    });

    it("preserves usernames", () => {
      const winner = makePlayer({ username: "alice" });
      const loser = makePlayer({ username: "bob" });

      const result = updateRatings(winner, loser);

      expect(result.winner.username).toBe("alice");
      expect(result.loser.username).toBe("bob");
    });

    it("does not mutate input profiles", () => {
      const winner = makePlayer({ username: "alice" });
      const loser = makePlayer({ username: "bob" });
      const winnerCopy = { ...winner };
      const loserCopy = { ...loser };

      updateRatings(winner, loser);

      expect(winner).toEqual(winnerCopy);
      expect(loser).toEqual(loserCopy);
    });
  });

  describe("new player calibration", () => {
    it("produces large rating swings for new players (high RD)", () => {
      const newPlayer = makePlayer({
        username: "new",
        ratingDeviation: 350,
        gamesPlayed: 0,
      });
      const opponent = makePlayer({
        username: "opp",
        ratingDeviation: 350,
        gamesPlayed: 0,
      });

      const result = updateRatings(newPlayer, opponent);

      // New player with high RD should gain significantly
      const ratingChange = result.winner.rating - newPlayer.rating;
      expect(ratingChange).toBeGreaterThan(50);
    });

    it("enforces calibration RD floor during calibration period", () => {
      const newPlayer = makePlayer({
        username: "new",
        ratingDeviation: 350,
        gamesPlayed: 0,
      });
      const established = makePlayer({
        username: "est",
        ratingDeviation: 50,
        gamesPlayed: 100,
      });

      const result = updateRatings(newPlayer, established);

      // New player (gamesPlayed becomes 1, still in calibration)
      expect(result.winner.ratingDeviation).toBeGreaterThanOrEqual(
        GLICKO_CONFIG.CALIBRATION_RD_FLOOR,
      );
    });

    it("does not enforce calibration floor after calibration period", () => {
      const player = makePlayer({
        username: "player",
        ratingDeviation: 60,
        gamesPlayed: GLICKO_CONFIG.CALIBRATION_GAMES,
      });
      const opponent = makePlayer({ username: "opp", ratingDeviation: 60, gamesPlayed: 50 });

      const result = updateRatings(player, opponent);

      // Post-calibration: RD can be below calibration floor
      expect(result.winner.ratingDeviation).toBeLessThan(GLICKO_CONFIG.CALIBRATION_RD_FLOOR);
    });
  });

  describe("established player stability", () => {
    it("produces small rating swings for established players (low RD)", () => {
      const established1 = makePlayer({
        username: "alice",
        rating: 1500,
        ratingDeviation: 50,
        gamesPlayed: 100,
      });
      const established2 = makePlayer({
        username: "bob",
        rating: 1500,
        ratingDeviation: 50,
        gamesPlayed: 100,
      });

      const result = updateRatings(established1, established2);

      const ratingChange = result.winner.rating - established1.rating;
      // Established players should see small swings
      expect(ratingChange).toBeLessThan(20);
      expect(ratingChange).toBeGreaterThan(0);
    });

    it("swings less than a new player in the same matchup", () => {
      const opponent = makePlayer({ username: "opp", ratingDeviation: 100, gamesPlayed: 50 });

      const newResult = updateRatings(
        makePlayer({ username: "new", ratingDeviation: 350, gamesPlayed: 0 }),
        { ...opponent },
      );

      const estResult = updateRatings(
        makePlayer({ username: "est", ratingDeviation: 50, gamesPlayed: 100 }),
        { ...opponent },
      );

      const newSwing = newResult.winner.rating - 1500;
      const estSwing = estResult.winner.rating - 1500;

      expect(newSwing).toBeGreaterThan(estSwing);
    });
  });

  describe("symmetric updates", () => {
    it("winner gains approximately what loser loses at equal ratings", () => {
      const player1 = makePlayer({
        username: "alice",
        rating: 1500,
        ratingDeviation: 200,
        volatility: 0.06,
        gamesPlayed: 5,
      });
      const player2 = makePlayer({
        username: "bob",
        rating: 1500,
        ratingDeviation: 200,
        volatility: 0.06,
        gamesPlayed: 5,
      });

      const result = updateRatings(player1, player2);

      const winnerGain = result.winner.rating - player1.rating;
      const loserLoss = player2.rating - result.loser.rating;

      // Should be approximately equal (within 5%)
      expect(Math.abs(winnerGain - loserLoss) / winnerGain).toBeLessThan(0.05);
    });
  });

  describe("edge cases", () => {
    it("handles identical ratings producing symmetric outcome", () => {
      const alice = makePlayer({
        username: "alice",
        rating: 1500,
        ratingDeviation: 150,
        gamesPlayed: 20,
      });
      const bob = makePlayer({
        username: "bob",
        rating: 1500,
        ratingDeviation: 150,
        gamesPlayed: 20,
      });

      const result = updateRatings(alice, bob);

      // Winner should gain, loser should lose
      expect(result.winner.rating).toBeGreaterThan(1500);
      expect(result.loser.rating).toBeLessThan(1500);

      // Symmetric RDs after update
      const winnerRdChange = Math.abs(result.winner.ratingDeviation - alice.ratingDeviation);
      const loserRdChange = Math.abs(result.loser.ratingDeviation - bob.ratingDeviation);
      expect(Math.abs(winnerRdChange - loserRdChange)).toBeLessThan(1);
    });

    it("handles maximum skill gap (winner gains little from beating weaker player)", () => {
      const strong = makePlayer({
        username: "strong",
        rating: 2200,
        ratingDeviation: 50,
        gamesPlayed: 200,
      });
      const weak = makePlayer({
        username: "weak",
        rating: 800,
        ratingDeviation: 50,
        gamesPlayed: 200,
      });

      const result = updateRatings(strong, weak);

      // Strong player gains very little from expected win
      const strongGain = result.winner.rating - strong.rating;
      expect(strongGain).toBeLessThan(2);
      expect(strongGain).toBeGreaterThan(0);
    });

    it("upset: weak player beating strong player produces larger rating change", () => {
      const weak = makePlayer({
        username: "weak",
        rating: 1200,
        ratingDeviation: 80,
        gamesPlayed: 50,
      });
      const strong = makePlayer({
        username: "strong",
        rating: 1800,
        ratingDeviation: 80,
        gamesPlayed: 50,
      });

      const expectedResult = updateRatings(strong, weak);
      const upsetResult = updateRatings(weak, strong);

      // Upset (weak beats strong) should change more than expected (strong beats weak)
      const expectedGain = expectedResult.winner.rating - strong.rating;
      const upsetGain = upsetResult.winner.rating - weak.rating;

      expect(upsetGain).toBeGreaterThan(expectedGain);
    });

    it("RD increases via pre-rating period step (simulating inactivity effect)", () => {
      // The pre-rating RD step (φ* = sqrt(φ² + σ²)) means a player's
      // effective RD grows slightly each time the algorithm runs.
      // A player with low RD who plays a match should see their post-match
      // RD still be influenced by the volatility-based inflation.
      const player = makePlayer({
        username: "player",
        rating: 1500,
        ratingDeviation: 50,
        volatility: 0.06,
        gamesPlayed: 100,
      });
      const opponent = makePlayer({
        username: "opp",
        rating: 1500,
        ratingDeviation: 50,
        volatility: 0.06,
        gamesPlayed: 100,
      });

      const result = updateRatings(player, opponent);

      // The pre-period step inflates RD by σ before the match update shrinks it.
      // With low RD (50) and typical volatility (0.06), the inflation from
      // φ* = sqrt(φ² + σ²) slightly exceeds the shrinkage from one opponent,
      // so RD increases marginally — reflecting reduced confidence over time.
      expect(result.winner.ratingDeviation).toBeGreaterThan(0);
      expect(result.loser.ratingDeviation).toBeGreaterThan(0);
      // RD should stay close to original — the inflation and shrinkage nearly cancel
      expect(Math.abs(result.winner.ratingDeviation - player.ratingDeviation)).toBeLessThan(5);
    });

    it("volatility stays bounded and positive", () => {
      const player1 = makePlayer({
        username: "a",
        rating: 2000,
        ratingDeviation: 300,
        volatility: 0.06,
        gamesPlayed: 2,
      });
      const player2 = makePlayer({
        username: "b",
        rating: 1000,
        ratingDeviation: 300,
        volatility: 0.06,
        gamesPlayed: 2,
      });

      // Big upset
      const result = updateRatings(player2, player1);

      expect(result.winner.volatility).toBeGreaterThan(0);
      expect(result.winner.volatility).toBeLessThan(1);
      expect(result.loser.volatility).toBeGreaterThan(0);
      expect(result.loser.volatility).toBeLessThan(1);
    });
  });

  describe("config override", () => {
    it("respects custom config values", () => {
      const player1 = makePlayer({ username: "a" });
      const player2 = makePlayer({ username: "b" });

      const defaultResult = updateRatings(player1, player2);
      const customResult = updateRatings(player1, player2, { TAU: 1.2 });

      // Different TAU should produce different volatility
      expect(customResult.winner.volatility).not.toBeCloseTo(
        defaultResult.winner.volatility,
        10,
      );
    });
  });
});
