/**
 * TetrisEngine — core game loop and state machine.
 *
 * Takes a RuleSet and GameModeConfig, instantiates the appropriate subsystems
 * (rotation, randomizer, scoring), and ties them together with the board and
 * movement modules. Manages game states, gravity ticks, lock delay, and
 * emits complete state snapshots.
 *
 * Zero browser dependencies. Time is injected via tick(deltaMs).
 */

import type { PieceType, PieceShape, Rotation } from "./pieces.js";
import type { Grid } from "./board.js";
import type { RotationSystem } from "./rotation.js";
import type { Randomizer } from "./randomizer.js";
import type { ScoringSystem, ScoringState, LineClearCount, TSpinType } from "./scoring.js";
import type { HoldState } from "./hold.js";
import type { RuleSet, GameModeConfig, GameMode } from "./types.js";

import { createGrid, placePiece, clearLines, BOARD_WIDTH } from "./board.js";
import { SRSRotation } from "./rotation-srs.js";
import { NRSRotation } from "./rotation-nrs.js";
import { createRandomizer, seededRng } from "./randomizer.js";
import { GuidelineScoring } from "./scoring-guideline.js";
import { NESScoring } from "./scoring-nes.js";
import { createHoldState, holdPiece, resetHoldFlag } from "./hold.js";
import { collides, tryMove, tryRotate, hardDrop as findLandingRow } from "./movement.js";
import { detectTSpin } from "./scoring.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Game status. */
export type GameStatus = "idle" | "playing" | "paused" | "gameOver";

/** Why the game ended. */
export type EndReason = "topOut" | "goalReached" | "quit";

/** Active piece state tracked by the engine. */
export interface ActivePiece {
  readonly type: PieceType;
  readonly row: number;
  readonly col: number;
  readonly rotation: Rotation;
  readonly shape: PieceShape;
}

/** Complete state snapshot — everything a renderer needs. */
export interface GameState {
  readonly status: GameStatus;
  readonly board: Grid;
  readonly currentPiece: ActivePiece | null;
  readonly ghostRow: number | null;
  readonly hold: PieceType | null;
  readonly holdUsed: boolean;
  readonly queue: readonly PieceType[];
  readonly scoring: Readonly<ScoringState>;
  readonly elapsedMs: number;
  readonly gameMode: GameMode;
  readonly endReason?: EndReason;
}

/** Options for engine construction. */
export interface EngineOptions {
  readonly ruleSet: RuleSet;
  readonly modeConfig: GameModeConfig;
  readonly seed?: number;
  readonly startLevel?: number;
}

// ---------------------------------------------------------------------------
// Spawn position helpers
// ---------------------------------------------------------------------------

/** Spawn row: just above the visible area (row 18 in the 40-row grid). */
const SPAWN_ROW = 18;

