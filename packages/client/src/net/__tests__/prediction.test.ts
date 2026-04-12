import { describe, it, expect } from "vitest";
import { modernRuleSet } from "@tetris/shared";
import { makeGameState } from "@tetris/shared/__test-utils__/factories.js";
import { PredictionEngine } from "../prediction";

const SEED = 42;

function mkOpts() {
  return { seed: SEED, ruleSet: modernRuleSet() };
}

describe("PredictionEngine — local input + sequencing", () => {
  it("assigns monotonic sequence numbers", () => {
    const pe = new PredictionEngine(mkOpts());
    const s1 = pe.applyLocalInput("moveLeft");
    const s2 = pe.applyLocalInput("moveRight");
    const s3 = pe.applyLocalInput("rotateCW");
    expect(s1).toBe(1);
    expect(s2).toBe(2);
    expect(s3).toBe(3);
    expect(pe.nextSeq).toBe(4);
  });

  it("predicted snapshot reflects locally-applied inputs immediately", () => {
    const pe = new PredictionEngine(mkOpts());
    const x0 = pe.getPredictedSnapshot().activePiece!.x;
    pe.applyLocalInput("moveLeft");
    const x1 = pe.getPredictedSnapshot().activePiece!.x;
    expect(x1).toBe(x0 - 1);
  });

  it("tracks pending inputs until acked", () => {
    const pe = new PredictionEngine(mkOpts());
    pe.applyLocalInput("moveLeft");
    pe.applyLocalInput("moveLeft");
    pe.applyLocalInput("moveRight");
    expect(pe.pendingInputs.map((p) => p.seq)).toEqual([1, 2, 3]);

    const snap = makeGameState({ tick: 1 });
    const res = pe.onServerState(snap, 2);
    expect(res.accepted).toBe(true);
    expect(res.prunedInputs).toBe(2);
    expect(pe.pendingInputs.map((p) => p.seq)).toEqual([3]);
    expect(pe.lastAckedSeq).toBe(2);
  });
});

describe("PredictionEngine — server state handling", () => {
  it("records the latest server snapshot", () => {
    const pe = new PredictionEngine(mkOpts());
    const snap = makeGameState({ tick: 5, score: 100 });
    pe.onServerState(snap);
    expect(pe.getServerSnapshot()).toBe(snap);
    expect(pe.latestTick).toBe(5);
  });

  it("drops out-of-order snapshots (older tick)", () => {
    const pe = new PredictionEngine(mkOpts());
    const newer = makeGameState({ tick: 10, score: 100 });
    const older = makeGameState({ tick: 5, score: 999 });

    const resNew = pe.onServerState(newer);
    expect(resNew.accepted).toBe(true);

    const resOld = pe.onServerState(older);
    expect(resOld.accepted).toBe(false);
    expect(pe.getServerSnapshot()).toBe(newer);
    expect(pe.latestTick).toBe(10);
  });

  it("drops duplicate-tick snapshots", () => {
    const pe = new PredictionEngine(mkOpts());
    pe.onServerState(makeGameState({ tick: 3 }));
    const dup = pe.onServerState(makeGameState({ tick: 3, score: 42 }));
    expect(dup.accepted).toBe(false);
  });

  it("drops inputs once the local engine is game-over", () => {
    // Force game-over by spamming hardDrops until top-out. This exercises
    // the real engine's gameOver path rather than mocking it.
    const pe = new PredictionEngine(mkOpts());
    let safety = 500;
    while (!pe.isGameOver && safety-- > 0) {
      pe.applyLocalInput("hardDrop");
    }
    expect(pe.isGameOver).toBe(true);
    const seqBefore = pe.nextSeq;
    const pendingBefore = pe.pendingInputs.length;
    const dropped = pe.applyLocalInput("moveLeft");
    expect(dropped).toBe(0);
    expect(pe.nextSeq).toBe(seqBefore);
    expect(pe.pendingInputs.length).toBe(pendingBefore);
  });

  it("does not prune pending inputs when ack is omitted", () => {
    const pe = new PredictionEngine(mkOpts());
    pe.applyLocalInput("moveLeft");
    pe.applyLocalInput("moveRight");
    pe.onServerState(makeGameState({ tick: 1 }));
    expect(pe.pendingInputs).toHaveLength(2);
  });
});

describe("PredictionEngine — reconciliation", () => {
  it("reconcile rebuilds engine and replays remaining history", () => {
    const pe = new PredictionEngine(mkOpts());
    const before = pe.getPredictedSnapshot();

    pe.applyLocalInput("moveLeft");
    pe.applyLocalInput("moveLeft");
    pe.applyLocalInput("rotateCW");
    const afterInputs = pe.getPredictedSnapshot();

    pe.reconcile();
    const afterReconcile = pe.getPredictedSnapshot();

    // Replaying the same inputs on a fresh engine must reproduce the
    // exact same piece/rotation/position (determinism).
    expect(afterReconcile.activePiece).toEqual(afterInputs.activePiece);
    expect(afterReconcile.nextQueue).toEqual(afterInputs.nextQueue);
    // Sanity: we moved off the initial position.
    expect(afterReconcile.activePiece).not.toEqual(before.activePiece);
  });

  it("after ack + reconcile, only unacked inputs are replayed", () => {
    // Verify ack semantics: once an input is acked it is dropped from
    // history, so `reconcile()` should no longer replay it.
    const pe = new PredictionEngine(mkOpts());
    pe.applyLocalInput("moveLeft");
    pe.applyLocalInput("moveLeft");
    pe.applyLocalInput("moveLeft");

    // Build a reference engine that only applies the unacked tail.
    const ref = new PredictionEngine(mkOpts());
    ref.applyLocalInput("moveLeft"); // only the last input remains unacked

    // Ack the first two inputs on `pe`.
    pe.onServerState(makeGameState({ tick: 1 }), 2);
    pe.reconcile();

    expect(pe.getPredictedSnapshot().activePiece).toEqual(
      ref.getPredictedSnapshot().activePiece,
    );
  });

  it("reconcile after no ack replays every input (full determinism check)", () => {
    const pe = new PredictionEngine(mkOpts());
    const actions = ["moveLeft", "rotateCW", "moveRight", "rotateCCW"] as const;
    for (const a of actions) pe.applyLocalInput(a);
    const snap1 = pe.getPredictedSnapshot();
    pe.reconcile();
    const snap2 = pe.getPredictedSnapshot();
    expect(snap2.activePiece).toEqual(snap1.activePiece);
    expect(snap2.nextQueue).toEqual(snap1.nextQueue);
  });
});
