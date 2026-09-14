import { haversineMeters, offsetMeters, type LatLon } from '@/lib/geo/distance';
import { DEFAULT_STAY_OPTIONS, detectStays } from '@/lib/stays/detect-stays';
import type { LocationPoint } from '@/lib/types';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const HOME: LatLon = { lat: 30.6079, lon: -96.3217 };
const COFFEE: LatLon = { lat: 30.6222, lon: -96.3465 };
const WORK: LatLon = { lat: 30.6212, lon: -96.3403 };

function point(ts: number, loc: LatLon): LocationPoint {
  return { ts, lat: loc.lat, lon: loc.lon, accuracy: 15, altitude: null, speed: null, source: 'device', importId: null };
}

/** Stationary samples with deterministic +/- jitter of `jitterM` meters. */
function stationary(loc: LatLon, startTs: number, endTs: number, intervalMin = 5, jitterM = 10): LocationPoint[] {
  const out: LocationPoint[] = [];
  let k = 0;
  for (let ts = startTs; ts <= endTs; ts += intervalMin * MINUTE, k += 1) {
    const sign = k % 2 === 0 ? 1 : -1;
    out.push(point(ts, offsetMeters(loc, sign * jitterM, -sign * jitterM)));
  }
  return out;
}

function travel(from: LatLon, to: LatLon, startTs: number, endTs: number, intervalMin = 1): LocationPoint[] {
  const out: LocationPoint[] = [];
  const steps = Math.floor((endTs - startTs) / (intervalMin * MINUTE));
  for (let k = 1; k < steps; k += 1) {
    const f = k / steps;
    out.push(point(startTs + f * (endTs - startTs), { lat: from.lat + (to.lat - from.lat) * f, lon: from.lon + (to.lon - from.lon) * f }));
  }
  return out;
}

describe('detectStays', () => {
  test('returns nothing for an empty trace', () => {
    expect(detectStays([])).toEqual([]);
  });

  test('finds three stays in a home -> coffee -> work morning', () => {
    const t0 = Date.UTC(2026, 8, 7, 12);
    const trace = [
      ...stationary(HOME, t0, t0 + 2 * HOUR),
      ...travel(HOME, COFFEE, t0 + 2 * HOUR, t0 + 2 * HOUR + 20 * MINUTE),
      ...stationary(COFFEE, t0 + 2 * HOUR + 20 * MINUTE, t0 + 2 * HOUR + 50 * MINUTE),
      ...travel(COFFEE, WORK, t0 + 2 * HOUR + 50 * MINUTE, t0 + 3 * HOUR + 10 * MINUTE),
      ...stationary(WORK, t0 + 3 * HOUR + 10 * MINUTE, t0 + 6 * HOUR),
    ];

    const visits = detectStays(trace);
    expect(visits).toHaveLength(3);

    const [home, coffee, work] = visits;
    expect(haversineMeters(home.lat, home.lon, HOME.lat, HOME.lon)).toBeLessThan(20);
    expect(haversineMeters(coffee.lat, coffee.lon, COFFEE.lat, COFFEE.lon)).toBeLessThan(20);
    expect(haversineMeters(work.lat, work.lon, WORK.lat, WORK.lon)).toBeLessThan(20);

    expect(home.endTs - home.startTs).toBeGreaterThanOrEqual(2 * HOUR - 5 * MINUTE);
    expect(coffee.endTs - coffee.startTs).toBeGreaterThanOrEqual(30 * MINUTE - 5 * MINUTE);
    expect(work.startTs).toBeGreaterThan(coffee.endTs);
    expect(home.radius).toBeLessThan(DEFAULT_STAY_OPTIONS.distanceThresholdM);
    expect(visits.reduce((n, v) => n + v.pointCount, 0)).toBeLessThanOrEqual(trace.length);
  });

  test('ignores a stop shorter than the minimum duration', () => {
    const t0 = Date.UTC(2026, 8, 7, 12);
    const trace = [
      ...stationary(HOME, t0, t0 + HOUR),
      ...travel(HOME, COFFEE, t0 + HOUR, t0 + HOUR + 15 * MINUTE),
      ...stationary(COFFEE, t0 + HOUR + 15 * MINUTE, t0 + HOUR + 20 * MINUTE, 1),
      ...travel(COFFEE, WORK, t0 + HOUR + 20 * MINUTE, t0 + HOUR + 35 * MINUTE),
      ...stationary(WORK, t0 + HOUR + 35 * MINUTE, t0 + 3 * HOUR),
    ];
    const visits = detectStays(trace);
    expect(visits).toHaveLength(2);
    expect(visits.some((v) => haversineMeters(v.lat, v.lon, COFFEE.lat, COFFEE.lon) < 100)).toBe(false);
  });

  test('handles sparse data: two fixes eight hours apart at one place is a stay', () => {
    const t0 = Date.UTC(2026, 8, 7, 3);
    const visits = detectStays([point(t0, HOME), point(t0 + 8 * HOUR, offsetMeters(HOME, 20, 0))]);
    expect(visits).toHaveLength(1);
    expect(visits[0].endTs - visits[0].startTs).toBe(8 * HOUR);
    expect(visits[0].pointCount).toBe(2);
  });

  test('merges a stay that a single GPS jump split in two', () => {
    const t0 = Date.UTC(2026, 8, 7, 12);
    const first = stationary(HOME, t0, t0 + 30 * MINUTE);
    const jump = point(t0 + 31 * MINUTE, offsetMeters(HOME, 150, 0));
    const second = stationary(HOME, t0 + 32 * MINUTE, t0 + 62 * MINUTE);
    const visits = detectStays([...first, jump, ...second]);
    expect(visits).toHaveLength(1);
    expect(visits[0].startTs).toBe(t0);
    expect(visits[0].endTs).toBe(t0 + 62 * MINUTE);
    expect(visits[0].pointCount).toBe(first.length + second.length);
  });

  test('emits a stay that is still in progress at the end of the trace', () => {
    const t0 = Date.UTC(2026, 8, 7, 12);
    const trace = [
      ...travel(COFFEE, HOME, t0, t0 + 15 * MINUTE),
      ...stationary(HOME, t0 + 15 * MINUTE, t0 + 45 * MINUTE),
    ];
    const visits = detectStays(trace);
    expect(visits).toHaveLength(1);
    expect(visits[0].endTs).toBe(trace[trace.length - 1].ts);
  });

  test('does not depend on input order', () => {
    const t0 = Date.UTC(2026, 8, 7, 12);
    const trace = stationary(HOME, t0, t0 + HOUR);
    const shuffled = [...trace].reverse();
    expect(detectStays(shuffled)).toEqual(detectStays(trace));
  });
});
