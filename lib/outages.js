// All outage times from the utility are interpreted in Europe/Kyiv.
const tz='Europe/Kyiv';
export const kyivParts=(date=new Date())=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
 return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
};
export const dayKey=(date=new Date())=>{const p=kyivParts(date);return [p.year,String(p.month).padStart(2,'0'),String(p.day).padStart(2,'0')].join('-');};
export function parseKyiv(input){
 const m=String(input||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\s*(?:р\.?\s*)?(?:[,\s]+)(\d{1,2}):(\d{2})/);
 if(!m)return null;
 const [,dd,mm,yyyy,hh,mi]=m.map((x,i)=>i?Number(x):x);
 if(mm<1||mm>12||dd<1||dd>31||hh>23||mi>59)return null;
 const utcGuess=Date.UTC(yyyy,mm-1,dd,hh,mi);
 if(new Date(utcGuess).getUTCDate()!==dd||new Date(utcGuess).getUTCMonth()!==mm-1)return null;
 let result=utcGuess;
 for(let i=0;i<3;i++){
  const p=kyivParts(new Date(result));
  const actual=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
  result+=utcGuess-actual;
 }
 const p=kyivParts(new Date(result));
 if(p.year!==yyyy||p.month!==mm||p.day!==dd||p.hour!==hh||p.minute!==mi)return null;
 return result;
}
export const isPlanned=e=>/планов|гпв|погодин/i.test(String(e.kind||''));
export function timeline(events,now=Date.now()){
 return (events||[]).map(e=>({...e,startMs:parseKyiv(e.start),endMs:parseKyiv(e.end)}))
 .filter(e=>e.startMs!==null&&e.endMs!==null&&e.endMs>e.startMs)
 .sort((a,b)=>a.startMs-b.startMs);
}
export function duration(ms){const n=Math.max(0,Math.ceil(ms/60000));return (Math.floor(n/60)?Math.floor(n/60)+' год ':'')+(n%60)+' хв';}
export const kyivDate=(ms)=>new Intl.DateTimeFormat('uk-UA',{timeZone:tz,day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(ms));
export const kyivTime=(ms)=>new Intl.DateTimeFormat('uk-UA',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ms));
export const tomorrowKey=()=>dayKey(new Date(Date.now()+36*3600000)); // unused; use calendar date increment via helper below
export function nextDayKey(now=new Date()){const p=kyivParts(now);const d=new Date(Date.UTC(p.year,p.month-1,p.day+1));return d.toISOString().slice(0,10);}
