import { haversineMeters, isValidCoordinate } from '@/lib/geo/distance';
import type { LocationPoint } from '@/lib/types';

export interface FilterOptions {
  /** Points whose reported horizontal accuracy is worse than this are dropped. */
  maxAccuracyM: number;
  /**
   * A point is treated as a GPS spike when reaching it *and* leaving it would
   * both require moving faster than this, and the neighbours on either side are
   * closer to each other than to it. 70 m/s is 252 km/h: above any road speed,
   * so real relocations (including flights, which move away and stay away) are kept.
   */
  maxSpeedMps: number;
}

export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  maxAccuracyM: 100,
  maxSpeedMps: 70,
};

export interface FilterReport {
  invalid: number;
  inaccurate: number;
  duplicate: number;
  spike: number;
}

export interface FilterResult {
  kept: LocationPoint[];
  dropped: FilterReport;
}

function speedBetween(a: LocationPoint, b: LocationPoint): number {
  const dt = (b.ts - a.ts) / 1000;
  if (dt <= 0) return Number.POSITIVE_INFINITY;
  return haversineMeters(a.lat, a.lon, b.lat, b.lon) / dt;
}

/**
 * Cleans a raw trace before stay detection: sorts by time, drops invalid or
 * low-accuracy fixes, exact duplicates, and out-and-back GPS spikes.
 */
export function filterPoints(
  points: readonly LocationPoint[],
  options: FilterOptions = DEFAULT_FILTER_OPTIONS,
): FilterResult {
  const dropped: FilterReport = { invalid: 0, inaccurate: 0, duplicate: 0, spike: 0 };

  const sorted = [...points].sort((a, b) => a.ts - b.ts);

  // Pass 1: validity, accuracy and duplicates.
  const clean: LocationPoint[] = [];
  let previous: LocationPoint | null = null;
  for (const p of sorted) {
    if (!Number.isFinite(p.ts) || !isValidCoordinate(p.lat, p.lon)) {
      dropped.invalid += 1;
      continue;
    }
    if (p.accuracy != null && p.accuracy > options.maxAccuracyM) {
      dropped.inaccurate += 1;
      continue;
    }
    if (previous && p.ts === previous.ts) {
      dropped.duplicate += 1;
      continue;
    }
    clean.push(p);
    previous = p;
  }

  // Pass 2: spikes. A spike is an out-and-back excursion where at least one leg
  // needs an implausible speed and the neighbours on either side are much closer
  // to each other than to the excursion point. Only one leg is required because
  // with sparse sampling (a fix every few minutes) the return leg always looks slow.
  const kept: LocationPoint[] = [];
  for (let i = 0; i < clean.length; i += 1) {
    const current = clean[i];
    const before = kept[kept.length - 1];
    const after = clean[i + 1];
    if (before && after) {
      const inSpeed = speedBetween(before, current);
      const outSpeed = speedBetween(current, after);
      if (inSpeed > options.maxSpeedMps || outSpeed > options.maxSpeedMps) {
        const neighbourGap = haversineMeters(before.lat, before.lon, after.lat, after.lon);
        const excursion = haversineMeters(before.lat, before.lon, current.lat, current.lon);
        if (neighbourGap < excursion * 0.5) {
          dropped.spike += 1;
          continue;
        }
      }
    }
    kept.push(current);
  }

  return { kept, dropped };
}
