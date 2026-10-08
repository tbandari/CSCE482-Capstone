import React from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { colors } from '../theme';
import { useApp } from '../context/AppContext';
import { PrimaryButton, ScreenHeader, SectionTitle } from '../components/ui';
import { LegalScreen } from './LegalScreen';

export function ProfileScreen() {
  const { demoMode, setDemoMode, tracking, startTracking, stopTracking, captureCurrentLocation, realCounts, health, permission, clearRealData, importData, exportData, exportDemo } = useApp();
  const [legal,setLegal] = React.useState<'privacy'|'support'|null>(null);
  const clear = () => Alert.alert('Delete real location data?', `${demoMode ? 'You are viewing demo mode, but this deletes REAL history. ' : ''}Delete ${realCounts.points} real GPS points and ${realCounts.visits} visits on this device? Recording will stop. Export a backup first if you want to keep it. Previously shared copies will remain.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: clearRealData }
  ]);

  return <><LegalScreen page={legal} onClose={()=>setLegal(null)} /><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader eyebrow="Private by design" title="Profile & settings" subtitle="Control what Location Wrapped records and what stays on your device." />
    <View style={styles.statusCard}>
      <View style={[styles.statusDot, { backgroundColor: demoMode ? colors.purple : tracking ? colors.success : colors.orange }]} />
      <View style={{ flex: 1 }}><Text style={styles.statusTitle}>{demoMode ? 'Demo mode' : tracking ? 'Background recording active' : 'Background recording paused'}</Text><Text style={styles.statusBody}>{demoMode ? 'You are exploring a realistic sample year.' : 'Records with your permission while the app is in the background. iOS controls update frequency.'}</Text></View>
    </View>

    <SectionTitle title="Tracking" />
    <SettingRow title="Demo data" subtitle="Preview sample history. Turning this on pauses real recording." right={<Switch value={demoMode} onValueChange={setDemoMode} trackColor={{ true: colors.purple }} />} />
    <SettingRow title="Location permission" subtitle={`Current status: ${permission}`} />
    {!demoMode ? <View style={styles.buttonStack}>
      {tracking ? <PrimaryButton title="Pause background recording" onPress={stopTracking} secondary /> : <PrimaryButton title="Start background recording" onPress={startTracking} />}
      <PrimaryButton title="Capture current location once" onPress={captureCurrentLocation} secondary />
    </View> : null}

    <SectionTitle title="Recording health" />
    <View style={styles.note}>
      <Text style={styles.noteText}>Last GPS sample: {health.lastReceived ? new Date(health.lastReceived).toLocaleString() : 'None this session'}</Text>
      <Text style={styles.noteText}>Last point saved: {health.lastSaved ? new Date(health.lastSaved).toLocaleString() : 'None this session'}</Text>
      <Text style={styles.noteText}>Imprecise samples skipped: {health.rejectedAccuracy}</Text>
      {health.rejectedAccuracy > 0 ? <Text style={styles.noteText}>Samples over 120 m accuracy are skipped. Enable Precise Location in iPhone Settings for Location Wrapped. Indoor reception may also affect accuracy.</Text> : null}
      {tracking && health.checkedAt - (health.lastSaved || health.recordingStarted) > 10 * 60 * 1000 ? <Text style={styles.noteText}>No point saved for over 10 minutes. iOS may delay updates. Check Always and Precise Location permissions, then pause and restart recording if needed.</Text> : null}
      {health.error ? <Text style={styles.noteText}>{health.error}</Text> : null}
    </View>
    <SectionTitle title="Your real local data" />
    <Text style={styles.noteText}>These counts always describe your saved real history, including while demo mode is on.</Text>
    <View style={styles.dataCard}><DataStat value={`${realCounts.points}`} label="GPS points" /><DataStat value={`${realCounts.visits}`} label="Visits" /><DataStat value={`${realCounts.places}`} label="Places" /></View>
    <View style={styles.buttonStack}><PrimaryButton title="Import GPX or JSON history" onPress={importData} secondary /><PrimaryButton title="Export real history as JSON" onPress={exportData} secondary />{demoMode ? <PrimaryButton title="Export sample data as JSON" onPress={exportDemo} secondary /> : null}<PrimaryButton title="Delete real location data" onPress={clear} secondary /></View>

    <SectionTitle title="Help & privacy" /><View style={styles.buttonStack}><PrimaryButton title="Privacy policy" onPress={()=>setLegal('privacy')} secondary /><PrimaryButton title="Support & recording help" onPress={()=>setLegal('support')} secondary /></View>
    <SectionTitle title="Recording limits" />
    <View style={styles.note}><Text style={styles.noteTitle}>Recording on your terms.</Text><Text style={styles.noteText}>Enable Always and Precise Location permissions to record in the background. Recording requests updates while stationary, which can use more battery. iOS controls delivery; no fixed interval is guaranteed. Force-quitting, revoked permissions, or iOS battery management can interrupt updates. Import history or explore the demo without granting location access.</Text></View>
  </ScrollView></>;
}

function SettingRow({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) { return <View style={styles.setting}><View style={{ flex: 1 }}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingSubtitle}>{subtitle}</Text></View>{right}</View>; }
function DataStat({ value, label }: { value: string; label: string }) { return <View style={{flex:1,minWidth:72}}><Text adjustsFontSizeToFit numberOfLines={1} style={styles.dataValue}>{value}</Text><Text style={styles.dataLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 28 },
  statusCard: { padding: 18, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', gap: 13, alignItems: 'center' },
  statusDot: { width: 12, height: 12, borderRadius: 12 },
  statusTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  statusBody: { color: colors.muted, marginTop: 4, lineHeight: 22, fontSize: 14 },
  setting: { minHeight: 74, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  settingSubtitle: { color: colors.muted, fontSize: 12, marginTop: 4 },
  buttonStack: { gap: 10, marginTop: 10 },
  dataCard: { flexDirection: 'row', flexWrap:'wrap', gap:16, justifyContent: 'space-around', padding: 22, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dataValue: { color: colors.text, fontWeight: '900', fontSize: 25, textAlign: 'center' },
  dataLabel: { color: colors.muted, fontSize: 14, marginTop: 4, textAlign: 'center' },
  note: { padding: 20, borderRadius: 24, backgroundColor: '#8B5CF616', borderWidth: 1, borderColor: '#8B5CF644' },
  noteTitle: { color: colors.text, fontWeight: '900', fontSize: 17 },
  noteText: { color: colors.muted, fontSize:16, marginTop: 8, lineHeight: 24 }
});
