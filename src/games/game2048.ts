// 2048 engine for The Reflex Hub. The engine owns absolutely positioned tile
// elements inside a positioned board layer: slides animate via CSS transform
// (about 120ms), new tiles pop in with a scale animation, and merged tiles
// briefly pulse. Vanilla TypeScript, no dependencies.

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface TilePaint {
  /** CSS background value for the tile (color or gradient) */
  bg: string;
  /** CSS text color for the tile */
  fg: string;
}

export interface Game2048Options {
  /** positioned layer element the engine renders tile elements into */
  board: HTMLElement;
  /** returns background and text color for a tile value */
  colorFor: (value: number) => TilePaint;
  /** extra classes applied to every tile element, e.g. rounding and font */
  tileClass?: string;
  /** pixel gap between cells, must match the empty slot grid (default 8) */
  gapPx?: number;
  /** fired after every effective move with the total score and merge delta */
  onScore?: (score: number, delta: number) => void;
  /** fired once per game when no move can change the board */
  onGameOver?: (score: number, bestTile: number) => void;
  /** fired once per game when a 2048 tile is created; play continues */
  onWin?: () => void;
}

interface Tile {
  value: number;
  row: number;
  col: number;
  el: HTMLElement;
  /** true if this tile was created by a merge during the current move */
  merged: boolean;
}

const SIZE = 4;
const SLIDE_MS = 120;

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyA: 'left',
  KeyS: 'down',
  KeyD: 'right',
};

const VECTORS: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = [
    `.trh2048-tile{position:absolute;top:0;left:0;display:flex;align-items:center;justify-content:center;`,
    `user-select:none;-webkit-user-select:none;transition:transform ${SLIDE_MS}ms ease;will-change:transform;}`,
    `@keyframes trh2048-pop{0%{scale:0.2;opacity:0;}60%{scale:1.08;opacity:1;}100%{scale:1;}}`,
    `@keyframes trh2048-pulse{0%{scale:1;}45%{scale:1.16;}100%{scale:1;}}`,
    `.trh2048-spawn{animation:trh2048-pop 170ms ease 80ms backwards;}`,
    `.trh2048-pulse{animation:trh2048-pulse 180ms ease;}`,
  ].join('');
  document.head.appendChild(style);
}

export class Game2048 {
  private board: HTMLElement;
  private colorFor: (value: number) => TilePaint;
  private tileClass: string;
  private gap: number;
  private onScore?: (score: number, delta: number) => void;
  private onGameOver?: (score: number, bestTile: number) => void;
  private onWin?: () => void;

  private grid: (Tile | null)[][] = [];
  private score = 0;
  private over = false;
  private won2048 = false;
  /** bumps on reset so stale animation timeouts from an old game are ignored */
  private gen = 0;
  private touchStart: { x: number; y: number } | null = null;

  constructor(opts: Game2048Options) {
    this.board = opts.board;
    this.colorFor = opts.colorFor;
    this.tileClass = opts.tileClass ?? '';
    this.gap = opts.gapPx ?? 8;
    this.onScore = opts.onScore;
    this.onGameOver = opts.onGameOver;
    this.onWin = opts.onWin;

    injectStyles();
    if (getComputedStyle(this.board).position === 'static') {
      this.board.style.position = 'relative';
    }
    // Stop the browser from scrolling or zooming on swipes over the board.
    this.board.style.touchAction = 'none';

    window.addEventListener('keydown', this.onKey);
    this.board.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.board.addEventListener('touchend', this.onTouchEnd);

    this.reset();
  }

  // ---- input -------------------------------------------------------------

  private onKey = (e: KeyboardEvent): void => {
    const dir = KEYS[e.code];
    if (!dir) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    // Stop arrow keys from scrolling the page while playing.
    e.preventDefault();
    this.move(dir);
  };

