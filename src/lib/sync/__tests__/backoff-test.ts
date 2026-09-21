import { BACKOFF_CAP_MS, nextDelay } from '@/lib/sync/backoff';

describe('nextDelay', () => {
  test('grows exponentially with full jitter', () => {
    expect(nextDelay(0, () => 0.5)).toBe(1000);
    expect(nextDelay(1, () => 0.5)).toBe(2000);
    expect(nextDelay(2, () => 0.5)).toBe(4000);
    expect(nextDelay(2, () => 0)).toBe(0);
    expect(nextDelay(2, () => 1)).toBe(8000);
  });

  test('caps the maximum delay at five minutes', () => {
    expect(nextDelay(99, () => 1)).toBe(BACKOFF_CAP_MS);
  });
});