/** Spawn column for a piece shape, centered on the 10-wide board. */
function spawnCol(shape: PieceShape): number {
  const width = shape[0]!.length;
  return Math.floor((BOARD_WIDTH - width) / 2);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class TetrisEngine {
  // -- Configuration --
  readonly ruleSet: RuleSet;
  readonly modeConfig: GameModeConfig;

  // -- Subsystems --
  private readonly rotationSystem: RotationSystem;
  private readonly randomizer: Randomizer;
  private readonly scoringSystem: ScoringSystem;

  // -- State --
  private grid: Grid;
  private scoringState: ScoringState;
  private holdState: HoldState;
  private status: GameStatus = "idle";
  private endReason: EndReason | undefined;
  private elapsedMs = 0;

  // -- Active piece --
  private currentPiece: ActivePiece | null = null;
  /** Whether the last successful action on the current piece was a rotation. */
  private lastActionWasRotation = false;
  /** Whether the last rotation used a wall kick (offset other than [0,0]). */
  private lastRotationUsedKick = false;

  // -- Gravity --
  private gravityAccumulator = 0;

  // -- Lock delay --
  private lockTimer = 0;
  private lockResetCount = 0;
  private isInLockDelay = false;

  constructor(options: EngineOptions) {
    this.ruleSet = options.ruleSet;
    this.modeConfig = options.modeConfig;

    // Rotation system
    this.rotationSystem =
      options.ruleSet.rotationSystem === "srs" ? SRSRotation : NRSRotation;

    // Randomizer with optional seeded RNG
    const rng = options.seed != null ? seededRng(options.seed) : undefined;
    this.randomizer = createRandomizer(
      options.ruleSet.randomizer,
      options.ruleSet.previewCount,
      rng,
    );

    // Scoring system
    this.scoringSystem =
      options.ruleSet.scoringSystem === "guideline"
        ? GuidelineScoring
        : NESScoring;

    const startLevel = options.startLevel ?? 1;
    this.scoringState = this.scoringSystem.createState(startLevel);

    // Board and hold
    this.grid = createGrid();
    this.holdState = createHoldState();
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  /** Start the game. Spawns the first piece and begins play. */
  start(): void {
    if (this.status !== "idle") return;
    this.status = "playing";
    this.spawnPiece();
  }

  /** Pause the game. */
  pause(): void {
    if (this.status !== "playing") return;
    this.status = "paused";
  }

  /** Resume from pause. */
  resume(): void {
    if (this.status !== "paused") return;
    this.status = "playing";
  }

  /** Quit the game (transitions playing → gameOver). */
  quit(): void {
    if (this.status !== "playing" && this.status !== "paused") return;
    this.endReason = "quit";
    this.status = "gameOver";
    this.currentPiece = null;
  }

  // -------------------------------------------------------------------------
  // Tick
  // -------------------------------------------------------------------------

  /** Advance the game clock. Returns the current state snapshot. */
  tick(deltaMs: number): GameState {
    if (this.status === "playing") {
      this.elapsedMs += deltaMs;

      // Check Ultra time limit
      if (
        this.modeConfig.goal === "time" &&
        this.modeConfig.goalValue != null &&
        this.elapsedMs >= this.modeConfig.goalValue
      ) {
        this.endGame("goalReached");
        return this.getState();
      }

      // Gravity
      if (this.modeConfig.gravity && this.currentPiece) {
        this.tickGravity(deltaMs);
      }

      // Lock delay
      if (this.isInLockDelay && this.currentPiece) {
        this.tickLockDelay(deltaMs);
      }
    }

    return this.getState();
  }

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------

  /** Move the active piece left. */
  moveLeft(): void {
    this.applyMove(-1, 0);
  }

  /** Move the active piece right. */
  moveRight(): void {
    this.applyMove(1, 0);
  }

  /** Soft drop — move piece down one row and award points. */
  softDrop(): void {
    if (this.status !== "playing" || !this.currentPiece) return;
    const result = tryMove(
      this.grid,
      this.currentPiece.shape,
      this.currentPiece.row,
      this.currentPiece.col,
      0,
      1,
    );
    if (result) {
      this.currentPiece = {
        ...this.currentPiece,
        row: result.row,
        col: result.col,
      };
      this.scoringSystem.onSoftDrop(this.scoringState, 1);
      this.lastActionWasRotation = false;

      // Check if piece is now on ground
      this.checkGroundState();
    }
  }

  /** Hard drop — instant drop to landing row, lock immediately. */
  hardDrop(): void {
    if (this.status !== "playing" || !this.currentPiece) return;
    if (!this.ruleSet.hardDropEnabled) return;

    const landingRow = findLandingRow(
      this.grid,
      this.currentPiece.shape,
      this.currentPiece.row,
      this.currentPiece.col,
    );
    const cellsDropped = landingRow - this.currentPiece.row;
    this.scoringSystem.onHardDrop(this.scoringState, cellsDropped);

    this.currentPiece = { ...this.currentPiece, row: landingRow };
    this.lastActionWasRotation = false;
    this.lockPiece();
  }

  /** Rotate clockwise. */
  rotateCW(): void {
    this.applyRotation("cw");
  }

  /** Rotate counter-clockwise. */
  rotateCCW(): void {
    this.applyRotation("ccw");
  }

  /** Hold the current piece. */
  hold(): void {
    if (this.status !== "playing" || !this.currentPiece) return;
    if (!this.ruleSet.holdEnabled) return;
    if (this.holdState.holdUsedThisDrop) return;

    const result = holdPiece(
      this.currentPiece.type,
      this.holdState,
      this.ruleSet.holdEnabled,
    );
    this.holdState = result.newState;

    if (result.newCurrent === null) {
      // Hold was empty — pull from randomizer
      this.spawnPiece();
    } else {
      // Swap with held piece
      this.spawnSpecificPiece(result.newCurrent);
    }
  }

  // -------------------------------------------------------------------------
  // State snapshot
  // -------------------------------------------------------------------------

  /** Get the current game state snapshot. */
  getState(): GameState {
    let ghostRow: number | null = null;
    if (this.ruleSet.ghostEnabled && this.currentPiece) {
      ghostRow = findLandingRow(
        this.grid,
        this.currentPiece.shape,
        this.currentPiece.row,
        this.currentPiece.col,
      );
    }

    return {
      status: this.status,
      board: this.grid,
      currentPiece: this.currentPiece,
      ghostRow,
      hold: this.holdState.heldPiece,
      holdUsed: this.holdState.holdUsedThisDrop,
      queue: this.randomizer.peek(this.ruleSet.previewCount),
      scoring: { ...this.scoringState },
      elapsedMs: this.elapsedMs,
      gameMode: this.modeConfig.mode,
      ...(this.endReason != null ? { endReason: this.endReason } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // Internal: movement helpers
  // -------------------------------------------------------------------------

  private applyMove(dx: number, dy: number): void {
    if (this.status !== "playing" || !this.currentPiece) return;

    const result = tryMove(
      this.grid,
      this.currentPiece.shape,
      this.currentPiece.row,
      this.currentPiece.col,
      dx,
      dy,
    );
    if (result) {
      this.currentPiece = {
        ...this.currentPiece,
        row: result.row,
        col: result.col,
      };
      this.lastActionWasRotation = false;
      this.onPieceMoved();
    }
  }

  private applyRotation(direction: "cw" | "ccw"): void {
    if (this.status !== "playing" || !this.currentPiece) return;

    const result = tryRotate(
      this.grid,
      this.currentPiece.type,
      this.currentPiece.row,
      this.currentPiece.col,
      this.currentPiece.rotation,
      direction,
      this.rotationSystem,
    );
    if (result) {
      const newShape = this.rotationSystem.getShape(
        this.currentPiece.type,
        result.rotation,
      );
      // Detect if a wall kick was used: the first kick offset is always [0,0],
      // so if the position changed, a non-trivial kick was applied.
      this.lastRotationUsedKick =
        result.row !== this.currentPiece.row ||
        result.col !== this.currentPiece.col;

      this.currentPiece = {
        type: this.currentPiece.type,
        row: result.row,
        col: result.col,
        rotation: result.rotation,
        shape: newShape,
      };
      this.lastActionWasRotation = true;
      this.onPieceMoved();
    }
  }

  /** Called after any successful move/rotate to handle lock delay resets. */
  private onPieceMoved(): void {
    if (this.isInLockDelay) {
      if (this.lockResetCount < this.ruleSet.lockResets) {
        this.lockTimer = 0;
        this.lockResetCount++;
      }
      // Re-check if still on ground
      this.checkGroundState();
    } else {
      this.checkGroundState();
    }
  }

  // -------------------------------------------------------------------------
  // Internal: gravity
  // -------------------------------------------------------------------------

  private tickGravity(deltaMs: number): void {
    if (!this.currentPiece || this.isInLockDelay) return;

    const interval = this.scoringSystem.getDropInterval(
      this.scoringState.level,
    );
    this.gravityAccumulator += deltaMs;

    while (this.gravityAccumulator >= interval && this.currentPiece && !this.isInLockDelay) {
      this.gravityAccumulator -= interval;

      const result = tryMove(
        this.grid,
        this.currentPiece.shape,
        this.currentPiece.row,
        this.currentPiece.col,
        0,
        1,
      );

      if (result) {
        this.currentPiece = {
          ...this.currentPiece,
          row: result.row,
          col: result.col,
        };
        this.lastActionWasRotation = false;
        this.checkGroundState();
      } else {
        // Can't move down — start lock phase
        this.beginLockDelay();
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal: lock delay
  // -------------------------------------------------------------------------

  private beginLockDelay(): void {
    if (this.ruleSet.lockDelay === 0) {
      // Instant lock
      this.lockPiece();
    } else {
      this.isInLockDelay = true;
      this.lockTimer = 0;
    }
  }

  private tickLockDelay(deltaMs: number): void {
    if (!this.currentPiece) return;

    this.lockTimer += deltaMs;
    if (this.lockTimer >= this.ruleSet.lockDelay) {
      this.lockPiece();
    }
  }

  /** Check if the piece is on the ground and manage lock delay state. */
  private checkGroundState(): void {
    if (!this.currentPiece) return;

    const onGround = collides(
      this.grid,
      this.currentPiece.shape,
      this.currentPiece.row + 1,
      this.currentPiece.col,
    );

    if (onGround && !this.isInLockDelay) {
      this.beginLockDelay();
    } else if (!onGround && this.isInLockDelay) {
      // Piece lifted off ground (e.g., by a rotation/kick)
      this.isInLockDelay = false;
      this.lockTimer = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Internal: piece lock and lifecycle
  // -------------------------------------------------------------------------

  private lockPiece(): void {
    if (!this.currentPiece) return;

    const piece = this.currentPiece;

    // Place piece on grid
    placePiece(this.grid, piece.shape, piece.type, piece.row, piece.col);

    // Detect T-spin
    let tSpin: TSpinType = "none";
    if (piece.type === "T" && this.lastActionWasRotation) {
      tSpin = detectTSpin(
        this.grid,
        piece.row,
        piece.col,
        piece.rotation,
        this.lastRotationUsedKick,
      );
    }

    // Clear lines
    const linesCleared = clearLines(this.grid) as LineClearCount;

    // Perfect clear detection
    const isPerfectClear =
      linesCleared > 0 &&
      this.grid.every((row) => row.every((cell) => cell === null));

    // Update scoring
    this.scoringSystem.onLineClear(
      this.scoringState,
      linesCleared,
      tSpin,
      isPerfectClear,
    );

    // Reset hold flag
    this.holdState = resetHoldFlag(this.holdState);

    // Reset lock delay state
    this.isInLockDelay = false;
    this.lockTimer = 0;
    this.lockResetCount = 0;

    // Clear current piece
    this.currentPiece = null;

    // Check end conditions
    if (this.checkGoalReached()) {
      this.endGame("goalReached");
      return;
    }

    // Spawn next piece
    this.spawnPiece();
  }

  private spawnPiece(): void {
    const pieceType = this.randomizer.next();
    this.spawnSpecificPiece(pieceType);
  }

  private spawnSpecificPiece(pieceType: PieceType): void {
    const shape = this.rotationSystem.getShape(pieceType, 0);
    const col = spawnCol(shape);
    const row = SPAWN_ROW;

    if (collides(this.grid, shape, row, col)) {
      // Top-out
      if (this.modeConfig.topOutEndsGame) {
        this.currentPiece = { type: pieceType, row, col, rotation: 0, shape };
        this.endGame("topOut");
        return;
      }
      // Zen mode: don't end, but can't spawn
      this.currentPiece = null;
      return;
    }

    this.currentPiece = { type: pieceType, row, col, rotation: 0, shape };
    this.lastActionWasRotation = false;
    this.lastRotationUsedKick = false;
    this.gravityAccumulator = 0;
    this.isInLockDelay = false;
    this.lockTimer = 0;
    this.lockResetCount = 0;
  }

  // -------------------------------------------------------------------------
  // Internal: end conditions
  // -------------------------------------------------------------------------

  private checkGoalReached(): boolean {
    const { goal, goalValue } = this.modeConfig;
    if (goal === "lines" && goalValue != null) {
      return this.scoringState.lines >= goalValue;
    }
    // Time goal is checked in tick()
    return false;
  }

  private endGame(reason: EndReason): void {
    this.endReason = reason;
    this.status = "gameOver";
    this.currentPiece = null;
  }
}
