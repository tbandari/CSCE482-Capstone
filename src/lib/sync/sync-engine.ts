import { ApiError } from '@/lib/api/client';
import type { IngestResponse } from '@/lib/api/locations';
import type { FetchVisitsOptions } from '@/lib/api/visits';
import type { Store } from '@/lib/db/store-types';
import type { LocationPoint, Visit } from '@/lib/types';

export const SYNC_BATCH_SIZE = 1000;
export const VISIT_PULL_LIMIT = 5000;

export interface SyncFailure {
  message: string;
  status: number | null;
  isNetworkError: boolean;
  retryable: boolean;
}

export interface SyncResult {
  uploaded: number;
  duplicates: number;
  batches: number;
  pulledVisits: number;
  done: boolean;
  error?: SyncFailure;
}

export interface SyncEngineDeps {
  store: Pick<Store, 'getPointsAfterId' | 'replaceVisitsFrom'>;
  api: {
    upload(points: readonly LocationPoint[]): Promise<IngestResponse>;
    fetchVisits(options: FetchVisitsOptions): Promise<Visit[]>;
    signOut(): Promise<void>;
  };
  getCursor(): number;
  setCursor(pointId: number, syncedAt: number): void;
  getVisitsCursor(): number;
  setVisitsCursor(startTs: number): void;
  now(): number;
}

export function classifySyncError(error: unknown): SyncFailure {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      status: error.status,
      isNetworkError: error.isNetworkError,
      retryable: error.isNetworkError || (error.status != null && error.status >= 500),
    };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    status: null,
    isNetworkError: true,
    retryable: true,
  };
}

/** Uploads the local outbox in stable id order and checkpoints only acknowledged batches. */
export async function runSync(deps: SyncEngineDeps): Promise<SyncResult> {
  let cursor = deps.getCursor();
  let uploaded = 0;
  let duplicates = 0;
  let batches = 0;

  while (true) {
    const points = await deps.store.getPointsAfterId(cursor, SYNC_BATCH_SIZE);
    if (points.length === 0) {
      deps.setCursor(cursor, deps.now());
      break;
    }

    try {
      const response = await deps.api.upload(points);
      const lastId = points[points.length - 1].id;
      if (lastId == null) throw new Error('Cannot sync a point without a local id.');
      cursor = lastId;
      deps.setCursor(cursor, deps.now());
      uploaded += response.inserted;
      duplicates += response.duplicates;
      batches += 1;
    } catch (error) {
      const failure = classifySyncError(error);
      if (failure.status === 401) await deps.api.signOut();
      return { uploaded, duplicates, batches, pulledVisits: 0, done: false, error: failure };
    }
  }

  const visitsCursor = deps.getVisitsCursor();
  try {
    const visits = await deps.api.fetchVisits({ from: visitsCursor, limit: VISIT_PULL_LIMIT });
    await deps.store.replaceVisitsFrom(visitsCursor, visits);
    const nextVisitsCursor = visits.reduce(
      (next, visit) => Math.max(next, visit.startTs + 1),
      visitsCursor,
    );
    deps.setVisitsCursor(nextVisitsCursor);
    return { uploaded, duplicates, batches, pulledVisits: visits.length, done: true };
  } catch (error) {
    const failure = classifySyncError(error);
    if (failure.status === 401) await deps.api.signOut();
    return { uploaded, duplicates, batches, pulledVisits: 0, done: false, error: failure };
  }
}
