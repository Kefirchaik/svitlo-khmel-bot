import * as cheerio from 'cheerio';
const CHANNEL='https://t.me/s/khmelnytskoblenergo';
const REDIS=process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY='khm-energy:last-post-id';
async function redis(cmd){
  const r=await fetch(REDIS,{method:'POST',headers:{Authorization:'Bearer '+REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(cmd)});
  if(!r.ok) throw new Error('Redis HTTP '+r.status);
  const data=await r.json(); if(data.error) throw new Error(data.error); return data.result;
}
async function notify(text){
  const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text,disable_web_page_preview:true})});
  const data=await r.json(); if(!data.ok) throw new Error(data.description||'Telegram failed');
}
export default async function handler(req,res){
  if(!process.env.CHECK_SECRET || req.headers.authorization!=='Bearer '+process.env.CHECK_SECRET) return res.status(401).json({error:'Unauthorized'});
  if(!REDIS || !REDIS_TOKEN || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return res.status(500).json({error:'Missing configuration'});
  try{
    const response=await fetch(CHANNEL,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(12000)});
    if(!response.ok) throw new Error('Source HTTP '+response.status);
    const $=cheerio.load(await response.text()); const posts=[];
    $('.tgme_widget_message_wrap').each((_,el)=>{
      const item=$(el).find('.tgme_widget_message'); const raw=item.attr('data-post')||'';
      const id=Number(raw.split('/').pop());
      const content=item.find('.tgme_widget_message_text').text().replace(/\s+/g,' ').trim();
      if(Number.isInteger(id)&&id>0&&content) posts.push({id,text:content,url:'https://t.me/'+raw});
    });
    posts.sort((a,b)=>a.id-b.id);
    if(!posts.length) throw new Error('No text posts parsed');
    const previous=await redis(['GET',KEY]); const latest=posts.at(-1).id;
    if(previous===null){await redis(['SET',KEY,String(latest)]);return res.json({ok:true,initialized:true,latest});}
    const fresh=posts.filter(p=>p.id>Number(previous));let sent=0;
    for(const post of fresh){
      if(/відключ|графік|гпв|гав|електроенерг|знеструм|черг|відновлен/i.test(post.text)){
        await notify('⚡ Нове офіційне повідомлення (не адресний статус):\n\n'+post.text.slice(0,3200)+'\n\n'+post.url);
        sent++;
      }
      await redis(['SET',KEY,String(post.id)]);
    }
    return res.json({ok:true,newPosts:fresh.length,sent});
  }catch(e){return res.status(502).json({ok:false,error:String(e.message)});}
}
