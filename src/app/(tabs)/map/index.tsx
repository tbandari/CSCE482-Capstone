import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import HeatMap from '@/components/heat-map';
import { SegmentedControl, type SegmentOption } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import VisitsMap, { type MapVisit } from '@/components/visits-map';
import { HeatColors, MapColors, Radius, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { useStoreQuery } from '@/hooks/use-store-query';
import { store } from '@/lib/db/store';
import { formatCount, formatDate } from '@/lib/format';
import { buildHeatGrid } from '@/lib/geo/heat-grid';
import { visitPlaceName } from '@/lib/place-label';
import type { DataStats } from '@/lib/types';

const DAY = 24 * 60 * 60 * 1000;
const MAX_PATH_POINTS = 1500;
/** The heatmap reads at most this many of the most recent fixes. */
const MAX_HEAT_POINTS = 200_000;

type Mode = 'visits' | 'heatmap';
type Range = '7d' | '30d' | 'all';

const MODES: readonly SegmentOption<Mode>[] = [
  { value: 'visits', label: 'Visits' },
  { value: 'heatmap', label: 'Heatmap' },
];
const RANGES: readonly SegmentOption<Range>[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All' },
];
const RANGE_DAYS: Record<Range, number | null> = { '7d': 7, '30d': 30, all: null };

export default function MapScreen() {
  const router = useRouter();
  const theme = useTheme();
  const dark = useIsDark();
  const [mode, setMode] = useState<Mode>('visits');
  const [range, setRange] = useState<Range>('30d');

  const { data, loading, error } = useStoreQuery(async () => {
    const stats = await store.getStats();
    const visits = await store.getVisits({ limit: 400 });
    const from = stats.lastTs != null ? stats.lastTs - 7 * DAY : undefined;
    const points = await store.getPoints({ from, limit: 20_000 });
    return { stats, visits, points };
  });

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={{ flex: 1, padding: Spacing.five, backgroundColor: theme.background }}>
        <ThemedText color="danger" selectable>
          {error ?? 'Could not load the map.'}
        </ThemedText>
      </View>
    );
  }
  if (data.stats.points === 0) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <EmptyState
          sf="map"
          md="map"
          title="No history yet"
          message="Import your Google Timeline export or load the sample week to see your visits on the map.">
          <Button title="Go to Import" variant="secondary" onPress={() => router.push('/import')} />
        </EmptyState>
      </ScrollView>
    );
  }

  const stride = Math.max(1, Math.ceil(data.points.length / MAX_PATH_POINTS));
  const path = data.points
    .filter((_, index) => index % stride === 0)
    .map((p) => [p.lat, p.lon] as [number, number]);
  const visits: MapVisit[] = data.visits.map((v) => ({
    id: v.id ?? 0,
    lat: v.lat,
    lon: v.lon,
    startTs: v.startTs,
    endTs: v.endTs,
    pointCount: v.pointCount,
    title: visitPlaceName(v),
  }));

  const controls = (
    <>
      <SegmentedControl options={MODES} value={mode} onChange={setMode} accessibilityLabel="Map mode" />
      {mode === 'heatmap' ? (
        <SegmentedControl options={RANGES} value={range} onChange={setRange} accessibilityLabel="Time range" />
      ) : null}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {mode === 'visits' ? (
        <>
          <VisitsMap
            visits={visits}
            path={path}
            dark={dark}
            colors={MapColors}
            onSelectVisit={async (id) => {
              router.push({ pathname: '/visit/[id]', params: { id: String(id) } });
            }}
            dom={{ style: { flex: 1 }, scrollEnabled: false }}
          />
          <Overlay>
            {controls}
            <Pill text={`${data.stats.visits} visits · ${formatCount(data.stats.points)} fixes`} />
          </Overlay>
        </>
      ) : (
        <HeatmapView stats={data.stats} range={range} dark={dark} controls={controls} />
      )}
    </View>
  );
}

/** Floating column of controls over the map. zIndex keeps it above Leaflet's panes on web; harmless on native. */
function Overlay({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: Spacing.four,
        left: 0,
        right: 0,
        alignItems: 'center',
        gap: Spacing.two,
        pointerEvents: 'box-none',
        zIndex: 1000,
      }}>
      {children}
    </View>
  );
}

function Pill({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.two,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.18)',
        pointerEvents: 'none',
      }}>
      <ThemedText variant="caption" color="text" style={{ fontVariant: ['tabular-nums'] }}>
        {text}
      </ThemedText>
    </View>
  );
}

/**
 * Ranges count back from the newest fix, not from today, so an import that
 * ended months ago still shows its last week instead of an empty map.
 */
function HeatmapView({
  stats,
  range,
  dark,
  controls,
}: {
  stats: DataStats;
  range: Range;
  dark: boolean;
  controls: ReactNode;
}) {
  const theme = useTheme();
  const { data: points, loading, error } = useStoreQuery(() => store.getPoints({ limit: MAX_HEAT_POINTS }));

  const days = RANGE_DAYS[range];
  const from = days != null && stats.lastTs != null ? stats.lastTs - days * DAY : null;
  const inRange = useMemo(
    () => (points ?? []).filter((p) => from == null || p.ts >= from),
    [points, from],
  );
  const grid = useMemo(() => buildHeatGrid(inRange), [inRange]);

  if (loading || error || grid.cells.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {loading ? (
          <ActivityIndicator />
        ) : error ? (
          <ThemedText color="danger" selectable style={{ padding: Spacing.five }}>
            {error}
          </ThemedText>
        ) : (
          <EmptyState
            sf="flame"
            md="local_fire_department"
            title="Nothing in this range"
            message="Pick a longer time range to see where you spend your time."
          />
        )}
        <Overlay>{controls}</Overlay>
      </View>
    );
  }

  const capped = (points?.length ?? 0) >= MAX_HEAT_POINTS && range === 'all';
  const period = from != null && stats.lastTs != null ? `${formatDate(from)} – ${formatDate(stats.lastTs)}` : 'All history';
  return (
    <View style={{ flex: 1 }}>
      <HeatMap
        cells={grid.cells}
        palette={dark ? HeatColors.dark : HeatColors.light}
        legend={{ text: theme.text, surface: theme.backgroundElement }}
        dark={dark}
        fitKey={range}
        dom={{ style: { flex: 1 }, scrollEnabled: false }}
      />
      <Overlay>
        {controls}
        <Pill text={`${period} · ${formatCount(inRange.length)} fixes${capped ? ' (most recent)' : ''}`} />
      </Overlay>
    </View>
  );
}
