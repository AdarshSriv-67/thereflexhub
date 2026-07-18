// Shared stats-and-history panel used by every game page. Stores the last 20
// runs per game in localStorage (trh:<game>:runs), renders a line chart of the
// primary score, an optional per-run bar chart (when a run has per-item ms
// times, e.g. per-target or per-round), and a recent-runs table that doubles
// as the accessible table view of the charts.

export interface StatsColumn {
  /** key into the run's extras record */
  key: string;
  label: string;
}

export interface StatsPanelConfig {
  /** storage namespace: history lives at trh:<game>:runs */
  game: string;
  /** name of the primary value, used as table header and chart labels, e.g. "Hits", "CPS", "Avg ms" */
  valueLabel: string;
  /** format the primary value for the table, defaults to String */
  format?: (v: number) => string;
  /** extra table columns rendered after the primary value */
  columns?: StatsColumn[];
  /** decimal places on chart axis ticks */
  decimals?: number;
  /** unit suffix in per-run bar chart tooltips, defaults to "ms" */
  runItemUnit?: string;
  /** noun for per-run chart tooltips, e.g. "Target" or "Round" */
  runItemNoun?: string;
}

export interface StatsRun {
  /** primary score */
  v: number;
  /** unix ms timestamp */
  t: number;
  /** extra display fields keyed by StatsColumn.key */
  x?: Record<string, string | number>;
}

const RUNS_LIMIT = 20;
const TABLE_ROWS = 10;

function runsKey(game: string): string {
  return `trh:${game}:runs`;
}

export function loadRuns(game: string): StatsRun[] {
  try {
    const raw = JSON.parse(localStorage.getItem(runsKey(game)) ?? '[]');
    return Array.isArray(raw) ? (raw as StatsRun[]) : [];
  } catch {
    return [];
  }
}

function saveRun(game: string, run: StatsRun): StatsRun[] {
  const runs = loadRuns(game);
  runs.push(run);
  while (runs.length > RUNS_LIMIT) runs.shift();
  try {
    localStorage.setItem(runsKey(game), JSON.stringify(runs));
  } catch {}
  return runs;
}

export function timeAgo(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Escape a string for safe interpolation into innerHTML. */
function esc(v: string | number): string {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const W = 520;
const H = 170;
const PAD_T = 12;
const PAD_B = 20;

function gridAndTicks(padL: number, padR: number, yMax: number, decimals: number): string {
  const innerH = H - PAD_T - PAD_B;
  let s = '';
  for (const frac of [0, 0.5, 1]) {
    const y = PAD_T + innerH - innerH * frac;
    s += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--line)" stroke-width="1"/>`;
    s += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--ink-muted)">${(yMax * frac).toFixed(decimals)}</text>`;
  }
  return s;
}

