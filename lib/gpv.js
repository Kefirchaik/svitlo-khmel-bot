// Official hourly outage schedules (ГПВ). Never infer a schedule from a queue alone.
import * as cheerio from 'cheerio';
const URL='https://hoe.com.ua/page/pogodinni-vidkljuchennja';
const MONTHS=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
const kyivDateParts=(d)=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
export function queueOf(events){
 const values=[...new Set((events||[]).map(e=>String(e.gpv||'').match(/\b[1-6]\.[12]\b/)?.[0]).filter(Boolean))];
 return values.length===1?values[0]:null;
}
export async function officialGpv(day){
 const [year,month,dd]=day.split('-').map(Number);
 if(!year||month<1||month>12||dd<1||dd>31)return null;
 const slug='pogodinni-vidkljuchennja-na-'+dd+'-'+['sichnja','ljutogo','bereznja','kvitnja','travnja','chervnja','lipnja','serpnja','veresnja','zhovtnja','listopada','grudnja'][month-1]+'.html';
 const sources=['https://hoe.com.ua/post/'+slug,URL];
 for(const url of sources){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'StrumON/1.1 (+public outage information)'}});
   if(!response.ok)continue;
   const html=await response.text();const $=cheerio.load(html);
   $('script,style,nav,footer,header').remove();
   const raw=$('body').text().replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ');
   const datePattern=new RegExp('(?:^|\\D)0?'+dd+'\\s+'+MONTHS[month-1]+'(?:\\s+'+year+')?','i');
   // A dated article must contain the intended calendar date; the general page may contain multiple days.
   const match=datePattern.exec(raw);if(!match)continue;
   const section=raw.slice(match.index,match.index+8000);
   const nextDay=/(?:^|\n)\s*(?:За розпорядженням[^\n]*\n)?\s*\d{1,2}\s+(?:січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\b/i;
   const next=nextDay.exec(section.slice(match[0].length+20));
   const scoped=next?section.slice(0,match[0].length+20+next.index):section;
   const queues={};
   const re=/Підчерга\s*([1-6]\.[12])\s*[–—-]\s*((?:\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\s*;?\s*)+)/gi;
   for(const m of scoped.matchAll(re)){
    const intervals=[...m[2].matchAll(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/g)].map(x=>[x[1],x[2]]);
    if(intervals.length)queues[m[1]]=intervals;
   }
   if(Object.keys(queues).length<8)continue;
   return {day,queues,url,checkedAt:new Date().toISOString()};
  }catch(e){console.warn('GPV source unavailable:',e.message);}
 }
 return null;
}
export function queueIntervals(schedule,queue){return schedule?.queues?.[queue]||[];}
