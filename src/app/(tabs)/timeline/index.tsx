import { useRouter } from 'expo-router';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { VisitRow } from '@/components/visit-row';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStoreQuery } from '@/hooks/use-store-query';
import { store } from '@/lib/db/store';
import { formatDayHeading, formatDuration, startOfDay } from '@/lib/format';
import type { Visit } from '@/lib/types';

interface DaySection {
  title: string;
  dayTs: number;
  totalMs: number;
  data: Visit[];
}

function groupByDay(visits: Visit[]): DaySection[] {
  const sections = new Map<number, DaySection>();
  for (const visit of visits) {
    const dayTs = startOfDay(visit.startTs);
    let section = sections.get(dayTs);
    if (!section) {
      section = { title: formatDayHeading(visit.startTs), dayTs, totalMs: 0, data: [] };
      sections.set(dayTs, section);
    }
    section.data.push(visit);
    section.totalMs += visit.endTs - visit.startTs;
  }
  return [...sections.values()];
}

export default function TimelineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: visits, loading, error } = useStoreQuery(() => store.getVisits({ limit: 500 }));

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, padding: Spacing.five, backgroundColor: theme.background }}>
        <ThemedText color="danger" selectable>
          {error}
        </ThemedText>
      </View>
    );
  }

  const sections = groupByDay(visits ?? []);

  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        paddingHorizontal: Spacing.four,
        paddingBottom: Spacing.six,
        gap: Spacing.two,
        maxWidth: MaxContentWidth,
        width: '100%',
        alignSelf: 'center',
        flexGrow: 1,
      }}
      sections={sections}
      keyExtractor={(visit) => String(visit.id)}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.four, paddingBottom: Spacing.one, paddingHorizontal: Spacing.one }}>
          <ThemedText variant="headline">{section.title}</ThemedText>
          <ThemedText variant="subhead">
            {section.data.length} {section.data.length === 1 ? 'visit' : 'visits'} · {formatDuration(section.totalMs)}
          </ThemedText>
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <View
          style={{
            overflow: 'hidden',
            borderCurve: 'continuous',
            borderTopLeftRadius: index === 0 ? Radius.lg : 0,
            borderTopRightRadius: index === 0 ? Radius.lg : 0,
            borderBottomLeftRadius: index === section.data.length - 1 ? Radius.lg : 0,
            borderBottomRightRadius: index === section.data.length - 1 ? Radius.lg : 0,
          }}>
          {index > 0 ? (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.separator, marginLeft: Spacing.four }} />
          ) : null}
          <VisitRow
            visit={item}
            onPress={() => router.push({ pathname: '/visit/[id]', params: { id: String(item.id) } })}
          />
        </View>
      )}
      ListEmptyComponent={
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            sf="clock"
            md="schedule"
            title="No visits yet"
            message="Visits appear here once Orbit has recorded or imported enough location history.">
            <Button title="Go to Import" variant="secondary" onPress={() => router.push('/import')} />
          </EmptyState>
        </View>
      }
    />
  );
}
