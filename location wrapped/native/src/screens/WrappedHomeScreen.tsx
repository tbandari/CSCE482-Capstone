import { formatDuration } from '../utils/duration';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';
import { useApp } from '../context/AppContext';
import { Pill, PrimaryButton, ScreenHeader, SectionTitle, StatCard, ResponsiveRow } from '../components/ui';

export function WrappedHomeScreen({ onOpenStory }: { onOpenStory: () => void }) {
  const { stats, demoMode, tracking, startTracking } = useApp();
  const duration = formatDuration(stats.trackedMinutes);
  return <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader eyebrow="Your history in motion" title="Location Wrapped" subtitle="The places, routines, and little adventures that make up your story." />
    <LinearGradient colors={['#8B5CF6', '#D946EF', '#FB7185']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroTop}><Pill accent="#fff">{demoMode ? 'DEMO WRAPPED' : tracking ? 'TRACKING LIVE' : 'YOUR WRAPPED'}</Pill><Text style={styles.heroYear}>ALL HISTORY</Text></View>
      <View style={styles.orbit}><View style={styles.orbitInner}><Text style={styles.orbitText}>◎</Text></View></View>
      <Text style={styles.heroTitle}>{stats.placesVisited || 0} places made your story.</Text>
      <Text style={styles.heroBody}>{stats.visits ? `${stats.visits} visits · ${duration} remembered` : 'Start tracking to build your first recap.'}</Text>
      <Pressable accessibilityRole="button" style={styles.heroButton} onPress={onOpenStory}><Text style={styles.heroButtonText}>View my Wrapped</Text></Pressable>
    </LinearGradient>

    <SectionTitle title="Your snapshot" />
    <ResponsiveRow><StatCard value={`${stats.placesVisited}`} label="Places" accent={colors.cyan} /><StatCard value={`${Math.round(stats.distanceMiles)}`} label="Recorded miles" accent={colors.lime} /></ResponsiveRow>
    <ResponsiveRow><StatCard value={`${stats.visits}`} label="Visits" accent={colors.pink} /><StatCard value={stats.mostActiveMonth} label="Busiest month" accent={colors.orange} /></ResponsiveRow>

    <SectionTitle title="Your signature" />
    <View style={styles.personalityCard}>
      <View style={styles.personalityIcon}><Text style={styles.personalityGlyph}>✦</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.personalityLabel}>MOVEMENT PERSONALITY</Text><Text style={styles.personality}>{stats.personality}</Text><Text style={styles.personalityBody}>Built from how far you move, how often you return, and how many distinct places become part of your routine.</Text></View>
    </View>

    {!demoMode && !tracking ? <View style={styles.trackingCard}><Text style={styles.trackingTitle}>Background recording is off</Text><Text style={styles.trackingBody}>Enable recording to collect GPS samples in the background. Pause anytime in Profile.</Text><PrimaryButton title="Start background recording" onPress={startTracking} /></View> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 28 },
  hero: { borderRadius: 30, padding: 22, minHeight: 420, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' },
  heroYear: { color: '#FFFFFFBB', fontWeight: '900', fontSize: 13 },
  orbit: { alignSelf: 'center', width: 150, height: 150, borderRadius: 80, borderWidth: 1, borderColor: '#FFFFFF45', alignItems: 'center', justifyContent: 'center', marginVertical: 28 },
  orbitInner: { width: 92, height: 92, borderRadius: 48, backgroundColor: '#FFFFFF16', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF33' },
  orbitText: { color: '#fff', fontSize: 54 },
  heroTitle: { color: '#fff', fontWeight: '900', fontSize: 36, lineHeight: 38, letterSpacing: -1.3 },
  heroBody: { color: '#FFFFFFD2', marginTop: 10, fontSize: 15 },
  heroButton: { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18, marginTop: 24, alignSelf: 'flex-start' },
  heroButtonText: { textAlign: 'center', color: '#17111E', fontWeight: '900', fontSize: 15 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  personalityCard: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 20, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  personalityIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#8B5CF622', alignItems: 'center', justifyContent: 'center' },
  personalityGlyph: { color: colors.purple, fontSize: 28 },
  personalityLabel: { color: colors.purple, fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  personality: { color: colors.text, fontWeight: '900', fontSize: 25, marginTop: 4 },
  personalityBody: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 6 },
  trackingCard: { gap: 12, marginTop: 18, padding: 20, borderRadius: 24, backgroundColor: colors.surface2 },
  trackingTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  trackingBody: { color: colors.muted, fontSize:16, lineHeight:24 }
});
