import React, { useState } from 'react';
import { SafeAreaView, ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';
import { PrimaryButton } from '../components/ui';
import { useApp } from '../context/AppContext';

const slides = [
  { kicker: 'LOCATION WRAPPED', title: 'See your life through the places you go.', body: 'Turn everyday movement into a visual story of your favorite places, routines, and adventures.', symbol: '◎' },
  { kicker: 'YOUR JOURNEY', title: 'Record on your terms.', body: 'Choose background recording in Profile, or import GPX history. Always location permission is optional; the demo works without it.', symbol: '⌁' },
  { kicker: 'PRIVATE BY DESIGN', title: 'Keep your history on your device.', body: 'Export or delete your history in Profile. Map services receive map requests, and sharing sends only the files you choose.', symbol: '◇' }
];

export function Onboarding() {
  const [index, setIndex] = useState(0);
  const { finishOnboarding } = useApp();
  const slide = slides[index]!;
  return <LinearGradient colors={index === 1 ? ['#07111E', '#17103B', '#09090B'] : ['#180D2E', '#0B1730', '#09090B']} style={styles.root}>
    <SafeAreaView style={{flex:1}}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.top}><Text style={styles.kicker}>{slide.kicker}</Text><Pressable accessibilityRole="button" style={{minHeight:44,justifyContent:'center',paddingHorizontal:12}} onPress={finishOnboarding}><Text style={styles.skip}>Skip</Text></Pressable></View>
    <View style={styles.visual}><View style={styles.ring3}><View style={styles.ring2}><View style={styles.ring1}><Text style={styles.symbol}>{slide.symbol}</Text></View></View></View></View>
    <View><Text style={styles.title}>{slide.title}</Text><Text style={styles.body}>{slide.body}</Text></View>
    <View style={styles.footer}>
      <View style={styles.dots}>{slides.map((_, i) => <View key={i} style={[styles.dot, i === index && styles.dotActive]} />)}</View>
      <PrimaryButton title={index === slides.length - 1 ? 'Start exploring' : 'Continue'} onPress={() => index === slides.length - 1 ? finishOnboarding() : setIndex(index + 1)} />
    </View>
  </ScrollView></SafeAreaView></LinearGradient>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow:1, padding:24, gap:24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { flex:1, color: colors.lime, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  skip: { color: colors.muted, fontWeight: '700' },
  visual: { minHeight: 200, marginVertical: 12, alignItems: 'center', justifyContent: 'center' },
  ring3: { width: 200, height: 200, borderRadius: 140, borderWidth: 1, borderColor: '#8B5CF633', alignItems: 'center', justifyContent: 'center' },
  ring2: { width: 158, height: 158, borderRadius: 100, borderWidth: 1, borderColor: '#47D7FF55', alignItems: 'center', justifyContent: 'center' },
  ring1: { width: 118, height: 118, borderRadius: 60, backgroundColor: '#FFFFFF10', borderWidth: 1, borderColor: '#FFFFFF25', alignItems: 'center', justifyContent: 'center' },
  symbol: { color: colors.text, fontSize: 60, fontWeight: '300' },
  title: { color: colors.text, fontSize: 40, lineHeight: 43, letterSpacing: -1.6, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 16 },
  footer: { gap: 22, marginTop: 'auto', paddingTop: 12 },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 7, backgroundColor: '#FFFFFF25' },
  dotActive: { width: 24, backgroundColor: colors.text }
});
