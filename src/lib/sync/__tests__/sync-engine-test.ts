import { ApiError } from '@/lib/api/client';
import { runSync, type SyncEngineDeps } from '@/lib/sync/sync-engine';
import type { LocationPoint, Visit } from '@/lib/types';

function points(count: number): LocationPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    ts: 1_700_000_000_000 + index,
    lat: 30.6,
    lon: -96.3,
    accuracy: 10,
    altitude: null,
    speed: null,
    source: 'device',
    importId: null,
  }));
}

function depsFor(
  allPoints: LocationPoint[],
  upload: SyncEngineDeps['api']['upload'],
  signOut = jest.fn(async () => {}),
  fetchVisits: SyncEngineDeps['api']['fetchVisits'] = jest.fn(async () => []),
) {
  let cursor = 0;
  let visitsCursor = 0;
  let localVisits: Visit[] = [];
  const deps: SyncEngineDeps = {
    store: {
      async getPointsAfterId(afterId, limit) {
        return allPoints.filter((point) => (point.id ?? 0) > afterId).slice(0, limit);
      },
      async replaceVisitsFrom(from, visits) {
        localVisits = [...localVisits.filter((visit) => visit.startTs < from), ...visits];
      },
    },
    api: { upload, fetchVisits, signOut },
    getCursor: () => cursor,
    setCursor: (pointId) => {
      cursor = pointId;
    },
    getVisitsCursor: () => visitsCursor,
    setVisitsCursor: (startTs) => {
      visitsCursor = startTs;
    },
    now: () => 123,
  };
  return {
    deps,
    signOut,
    getCursor: () => cursor,
    getVisitsCursor: () => visitsCursor,
    getLocalVisits: () => localVisits,
  };
}

const resolvedVisit = (startTs = 10): Visit => ({
  id: 7,
  startTs,
  endTs: startTs + 60_000,
  lat: 30.616,
  lon: -96.3393,
  radius: 20,
  pointCount: 8,
  label: null,
  placeId: 3,
  placeName: 'Evans Library',
  placeCategory: 'library',
  placeConfidence: 0.91,
});

describe('runSync', () => {
  test('uploads every point in batches of 1000', async () => {
    const sizes: number[] = [];
    const fixture = depsFor(points(2505), async (batch) => {
      sizes.push(batch.length);
      return { received: batch.length, inserted: batch.length, duplicates: 0 };
    });

    await expect(runSync(fixture.deps)).resolves.toEqual({
      uploaded: 2505,
      duplicates: 0,
      batches: 3,
      pulledVisits: 0,
      done: true,
    });
    expect(sizes).toEqual([1000, 1000, 505]);
    expect(fixture.getCursor()).toBe(2505);
  });

  test('resumes after batch three fails without gaps or duplicate new points', async () => {
    const all = points(4500);
    const successfulIds: number[] = [];
    let calls = 0;
    const fixture = depsFor(all, async (batch) => {
      calls += 1;
      if (calls === 3) throw new ApiError('temporarily unavailable', 503, false);
      successfulIds.push(...batch.map((point) => point.id as number));
      return { received: batch.length, inserted: batch.length, duplicates: 0 };
    });

    const first = await runSync(fixture.deps);
    expect(first.done).toBe(false);
    expect(first.batches).toBe(2);
    expect(first.error?.retryable).toBe(true);
    expect(fixture.getCursor()).toBe(2000);

    calls = 0;
    fixture.deps.api.upload = async (batch) => {
      successfulIds.push(...batch.map((point) => point.id as number));
      return { received: batch.length, inserted: batch.length, duplicates: 0 };
    };
    const second = await runSync(fixture.deps);
    expect(second.done).toBe(true);
    expect(fixture.getCursor()).toBe(4500);
    expect(successfulIds).toHaveLength(4500);
    expect(new Set(successfulIds).size).toBe(4500);
  });

  test('a 401 signs out and stops without advancing the cursor', async () => {
    const fixture = depsFor(points(10), async () => {
      throw new ApiError('expired', 401, false);
    });
    const result = await runSync(fixture.deps);
    expect(result.done).toBe(false);
    expect(result.error?.retryable).toBe(false);
    expect(fixture.signOut).toHaveBeenCalledTimes(1);
    expect(fixture.getCursor()).toBe(0);
  });

  test.each([
    [new ApiError('bad request', 400, false), false],
    [new ApiError('server error', 500, false), true],
    [new ApiError('offline', null, true), true],
  ])('classifies retryability for %s', async (error, retryable) => {
    const fixture = depsFor(points(1), async () => {
      throw error;
    });
    const result = await runSync(fixture.deps);
    expect(result.error).toMatchObject({ retryable, isNetworkError: error.isNetworkError });
  });

  test('pulls resolved visits and advances the visit cursor after replacement', async () => {
    const visit = resolvedVisit(500);
    const fetchVisits = jest.fn(async () => [visit]);
    const fixture = depsFor([], async () => ({ received: 0, inserted: 0, duplicates: 0 }), undefined, fetchVisits);

    const result = await runSync(fixture.deps);

    expect(fetchVisits).toHaveBeenCalledWith({ from: 0, limit: 5000 });
    expect(fixture.getLocalVisits()).toEqual([visit]);
    expect(fixture.getVisitsCursor()).toBe(501);
    expect(result).toMatchObject({ pulledVisits: 1, done: true });
  });

  test('a failed pull keeps a successful upload checkpoint and does not advance the visit cursor', async () => {
    const fixture = depsFor(
      points(10),
      async (batch) => ({ received: batch.length, inserted: batch.length, duplicates: 0 }),
      undefined,
      async () => {
        throw new ApiError('visit service unavailable', 503, false);
      },
    );

    const result = await runSync(fixture.deps);

    expect(result).toMatchObject({ uploaded: 10, batches: 1, pulledVisits: 0, done: false });
    expect(fixture.getCursor()).toBe(10);
    expect(fixture.getVisitsCursor()).toBe(0);
    expect(fixture.getLocalVisits()).toEqual([]);
  });
});
