import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import VisitsMap, { type MapVisit } from '@/components/visits-map';
import { MapColors, Radius, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { useStoreQuery } from '@/hooks/use-store-query';
import { store } from '@/lib/db/store';
import { formatCount } from '@/lib/format';

const DAY = 24 * 60 * 60 * 1000;
const MAX_PATH_POINTS = 1500;

export default function MapScreen() {
  const router = useRouter();
  const theme = useTheme();
  const dark = useIsDark();

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
  }));

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
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
      {/* zIndex keeps the pill above Leaflet's panes on web; harmless on native. */}
      <View style={{ position: 'absolute', top: Spacing.four, left: 0, right: 0, alignItems: 'center', pointerEvents: 'none', zIndex: 1000 }}>
        <View
          style={{
            backgroundColor: theme.backgroundElement,
            borderRadius: Radius.full,
            paddingHorizontal: Spacing.four,
            paddingVertical: Spacing.two,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.18)',
          }}>
          <ThemedText variant="caption" color="text" style={{ fontVariant: ['tabular-nums'] }}>
            {data.stats.visits} visits · {formatCount(data.stats.points)} fixes
          </ThemedText>
        </View>
      </View>
    </View>
  );
}
