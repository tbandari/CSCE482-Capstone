/**
 * Parser for the location-history exports Google produces today.
 *
 * Three shapes exist in the wild:
 *
 * 1. Android on-device export (Google Maps > Your timeline > Export):
 *    `{ semanticSegments: [...], rawSignals: [...], userLocationProfile: {...} }`
 *    with coordinates written as `"30.6187°, -96.3365°"` and absolute `time`s.
 * 2. iOS on-device export (`location-history.json`): a top-level array of
 *    segments, coordinates written as `"geo:30.6187,-96.3365"`, and timeline
 *    path points given as minute offsets from the segment start.
 * 3. Legacy Takeout `Records.json`: `{ locations: [{ latitudeE7, longitudeE7, timestamp }] }`.
 *
 * All three are reduced to plain `LocationPoint`s. Google's own `visit`
 * segments are expanded into evenly spaced points across the stay so that stay
 * detection recovers them with the same code path as live device data.
 */

import { isValidCoordinate } from '@/lib/geo/distance';
import type { LocationPoint, TimelineFormat } from '@/lib/types';

export interface ParseStats {
  segments: number;
  visits: number;
  activities: number;
  pathPoints: number;
  rawSignals: number;
  /** Segments or records that could not be interpreted. */
  skipped: number;
}

export interface ParseResult {
  format: TimelineFormat;
  points: LocationPoint[];
  stats: ParseStats;
}

/** Points synthesised inside a Google `visit` segment are spaced this far apart. */
const VISIT_SAMPLE_INTERVAL_MS = 10 * 60 * 1000;
const VISIT_MAX_SAMPLES = 300;

