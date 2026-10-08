import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { LocationPoint, Place, Visit } from '../types';
async function shareTemporaryJSON(text:string,name:string,title:string){
 if(!FileSystem.cacheDirectory||!await Sharing.isAvailableAsync())throw Error('Sharing is unavailable on this device.');
 const uri=`${FileSystem.cacheDirectory}${name}-${Date.now()}.json`;
 try{await FileSystem.writeAsStringAsync(uri,text);await Sharing.shareAsync(uri,{mimeType:'application/json',dialogTitle:title});}
 finally{try{await FileSystem.deleteAsync(uri,{idempotent:true});}catch{throw Error('The temporary export could not be removed from the app cache. Your saved history is unchanged.');}}
}
export async function exportLocationData(data:{points:LocationPoint[];visits:Visit[];places:Place[]},sample=false){
 await shareTemporaryJSON(JSON.stringify({exportedAt:new Date().toISOString(),sampleData:sample,...data},null,2),sample?'location-wrapped-SAMPLE':'location-wrapped-export',sample?'Export sample data':'Export real location history');
}
export async function exportRecoveryText(text:string){await shareTemporaryJSON(text,'location-wrapped-recovery','Export recovery file');}
