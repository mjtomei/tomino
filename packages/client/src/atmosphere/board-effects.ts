/**
 * Board visual effects — diffs GameState each frame and spawns particles
 * into an injected ParticleSystem for line clears, locks, hard drops, and
 * the amplified tetris variant.
 *
 * Renders on the particle/effects canvas layer (see ParticleCanvas). Never
 * touches BoardCanvas internals.
 */

import type { GameState, PieceType } from "@tetris/shared";
import { BOARD_WIDTH, BUFFER_HEIGHT, VISIBLE_HEIGHT } from "@tetris/shared";
import type { EmitConfig, ParticleSystem } from "./particle-system.js";
import type { Theme } from "./themes.js";

export type BoardEffectEvent =
  | { type: "lineClear"; rows: number[]; linesCleared: number }
  | { type: "tetris"; rows: number[] }
  | { type: "lock"; row: number; col: number; piece: PieceType }
  | {
      type: "hardDrop";
      col: number;
      fromRow: number;
      toRow: number;
      piece: PieceType;
    };

export interface BoardEffectsOptions {
  system: ParticleSystem;
  cellSize: number;
  getTheme: () => Theme;
  rng?: () => number;
}

/** Visible-row index (0..VISIBLE_HEIGHT-1) → canvas-pixel Y of the row center. */
function visibleRowCenter(visibleRow: number, cellSize: number): number {
  return (visibleRow + 0.5) * cellSize;
}

/** Column index → canvas-pixel X of the column center. */
function colCenter(col: number, cellSize: number): number {
  return (col + 0.5) * cellSize;
}

/** Return indices of rows (in 40-row grid space) that are completely filled. */
function fullRows(board: GameState["board"]): number[] {
  const out: number[] = [];
  for (let r = 0; r < board.length; r++) {
    const row = board[r];
    if (!row) continue;
    let full = true;
    for (let c = 0; c < row.length; c++) {
      if (row[c] == null) {
        full = false;
        break;
      }
    }
    if (full) out.push(r);
  }
  return out;
}

/** Rows in `prev` that were full and are no longer full (or no longer exist) in `curr`. */
function clearedRows(prev: GameState, curr: GameState): number[] {
  const prevFull = new Set(fullRows(prev.board));
  if (prevFull.size === 0) return [];
  const currFull = new Set(fullRows(curr.board));
  const out: number[] = [];
  for (const r of prevFull) {
    if (!currFull.has(r)) out.push(r);
  }
  return out;
}

export class BoardEffects {
  private readonly system: ParticleSystem;
  private readonly cellSize: number;
  private readonly getTheme: () => Theme;
  private readonly rng: () => number;

  /** Last-frame events, for tests / debugging. */
  readonly debug: { lastEvents: BoardEffectEvent[] } = { lastEvents: [] };

  constructor(opts: BoardEffectsOptions) {
    this.system = opts.system;
    this.cellSize = opts.cellSize;
    this.getTheme = opts.getTheme;
    this.rng = opts.rng ?? Math.random;
  }

  /**
   * Diff prev→curr and spawn effects for line clears and piece locks.
   * Called once per render tick from the shell.
   */
  onFrame(prev: GameState | null, curr: GameState): BoardEffectEvent[] {
    this.debug.lastEvents = [];
    if (!prev) return [];
    if (curr.status !== "playing" && curr.status !== "gameOver") return [];

    const events: BoardEffectEvent[] = [];
    const linesDiff = curr.scoring.lines - prev.scoring.lines;

    if (linesDiff > 0) {
      const rows = clearedRows(prev, curr);
      if (linesDiff >= 4) {
        events.push({ type: "tetris", rows });
      } else {
        events.push({ type: "lineClear", rows, linesCleared: linesDiff });
      }
    }

    // Lock detection — mirrors GameShell.detectSoundEvents. Intentionally
    // gated on linesDiff === 0 so clears don't also pulse (the dissolve is
    // enough visual anchor).
    const queueShifted =
      prev.queue.length > 0 &&
      curr.queue.length > 0 &&
      prev.queue[prev.queue.length - 1] !==
        curr.queue[curr.queue.length - 1];
    if (
      prev.currentPiece != null &&
      linesDiff === 0 &&
      queueShifted &&
      curr.status === "playing"
    ) {
      const p = prev.currentPiece;
      events.push({
        type: "lock",
        row: p.row,
        col: p.col,
        piece: p.type,
      });
    }

    for (const ev of events) this.spawn(ev);
    this.debug.lastEvents = events;
    return events;
  }

  /**
   * Called synchronously from the keyboard handler on Space keydown, with
   * the state *before* the hard drop is applied.
   */
  onHardDropIntent(state: GameState): BoardEffectEvent | null {
    if (state.status !== "playing") return null;
    if (!state.currentPiece || state.ghostRow == null) return null;
    const p = state.currentPiece;
    const fromRow = p.row;
    const toRow = state.ghostRow;
    if (toRow <= fromRow) return null;
    const ev: BoardEffectEvent = {
      type: "hardDrop",
      // Use the piece's leftmost column + half of its shape width as centroid
      col: p.col + Math.floor((p.shape[0]?.length ?? 1) / 2),
      fromRow,
      toRow,
      piece: p.type,
    };
    this.spawn(ev);
    this.debug.lastEvents = [ev];
    return ev;
  }

  /** Clear all active particles (e.g. on game reset). */
  clear(): void {
    this.system.clear();
    this.debug.lastEvents = [];
  }

