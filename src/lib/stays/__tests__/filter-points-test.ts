import { filterPoints } from '@/lib/stays/filter-points';
import type { LocationPoint } from '@/lib/types';

const HOME = { lat: 30.6079, lon: -96.3217 };
const FAR = { lat: 30.6512, lon: -96.3217 }; // ~4.8 km north of HOME

function point(ts: number, loc: { lat: number; lon: number }, extra: Partial<LocationPoint> = {}): LocationPoint {
  return {
    ts,
    lat: loc.lat,
    lon: loc.lon,
    accuracy: 15,
    altitude: null,
    speed: null,
    source: 'device',
    importId: null,
    ...extra,
  };
}

const SECOND = 1000;

describe('filterPoints', () => {
  test('sorts by time and keeps clean points', () => {
    const { kept, dropped } = filterPoints([point(2000, HOME), point(1000, HOME)]);
    expect(kept.map((p) => p.ts)).toEqual([1000, 2000]);
    expect(dropped).toEqual({ invalid: 0, inaccurate: 0, duplicate: 0, spike: 0 });
  });

  test('drops points with poor reported accuracy', () => {
    const { kept, dropped } = filterPoints([
      point(0, HOME, { accuracy: 250 }),
      point(60 * SECOND, HOME, { accuracy: 20 }),
      point(120 * SECOND, HOME, { accuracy: null }),
    ]);
    expect(kept).toHaveLength(2);
    expect(dropped.inaccurate).toBe(1);
  });

  test('drops invalid coordinates and null-island fixes', () => {
    const { kept, dropped } = filterPoints([
      point(0, { lat: 999, lon: 0 }),
      point(1, { lat: 0, lon: 0 }),
      point(2, HOME),
    ]);
    expect(kept).toHaveLength(1);
    expect(dropped.invalid).toBe(2);
  });

  test('drops exact timestamp duplicates', () => {
    const { kept, dropped } = filterPoints([point(5, HOME), point(5, HOME), point(6, HOME)]);
    expect(kept).toHaveLength(2);
    expect(dropped.duplicate).toBe(1);
  });

  test('drops an out-and-back GPS spike', () => {
    const { kept, dropped } = filterPoints([
      point(0, HOME),
      point(60 * SECOND, HOME),
      point(120 * SECOND, FAR), // 4.8 km in 60 s = 80 m/s, and straight back
      point(180 * SECOND, HOME),
    ]);
    expect(kept).toHaveLength(3);
    expect(kept.every((p) => p.lat === HOME.lat)).toBe(true);
    expect(dropped.spike).toBe(1);
  });

  test('keeps a fast but real relocation', () => {
    const { kept, dropped } = filterPoints([
      point(0, HOME),
      point(60 * SECOND, FAR),
      point(120 * SECOND, FAR),
      point(180 * SECOND, FAR),
    ]);
    expect(kept).toHaveLength(4);
    expect(dropped.spike).toBe(0);
  });
});
