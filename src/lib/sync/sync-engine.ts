import { ApiError } from '@/lib/api/client';
import type { IngestResponse } from '@/lib/api/locations';
import type { Store } from '@/lib/db/store-types';
import type { LocationPoint } from '@/lib/types';

export const SYNC_BATCH_SIZE = 1000;

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
  done: boolean;
  error?: SyncFailure;
}

export interface SyncEngineDeps {
  store: Pick<Store, 'getPointsAfterId'>;
  api: {
    upload(points: readonly LocationPoint[]): Promise<IngestResponse>;
    signOut(): Promise<void>;
  };
  getCursor(): number;
  setCursor(pointId: number, syncedAt: number): void;
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
      return { uploaded, duplicates, batches, done: true };
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
      return { uploaded, duplicates, batches, done: false, error: failure };
    }
  }
}
