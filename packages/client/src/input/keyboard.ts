/**
 * Keyboard input handler with DAS/ARR support.
 *
 * Maps physical keys to engine actions, implements Delayed Auto Shift (DAS)
 * and Auto Repeat Rate (ARR) for horizontal movement, and gates actions
 * based on rule set flags.
 *
 * Usage:
 *   const handler = new KeyboardHandler({ ruleSet, onAction, onPause, onResume });
 *   // In game loop:
 *   handler.update(deltaMs);
 *   // On cleanup:
 *   handler.dispose();
 */

import type { RuleSet, InputAction } from "@tetris/shared";

// ---------------------------------------------------------------------------
// Key mapping
// ---------------------------------------------------------------------------

/** Actions that use DAS/ARR for auto-repeat. */
type DASAction = "moveLeft" | "moveRight";

/** All actions triggered by a single key press (no repeat). */
type SingleFireAction = "rotateCW" | "rotateCCW" | "hardDrop" | "hold";

/** Special keys not in InputAction. */
type SpecialAction = "pause" | "softDrop";

type MappedAction = DASAction | SingleFireAction | SpecialAction;

const KEY_MAP: ReadonlyMap<string, MappedAction> = new Map([
  ["ArrowLeft", "moveLeft"],
  ["ArrowRight", "moveRight"],
  ["ArrowUp", "rotateCW"],
  ["KeyZ", "rotateCCW"],
  ["Space", "hardDrop"],
  ["ArrowDown", "softDrop"],
  ["ShiftLeft", "hold"],
  ["ShiftRight", "hold"],
  ["Escape", "pause"],
]);

const DAS_ACTIONS: ReadonlySet<string> = new Set(["moveLeft", "moveRight"]);
const SINGLE_FIRE_ACTIONS: ReadonlySet<string> = new Set([
  "rotateCW",
  "rotateCCW",
  "hardDrop",
  "hold",
]);

/** Max iterations for ARR=0 teleport to prevent infinite loops. */
const MAX_TELEPORT_MOVES = 10;

// ---------------------------------------------------------------------------
// DAS state
// ---------------------------------------------------------------------------

interface DASState {
  /** Which direction is active, or null. */
  direction: DASAction | null;
  /** Time elapsed since key was pressed (ms). */
  elapsed: number;
  /** Whether DAS has charged (initial delay passed). */
  charged: boolean;
  /** Accumulated time since last ARR repeat (ms). */
  arrAccumulator: number;
}

function createDASState(): DASState {
  return { direction: null, elapsed: 0, charged: false, arrAccumulator: 0 };
}

// ---------------------------------------------------------------------------
// KeyboardHandler
// ---------------------------------------------------------------------------

export interface KeyboardHandlerOptions {
  ruleSet: RuleSet;
  onAction: (action: InputAction) => void;
  onPause: () => void;
  onResume: () => void;
  /** Whether the game is currently paused. Checked each update. */
  isPaused: () => boolean;
  target?: EventTarget;
}

export class KeyboardHandler {
  private readonly ruleSet: RuleSet;
  private readonly onAction: (action: InputAction) => void;
  private readonly onPause: () => void;
  private readonly onResume: () => void;
  private readonly isPaused: () => boolean;
  private readonly target: EventTarget;

  /** Currently held keys (by event.code). */
  private readonly heldKeys = new Set<string>();

  /** Keys that have already fired their single-fire action. */
  private readonly firedKeys = new Set<string>();

  /** DAS state for horizontal movement. */
  private das: DASState = createDASState();

  /** Order of horizontal key presses for priority tracking. */
  private readonly directionOrder: DASAction[] = [];

  /** Whether soft drop is currently held. */
  private softDropHeld = false;

  private readonly boundKeyDown: (e: Event) => void;
  private readonly boundKeyUp: (e: Event) => void;
  private readonly boundBlur: () => void;

