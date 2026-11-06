const REDIS=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const REDIS_TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const KEY='khm-energy:address:chankiv-myru-5:v1';
async function redis(cmd){
 const r=await fetch(REDIS,{method:'POST',headers:{Authorization:'Bearer '+REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(cmd)});
 if(!r.ok)throw new Error('Redis HTTP '+r.status);
 const d=await r.json();if(d.error)throw new Error(d.error);return d.result;
}
async function notify(text){
 const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text})});
 const d=await r.json();if(!d.ok)throw new Error(d.description||'Telegram send failed');
}
const fmt=e=>e.kind+' | ГПВ '+e.gpv+' | ГАВ '+e.gav+'\n'+e.start+' — '+e.end;
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 if(!process.env.CHECK_SECRET||req.headers.authorization!=='Bearer '+process.env.CHECK_SECRET)return res.status(401).json({error:'Unauthorized'});
 if(!REDIS||!REDIS_TOKEN||!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_CHAT_ID)return res.status(500).json({error:'Missing configuration'});
 const events=req.body?.events;
 if(req.body?.address!=='с. Чаньків, вул. Миру, 5'||!Array.isArray(events)||events.length>100||events.some(e=>!e||!['kind','gpv','gav','start','end'].every(k=>typeof e[k]==='string'&&e[k].length<=100)))return res.status(400).json({error:'Invalid payload'});
 const canonical=events.map(e=>({kind:e.kind,gpv:e.gpv,gav:e.gav,start:e.start,end:e.end})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 try{
  const previous=await redis(['GET',KEY]);
  if(previous===null){
   await redis(['SET',KEY,JSON.stringify(canonical)]);
   await notify('⚡ Адресний моніторинг запущено: с. Чаньків, вул. Миру, 5.\nЗараз записів: '+canonical.length+(canonical.length?'\n\n'+canonical.map(fmt).join('\n\n'):'\nАктивних записів у таблиці немає.')+'\n\nЦе записи сайту, а не підтвердження наявності чи відсутності світла.');
   return res.json({ok:true,initialized:true,count:canonical.length});
  }
  const old=JSON.parse(previous);
  const key=e=>JSON.stringify(e);
  const oldSet=new Set(old.map(key)),newSet=new Set(canonical.map(key));
  const added=canonical.filter(e=>!oldSet.has(key(e))),removed=old.filter(e=>!newSet.has(key(e)));
  if(!added.length&&!removed.length)return res.json({ok:true,changed:false,count:canonical.length});
  let message='⚡ Зміни відключень за адресою: с. Чаньків, вул. Миру, 5\n';
  if(added.length)message+='\n➕ Нові записи:\n'+added.map(fmt).join('\n\n')+'\n';
  if(removed.length)message+='\n➖ Зникли з таблиці:\n'+removed.map(fmt).join('\n\n')+'\n';
  message+='\nДжерело: https://hoe.com.ua/shutdown/new\nЗникнення запису не гарантує відновлення електропостачання.';
  await notify(message.slice(0,4000));
  await redis(['SET',KEY,JSON.stringify(canonical)]);
  return res.json({ok:true,changed:true,added:added.length,removed:removed.length});
 }catch(e){return res.status(502).json({ok:false,error:e.message});}
}
