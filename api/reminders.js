import {timeline,isPlanned,duration,kyivTime,kyivDate} from '../lib/outages.js';
const URL=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const RT=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const INDEX='khm-energy:public:users:v1';
async function redis(cmd){const r=await fetch(URL,{method:'POST',headers:{Authorization:'Bearer '+RT,'Content-Type':'application/json'},body:JSON.stringify(cmd)});if(!r.ok)throw Error('Redis HTTP '+r.status);const d=await r.json();if(d.error)throw Error(d.error);return d.result;}
async function notify(id,text){const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:id,text,disable_web_page_preview:true})});const d=await r.json();return !!d.ok;}
export default async function handler(req,res){
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
 if(!process.env.CHECK_SECRET||req.headers.authorization!=='Bearer '+process.env.CHECK_SECRET)return res.status(401).json({error:'Unauthorized'});
 if(!URL||!RT||!process.env.TELEGRAM_BOT_TOKEN)return res.status(500).json({error:'Missing configuration'});
 try{
  const now=Date.now(),ids=(await redis(['SMEMBERS',INDEX])||[]).slice(0,1000);
  let sent=0,skipped=0,failed=0;
  for(const id of ids){
   const raw=await redis(['GET','khm-energy:public:user:'+id]);if(!raw)continue;
   let u;try{u=JSON.parse(raw);}catch{continue;}
   if(!u.consentAt||u.alerts===false||!u.address?.id)continue;
   const recordRaw=await redis(['GET','khm-energy:public:address:'+u.address.id]);if(!recordRaw)continue;
   let data;try{data=JSON.parse(recordRaw);}catch{continue;}
   const checked=Date.parse(data.checkedAt||'');
   if(data.error||!Number.isFinite(checked)||now-checked>30*60000||checked>now+60000){skipped++;continue;}
   const upcoming=timeline(data.events).filter(e=>isPlanned(e)&&e.startMs>now&&e.startMs<=now+30*60000);
   for(const e of upcoming){
    const key='khm-energy:reminder:v1:'+id+':'+u.address.id+':'+e.startMs;
    const acquired=await redis(['SET',key,'pending','NX','EX',86400*3]);
    if(acquired!=='OK')continue;
    // Recheck membership and consent to avoid sending to a deleted user.
    const still=await redis(['SISMEMBER',INDEX,id]);
    const current=await redis(['GET','khm-energy:public:user:'+id]);
    let live=null;try{live=current?JSON.parse(current):null;}catch{}
    if(!still||!live?.consentAt||live.alerts===false||live.address?.id!==u.address.id){await redis(['DEL',key]);continue;}
    const address=[u.address.settlement,u.address.street,u.address.house].join(', ');
    const msg='⚠️ Попередження про можливе планове відключення\n📍 '+address+'\n\n⏳ Початок приблизно через '+duration(e.startMs-now)+'\n🕒 '+kyivDate(e.startMs)+' о '+kyivTime(e.startMs)+'\n\nℹ️ За даними обленерго; фактичне відключення не гарантоване.\nhttps://hoe.com.ua/shutdown/new';
    try{if(await notify(id,msg)){sent++;await redis(['SET',key,'sent','EX',86400*3]);}else{failed++;await redis(['DEL',key]);}}catch{failed++;await redis(['DEL',key]);}
   }
  }
  return res.json({ok:true,sent,skipped,failed});
 }catch(e){return res.status(502).json({ok:false,error:e.message});}
}