  constructor(options: KeyboardHandlerOptions) {
    this.ruleSet = options.ruleSet;
    this.onAction = options.onAction;
    this.onPause = options.onPause;
    this.onResume = options.onResume;
    this.isPaused = options.isPaused;
    this.target = options.target ?? document;

    this.boundKeyDown = (e: Event) => this.handleKeyDown(e as KeyboardEvent);
    this.boundKeyUp = (e: Event) => this.handleKeyUp(e as KeyboardEvent);
    this.boundBlur = () => this.handleBlur();

    this.target.addEventListener("keydown", this.boundKeyDown);
    this.target.addEventListener("keyup", this.boundKeyUp);
    (typeof window !== "undefined" ? window : this.target).addEventListener(
      "blur",
      this.boundBlur,
    );
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    const action = KEY_MAP.get(e.code);
    if (action === undefined) return;

    e.preventDefault();

    // Ignore repeated keydown events from OS key repeat
    if (e.repeat) return;

    this.heldKeys.add(e.code);

    // Handle pause toggle immediately (works even when paused)
    if (action === "pause") {
      if (this.isPaused()) {
        this.onResume();
      } else {
        this.onPause();
      }
      return;
    }

    // Don't process gameplay keys while paused
    if (this.isPaused()) return;

    // DAS actions — track direction order and fire initial move
    if (DAS_ACTIONS.has(action)) {
      const dasAction = action as DASAction;
      // Add to direction order (remove first to re-add at end)
      const idx = this.directionOrder.indexOf(dasAction);
      if (idx !== -1) this.directionOrder.splice(idx, 1);
      this.directionOrder.push(dasAction);

      // Set active direction to most recent
      this.das.direction = dasAction;
      this.das.elapsed = 0;
      this.das.charged = false;
      this.das.arrAccumulator = 0;

      // Fire initial move immediately
      this.onAction(dasAction);
      return;
    }

    // Soft drop — mark as held, fire immediately
    if (action === "softDrop") {
      this.softDropHeld = true;
      this.onAction("softDrop");
      return;
    }

    // Single-fire actions
    if (SINGLE_FIRE_ACTIONS.has(action)) {
      // Gate hard drop and hold
      if (action === "hardDrop" && !this.ruleSet.hardDropEnabled) return;
      if (action === "hold" && !this.ruleSet.holdEnabled) return;

      if (!this.firedKeys.has(e.code)) {
        this.firedKeys.add(e.code);
        this.onAction(action as InputAction);
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const action = KEY_MAP.get(e.code);
    if (action === undefined) return;

    this.heldKeys.delete(e.code);
    this.firedKeys.delete(e.code);

    if (DAS_ACTIONS.has(action)) {
      const dasAction = action as DASAction;
      const idx = this.directionOrder.indexOf(dasAction);
      if (idx !== -1) this.directionOrder.splice(idx, 1);

      // If released direction was active, switch to the other held direction or clear
      if (this.das.direction === dasAction) {
        if (this.directionOrder.length > 0) {
          const newDir = this.directionOrder[this.directionOrder.length - 1]!;
          this.das.direction = newDir;
          this.das.elapsed = 0;
          this.das.charged = false;
          this.das.arrAccumulator = 0;
          // Fire initial move for the newly active direction
          this.onAction(newDir);
        } else {
          this.das = createDASState();
        }
      }
    }

    if (action === "softDrop") {
      this.softDropHeld = false;
    }
  }

  private handleBlur(): void {
    this.heldKeys.clear();
    this.firedKeys.clear();
    this.das = createDASState();
    this.directionOrder.length = 0;
    this.softDropHeld = false;
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  /**
   * Call once per frame. Processes DAS/ARR timers and fires repeat actions.
   */
  update(deltaMs: number): void {
    if (this.isPaused()) return;

    // Soft drop — fire every frame while held
    if (this.softDropHeld) {
      this.onAction("softDrop");
    }

    // DAS/ARR processing for horizontal movement
    if (this.das.direction === null) return;

    this.das.elapsed += deltaMs;

    if (!this.das.charged) {
      // Still in DAS delay
      if (this.das.elapsed >= this.ruleSet.das) {
        this.das.charged = true;
        // Carry over excess time into ARR accumulator
        this.das.arrAccumulator = this.das.elapsed - this.ruleSet.das;
        this.fireARR();
      }
    } else {
      // DAS charged — accumulate ARR
      this.das.arrAccumulator += deltaMs;
      this.fireARR();
    }
  }

  private fireARR(): void {
    if (this.das.direction === null) return;

    if (this.ruleSet.arr === 0) {
      // ARR=0: teleport to wall
      for (let i = 0; i < MAX_TELEPORT_MOVES; i++) {
        this.onAction(this.das.direction);
      }
      this.das.arrAccumulator = 0;
    } else {
      // Fire as many ARR ticks as accumulated
      while (this.das.arrAccumulator >= this.ruleSet.arr) {
        this.das.arrAccumulator -= this.ruleSet.arr;
        this.onAction(this.das.direction);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

  dispose(): void {
    this.target.removeEventListener("keydown", this.boundKeyDown);
    this.target.removeEventListener("keyup", this.boundKeyUp);
    (typeof window !== "undefined" ? window : this.target).removeEventListener(
      "blur",
      this.boundBlur,
    );
    this.handleBlur();
  }
}
