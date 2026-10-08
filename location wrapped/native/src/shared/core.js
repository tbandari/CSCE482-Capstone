export const categories=['Home','School','Work','Food','Shopping','Fitness','Entertainment','Outdoors','Travel','Other'];
export const accents={Home:'#a78bfa',School:'#47d7ff',Work:'#ff8a3d',Food:'#f472b6',Shopping:'#fbbf24',Fitness:'#b7f34a',Entertainment:'#c4b5fd',Outdoors:'#62e6a5',Travel:'#60a5fa',Other:'#a2a2ad'};
export function miles(a,b){const r=Math.PI/180,h=Math.sin((b.latitude-a.latitude)*r/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin((b.longitude-a.longitude)*r/2)**2;return 7917.6*Math.asin(Math.sqrt(Math.min(1,h)));}
const coord=p=>p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
const stamp=v=>typeof v==='number'?v:Date.parse(v);
export function validateData(input){
 const raw=Array.isArray(input)?{points:input}:input;if(!raw||typeof raw!=='object')throw Error('Choose a Location Wrapped JSON export or an array of location points.');
 const points=raw.points??raw.realPoints??[],visits=raw.visits??[],places=raw.places??[];
 if(!Array.isArray(points)||!Array.isArray(visits)||!Array.isArray(places))throw Error('Points, visits and places must be arrays.');
 if(points.length>50000||visits.length>15000||places.length>5000)throw Error('This file is too large. Import up to 50,000 points, 15,000 visits and 5,000 places.');
 const out={points:[],visits:[],places:[]};
 for(const [i,p]of points.entries()){const timestamp=stamp(p?.timestamp);if(!coord(p)||!Number.isFinite(timestamp)||timestamp<0||timestamp>8640000000000000)throw Error(`Location point ${i+1} needs valid latitude, longitude and timestamp.`);out.points.push({id:`point-${i}-${timestamp}`,latitude:p.latitude,longitude:p.longitude,timestamp,accuracy:Number.isFinite(p.accuracy)&&p.accuracy>=0?p.accuracy:null,session:typeof p.session==='string'?p.session:undefined});}
 for(const [i,p]of places.entries()){if(!coord(p)||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!p.name.trim())throw Error(`Place ${i+1} is invalid.`);if(out.places.some(x=>x.id===p.id))throw Error('Place IDs must be unique.');out.places.push({id:p.id,name:p.name.trim().slice(0,80),category:categories.includes(p.category)?p.category:'Other',latitude:p.latitude,longitude:p.longitude});}
 for(const [i,v]of visits.entries()){const arrival=stamp(v?.arrival),departure=stamp(v?.departure);if(!coord(v)||!Number.isFinite(arrival)||!Number.isFinite(departure)||arrival<0||departure>8640000000000000||departure<=arrival)throw Error(`Visit ${i+1} needs coordinates and a departure after arrival.`);out.visits.push({id:`visit-${i}-${arrival}`,latitude:v.latitude,longitude:v.longitude,arrival,departure,durationMinutes:(departure-arrival)/60000,placeId:out.places.some(p=>p.id===v.placeId)?v.placeId:undefined});}
 out.points.sort((a,b)=>a.timestamp-b.timestamp);out.points=out.points.filter((p,i,a)=>!i||p.timestamp!==a[i-1].timestamp||p.latitude!==a[i-1].latitude||p.longitude!==a[i-1].longitude);
 out.visits=normalizeVisits(out.visits);return out;
}
// Derive estimates from evidence, never from the current clock. Keep long gaps
// visible, but do not add them to time spent. Raw points remain unchanged.
export function deriveVisits(points) {
 const sorted=[...points].filter(p=>coord(p)&&Number.isFinite(p.timestamp)).sort((a,b)=>a.timestamp-b.timestamp);
 const visits=[];let cluster=[],before=null,lastRaw=null;
 const accuracy=p=>Number.isFinite(p?.accuracy)&&p.accuracy>=0?p.accuracy:50;
 const usable=p=>accuracy(p)<=100;
 const nearby=(a,b)=>miles(a,b)*1609.344<=75+Math.min(25,(accuracy(a)+accuracy(b))/4);
 const edge=(a,b)=>a&&b&&a.session===b.session&&accuracy(a)<=40&&accuracy(b)<=40&&b.timestamp>a.timestamp&&b.timestamp-a.timestamp<=120000?(b.timestamp-a.timestamp)/2:0;
 function flush(after=null) {
  if(cluster.length<2)return;
  const first=cluster[0],last=cluster.at(-1);let counted=0,uncertain=0,run=0,longestRun=0;
  for(let i=1;i<cluster.length;i++){
   const dt=cluster[i].timestamp-cluster[i-1].timestamp;
   if(dt>300000){uncertain+=dt;run=0;}else{counted+=dt;run+=dt;longestRun=Math.max(longestRun,run);}
  }
  // Two minutes of continuous evidence, not two isolated observations.
  if(longestRun<120000)return;
  const startPad=edge(before,first),endPad=edge(last,after);
  const weights=cluster.map(p=>1/Math.max(10,accuracy(p))**2),sum=weights.reduce((a,b)=>a+b,0);
  visits.push({id:`auto-${first.timestamp}`,latitude:cluster.reduce((s,p,i)=>s+p.latitude*weights[i],0)/sum,longitude:cluster.reduce((s,p,i)=>s+p.longitude*weights[i],0)/sum,
   arrival:first.timestamp-startPad,departure:last.timestamp+endPad,durationMinutes:(counted+startPad+endPad)/60000,
   uncertainMinutes:uncertain/60000,source:'gps',startEstimated:startPad>0,endEstimated:endPad>0});
 }
 for(const p of sorted){
  if(!usable(p)){flush();cluster=[];before=null;lastRaw=null;continue;}
  const prev=cluster.at(-1);
  if(prev&&p.timestamp===prev.timestamp)continue;
  if(prev&&(p.session!==prev.session||p.timestamp-prev.timestamp>1200000)){
   flush();cluster=[];before=null;
  }else if(prev&&!nearby(cluster[0],p)){
   flush(p);cluster=[];before=prev;
  }else if(!prev){before=lastRaw;}
  cluster.push(p);lastRaw=p;
 }
 flush();return visits;
}

export function prepare(data){const points=[...data.points].sort((a,b)=>a.timestamp-b.timestamp),places=data.places.map(p=>({...p}));const manual=data.visits.map(v=>({...v}));const visits=[...manual,...deriveVisits(points).filter(v=>!manual.some(m=>v.arrival<m.departure&&v.departure>m.arrival))].sort((a,b)=>a.arrival-b.arrival);for(const v of visits){let p=places.find(p=>p.id===v.placeId)||places.filter(p=>miles(p,v)*1609.344<=75).sort((a,b)=>miles(a,v)-miles(b,v))[0];if(!p){p={id:`derived-${v.id}`,name:`Saved place ${places.length+1}`,category:'Other',latitude:v.latitude,longitude:v.longitude};places.push(p);}v.placeId=p.id;}return {points,visits,places};}
export function stats(data){const {points,places,visits}=data;const counts=Object.create(null),minutes=Object.create(null),categoryMinutes=Object.create(null),months=Array(12).fill(0);for(const v of visits){counts[v.placeId]=(counts[v.placeId]||0)+1;minutes[v.placeId]=(minutes[v.placeId]||0)+v.durationMinutes;const p=places.find(p=>p.id===v.placeId);const cat=p?.category||'Other';categoryMinutes[cat]=(categoryMinutes[cat]||0)+v.durationMinutes;months[new Date(v.arrival).getMonth()]++;}const ranked=places.filter(p=>counts[p.id]).sort((a,b)=>counts[b.id]-counts[a.id]||minutes[b.id]-minutes[a.id]);let distance=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dt=b.timestamp-a.timestamp;if(dt<=0||dt>1200000||a.session!==b.session)continue;const d=miles(a,b);if(d>.02&&d/(dt/3600000)<180)distance+=d;}const repeat=ranked.filter(p=>counts[p.id]>1).length;return {ranked,counts,minutes,categoryMinutes,months,distance,places:ranked.length,visits:visits.length,hours:visits.reduce((s,v)=>s+v.durationMinutes,0)/60,repeat,once:ranked.length-repeat,month:visits.length?new Date(2026,months.indexOf(Math.max(...months)),1).toLocaleDateString(undefined,{month:'long'}):'—',personality:!visits.length?'Still discovering':distance>250||ranked.length>=10?'The Explorer':repeat/Math.max(1,ranked.length)>.65?'The Regular':distance>80?'The Wanderer':'The Local Legend'};}
export function demo(){const places=[['home','Home Base','Home',30.2672,-97.7431],['campus','University','School',30.2849,-97.7341],['coffee','Brew & Bloom','Food',30.2711,-97.749],['gym','Iron House Gym','Fitness',30.2599,-97.7512],['market','Central Market','Shopping',30.3071,-97.7403],['park','River Park','Outdoors',30.2667,-97.7558],['cinema','Downtown Cinema','Entertainment',30.2689,-97.7419],['airport','Airport','Travel',30.1975,-97.6664]].map(([id,name,category,latitude,longitude])=>({id,name,category,latitude,longitude}));const pattern=[['home',510],['campus',390],['coffee',65],['gym',80],['home',510],['campus',420],['market',55],['home',600],['park',120],['home',620],['campus',410],['coffee',90],['cinema',140],['airport',105]];const visits=Array.from({length:98},(_,i)=>{const [id,duration]=pattern[i%pattern.length],p=places.find(p=>p.id===id),arrival=new Date(2026,0,12,8).getTime()+i*2.25*86400000;return {id:`demo-${i}`,latitude:p.latitude,longitude:p.longitude,arrival,departure:arrival+duration*60000,durationMinutes:duration,placeId:id};});const points=[];for(let i=1;i<visits.length;i++){const a=visits[i-1],b=visits[i],session=`demo-route-${i}`;for(let j=0;j<=6;j++)points.push({id:`${session}-${j}`,latitude:a.latitude+(b.latitude-a.latitude)*j/6,longitude:a.longitude+(b.longitude-a.longitude)*j/6,timestamp:b.arrival-(6-j)*120000,session});}return {points,visits,places};}

export function normalizeVisits(visits){const sorted=[...visits].sort((a,b)=>a.arrival-b.arrival||a.departure-b.departure),out=[];for(const v of sorted){const prev=out.at(-1);if(prev&&v.arrival<prev.departure){if(miles(prev,v)>.12)throw Error('Two visits overlap at different places. Correct their arrival/departure times before importing.');prev.departure=Math.max(prev.departure,v.departure);prev.durationMinutes=(prev.departure-prev.arrival)/60000;}else out.push({...v});}return out;}
