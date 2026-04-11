/**
 * Pure random randomizer — uniform random piece selection, allows repeats.
 * Classic NES-style piece generation.
 */

import type { PieceType } from "./pieces.js";
import { ALL_PIECES } from "./pieces.js";
import type { Randomizer } from "./randomizer.js";

export class PureRandomRandomizer implements Randomizer {
  private _queue: PieceType[] = [];
  private readonly rng: () => number;
  private readonly previewCount: number;

  constructor(previewCount: number, rng?: () => number) {
    this.previewCount = previewCount;
    this.rng = rng ?? Math.random;
    this.fillQueue();
  }

  get queue(): readonly PieceType[] {
    return this._queue;
  }

  next(): PieceType {
    // When previewCount is 0, generate on demand
    if (this._queue.length === 0) {
      return this.randomPiece();
    }
    const piece = this._queue.shift()!;
    this.fillQueue();
    return piece;
  }

  peek(count: number): readonly PieceType[] {
    return this._queue.slice(0, count);
  }

  /** Keep the queue filled to previewCount depth. */
  private fillQueue(): void {
    while (this._queue.length < this.previewCount) {
      this._queue.push(this.randomPiece());
    }
  }

  /** Pick a uniformly random piece. */
  private randomPiece(): PieceType {
    return ALL_PIECES[Math.floor(this.rng() * ALL_PIECES.length)]!;
  }
}
