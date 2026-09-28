import type { DataStats, ImportRecord, LocationPoint, Visit } from '@/lib/types';

export interface RangeQuery {
  /** Inclusive lower bound on timestamp. */
  from?: number;
  /** Inclusive upper bound on timestamp. */
  to?: number;
  limit?: number;
}

/**
 * Local persistence for the device. The native implementation is SQLite
 * (`store.ts`); the web implementation (`store.web.ts`) keeps the same contract
 * in memory backed by localStorage so the app stays demoable in a browser.
 */
export interface Store {
  /** Inserts points, ignoring exact (ts, lat, lon) duplicates. Resolves with the number actually added. */
  insertPoints(points: readonly LocationPoint[]): Promise<number>;
  /** Points in ascending time order. With `limit`, the most recent ones. */
  getPoints(query?: RangeQuery): Promise<LocationPoint[]>;
  /** Unsynced outbox page, ordered by the stable local id rather than timestamp. */
  getPointsAfterId(afterId: number, limit: number): Promise<LocationPoint[]>;
  getMaxPointId(): Promise<number>;
  getPointCount(): Promise<number>;

  /** Replaces every stored visit. Visits are derived data, so this is always safe. */
  replaceVisits(visits: readonly Visit[]): Promise<void>;
  /** Replaces visits at or after a timestamp while preserving older local rows. */
  replaceVisitsFrom(from: number, visits: readonly Visit[]): Promise<void>;
  /** Visits ordered newest first. */
  getVisits(query?: RangeQuery): Promise<Visit[]>;
  getVisit(id: number): Promise<Visit | null>;

  recordImport(record: ImportRecord): Promise<void>;
  listImports(): Promise<ImportRecord[]>;
  /** Deletes the import record and every point it produced. */
  deleteImport(id: string): Promise<void>;

  getStats(): Promise<DataStats>;
  /** Hard delete of everything. */
  clearAll(): Promise<void>;
}
