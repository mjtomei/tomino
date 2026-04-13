/**
 * Gravity curves — level-to-drop-interval mappings.
 *
 * Two curves: Guideline (modern) and classic (classic NTSC).
 * Returns the time in milliseconds between automatic downward moves.
 */

// ---------------------------------------------------------------------------
// Guideline gravity curve
// ---------------------------------------------------------------------------

/**
 * Modern Guideline gravity: `(0.8 - (level * 0.007))^level * 1000` ms.
 * Clamped to a minimum of 1ms.
 */
export function guidelineDropInterval(level: number): number {
  const seconds = Math.pow(0.8 - level * 0.007, level);
  return Math.max(1, Math.round(seconds * 1000));
}

// ---------------------------------------------------------------------------
// classic gravity curve
// ---------------------------------------------------------------------------

/** NTSC classic frame rate. */
const NES_FPS = 60.0988;

/** Frames per drop at each level (NTSC classic). */
const NES_FRAMES: readonly number[] = [
  48, // L0
  43, // L1
  38, // L2
  33, // L3
  28, // L4
  23, // L5
  18, // L6
  13, // L7
  8, // L8
  6, // L9
  5, // L10
  5, // L11
  5, // L12
  4, // L13
  4, // L14
  4, // L15
  3, // L16
  3, // L17
  3, // L18
  2, // L19
  2, // L20
  2, // L21
  2, // L22
  2, // L23
  2, // L24
  2, // L25
  2, // L26
  2, // L27
  2, // L28
  1, // L29+
];

/**
 * Classic classic gravity: frame-count lookup table converted to milliseconds.
 * Levels 29+ use 1 frame.
 */
export function classicDropInterval(level: number): number {
  const idx = Math.min(level, NES_FRAMES.length - 1);
  const frames = NES_FRAMES[idx]!;
  return Math.round((frames / NES_FPS) * 1000);
}
