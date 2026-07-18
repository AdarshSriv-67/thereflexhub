// localStorage persistence for scores. Keys are namespaced: trh:<game>:best, trh:<game>:history

export interface StoredResult {
  /** primary score value */
  v: number;
  /** unix ms timestamp */
  t: number;
}

const HISTORY_LIMIT = 50;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function getBest(game: string): number | null {
  const v = read<number>(`trh:${game}:best`);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function getHistory(game: string): StoredResult[] {
  return read<StoredResult[]>(`trh:${game}:history`) ?? [];
}

/**
 * Persist a result and update the personal best.
 * Returns the current best and whether this run set a new one.
 */
export function saveResult(
  game: string,
  value: number,
  higherIsBetter: boolean
): { best: number; isNewBest: boolean } {
  const history = getHistory(game);
  history.push({ v: value, t: Date.now() });
  while (history.length > HISTORY_LIMIT) history.shift();
  write(`trh:${game}:history`, history);

  const prev = getBest(game);
  const isNewBest = prev === null || (higherIsBetter ? value > prev : value < prev);
  const best = isNewBest ? value : (prev as number);
  if (isNewBest) write(`trh:${game}:best`, best);
  return { best, isNewBest };
}