  // -------------------------------------------------------------------------
  // Particle spawning
  // -------------------------------------------------------------------------

  private spawn(ev: BoardEffectEvent): void {
    const theme = this.getTheme();
    switch (ev.type) {
      case "lineClear":
        this.spawnLineClear(ev.rows, theme, 1);
        break;
      case "tetris":
        this.spawnLineClear(ev.rows, theme, 2);
        this.spawnTetrisBurst(ev.rows, theme);
        break;
      case "lock":
        this.spawnLockPulse(ev.row, ev.col, theme);
        break;
      case "hardDrop":
        this.spawnHardDropTrail(ev.col, ev.fromRow, ev.toRow, theme);
        break;
    }
  }

  private pickColor(theme: Theme): string {
    const colors = theme.palette.particleColors;
    if (colors.length === 0) return theme.palette.accent;
    const idx = Math.floor(this.rng() * colors.length);
    return colors[idx] ?? theme.palette.accent;
  }

  private visibleY(gridRow: number): number {
    return visibleRowCenter(gridRow - BUFFER_HEIGHT, this.cellSize);
  }

  private spawnLineClear(
    rows: number[],
    theme: Theme,
    multiplier: number,
  ): void {
    const cs = this.cellSize;
    const flashConfig: EmitConfig = {
      shape: "square",
      color: "rgba(255,255,255,0.9)",
      lifetime: 0.12,
      velocity: { x: 0, y: 0 },
      size: cs * 0.5,
      fade: [0.9, 0],
      sizeCurve: [1, 1],
    };
    const perRow = Math.round(12 * multiplier);
    for (const r of rows) {
      const y = this.visibleY(r);
      if (y < 0 || y > VISIBLE_HEIGHT * cs) continue;
      // white flash along the row
      for (let c = 0; c < BOARD_WIDTH; c++) {
        this.system.emit(flashConfig, { x: colCenter(c, cs), y }, 1);
      }
      // scattering dissolve particles
      for (let i = 0; i < perRow; i++) {
        const c = Math.floor(this.rng() * BOARD_WIDTH);
        const config: EmitConfig = {
          shape: "square",
          color: this.pickColor(theme),
          lifetime: 0.7,
          velocity: { x: 0, y: -20 },
          velocityJitter: { x: 160, y: 120 },
          gravity: { x: 0, y: 400 },
          size: cs * 0.25,
          fade: [1, 0],
          sizeCurve: [1, 0.3],
        };
        this.system.emit(config, { x: colCenter(c, cs), y }, 1);
      }
    }
  }

  private spawnTetrisBurst(rows: number[], theme: Theme): void {
    if (rows.length === 0) return;
    const cs = this.cellSize;
    const centerY = rows.reduce((a, r) => a + this.visibleY(r), 0) / rows.length;
    const centerX = (BOARD_WIDTH / 2) * cs;

    // horizontal color sweep using lines
    const sweep: EmitConfig = {
      shape: "line",
      color: theme.palette.accent,
      lifetime: 0.35,
      velocity: { x: 0, y: 0 },
      velocityJitter: { x: 400, y: 40 },
      size: cs * 1.2,
      fade: [1, 0],
      sizeCurve: [1, 1.4],
    };
    this.system.emit(sweep, { x: centerX, y: centerY }, 24);

    // oversized faint white flash — stands in for the "screen-wide" flash
    // while staying on the effects canvas (no extra DOM overlay).
    const flash: EmitConfig = {
      shape: "square",
      color: "rgba(255,255,255,0.35)",
      lifetime: 0.18,
      velocity: { x: 0, y: 0 },
      size: Math.max(BOARD_WIDTH, VISIBLE_HEIGHT) * cs,
      fade: [0.6, 0],
      sizeCurve: [1, 1],
    };
    this.system.emit(
      flash,
      { x: centerX, y: (VISIBLE_HEIGHT / 2) * cs },
      1,
    );
  }

  private spawnLockPulse(row: number, col: number, theme: Theme): void {
    const cs = this.cellSize;
    const config: EmitConfig = {
      shape: "circle",
      color: theme.palette.accent,
      lifetime: 0.22,
      velocity: { x: 0, y: 0 },
      velocityJitter: { x: 40, y: 40 },
      size: cs * 0.35,
      fade: [0.7, 0],
      sizeCurve: [1, 2.5],
    };
    // Piece centroid approximation: row/col is top-left of the shape bbox,
    // so nudge by ~1 cell to hit the visual center.
    const x = colCenter(col + 1, cs);
    const y = this.visibleY(row + 1);
    this.system.emit(config, { x, y }, 6);
  }

  private spawnHardDropTrail(
    col: number,
    fromRow: number,
    toRow: number,
    theme: Theme,
  ): void {
    const cs = this.cellSize;
    const colors = theme.palette.particleColors;
    const color = colors[0] ?? theme.palette.accent;
    const x = colCenter(col, cs);
    const config: EmitConfig = {
      shape: "square",
      color,
      lifetime: 0.3,
      velocity: { x: 0, y: 0 },
      size: cs * 0.3,
      fade: [0.6, 0],
      sizeCurve: [1, 0.5],
    };
    for (let r = fromRow; r < toRow; r++) {
      const y = this.visibleY(r);
      if (y < 0 || y > VISIBLE_HEIGHT * cs) continue;
      this.system.emit(config, { x, y }, 1);
    }
  }
}
