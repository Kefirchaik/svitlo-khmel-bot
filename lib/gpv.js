import * as cheerio from 'cheerio';
export const GPV_URL='https://hoe.com.ua/page/pogodinni-vidkljuchennja';
const months=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
export function queueOf(events){
 const q=[...new Set((events||[]).map(e=>String(e.gpv||'').match(/\b[1-6]\.[12]\b/)?.[0]).filter(Boolean))];
 return q.length===1?q[0]:null;
}
export function parseGpv(html,now=new Date()){
 const $=cheerio.load(html);$('script,style,nav,footer,header').remove();
 // Normalize whitespace: the utility renders paragraphs with variable HTML markup.
 const text=$('body').text().replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit'}).formatToParts(now);
 const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
 const header=/За розпорядженням НЕК\s*[«"]?Укренерго[»"]?\s*(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)/gi;
 const blocks=[...text.matchAll(header)],days={};
 for(let i=0;i<blocks.length;i++){
  const m=blocks[i],d=Number(m[1]),mo=months.indexOf(m[2].toLowerCase())+1;
  if(!mo||d<1||d>31)continue;
  let y=year;if(mo===12&&month===1)y--;if(mo===1&&month===12)y++;
  const key=[y,String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
  const section=text.slice(m.index+m[0].length,i+1<blocks.length?blocks[i+1].index:text.length);
  const queues={};
  const markers=[...section.matchAll(/Підчерга\s*([1-6]\.[12])\s*[–—-]/gi)];
  for(let j=0;j<markers.length;j++){
   const q=markers[j],tail=section.slice(q.index+q[0].length,j+1<markers.length?markers[j+1].index:section.length).slice(0,140);
   const ranges=[...tail.matchAll(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/g)].map(x=>[x[1],x[2]]).filter(([a,b])=>a<='24:00'&&b<='24:00'&&a<b);
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
