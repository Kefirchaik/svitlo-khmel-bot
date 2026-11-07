import {fetchGpv} from '../lib/gpv.js';
const secret=process.env.CHECK_SECRET;
if(!secret)throw Error('CHECK_SECRET is required');
const days=await fetchGpv();
if(!Object.keys(days).length){
 const response=await fetch('https://hoe.com.ua/page/pogodinni-vidkljuchennja',{signal:AbortSignal.timeout(12000)});
 const html=await response.text();
 const {load}=await import('cheerio');
 const $=load(html);$('script,style,nav,footer,header').remove();
 const plain=$('body').text().replace(/\s+/g,' ').trim();
 const markers=[...plain.matchAll(/(?:Підчерга|За розпорядженням|ГПВ|листопада)/gi)];
 console.error('GPV_DIAGNOSTICS',JSON.stringify({httpStatus:response.status,finalUrl:response.url,htmlLength:html.length,title:$('title').text().slice(0,160),plainLength:plain.length,markers:markers.length,markerContexts:markers.slice(0,15).map(m=>plain.slice(Math.max(0,m.index-50),m.index+180)),bodyStart:plain.slice(0,900)}));
 throw Error('No complete dated schedules found; see GPV_DIAGNOSTICS above');
}
const response=await fetch('https://svitlo-khmel-bot.vercel.app/api/gpv-update',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({days})});
const result=await response.json();
if(!response.ok||!result.saved)throw Error('GPV update failed: '+JSON.stringify(result));
console.log('Saved official GPV days:',Object.keys(days).join(', '));
