/**
 * 7-bag randomizer — shuffles all 7 pieces, deals them out, refills.
 * Standard modern tetromino piece generation.
 */

import type { PieceType } from "./pieces.js";
import { ALL_PIECES } from "./pieces.js";
import type { Randomizer } from "./randomizer.js";

export class SevenBagRandomizer implements Randomizer {
  private _queue: PieceType[] = [];
  private bag: PieceType[] = [];
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
    // When previewCount is 0, generate on demand from the bag directly
    if (this._queue.length === 0) {
      if (this.bag.length === 0) {
        this.bag = this.newBag();
      }
      return this.bag.shift()!;
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
      if (this.bag.length === 0) {
        this.bag = this.newBag();
      }
      this._queue.push(this.bag.shift()!);
    }
  }

  /** Create a new shuffled bag of all 7 pieces (Fisher-Yates). */
  private newBag(): PieceType[] {
    const bag = [...ALL_PIECES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    return bag;
  }
}
