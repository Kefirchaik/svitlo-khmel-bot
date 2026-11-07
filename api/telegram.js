const TOKEN=process.env.TELEGRAM_BOT_TOKEN;
const REDIS=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const RT=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const SOURCE='https://hoe.com.ua/shutdown/new';
const DONATE='https://send.monobank.ua/jar/SDWp3ABSr';
const GRAPH='https://hoe.com.ua/page/pogodinni-vidkljuchennja';
const INDEX='khm-energy:public:users:v1';
const VERSION='1.0.0';
const OFFICIAL='https://t.me/khmelnytskoblenergo';
const greeting=()=>{const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',hourCycle:'h23'}).format(new Date()));return h>=5&&h<12?'Доброго ранку':h>=12&&h<18?'Добрий день':h>=18&&h<23?'Добрий вечір':'Доброї ночі';};
const MENU={keyboard:[[{text:'⚡ Мій статус'},{text:'📍 Моя адреса'}],[{text:'🔄 Оновити'},{text:'📅 Графіки'}],[{text:'🔔 Сповіщення'},{text:'💛 Підтримати автора'}],[{text:'📰 Новини обленерго'},{text:'ℹ️ Допомога'}]],resize_keyboard:true,is_persistent:true};
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
 if(!raw&&u.address.id==='legacy-chankiv-myru-5'){const old=await redis(['GET','khm-energy:address:chankiv-myru-5:v1']);if(old){const events=JSON.parse(old);return send(id,'⚡ Останні збережені відключення:\n📍 '+addr(u)+'\n\n'+(events.length?events.map(e=>e.kind+' | ГПВ '+e.gpv+' | ГАВ '+e.gav+'\n'+e.start+' — '+e.end).join('\n\n'):'Записів немає.')+'\n\nДжерело: '+SOURCE);}}
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
const levels={settlement:'населений пункт',street:'вулицю',house:'будинок'};
async function catalog(level,parent){
 const base=process.env.VERCEL_URL?'https://'+process.env.VERCEL_URL:'https://svitlo-khmel-bot.vercel.app';
 const r=await fetch(base+'/api/address-options?level='+level+(parent?'&parent='+encodeURIComponent(parent):''),{signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Address catalog HTTP '+r.status);
 const data=await r.json();if(!Array.isArray(data.items))throw Error('Invalid address catalog');return data.items;
}
async function choices(id,u,query=''){
 const level=u.step;const parent=level==='street'?u.draft?.settlementId:level==='house'?u.draft?.streetId:null;
 const items=await catalog(level,parent);
 const q=query.toLocaleLowerCase('uk-UA').trim();
 const found=items.filter(x=>x.text.toLocaleLowerCase('uk-UA').includes(q));
 if(!found.length)return send(id,'🔎 Нічого не знайдено в офіційному списку. Уточни назву або введи інший пошуковий запит.');
 u.options=found.slice(0,8);await saveUser(id,u);
 const keyboard=u.options.map((x,i)=>[{text:x.text,callback_data:'pick:'+level+':'+i}]);
 keyboard.push([{text:'❌ Скасувати',callback_data:'cancel'}]);
 return send(id,'📍 Обери '+levels[level]+' з офіційного списку'+(found.length>8?' (показано перші 8 із '+found.length+', уточни пошук)':'')+':',{reply_markup:{inline_keyboard:keyboard}});
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

  const t=clean(cb?.data||msg.text);
  if(t==='cancel'){u.step=null;delete u.draft;delete u.options;await saveUser(id,u);await send(id,'Вибір адреси скасовано.');return res.json({ok:true});}
  if(t.startsWith('pick:')&&u.step){
   const match=/^pick:(settlement|street|house):([0-7])$/.exec(t);
   if(!match||match[1]!==u.step||!u.options?.[Number(match[2])]){await send(id,'⚠️ Кнопка застаріла. Введи пошуковий запит ще раз.');return res.json({ok:true});}
   const item=u.options[Number(match[2])];
   const parent=u.step==='street'?u.draft?.settlementId:u.step==='house'?u.draft?.streetId:null;
   const actual=await catalog(u.step,parent);
   if(!actual.some(x=>x.id===item.id&&x.text===item.text))throw Error('Stale address choice');
   if(u.step==='settlement'){u.draft={settlement:item.text,settlementId:item.id};u.step='street';delete u.options;await saveUser(id,u);await send(id,'🏘 Обрано: '+item.text+'\\nВведи частину назви вулиці для пошуку в офіційному списку.');}
   else if(u.step==='street'){u.draft.street=item.text;u.draft.streetId=item.id;u.step='house';delete u.options;await saveUser(id,u);await send(id,'🏠 Обрано: '+item.text+'\\nВведи номер будинку для пошуку в офіційному списку.');}
   else {const a={settlement:u.draft.settlement,street:u.draft.street,house:item.text,settlementId:u.draft.settlementId,streetId:u.draft.streetId,houseId:item.id};a.id='a'+Buffer.from([a.settlementId,a.streetId,a.houseId].join('|')).toString('base64url');u.address=a;u.step=null;delete u.draft;delete u.options;await saveUser(id,u);await send(id,'✅ Адресу підтверджено за офіційними списками:\\n📍 '+addr(u)+'\\n\\nДані з’являться після наступної автоматичної перевірки.');}
   return res.json({ok:true});
  }
  const buttons={'⚡ Мій статус':'/status','📍 Моя адреса':'/address','🔄 Оновити':'/status','📅 Графіки':'/graph','🔔 Сповіщення':'/alerts','💛 Підтримати автора':'/donate','ℹ️ Допомога':'/help','📰 Новини обленерго':'/news',status:'/status',graph:'/graph',refresh:'/status'};
  const cmd=buttons[t]||t.split(' ')[0].split('@')[0];
  if(cmd==='/start'){await saveUser(id,u);await send(id,greeting()+'! 👋\n\n⚡ Вітаємо у «Світло Хмельниччини» v'+VERSION+'!\n\nОбирай адресу й отримуй дані про відключення та сповіщення.\n📍 Поточна адреса: '+addr(u)+'\n\nВикористовуй кнопки нижче.');}
  else if(cmd==='/address'){u.step='settlement';delete u.draft;delete u.options;await saveUser(id,u);await send(id,'📍 Введи частину назви населеного пункту. Бот запропонує варіанти з офіційного списку.\nДля скасування надішли /cancel.');}
  else if(cmd==='/cancel'){u.step=null;await saveUser(id,u);await send(id,'Вибір адреси скасовано.');}
  else if(cmd==='/status')await showStatus(id,u);
  else if(cmd==='/news')await send(id,'📰 Офіційні повідомлення Хмельницькобленерго:\n'+OFFICIAL+'\n\nВажливі повідомлення з каналу надходитимуть автоматично.');
  else if(cmd==='/version')await send(id,'⚡ Світло Хмельниччини v'+VERSION+'\n🟢 Публічна версія.\nНовини: '+OFFICIAL);
  else if(cmd==='/graph')await send(id,'📅 Офіційні графіки погодинних відключень:\n'+GRAPH);
  else if(cmd==='/donate')await send(id,'💛 Підтримати автора бота можна добровільним внеском:\n'+DONATE+'\nДякую за підтримку!');
  else if(cmd==='/alerts'){u.alerts=!u.alerts;await saveUser(id,u);await send(id,u.alerts?'🔔 Сповіщення для твоєї адреси увімкнено.':'🔕 Сповіщення для твоєї адреси вимкнено.');}
  else if(cmd==='/help')await send(id,'📍 Моя адреса — вибір населеного пункту, вулиці та будинку.\n⚡ Мій статус — останні дані сайту.\n🔄 Оновити — повторно показати збережені дані.\n🔔 Сповіщення — увімкнути/вимкнути повідомлення про зміни.\n📅 Графіки — офіційний сайт.\n📰 Новини обленерго — офіційний канал.\n/version — версія бота.\n💛 Підтримати автора — добровільний внесок.\n\nПеревірки запускаються приблизно кожні 10 хвилин; фактичні затримки можливі.');
  else if(u.step&&t&&!t.startsWith('/'))await choices(id,u,t);
  else if(t.startsWith('/'))await send(id,'Невідома команда. Натисни «ℹ️ Допомога».');
 }catch(e){console.error('Bot error',e.message);try{await send(id,'⚠️ Сталася помилка. Спробуй ще раз пізніше.');}catch{}}
 return res.json({ok:true});
}
