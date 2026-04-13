import type { ActivePiece, PieceType, Rotation } from "@tomino/shared";

export const SPAWN_MS = 100;
export const MOVE_MS = 40;
export const ROTATE_MS = 80;

/** Row delta above which movement snaps instantly (hard drop). */
const SNAP_ROW_THRESHOLD = 2;

/**
 * Maximum visual lag (in cells) between the animated render position and
 * the logical position. When rapid inputs arrive faster than a tween can
 * finish, we clamp the tween origin so the piece never trails further than
 * this.
 */
const MAX_LAG_CELLS = 1;

function clampLag(from: number, to: number): number {
  const delta = to - from;
  if (Math.abs(delta) <= MAX_LAG_CELLS) return from;
  return to - Math.sign(delta) * MAX_LAG_CELLS;
}

export interface AnimatedRenderState {
  /** Fractional row used for rendering (may lag logical row). */
  readonly renderRow: number;
  /** Fractional col used for rendering. */
  readonly renderCol: number;
  /** Alpha to draw the piece at (0..1). */
  readonly alpha: number;
  /**
   * Rotation offset in radians to apply around the piece's shape center
   * *in addition to* the logical (already-applied) shape rotation.
   * 0 when at rest.
   */
  readonly rotationOffset: number;
  /** True if any animation is still in progress this frame. */
  readonly animating: boolean;
}

interface Tween<T> {
  readonly from: T;
  readonly to: T;
  readonly start: number;
  readonly duration: number;
}

/**
 * Tracks interpolation state for the active piece. Pure / deterministic —
 * the caller supplies a `now` timestamp each call so tests can drive time.
 */
export class PieceAnimator {
  private lastType: PieceType | null = null;
  private lastRow = 0;
  private lastCol = 0;
  private lastRotation: Rotation = 0;

  private rowTween: Tween<number> | null = null;
  private colTween: Tween<number> | null = null;
  private spawnTween: Tween<number> | null = null;
  private rotationTween: Tween<number> | null = null;

  /** Forget all tracked state (e.g. game reset). */
  reset(): void {
    this.lastType = null;
    this.rowTween = null;
    this.colTween = null;
    this.spawnTween = null;
    this.rotationTween = null;
  }

  /**
   * Call whenever a new game state is observed. Updates internal tweens
   * based on the diff from the previously-observed piece. Returns the
   * animated render state for drawing *right now* at `now`.
   */
  update(piece: ActivePiece | null, now: number): AnimatedRenderState {
    if (!piece) {
      this.reset();
      return {
        renderRow: 0,
        renderCol: 0,
        alpha: 1,
        rotationOffset: 0,
        animating: false,
      };
    }

    const prevType = this.lastType;
    const typeChanged = prevType !== piece.type;

    if (typeChanged) {
      // New spawn (or hold swap): fade in at the target position.
      this.rowTween = null;
      this.colTween = null;
      this.rotationTween = null;
      this.spawnTween = {
        from: 0,
        to: 1,
        start: now,
        duration: SPAWN_MS,
      };
    } else {
      // Same piece — possibly moved / rotated.
      const rowDelta = piece.row - this.lastRow;
      const colDelta = piece.col - this.lastCol;

      if (colDelta !== 0) {
        const currentCol = this.sampleTween(this.colTween, now, this.lastCol);
        this.colTween = {
          from: clampLag(currentCol, piece.col),
          to: piece.col,
          start: now,
          duration: MOVE_MS,
        };
      }

      if (rowDelta !== 0) {
        if (Math.abs(rowDelta) > SNAP_ROW_THRESHOLD) {
          // Hard drop or big jump — snap.
          this.rowTween = null;
        } else {
          const currentRow = this.sampleTween(this.rowTween, now, this.lastRow);
          this.rowTween = {
            from: clampLag(currentRow, piece.row),
            to: piece.row,
            start: now,
            duration: MOVE_MS,
          };
        }
      }

      if (piece.rotation !== this.lastRotation) {
        // Visually rotate from the old orientation towards the new.
        const delta = rotationDelta(this.lastRotation, piece.rotation);
        // Start the tween at -delta (old orientation) and ease to 0 (new).
        this.rotationTween = {
          from: -delta,
          to: 0,
          start: now,
          duration: ROTATE_MS,
        };
      }
    }

    this.lastType = piece.type;
    this.lastRow = piece.row;
    this.lastCol = piece.col;
    this.lastRotation = piece.rotation;

    const renderRow = this.sampleTween(this.rowTween, now, piece.row);
    const renderCol = this.sampleTween(this.colTween, now, piece.col);
    const alpha = this.spawnTween
      ? this.sampleTween(this.spawnTween, now, 1)
      : 1;
    const rotationOffset = this.rotationTween
      ? this.sampleEasedTween(this.rotationTween, now, 0)
      : 0;

    // Drop tweens once complete so animating flag flips off.
    if (this.rowTween && now - this.rowTween.start >= this.rowTween.duration) {
      this.rowTween = null;
    }
    if (this.colTween && now - this.colTween.start >= this.colTween.duration) {
      this.colTween = null;
    }
    if (this.spawnTween && now - this.spawnTween.start >= this.spawnTween.duration) {
      this.spawnTween = null;
    }
    if (
      this.rotationTween &&
      now - this.rotationTween.start >= this.rotationTween.duration
    ) {
      this.rotationTween = null;
    }

    const animating =
      this.rowTween !== null ||
      this.colTween !== null ||
      this.spawnTween !== null ||
      this.rotationTween !== null;

    return { renderRow, renderCol, alpha, rotationOffset, animating };
  }

  private sampleTween(
    tween: Tween<number> | null,
    now: number,
    fallback: number,
  ): number {
    if (!tween) return fallback;
    const t = Math.min(1, Math.max(0, (now - tween.start) / tween.duration));
    return tween.from + (tween.to - tween.from) * t;
  }

  private sampleEasedTween(
    tween: Tween<number>,
    now: number,
    fallback: number,
  ): number {
    if (!tween) return fallback;
    const raw = Math.min(1, Math.max(0, (now - tween.start) / tween.duration));
    const eased = easeOutCubic(raw);
    return tween.from + (tween.to - tween.from) * eased;
  }
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * Signed shortest-path delta in radians between two SRS rotation states.
 * +PI/2 means the piece rotated clockwise by 90°.
 */
function rotationDelta(from: Rotation, to: Rotation): number {
  let d = ((to - from) % 4 + 4) % 4;
  if (d === 3) d = -1;
  if (d === 2) d = 2; // 180° — pick a direction; CW is fine.
  return (d * Math.PI) / 2;
}
