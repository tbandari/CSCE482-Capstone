import * as DocumentPicker from 'expo-document-picker';

import { store } from '@/lib/db/store';
import { generateSampleWeek, lastCompleteWeekStart } from '@/lib/demo/sample-week';
import { parseGoogleTimelineText, type ParseStats } from '@/lib/import/google-timeline';
import { readPickedFileText } from '@/lib/import/read-picked-file';
import { recomputeVisits } from '@/lib/pipeline/recompute-visits';
import type { ImportRecord } from '@/lib/types';

export interface ImportOutcome {
  record: ImportRecord;
  /** Points added after de-duplication. */
  inserted: number;
  stats: ParseStats | null;
  /** Total visits after recomputing. */
  visits: number;
}

export const SAMPLE_IMPORT_ID = 'sample-week';

/** Lets the user pick a Google Timeline export and runs it through the pipeline. Resolves null on cancel. */
export async function importTimelineFile(): Promise<ImportOutcome | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];

  const text = await readPickedFileText(asset);
  const importId = `imp-${Date.now().toString(36)}`;
  const parsed = parseGoogleTimelineText(text, importId);
  if (parsed.points.length === 0) {
    throw new Error('No location points were found in that file.');
  }

  const inserted = await store.insertPoints(parsed.points);
  const record: ImportRecord = {
    id: importId,
    fileName: asset.name,
    format: parsed.format,
    importedAt: Date.now(),
    pointCount: inserted,
  };
  await store.recordImport(record);
  const { visits } = await recomputeVisits();
  return { record, inserted, stats: parsed.stats, visits };
}

/** Loads (or reloads) the synthetic College Station week. */
export async function loadSampleWeek(): Promise<ImportOutcome> {
  await store.deleteImport(SAMPLE_IMPORT_ID);
  const week = generateSampleWeek(lastCompleteWeekStart());
  const inserted = await store.insertPoints(week.points);
  const record: ImportRecord = {
    id: SAMPLE_IMPORT_ID,
    fileName: 'Sample week (College Station)',
    format: 'sample',
    importedAt: Date.now(),
    pointCount: inserted,
  };
  await store.recordImport(record);
  const { visits } = await recomputeVisits();
  return { record, inserted, stats: null, visits };
}
