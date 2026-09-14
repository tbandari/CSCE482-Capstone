import { generateSampleWeek, lastCompleteWeekStart, SAMPLE_PLACES } from '@/lib/demo/sample-week';
import { isValidCoordinate } from '@/lib/geo/distance';

const WEEK_START = Date.UTC(2026, 8, 7, 5); // Mon 2026-09-07 00:00 CDT

describe('generateSampleWeek', () => {
  test('is deterministic for a given seed', () => {
    const a = generateSampleWeek(WEEK_START, { seed: 7 });
    const b = generateSampleWeek(WEEK_START, { seed: 7 });
    expect(a.points).toEqual(b.points);
    expect(a.stays).toEqual(b.stays);
    const c = generateSampleWeek(WEEK_START, { seed: 8 });
    expect(c.points[10]).not.toEqual(a.points[10]);
  });

  test('produces a chronological, valid, week-long trace', () => {
    const { points, stays } = generateSampleWeek(WEEK_START);
    expect(points.length).toBeGreaterThan(2000);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].ts).toBeGreaterThanOrEqual(points[i - 1].ts);
    }
    expect(points.every((p) => isValidCoordinate(p.lat, p.lon))).toBe(true);
    expect(points.every((p) => p.accuracy != null && p.accuracy <= 35)).toBe(true);
    expect(points[0].ts).toBeGreaterThanOrEqual(WEEK_START - 60_000);
    expect(points[points.length - 1].ts).toBeLessThanOrEqual(WEEK_START + 7 * 24 * 3600 * 1000 + 60_000);

    expect(stays[0].name).toBe(SAMPLE_PLACES.home.name);
    expect(stays.length).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < stays.length; i += 1) {
      expect(stays[i].startTs).toBeGreaterThan(stays[i - 1].endTs);
    }
  });
});

describe('lastCompleteWeekStart', () => {
  test('returns a Monday at least seven days ago', () => {
    const now = new Date(2026, 8, 14, 15, 30); // Monday afternoon
    const start = new Date(lastCompleteWeekStart(now));
    expect(start.getDay()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(now.getTime() - start.getTime()).toBeGreaterThanOrEqual(7 * 24 * 3600 * 1000);
    expect(now.getTime() - start.getTime()).toBeLessThan(14 * 24 * 3600 * 1000);
  });
});
