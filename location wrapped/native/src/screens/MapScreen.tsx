import { formatDuration } from '../utils/duration';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';
import { colors } from '../theme';
import { useApp } from '../context/AppContext';
import { Place } from '../types';
import { ScreenHeader, SectionTitle } from '../components/ui';

export function MapScreen() {
  const { points, places, visits, stats, demoMode, permission, renamePlace } = useApp();
  const mapRef=useRef<MapView>(null), scrollRef=useRef<ScrollView>(null);
  const [editing,setEditing]=useState(false),[name,setName]=useState(''),[saving,setSaving]=useState(false);
  const [selected, setSelected] = useState<Place | null>(places[0] ?? null);
  useEffect(()=>setSelected(previous=>places.find(p=>p.id===previous?.id)??places[0]??null),[demoMode,places]);
  const region = useMemo<Region>(() => {
    const p = places[0] ?? points[0];
    return { latitude: p?.latitude ?? 30.2672, longitude: p?.longitude ?? -97.7431, latitudeDelta: 0.18, longitudeDelta: 0.18 };
  }, [places, points]);
  const selectedVisits = selected ? visits.filter(v=>v.placeId===selected.id) : visits;
  const recentVisits = [...selectedVisits].sort((a, b) => b.arrival - a.arrival).slice(0, 8);

  const selectPlace=(place:Place,fromList=false)=>{
    setSelected(place);
    mapRef.current?.animateToRegion({latitude:place.latitude,longitude:place.longitude,latitudeDelta:0.006,longitudeDelta:0.006},350);
    if(fromList)scrollRef.current?.scrollTo({y:0,animated:true});
  };
  const saveName=async()=>{if(!selected||saving)return;setSaving(true);try{if(await renamePlace(selected.id,name))setEditing(false);}finally{setSaving(false);}};
  return <><Modal visible={editing} transparent animationType="fade" onRequestClose={()=>{if(!saving)setEditing(false);}}>
    <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
        <View style={styles.editor}><Text accessibilityRole="header" style={styles.detailName}>Rename place</Text>
          <Text style={styles.empty}>{selected?.name} · {selected?.latitude.toFixed(5)}, {selected?.longitude.toFixed(5)}. This name appears in your map, Insights, Wrapped and exports.</Text>
          <TextInput accessibilityLabel="Place name" style={styles.input} value={name} onChangeText={setName} maxLength={80} autoFocus editable={!saving} returnKeyType="done" onSubmitEditing={()=>{if(name.trim())void saveName();}} />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={saving} onPress={()=>setEditing(false)} style={styles.action}><Text style={styles.actionText}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{disabled:saving||!name.trim()}} disabled={saving||!name.trim()} onPress={()=>void saveName()} style={[styles.action,{opacity:saving||!name.trim()?0.5:1}]}><Text style={styles.actionText}>{saving?'Saving…':'Save name'}</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal><ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader eyebrow={demoMode ? 'Demo map' : 'Your map'} title="Where you’ve been" subtitle="Tap a saved-place pin or choose a place below. The selected pin turns pink." />
    <View style={styles.mapShell}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} key={String(demoMode)} initialRegion={region} userInterfaceStyle="dark" showsUserLocation={!demoMode && permission === 'granted'} showsCompass={false}>
        {points.slice(-200).map((point,i,tail)=>{const previous=tail[i-1];return previous && point.timestamp>previous.timestamp && point.session===previous.session && point.timestamp-previous.timestamp<=1200000 ? <Polyline key={point.id} coordinates={[previous,point]} strokeWidth={3} strokeColor={colors.cyan} /> : null;})}
        {places.map((place,index)=><Marker key={place.id} coordinate={{latitude:place.latitude,longitude:place.longitude}} title={`${index+1} · ${place.name}`} description="Select this place to view its details or rename it" pinColor={place.id===selected?.id?colors.pink:colors.purple} onPress={()=>selectPlace(place)} />)}
      </MapView>
      <View style={styles.mapBadge}><Text style={styles.mapBadgeText}>{places.length} places</Text></View>
    </View>

    <Text style={styles.empty}>{selected?`Pink pin: ${selected.name}. `:''}One pin per saved place. Route from the latest {Math.min(200,points.length)} GPS samples. Isolated samples and gaps are not connected.</Text>
    {selected ? <View style={styles.detailCard}>
      <View style={styles.detailTop}><View style={{flex:1,minWidth:0}}><Text style={styles.detailName}>{selected.name}</Text><Text style={styles.detailCategory}>{selected.category}</Text><Text selectable style={styles.detailCategory}>{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</Text></View><View style={styles.pin}><Text style={styles.pinText}>◎</Text></View></View>
      {!demoMode?<Pressable accessibilityRole="button" style={styles.action} onPress={()=>{setName(selected.name);setEditing(true);}}><Text style={styles.actionText}>Rename place</Text></Pressable>:<Text style={styles.empty}>Demo names are sample data. Switch to real history to rename your places.</Text>}
      <View style={styles.detailStats}>
        <MiniStat value={`${stats.placeVisitCounts[selected.id] ?? 0}`} label="visits" />
        <MiniStat value={formatDuration(stats.placeMinutes[selected.id] ?? 0)} label="estimated time" />
        <MiniStat value={formatLastVisit(selected.id, visits)} label="last" />
      </View>
    </View> : null}


    <SectionTitle title="Saved places" />
    <View style={styles.placeChoices}>{places.map((place,index)=><Pressable key={place.id} accessibilityRole="button" accessibilityState={{selected:place.id===selected?.id}} style={[styles.placeChoice,place.id===selected?.id&&{borderColor:colors.purple}]} onPress={()=>selectPlace(place,true)}><Text style={styles.actionText}>{index+1} · {place.name}</Text></Pressable>)}</View>
    {!places.length?<Text style={styles.empty}>A nearby set of location samples spanning at least two minutes can register a place. iOS delivery and GPS accuracy can delay detection.</Text>:null}
    <SectionTitle title={selected ? `Visits to ${selected.name}` : "Recent history"} />
    <Text style={styles.empty}>Latest {Math.min(8,selectedVisits.length)} of {selectedVisits.length} visits. GPS times are estimates. Gaps over five minutes and time after the last sample are not counted. Nearby venues can still be difficult to distinguish.</Text>
    <View style={styles.historyCard}>{recentVisits.map((visit, index) => {
      const place = places.find(p => p.id === visit.placeId);
      return <View key={visit.id} style={[styles.historyRow, index < recentVisits.length - 1 && styles.historyBorder]}>
        <View style={styles.timelineDot} />
        <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.historyName}>{place?.name ?? 'Location sample'}</Text>
          <Text style={styles.historyMeta}>{visit.source==='gps'?'Estimated time':'Imported duration'}: {formatDuration(visit.durationMinutes)}</Text>
          <Text style={styles.historyMeta}>{visit.source==='gps'?(visit.startEstimated?'Estimated arrival':'First sample'):'Arrival'}: {visitTime(visit.arrival)}</Text>
          <Text style={styles.historyMeta}>{visit.source==='gps'?(visit.endEstimated?'Estimated departure':'Last sample'):'Departure'}: {visitTime(visit.departure)}</Text>
          {(visit.uncertainMinutes??0)>0?<Text style={styles.historyMeta}>GPS gap: {formatDuration(visit.uncertainMinutes!)} excluded from total</Text>:null}
        </View>
      </View>;
    })}{recentVisits.length === 0 ? <Text style={styles.empty}>No visits detected yet. Enable recording or import history. Sparse samples may not contain enough evidence to identify a stay.</Text> : null}</View>
  </ScrollView></>;
}

