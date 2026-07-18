// Reaction timing engines. ReactionEngine powers the classic red-to-green
// test with multi-round averaging and false-start detection. F1ReactionEngine
// powers the five-light Formula 1 start simulation with jump-start detection.

export type ReactionState = 'idle' | 'waiting' | 'go' | 'tooSoon' | 'roundResult' | 'finished';

export interface ReactionEngineOptions {
  zone: HTMLElement;
  rounds: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  /** listen for the spacebar as input, defaults to true; disable for embeds so the key keeps scrolling the page */
  keyboard?: boolean;
  onStateChange: (state: ReactionState, info: { round: number; rounds: number }) => void;
  onRound: (ms: number, round: number, times: number[]) => void;
  onFalseStart: () => void;
  onFinish: (averageMs: number, times: number[]) => void;
}

export class ReactionEngine {
  private opts: Required<Pick<ReactionEngineOptions, 'minDelayMs' | 'maxDelayMs'>> & ReactionEngineOptions;
  private state: ReactionState = 'idle';
  private round = 0;
  private times: number[] = [];
  private goAt = 0;
  private delayTimer: number | undefined;

  constructor(opts: ReactionEngineOptions) {
    this.opts = { minDelayMs: 2000, maxDelayMs: 5000, ...opts };
    opts.zone.addEventListener('pointerdown', this.onInput);
    window.addEventListener('keydown', this.onKeyInput);
  }

  private onKeyInput = (e: KeyboardEvent): void => {
    if (this.opts.keyboard === false) return;
    if (e.code !== 'Space' || e.repeat) return;
    if (this.state === 'idle' && this.round === 0) return;
    e.preventDefault();
    this.handleInput();
  };

  private onInput = (e: PointerEvent): void => {
    e.preventDefault();
    this.handleInput();
  };

  private handleInput(): void {
    if (this.state === 'waiting') {
      // Clicked while still red: false start, retry the same round.
      if (this.delayTimer !== undefined) clearTimeout(this.delayTimer);
      this.setState('tooSoon');
      this.opts.onFalseStart();
    } else if (this.state === 'go') {
      const ms = Math.round(performance.now() - this.goAt);
      this.times.push(ms);
      this.opts.onRound(ms, this.round, [...this.times]);
      if (this.round >= this.opts.rounds) {
        const avg = Math.round(this.times.reduce((a, b) => a + b, 0) / this.times.length);
        this.setState('finished');
        this.opts.onFinish(avg, [...this.times]);
      } else {
        this.setState('roundResult');
      }
    } else if (
      this.state === 'idle' ||
      this.state === 'tooSoon' ||
      this.state === 'roundResult' ||
      this.state === 'finished'
    ) {
      this.startRound();
    }
  }

  private setState(state: ReactionState): void {
    this.state = state;
    this.opts.onStateChange(state, { round: this.round, rounds: this.opts.rounds });
  }

  private startRound(): void {
    if (this.state === 'idle' || this.state === 'finished') {
      this.round = 0;
      this.times = [];
    }
    if (this.state !== 'tooSoon') this.round++;
    if (this.round === 0) this.round = 1;
    this.setState('waiting');
    const delay = this.opts.minDelayMs + Math.random() * (this.opts.maxDelayMs - this.opts.minDelayMs);
    this.delayTimer = window.setTimeout(() => {
      this.goAt = performance.now();
      this.setState('go');
    }, delay);
  }

  /** Begin a fresh session (used by the restart button). */
  reset(): void {
    if (this.delayTimer !== undefined) clearTimeout(this.delayTimer);
    this.state = 'idle';
    this.round = 0;
    this.times = [];
    this.setState('idle');
  }
}

export type F1State = 'idle' | 'lights' | 'hold' | 'go' | 'jumpStart' | 'finished';

export interface F1EngineOptions {
  zone: HTMLElement;
  /** milliseconds between each red light, real F1 uses about 1000 */
  lightIntervalMs?: number;
  minHoldMs?: number;
  maxHoldMs?: number;
  onLight: (litCount: number) => void;
  onStateChange: (state: F1State) => void;
  onFinish: (ms: number) => void;
  onJumpStart: () => void;
}

export class F1ReactionEngine {
  private opts: Required<Pick<F1EngineOptions, 'lightIntervalMs' | 'minHoldMs' | 'maxHoldMs'>> & F1EngineOptions;
  private state: F1State = 'idle';
  private timers: number[] = [];
  private goAt = 0;

  constructor(opts: F1EngineOptions) {
    this.opts = { lightIntervalMs: 900, minHoldMs: 800, maxHoldMs: 3000, ...opts };
    opts.zone.addEventListener('pointerdown', this.onInput);
    window.addEventListener('keydown', this.onKeyInput);
  }

  private onKeyInput = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.repeat) return;
    if (this.state === 'idle') return;
    e.preventDefault();
    this.handleInput();
  };

  private onInput = (e: PointerEvent): void => {
    e.preventDefault();
    this.handleInput();
  };

  private handleInput(): void {
    if (this.state === 'idle' || this.state === 'jumpStart' || this.state === 'finished') {
      this.startSequence();
    } else if (this.state === 'lights' || this.state === 'hold') {
      // Reacted before lights out: jump start.
      this.clearTimers();
      this.state = 'jumpStart';
      this.opts.onStateChange('jumpStart');
      this.opts.onJumpStart();
    } else if (this.state === 'go') {
      const ms = Math.round(performance.now() - this.goAt);
      this.state = 'finished';
      this.opts.onStateChange('finished');
      this.opts.onFinish(ms);
    }
  }

  private startSequence(): void {
    this.clearTimers();
    this.state = 'lights';
    this.opts.onStateChange('lights');
    this.opts.onLight(0);
    for (let i = 1; i <= 5; i++) {
      this.timers.push(
        window.setTimeout(() => this.opts.onLight(i), i * this.opts.lightIntervalMs)
      );
    }
    const hold = this.opts.minHoldMs + Math.random() * (this.opts.maxHoldMs - this.opts.minHoldMs);
    this.timers.push(
      window.setTimeout(() => {
        this.state = 'hold';
        this.opts.onStateChange('hold');
      }, 5 * this.opts.lightIntervalMs)
    );
    this.timers.push(
      window.setTimeout(() => {
        this.opts.onLight(-1); // all lights out
        this.goAt = performance.now();
        this.state = 'go';
        this.opts.onStateChange('go');
      }, 5 * this.opts.lightIntervalMs + hold)
    );
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  reset(): void {
    this.clearTimers();
    this.state = 'idle';
    this.opts.onLight(0);
    this.opts.onStateChange('idle');
  }
}
