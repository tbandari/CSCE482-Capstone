import { useState } from 'react';
import { Linking, ScrollView, Switch } from 'react-native';

import { Row, Section } from '@/components/grouped-list';
import { Notice, type NoticeKind } from '@/components/notice';
import { StatRow, StatTile } from '@/components/stat-tile';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStoreQuery } from '@/hooks/use-store-query';
import { confirmAsync } from '@/lib/confirm';
import { store } from '@/lib/db/store';
import { formatCount, formatDate, formatTime } from '@/lib/format';
import { startTracking, stopTracking, useTrackingStatus } from '@/lib/location/tracking';
import { recomputeVisits } from '@/lib/pipeline/recompute-visits';
import { useSetting } from '@/lib/settings';

export default function SettingsScreen() {
  const theme = useTheme();
  const status = useTrackingStatus();
  const trackingEnabled = useSetting('trackingEnabled');
  const stats = useStoreQuery(() => store.getStats());
  const [busy, setBusy] = useState<'tracking' | 'recompute' | 'wipe' | null>(null);
  const [notice, setNotice] = useState<{ kind: NoticeKind; message: string } | null>(null);

  const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

  const toggleTracking = async (value: boolean) => {
    setBusy('tracking');
    setNotice(null);
    try {
      if (value) {
        const result = await startTracking();
        if (result.mode === 'off') {
          setNotice({ kind: 'error', message: result.error ?? 'Location permission was not granted.' });
        }
      } else {
        await stopTracking();
      }
    } catch (error) {
      setNotice({ kind: 'error', message: describe(error) });
    } finally {
      setBusy(null);
    }
  };

  const recompute = async () => {
    setBusy('recompute');
    setNotice(null);
    try {
      const result = await recomputeVisits();
      const dropped = Object.values(result.dropped).reduce((sum, n) => sum + n, 0);
      setNotice({
        kind: 'success',
        message: `${result.visits} visits from ${formatCount(result.kept)} of ${formatCount(result.points)} points (${dropped} noisy fixes dropped).`,
      });
    } catch (error) {
      setNotice({ kind: 'error', message: describe(error) });
    } finally {
      setBusy(null);
    }
  };

  const wipe = async () => {
    const ok = await confirmAsync(
      'Delete all data?',
      'Every point, visit and import on this device will be permanently deleted. This cannot be undone.',
      'Delete',
    );
    if (!ok) return;
    setBusy('wipe');
    setNotice(null);
    try {
      await stopTracking();
      await store.clearAll();
      setNotice({ kind: 'info', message: 'All location data on this device has been deleted.' });
    } catch (error) {
      setNotice({ kind: 'error', message: describe(error) });
    } finally {
      setBusy(null);
    }
  };

  const modeLabel =
    status.mode === 'background'
      ? 'Background (Always)'
      : status.mode === 'foreground'
        ? process.env.EXPO_OS === 'web'
          ? 'While this page is open'
          : status.backgroundAvailable
            ? 'While app is open'
            : 'While app is open (Expo Go)'
        : 'Off';

  const permissionSummary = `Foreground ${status.foregroundGranted ? 'granted' : 'not granted'} · Background ${
    status.backgroundGranted ? 'granted' : 'not granted'
  }`;

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
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      <Section
        title="Tracking"
        footer='Background recording needs the "Always" permission and a development build. In Expo Go, Orbit records while the app is open.'>
        <Row
          title="Record location"
          accessory={
            <Switch
              value={trackingEnabled}
              onValueChange={toggleTracking}
              disabled={busy === 'tracking'}
              trackColor={{ true: theme.accent }}
              accessibilityLabel="Record location"
            />
          }
        />
        <Row title="Mode" value={modeLabel} />
        <Row title="Last fix" value={status.lastFixTs ? formatTime(status.lastFixTs) : '—'} />
        <Row
          title="Permissions"
          subtitle={permissionSummary}
          onPress={process.env.EXPO_OS === 'web' ? undefined : () => Linking.openSettings()}
        />
        {status.error ? <Row title="Last error" subtitle={status.error} titleColor="danger" /> : null}
      </Section>

      <Section title="Your data">
        <StatRow>
          <StatTile label="Points" value={formatCount(stats.data?.points ?? 0)} hint={`${formatCount(stats.data?.devicePoints ?? 0)} from this phone`} />
          <StatTile label="Visits" value={String(stats.data?.visits ?? 0)} hint={`${stats.data?.imports ?? 0} imports`} />
        </StatRow>
        <Row title="First fix" value={stats.data?.firstTs ? formatDate(stats.data.firstTs) : '—'} />
        <Row title="Latest fix" value={stats.data?.lastTs ? formatDate(stats.data.lastTs) : '—'} />
        <Row
          title="Recompute visits"
          subtitle="Re-run noise filtering and stay detection on every point."
          onPress={recompute}
          disabled={busy != null}
          chevron={false}
        />
        <Row
          title="Export everything"
          subtitle="One-tap JSON export ships with cloud sync in sprint 2."
          disabled
          chevron={false}
        />
        <Row
          title="Delete all data"
          subtitle="Permanently removes every point, visit and import on this device."
          titleColor="danger"
          onPress={wipe}
          disabled={busy != null}
          chevron={false}
        />
      </Section>

      <Section title="About">
        <Row title="Orbit" value="1.0.0 · Iteration 1" />
        <Row
          title="Privacy"
          subtitle="Location data stays on this device. Nothing is uploaded, profiled or sold."
        />
      </Section>
    </ScrollView>
  );
}
