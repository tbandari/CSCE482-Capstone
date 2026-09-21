export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_CAP_MS = 5 * 60_000;

/** Full-jitter exponential backoff: a random delay from zero through the current ceiling. */
export function nextDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  const sample = Math.min(1, Math.max(0, random()));
  return Math.floor(ceiling * sample);
}