/** Thin-bar chart of per-item ms times inside one run. */
function runBarChart(times: number[], noun: string, unit: string): string {
  const padL = 40;
  const padR = 8;
  const innerW = W - padL - padR;
  const innerH = H - PAD_T - PAD_B;
  const yMax = Math.max(...times) * 1.1;
  const n = times.length;
  const slot = innerW / n;
  const bw = Math.max(2, Math.min(14, slot - 2));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Bar chart of ${esc(noun.toLowerCase())} times in this run">`;
  s += gridAndTicks(padL, padR, yMax, 0);
  for (let i = 0; i < n; i++) {
    const t = times[i]!;
    const bh = Math.max(2, (t / yMax) * innerH);
    const x = padL + i * slot + (slot - bw) / 2;
    const y = PAD_T + innerH - bh;
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="var(--accent)" opacity="0.85"><title>${esc(noun)} ${i + 1}: ${t} ${esc(unit)}</title></rect>`;
  }
  s += `<text x="${padL}" y="${H - 6}" font-size="10" fill="var(--ink-muted)">${esc(noun.toLowerCase())} 1</text>`;
  s += `<text x="${W - padR}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--ink-muted)">${esc(noun.toLowerCase())} ${n}</text>`;
  return s + '</svg>';
}

/** Line chart of the primary score across stored runs, oldest to newest. */
function historyLineChart(runs: StatsRun[], cfg: StatsPanelConfig): string {
  const padL = 40;
  const padR = 34;
  const innerW = W - padL - padR;
  const innerH = H - PAD_T - PAD_B;
  const decimals = cfg.decimals ?? 0;
  const yMax = Math.max(...runs.map((r) => r.v)) * 1.15 || 1;
  const n = runs.length;
  const px = (i: number): number => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const py = (v: number): number => PAD_T + innerH - (v / yMax) * innerH;
  const fmt = cfg.format ?? ((v: number) => v.toFixed(decimals));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Line chart of ${esc(cfg.valueLabel.toLowerCase())} across your last ${n} runs">`;
  s += gridAndTicks(padL, padR, yMax, decimals);
  const path = runs.map((r, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(r.v).toFixed(1)}`).join('');
  s += `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  runs.forEach((r, i) => {
    const cx = px(i).toFixed(1);
    const cy = py(r.v).toFixed(1);
    const extras = (cfg.columns ?? [])
      .map((c) => {
        const val = r.x?.[c.key];
        return val === undefined ? '' : `, ${esc(c.label.toLowerCase())} ${esc(val)}`;
      })
      .join('');
    s += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="10" fill="transparent"><title>${esc(fmt(r.v))} ${esc(cfg.valueLabel.toLowerCase())}${extras} (${esc(timeAgo(r.t))})</title></circle>`;
  });
  const last = runs[n - 1]!;
  s += `<text x="${(px(n - 1) + 8).toFixed(1)}" y="${(py(last.v) + 4).toFixed(1)}" font-size="11" font-weight="700" fill="var(--ink)">${esc(fmt(last.v))}</text>`;
  s += `<text x="${padL}" y="${H - 6}" font-size="10" fill="var(--ink-muted)">${esc(timeAgo(runs[0]!.t))}</text>`;
  s += `<text x="${W - padR}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--ink-muted)">latest</text>`;
  return s + '</svg>';
}

export interface StatsPanelHandle {
  /** Persist a finished run and refresh the panel. perItemMs feeds the per-run bar chart. */
  record: (value: number, extras?: Record<string, string | number>, perItemMs?: number[]) => void;
}

export function initStatsPanel(root: HTMLElement, cfg: StatsPanelConfig): StatsPanelHandle {
  const q = (part: string): HTMLElement | null => root.querySelector(`[data-sp-${part}]`);
  const noun = cfg.runItemNoun ?? 'Item';
  const unit = cfg.runItemUnit ?? 'ms';

  function render(runs: StatsRun[], perItemMs: number[] | null): void {
    if (runs.length === 0 && !perItemMs?.length) return;
    root.classList.remove('hidden');

    const runBlock = q('run-block');
    if (runBlock && perItemMs && perItemMs.length > 0) {
      runBlock.classList.remove('hidden');
      const chart = q('run-chart');
      if (chart) chart.innerHTML = runBarChart(perItemMs, noun, unit);
      const note = q('run-note');
      if (note) {
        const sorted = [...perItemMs].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)]!;
        note.textContent = `Fastest ${sorted[0]} ${unit}, median ${median} ${unit}, slowest ${sorted[sorted.length - 1]} ${unit}`;
      }
    }

    if (runs.length >= 2) {
      q('hist-block')?.classList.remove('hidden');
      const chart = q('hist-chart');
      if (chart) chart.innerHTML = historyLineChart(runs, cfg);
    }

    if (runs.length > 0) {
      q('table-block')?.classList.remove('hidden');
      const head = q('head');
      const cols = cfg.columns ?? [];
      if (head) {
        head.innerHTML =
          `<th class="px-3 py-2 font-bold">When</th><th class="px-3 py-2 font-bold">${esc(cfg.valueLabel)}</th>` +
          cols.map((c) => `<th class="px-3 py-2 font-bold">${esc(c.label)}</th>`).join('');
      }
      const rows = q('rows');
      const fmt = cfg.format ?? ((v: number) => String(v));
      if (rows) {
        rows.innerHTML = [...runs]
          .reverse()
          .slice(0, TABLE_ROWS)
          .map((r) => {
            const extras = cols
              .map((c) => `<td class="px-3 py-2">${r.x?.[c.key] === undefined ? '' : esc(r.x[c.key]!)}</td>`)
              .join('');
            return `<tr class="border-t border-line"><td class="px-3 py-2">${esc(timeAgo(r.t))}</td><td class="px-3 py-2 font-bold text-ink">${esc(fmt(r.v))}</td>${extras}</tr>`;
          })
          .join('');
      }
    }
  }

  // Clear history: destructive, so require a second tap to confirm.
  // Clears the stored runs (what this panel shows); the personal best is kept.
  const clearBtn = q('clear') as HTMLButtonElement | null;
  if (clearBtn) {
    let armed = false;
    let disarmTimer: number | undefined;
    const disarm = (): void => {
      armed = false;
      clearBtn.textContent = 'Clear history';
    };
    clearBtn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        clearBtn.textContent = 'Tap again to confirm';
        disarmTimer = window.setTimeout(disarm, 3000);
        return;
      }
      if (disarmTimer !== undefined) clearTimeout(disarmTimer);
      disarm();
      try {
        localStorage.removeItem(runsKey(cfg.game));
      } catch {}
      q('run-block')?.classList.add('hidden');
      q('hist-block')?.classList.add('hidden');
      q('table-block')?.classList.add('hidden');
      root.classList.add('hidden');
    });
  }

  render(loadRuns(cfg.game), null);

  return {
    record(value, extras, perItemMs) {
      const run: StatsRun = { v: value, t: Date.now() };
      if (extras) run.x = extras;
      render(saveRun(cfg.game, run), perItemMs ?? null);
    },
  };
}
