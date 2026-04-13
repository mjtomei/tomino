/**
 * Game test harness — wraps engine subsystems for integration-level testing
 * without timers or real-time input handling.
 *
 * Provides a tick-based simulation where each tick represents one frame.
 * DAS/ARR are not simulated — inputs are applied immediately.
 */

import type { GameStateSnapshot, InputAction, GarbageBatch } from "../types.js";
import type { RuleSet } from "../engine/types.js";
import type { RNG } from "../engine/rng.js";
import type { Randomizer } from "../engine/randomizer.js";
import type { RotationSystem } from "../engine/rotation.js";
import type { ScoringState, ScoringSystem, LineClearCount, TSpinType } from "../engine/scoring.js";
import type { Grid } from "../engine/board.js";
import type { PieceType, Rotation } from "../engine/pieces.js";

import { createRNG } from "../engine/rng.js";
import { modernRuleSet } from "../engine/rulesets.js";
import { createRandomizer } from "../engine/randomizer.js";
import { SRSRotation } from "../engine/rotation-srs.js";
import { ClassicRotation } from "../engine/rotation-classic.js";
import { GuidelineScoring } from "../engine/scoring-guideline.js";
import { ClassicScoring } from "../engine/scoring-classic.js";
import { createGrid, placePiece, clearLines } from "../engine/board.js";
import { collides, tryMove, tryRotate, hardDrop as findLandingRow } from "../engine/movement.js";
import { detectTSpin } from "../engine/scoring.js";
import { insertGarbageBatches } from "../engine/garbage.js";

// ---------------------------------------------------------------------------
// Minimal engine interface (for future engine PRs to implement)
// ---------------------------------------------------------------------------

/**
 * Minimal game engine interface that the harness expects.
 * Engine PRs will implement this; the harness provides an internal implementation
 * using existing pure functions.
 */
