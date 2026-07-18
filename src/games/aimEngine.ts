// Canvas aim trainer engine. One circular target is on screen at a time;
// clicking it scores a hit and instantly spawns the next one. The run starts
// when the player clicks the initial center target and ends after the
// configured duration. Targets shrink slightly as the score climbs.

export interface AimResult {
  hits: number;
  /** hit percentage, 0 to 100 */
  accuracy: number;
  /** average time from target spawn to hit, in ms */
  avgMs: number;
  /** total clicks inside the canvas while running */
  clicks: number;
  /** spawn-to-hit time of every target in order, for per-run charts */
  hitTimes: number[];
}

export interface AimEngineOptions {
  canvas: HTMLCanvasElement;
  /** run length in seconds, defaults to 30 */
  duration?: number;
  /** fired once when the first target is clicked and the clock starts */
  onStart?: () => void;
  /** fired while the clock counts down */
  onTick: (remainingSeconds: number, hits: number) => void;
  onHit?: (hits: number, avgMs: number, accuracy: number) => void;
  onMiss?: () => void;
  onFinish: (result: AimResult) => void;
  /** overlay elements (buttons, HUD) that targets must not spawn under */
  avoidElements?: HTMLElement[];
}

/**
 * 'cursor' aims with the normal OS pointer. 'locked' captures the mouse with
 * the Pointer Lock API and moves a virtual crosshair using in-game sensitivity
 * math, so the trainer matches the feel of a specific FPS title.
 */
export type AimMode = 'cursor' | 'locked';

export interface LockedAimConfig {
  /** degrees of in-game rotation per mouse count: game yaw times in-game sens */
  degPerCount: number;
  /** horizontal field of view the game renders, used to map degrees to pixels */
  fovDeg: number;
}

type AimState = 'idle' | 'running' | 'finished';

interface Pop {
  x: number;
  y: number;
  r: number;
  at: number;
}

const START_DIAMETER = 52;
const MIN_DIAMETER = 24;
const SHRINK_PER_HIT = 0.6;
const POP_MS = 160;
const EDGE_PAD = 8;

