export function formatDuration(minutes:number){
 if(!Number.isFinite(minutes)||minutes<=0)return '0m';
 if(minutes<1)return '<1m';
 const total=Math.round(minutes), hours=Math.floor(total/60), remainder=total%60;
 return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${total}m`;
}
