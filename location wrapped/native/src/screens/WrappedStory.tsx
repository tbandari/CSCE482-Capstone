import { formatDuration } from '../utils/duration';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme';
import { useApp } from '../context/AppContext';
import { PlaceCategory } from '../types';


export function WrappedStory({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { if (visible) setIndex(0); }, [visible]);
  const { stats, places, demoMode } = useApp();
  const shareRef = useRef<React.ElementRef<typeof ViewShot>>(null);
  const topPlaces = useMemo(() => places.filter(p => (stats.placeVisitCounts[p.id] ?? 0) > 0).sort((a, b) => (stats.placeMinutes[b.id] ?? 0) - (stats.placeMinutes[a.id] ?? 0)).slice(0, 5), [places, stats.placeMinutes]);
  const totalCategory = Math.max(1, Object.values(stats.categoryMinutes).reduce((a, b) => a + b, 0));

  const next = () => index < 9 ? setIndex(index + 1) : onClose();
  const prev = () => setIndex(Math.max(0,index - 1));
  const share = async () => {
    try { const uri = await shareRef.current?.capture?.(); if (!uri || !await Sharing.isAvailableAsync()) throw Error('Share unavailable'); await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Location Wrapped' }); } catch { Alert.alert('Sharing failed','Please try again.'); }
  };

  const slides: React.ReactNode[] = [
    <StoryBase key="intro" colors={['#4C1D95', '#BE185D', '#09090B']} kicker="LOCATION WRAPPED · ALL HISTORY"><View style={styles.centerGraphic}><Text style={styles.bigGlyph}>◎</Text></View><Text style={styles.bigTitle}>Your life had a map.</Text><Text style={styles.body}>Here are the places that made it yours.</Text></StoryBase>,
    <StoryBase key="places" colors={['#071A28', '#123C4A', '#09090B']} kicker="PLACES VISITED"><Text style={styles.mega}>{stats.placesVisited}</Text><Text style={styles.bigTitle}>places made up your story.</Text><Text style={styles.body}>Some were routines. Some were one-time detours. All of them became part of the story.</Text></StoryBase>,
    <StoryBase key="distance" colors={['#11250B', '#315B18', '#09090B']} kicker="RECORDED DISTANCE"><Text style={styles.mega}>{Math.round(stats.distanceMiles)}</Text><Text style={styles.unit}>MILES</Text><View style={styles.routeLine}><View style={styles.routeDot} /><View style={styles.routeStroke} /><View style={styles.routeDot} /></View><Text style={styles.bigTitle}>You kept moving.</Text></StoryBase>,
    <StoryBase key="top" colors={['#2B102D', '#7A173E', '#09090B']} kicker="MOST VISITED PLACE"><Text style={styles.placeHero}>{stats.topPlace?.name ?? 'Still discovering'}</Text><Text style={styles.body}>{stats.topPlaceVisits} visits · {formatDuration(stats.topPlaceMinutes)} spent here</Text><View style={styles.halo}><Text style={styles.haloText}>⌖</Text></View></StoryBase>,
    <StoryBase key="five" colors={['#10192F', '#272264', '#09090B']} kicker="TOP FIVE"><Text style={styles.bigTitle}>Your top places by time.</Text><View style={styles.ranking}>{topPlaces.length===0?<Text style={styles.body}>Add recorded visits to see your top places.</Text>:null}{topPlaces.map((p, i) => <View key={p.id} style={styles.rankRow}><Text style={styles.rankNo}>{i + 1}</Text><View style={{ flex: 1 }}><Text style={styles.rankName}>{p.name}</Text><Text style={styles.rankMeta}>{stats.placeVisitCounts[p.id] ?? 0} visits</Text></View><Text style={styles.rankHours}>{formatDuration(stats.placeMinutes[p.id] ?? 0)}</Text></View>)}</View></StoryBase>,
    <StoryBase key="time" colors={['#092C2B', '#0B5B50', '#09090B']} kicker="YOUR TIME"><Text style={styles.bigTitle}>Where your hours went.</Text>{stats.trackedMinutes===0?<Text style={styles.body}>Record or import visits to see where your time went.</Text>:null}<View style={styles.categoryGrid}>{(Object.entries(stats.categoryMinutes) as [PlaceCategory, number][]).filter(([, m]) => m > 0).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([cat, min]) => <View key={cat} style={styles.categoryBox}><Text style={styles.categoryPct}>{Math.round(min / totalCategory * 100)}%</Text><Text style={styles.categoryName}>{cat}</Text></View>)}</View></StoryBase>,
    <StoryBase key="month" colors={['#341604', '#8A3F08', '#09090B']} kicker="BUSIEST MONTH"><Text style={styles.megaWord}>{stats.mostActiveMonth}</Text><Text style={styles.bigTitle}>{stats.visits ? 'had the most recorded visits.' : 'Your patterns are still taking shape.'}</Text><Text style={styles.body}>Calendar months combined across all recorded years.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={styles.monthBars}>{stats.monthlyVisits.map((n,i)=><View key={i} style={styles.monthColumn} accessibilityLabel={`${new Date(2026,i,1).toLocaleDateString(undefined,{month:'long'})}: ${n} visits`}><View style={[styles.monthBar,{height:4+n/Math.max(1,...stats.monthlyVisits)*110}]} /><Text style={styles.monthLabel}>{'JFMAMJJASOND'[i]}</Text></View>)}</View></ScrollView></StoryBase>,
    <StoryBase key="explore" colors={['#141234', '#3B1D72', '#09090B']} kicker="EXPLORATION"><Text style={styles.bigTitle}>Familiar, with room for surprise.</Text><View style={styles.duo}><View><Text style={styles.duoBig}>{stats.newPlaces}</Text><Text style={styles.duoLabel}>visited once</Text></View><View><Text style={styles.duoBig}>{stats.repeatPlaces}</Text><Text style={styles.duoLabel}>repeat places</Text></View></View><Text style={styles.body}>Counts describe your recorded history, not first-ever visits.</Text></StoryBase>,
    <StoryBase key="personality" colors={['#271039', '#671B69', '#09090B']} kicker="YOUR MOVEMENT PERSONALITY"><Text style={styles.spark}>✦</Text><Text style={styles.personality}>{stats.personality}</Text><Text style={styles.body}>A title based on your mix of distance, variety, and repeat routines.</Text></StoryBase>,
    <ScrollView key="share" contentContainerStyle={{padding:16}}><ViewShot ref={shareRef} options={{ format: 'png', quality: 1 }} style={{width:'100%'}}><LinearGradient colors={['#5B21B6', '#DB2777', '#F97316']} style={styles.shareCard}><Text style={styles.shareBrand}>LOCATION WRAPPED{demoMode?' · DEMO':''}</Text><Text style={styles.shareYear}>All recorded history</Text><Text style={styles.shareStatement}>My story,{'\n'}in motion.</Text><View style={styles.shareStats}><ShareStat value={`${stats.placesVisited}`} label="PLACES" /><ShareStat value={`${Math.round(stats.distanceMiles)}`} label="RECORDED MILES" /><ShareStat value={`${stats.visits}`} label="VISITS" /><ShareStat value={stats.favoriteCategory.toUpperCase()} label="FAVORITE" /></View><View style={styles.shareBottom}><Text style={styles.shareTopLabel}>MOST VISITED PLACE</Text><Text style={styles.shareTopPlace}>{stats.topPlace?.name ?? 'Still discovering'}</Text><Text style={styles.sharePersonality}>{stats.personality}</Text></View></LinearGradient></ViewShot><Text style={styles.shareNotice}>This card includes your top place name. Review it before sharing.</Text><Pressable accessibilityRole="button" style={styles.shareButton} onPress={share}><Text style={styles.shareButtonText}>Share my Wrapped</Text></Pressable></ScrollView>
  ];

  return <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.progress}>{slides.map((_, i) => <View key={i} style={[styles.progressTrack, { backgroundColor:i<=index?'#fff':'#ffffff40' }]} />)}</View>
        <View style={styles.headerRow}><Text style={styles.hint}>{demoMode?'DEMO · ':''}ALL HISTORY</Text><Pressable accessibilityRole="button" accessibilityLabel="Close story" style={styles.close} onPress={onClose}><Text style={styles.closeText}>×</Text></Pressable></View>
      </View>
      <View style={{flex:1}} key={index}>{slides[index]}</View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous story" disabled={index===0} style={[styles.navButton,{opacity:index===0?.35:1}]} onPress={prev}><Text style={styles.navText}>‹</Text></Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.hint}>{index+1} / {slides.length}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={index===9?'Finish story':'Next story'} style={styles.navButton} onPress={next}><Text style={styles.navText}>{index===9?'✓':'›'}</Text></Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

