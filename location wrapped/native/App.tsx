import './src/services/tracking';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/context/AppContext';
import { colors } from './src/theme';
import { Onboarding } from './src/screens/Onboarding';
import { WrappedHomeScreen } from './src/screens/WrappedHomeScreen';
import { MapScreen } from './src/screens/MapScreen';
import { InsightsScreen } from './src/screens/InsightsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { WrappedStory } from './src/screens/WrappedStory';

type Tab = 'Wrapped' | 'Map' | 'Insights' | 'Profile';
const tabs: { key: Tab; glyph: string }[] = [
  { key: 'Wrapped', glyph: '✦' },
  { key: 'Map', glyph: '◎' },
  { key: 'Insights', glyph: '▥' },
  { key: 'Profile', glyph: '●' }
];

export default function App() {
  return <AppProvider><StatusBar style="light" /><AppShell /></AppProvider>;
}

function AppShell() {
  const { loading, onboardingComplete, storageError, retryStorage, exportRecovery, resetLegacy } = useApp();
  const [tab, setTab] = useState<Tab>('Wrapped');
  const [story, setStory] = useState(false);
  if (loading) return <View style={styles.loading}><ActivityIndicator color={colors.purple} size="large" /><Text style={styles.loadingText}>Loading your map…</Text></View>;
  if (storageError) return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={{padding:24,gap:18}}><Text style={{color:colors.text,fontSize:24,fontWeight:'bold'}}>Your data needs attention</Text><Text style={{color:colors.muted,lineHeight:22}}>{storageError}</Text><Pressable onPress={retryStorage}><Text style={{color:colors.lime,padding:16}}>Retry</Text></Pressable><Pressable onPress={exportRecovery}><Text style={{color:colors.lime,padding:16}}>Export legacy recovery file</Text></Pressable><Pressable onPress={()=>Alert.alert('Discard unreadable legacy data?','Export the recovery file first. The current database is kept.',[{text:'Cancel',style:'cancel'},{text:'Discard legacy data',style:'destructive',onPress:resetLegacy}])}><Text style={{color:colors.danger,padding:16}}>Discard unreadable legacy data</Text></Pressable></ScrollView></SafeAreaView>;
  if (!onboardingComplete) return <Onboarding />;
  return <SafeAreaView style={styles.safe}>
    <View style={styles.screen}>
      {tab === 'Wrapped' ? <WrappedHomeScreen onOpenStory={() => setStory(true)} /> : null}
      {tab === 'Map' ? <MapScreen /> : null}
      {tab === 'Insights' ? <InsightsScreen /> : null}
      {tab === 'Profile' ? <ProfileScreen /> : null}
    </View>
    <View style={styles.tabBar}>{tabs.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{selected:tab===item.key}} accessibilityLabel={item.key} style={styles.tab} onPress={() => setTab(item.key)}>
      <View style={[styles.tabGlyph, tab === item.key && styles.tabGlyphActive]}><Text style={[styles.glyph, tab === item.key && styles.glyphActive]}>{item.glyph}</Text></View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.tabLabel, tab === item.key && styles.tabLabelActive]}>{item.key}</Text>
    </Pressable>)}</View>
    <WrappedStory visible={story} onClose={() => setStory(false)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === 'android' ? 22 : 0 },
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 14 },
  loadingText: { color: colors.muted, fontWeight: '700' },
  tabBar: { marginHorizontal: 14, marginBottom: 8, marginTop: 4, paddingVertical: 10, minHeight: 72, paddingHorizontal: 8, borderRadius: 25, backgroundColor: '#17171BEF', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  tab: { flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabGlyph: { width: 34, height: 30, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tabGlyphActive: { backgroundColor: '#B7F34A18' },
  glyph: { color: colors.muted, fontSize: 16, fontWeight: '900' }, glyphActive: { color: colors.lime },
  tabLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' }, tabLabelActive: { color: colors.lime }
});
