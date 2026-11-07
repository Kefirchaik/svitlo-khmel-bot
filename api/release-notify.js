const URL=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const RT=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const INDEX='khm-energy:public:users:v1';
async function redis(cmd){const r=await fetch(URL,{method:'POST',headers:{Authorization:'Bearer '+RT,'Content-Type':'application/json'},body:JSON.stringify(cmd)});if(!r.ok)throw Error('Redis HTTP '+r.status);const d=await r.json();if(d.error)throw Error(d.error);return d.result;}
async function notify(id,text){const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:id,text,disable_web_page_preview:true})});const d=await r.json();return d.ok;}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 if(!process.env.CHECK_SECRET||req.headers.authorization!=='Bearer '+process.env.CHECK_SECRET)return res.status(401).json({error:'Unauthorized'});
 if(!URL||!RT||!process.env.TELEGRAM_BOT_TOKEN)return res.status(500).json({error:'Missing configuration'});
 const sha=req.body?.sha,notes=req.body?.notes;
 if(typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha)||typeof notes!=='string'||notes.length>1800)return res.status(400).json({error:'Invalid payload'});
 if(process.env.VERCEL_GIT_COMMIT_SHA&&process.env.VERCEL_GIT_COMMIT_SHA!==sha)return res.status(409).json({error:'Deployment does not match commit'});
 const key='khm-energy:release-notified:'+sha;
 try{
  const acquired=await redis(['SET',key,'sending','NX','EX',86400*90]);
  if(acquired!=='OK')return res.json({ok:true,duplicate:true});
  const ids=await redis(['SMEMBERS',INDEX])||[];
  const msg='🚀 ОНОВЛЕННЯ «СВІТЛО ХМЕЛЬНИЧЧИНИ»\n\n'+notes.trim().slice(0,1800)+'\n\n⚡ Дякуємо, що користуєтеся ботом!\n💛 Підтримати автора: https://send.monobank.ua/jar/SDWp3ABSr';
  let sent=0,failed=0;
  for(const id of ids.slice(0,1000)){
   try{if(await notify(id,msg))sent++;else failed++;}catch{failed++;}
  }
  await redis(['SET',key,JSON.stringify({sent,failed,at:new Date().toISOString()}),'EX',86400*90]);
  return res.json({ok:true,sent,failed});
 }catch(e){return res.status(502).json({error:e.message});}
}
