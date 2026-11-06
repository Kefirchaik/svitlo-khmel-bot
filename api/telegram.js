const TOKEN=process.env.TELEGRAM_BOT_TOKEN;
const REDIS=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const REDIS_TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const KEY='khm-energy:address:chankiv-myru-5:v1';
const ADDRESS='с. Чаньків, вул. Миру, 5';
const SOURCE='https://hoe.com.ua/shutdown/new';
const MENU={inline_keyboard:[[{text:'⚡ Статус',callback_data:'status'},{text:'📅 Графік',callback_data:'graph'}],[{text:'🔄 Оновити',callback_data:'refresh'}]]};
async function send(chat_id,text){
 const r=await fetch('https://api.telegram.org/bot'+TOKEN+'/sendMessage',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({chat_id,text,reply_markup:MENU})
 });
 const data=await r.json();
 if(!r.ok||!data.ok)throw new Error('Telegram send failed: '+(data.description||r.status));
}
async function status(){
 if(!REDIS||!REDIS_TOKEN)return '⚠️ Сховище даних не налаштоване. Спробуй пізніше.';
 const r=await fetch(REDIS,{method:'POST',headers:{Authorization:'Bearer '+REDIS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(['GET',KEY])});
 if(!r.ok)throw new Error('Redis HTTP '+r.status);
 const data=await r.json();
 if(data.error)throw new Error('Redis: '+data.error);
 if(data.result===null)return '⏳ Адресний моніторинг ще не отримав першої перевірки.\n'+SOURCE;
 const events=JSON.parse(data.result);
 if(!Array.isArray(events))throw new Error('Unexpected stored status');
 let message='🔎 Останні отримані дані про відключення\n📍 '+ADDRESS+'\nПідчерга ГПВ 2.1, черга ГАВ 8\n';
 if(events.length===0)message+='\nУ таблиці немає записів про відключення.';
 else message+='\n'+events.map(e=>'• '+e.kind+' | ГПВ '+e.gpv+' | ГАВ '+e.gav+'\n  '+e.start+' — '+e.end).join('\n\n');
 message+='\n\nℹ️ Дані останньої успішної автоматичної перевірки (не запит у реальному часі).\n'+SOURCE+'\nЗаписи не підтверджують фактичну наявність чи відсутність світла.';
 return message.slice(0,4000);
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 if(!TOKEN||!process.env.TELEGRAM_CHAT_ID||!process.env.WEBHOOK_SECRET)return res.status(500).json({error:'Missing configuration'});
 if(req.headers['x-telegram-bot-api-secret-token']!==process.env.WEBHOOK_SECRET)return res.status(401).json({error:'Unauthorized'});
 const callback=req.body?.callback_query;
 const msg=callback?.message||req.body?.message;
 if(!msg||String(msg.chat?.id)!==String(process.env.TELEGRAM_CHAT_ID))return res.json({ok:true});
 if(callback){
  // Telegram requires acknowledging callback presses to clear the loading spinner.
  await fetch('https://api.telegram.org/bot'+TOKEN+'/answerCallbackQuery',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({callback_query_id:callback.id})
  });
 }
 const raw=callback?.data||(msg.text||'').split(' ')[0].split('@')[0];
 const cmd=({'status':'/status','refresh':'/status','graph':'/graph'}[raw]||raw);
 const replies={
  '/start':'⚡ Вітаю! Я відстежую записи про відключення для '+ADDRESS+'. Підчерга 2.1. Обирай дію кнопками нижче або використовуй /status /graph /help.',
  '/graph':'📅 Офіційні графіки: https://hoe.com.ua/page/pogodinni-vidkljuchennja',
  '/help':'⚡ Статус — остання збережена таблиця відключень.\\n📅 Графік — офіційні графіки.\\n🔄 Оновити — повторно показати останні збережені дані (не запускає миттєву перевірку сайту).\\nАвтоматична перевірка адреси працює приблизно кожні 10 хвилин.'
 };
 if(cmd==='/status'){
  try{await send(msg.chat.id,await status());}
  catch(e){console.error('Status error:',e.message);await send(msg.chat.id,'⚠️ Не вдалося отримати останні дані. Спробуй пізніше.\\n'+SOURCE);}
 }else if(replies[cmd])await send(msg.chat.id,replies[cmd]);
 return res.json({ok:true});
}
