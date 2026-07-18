// Controller for the shared ResultCard component. Engines call show() with a
// finished run; the card animates the score, renders the percentile bar,
// and wires restart and share.

import { saveResult } from './storage';
import { confettiBurst } from './confetti';
import { lockPageScroll } from './scrollLock';

export interface PercentilePoint {
  /** score at this point of the distribution */
  value: number;
  /** share of people this score beats, 0 to 100 */
  beats: number;
}

export interface ShowOptions {
  /** numeric score for this run */
  score: number;
  /** how to render the score, defaults to String(score) */
  display?: string;
  /** short line under the score, e.g. "62 clicks in 10 seconds" */
  detail?: string;
  /** comparison line, e.g. "Average reaction time is 273 ms." */
  compare?: string;
  /** distribution table used for the percentile bar, ordered by value */
  percentileTable?: PercentilePoint[];
  /** text copied to the clipboard by the share button */
  shareText: string;
}

export interface ResultCardConfig {
  /** storage namespace, e.g. "cps" -> trh:cps:best */
  game: string;
  higherIsBetter: boolean;
  /** format a stored numeric value for the personal-best line */
  format?: (v: number) => string;
  onRestart: () => void;
}

/** Interpolate "beats X% of people" from an ordered distribution table. */
export function percentileFor(score: number, table: PercentilePoint[], higherIsBetter: boolean): number {
  const pts = [...table].sort((a, b) => a.value - b.value);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  let beats: number;
  if (score <= first.value) {
    beats = first.beats;
  } else if (score >= last.value) {
    beats = last.beats;
  } else {
    beats = first.beats;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (score <= b.value) {
        const t = (score - a.value) / (b.value - a.value);
        beats = a.beats + t * (b.beats - a.beats);
        break;
      }
    }
  }
  if (!higherIsBetter) beats = 100 - beats;
  return Math.round(Math.min(99, Math.max(1, beats)));
}

function countUp(el: HTMLElement, target: number, display: string, decimals: number): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = display;
    return;
  }
  const start = performance.now();
  const DURATION = 700;
  function frame(now: number): void {
    const t = Math.min((now - start) / DURATION, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    if (t < 1) {
      el.textContent = (target * eased).toFixed(decimals);
      requestAnimationFrame(frame);
    } else {
      el.textContent = display;
    }
  }
  requestAnimationFrame(frame);
}

export class ResultCard {
  private root: HTMLElement;
  private cfg: ResultCardConfig;

  constructor(root: HTMLElement, cfg: ResultCardConfig) {
    this.root = root;
    this.cfg = cfg;
    this.q('restart')?.addEventListener('click', () => {
      this.hide();
      cfg.onRestart();
    });
    // The card is a modal. Every way of dismissing it (X, backdrop, Esc) also
    // resets the game to its ready state: engines ignore input once finished,
    // so a dismissed modal without a reset would leave the game unplayable.
    const dismiss = (): void => {
      this.hide();
      cfg.onRestart();
    };
    this.q('close')?.addEventListener('click', dismiss);
    this.q('backdrop')?.addEventListener('click', dismiss);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.classList.contains('hidden')) dismiss();
    });
  }

  /** Switch the storage namespace, e.g. when the player changes test duration. */
  setGame(game: string): void {
    this.cfg.game = game;
  }

  private q(part: string): HTMLElement | null {
    return this.root.querySelector(`[data-rc-${part}]`);
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.root.classList.remove('flex');
    lockPageScroll('modal', false);
  }

  show(opts: ShowOptions): void {
    const { game, higherIsBetter, format = (v: number) => String(v) } = this.cfg;
    const { best, isNewBest } = saveResult(game, opts.score, higherIsBetter);

    this.root.classList.remove('hidden');
    this.root.classList.add('flex');
    lockPageScroll('modal', true);

    const scoreEl = this.q('score');
    const display = opts.display ?? String(opts.score);
    if (scoreEl) {
      const decimals = display.includes('.') ? (display.split('.')[1]?.replace(/\D/g, '').length ?? 0) : 0;
      const numericPart = parseFloat(display);
      if (Number.isFinite(numericPart) && /^[\d.]/.test(display)) {
        countUp(scoreEl, numericPart, display, decimals);
      } else {
        scoreEl.textContent = display;
      }
    }

    const detail = this.q('detail');
    if (detail) detail.textContent = opts.detail ?? '';
    const compare = this.q('compare');
    if (compare) compare.textContent = opts.compare ?? '';

    const bestEl = this.q('best');
    if (bestEl) bestEl.textContent = `Personal best: ${format(best)}`;
    const pbBadge = this.q('pb');
    pbBadge?.classList.toggle('hidden', !isNewBest);

    const barWrap = this.q('bar-wrap');
    if (opts.percentileTable) {
      const pct = percentileFor(opts.score, opts.percentileTable, higherIsBetter);
      barWrap?.classList.remove('hidden');
      const bar = this.q('bar');
      if (bar) bar.style.width = `${pct}%`;
      const pctEl = this.q('percentile');
      if (pctEl) pctEl.textContent = `You beat roughly ${pct}% of people`;
    } else {
      barWrap?.classList.add('hidden');
    }

    const share = this.q('share');
    if (share) {
      const label = share.querySelector('[data-rc-share-label]') as HTMLElement | null;
      share.onclick = async () => {
        try {
          await navigator.clipboard.writeText(opts.shareText);
          if (label) {
            label.textContent = 'Copied';
            setTimeout(() => {
              label.textContent = 'Share';
            }, 1600);
          }
        } catch {}
      };
    }

    if (isNewBest) confettiBurst();

    (this.q('restart') as HTMLButtonElement | null)?.focus();
  }
}
