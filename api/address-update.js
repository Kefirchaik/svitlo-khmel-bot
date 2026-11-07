const URL=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const RT=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const USERS='khm-energy:public:users:v1';
const addressKey=id=>'khm-energy:public:address:'+id;
async function redis(cmd){const r=await fetch(URL,{method:'POST',headers:{Authorization:'Bearer '+RT,'Content-Type':'application/json'},body:JSON.stringify(cmd)});if(!r.ok)throw Error('Redis HTTP '+r.status);const d=await r.json();if(d.error)throw Error(d.error);return d.result;}
async function notify(id,text){const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:id,text:text.slice(0,4000)})});const d=await r.json();if(!d.ok)console.error('Notify failed',id,d.description);}
const fmt=e=>e.kind+' | ГПВ '+e.gpv+' | ГАВ '+e.gav+'\n'+e.start+' — '+e.end;
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 if(!process.env.CHECK_SECRET||req.headers.authorization!=='Bearer '+process.env.CHECK_SECRET)return res.status(401).json({error:'Unauthorized'});
 if(!URL||!RT||!process.env.TELEGRAM_BOT_TOKEN)return res.status(500).json({error:'Missing configuration'});
 const {address,events,error}=req.body||{};
 if(!address||typeof address.id!=='string'||address.id.length>180||!['settlement','street','house'].every(k=>typeof address[k]==='string'&&address[k].length<=90)||(!Array.isArray(events)&&typeof error!=='string')||(Array.isArray(events)&&(events.length>100||events.some(e=>!e||!['kind','gpv','gav','start','end'].every(k=>typeof e[k]==='string'&&e[k].length<=100)))))return res.status(400).json({error:'Invalid payload'});
 try{
  const key=addressKey(address.id),previous=await redis(['GET',key]);
  const old=previous?JSON.parse(previous):null;
  const sorted=Array.isArray(events)?events.map(e=>({kind:e.kind,gpv:e.gpv,gav:e.gav,start:e.start,end:e.end})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):null;
  const record={events:sorted||old?.events||[],checkedAt:new Date().toISOString(),error:typeof error==='string'?error.slice(0,200):null};
  if(address.id==='legacy-chankiv-myru-5'&&sorted)await redis(['SET','khm-energy:address:chankiv-myru-5:v1',JSON.stringify(sorted)]);
  await redis(['SET',key,JSON.stringify(record)]);
  const changed=!!sorted&&!!old&&!old.error&&JSON.stringify(old.events)!==JSON.stringify(sorted);
  if(changed){
   const ids=await redis(['SMEMBERS',USERS])||[];
   const name=[address.settlement,address.street,address.house].join(', ');
   const msg='⚡ Зміни відключень за адресою:\n📍 '+name+'\n\n'+(sorted.length?sorted.map(fmt).join('\n\n'):'Записи про відключення зникли з таблиці.')+'\n\nДжерело: https://hoe.com.ua/shutdown/new\nЗаписи не підтверджують фактичну наявність світла.';
   for(const id of ids.slice(0,1000)){
    const raw=await redis(['GET','khm-energy:public:user:'+id]);if(!raw)continue;
    const u=JSON.parse(raw);
    if(u.address?.id===address.id&&u.alerts!==false)await notify(id,msg);
   }
  }
  return res.json({ok:true,changed,count:record.events.length,error:record.error});
 }catch(e){return res.status(502).json({error:e.message});}
}
