/**
 * Stay-detection evaluation: compares detected visits against ground-truth
 * stays and reports precision / recall / F1 plus centroid and boundary error.
 *
 * A detected visit matches a truth stay when its centroid is within
 * `matchDistanceM` and the two time intervals overlap by at least `minOverlap`
 * of the shorter interval. Matching is greedy and one-to-one.
 */

import { haversineMeters } from '@/lib/geo/distance';
import type { Visit } from '@/lib/types';

export interface TruthStay {
  name?: string;
  lat: number;
  lon: number;
  startTs: number;
  endTs: number;
}

export interface EvaluationOptions {
  matchDistanceM: number;
  minOverlap: number;
}

export const DEFAULT_EVALUATION_OPTIONS: EvaluationOptions = {
  matchDistanceM: 100,
  minOverlap: 0.5,
};

export interface StayMatch {
  truthIndex: number;
  detectedIndex: number;
  centroidErrorM: number;
  startErrorMin: number;
  endErrorMin: number;
}

export interface EvaluationResult {
  truthCount: number;
  detectedCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  meanCentroidErrorM: number;
  meanStartErrorMin: number;
  meanEndErrorMin: number;
  matches: StayMatch[];
  unmatchedTruth: number[];
  unmatchedDetected: number[];
}

function overlapFraction(a: TruthStay, b: Visit): number {
  const intersection = Math.min(a.endTs, b.endTs) - Math.max(a.startTs, b.startTs);
  if (intersection <= 0) return 0;
  const shorter = Math.max(1, Math.min(a.endTs - a.startTs, b.endTs - b.startTs));
  return intersection / shorter;
}

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

export function evaluateStays(
  detected: readonly Visit[],
  truth: readonly TruthStay[],
  options: EvaluationOptions = DEFAULT_EVALUATION_OPTIONS,
): EvaluationResult {
  const usedDetected = new Set<number>();
  const matches: StayMatch[] = [];
  const unmatchedTruth: number[] = [];

  truth.forEach((stay, truthIndex) => {
    let best: { index: number; overlap: number } | null = null;
    detected.forEach((visit, detectedIndex) => {
      if (usedDetected.has(detectedIndex)) return;
      if (haversineMeters(stay.lat, stay.lon, visit.lat, visit.lon) > options.matchDistanceM) return;
      const overlap = overlapFraction(stay, visit);
      if (overlap < options.minOverlap) return;
      if (!best || overlap > best.overlap) best = { index: detectedIndex, overlap };
    });
    if (best) {
      const chosen = best as { index: number; overlap: number };
      const visit = detected[chosen.index];
      usedDetected.add(chosen.index);
      matches.push({
        truthIndex,
        detectedIndex: chosen.index,
        centroidErrorM: haversineMeters(stay.lat, stay.lon, visit.lat, visit.lon),
        startErrorMin: Math.abs(visit.startTs - stay.startTs) / 60_000,
        endErrorMin: Math.abs(visit.endTs - stay.endTs) / 60_000,
      });
    } else {
      unmatchedTruth.push(truthIndex);
    }
  });

  const unmatchedDetected = detected
    .map((_, index) => index)
    .filter((index) => !usedDetected.has(index));

  const truePositives = matches.length;
  const falsePositives = unmatchedDetected.length;
  const falseNegatives = unmatchedTruth.length;
  const precision = detected.length === 0 ? 0 : truePositives / detected.length;
  const recall = truth.length === 0 ? 0 : truePositives / truth.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    truthCount: truth.length,
    detectedCount: detected.length,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
    meanCentroidErrorM: mean(matches.map((m) => m.centroidErrorM)),
    meanStartErrorMin: mean(matches.map((m) => m.startErrorMin)),
    meanEndErrorMin: mean(matches.map((m) => m.endErrorMin)),
    matches,
    unmatchedTruth,
    unmatchedDetected,
  };
}

export function formatEvaluation(label: string, result: EvaluationResult): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return [
    `${label}`,
    `  truth stays ${result.truthCount} · detected ${result.detectedCount} · TP ${result.truePositives} · FP ${result.falsePositives} · FN ${result.falseNegatives}`,
    `  precision ${pct(result.precision)} · recall ${pct(result.recall)} · F1 ${pct(result.f1)}`,
    `  mean centroid error ${result.meanCentroidErrorM.toFixed(1)} m · start error ${result.meanStartErrorMin.toFixed(1)} min · end error ${result.meanEndErrorMin.toFixed(1)} min`,
  ].join('\n');
}
