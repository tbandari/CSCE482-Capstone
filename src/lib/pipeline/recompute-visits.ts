import { store } from '@/lib/db/store';
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
  return { points: points.length, kept: kept.length, visits: visits.length, dropped };
}
