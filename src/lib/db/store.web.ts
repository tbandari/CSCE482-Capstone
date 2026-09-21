/**
 * Browser implementation of the store: in-memory arrays persisted to
 * localStorage. expo-sqlite on web is still alpha and needs cross-origin
 * isolation headers, so the web build keeps the same contract without it.
 * Good enough for demos; real users are on phones.
 */

import { notifyDataChanged } from '@/lib/db/events';
import type { RangeQuery, Store } from '@/lib/db/store-types';
import { resetSyncState } from '@/lib/settings';
import type { DataStats, ImportRecord, LocationPoint, Visit } from '@/lib/types';

const STORAGE_KEY = 'orbit.store.v1';

interface Snapshot {
  points: LocationPoint[];
  visits: Visit[];
  imports: ImportRecord[];
  nextPointId: number;
  nextVisitId: number;
}

let snapshot: Snapshot | null = null;
const pointKeys = new Set<string>();

const keyOf = (p: LocationPoint) => `${p.ts}:${p.lat.toFixed(6)}:${p.lon.toFixed(6)}`;

function load(): Snapshot {
  if (snapshot) return snapshot;
  let parsed: Partial<Snapshot> | null = null;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    parsed = raw ? (JSON.parse(raw) as Partial<Snapshot>) : null;
  } catch {
    parsed = null;
  }
  snapshot = {
    points: parsed?.points ?? [],
    visits: parsed?.visits ?? [],
    imports: parsed?.imports ?? [],
    nextPointId: parsed?.nextPointId ?? 1,
    nextVisitId: parsed?.nextVisitId ?? 1,
  };
  for (const p of snapshot.points) pointKeys.add(keyOf(p));
  return snapshot;
}

function persist(): void {
  if (!snapshot) return;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    // Quota exceeded: keep the in-memory copy and carry on.
    console.warn('Orbit web store: could not persist to localStorage', error);
  }
}

function inRange(ts: number, query: RangeQuery): boolean {
  if (query.from != null && ts < query.from) return false;
  if (query.to != null && ts > query.to) return false;
  return true;
}

export const store: Store = {
  async insertPoints(points) {
    const data = load();
    let inserted = 0;
    for (const p of points) {
      const key = keyOf(p);
      if (pointKeys.has(key)) continue;
      pointKeys.add(key);
      data.points.push({ ...p, id: data.nextPointId });
      data.nextPointId += 1;
      inserted += 1;
    }
    if (inserted > 0) {
      data.points.sort((a, b) => a.ts - b.ts);
      persist();
      notifyDataChanged();
    }
    return inserted;
  },

  async getPoints(query = {}) {
    const data = load();
    const filtered = data.points.filter((p) => inRange(p.ts, query));
    if (query.limit != null && filtered.length > query.limit) {
      return filtered.slice(filtered.length - query.limit);
    }
    return filtered;
  },

  async getPointCount() {
    return load().points.length;
  },

  async getPointsAfterId(afterId, limit) {
    return load()
      .points.filter((point) => (point.id ?? 0) > afterId)
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .slice(0, Math.max(0, Math.floor(limit)));
  },

  async getMaxPointId() {
    return load().points.reduce((max, point) => Math.max(max, point.id ?? 0), 0);
  },

  async replaceVisits(visits) {
    const data = load();
    data.visits = visits.map((v) => ({ ...v, id: data.nextVisitId++ }));
    persist();
    notifyDataChanged();
  },

  async getVisits(query = {}) {
    const data = load();
    const result = data.visits
      .filter((v) => inRange(v.startTs, query))
      .sort((a, b) => b.startTs - a.startTs);
    return query.limit != null ? result.slice(0, query.limit) : result;
  },

  async getVisit(id) {
    return load().visits.find((v) => v.id === id) ?? null;
  },

  async recordImport(record) {
    const data = load();
    data.imports = [record, ...data.imports.filter((r) => r.id !== record.id)];
    persist();
    notifyDataChanged();
  },

  async listImports() {
    return [...load().imports].sort((a, b) => b.importedAt - a.importedAt);
  },

  async deleteImport(id) {
    const data = load();
    data.points = data.points.filter((p) => {
      const keep = p.importId !== id;
      if (!keep) pointKeys.delete(keyOf(p));
      return keep;
    });
    data.imports = data.imports.filter((r) => r.id !== id);
    persist();
    notifyDataChanged();
  },

  async getStats() {
    const data = load();
    const stats: DataStats = {
      points: data.points.length,
      devicePoints: data.points.filter((p) => p.source === 'device').length,
      visits: data.visits.length,
      imports: data.imports.length,
      firstTs: data.points.length ? data.points[0].ts : null,
      lastTs: data.points.length ? data.points[data.points.length - 1].ts : null,
    };
    return stats;
  },

  async clearAll() {
    snapshot = { points: [], visits: [], imports: [], nextPointId: 1, nextVisitId: 1 };
    pointKeys.clear();
    persist();
    resetSyncState();
    notifyDataChanged();
  },
};
