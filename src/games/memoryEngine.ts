// Memory engines. GridMemoryEngine powers the visual memory tile game
// (a set of tiles lights up at once, the player taps them back from memory).
// SequenceMemoryEngine powers the Simon style game (tiles light one at a time
// and the player repeats the order). Both engines own game state only; the
// page owns the DOM and forwards player input via tap(index).

export type GridMemoryPhase = 'idle' | 'showing' | 'input' | 'paused' | 'finished';

export interface GridMemoryOptions {
  /** how long the pattern stays lit before the input phase, in ms */
  showMs?: number;
  /** pause between completing a level and the next pattern, in ms */
  pauseMs?: number;
  onLevel: (level: number, gridSize: number) => void;
  onShowPattern: (indices: number[]) => void;
  onInputPhase: () => void;
  onTileResult: (index: number, correct: boolean) => void;
  onLives: (livesLeft: number) => void;
  onFinish: (levelReached: number) => void;
}

/** Grid side length for a given level: 3x3 up to level 2, then 4x4, 5x5, 6x6, 7x7. */
export function gridSizeForLevel(level: number): number {
  if (level <= 2) return 3;
  if (level <= 5) return 4;
  if (level <= 9) return 5;
  if (level <= 14) return 6;
  return 7;
}

/** Pick `count` distinct tile indices out of `total` via a partial Fisher-Yates shuffle. */
function pickDistinct(count: number, total: number): Set<number> {
  const pool = Array.from({ length: total }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (total - i));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return new Set(pool.slice(0, count));
}

/**
 * Visual memory test engine. Level N lights N + 2 tiles simultaneously for
 * about a second; the player then taps every lit tile from memory.
 *
 * Lives rule (implemented): the player has 3 lives for the entire run. A
 * wrong tap costs one life and replays a NEW random pattern at the same
 * level. Losing the third life ends the game. onFinish reports the level the
 * run ended on, which is the highest level the player reached.
 */
export class GridMemoryEngine {
  private opts: Required<Pick<GridMemoryOptions, 'showMs' | 'pauseMs'>> & GridMemoryOptions;
  private phase: GridMemoryPhase = 'idle';
  private level = 1;
  private lives = 3;
  private target = new Set<number>();
  private found = new Set<number>();
  private timers: number[] = [];

  constructor(opts: GridMemoryOptions) {
    this.opts = { showMs: 1000, pauseMs: 600, ...opts };
  }

  getPhase(): GridMemoryPhase {
    return this.phase;
  }

  /** Begin a fresh run at level 1 with 3 lives. */
  start(): void {
    this.clearTimers();
    this.level = 1;
    this.lives = 3;
    this.phase = 'paused';
    this.opts.onLives(this.lives);
    this.beginLevel();
  }

  /** Player tapped tile `index`. Ignored outside the input phase. */
  tap(index: number): void {
    if (this.phase !== 'input') return;
    if (this.found.has(index)) return;
    if (this.target.has(index)) {
      this.found.add(index);
      this.opts.onTileResult(index, true);
      if (this.found.size === this.target.size) {
        this.level++;
        this.phase = 'paused';
        this.after(this.opts.pauseMs, () => this.beginLevel());
      }
    } else {
      this.opts.onTileResult(index, false);
      this.lives--;
      this.opts.onLives(this.lives);
      if (this.lives <= 0) {
        this.phase = 'finished';
        this.opts.onFinish(this.level);
      } else {
        // Life lost: replay a new random pattern at the same level.
        this.phase = 'paused';
        this.after(this.opts.pauseMs + 300, () => this.beginLevel());
      }
    }
  }

  /** Abandon the current run and return to idle (used by the restart button). */
  reset(): void {
    this.clearTimers();
    this.phase = 'idle';
    this.level = 1;
    this.lives = 3;
    this.target.clear();
    this.found.clear();
  }

  private beginLevel(): void {
    const size = gridSizeForLevel(this.level);
    const total = size * size;
    const count = Math.min(this.level + 2, total - 1);
    this.target = pickDistinct(count, total);
    this.found.clear();
    this.opts.onLevel(this.level, size);
    this.phase = 'showing';
    this.opts.onShowPattern([...this.target]);
    this.after(this.opts.showMs, () => {
      this.phase = 'input';
      this.opts.onInputPhase();
    });
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}

export type SequenceMemoryPhase = 'idle' | 'playback' | 'input' | 'paused' | 'finished';

export interface SequenceMemoryOptions {
  /** number of tiles in the fixed grid, default 9 (a 3x3 grid) */
  tileCount?: number;
  /** gap between playback lights, in ms */
  gapMs?: number;
  onLevel: (level: number) => void;
  onPlayback: (index: number, step: number) => void;
  onPlaybackEnd: () => void;
  onCorrectTap: (index: number, step: number) => void;
  onFinish: (levelReached: number) => void;
}

/**
 * Simon style sequence memory engine on a fixed 3x3 grid. The sequence starts
 * at length 1 and gains one random step per completed level. Playback lights
 * one tile at a time (600 ms on, 200 ms gap at level 1) and speeds up as
 * levels climb, never dropping below 300 ms per light. One wrong tap ends the
 * run (classic Simon rules). onFinish reports the level the run ended on,
 * which is the highest sequence length the player reached.
 */
export class SequenceMemoryEngine {
  private opts: Required<Pick<SequenceMemoryOptions, 'tileCount' | 'gapMs'>> & SequenceMemoryOptions;
  private phase: SequenceMemoryPhase = 'idle';
  private level = 0;
  private sequence: number[] = [];
  private step = 0;
  private timers: number[] = [];

  constructor(opts: SequenceMemoryOptions) {
    this.opts = { tileCount: 9, gapMs: 200, ...opts };
  }

  getPhase(): SequenceMemoryPhase {
    return this.phase;
  }

  /** How long each tile stays lit during playback at the current level. */
  playbackOnMs(): number {
    return Math.max(300, 600 - (this.level - 1) * 20);
  }

  /** Begin a fresh run with a length 1 sequence. */
  start(): void {
    this.clearTimers();
    this.level = 0;
    this.sequence = [];
    this.step = 0;
    this.nextLevel();
  }

  /** Player tapped tile `index`. Ignored outside the input phase. */
  tap(index: number): void {
    if (this.phase !== 'input') return;
    if (index === this.sequence[this.step]) {
      this.opts.onCorrectTap(index, this.step);
      this.step++;
      if (this.step === this.sequence.length) {
        this.phase = 'paused';
        this.after(700, () => this.nextLevel());
      }
    } else {
      this.phase = 'finished';
      this.opts.onFinish(this.level);
    }
  }

  /** Abandon the current run and return to idle (used by the restart button). */
  reset(): void {
    this.clearTimers();
    this.phase = 'idle';
    this.level = 0;
    this.sequence = [];
    this.step = 0;
  }

  private nextLevel(): void {
    this.level++;
    this.step = 0;
    this.sequence.push(Math.floor(Math.random() * this.opts.tileCount));
    this.opts.onLevel(this.level);
    this.playback();
  }

  private playback(): void {
    this.phase = 'playback';
    const stepMs = this.playbackOnMs() + this.opts.gapMs;
    const leadInMs = 500;
    this.sequence.forEach((index, i) => {
      this.after(leadInMs + i * stepMs, () => this.opts.onPlayback(index, i));
    });
    this.after(leadInMs + this.sequence.length * stepMs, () => {
      this.phase = 'input';
      this.opts.onPlaybackEnd();
    });
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
