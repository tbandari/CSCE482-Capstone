import { useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';

import { Button } from '@/components/button';
import { Row, Section } from '@/components/grouped-list';
import { Icon } from '@/components/icon';
import { Notice, type NoticeKind } from '@/components/notice';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStoreQuery } from '@/hooks/use-store-query';
import { confirmAsync } from '@/lib/confirm';
import { store } from '@/lib/db/store';
import { formatCount, formatDate } from '@/lib/format';
import { importTimelineFile, loadSampleWeek } from '@/lib/pipeline/import-file';
import { recomputeVisits } from '@/lib/pipeline/recompute-visits';
import type { ImportRecord } from '@/lib/types';

const FORMAT_LABELS: Record<ImportRecord['format'], string> = {
  'android-semantic': 'Android export',
  'ios-semantic': 'iOS export',
  'legacy-records': 'Takeout Records.json',
  sample: 'Generated on device',
};

export default function ImportScreen() {
  const theme = useTheme();
  const [busy, setBusy] = useState<'file' | 'sample' | 'remove' | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; message: string } | null>(null);
  const imports = useStoreQuery(() => store.listImports());

  const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

  const runFileImport = async () => {
    setBusy('file');
    setNotice(null);
    try {
      const outcome = await importTimelineFile();
      if (!outcome) return;
      const stats = outcome.stats;
      const detail = stats
        ? ` (${stats.visits} Google visits, ${stats.activities} trips, ${formatCount(stats.pathPoints + stats.rawSignals)} raw fixes)`
        : '';
      setNotice({
        kind: 'success',
        message: `Imported ${formatCount(outcome.inserted)} new points from ${outcome.record.fileName}${detail}. ${outcome.visits} visits detected.`,
      });
    } catch (error) {
      setNotice({ kind: 'error', message: describe(error) });
    } finally {
      setBusy(null);
    }
  };

  const runSample = async () => {
    setBusy('sample');
    setNotice(null);
    try {
      const outcome = await loadSampleWeek();
      setNotice({
        kind: 'success',
        message: `Loaded ${formatCount(outcome.inserted)} sample points. ${outcome.visits} visits detected.`,
      });
    } catch (error) {
      setNotice({ kind: 'error', message: describe(error) });
    } finally {
      setBusy(null);
    }
  };

  const removeImport = async (record: ImportRecord) => {
    const ok = await confirmAsync(
      'Remove this import?',
      `The ${formatCount(record.pointCount)} points from "${record.fileName}" will be deleted and visits recomputed.`,
      'Remove',
    );
    if (!ok) return;
    setBusy('remove');
    try {
      await store.deleteImport(record.id);
      const result = await recomputeVisits();
      setNotice({ kind: 'info', message: `Removed. ${result.visits} visits remain.` });
    } catch (error) {
      setNotice({ kind: 'error', message: describe(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        padding: Spacing.four,
        gap: Spacing.five,
        maxWidth: MaxContentWidth,
        width: '100%',
        alignSelf: 'center',
      }}>
      <Section
        title="Google Timeline"
        footer="Google now generates the export on your phone, so Orbit imports it right here. No desktop, no file transfer. Android, iOS and legacy Takeout formats are all supported.">
        <Row title="1. Open Google Maps" subtitle="Tap your profile picture, then Your Timeline." />
        <Row title="2. Export your data" subtitle="More (⋯) → Location & privacy settings → Export Timeline data." />
        <Row title="3. Pick the file below" subtitle="Timeline.json on Android, location-history.json on iOS." />
      </Section>

      <Button
        title="Choose export file"
        size="lg"
        loading={busy === 'file'}
        disabled={busy != null && busy !== 'file'}
        onPress={runFileImport}
      />

      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      <Section
        title="Sample data"
        footer="A synthetic week around campus, generated on this device, so you can explore the app before importing anything.">
        <Row
          title="Load sample week"
          subtitle="7 days · College Station · 23 visits"
          onPress={runSample}
          disabled={busy != null}
          chevron={false}
          accessory={
            busy === 'sample' ? (
              <ActivityIndicator />
            ) : (
              <Icon sf="play.fill" md="play_arrow" size={18} color={theme.accent} />
            )
          }
        />
      </Section>

      <Section title="Imports" footer="Removing an import deletes its points and recomputes your visits.">
        {imports.data && imports.data.length > 0 ? (
          imports.data.map((record) => (
            <Row
              key={record.id}
              title={record.fileName}
              subtitle={`${formatCount(record.pointCount)} points · ${FORMAT_LABELS[record.format]} · ${formatDate(record.importedAt)}`}
              onPress={() => removeImport(record)}
              disabled={busy != null}
              chevron={false}
              accessory={<Icon sf="trash" md="delete" size={18} color={theme.danger} />}
            />
          ))
        ) : (
          <Row title="Nothing imported yet" subtitle="Your imports will be listed here." />
        )}
      </Section>
    </ScrollView>
  );
}
