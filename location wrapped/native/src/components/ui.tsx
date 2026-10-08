import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import { colors } from '../theme';

export function ResponsiveRow({children}:{children:React.ReactNode}) { const {width,fontScale}=useWindowDimensions();return <View style={{flexDirection:width/fontScale<360?'column':'row',gap:12,marginBottom:12}}>{children}</View>; }

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{action ? <Pressable accessibilityRole="button" style={{minHeight:44,justifyContent:'center'}} onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}</View>;
}

export function StatCard({ value, label, accent = colors.purple, style }: { value: string; label: string; accent?: string; style?: ViewStyle }) {
  return <View style={[styles.statCard, style]}><View style={[styles.dot, { backgroundColor: accent }]} /><Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

export function PrimaryButton({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) {
  if (secondary) return <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={onPress}><Text style={styles.secondaryText}>{title}</Text></Pressable>;
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.primaryButton}><Text style={styles.primaryText}>{title}</Text></Pressable>;
}

export function Pill({ children, accent = colors.cyan }: { children: React.ReactNode; accent?: string }) {
  return <View style={[styles.pill, { borderColor: `${accent}55` }]}><Text style={[styles.pillText, { color: accent }]}>{children}</Text></View>;
}

export function ScreenHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return <View style={{ marginBottom: 22 }}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.headerTitle}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 26, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800', flexShrink: 1 },
  sectionAction: { color: colors.cyan, fontWeight: '700' },
  statCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 18, minHeight: 124, flex: 1, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 8, marginBottom: 18 },
  statValue: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  statLabel: { color: colors.muted, marginTop: 6, fontSize: 14, fontWeight: '600' },
  primaryButton: { backgroundColor:colors.lime, minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  primaryText: { color: '#162006', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  secondaryButton: { minHeight: 52, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  secondaryText: { color: colors.text, fontWeight: '800', fontSize: 16, textAlign: 'center' },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: colors.surface2 },
  pillText: { fontSize: 12, fontWeight: '800' },
  eyebrow: { color: colors.lime, fontWeight: '900', fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  headerTitle: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1.3 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 8 }
});
