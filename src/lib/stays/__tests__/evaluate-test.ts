/**
 * Stay-detection experiment. This doubles as the week-1 evaluation harness:
 * it runs the full pipeline (filter -> detect) on the synthetic week and prints
 * precision / recall / F1 against the generated schedule.
 */

import { generateSampleWeek } from '@/lib/demo/sample-week';
import { offsetMeters } from '@/lib/geo/distance';
import { detectStays } from '@/lib/stays/detect-stays';
import { evaluateStays, formatEvaluation } from '@/lib/stays/evaluate';
import { filterPoints } from '@/lib/stays/filter-points';
import type { LocationPoint } from '@/lib/types';

const WEEK_START = Date.UTC(2026, 8, 7, 5); // Mon 2026-09-07 00:00 CDT

/** Corrupts a clean trace with low-accuracy fixes and out-and-back spikes. */
function addNoise(points: LocationPoint[], seed = 99): { noisy: LocationPoint[]; inaccurate: number; spikes: number } {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const noisy: LocationPoint[] = [];
  let inaccurate = 0;
  let spikes = 0;
  for (const p of points) {
    noisy.push(p);
    const roll = random();
    if (roll < 0.05) {
      // Cell-tower style fix: reported accuracy of 400-1000 m, and displaced by about that much.
      const accuracy = 400 + random() * 600;
      const displaced = offsetMeters(p, (random() - 0.5) * accuracy, (random() - 0.5) * accuracy);
      noisy.push({ ...p, ts: p.ts + 1000, lat: displaced.lat, lon: displaced.lon, accuracy });
      inaccurate += 1;
    } else if (roll < 0.07) {
      const jump = offsetMeters(p, (random() - 0.5) * 8000, (random() - 0.5) * 8000);
      noisy.push({ ...p, ts: p.ts + 2000, lat: jump.lat, lon: jump.lon, accuracy: 20 });
      spikes += 1;
    }
  }
  return { noisy, inaccurate, spikes };
}

describe('stay detection on the synthetic week', () => {
  const week = generateSampleWeek(WEEK_START);

  test('clean trace: precision and recall are both at least 90%', () => {
    const { kept, dropped } = filterPoints(week.points);
    const visits = detectStays(kept);
    const result = evaluateStays(visits, week.stays);

    console.log(
      `${formatEvaluation('Clean synthetic week (filter -> detect)', result)}\n  points in ${week.points.length} · kept ${kept.length} · dropped ${JSON.stringify(dropped)}`,
    );

    expect(result.precision).toBeGreaterThanOrEqual(0.9);
    expect(result.recall).toBeGreaterThanOrEqual(0.9);
    expect(result.meanCentroidErrorM).toBeLessThan(30);
    expect(result.meanStartErrorMin).toBeLessThan(10);
    expect(result.meanEndErrorMin).toBeLessThan(10);
  });

  test('noisy trace: the filter removes injected junk and quality holds', () => {
    const { noisy, inaccurate, spikes } = addNoise(week.points);
    const { kept, dropped } = filterPoints(noisy);
    const visits = detectStays(kept);
    const result = evaluateStays(visits, week.stays);

    console.log(
      `${formatEvaluation('Noisy synthetic week (5% low-accuracy, 2% spikes)', result)}\n  injected inaccurate ${inaccurate} · injected spikes ${spikes} · dropped ${JSON.stringify(dropped)}`,
    );

    expect(dropped.inaccurate).toBe(inaccurate);
    expect(dropped.spike).toBeGreaterThanOrEqual(Math.floor(spikes * 0.9));
    expect(result.precision).toBeGreaterThanOrEqual(0.9);
    expect(result.recall).toBeGreaterThanOrEqual(0.9);
  });

  test('ablation: the filter never makes detection worse', () => {
    const { noisy } = addNoise(week.points);
    const unfiltered = evaluateStays(detectStays(noisy), week.stays);
    const filtered = evaluateStays(detectStays(filterPoints(noisy).kept), week.stays);
    console.log(formatEvaluation('Noisy synthetic week WITHOUT filter (ablation)', unfiltered));
    expect(filtered.f1).toBeGreaterThanOrEqual(unfiltered.f1 - 0.01);
    expect(filtered.meanCentroidErrorM).toBeLessThanOrEqual(unfiltered.meanCentroidErrorM + 1);
  });
});
