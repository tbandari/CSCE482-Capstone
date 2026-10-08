import { formatDuration } from '../utils/duration';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { useApp } from '../context/AppContext';
import { ScreenHeader, SectionTitle, StatCard, ResponsiveRow } from '../components/ui';
import { PlaceCategory } from '../types';

const accents: Record<PlaceCategory, string> = {
  Home: colors.purple, School: colors.cyan, Work: colors.orange, Food: colors.pink, Shopping: '#FBBF24', Fitness: colors.lime, Entertainment: '#A78BFA', Outdoors: colors.success, Travel: '#60A5FA', Other: '#9CA3AF'
};

export function InsightsScreen() {
  const { stats, places } = useApp();
  const topPlaces = places.filter(p => (stats.placeVisitCounts[p.id] ?? 0) > 0).sort((a, b) => (stats.placeMinutes[b.id] ?? 0) - (stats.placeMinutes[a.id] ?? 0)).slice(0, 5);
  const categories = (Object.entries(stats.categoryMinutes) as [PlaceCategory, number][]).filter(([, min]) => min > 0).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(1, ...categories.map(([, min]) => min));

  return <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader eyebrow="Patterns, not spreadsheets" title="Insights" subtitle="A simple view of the places and routines that shaped your movement." />
    <ResponsiveRow><StatCard value={`${stats.placesVisited}`} label="Places visited" accent={colors.cyan} /><StatCard value={`${Math.round(stats.distanceMiles)}`} label="Recorded miles" accent={colors.lime} /></ResponsiveRow>
    <ResponsiveRow><StatCard value={`${stats.visits}`} label="Total visits" accent={colors.pink} /><StatCard value={formatDuration(stats.trackedMinutes)} label="Time at places" accent={colors.orange} /></ResponsiveRow>

    <SectionTitle title="Where your time went" />
    <View style={styles.card}>{categories.map(([category, minutes]) => <View key={category} style={styles.barRow}>
      <View style={styles.barHeader}><Text style={styles.barLabel}>{category}</Text><Text style={styles.barValue}>{formatDuration(minutes)}</Text></View>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(4, minutes / maxCategory * 100)}%`, backgroundColor: accents[category] }]} /></View>
    </View>)}{categories.length === 0 ? <Text style={styles.empty}>No category data yet.</Text> : null}</View>

    <SectionTitle title="Top places by time" />
    <View style={styles.card}>{topPlaces.map((place, index) => <View key={place.id} style={[styles.placeRow, index < topPlaces.length - 1 && styles.border]}>
      <Text style={styles.rank}>{String(index + 1).padStart(2, '0')}</Text>
      <View style={{ flex: 1 }}><Text style={styles.placeName}>{place.name}</Text><Text style={styles.placeMeta}>{place.category} · {stats.placeVisitCounts[place.id] ?? 0} visits</Text></View>
      <Text style={styles.placeHours}>{formatDuration(stats.placeMinutes[place.id] ?? 0)}</Text>
    </View>)}{topPlaces.length === 0 ? <Text style={styles.empty}>Your top places will appear here.</Text> : null}</View>

    <SectionTitle title="Exploration" />
    <ResponsiveRow><StatCard value={`${stats.newPlaces}`} label="Visited once" /><StatCard value={`${stats.repeatPlaces}`} label="Repeat places" /></ResponsiveRow>
    <Text style={styles.empty}>Busiest calendar month: {stats.mostActiveMonth}. Includes all recorded years.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 28 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { padding: 18, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  barRow: { marginBottom: 18 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  barLabel: { color: colors.text, fontWeight: '800' },
  barValue: { color: colors.muted, fontWeight: '700' },
  track: { height: 9, backgroundColor: colors.surface2, borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
  placeRow: { flexDirection: 'row', gap: 13, alignItems: 'center', minHeight: 70, paddingVertical: 12 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { color: colors.muted, fontWeight: '900', fontSize: 12, width: 24 },
  placeName: { color: colors.text, fontWeight: '900', fontSize: 15 },
  placeMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  placeHours: { maxWidth:'28%', color: colors.text, fontWeight: '900' },
  exploreCard: { padding: 20, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  exploreBig: { color: colors.text, fontWeight: '900', fontSize: 26, textAlign: 'center' },
  exploreLabel: { color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'center' },
  divider: { width: 1, height: 38, backgroundColor: colors.border },
  empty: { color: colors.muted, fontSize:16, lineHeight:24 }
});