type LatLon = { lat: number; lon: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Accepts every coordinate spelling Google has used:
 * `"30.6°, -96.3°"`, `"geo:30.6,-96.3"`, `"30.6,-96.3"`, `{ latLng: "…" }`,
 * `{ latitudeE7, longitudeE7 }`, `{ lat, lng }`, `{ latitude, longitude }`.
 */
export function parseLatLng(value: unknown): LatLon | null {
  if (typeof value === 'string') {
    const cleaned = value.replace(/^geo:/i, '').replace(/°/g, '');
    const parts = cleaned.split(',').map((part) => Number(part.trim()));
    if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
    const [lat, lon] = parts;
    return isValidCoordinate(lat, lon) ? { lat, lon } : null;
  }
  if (!isRecord(value)) return null;
  if ('latLng' in value) return parseLatLng(value.latLng);
  if ('placeLocation' in value) return parseLatLng(value.placeLocation);

  const latE7 = asNumber(value.latitudeE7);
  const lonE7 = asNumber(value.longitudeE7);
  if (latE7 != null && lonE7 != null) {
    const lat = latE7 / 1e7;
    const lon = lonE7 / 1e7;
    return isValidCoordinate(lat, lon) ? { lat, lon } : null;
  }

  const lat = asNumber(value.lat ?? value.latitude);
  const lon = asNumber(value.lng ?? value.lon ?? value.longitude);
  if (lat != null && lon != null && isValidCoordinate(lat, lon)) return { lat, lon };
  return null;
}

/** ISO-8601 strings (with offsets), epoch milliseconds, or numeric strings of milliseconds. */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (/^\d+$/.test(value)) return Number(value);
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function detectTimelineFormat(json: unknown): TimelineFormat | null {
  if (Array.isArray(json)) {
    const looksSemantic = json.some(
      (entry) =>
        isRecord(entry) &&
        'startTime' in entry &&
        ('visit' in entry || 'activity' in entry || 'timelinePath' in entry),
    );
    return looksSemantic || json.length === 0 ? 'ios-semantic' : null;
  }
  if (!isRecord(json)) return null;
  if (Array.isArray(json.semanticSegments) || Array.isArray(json.rawSignals)) {
    return 'android-semantic';
  }
  if (Array.isArray(json.locations)) return 'legacy-records';
  return null;
}

class PointCollector {
  private readonly seen = new Set<string>();
  readonly points: LocationPoint[] = [];

  constructor(private readonly importId: string) {}

  add(
    ts: number | null,
    loc: LatLon | null,
    extra: Partial<Pick<LocationPoint, 'accuracy' | 'altitude' | 'speed'>> = {},
  ): boolean {
    if (ts == null || loc == null) return false;
    const key = `${ts}:${loc.lat.toFixed(6)}:${loc.lon.toFixed(6)}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.points.push({
      ts,
      lat: loc.lat,
      lon: loc.lon,
      accuracy: extra.accuracy ?? null,
      altitude: extra.altitude ?? null,
      speed: extra.speed ?? null,
      source: 'import',
      importId: this.importId,
    });
    return true;
  }
}

function addVisitSamples(
  collector: PointCollector,
  loc: LatLon | null,
  startTs: number | null,
  endTs: number | null,
): boolean {
  if (loc == null || startTs == null) return false;
  const end = endTs != null && endTs > startTs ? endTs : startTs;
  const span = end - startTs;
  const samples = Math.min(VISIT_MAX_SAMPLES, Math.max(1, Math.ceil(span / VISIT_SAMPLE_INTERVAL_MS)));
  let added = false;
  for (let k = 0; k <= samples; k += 1) {
    const ts = span === 0 ? startTs : Math.round(startTs + (span * k) / samples);
    added = collector.add(ts, loc) || added;
    if (span === 0) break;
  }
  return added;
}

function parseSemanticSegments(
  segments: unknown[],
  collector: PointCollector,
  stats: ParseStats,
): void {
  for (const segment of segments) {
    if (!isRecord(segment)) {
      stats.skipped += 1;
      continue;
    }
    stats.segments += 1;
    const startTs = parseTimestamp(segment.startTime);
    const endTs = parseTimestamp(segment.endTime);

    if (Array.isArray(segment.timelinePath)) {
      let added = 0;
      for (const entry of segment.timelinePath) {
        if (!isRecord(entry)) continue;
        const loc = parseLatLng(entry.point);
        let ts = parseTimestamp(entry.time);
        if (ts == null && startTs != null) {
          const offsetMinutes = asNumber(entry.durationMinutesOffsetFromStartTime);
          if (offsetMinutes != null) ts = startTs + offsetMinutes * 60 * 1000;
        }
        if (collector.add(ts, loc)) added += 1;
      }
      stats.pathPoints += added;
      continue;
    }

    if (isRecord(segment.visit)) {
      const topCandidate = isRecord(segment.visit.topCandidate) ? segment.visit.topCandidate : null;
      const loc = parseLatLng(topCandidate?.placeLocation ?? segment.visit.placeLocation);
      if (addVisitSamples(collector, loc, startTs, endTs)) stats.visits += 1;
      else stats.skipped += 1;
      continue;
    }

    if (isRecord(segment.activity)) {
      const startLoc = parseLatLng(segment.activity.start);
      const endLoc = parseLatLng(segment.activity.end);
      const addedStart = collector.add(startTs, startLoc);
      const addedEnd = collector.add(endTs, endLoc);
      if (addedStart || addedEnd) stats.activities += 1;
      else stats.skipped += 1;
      continue;
    }

    stats.skipped += 1;
  }
}

function parseRawSignals(signals: unknown[], collector: PointCollector, stats: ParseStats): void {
  for (const signal of signals) {
    if (!isRecord(signal) || !isRecord(signal.position)) continue;
    const position = signal.position;
    const loc = parseLatLng(position.LatLng ?? position.latLng);
    const ts = parseTimestamp(position.timestamp);
    const added = collector.add(ts, loc, {
      accuracy: asNumber(position.accuracyMeters),
      altitude: asNumber(position.altitudeMeters),
      speed: asNumber(position.speedMetersPerSecond),
    });
    if (added) stats.rawSignals += 1;
  }
}

function parseLegacyRecords(records: unknown[], collector: PointCollector, stats: ParseStats): void {
  for (const record of records) {
    if (!isRecord(record)) {
      stats.skipped += 1;
      continue;
    }
    const loc = parseLatLng(record);
    const ts = parseTimestamp(record.timestamp ?? record.timestampMs);
    const added = collector.add(ts, loc, {
      accuracy: asNumber(record.accuracy),
      altitude: asNumber(record.altitude),
      speed: asNumber(record.velocity),
    });
    if (added) stats.rawSignals += 1;
    else stats.skipped += 1;
  }
}

export function parseGoogleTimeline(json: unknown, importId: string): ParseResult {
  const format = detectTimelineFormat(json);
  if (format == null) {
    throw new Error(
      'This file is not a Google Timeline export. Expected semanticSegments, a segment array, or legacy Records.json.',
    );
  }
  const collector = new PointCollector(importId);
  const stats: ParseStats = {
    segments: 0,
    visits: 0,
    activities: 0,
    pathPoints: 0,
    rawSignals: 0,
    skipped: 0,
  };

  if (format === 'ios-semantic') {
    parseSemanticSegments(json as unknown[], collector, stats);
  } else if (format === 'android-semantic') {
    const root = json as Record<string, unknown>;
    if (Array.isArray(root.semanticSegments)) {
      parseSemanticSegments(root.semanticSegments, collector, stats);
    }
    if (Array.isArray(root.rawSignals)) {
      parseRawSignals(root.rawSignals, collector, stats);
    }
  } else {
    parseLegacyRecords((json as Record<string, unknown>).locations as unknown[], collector, stats);
  }

  const points = collector.points.sort((a, b) => a.ts - b.ts);
  return { format, points, stats };
}

export function parseGoogleTimelineText(text: string, importId: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON. Google Timeline exports are .json files.');
  }
  return parseGoogleTimeline(json, importId);
}