  private onTouchStart = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (!t) return;
    this.touchStart = { x: t.clientX, y: t.clientY };
  };

  private onTouchEnd = (e: TouchEvent): void => {
    const start = this.touchStart;
    this.touchStart = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 30) return;
    // Ignore ambiguous diagonal swipes rather than guessing an axis.
    if (ax > ay * 1.2) {
      this.move(dx > 0 ? 'right' : 'left');
    } else if (ay > ax * 1.2) {
      this.move(dy > 0 ? 'down' : 'up');
    }
  };

  // ---- game logic ----------------------------------------------------------

  move(dir: Direction): void {
    if (this.over) return;
    const { dr, dc } = VECTORS[dir];

    // Traverse starting from the side the tiles move toward.
    const rows = [0, 1, 2, 3];
    const cols = [0, 1, 2, 3];
    if (dr === 1) rows.reverse();
    if (dc === 1) cols.reverse();

    for (const tile of this.tiles()) tile.merged = false;

    let moved = false;
    let delta = 0;
    let made2048 = false;

    for (const r of rows) {
      for (const c of cols) {
        const tile = this.grid[r]![c];
        if (!tile) continue;

        // Slide as far as possible along the vector.
        let nr = tile.row;
        let nc = tile.col;
        while (this.inBounds(nr + dr, nc + dc) && !this.grid[nr + dr]![nc + dc]) {
          nr += dr;
          nc += dc;
        }

        const tr = nr + dr;
        const tc = nc + dc;
        const target = this.inBounds(tr, tc) ? this.grid[tr]![tc] : null;

        if (target && target.value === tile.value && !target.merged) {
          // Merge: the moving tile slides onto the target, then disappears
          // while the target doubles and pulses. Each tile merges once per move.
          this.grid[tile.row]![tile.col] = null;
          target.value *= 2;
          target.merged = true;
          delta += target.value;
          if (target.value === 2048) made2048 = true;
          this.setTransform(tile.el, tr, tc);
          this.afterSlide(() => {
            tile.el.remove();
            this.paint(target);
            target.el.classList.remove('trh2048-pulse');
            void target.el.offsetWidth; // restart the pulse animation
            target.el.classList.add('trh2048-pulse');
          });
          moved = true;
        } else if (nr !== tile.row || nc !== tile.col) {
          this.grid[tile.row]![tile.col] = null;
          tile.row = nr;
          tile.col = nc;
          this.grid[nr]![nc] = tile;
          this.setTransform(tile.el, nr, nc);
          moved = true;
        }
      }
    }

    if (!moved) return;

    this.score += delta;
    this.onScore?.(this.score, delta);
    this.spawnTile();

    if (made2048 && !this.won2048) {
      this.won2048 = true;
      this.afterSlide(() => this.onWin?.());
    }

    if (!this.anyMoves()) {
      this.over = true;
      const finalScore = this.score;
      const bestTile = this.getBestTile();
      const gen = this.gen;
      window.setTimeout(() => {
        if (gen === this.gen) this.onGameOver?.(finalScore, bestTile);
      }, 380);
    }
  }

  reset(): void {
    this.gen++;
    for (const tile of this.tiles()) tile.el.remove();
    this.grid = Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null));
    this.score = 0;
    this.over = false;
    this.won2048 = false;
    this.touchStart = null;
    this.spawnTile();
    this.spawnTile();
    this.onScore?.(0, 0);
  }

  getScore(): number {
    return this.score;
  }

  getBestTile(): number {
    let best = 0;
    for (const tile of this.tiles()) best = Math.max(best, tile.value);
    return best;
  }

  destroy(): void {
    this.gen++;
    window.removeEventListener('keydown', this.onKey);
    this.board.removeEventListener('touchstart', this.onTouchStart);
    this.board.removeEventListener('touchend', this.onTouchEnd);
    for (const tile of this.tiles()) tile.el.remove();
  }

  // ---- helpers ---------------------------------------------------------

  private tiles(): Tile[] {
    const out: Tile[] = [];
    for (const row of this.grid) {
      for (const tile of row) if (tile) out.push(tile);
    }
    return out;
  }

  private inBounds(r: number, c: number): boolean {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  private anyMoves(): boolean {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tile = this.grid[r]![c];
        if (!tile) return true;
        if (r + 1 < SIZE && this.grid[r + 1]![c]?.value === tile.value) return true;
        if (c + 1 < SIZE && this.grid[r]![c + 1]?.value === tile.value) return true;
      }
    }
    return false;
  }

  private spawnTile(): void {
    const empty: { r: number; c: number }[] = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!this.grid[r]![c]) empty.push({ r, c });
      }
    }
    if (empty.length === 0) return;
    const spot = empty[Math.floor(Math.random() * empty.length)]!;
    const value = Math.random() < 0.9 ? 2 : 4;
    this.createTile(spot.r, spot.c, value);
  }

  private createTile(row: number, col: number, value: number): void {
    const el = document.createElement('div');
    el.className = `trh2048-tile trh2048-spawn ${this.tileClass}`.trim();
    const side = `calc((100% - ${(SIZE - 1) * this.gap}px) / ${SIZE})`;
    el.style.width = side;
    el.style.height = side;
    const tile: Tile = { value, row, col, el, merged: false };
    this.setTransform(el, row, col);
    this.paint(tile);
    this.grid[row]![col] = tile;
    this.board.appendChild(el);
  }

  private setTransform(el: HTMLElement, row: number, col: number): void {
    // translate percentages are relative to the tile itself, so one cell of
    // travel is the tile's own size plus the fixed pixel gap.
    el.style.transform =
      `translate(calc(${col * 100}% + ${col * this.gap}px), calc(${row * 100}% + ${row * this.gap}px))`;
  }

  private paint(tile: Tile): void {
    const p = this.colorFor(tile.value);
    tile.el.textContent = String(tile.value);
    tile.el.style.background = p.bg;
    tile.el.style.color = p.fg;
    tile.el.style.fontSize = this.fontSizeFor(tile.value);
  }

  private fontSizeFor(value: number): string {
    const len = String(value).length;
    if (len <= 2) return '1.9rem';
    if (len === 3) return '1.55rem';
    if (len === 4) return '1.3rem';
    return '1rem';
  }

  private afterSlide(fn: () => void): void {
    const gen = this.gen;
    window.setTimeout(() => {
      if (gen === this.gen) fn();
    }, SLIDE_MS);
  }
}
