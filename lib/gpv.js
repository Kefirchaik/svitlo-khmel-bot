import * as cheerio from 'cheerio';
export const GPV_URL='https://hoe.com.ua/page/pogodinni-vidkljuchennja';
const months=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','грудня'];
export function queueOf(events){
 const q=[...new Set((events||[]).map(e=>String(e.gpv||'').match(/\b[1-6]\.[12]\b/)?.[0]).filter(Boolean))];
 return q.length===1?q[0]:null;
}
export function parseGpv(html,now=new Date()){
 const $=cheerio.load(html);$('script,style,nav,footer,header').remove();
 const text=$('body').text().replace(/\u00a0/g,' ').replace(/\r/g,'').replace(/[ \t]+/g,' ');
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
 const blocks=[...text.matchAll(/За розпорядженням[^\n]{0,250}?(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|грудня)[^\n]{0,250}/gi)];
 const days={};
 for(let i=0;i<blocks.length;i++){
  const m=blocks[i],d=Number(m[1]),mo=months.indexOf(m[2].toLowerCase())+1;
  if(!mo||d<1||d>31)continue;
  let y=year;if(mo===12&&month===1)y--;if(mo===1&&month===12)y++;
  const key=[y,String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
  const section=text.slice(m.index+m[0].length,i+1<blocks.length?blocks[i+1].index:text.length);
  const queues={};
  const re=/Підчерга\s*([1-6]\.[12])\s*[–—-]\s*([^\n]+)/gi;
  for(const q of section.matchAll(re)){
   const ranges=[...q[2].matchAll(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/g)].map(x=>[x[1],x[2]]).filter(([a,b])=>a<='24:00'&&b<='24:00'&&a<b);
   if(ranges.length)queues[q[1]]=ranges;
  }
  if(Object.keys(queues).length===12)days[key]=queues;
 }
 return days;
}
export async function fetchGpv(){
 const r=await fetch(GPV_URL,{signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Official GPV HTTP '+r.status);
 return parseGpv(await r.text());
}
