import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Row, Section } from '@/components/grouped-list';
import { ThemedText } from '@/components/themed-text';
import VisitsMap from '@/components/visits-map';
import { MapColors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { useStoreQuery } from '@/hooks/use-store-query';
import { store } from '@/lib/db/store';
import {
  formatCoordinates,
  formatDateTime,
  formatDayHeading,
  formatDistance,
  formatDuration,
} from '@/lib/format';

export default function VisitScreen() {
  const theme = useTheme();
  const dark = useIsDark();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: visit, loading, error } = useStoreQuery(() => store.getVisit(Number(id)));

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error || !visit) {
    return (
      <View style={{ flex: 1, padding: Spacing.five, backgroundColor: theme.background }}>
        <ThemedText color="danger" selectable>
          {error ?? 'This visit no longer exists.'}
        </ThemedText>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: formatDayHeading(visit.startTs) }} />
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
        <View style={{ height: 220, borderRadius: Radius.lg, borderCurve: 'continuous', overflow: 'hidden' }}>
          <VisitsMap
            visits={[
              {
                id: visit.id ?? 0,
                lat: visit.lat,
                lon: visit.lon,
                startTs: visit.startTs,
                endTs: visit.endTs,
                pointCount: visit.pointCount,
              },
            ]}
            path={[]}
            focus={{ lat: visit.lat, lon: visit.lon, zoom: 16 }}
            interactive={false}
            dark={dark}
            colors={MapColors}
            dom={{ style: { flex: 1 }, scrollEnabled: false }}
          />
        </View>

        <Section title="Stay">
          <Row title="Arrived" value={formatDateTime(visit.startTs)} />
          <Row title="Left" value={formatDateTime(visit.endTs)} />
          <Row title="Duration" value={formatDuration(visit.endTs - visit.startTs)} />
        </Section>

        <Section
          title="Place"
          footer="Names arrive in month 2, when visits are matched against our own OpenStreetMap index. Nothing about this visit leaves your phone.">
          <Row title="Label" value={visit.label ?? 'Unresolved'} />
          <Row title="Coordinates" value={formatCoordinates(visit.lat, visit.lon)} />
          <Row title="Spread" value={`within ${formatDistance(visit.radius)}`} />
          <Row title="Fixes" value={String(visit.pointCount)} />
        </Section>
      </ScrollView>
    </>
  );
}
