import { store } from '@/lib/db/store';
import { settings } from '@/lib/settings';
import { detectStays } from '@/lib/stays/detect-stays';
import { filterPoints, type FilterReport } from '@/lib/stays/filter-points';

export interface RecomputeResult {
  points: number;
  kept: number;
  visits: number;
  dropped: FilterReport;
}

/**
 * The on-device pipeline: every stored point -> noise filter -> stay detection
 * -> visits table. Idempotent; run it after any import or whenever parameters change.
 */
export async function recomputeVisits(): Promise<RecomputeResult> {
  const points = await store.getPoints();
  const { kept, dropped } = filterPoints(points);
  const visits = detectStays(kept);
  await store.replaceVisits(visits);
  // Local derived rows have no resolved places, so the next sync must refresh them.
  settings.set('serverVisitsSyncedAt', 0);
  return { points: points.length, kept: kept.length, visits: visits.length, dropped };
}
