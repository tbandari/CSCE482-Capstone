import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationPoint, Place, Visit } from '../types';
import { validateData, prepare } from '../shared/core';
export type Data={points:LocationPoint[];visits:Visit[];places:Place[]};
let database:Promise<SQLite.SQLiteDatabase>|null=null;
async function open(){const db=await SQLite.openDatabaseAsync('location-wrapped.db');await db.execAsync(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS points (key TEXT PRIMARY KEY, timestamp REAL NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS points_time ON points(timestamp); CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);return db;}
export function getDB(){if(!database)database=open().catch(e=>{database=null;throw e;});return database;}
export async function getMeta(key:string,fallback=''){const db=await getDB();return (await db.getFirstAsync<{value:string}>('SELECT value FROM meta WHERE key=?',key))?.value??fallback;}
export async function setMeta(key:string,value:string){const db=await getDB();await db.runAsync('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)',key,value);}
export async function readData():Promise<Data>{const db=await getDB();const [points,visits,places]=await Promise.all([db.getAllAsync<{data:string}>('SELECT data FROM points ORDER BY timestamp'),db.getAllAsync<{data:string}>('SELECT data FROM visits'),db.getAllAsync<{data:string}>('SELECT data FROM places')]);return {points:points.map(r=>JSON.parse(r.data)),visits:visits.map(r=>JSON.parse(r.data)),places:places.map(r=>JSON.parse(r.data))};}
const pointKey=(p:LocationPoint)=>`${p.timestamp}|${p.latitude}|${p.longitude}`;
// Revision and diagnostics are committed with the points they describe.
async function bumpRevision(tx:SQLite.SQLiteDatabase){await tx.runAsync("INSERT INTO meta(key,value) VALUES('dataRevision','1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1");}
export async function appendPoints(points:LocationPoint[],requireTracking=false){
 const db=await getDB();
 await db.withExclusiveTransactionAsync(async tx=>{
  if(requireTracking&&(await tx.getFirstAsync<{value:string}>('SELECT value FROM meta WHERE key=?','tracking'))?.value!=='true')return;
  const currentSession=(await tx.getFirstAsync<{value:string}>('SELECT value FROM meta WHERE key=?','session'))?.value;
  const previousRow=requireTracking?await tx.getFirstAsync<{data:string}>('SELECT data FROM points ORDER BY timestamp DESC LIMIT 1'):null;
  let previous:LocationPoint|undefined=previousRow?JSON.parse(previousRow.data):undefined;
  let changed=false, rejected=0, lastReceived=0, lastSaved=0;
  for(const p of [...points].sort((a,b)=>a.timestamp-b.timestamp)){
   if(!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180||!Number.isFinite(p.timestamp)||p.timestamp<0||p.timestamp>8640000000000000)continue;
   lastReceived=Math.max(lastReceived,p.timestamp);
   if(p.accuracy!=null&&(!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>120)){rejected++;continue;}
   const stored=requireTracking?{...p,session:currentSession}:p;
   // Keep at most one background fix per 30 seconds in a session. This bounds
   // database growth without depending on iOS delivering on an exact timer.
   if(requireTracking&&previous&&previous.session===stored.session&&p.timestamp>=previous.timestamp&&p.timestamp-previous.timestamp<30000)continue;
   const result=await tx.runAsync('INSERT OR IGNORE INTO points(key,timestamp,data) VALUES(?,?,?)',pointKey(p),p.timestamp,JSON.stringify(stored));
   if(result.changes){changed=true;lastSaved=Math.max(lastSaved,p.timestamp);previous=stored;}
  }
  if(changed)await bumpRevision(tx);
  for(const [key,value] of [['lastReceived',lastReceived],['lastSaved',lastSaved]] as const){if(value)await tx.runAsync("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=MAX(CAST(value AS INTEGER),CAST(excluded.value AS INTEGER))",key,String(value));}
  if(rejected)await tx.runAsync("INSERT INTO meta(key,value) VALUES('rejectedAccuracy',?) ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+CAST(excluded.value AS INTEGER)",String(rejected));
 });
}
export async function replaceData(data:Data){const db=await getDB();await db.withExclusiveTransactionAsync(async tx=>{await tx.execAsync('DELETE FROM points; DELETE FROM visits; DELETE FROM places;');for(const p of data.points)await tx.runAsync('INSERT OR IGNORE INTO points(key,timestamp,data) VALUES(?,?,?)',pointKey(p),p.timestamp,JSON.stringify(p));for(const v of data.visits)await tx.runAsync('INSERT OR REPLACE INTO visits(id,data) VALUES(?,?)',v.id,JSON.stringify(v));for(const p of data.places)await tx.runAsync('INSERT OR REPLACE INTO places(id,data) VALUES(?,?)',p.id,JSON.stringify(p));await bumpRevision(tx);});}
export async function migrateLegacy(){if(await getMeta('legacyMigrated')==='true')return;const raw=await AsyncStorage.getItem('location-wrapped-v1');if(raw){const saved=JSON.parse(raw);const old=validateData({points:saved.realPoints||[]}) as Data;const existing=await readData();if(!existing.points.length&&!existing.visits.length)await replaceData(old);await setMeta('onboarding',saved.onboardingComplete?'true':'false');await setMeta('demo',saved.demoMode===false?'false':'true');}await setMeta('legacyMigrated','true');}
export async function discardLegacy(){await AsyncStorage.removeItem('location-wrapped-v1');await setMeta('legacyMigrated','true');}
export async function legacyRecovery(){return await AsyncStorage.getItem('location-wrapped-v1');}

// Persist a derived place as a named anchor without replacing GPS history.
export async function renameSavedPlace(id:string,input:string){
 const name=input.trim().replace(/\s+/g,' ');
 if(!name||name.length>80)throw Error('Enter a place name between 1 and 80 characters.');
 const db=await getDB();
 await db.withExclusiveTransactionAsync(async tx=>{
  const rows=await tx.getAllAsync<{data:string}>('SELECT data FROM places');
  const places=rows.map(row=>JSON.parse(row.data)) as Place[];
  let place=places.find(p=>p.id===id);
  if(!place){
   const points=(await tx.getAllAsync<{data:string}>('SELECT data FROM points ORDER BY timestamp')).map(row=>JSON.parse(row.data));
   const visits=(await tx.getAllAsync<{data:string}>('SELECT data FROM visits')).map(row=>JSON.parse(row.data));
   place=(prepare({points,visits,places}) as Data).places.find(p=>p.id===id);
  }
  if(!place)throw Error('This place is no longer in your history. Reopen the map and try again.');
  await tx.runAsync('INSERT OR REPLACE INTO places(id,data) VALUES(?,?)',id,JSON.stringify({...place,name}));
  await bumpRevision(tx);
 });
}
