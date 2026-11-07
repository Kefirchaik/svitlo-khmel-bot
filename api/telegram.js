const TOKEN=process.env.TELEGRAM_BOT_TOKEN;
const REDIS=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const RT=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const SOURCE='https://hoe.com.ua/shutdown/new';
const DONATE='https://send.monobank.ua/jar/SDWp3ABSr';
const GRAPH='https://hoe.com.ua/page/pogodinni-vidkljuchennja';
const INDEX='khm-energy:public:users:v1';
const OWNER='с. Чаньків, вул. Миру, 5';
const MENU={keyboard:[[{text:'⚡ Мій статус'},{text:'📍 Моя адреса'}],[{text:'🔄 Оновити'},{text:'📅 Графіки'}],[{text:'🔔 Сповіщення'},{text:'💛 Підтримати автора'}],[{text:'ℹ️ Допомога'}]],resize_keyboard:true,is_persistent:true};
const uid=id=>'khm-energy:public:user:'+id;
const ak=id=>'khm-energy:public:address:'+id;
const clean=s=>String(s||'').trim().replace(/\\s+/g,' ').slice(0,90);
async function redis(cmd){if(!REDIS||!RT)throw Error('Redis configuration missing');const r=await fetch(REDIS,{method:'POST',headers:{Authorization:'Bearer '+RT,'Content-Type':'application/json'},body:JSON.stringify(cmd)});if(!r.ok)throw Error('Redis HTTP '+r.status);const d=await r.json();if(d.error)throw Error(d.error);return d.result;}
async function tg(method,body){const r=await fetch('https://api.telegram.org/bot'+TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.description||'Telegram error');return d.result;}
const send=(id,text,extra={})=>tg('sendMessage',{chat_id:id,text,reply_markup:MENU,disable_web_page_preview:true,...extra});
async function getUser(id){const raw=await redis(['GET',uid(id)]);return raw?JSON.parse(raw):{step:null,address:null,alerts:true};}
async function saveUser(id,u){await redis(['SET',uid(id),JSON.stringify(u)]);await redis(['SADD',INDEX,String(id)]);}
function addr(u){return u.address?[u.address.settlement,u.address.street,u.address.house].join(', '):'не вибрана';}
async function showStatus(id,u){
 if(!u.address)return send(id,'📍 Спочатку вибери адресу кнопкою «Моя адреса».');
 const key=ak(u.address.id);const raw=await redis(['GET',key]);
 if(!raw)return send(id,'⏳ Для адреси '+addr(u)+' ще немає результату автоматичної перевірки. Зачекай наступного циклу (приблизно 10 хвилин).\n'+SOURCE);
 const data=JSON.parse(raw);
 let out='⚡ Відключення за адресою:\n📍 '+addr(u)+'\n';
 if(data.error)out+='\n⚠️ Не вдалося перевірити адресу: '+data.error;
 else if(!data.events?.length)out+='\nУ таблиці сайту записів про відключення немає.';
 else out+='\n'+data.events.map(e=>'• '+e.kind+' | ГПВ '+e.gpv+' | ГАВ '+e.gav+'\n'+e.start+' — '+e.end).join('\n\n');
 if(data.checkedAt)out+='\n\n🕒 Перевірено: '+new Date(data.checkedAt).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'});
 out+='\nℹ️ Це записи сайту, не підтвердження фактичної наявності світла.\n'+SOURCE;
 return send(id,out.slice(0,4000));
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 if(!TOKEN||!process.env.WEBHOOK_SECRET)return res.status(500).json({error:'Missing configuration'});
 if(req.headers['x-telegram-bot-api-secret-token']!==process.env.WEBHOOK_SECRET)return res.status(401).json({error:'Unauthorized'});
 const cb=req.body?.callback_query;const msg=cb?.message||req.body?.message;
 if(!msg||msg.chat?.type!=='private')return res.json({ok:true});
 const id=String(msg.chat.id);
 if(cb)await tg('answerCallbackQuery',{callback_query_id:cb.id});
 try{
  let u=await getUser(id);
  if(!u.address&&id===String(process.env.TELEGRAM_CHAT_ID)){
   u.address={settlement:'с. Чаньків (Дунаєвецька громада)',street:'вул. Миру',house:'5',id:'legacy-chankiv-myru-5'};
   await saveUser(id,u);
  }
  const t=clean(cb?.data||msg.text);
  const buttons={'⚡ Мій статус':'/status','📍 Моя адреса':'/address','🔄 Оновити':'/status','📅 Графіки':'/graph','🔔 Сповіщення':'/alerts','💛 Підтримати автора':'/donate','ℹ️ Допомога':'/help',status:'/status',graph:'/graph',refresh:'/status'};
  const cmd=buttons[t]||t.split(' ')[0].split('@')[0];
  if(cmd==='/start'){await saveUser(id,u);await send(id,'⚡ Вітаємо у боті «Світло Хмельниччини»!\n\nОбирай адресу й отримуй дані про відключення та сповіщення.\n📍 Поточна адреса: '+addr(u)+'\n\nВикористовуй кнопки нижче.');}
  else if(cmd==='/address'){u.step='settlement';await saveUser(id,u);await send(id,'📍 Напиши населений пункт у Хмельницькій області (наприклад: Дунаївці або Чаньків).\nДля скасування надішли /cancel.');}
  else if(cmd==='/cancel'){u.step=null;await saveUser(id,u);await send(id,'Вибір адреси скасовано.');}
  else if(cmd==='/status')await showStatus(id,u);
  else if(cmd==='/graph')await send(id,'📅 Офіційні графіки погодинних відключень:\n'+GRAPH);
  else if(cmd==='/donate')await send(id,'💛 Підтримати автора бота можна добровільним внеском:\n'+DONATE+'\nДякую за підтримку!');
  else if(cmd==='/alerts'){u.alerts=!u.alerts;await saveUser(id,u);await send(id,u.alerts?'🔔 Сповіщення для твоєї адреси увімкнено.':'🔕 Сповіщення для твоєї адреси вимкнено.');}
  else if(cmd==='/help')await send(id,'📍 Моя адреса — вибір населеного пункту, вулиці та будинку.\n⚡ Мій статус — останні дані сайту.\n🔄 Оновити — повторно показати збережені дані.\n🔔 Сповіщення — увімкнути/вимкнути повідомлення про зміни.\n📅 Графіки — офіційний сайт.\n💛 Підтримати автора — добровільний внесок.\n\nПеревірки запускаються приблизно кожні 10 хвилин; фактичні затримки можливі.');
  else if(u.step&&t&&!t.startsWith('/')){
   if(t.length<2||t.length>90)return res.json({ok:true});
   if(u.step==='settlement'){u.draft={settlement:t};u.step='street';await saveUser(id,u);await send(id,'🏘 Населений пункт: '+t+'\nТепер напиши вулицю з типом (наприклад: вул. Миру або пров. Миру).');}
   else if(u.step==='street'){u.draft.street=t;u.step='house';await saveUser(id,u);await send(id,'🏠 Напиши номер будинку (наприклад: 5 або 15А).');}
   else if(u.step==='house'){
    const a={...u.draft,house:t};a.id='a'+Buffer.from([a.settlement,a.street,a.house].join('|')).toString('base64url').slice(0,150);
    u.address=a;u.step=null;delete u.draft;await saveUser(id,u);
    await send(id,'✅ Адресу збережено:\n📍 '+addr(u)+'\n\nПісля наступної автоматичної перевірки з’являться дані. Якщо адресу не буде знайдено, бот повідомить про це.\n'+SOURCE);
   }
  }
  else if(t.startsWith('/'))await send(id,'Невідома команда. Натисни «ℹ️ Допомога».');
 }catch(e){console.error('Bot error',e.message);try{await send(id,'⚠️ Сталася помилка. Спробуй ще раз пізніше.');}catch{}}
 return res.json({ok:true});
}