function visitTime(time:number) { return new Date(time).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}); }

function MiniStat({ value, label }: { value: string; label: string }) { return <View><Text style={styles.miniValue}>{value}</Text><Text style={styles.miniLabel}>{label}</Text></View>; }
function formatLastVisit(placeId: string, visits: ReturnType<typeof useApp>['visits']) {
  const latest = [...visits].filter(v => v.placeId === placeId).sort((a, b) => b.arrival - a.arrival)[0];
  return latest ? new Date(latest.arrival).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
}

const styles = StyleSheet.create({
  modalOverlay:{flex:1,backgroundColor:'#000000BB'},
  modalContent:{flexGrow:1,justifyContent:'center',padding:24},
  editor:{backgroundColor:colors.surface,padding:20,borderRadius:24},
  input:{color:colors.text,borderColor:colors.border,borderWidth:1,borderRadius:12,padding:14,fontSize:18,minHeight:52},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:16},
  action:{minHeight:48,padding:12,justifyContent:'center',borderRadius:12,backgroundColor:colors.surface2,marginTop:8},
  actionText:{color:colors.text,fontSize:16,fontWeight:'700',flexShrink:1},
  placeChoices:{flexDirection:'row',flexWrap:'wrap',gap:8},
  placeChoice:{maxWidth:'100%',minHeight:48,padding:12,borderRadius:14,borderColor:colors.border,borderWidth:1,justifyContent:'center'},
  content: { padding: 20, paddingBottom: 28 },
  mapShell: { height: 390, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  mapBadge: { position: 'absolute', top: 14, left: 14, backgroundColor: '#09090BDD', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#FFFFFF20' },
  mapBadgeText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  detailCard: { marginTop: 14, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 20 },
  detailTop: { flexDirection: 'row', gap:12, justifyContent: 'space-between', alignItems: 'center' },
  detailName: { color: colors.text, fontSize: 24, fontWeight: '900' },
  detailCategory: { color: colors.muted, marginTop: 4, fontWeight: '700' },
  pin: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#EC489922', alignItems: 'center', justifyContent: 'center' },
  pinText: { color: colors.pink, fontSize: 26 },
  detailStats: { flexDirection: 'row', flexWrap:'wrap', gap:20, justifyContent: 'space-between', marginTop: 24, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  miniValue: { color: colors.text, fontWeight: '900', fontSize: 18 },
  miniLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  historyCard: { borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  historyRow: { minHeight: 74, paddingVertical:12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  timelineDot: { width: 10, height: 10, borderRadius: 10, backgroundColor: colors.cyan },
  historyName: { color: colors.text, fontWeight: '800', fontSize: 15 },
  historyMeta: { color: colors.muted, marginTop: 6, fontSize: 14, lineHeight: 21 },
  historyTime: { maxWidth:'28%', color: colors.muted, fontWeight: '700', fontSize: 12 },
  empty: { color: colors.muted, fontSize:16, padding: 20, lineHeight: 20 }
});