function StoryBase({ colors: gradient, kicker, children }: { colors: [string,string,string]; kicker: string; children: React.ReactNode }) {
  return <LinearGradient colors={gradient} style={styles.story}><ScrollView contentContainerStyle={styles.storyBody}><Text style={styles.kicker}>{kicker}</Text>{children}</ScrollView></LinearGradient>;
}

function ShareStat({ value, label }: { value: string; label: string }) { return <View style={styles.shareStat}><Text adjustsFontSizeToFit numberOfLines={2} minimumFontScale={0.65} style={styles.shareStatValue}>{value}</Text><Text style={styles.shareStatLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' }, story: { flex: 1 },
  kicker: { color: '#FFFFFFBB', fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginBottom:24 }, storyBody: { flexGrow: 1, padding:24, justifyContent: 'center' },
  bigTitle: { color: '#fff', fontSize: 36, lineHeight: 42, fontWeight: '900', letterSpacing: -1.7 }, body: { color: '#FFFFFFC7', fontSize: 17, lineHeight: 25, marginTop: 16, maxWidth: 330 },
  mega: { color: '#fff', fontSize: 76, fontWeight: '900', letterSpacing: -2, lineHeight: 86 }, unit: { color: colors.lime, fontSize: 16, fontWeight: '900', letterSpacing: 5, marginBottom: 28 },
  centerGraphic: { width: 180, height: 180, borderRadius: 100, borderWidth: 1, borderColor: '#FFFFFF44', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 55 }, bigGlyph: { color: '#fff', fontSize: 86 },
  routeLine: { flexDirection: 'row', alignItems: 'center', marginVertical: 40 }, routeDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: colors.lime }, routeStroke: { height: 2, flex: 1, backgroundColor: '#FFFFFF55' },
  placeHero: { color: '#fff', fontSize: 38, lineHeight: 44, fontWeight: '900', letterSpacing: -2 }, halo: { width: 190, height: 190, borderRadius: 100, borderWidth: 1, borderColor: '#FFFFFF33', alignItems: 'center', justifyContent: 'center', marginTop: 28, alignSelf: 'center' }, haloText: { color: '#fff', fontSize: 80 },
  ranking: { marginTop: 30, borderTopWidth: 1, borderTopColor: '#FFFFFF30' }, rankRow: { minHeight: 70, paddingVertical:12, borderBottomWidth: 1, borderBottomColor: '#FFFFFF22', flexDirection: 'row', alignItems: 'center', gap: 14 }, rankNo: { color: '#FFFFFF75', width: 22, fontWeight: '900' }, rankName: { color: '#fff', fontSize: 16, fontWeight: '900' }, rankMeta: { color: '#FFFFFF88', fontSize: 12, marginTop: 3 }, rankHours: { maxWidth:'28%', color: '#fff', fontWeight: '900' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 32 }, categoryBox: { flexGrow:1, flexBasis:130, minWidth:0, backgroundColor: '#FFFFFF12', borderWidth: 1, borderColor: '#FFFFFF25', borderRadius: 20, padding: 18, minHeight: 108 }, categoryPct: { color: '#fff', fontSize: 30, fontWeight: '900' }, categoryName: { color: '#FFFFFFB5', fontWeight: '700', marginTop: 8 },
  megaWord: { color: '#fff', fontSize: 42, lineHeight: 48, fontWeight: '900', letterSpacing: -2.5 }, monthBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 28, paddingBottom:8 }, monthColumn:{width:18,alignItems:'center',gap:8},monthLabel:{fontSize:12,color:'#ffffffcc'},monthBar: { width:18, backgroundColor: '#FFFFFF75', borderRadius: 8 },
  duo: { flexDirection: 'row', flexWrap:'wrap', gap:24, marginVertical:28 }, duoBig: { color: '#fff', fontWeight: '900', fontSize: 48, letterSpacing: -1 }, duoLabel: { color: '#FFFFFF99', fontWeight: '800' },
  spark: { color: '#fff', fontSize: 66, marginBottom: 30 }, personality: { color: '#fff', fontWeight: '900', fontSize: 42, lineHeight: 48, letterSpacing: -2.5 },
  header: {paddingHorizontal:18,paddingTop:10}, headerRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingVertical:8},
  progress: {flexDirection:'row',gap:4}, progressTrack:{flex:1,height:3,borderRadius:2},
  close:{width:48,height:48,borderRadius:24,backgroundColor:'#ffffff18',alignItems:'center',justifyContent:'center'}, closeText:{color:'#fff',fontSize:30},
  hint:{color:'#ffffffbb',fontSize:14,flexShrink:1}, controls:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:24,paddingVertical:12},
  navButton:{minWidth:48,minHeight:48,borderRadius:24,backgroundColor:'#ffffff18',alignItems:'center',justifyContent:'center'},navText:{color:'#fff',fontSize:30},
  shareCard: {padding:24,borderRadius:24,overflow:'hidden'}, shareBrand: { color: '#FFFFFFC8', fontSize: 12, letterSpacing: 2, fontWeight: '900' }, shareYear: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 4 }, shareStatement: { color: '#fff', fontSize: 42, lineHeight: 48, fontWeight: '900', letterSpacing: -3, marginTop: 28 },
  shareStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 }, shareStat: { flexGrow:1, flexBasis:120, minWidth:0, minHeight: 100, padding: 15, borderRadius: 20, backgroundColor: '#FFFFFF18', borderWidth: 1, borderColor: '#FFFFFF28' }, shareStatValue: { color: '#fff', fontWeight: '900', fontSize: 28 }, shareStatLabel: { color: '#FFFFFFA5', fontSize: 12, letterSpacing: 1.2, fontWeight: '800', marginTop: 7 },
  shareBottom: { marginTop:28 }, shareTopLabel: { color: '#FFFFFF8F', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 }, shareTopPlace: { color: '#fff', fontSize: 27, fontWeight: '900', marginTop: 5 }, sharePersonality: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '800' },
  shareNotice:{color:colors.muted,fontSize:14,lineHeight:21,marginTop:16},
  shareButton:{backgroundColor:'#fff',borderRadius:18,minHeight:54,padding:16,marginTop:16,alignItems:'center',justifyContent:'center'},shareButtonText:{color:'#2D123A',fontWeight:'900',fontSize:16,textAlign:'center'}
});
