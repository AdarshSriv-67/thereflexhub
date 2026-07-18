// Shared click-counting engine. Powers the CPS test, spacebar counter,
// tap speed test, and right click test. The run starts on the first valid
// input and ends after the configured duration.

export type ClickMode = 'click' | 'space' | 'rightclick';

export interface ClickResult {
  clicks: number;
  cps: number;
  duration: number;
}

export interface ClickEngineOptions {
  /** element that receives clicks/taps; for space mode it is only visual */
  zone: HTMLElement;
  duration: number;
  mode: ClickMode;
  /** in 'space' mode, also count pointerdown on the zone so touch users can tap an on-screen spacebar */
  alsoPointer?: boolean;
  onStart?: () => void;
  /** fired on every input and every timer tick while running */
  onTick: (remaining: number, clicks: number, cps: number) => void;
  onFinish: (result: ClickResult) => void;
}

export class ClickEngine {
  private zone: HTMLElement;
  private mode: ClickMode;
  private alsoPointer: boolean;
  private duration: number;
  private onStart?: () => void;
  private onTick: ClickEngineOptions['onTick'];
  private onFinish: ClickEngineOptions['onFinish'];

  private running = false;
  private finished = false;
  private clicks = 0;
  private startAt = 0;
  private timer: number | undefined;

  constructor(opts: ClickEngineOptions) {
    this.zone = opts.zone;
    this.mode = opts.mode;
    this.alsoPointer = opts.alsoPointer ?? false;
    this.duration = opts.duration;
    this.onStart = opts.onStart;
    this.onTick = opts.onTick;
    this.onFinish = opts.onFinish;
    this.bind();
  }

  private bind(): void {
    if (this.mode === 'space') {
      window.addEventListener('keydown', this.onKey);
      // Optionally accept taps on the zone so the on-screen spacebar works on touch devices.
      if (this.alsoPointer) this.zone.addEventListener('pointerdown', this.onPointer);
    } else if (this.mode === 'rightclick') {
      // Suppress the context menu inside the play area only.
      this.zone.addEventListener('contextmenu', (e) => e.preventDefault());
      this.zone.addEventListener('pointerdown', this.onPointer);
    } else {
      this.zone.addEventListener('pointerdown', this.onPointer);
    }
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    // Ignore OS key auto-repeat so held keys do not inflate the count.
    if (e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')) return;
    e.preventDefault();
    this.registerHit();
  };

  private onPointer = (e: PointerEvent): void => {
    if (this.mode === 'rightclick') {
      if (e.button !== 2) return;
    } else if (e.button !== 0 && e.pointerType === 'mouse') {
      return;
    }
    e.preventDefault();
    this.registerHit();
  };

  private registerHit(): void {
    if (this.finished) return;
    if (!this.running) this.start();
    this.clicks++;
    this.emitTick();
  }

  private start(): void {
    this.running = true;
    this.clicks = 0;
    this.startAt = performance.now();
    this.onStart?.();
    this.timer = window.setInterval(() => {
      const elapsed = (performance.now() - this.startAt) / 1000;
      if (elapsed >= this.duration) {
        this.finish();
      } else {
        this.emitTick();
      }
    }, 50);
  }

  private emitTick(): void {
    const elapsed = Math.min((performance.now() - this.startAt) / 1000, this.duration);
    const remaining = Math.max(this.duration - elapsed, 0);
    const cps = elapsed > 0.2 ? this.clicks / elapsed : 0;
    this.onTick(remaining, this.clicks, cps);
  }

  private finish(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.running = false;
    this.finished = true;
    const cps = this.clicks / this.duration;
    this.onFinish({ clicks: this.clicks, cps, duration: this.duration });
  }

  setDuration(seconds: number): void {
    this.duration = seconds;
    this.reset();
  }

  getDuration(): number {
    return this.duration;
  }

  reset(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.running = false;
    this.finished = false;
    this.clicks = 0;
    this.onTick(this.duration, 0, 0);
  }

  destroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey);
    this.zone.removeEventListener('pointerdown', this.onPointer);
  }
}
