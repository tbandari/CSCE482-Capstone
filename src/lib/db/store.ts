/**
 * SQLite-backed store for iOS and Android.
 *
 * Schema version is tracked with PRAGMA user_version so later sprints can add
 * migrations without wiping data. Points carry a unique (ts, lat, lon) index so
 * re-importing the same export is idempotent.
 */

import * as SQLite from 'expo-sqlite';

import { notifyDataChanged } from '@/lib/db/events';
import type { RangeQuery, Store } from '@/lib/db/store-types';
import { resetSyncState } from '@/lib/settings';
import type { DataStats, ImportRecord, LocationPoint, Visit } from '@/lib/types';

const DATABASE_NAME = 'orbit.db';
export const SCHEMA_VERSION = 2;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function migrateStore(
  db: Pick<SQLite.SQLiteDatabase, 'getFirstAsync' | 'execAsync'>,
): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  if (current < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS points (
        id INTEGER PRIMARY KEY NOT NULL,
        ts INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        accuracy REAL,
        altitude REAL,
        speed REAL,
        source TEXT NOT NULL,
        import_id TEXT
      );
      CREATE INDEX IF NOT EXISTS points_ts ON points (ts);
      CREATE INDEX IF NOT EXISTS points_import ON points (import_id);
      CREATE UNIQUE INDEX IF NOT EXISTS points_dedupe ON points (ts, lat, lon);

      CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY NOT NULL,
        start_ts INTEGER NOT NULL,
        end_ts INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        radius REAL NOT NULL,
        point_count INTEGER NOT NULL,
        label TEXT,
        place_id INTEGER,
        place_name TEXT,
        place_category TEXT,
        place_confidence REAL
      );
      CREATE INDEX IF NOT EXISTS visits_start ON visits (start_ts);

      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY NOT NULL,
        file_name TEXT NOT NULL,
        format TEXT NOT NULL,
        imported_at INTEGER NOT NULL,
        point_count INTEGER NOT NULL
      );
    `);
  } else if (current < 2) {
    await db.execAsync(`
      ALTER TABLE visits ADD COLUMN place_id INTEGER;
      ALTER TABLE visits ADD COLUMN place_name TEXT;
      ALTER TABLE visits ADD COLUMN place_category TEXT;
      ALTER TABLE visits ADD COLUMN place_confidence REAL;
    `);
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await migrateStore(db);
      return db;
    });
  }
  return databasePromise;
}

type PointRow = {
  id: number;
  ts: number;
  lat: number;
  lon: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  source: 'device' | 'import';
  import_id: string | null;
};

type VisitRow = {
  id: number;
  start_ts: number;
  end_ts: number;
  lat: number;
  lon: number;
  radius: number;
  point_count: number;
  label: string | null;
  place_id: number | null;
  place_name: string | null;
  place_category: string | null;
  place_confidence: number | null;
};

type ImportRow = {
  id: string;
  file_name: string;
  format: ImportRecord['format'];
  imported_at: number;
  point_count: number;
};

const toPoint = (row: PointRow): LocationPoint => ({
  id: row.id,
  ts: row.ts,
  lat: row.lat,
  lon: row.lon,
  accuracy: row.accuracy,
  altitude: row.altitude,
  speed: row.speed,
  source: row.source,
  importId: row.import_id,
});

const toVisit = (row: VisitRow): Visit => ({
  id: row.id,
  startTs: row.start_ts,
  endTs: row.end_ts,
  lat: row.lat,
  lon: row.lon,
  radius: row.radius,
  pointCount: row.point_count,
  label: row.label,
  placeId: row.place_id,
  placeName: row.place_name,
  placeCategory: row.place_category,
  placeConfidence: row.place_confidence,
});

const toImport = (row: ImportRow): ImportRecord => ({
  id: row.id,
  fileName: row.file_name,
  format: row.format,
  importedAt: row.imported_at,
  pointCount: row.point_count,
});

function rangeClause(query: RangeQuery, column: string): { where: string; params: number[] } {
  const clauses: string[] = [];
  const params: number[] = [];
  if (query.from != null) {
    clauses.push(`${column} >= ?`);
    params.push(query.from);
  }
  if (query.to != null) {
    clauses.push(`${column} <= ?`);
    params.push(query.to);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export const store: Store = {
  async insertPoints(points) {
    if (points.length === 0) return 0;
    const db = await getDatabase();
    let inserted = 0;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const statement = await tx.prepareAsync(
        `INSERT OR IGNORE INTO points (ts, lat, lon, accuracy, altitude, speed, source, import_id)
         VALUES ($ts, $lat, $lon, $accuracy, $altitude, $speed, $source, $importId)`,
      );
      try {
        for (const p of points) {
          const result = await statement.executeAsync({
            $ts: p.ts,
            $lat: p.lat,
            $lon: p.lon,
            $accuracy: p.accuracy,
            $altitude: p.altitude,
            $speed: p.speed,
            $source: p.source,
            $importId: p.importId,
          });
          inserted += result.changes;
        }
      } finally {
        await statement.finalizeAsync();
      }
    });
    if (inserted > 0) notifyDataChanged();
    return inserted;
  },

  async getPoints(query = {}) {
    const db = await getDatabase();
    const { where, params } = rangeClause(query, 'ts');
    if (query.limit != null) {
      // Most recent `limit` points, returned in ascending order.
      const rows = await db.getAllAsync<PointRow>(
        `SELECT * FROM (SELECT * FROM points ${where} ORDER BY ts DESC LIMIT ?) ORDER BY ts ASC`,
        [...params, query.limit],
      );
      return rows.map(toPoint);
    }
    const rows = await db.getAllAsync<PointRow>(`SELECT * FROM points ${where} ORDER BY ts ASC`, params);
    return rows.map(toPoint);
  },

  async getPointCount() {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM points');
    return row?.n ?? 0;
  },

  async getPointsAfterId(afterId, limit) {
    const db = await getDatabase();
    const rows = await db.getAllAsync<PointRow>(
      'SELECT * FROM points WHERE id > ? ORDER BY id ASC LIMIT ?',
      [afterId, Math.max(0, Math.floor(limit))],
    );
    return rows.map(toPoint);
  },

  async getMaxPointId() {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: number | null }>('SELECT MAX(id) AS id FROM points');
    return row?.id ?? 0;
  },

  async replaceVisits(visits) {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync('DELETE FROM visits');
      const statement = await tx.prepareAsync(
        `INSERT INTO visits
           (start_ts, end_ts, lat, lon, radius, point_count, label,
            place_id, place_name, place_category, place_confidence)
         VALUES
           ($startTs, $endTs, $lat, $lon, $radius, $pointCount, $label,
            $placeId, $placeName, $placeCategory, $placeConfidence)`,
      );
      try {
        for (const v of visits) {
          await statement.executeAsync({
            $startTs: v.startTs,
            $endTs: v.endTs,
            $lat: v.lat,
            $lon: v.lon,
            $radius: v.radius,
            $pointCount: v.pointCount,
            $label: v.label,
            $placeId: v.placeId,
            $placeName: v.placeName,
            $placeCategory: v.placeCategory,
            $placeConfidence: v.placeConfidence,
          });
        }
      } finally {
        await statement.finalizeAsync();
      }
    });
    notifyDataChanged();
  },

  async replaceVisitsFrom(from, visits) {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM visits WHERE start_ts >= ?', [from]);
      const statement = await tx.prepareAsync(
        `INSERT INTO visits
           (start_ts, end_ts, lat, lon, radius, point_count, label,
            place_id, place_name, place_category, place_confidence)
         VALUES
           ($startTs, $endTs, $lat, $lon, $radius, $pointCount, $label,
            $placeId, $placeName, $placeCategory, $placeConfidence)`,
      );
      try {
        for (const visit of visits) {
          await statement.executeAsync({
            $startTs: visit.startTs,
            $endTs: visit.endTs,
            $lat: visit.lat,
            $lon: visit.lon,
            $radius: visit.radius,
            $pointCount: visit.pointCount,
            $label: visit.label,
            $placeId: visit.placeId,
            $placeName: visit.placeName,
            $placeCategory: visit.placeCategory,
            $placeConfidence: visit.placeConfidence,
          });
        }
      } finally {
        await statement.finalizeAsync();
      }
    });
    notifyDataChanged();
  },

  async getVisits(query = {}) {
    const db = await getDatabase();
    const { where, params } = rangeClause(query, 'start_ts');
    const limit = query.limit != null ? ` LIMIT ${Math.max(0, Math.floor(query.limit))}` : '';
    const rows = await db.getAllAsync<VisitRow>(
      `SELECT * FROM visits ${where} ORDER BY start_ts DESC${limit}`,
      params,
    );
    return rows.map(toVisit);
  },

  async getVisit(id) {
    const db = await getDatabase();
    const row = await db.getFirstAsync<VisitRow>('SELECT * FROM visits WHERE id = ?', [id]);
    return row ? toVisit(row) : null;
  },

  async recordImport(record) {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO imports (id, file_name, format, imported_at, point_count)
       VALUES (?, ?, ?, ?, ?)`,
      [record.id, record.fileName, record.format, record.importedAt, record.pointCount],
    );
    notifyDataChanged();
  },

  async listImports() {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ImportRow>('SELECT * FROM imports ORDER BY imported_at DESC');
    return rows.map(toImport);
  },

  async deleteImport(id) {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM points WHERE import_id = ?', [id]);
      await tx.runAsync('DELETE FROM imports WHERE id = ?', [id]);
    });
    notifyDataChanged();
  },

  async getStats() {
    const db = await getDatabase();
    const points = await db.getFirstAsync<{
      n: number;
      device: number | null;
      first: number | null;
      last: number | null;
    }>(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN source = 'device' THEN 1 ELSE 0 END) AS device,
              MIN(ts) AS first, MAX(ts) AS last FROM points`,
    );
    const visits = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM visits');
    const imports = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM imports');
    const stats: DataStats = {
      points: points?.n ?? 0,
      devicePoints: points?.device ?? 0,
      visits: visits?.n ?? 0,
      imports: imports?.n ?? 0,
      firstTs: points?.first ?? null,
      lastTs: points?.last ?? null,
    };
    return stats;
  },

  async clearAll() {
    const db = await getDatabase();
    await db.execAsync('DELETE FROM points; DELETE FROM visits; DELETE FROM imports;');
    resetSyncState();
    notifyDataChanged();
  },
};