export class AimEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private duration: number;
  private onStart?: () => void;
  private onTick: AimEngineOptions['onTick'];
  private onHit?: AimEngineOptions['onHit'];
  private onMiss?: AimEngineOptions['onMiss'];
  private onFinish: AimEngineOptions['onFinish'];

  private state: AimState = 'idle';
  private width = 0;
  private height = 0;

  private targetX = 0;
  private targetY = 0;
  private targetR = START_DIAMETER / 2;

  private startAt = 0;
  private spawnAt = 0;
  private hits = 0;
  private misses = 0;
  private totalHitMs = 0;
  private hitTimes: number[] = [];
  private lastTickTenths = -1;

  private pops: Pop[] = [];
  private raf: number | undefined;
  private ro: ResizeObserver | undefined;

  private mode: AimMode = 'cursor';
  private lockedCfg: LockedAimConfig = { degPerCount: 0.022, fovDeg: 103 };
  private crossX = 0;
  private crossY = 0;
  private avoidElements: HTMLElement[] = [];

  private accent = '#22d3ee';
  private innerFill = '#e8fbff';
  private textColor = '#9aa5b8';

  constructor(opts: AimEngineOptions) {
    this.canvas = opts.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.duration = opts.duration ?? 30;
    this.onStart = opts.onStart;
    this.onTick = opts.onTick;
    this.onHit = opts.onHit;
    this.onMiss = opts.onMiss;
    this.onFinish = opts.onFinish;

    this.avoidElements = opts.avoidElements ?? [];

    this.readThemeColors();
    this.canvas.addEventListener('pointerdown', this.onPointer);
    document.addEventListener('pointermove', this.onLockedMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    // Keep browser gestures out of the arena: no context menu on right click,
    // no autoscroll on middle click.
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) e.preventDefault();
    });
    this.canvas.addEventListener('auxclick', (e) => e.preventDefault());

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.canvas);
    } else {
      window.addEventListener('resize', this.onWindowResize);
    }
    this.resize();
  }

  private onWindowResize = (): void => {
    this.resize();
  };

  private readThemeColors(): void {
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--accent').trim();
    const muted = cs.getPropertyValue('--ink-muted').trim();
    if (accent) this.accent = accent;
    if (muted) this.textColor = muted;
  }

  /** Match the backing store to the CSS size and devicePixelRatio. */
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.crossX = Math.min(this.crossX, w);
    this.crossY = Math.min(this.crossY, h);

    if (this.state === 'idle') {
      this.centerTarget();
      this.drawIdle();
    } else if (this.state === 'running') {
      // Keep the current target fully inside the resized canvas.
      const pad = this.targetR + EDGE_PAD;
      this.targetX = Math.min(Math.max(this.targetX, pad), Math.max(pad, w - pad));
      this.targetY = Math.min(Math.max(this.targetY, pad), Math.max(pad, h - pad));
      this.drawFrame();
    } else {
      this.drawFinished();
    }
  }

  private centerTarget(): void {
    this.targetR = START_DIAMETER / 2;
    this.targetX = this.width / 2;
    this.targetY = this.height / 2;
  }

  private currentDiameter(): number {
    return Math.max(MIN_DIAMETER, START_DIAMETER - this.hits * SHRINK_PER_HIT);
  }

  /** Overlay rects (fullscreen button, HUD) in canvas coordinates. */
  private overlayRects(): { l: number; t: number; r: number; b: number }[] {
    const cr = this.canvas.getBoundingClientRect();
    const rects: { l: number; t: number; r: number; b: number }[] = [];
    for (const el of this.avoidElements) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // hidden overlay
      rects.push({ l: r.left - cr.left, t: r.top - cr.top, r: r.right - cr.left, b: r.bottom - cr.top });
    }
    return rects;
  }

  private spawnTarget(): void {
    this.targetR = this.currentDiameter() / 2;
    const pad = this.targetR + EDGE_PAD;
    const spanX = Math.max(0, this.width - pad * 2);
    const spanY = Math.max(0, this.height - pad * 2);
    const avoid = this.overlayRects();
    const margin = this.targetR + 4;
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = pad + Math.random() * spanX;
      const y = pad + Math.random() * spanY;
      const blocked = avoid.some(
        (z) => x > z.l - margin && x < z.r + margin && y > z.t - margin && y < z.b + margin
      );
      this.targetX = x;
      this.targetY = y;
      if (!blocked) break;
    }
    this.spawnAt = performance.now();
  }

  /** Switch between OS-cursor aiming and pointer-locked in-game sensitivity. */
  setAimMode(mode: AimMode, cfg?: LockedAimConfig): void {
    this.mode = mode;
    if (cfg) this.lockedCfg = cfg;
    if (mode === 'cursor' && this.isLocked()) document.exitPointerLock();
    this.crossX = this.width / 2;
    this.crossY = this.height / 2;
    // No cursor:none here: pointer lock hides the OS cursor by itself while
    // locked, and hiding it manually would leave an invisible cursor whenever
    // the mouse is not captured (e.g. after Esc or before the first click).
    this.redrawState();
  }

  private isLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private requestLock(): void {
    // Ask for raw, unaccelerated input where the browser supports it.
    const req = this.canvas.requestPointerLock as unknown as (
      opts?: { unadjustedMovement?: boolean }
    ) => Promise<void> | void;
    try {
      const p = req.call(this.canvas, { unadjustedMovement: true });
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch(() => {
          try {
            this.canvas.requestPointerLock();
          } catch {}
        });
      }
    } catch {
      try {
        this.canvas.requestPointerLock();
      } catch {}
    }
  }

  private onLockChange = (): void => {
    if (this.isLocked()) {
      this.crossX = this.width / 2;
      this.crossY = this.height / 2;
    }
    this.redrawState();
  };

  private onLockedMove = (e: PointerEvent): void => {
    if (this.mode !== 'locked' || !this.isLocked()) return;
    // Map mouse counts to canvas pixels through the game's own angle math:
    // degrees per count (yaw x sens) times pixels per degree (width / FOV).
    const pxPerCount = (this.width / this.lockedCfg.fovDeg) * this.lockedCfg.degPerCount;
    this.crossX = Math.min(Math.max(this.crossX + e.movementX * pxPerCount, 0), this.width);
    this.crossY = Math.min(Math.max(this.crossY + e.movementY * pxPerCount, 0), this.height);
    // While running the rAF loop repaints; outside it, repaint per move.
    if (this.state !== 'running') this.redrawState();
  };

  private redrawState(): void {
    if (this.state === 'running') this.drawFrame();
    else if (this.state === 'finished') this.drawFinished();
    else this.drawIdle();
  }

  private onPointer = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (this.state === 'finished') {
      // A click on a finished arena brings it back to the ready state.
      this.reset();
      return;
    }

    let x: number;
    let y: number;
    let slack = 0;
    if (this.mode === 'locked' && e.pointerType === 'mouse') {
      if (!this.isLocked()) {
        // The click that captures the mouse never counts as a shot.
        this.requestLock();
        return;
      }
      x = this.crossX;
      y = this.crossY;
    } else {
      const rect = this.canvas.getBoundingClientRect();
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
      // A little forgiveness for fingertips; exact radius for mouse.
      slack = e.pointerType === 'touch' ? 6 : 0;
    }
    const onTarget = Math.hypot(x - this.targetX, y - this.targetY) <= this.targetR + slack;

    if (this.state === 'idle') {
      if (onTarget) this.start();
      return;
    }

    if (onTarget) {
      this.registerHit();
    } else {
      this.misses++;
      this.onMiss?.();
    }
  };

  private start(): void {
    this.state = 'running';
    this.hits = 0;
    this.misses = 0;
    this.totalHitMs = 0;
    this.hitTimes = [];
    this.pops = [];
    this.lastTickTenths = -1;
    this.startAt = performance.now();
    this.onStart?.();
    this.spawnTarget();
    this.onTick(this.duration, 0);
    this.raf = requestAnimationFrame(this.loop);
  }

  private registerHit(): void {
    const now = performance.now();
    this.totalHitMs += now - this.spawnAt;
    this.hitTimes.push(Math.round(now - this.spawnAt));
    this.hits++;
    this.pops.push({ x: this.targetX, y: this.targetY, r: this.targetR, at: now });
    if (this.pops.length > 6) this.pops.shift();
    this.spawnTarget();
    this.onHit?.(this.hits, this.avgMs(), this.accuracy());
  }

  private avgMs(): number {
    return this.hits > 0 ? Math.round(this.totalHitMs / this.hits) : 0;
  }

  private accuracy(): number {
    const clicks = this.hits + this.misses;
    return clicks > 0 ? Math.round((this.hits / clicks) * 100) : 0;
  }

  private loop = (): void => {
    if (this.state !== 'running') return;
    const elapsed = (performance.now() - this.startAt) / 1000;
    if (elapsed >= this.duration) {
      this.finish();
      return;
    }
    const remaining = Math.max(this.duration - elapsed, 0);
    const tenths = Math.floor(remaining * 10);
    if (tenths !== this.lastTickTenths) {
      this.lastTickTenths = tenths;
      this.onTick(tenths / 10, this.hits);
    }
    this.drawFrame();
    this.raf = requestAnimationFrame(this.loop);
  };

  private finish(): void {
    this.state = 'finished';
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    // Release the mouse so the player can use the result card below.
    if (this.isLocked()) document.exitPointerLock();
    this.onTick(0, this.hits);
    this.drawFinished();
    this.onFinish({
      hits: this.hits,
      accuracy: this.accuracy(),
      avgMs: this.avgMs(),
      clicks: this.hits + this.misses,
      hitTimes: [...this.hitTimes],
    });
  }

  reset(): void {
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.state = 'idle';
    this.hits = 0;
    this.misses = 0;
    this.totalHitMs = 0;
    this.hitTimes = [];
    this.pops = [];
    this.readThemeColors();
    this.centerTarget();
    this.onTick(this.duration, 0);
    this.drawIdle();
  }

  getDuration(): number {
    return this.duration;
  }

  /** Change the run length. Stops any active run and returns to idle. */
  setDuration(seconds: number): void {
    this.duration = seconds;
    this.reset();
  }

  destroy(): void {
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    document.removeEventListener('pointermove', this.onLockedMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (this.isLocked()) document.exitPointerLock();
    this.ro?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
  }

  // Drawing -----------------------------------------------------------------

  private clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  private drawTarget(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    // Outer ring, accent cyan.
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.accent;
    ctx.fill();
    // Lighter inner ring.
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = this.innerFill;
    ctx.fill();
    // Bullseye.
    ctx.beginPath();
    ctx.arc(x, y, r * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = this.accent;
    ctx.fill();
  }

  /** Cheap expanding-ring pop on each hit. */
  private drawPops(now: number): void {
    const ctx = this.ctx;
    this.pops = this.pops.filter((p) => now - p.at < POP_MS);
    for (const p of this.pops) {
      const t = (now - p.at) / POP_MS;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + t * 0.7), 0, Math.PI * 2);
      ctx.strokeStyle = this.accent;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawCrosshair(): void {
    if (this.mode !== 'locked' || !this.isLocked()) return;
    const ctx = this.ctx;
    const x = this.crossX;
    const y = this.crossY;
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y + 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = this.accent;
    ctx.fill();
  }

  private drawFrame(): void {
    this.clear();
    this.drawPops(performance.now());
    this.drawTarget(this.targetX, this.targetY, this.targetR);
    this.drawCrosshair();
  }

  private drawIdle(): void {
    this.clear();
    this.drawTarget(this.targetX, this.targetY, this.targetR);
    const ctx = this.ctx;
    ctx.fillStyle = this.textColor;
    ctx.textAlign = 'center';
    const needsLock = this.mode === 'locked' && !this.isLocked();
    ctx.font = '600 16px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(
      needsLock ? 'Click to lock your mouse' : 'Click the target to start',
      this.width / 2,
      this.targetY + this.targetR + 32
    );
    ctx.font = '400 13px system-ui, sans-serif';
    ctx.fillText(
      needsLock
        ? 'Aiming with your in-game sens. Esc releases the mouse.'
        : `${this.duration} seconds. Targets shrink as you score.`,
      this.width / 2,
      this.targetY + this.targetR + 54
    );
    this.drawCrosshair();
  }

  private drawFinished(): void {
    this.clear();
    const ctx = this.ctx;
    ctx.fillStyle = this.textColor;
    ctx.textAlign = 'center';
    ctx.font = '700 22px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText("Time's up!", this.width / 2, this.height / 2 - 6);
    ctx.font = '400 14px system-ui, sans-serif';
    ctx.fillText('Your result is in the popup.', this.width / 2, this.height / 2 + 20);
  }
}
