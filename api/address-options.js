import * as cheerio from 'cheerio';
const BASE='https://hoe.com.ua';
const paths={settlement:'/settlements/',street:'/streets/',house:'/houses/'};
function extract(raw){
 let value=raw;
 if(typeof value==='string'){
  const s=value.trim();
  if(s.startsWith('{')||s.startsWith('[')){try{value=JSON.parse(s);}catch{}}
 }
 if(Array.isArray(value))return value.map(x=>typeof x==='string'?{id:x,text:x}:{id:String(x.id??x.value??x.key??''),text:String(x.text??x.name??x.label??x.title??'')}).filter(x=>x.id&&x.text);
 if(value&&typeof value==='object'){
  for(const key of ['results','data','items','options','settlements','streets','houses']){
   if(value[key]!=null){try{return extract(value[key]);}catch{}}
  }
  const entries=Object.entries(value);
  if(entries.length&&entries.every(([k,v])=>typeof v==='string'||typeof v==='number'))return entries.map(([id,text])=>({id,text:String(text)}));
 }
 if(typeof value==='string'){
  const $=cheerio.load(value),out=[];
  $('option').each((_,el)=>{const id=$(el).attr('value'),text=$(el).text().trim();if(id&&text)out.push({id,text});});
  if(out.length)return out;
  $('li[data-id],li[data-value],a[data-id]').each((_,el)=>{const id=$(el).attr('data-id')||$(el).attr('data-value'),text=$(el).text().trim();if(id&&text)out.push({id,text});});
  if(out.length)return out;
 }
 throw Error('Unsupported address list response');
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const level=String(req.query.level||''),parent=String(req.query.parent||'');
 if(!paths[level]||(level!=='settlement'&&!/^\d{1,12}$/.test(parent)))return res.status(400).json({error:'Invalid level or parent'});
 try{
  const target=BASE+paths[level]+(level==='settlement'?'':encodeURIComponent(parent));
  const response=await fetch(target,{headers:{Accept:'application/json, text/html, */*','User-Agent':'Mozilla/5.0','X-Requested-With':'XMLHttpRequest',Referer:BASE+'/shutdown/new'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Source HTTP '+response.status);
  const raw=await response.text(),items=extract(raw).filter(x=>x.id&&x.text&&x.id.length<100&&x.text.length<200).slice(0,10000);
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
  return res.json({ok:true,items});
 }catch(e){console.error('Address catalog',level,e.message);return res.status(502).json({ok:false,error:'Офіційний список тимчасово недоступний'});}
}
