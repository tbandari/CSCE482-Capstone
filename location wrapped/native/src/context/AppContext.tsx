import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {DOMParser} from '@xmldom/xmldom';
import React,{createContext,useContext,useEffect,useRef,useState,useMemo} from 'react';
import {Alert,AppState} from 'react-native';
import {LocationPoint,Place,Visit,WrappedStats} from '../types';
import {prepare,stats as computeStats,demo} from '../shared/core';
import {parseImport,mergeData} from '../shared/import';
import {Data,renameSavedPlace,readData,replaceData,appendPoints,getMeta,setMeta,migrateLegacy,discardLegacy,legacyRecovery} from '../services/storage';
import {startBackground,stopBackground,trackingStatus} from '../services/tracking';
import {exportLocationData,exportRecoveryText} from '../utils/export';
const initial:Data={points:[],visits:[],places:[]};
type Health={lastReceived:number;lastSaved:number;rejectedAccuracy:number;recordingStarted:number;error:string;checkedAt:number};
type Value={loading:boolean;onboardingComplete:boolean;demoMode:boolean;tracking:boolean;permission:string;points:LocationPoint[];visits:Visit[];places:Place[];realCounts:{points:number;visits:number;places:number};health:Health;stats:WrappedStats;storageError:string|null;renamePlace:(id:string,name:string)=>Promise<boolean>;finishOnboarding:()=>void;setDemoMode:(v:boolean)=>void;startTracking:()=>Promise<void>;stopTracking:()=>Promise<void>;captureCurrentLocation:()=>Promise<void>;clearRealData:()=>Promise<void>;importData:()=>Promise<void>;exportData:()=>Promise<void>;exportDemo:()=>Promise<void>;retryStorage:()=>Promise<void>;resetLegacy:()=>Promise<void>;exportRecovery:()=>Promise<void>};
const Context=createContext<Value|null>(null);
function confirm(title:string,message:string,accept:string){return new Promise<boolean>(resolve=>Alert.alert(title,message,[{text:'Cancel',style:'cancel',onPress:()=>resolve(false)},{text:accept,onPress:()=>resolve(true)}],{cancelable:false}));}
export function AppProvider({children}:{children:React.ReactNode}){
 const [loading,setLoading]=useState(true),[onboardingComplete,setOnboarding]=useState(false),[demoMode,setDemo]=useState(true),[tracking,setTracking]=useState(false),[permission,setPermission]=useState('unknown'),[real,setReal]=useState<Data>(initial),[storageError,setStorageError]=useState<string|null>(null);
 const [health,setHealth]=useState<Health>({lastReceived:0,lastSaved:0,rejectedAccuracy:0,recordingStarted:0,error:'',checkedAt:Date.now()});
 const busy=useRef(false), revision=useRef<string|null>(null), reloading=useRef<Promise<void>|null>(null);
 const reload=()=>{
  if(reloading.current)return reloading.current;
  reloading.current=(async()=>{
   try{
    // Reading the revision before the data ensures a concurrent write is caught on the next poll.
    const nextRevision=await getMeta('dataRevision','0');
    if(revision.current!==nextRevision){setReal(await readData());revision.current=nextRevision;}
    const [lastReceived,lastSaved,rejectedAccuracy,recordingStarted,error]=await Promise.all(['lastReceived','lastSaved','rejectedAccuracy','recordingStarted','trackingError'].map(k=>getMeta(k)));
    setHealth({lastReceived:Number(lastReceived),lastSaved:Number(lastSaved),rejectedAccuracy:Number(rejectedAccuracy),recordingStarted:Number(recordingStarted),error:error||'',checkedAt:Date.now()});
    setStorageError(null);
   }catch{setStorageError('Saved data could not be loaded. It has not been overwritten. Try again.');return;}
   try{setTracking(await trackingStatus());setPermission((await Location.getForegroundPermissionsAsync()).status);}
   catch{setTracking(false);setPermission('unavailable');setHealth(h=>({...h,error:'Recording status could not be checked. Check location permissions and retry.'}));}
  })().finally(()=>{reloading.current=null;});
  return reloading.current;
 };
 const retryStorage=async()=>{try{await migrateLegacy();setDemo(await getMeta('demo','true')==='true');setOnboarding(await getMeta('onboarding')==='true');revision.current=null;await reload();}catch{setStorageError('Saved data could not be opened. It has not been overwritten. Retry, or export the older app’s recovery file.');}finally{setLoading(false);}};
 useEffect(()=>{void retryStorage();const sub=AppState.addEventListener('change',v=>{if(v==='active')void reload();});const interval=setInterval(()=>{if(AppState.currentState==='active')void reload();},15000);return()=>{sub.remove();clearInterval(interval);};},[]);
 const run=async(action:()=>Promise<void>)=>{if(busy.current)return;busy.current=true;try{await action();}catch(e){Alert.alert('Could not complete action',e instanceof Error?e.message:'Please try again.');}finally{await reload();busy.current=false;}};
 const renamePlace=async(id:string,name:string)=>{
  if(busy.current)return false;
  if(demoMode){Alert.alert('Sample place','Turn off demo mode to rename your real saved places.');return false;}
  busy.current=true;
  try{await renameSavedPlace(id,name);if(reloading.current)await reloading.current;await reload();return true;}
  catch(e){Alert.alert('Could not rename place',e instanceof Error?e.message:'Please try again.');return false;}
  finally{busy.current=false;}
 };
 const stopTracking=()=>run(stopBackground);
 const startTracking=()=>run(async()=>{await startBackground();await setMeta('demo','false');setDemo(false);});
 const finishOnboarding=()=>{void run(async()=>{await setMeta('onboarding','true');setOnboarding(true);});};
 const setDemoMode=(v:boolean)=>{void run(async()=>{if(v){if(await trackingStatus()&&!await confirm('Pause recording for demo?','Demo mode pauses real recording. Your saved real history will remain on this device.','Use demo'))return;await stopBackground();}await setMeta('demo',String(v));setDemo(v);});};
 const captureCurrentLocation=()=>run(async()=>{const auth=await Location.requestForegroundPermissionsAsync();if(auth.status!=='granted')throw Error('Allow location access, or import a history file.');const p=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});if(p.coords.accuracy!=null&&p.coords.accuracy>120)throw Error('This fix is too imprecise to save. Turn on Precise Location in iPhone Settings for Location Wrapped, then try again outdoors.');const active=await trackingStatus();await appendPoints([{id:`capture-${p.timestamp}`,latitude:p.coords.latitude,longitude:p.coords.longitude,timestamp:p.timestamp,accuracy:p.coords.accuracy,session:active?await getMeta('session'):`capture-${p.timestamp}`}]);await setMeta('demo','false');setDemo(false);Alert.alert('Location saved','This point is saved in your history. The map draws connected route segments; an isolated point does not draw a line or establish a visit.');});
 const clearRealData=()=>run(async()=>{await stopBackground();await replaceData(initial);await discardLegacy();for(const key of ['trackingError','lastReceived','lastSaved','rejectedAccuracy','recordingStarted'])await setMeta(key,'');});
 const importData=()=>run(async()=>{
  const result=await DocumentPicker.getDocumentAsync({type:['application/json','application/gpx+xml','application/xml','text/xml','public.xml','public.json'],copyToCacheDirectory:true});
  if(result.canceled)return;const file=result.assets[0];if(!file)return;
  let text:string;
  try{if((file.size||0)>15_000_000)throw Error('Choose a file smaller than 15 MB.');text=await FileSystem.readAsStringAsync(file.uri);}
  finally{if(FileSystem.cacheDirectory&&file.uri.startsWith(FileSystem.cacheDirectory))await FileSystem.deleteAsync(file.uri,{idempotent:true});}
  const parsed=parseImport(text,DOMParser);
  if(!parsed.data.points.length&&!parsed.data.visits.length)throw Error('The file contains no location history.');
  if(!await confirm('Add imported history?',`Merge ${parsed.data.points.length} GPS points and ${parsed.data.visits.length} visits with your real saved data. Duplicates will be combined. Recording will pause during the merge; you can resume afterward.${parsed.skipped?` ${parsed.skipped} untimed or invalid points were skipped.`:''}`,'Import'))return;
  const wasTracking=await trackingStatus();
  try{
   await stopBackground();const merged=mergeData(await readData(),parsed.data) as Data;await replaceData(merged);await setMeta('demo','false');setDemo(false);
  }finally{
   if(wasTracking&&await confirm('Resume recording?','The import attempt has finished. Recording is paused. Resume background recording now?','Resume'))await startBackground();
  }
  Alert.alert('History imported','Your previous history was kept. Sparse GPS samples may not contain enough evidence to estimate visit durations.');
 });
 const realPrepared=useMemo(()=>prepare(real) as Data,[real]);
 const current=useMemo(()=>demoMode?prepare(demo()) as Data:realPrepared,[demoMode,realPrepared]);
 const realCounts=useMemo(()=>({points:real.points.length,visits:realPrepared.visits.length,places:realPrepared.places.length}),[real,realPrepared]);
 const raw=useMemo(()=>computeStats(current),[current]);const stats:WrappedStats={placesVisited:raw.places,visits:raw.visits,distanceMiles:raw.distance,topPlace:raw.ranked[0],topPlaceVisits:raw.ranked[0]?raw.counts[raw.ranked[0].id]:0,topPlaceMinutes:raw.ranked[0]?raw.minutes[raw.ranked[0].id]:0,favoriteCategory:(Object.entries(raw.categoryMinutes).sort((a,b)=>Number(b[1])-Number(a[1]))[0]?.[0]||'Other') as any,mostActiveMonth:raw.month,newPlaces:raw.once,repeatPlaces:raw.repeat,trackedMinutes:raw.hours*60,personality:raw.personality,categoryMinutes:raw.categoryMinutes,placeVisitCounts:raw.counts,placeMinutes:raw.minutes,monthlyVisits:raw.months};
 return <Context.Provider value={{loading,onboardingComplete,demoMode,tracking,permission,...current,realCounts,health,stats,storageError,renamePlace,finishOnboarding,setDemoMode,startTracking,stopTracking,captureCurrentLocation,clearRealData,importData,exportData:()=>run(async()=>{await exportLocationData(await readData());}),exportDemo:()=>run(async()=>{await exportLocationData(demo() as Data,true);}),retryStorage,resetLegacy:()=>run(async()=>{await discardLegacy();await retryStorage();}),exportRecovery:()=>run(async()=>{const raw=await legacyRecovery();if(!raw)throw Error('No legacy recovery file was found.');await exportRecoveryText(raw);})}}>{children}</Context.Provider>;
}
export function useApp(){const value=useContext(Context);if(!value)throw Error('AppProvider missing');return value;}
