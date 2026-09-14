import { centroid, haversineMeters } from '@/lib/geo/distance';
import type { LocationPoint, Visit } from '@/lib/types';

export interface StayOptions {
  /** A point belongs to the current stay while it is within this distance (m) of the stay's anchor. */
  distanceThresholdM: number;
  /** A cluster must span at least this long (ms) to count as a stay. */
  minDurationMs: number;
  /** Consecutive stays closer than this (m) and separated by less than `mergeGapMs` are merged. */
  mergeDistanceM: number;
  mergeGapMs: number;
}

/**
 * Defaults tuned for phone-life granularity rather than the 200 m / 30 min used
 * in the GeoLife papers: a coffee stop should count, a red light should not.
 * The merge gap is generous because a single bad fix costs a whole sampling
 * interval (five minutes or more when the OS throttles background updates).
 */
export const DEFAULT_STAY_OPTIONS: StayOptions = {
  distanceThresholdM: 100,
  minDurationMs: 10 * 60 * 1000,
  mergeDistanceM: 75,
  mergeGapMs: 15 * 60 * 1000,
};

function buildVisit(cluster: readonly LocationPoint[]): Visit {
  const center = centroid(cluster);
  let radius = 0;
  for (const p of cluster) {
    radius = Math.max(radius, haversineMeters(center.lat, center.lon, p.lat, p.lon));
  }
  return {
    startTs: cluster[0].ts,
    endTs: cluster[cluster.length - 1].ts,
    lat: center.lat,
    lon: center.lon,
    radius: Math.round(radius),
    pointCount: cluster.length,
    label: null,
  };
}

function mergeVisits(a: Visit, b: Visit): Visit {
  const total = a.pointCount + b.pointCount;
  const lat = (a.lat * a.pointCount + b.lat * b.pointCount) / total;
  const lon = (a.lon * a.pointCount + b.lon * b.pointCount) / total;
  const separation = haversineMeters(a.lat, a.lon, b.lat, b.lon);
  return {
    startTs: a.startTs,
    endTs: b.endTs,
    lat,
    lon,
    radius: Math.round(Math.max(a.radius, b.radius) + separation / 2),
    pointCount: total,
    label: a.label ?? b.label,
  };
}

/**
 * Stay-point detection (Li et al., 2008; Zheng et al., GeoLife): walk the trace,
 * grow a cluster while points stay within `distanceThresholdM` of the anchor,
 * and emit a visit when the cluster's time span reaches `minDurationMs`.
 *
 * Input should already be cleaned with `filterPoints`. Points are sorted here
 * defensively so callers never have to think about order.
 */
export function detectStays(
  points: readonly LocationPoint[],
  options: StayOptions = DEFAULT_STAY_OPTIONS,
): Visit[] {
  const trace = [...points].sort((a, b) => a.ts - b.ts);
  const stays: Visit[] = [];

  let i = 0;
  while (i < trace.length) {
    const anchor = trace[i];
    let j = i + 1;
    while (
      j < trace.length &&
      haversineMeters(anchor.lat, anchor.lon, trace[j].lat, trace[j].lon) <=
        options.distanceThresholdM
    ) {
      j += 1;
    }
    // trace[i .. j-1] are within the threshold of the anchor.
    const span = trace[j - 1].ts - anchor.ts;
    if (span >= options.minDurationMs) {
      stays.push(buildVisit(trace.slice(i, j)));
      i = j;
    } else {
      i += 1;
    }
  }

  // Merge stays that GPS jitter split into pieces at the same place.
  const merged: Visit[] = [];
  for (const stay of stays) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      stay.startTs - previous.endTs <= options.mergeGapMs &&
      haversineMeters(previous.lat, previous.lon, stay.lat, stay.lon) <= options.mergeDistanceM
    ) {
      merged[merged.length - 1] = mergeVisits(previous, stay);
    } else {
      merged.push(stay);
    }
  }
  return merged;
}
