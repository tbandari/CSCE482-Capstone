import { formatCount, formatDayHeading, formatDistance, formatDuration } from '@/lib/format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatDuration', () => {
  test.each([
    [0, '<1m'],
    [30_000, '<1m'],
    [5 * MINUTE, '5m'],
    [2 * HOUR + 15 * MINUTE, '2h 15m'],
    [DAY + 3 * HOUR + 7 * MINUTE, '1d 3h'],
    [-5, '—'],
  ])('%s ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatCount', () => {
  test.each([
    [0, '0'],
    [999, '999'],
    [1400, '1.4k'],
    [25_000, '25k'],
    [1_500_000, '1.5M'],
  ])('%s -> %s', (n, expected) => {
    expect(formatCount(n)).toBe(expected);
  });
});

describe('formatDistance', () => {
  test('switches to kilometers at 1000 m', () => {
    expect(formatDistance(12.4)).toBe('12 m');
    expect(formatDistance(2340)).toBe('2.3 km');
  });
});

describe('formatDayHeading', () => {
  test('uses Today and Yesterday relative to now', () => {
    const now = new Date(2026, 8, 14, 15).getTime();
    expect(formatDayHeading(now - HOUR, now)).toBe('Today');
    expect(formatDayHeading(now - DAY, now)).toBe('Yesterday');
    expect(formatDayHeading(now - 3 * DAY, now)).not.toMatch(/Today|Yesterday/);
  });
});