export interface GameEngine {
  /** Current game state snapshot. */
  readonly state: GameStateSnapshot;
  /** Apply a single input action. */
  applyInput(action: InputAction): void;
  /** Advance one tick (gravity, lock delay). */
  tick(): void;
  /** Queue garbage batches to be inserted after the next piece lock. */
  addGarbage(batches: GarbageBatch[]): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRAME_MS = 1000 / 60; // ~16.67ms per tick at 60fps

/** Standard spawn column (left edge of bounding box). */
const SPAWN_COL = 3;

/** Spawn row — in the buffer zone, so the piece is partially visible. */
const SPAWN_ROW = 18;

// ---------------------------------------------------------------------------
// Internal engine implementation
// ---------------------------------------------------------------------------

interface EngineState {
  grid: Grid;
  activePieceType: PieceType | null;
  activePieceRow: number;
  activePieceCol: number;
  activePieceRotation: Rotation;
  holdPiece: PieceType | null;
  holdUsedThisDrop: boolean;
  scoring: ScoringState;
  tick: number;
  isGameOver: boolean;
  pendingGarbage: GarbageBatch[];
  /** Ticks remaining before forced lock. -1 = not grounded. */
  lockDelayTicks: number;
  /** Number of lock resets used for the current piece. */
  lockResetCount: number;
  /** Whether the last action on the active piece was a rotation. */
  lastActionWasRotation: boolean;
  /** Whether the last rotation used a wall kick offset (non-zero displacement). */
  lastRotationUsedKick: boolean;
  /** Gravity accumulator: ticks since last gravity drop. */
  gravityAccum: number;
}

function createInternalEngine(
  _rng: RNG,
  randomizer: Randomizer,
  rotationSystem: RotationSystem,
  scoringSystem: ScoringSystem,
  ruleSet: RuleSet,
  startLevel: number,
): GameEngine {
  const lockDelayTicks = Math.ceil(ruleSet.lockDelay / FRAME_MS);

  const es: EngineState = {
    grid: createGrid(),
    activePieceType: null,
    activePieceRow: 0,
    activePieceCol: 0,
    activePieceRotation: 0 as Rotation,
    holdPiece: null,
    holdUsedThisDrop: false,
    scoring: scoringSystem.createState(startLevel),
    tick: 0,
    isGameOver: false,
    pendingGarbage: [],
    lockDelayTicks: -1,
    lockResetCount: 0,
    lastActionWasRotation: false,
    lastRotationUsedKick: false,
    gravityAccum: 0,
  };

  // Spawn first piece
  spawnPiece();

  function currentShape() {
    return rotationSystem.getShape(es.activePieceType!, es.activePieceRotation);
  }

  function isGrounded(): boolean {
    if (es.activePieceType === null) return false;
    const shape = currentShape();
    return collides(es.grid, shape, es.activePieceRow + 1, es.activePieceCol);
  }

  function spawnPiece(): void {
    const type = randomizer.next();
    es.activePieceType = type;
    es.activePieceRotation = 0 as Rotation;
    es.activePieceCol = SPAWN_COL;
    es.activePieceRow = SPAWN_ROW;
    es.holdUsedThisDrop = false;
    es.lockDelayTicks = -1;
    es.lockResetCount = 0;
    es.lastActionWasRotation = false;
    es.lastRotationUsedKick = false;
    es.gravityAccum = 0;

    // Check for blockout
    const shape = currentShape();
    if (collides(es.grid, shape, es.activePieceRow, es.activePieceCol)) {
      es.isGameOver = true;
    }
  }

  function lockPiece(): void {
    if (es.activePieceType === null) return;

    const shape = currentShape();
    const type = es.activePieceType;
    const row = es.activePieceRow;
    const col = es.activePieceCol;

    // Place piece on grid
    placePiece(es.grid, shape, type, row, col);

    // T-spin detection
    let tSpin: TSpinType = "none";
    if (type === "T" && es.lastActionWasRotation) {
      tSpin = detectTSpin(es.grid, row, col, es.activePieceRotation, es.lastRotationUsedKick);
    }

    // Line clears
    const linesCleared = clearLines(es.grid) as LineClearCount;

    // Check for perfect clear
    const isPerfectClear =
      linesCleared > 0 &&
      es.grid.every((r) => r.every((cell) => cell === null));

    // Track piece placement
    es.scoring.piecesPlaced++;

    // Update scoring
    scoringSystem.onLineClear(es.scoring, linesCleared, tSpin, isPerfectClear);

    // Insert pending garbage after piece lock
    if (es.pendingGarbage.length > 0) {
      insertGarbageBatches(es.grid, es.pendingGarbage);
      es.pendingGarbage = [];
    }

    es.activePieceType = null;

    // Spawn next piece
    spawnPiece();
  }

  function resetLockDelay(): void {
    if (!isGrounded()) {
      es.lockDelayTicks = -1;
      return;
    }
    if (es.lockResetCount < ruleSet.lockResets) {
      es.lockDelayTicks = lockDelayTicks;
      es.lockResetCount++;
    }
  }

  function getGhostY(): number | null {
    if (es.activePieceType === null) return null;
    const shape = currentShape();
    return findLandingRow(es.grid, shape, es.activePieceRow, es.activePieceCol);
  }

  function buildSnapshot(): GameStateSnapshot {
    const nextQueue = randomizer.peek(ruleSet.previewCount) as PieceType[];

    return {
      tick: es.tick,
      board: es.grid.map((row) => [...row]),
      activePiece:
        es.activePieceType !== null
          ? {
              type: es.activePieceType,
              x: es.activePieceCol,
              y: es.activePieceRow,
              rotation: es.activePieceRotation,
            }
          : null,
      ghostY: getGhostY(),
      nextQueue: [...nextQueue],
      holdPiece: es.holdPiece,
      holdUsed: es.holdUsedThisDrop,
      score: es.scoring.score,
      level: es.scoring.level,
      linesCleared: es.scoring.lines,
      piecesPlaced: es.scoring.piecesPlaced,
      pendingGarbage: [...es.pendingGarbage],
      isGameOver: es.isGameOver,
    };
  }

  function applyInput(action: InputAction): void {
    if (es.isGameOver || es.activePieceType === null) return;

    const shape = currentShape();

    switch (action) {
      case "moveLeft": {
        const result = tryMove(es.grid, shape, es.activePieceRow, es.activePieceCol, -1, 0);
        if (result) {
          es.activePieceRow = result.row;
          es.activePieceCol = result.col;
          es.lastActionWasRotation = false;
          resetLockDelay();
        }
        break;
      }
      case "moveRight": {
        const result = tryMove(es.grid, shape, es.activePieceRow, es.activePieceCol, 1, 0);
        if (result) {
          es.activePieceRow = result.row;
          es.activePieceCol = result.col;
          es.lastActionWasRotation = false;
          resetLockDelay();
        }
        break;
      }
      case "softDrop": {
        const result = tryMove(es.grid, shape, es.activePieceRow, es.activePieceCol, 0, 1);
        if (result) {
          es.activePieceRow = result.row;
          es.activePieceCol = result.col;
          es.lastActionWasRotation = false;
          scoringSystem.onSoftDrop(es.scoring, 1);
          resetLockDelay();
        }
        break;
      }
      case "hardDrop": {
        if (!ruleSet.hardDropEnabled) break;
        const landingRow = findLandingRow(es.grid, shape, es.activePieceRow, es.activePieceCol);
        const cellsDropped = landingRow - es.activePieceRow;
        es.activePieceRow = landingRow;
        scoringSystem.onHardDrop(es.scoring, cellsDropped);
        es.lastActionWasRotation = false;
        lockPiece();
        break;
      }
      case "rotateCW": {
        const result = tryRotate(
          es.grid, es.activePieceType, es.activePieceRow, es.activePieceCol,
          es.activePieceRotation, "cw", rotationSystem,
        );
        if (result) {
          es.lastRotationUsedKick = result.row !== es.activePieceRow || result.col !== es.activePieceCol;
          es.activePieceRow = result.row;
          es.activePieceCol = result.col;
          es.activePieceRotation = result.rotation;
          es.lastActionWasRotation = true;
          resetLockDelay();
        }
        break;
      }
      case "rotateCCW": {
        const result = tryRotate(
          es.grid, es.activePieceType, es.activePieceRow, es.activePieceCol,
          es.activePieceRotation, "ccw", rotationSystem,
        );
        if (result) {
          es.lastRotationUsedKick = result.row !== es.activePieceRow || result.col !== es.activePieceCol;
          es.activePieceRow = result.row;
          es.activePieceCol = result.col;
          es.activePieceRotation = result.rotation;
          es.lastActionWasRotation = true;
          resetLockDelay();
        }
        break;
      }
      case "rotate180": {
        // Two consecutive CW rotations; both must succeed
        const first = tryRotate(
          es.grid, es.activePieceType, es.activePieceRow, es.activePieceCol,
          es.activePieceRotation, "cw", rotationSystem,
        );
        if (!first) break;
        const second = tryRotate(
          es.grid, es.activePieceType, first.row, first.col,
          first.rotation, "cw", rotationSystem,
        );
        if (!second) break;
        es.lastRotationUsedKick =
          second.row !== es.activePieceRow || second.col !== es.activePieceCol;
        es.activePieceRow = second.row;
        es.activePieceCol = second.col;
        es.activePieceRotation = second.rotation;
        es.lastActionWasRotation = true;
        resetLockDelay();
        break;
      }
      case "hold": {
        if (!ruleSet.holdEnabled || es.holdUsedThisDrop) break;
        const currentType = es.activePieceType;
        if (es.holdPiece !== null) {
          es.activePieceType = es.holdPiece;
          es.activePieceRotation = 0 as Rotation;
          es.activePieceCol = SPAWN_COL;
          es.activePieceRow = SPAWN_ROW;
          es.lockDelayTicks = -1;
          es.lockResetCount = 0;
          es.lastActionWasRotation = false;
          es.lastRotationUsedKick = false;
          es.gravityAccum = 0;
          const newShape = currentShape();
          if (collides(es.grid, newShape, es.activePieceRow, es.activePieceCol)) {
            es.isGameOver = true;
          }
        } else {
          spawnPiece();
        }
        es.holdPiece = currentType;
        es.holdUsedThisDrop = true;
        break;
      }
    }
  }

  function tickFn(): void {
    if (es.isGameOver || es.activePieceType === null) {
      es.tick++;
      return;
    }

    es.tick++;

    // Gravity
    const dropInterval = scoringSystem.getDropInterval(es.scoring.level);
    const gravityTicks = Math.max(1, Math.ceil(dropInterval / FRAME_MS));

    es.gravityAccum++;
    if (es.gravityAccum >= gravityTicks) {
      es.gravityAccum = 0;
      const shape = currentShape();
      const result = tryMove(es.grid, shape, es.activePieceRow, es.activePieceCol, 0, 1);
      if (result) {
        es.activePieceRow = result.row;
        es.lastActionWasRotation = false;
      }
    }

    // Lock delay
    if (isGrounded()) {
      if (es.lockDelayTicks === -1) {
        es.lockDelayTicks = lockDelayTicks;
      }
      if (ruleSet.lockDelay === 0) {
        lockPiece();
      } else {
        es.lockDelayTicks--;
        if (es.lockDelayTicks <= 0) {
          lockPiece();
        }
      }
    } else {
      es.lockDelayTicks = -1;
    }
  }

  function addGarbage(batches: GarbageBatch[]): void {
    es.pendingGarbage.push(...batches);
  }

  return {
    get state() {
      return buildSnapshot();
    },
    applyInput,
    tick: tickFn,
    addGarbage,
  };
}

// ---------------------------------------------------------------------------
// GameTestHarness
// ---------------------------------------------------------------------------

export interface GameTestHarnessOptions {
  seed: number;
  ruleSet?: RuleSet;
  startLevel?: number;
}

/**
 * Test harness that wraps the engine for integration-level testing.
 *
 * Usage:
 * ```ts
 * const harness = new GameTestHarness({ seed: 42 });
 * harness.input("hardDrop");
 * expect(harness.state.score).toBeGreaterThan(0);
 * ```
 */
export class GameTestHarness {
  private readonly engine: GameEngine;

