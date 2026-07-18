// Stroop test engine. Shows a color word rendered in a mismatched ink color;
// the player must pick the INK color. A run lasts a configurable duration and
// starts when start() is called, which the page wires to an explicit start
// tap. The active color set is configurable (classic four or a harder six).
// Scoring: +1 per correct answer, -1 per wrong answer, never below 0.
// Dependency-free vanilla TS.

export type StroopColor = 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'orange';

export interface StroopResult {
  score: number;
  correct: number;
  wrong: number;
  /** average response time in ms per answer, 0 if no answers */
  avgMs: number;
}

export interface StroopEngineOptions {
  /** run length in seconds, defaults to 30 */
  duration?: number;
  /** active color set, defaults to the classic four */
  colors?: StroopColor[];
  /** a new prompt is on screen: the word to display and the ink to render it in */
  onPrompt: (word: StroopColor, ink: StroopColor) => void;
  /** fired on every timer tick while running */
  onTick: (remainingSeconds: number, score: number) => void;
  /** fired after every answer with the running average response time */
  onAnswer: (correct: boolean, avgMs: number) => void;
  onFinish: (result: StroopResult) => void;
}

const DEFAULT_COLORS: StroopColor[] = ['red', 'green', 'blue', 'yellow'];

export class StroopEngine {
  private duration: number;
  private colors: StroopColor[];
  private onPrompt: StroopEngineOptions['onPrompt'];
  private onTick: StroopEngineOptions['onTick'];
  private onAnswer: StroopEngineOptions['onAnswer'];
  private onFinish: StroopEngineOptions['onFinish'];

  private running = false;
  private score = 0;
  private correct = 0;
  private wrong = 0;
  private totalMs = 0;
  private startAt = 0;
  private promptAt = 0;
  private currentInk: StroopColor = 'red';
  private lastWord: StroopColor | null = null;
  private lastInk: StroopColor | null = null;
  private timer: number | undefined;

  constructor(opts: StroopEngineOptions) {
    this.duration = opts.duration ?? 30;
    this.colors = opts.colors ?? [...DEFAULT_COLORS];
    this.onPrompt = opts.onPrompt;
    this.onTick = opts.onTick;
    this.onAnswer = opts.onAnswer;
    this.onFinish = opts.onFinish;
  }

  /** Begin a run. The countdown starts immediately and the first prompt is shown. */
  start(): void {
    if (this.running) return;
    this.clearTimer();
    this.score = 0;
    this.correct = 0;
    this.wrong = 0;
    this.totalMs = 0;
    this.lastWord = null;
    this.lastInk = null;
    this.running = true;
    this.startAt = performance.now();
    this.timer = window.setInterval(() => {
      const elapsed = (performance.now() - this.startAt) / 1000;
      if (elapsed >= this.duration) {
        this.finish();
      } else {
        this.onTick(Math.max(this.duration - elapsed, 0), this.score);
      }
    }, 100);
    this.onTick(this.duration, 0);
    this.nextPrompt();
  }

  /** The player picked an ink color. Ignored when no run is active. */
  answer(ink: StroopColor): void {
    if (!this.running) return;
    const isCorrect = ink === this.currentInk;
    this.totalMs += performance.now() - this.promptAt;
    if (isCorrect) {
      this.correct++;
      this.score++;
    } else {
      this.wrong++;
      this.score = Math.max(0, this.score - 1);
    }
    this.onAnswer(isCorrect, this.avgMs());
    this.nextPrompt();
  }

  isRunning(): boolean {
    return this.running;
  }

  getDuration(): number {
    return this.duration;
  }

  /** Change the run length. Stops any active run. */
  setDuration(seconds: number): void {
    this.duration = seconds;
    this.reset();
  }

  getColors(): StroopColor[] {
    return [...this.colors];
  }

  /** Change the active color set. Stops any active run. */
  setColors(colors: StroopColor[]): void {
    this.colors = [...colors];
    this.reset();
  }

  /** Stop any active run and return to the idle state. */
  reset(): void {
    this.clearTimer();
    this.running = false;
    this.score = 0;
    this.correct = 0;
    this.wrong = 0;
    this.totalMs = 0;
    this.onTick(this.duration, 0);
  }

  destroy(): void {
    this.clearTimer();
    this.running = false;
  }

  private avgMs(): number {
    const answers = this.correct + this.wrong;
    return answers === 0 ? 0 : Math.round(this.totalMs / answers);
  }

  private nextPrompt(): void {
    let word: StroopColor;
    let ink: StroopColor;
    // The word never matches the ink, and the identical word+ink pair never
    // repeats back to back.
    do {
      word = this.colors[Math.floor(Math.random() * this.colors.length)]!;
      ink = this.colors[Math.floor(Math.random() * this.colors.length)]!;
    } while (word === ink || (word === this.lastWord && ink === this.lastInk));
    this.lastWord = word;
    this.lastInk = ink;
    this.currentInk = ink;
    this.promptAt = performance.now();
    this.onPrompt(word, ink);
  }

  private finish(): void {
    this.clearTimer();
    this.running = false;
    this.onFinish({
      score: this.score,
      correct: this.correct,
      wrong: this.wrong,
      avgMs: this.avgMs(),
    });
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
