import * as cheerio from 'cheerio';
const CHANNEL='https://t.me/s/khmelnytskoblenergo';
const URL=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const RT=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const KEY='khm-energy:last-post-id';
async function redis(cmd){const r=await fetch(URL,{method:'POST',headers:{Authorization:'Bearer '+RT,'Content-Type':'application/json'},body:JSON.stringify(cmd)});if(!r.ok)throw Error('Redis HTTP '+r.status);const d=await r.json();if(d.error)throw Error(d.error);return d.result;}
async function notify(id,text){const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:id,text,disable_web_page_preview:true})});const d=await r.json();return d.ok;}
export default async function handler(req,res){
 if(!process.env.CHECK_SECRET||req.headers.authorization!=='Bearer '+process.env.CHECK_SECRET)return res.status(401).json({error:'Unauthorized'});
 if(!URL||!RT||!process.env.TELEGRAM_BOT_TOKEN)return res.status(500).json({error:'Missing configuration'});
 try{
  const r=await fetch(CHANNEL,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('Source HTTP '+r.status);
  const $=cheerio.load(await r.text()),posts=[];
  $('.tgme_widget_message_wrap').each((_,el)=>{
   const item=$(el).find('.tgme_widget_message'),raw=item.attr('data-post')||'',id=Number(raw.split('/').pop());
   const content=item.find('.tgme_widget_message_text').text().replace(/\s+/g,' ').trim();
   if(Number.isInteger(id)&&id>0&&raw.startsWith('khmelnytskoblenergo/')&&content)posts.push({id,text:content,url:'https://t.me/'+raw});
  });
  posts.sort((a,b)=>a.id-b.id);
  if(!posts.length)throw Error('No posts parsed');
  const last=await redis(['GET',KEY]),latest=posts.at(-1).id;
  if(last===null){await redis(['SET',KEY,String(latest)]);return res.json({ok:true,initialized:true,latest});}
  const fresh=posts.filter(p=>p.id>Number(last)).slice(0,10);
  const ids=await redis(['SMEMBERS','khm-energy:public:users:v1'])||[];
  let sent=0,failed=0;
  for(const p of fresh){
   if(/відключ|графік|гпв|гав|електроенерг|знеструм|черг|відновлен|аварі|ремонт|обмеженн/i.test(p.text)){
    const msg='📰 Хмельницькобленерго — офіційне повідомлення:\n\n'+p.text.slice(0,3200)+'\n\n'+p.url+'\n\nЦе загальна новина, не адресний статус.';
    for(const id of ids.slice(0,1000)){
     const uRaw=await redis(['GET','khm-energy:public:user:'+id]);if(!uRaw)continue;
     const u=JSON.parse(uRaw);if(!u.consentAt||u.alerts===false)continue;
     try{if(await notify(id,msg))sent++;else failed++;}catch{failed++;}
    }
   }
   await redis(['SET',KEY,String(p.id)]);
  }
  return res.json({ok:true,newPosts:fresh.length,sent,failed});
 }catch(e){return res.status(502).json({ok:false,error:e.message});}
}