  constructor(options: GameTestHarnessOptions) {
    const { seed, ruleSet = modernRuleSet(), startLevel = ruleSet.startLevel } = options;

    const rng = createRNG(seed);
    const randomizer = createRandomizer(ruleSet.randomizer, ruleSet.previewCount, rng.next);
    const rotationSystem = ruleSet.rotationSystem === "srs" ? SRSRotation : ClassicRotation;
    const scoringSystem = ruleSet.scoringSystem === "guideline" ? GuidelineScoring : ClassicScoring;

    this.engine = createInternalEngine(rng, randomizer, rotationSystem, scoringSystem, ruleSet, startLevel);
  }

  /** Current game state snapshot. */
  get state(): GameStateSnapshot {
    return this.engine.state;
  }

  /** Apply a single input action. */
  input(action: InputAction): void {
    this.engine.applyInput(action);
  }

  /** Apply multiple input actions in order. */
  inputs(actions: InputAction[]): void {
    for (const action of actions) {
      this.engine.applyInput(action);
    }
  }

  /**
   * Advance ticks until a predicate is satisfied or maxTicks is reached.
   * @returns The number of ticks advanced.
   */
  tickUntil(predicate: (state: GameStateSnapshot) => boolean, maxTicks = 10_000): number {
    let count = 0;
    while (count < maxTicks) {
      this.engine.tick();
      count++;
      if (predicate(this.engine.state)) break;
    }
    return count;
  }

  /** Advance a fixed number of ticks. */
  tick(count = 1): void {
    for (let i = 0; i < count; i++) {
      this.engine.tick();
    }
  }

  /** Queue garbage batches to be inserted after the next piece lock. */
  addGarbage(batches: GarbageBatch[]): void {
    this.engine.addGarbage(batches);
  }
}
