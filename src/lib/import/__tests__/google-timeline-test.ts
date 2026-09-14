import {
  detectTimelineFormat,
  parseGoogleTimeline,
  parseGoogleTimelineText,
  parseLatLng,
  parseTimestamp,
} from '@/lib/import/google-timeline';

const androidFixture = require('./fixtures/android-timeline.json');
const iosFixture = require('./fixtures/ios-location-history.json');
const legacyFixture = require('./fixtures/legacy-records.json');

const CDT = (iso: string) => Date.parse(iso);

describe('parseLatLng', () => {
  test.each([
    ['30.6187°, -96.3365°', { lat: 30.6187, lon: -96.3365 }],
    ['geo:30.6187,-96.3365', { lat: 30.6187, lon: -96.3365 }],
    ['30.6187,-96.3365', { lat: 30.6187, lon: -96.3365 }],
    [{ latLng: '30.6187°, -96.3365°' }, { lat: 30.6187, lon: -96.3365 }],
    [{ placeLocation: { latLng: '1°, 2°' } }, { lat: 1, lon: 2 }],
    [{ latitudeE7: 306187000, longitudeE7: -963365000 }, { lat: 30.6187, lon: -96.3365 }],
    [{ lat: 30.6, lng: -96.3 }, { lat: 30.6, lon: -96.3 }],
    [{ latitude: '30.6', longitude: '-96.3' }, { lat: 30.6, lon: -96.3 }],
  ])('parses %j', (input, expected) => {
    expect(parseLatLng(input)).toEqual(expected);
  });

  test.each([['garbage'], ['0°, 0°'], ['95°, 10°'], [null], [42], [{}], [{ latLng: 'x,y' }]])(
    'rejects %j',
    (input) => {
      expect(parseLatLng(input)).toBeNull();
    },
  );
});

describe('parseTimestamp', () => {
  test('accepts ISO strings with offsets, epoch numbers and numeric strings', () => {
    expect(parseTimestamp('2026-09-07T07:55:00.000-05:00')).toBe(Date.UTC(2026, 8, 7, 12, 55));
    expect(parseTimestamp(1709294460000)).toBe(1709294460000);
    expect(parseTimestamp('1709294460000')).toBe(1709294460000);
    expect(parseTimestamp('yesterday')).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
  });
});

describe('detectTimelineFormat', () => {
  test('recognises all three shapes and rejects the rest', () => {
    expect(detectTimelineFormat(androidFixture)).toBe('android-semantic');
    expect(detectTimelineFormat(iosFixture)).toBe('ios-semantic');
    expect(detectTimelineFormat(legacyFixture)).toBe('legacy-records');
    expect(detectTimelineFormat({ hello: 'world' })).toBeNull();
    expect(detectTimelineFormat([{ hello: 'world' }])).toBeNull();
    expect(detectTimelineFormat('nope')).toBeNull();
  });
});

describe('parseGoogleTimeline: Android on-device export', () => {
  const result = parseGoogleTimeline(androidFixture, 'imp-android');

  test('reports the format and per-segment statistics', () => {
    expect(result.format).toBe('android-semantic');
    expect(result.stats).toEqual({
      segments: 4,
      visits: 1,
      activities: 1,
      pathPoints: 4,
      rawSignals: 1,
      skipped: 1,
    });
  });

  test('expands the visit into samples every 10 minutes and de-duplicates joins', () => {
    // 4 path points + 21 new visit samples (the first one coincides with the
    // last path point) + 1 activity end (its start coincides with the last
    // visit sample) + 1 raw signal.
    expect(result.points).toHaveLength(27);
    const visitSamples = result.points.filter(
      (p) => p.lat === 30.6212 && p.lon === -96.3403 && p.ts >= CDT('2026-09-07T08:20:00-05:00'),
    );
    expect(visitSamples).toHaveLength(22);
    expect(visitSamples[0].ts).toBe(CDT('2026-09-07T08:20:00-05:00'));
    expect(visitSamples[visitSamples.length - 1].ts).toBe(CDT('2026-09-07T11:50:00-05:00'));
  });

  test('is sorted, tagged with the import id and carries raw-signal metadata', () => {
    for (let i = 1; i < result.points.length; i += 1) {
      expect(result.points[i].ts).toBeGreaterThanOrEqual(result.points[i - 1].ts);
    }
    expect(result.points.every((p) => p.importId === 'imp-android' && p.source === 'import')).toBe(true);
    const raw = result.points[0];
    expect(raw.ts).toBe(CDT('2026-09-07T07:50:00-05:00'));
    expect(raw.accuracy).toBe(18);
    expect(raw.altitude).toBe(101.2);
    expect(raw.speed).toBe(0);
  });
});

describe('parseGoogleTimeline: iOS on-device export', () => {
  const result = parseGoogleTimeline(iosFixture, 'imp-ios');

  test('resolves minute offsets against the segment start', () => {
    expect(result.format).toBe('ios-semantic');
    const path = result.points.slice(0, 3);
    expect(path.map((p) => p.ts)).toEqual([
      CDT('2026-09-07T07:55:00-05:00'),
      CDT('2026-09-07T08:10:00-05:00'),
      CDT('2026-09-07T08:20:00-05:00'),
    ]);
  });

  test('handles geo: URIs, string numbers and a one-hour visit', () => {
    expect(result.stats).toEqual({
      segments: 3,
      visits: 1,
      activities: 1,
      pathPoints: 3,
      rawSignals: 0,
      skipped: 0,
    });
    expect(result.points).toHaveLength(10);
    expect(result.points[result.points.length - 1]).toMatchObject({
      lat: 30.616,
      lon: -96.3393,
      ts: CDT('2026-09-07T09:35:00-05:00'),
    });
  });
});

describe('parseGoogleTimeline: legacy Records.json', () => {
  test('reads E7 coordinates and both timestamp spellings', () => {
    const result = parseGoogleTimeline(legacyFixture, 'imp-legacy');
    expect(result.format).toBe('legacy-records');
    expect(result.points).toHaveLength(2);
    expect(result.stats.skipped).toBe(2);
    expect(result.points[0]).toMatchObject({
      lat: 30.6079,
      lon: -96.3217,
      ts: Date.UTC(2024, 2, 1, 12),
      accuracy: 20,
    });
    expect(result.points[1]).toMatchObject({
      lat: 30.60791,
      lon: -96.32171,
      ts: 1709294460000,
      accuracy: 25,
      speed: 1,
      altitude: 100,
    });
  });
});

describe('parseGoogleTimelineText', () => {
  test('gives friendly errors for invalid JSON and unknown files', () => {
    expect(() => parseGoogleTimelineText('{not json', 'x')).toThrow(/not valid JSON/);
    expect(() => parseGoogleTimelineText('{"foo": 1}', 'x')).toThrow(/not a Google Timeline export/);
  });

  test('round-trips a fixture through text', () => {
    const result = parseGoogleTimelineText(JSON.stringify(iosFixture), 'x');
    expect(result.points).toHaveLength(10);
  });
});
