import {
  boundingBox,
  centroid,
  haversineMeters,
  isValidCoordinate,
  offsetMeters,
} from '@/lib/geo/distance';

describe('haversineMeters', () => {
  test('one degree of longitude at the equator is about 111.19 km', () => {
    expect(haversineMeters(0, 0, 0, 1)).toBeCloseTo(111_195, -2);
  });

  test('identical points are zero meters apart', () => {
    expect(haversineMeters(30.6079, -96.3217, 30.6079, -96.3217)).toBe(0);
  });

  test('is symmetric', () => {
    const forward = haversineMeters(30.6079, -96.3217, 30.6212, -96.3403);
    const backward = haversineMeters(30.6212, -96.3403, 30.6079, -96.3217);
    expect(forward).toBeCloseTo(backward, 6);
    // Home to Zachry in the sample data is a little over 2 km.
    expect(forward).toBeGreaterThan(2000);
    expect(forward).toBeLessThan(2500);
  });
});

describe('offsetMeters', () => {
  test('moving 100 m north lands 100 m away', () => {
    const origin = { lat: 30.6079, lon: -96.3217 };
    const moved = offsetMeters(origin, 100, 0);
    expect(haversineMeters(origin.lat, origin.lon, moved.lat, moved.lon)).toBeCloseTo(100, 0);
  });

  test('moving east accounts for latitude', () => {
    const origin = { lat: 60, lon: 10 };
    const moved = offsetMeters(origin, 0, 100);
    expect(haversineMeters(origin.lat, origin.lon, moved.lat, moved.lon)).toBeCloseTo(100, 0);
  });
});

describe('centroid and boundingBox', () => {
  test('centroid of two points is their midpoint', () => {
    expect(
      centroid([
        { lat: 10, lon: 20 },
        { lat: 12, lon: 24 },
      ]),
    ).toEqual({ lat: 11, lon: 22 });
  });

  test('centroid of nothing throws', () => {
    expect(() => centroid([])).toThrow();
  });

  test('boundingBox wraps all points', () => {
    expect(
      boundingBox([
        { lat: 1, lon: 5 },
        { lat: -2, lon: 7 },
        { lat: 0, lon: -1 },
      ]),
    ).toEqual({ minLat: -2, maxLat: 1, minLon: -1, maxLon: 7 });
    expect(boundingBox([])).toBeNull();
  });
});

describe('isValidCoordinate', () => {
  test.each([
    [30.6, -96.3, true],
    [-90, 180, true],
    [0, 0, false],
    [91, 0, false],
    [0, -181, false],
    [Number.NaN, 0, false],
  ])('(%s, %s) -> %s', (lat, lon, expected) => {
    expect(isValidCoordinate(lat, lon)).toBe(expected);
  });
});
