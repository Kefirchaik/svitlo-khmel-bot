import {timeline,duration,dayKey,nextDayKey,kyivDate,kyivTime,isPlanned} from '../lib/outages.js';
const TOKEN=process.env.TELEGRAM_BOT_TOKEN;
const REDIS=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const RT=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const SOURCE='https://hoe.com.ua/shutdown/new';
const DONATE='https://send.monobank.ua/jar/SDWp3ABSr';
const GRAPH='https://hoe.com.ua/page/pogodinni-vidkljuchennja';
const INDEX='khm-energy:public:users:v1';
const VERSION='1.1.0';
const OFFICIAL='https://t.me/khmelnytskoblenergo';
const PRIVACY='https://svitlo-khmel-bot.vercel.app/privacy';
const TERMS='https://svitlo-khmel-bot.vercel.app/terms';
const CONSENT_TEXT='🔐 Перед початком користування ознайомся з документами:\n'+PRIVACY+'\n'+TERMS+'\n\nБот зберігатиме твій Telegram ID, вибрану адресу та налаштування для надання послуг. Натисни «✅ Приймаю умови», якщо погоджуєшся. Без згоди дані не зберігаються.';
const CONSENT_BUTTONS={inline_keyboard:[[{text:'🔐 Політика',url:PRIVACY},{text:'📜 Умови',url:TERMS}],[{text:'✅ Приймаю умови',callback_data:'consent_accept'}],[{text:'❌ Не погоджуюся',callback_data:'consent_decline'}]]};
const greeting=()=>{const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',hourCycle:'h23'}).format(new Date()));return h>=5&&h<12?'Доброго ранку':h>=12&&h<18?'Добрий день':h>=18&&h<23?'Добрий вечір':'Доброї ночі';};
const MENU={keyboard:[[{text:'⚡ Мій статус'},{text:'📍 Моя адреса'}],[{text:'🔄 Оновити'},{text:'📅 Сьогодні / завтра'}],[{text:'⏳ Відлік'},{text:'🔔 Сповіщення'}],[{text:'✉️ Зворотний зв’язок'},{text:'📰 Новини обленерго'}],[{text:'📅 Офіційні графіки'},{text:'💛 Підтримати автора'}],[{text:'ℹ️ Допомога'}]],resize_keyboard:true,is_persistent:true};
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
 const active=timeline(data.events).find(e=>e.startMs<=Date.now()&&e.endMs>Date.now());
 if(active)out+='\n\n⏳ До запланованого завершення: '+duration(active.endMs-Date.now());

 if(data.checkedAt)out+='\n\n🕒 Перевірено: '+new Date(data.checkedAt).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'});
 out+='\nℹ️ Це записи сайту, не підтвердження фактичної наявності світла.\n'+SOURCE;
 return send(id,out.slice(0,4000));
}
async function readAddress(u){if(!u.address)return null;const raw=await redis(['GET',ak(u.address.id)]);return raw?JSON.parse(raw):null;}
const checkedLine=data=>data?.checkedAt?'\n🕒 Перевірено: '+new Date(data.checkedAt).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'}):'';
const freshness=data=>{const t=Date.parse(data?.checkedAt||'');return !Number.isFinite(t)?'⚠️ Немає часу перевірки':Date.now()-t>30*60000?'⚠️ Дані застаріли (понад 30 хв)':'🟢 Дані оновлювалися нещодавно';};
async function showSchedule(id,u){
 if(!u.address)return send(id,'📍 Спочатку вибери адресу.');
 const data=await readAddress(u);
 if(!data)return send(id,'⏳ Ще немає даних для цієї адреси. Зачекай перевірки.');
 if(data.error)return send(id,'⚠️ Остання перевірка завершилася помилкою: '+data.error+checkedLine(data));
 const events=timeline(data.events),today=dayKey(),tomorrow=nextDayKey();
 let out='📅 Відключення на сьогодні та завтра\n📍 '+addr(u)+'\n';
 for(const [key,label] of [[today,'Сьогодні'],[tomorrow,'Завтра']]){
  const entries=events.filter(e=>dayKey(new Date(e.startMs))<=key&&dayKey(new Date(e.endMs-1))>=key);
  out+='\n'+label+' ('+key+'):';
  out+=entries.length?'\n'+entries.map(e=>'• '+e.kind+' | '+kyivTime(e.startMs)+' — '+kyivTime(e.endMs)+(dayKey(new Date(e.startMs))!==dayKey(new Date(e.endMs))?' (перехід доби)':'')).join('\n'):'\nУ таблиці немає записів.';
  out+='\n';
 }
 return send(id,(out+checkedLine(data)+'\nℹ️ Час орієнтовний; це записи обленерго.\n'+SOURCE).slice(0,4000));
}
async function showHealth(id,u){
 const data=await readAddress(u);
 let out='🟢 Бот відповідає на команди.\nВерсія: '+VERSION+'\n';
 if(!u.address)out+='📍 Адресу ще не вибрано.';
 else if(!data)out+='📍 '+addr(u)+'\n⏳ Даних перевірки ще немає.';
 else out+='📍 '+addr(u)+'\n'+freshness(data)+checkedLine(data)+(data.error?'\n⚠️ Помилка джерела: '+data.error:'\n📋 Записів у відповіді: '+(data.events?.length||0));
 out+='\n🔔 Сповіщення: '+(u.alerts===false?'вимкнено':'увімкнено')+'\nℹ️ «Оновити» показує кеш, не запускає нову перевірку.';
 return send(id,out);
}
async function requestRefresh(id,u){
 if(!u.address)return send(id,'📍 Спочатку вибери адресу.');
 const lock='khm-energy:refresh:cooldown:'+id;
 const acquired=await redis(['SET',lock,'1','NX','EX',120]);
 if(acquired!=='OK')return send(id,'⏳ Перевірку вже замовлено. Зачекай кілька хвилин.');
 await redis(['SADD','khm-energy:refresh:requests:v1',u.address.id]);
 return send(id,'🔄 Нову перевірку адреси замовлено.\n\nБот перевірить офіційний сайт під час найближчого запуску моніторингу (зазвичай до 5–10 хвилин). Коли дані зміняться, надійде сповіщення, якщо воно увімкнене.\n\n⚡ Натисни «Мій статус» трохи пізніше.');
}
async function showCountdown(id,u){
 if(!u.address)return send(id,'📍 Спочатку вибери адресу.');
 const data=await readAddress(u);
 if(!data||data.error)return send(id,'⚠️ Немає актуального результату перевірки для відліку.');
 const now=Date.now(),events=timeline(data.events),active=events.find(e=>e.startMs<=now&&e.endMs>now),next=events.find(e=>e.startMs>now);
 let out='⏳ Орієнтовний відлік\n📍 '+addr(u)+'\n\n';
 if(active)out+='💡 До запланованого завершення '+active.kind.toLowerCase()+': '+duration(active.endMs-now)+'\n'+kyivDate(active.endMs)+' о '+kyivTime(active.endMs);
 else if(next)out+='⚠️ До наступного записаного відключення: '+duration(next.startMs-now)+'\n'+kyivDate(next.startMs)+' о '+kyivTime(next.startMs);
 else out+='Майбутніх або поточних записів у таблиці немає.';
 return send(id,out+checkedLine(data)+'\n⚠️ Не гарантує фактичного часу появи світла.');
}

const levels={settlement:'населений пункт',street:'вулицю',house:'будинок'};
async function catalog(level,parent,query=''){
 const base='https://svitlo-khmel-bot.vercel.app';
 const r=await fetch(base+'/api/address-options?level='+level+(parent?'&parent='+encodeURIComponent(parent):'')+(query?'&q='+encodeURIComponent(query):''),{signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error('Address catalog HTTP '+r.status);
 const data=await r.json();if(!Array.isArray(data.items))throw Error('Invalid address catalog');return data.items;
}
async function choices(id,u,query=''){
 const level=u.step;const parent=level==='street'?u.draft?.settlementId:level==='house'?u.draft?.streetId:null;
 const items=await catalog(level,parent,query);
 const q=query.toLocaleLowerCase('uk-UA').trim();
 const found=items.filter(x=>x.text.toLocaleLowerCase('uk-UA').includes(q));
 if(!found.length)return send(id,'🔎 У списку обленерго не знайдено збігів. Спробуй іншу частину назви.');
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
  if(t==='consent_decline'){await send(id,'Без згоди бот не зберігає твої дані. Якщо передумаєш — надішли /start.');return res.json({ok:true});}
  if(t==='consent_accept'){u.consentAt=new Date().toISOString();await saveUser(id,u);await send(id,'✅ Дякуємо! Згоду збережено. Тепер можеш вибрати адресу кнопкою «📍 Моя адреса».');return res.json({ok:true});}
  if(t==='delete_confirm'){await redis(['SREM',INDEX,id]);await redis(['DEL',uid(id)]);await send(id,'🗑 Твої налаштування та прив’язку адреси до Telegram ID видалено з активного сховища. Для нового користування надішли /start.');return res.json({ok:true});}
  if(t==='delete_cancel'){await send(id,'Видалення скасовано.');return res.json({ok:true});}
  if(t==='/delete_my_data'){await send(id,'🗑 Видалити Telegram ID, адресу та налаштування зі сховища бота? Це не можна скасувати.',{reply_markup:{inline_keyboard:[[{text:'🗑 Так, видалити',callback_data:'delete_confirm'}],[{text:'Скасувати',callback_data:'delete_cancel'}]]}});return res.json({ok:true});}
  if(!u.consentAt){await send(id,CONSENT_TEXT,{reply_markup:CONSENT_BUTTONS});return res.json({ok:true});}
  if(u.step==='feedback'&&t&&!t.startsWith('/')&&!t.startsWith('pick:')){const message=String(msg.text||'').trim();if(!message||message.length>1500){await send(id,'✉️ Напиши текст до 1500 символів або /cancel.');return res.json({ok:true});}const owner=process.env.FEEDBACK_CHAT_ID||process.env.TELEGRAM_CHAT_ID;if(!owner){await send(id,'⚠️ Зворотний зв’язок тимчасово недоступний. Напиши @kefirchaik.');return res.json({ok:true});}await tg('sendMessage',{chat_id:owner,text:'✉️ Відгук «Світло Хмельниччини»\nTelegram ID: '+id+'\nАдреса: '+addr(u)+'\n\n'+message.slice(0,1500)});u.step=null;await saveUser(id,u);await send(id,'✅ Повідомлення надіслано адміністратору. Дякуємо!');return res.json({ok:true});}
  if(t==='cancel'){u.step=null;delete u.draft;delete u.options;await saveUser(id,u);await send(id,'Вибір адреси скасовано.');return res.json({ok:true});}
  if(t.startsWith('pick:')&&u.step){
   const match=/^pick:(settlement|street|house):([0-7])$/.exec(t);
   if(!match||match[1]!==u.step||!u.options?.[Number(match[2])]){await send(id,'⚠️ Кнопка застаріла. Введи пошуковий запит ще раз.');return res.json({ok:true});}
   const item=u.options[Number(match[2])];
   const parent=u.step==='street'?u.draft?.settlementId:u.step==='house'?u.draft?.streetId:null;
   // Choice was already fetched from the official catalog and saved for this user.
   if(u.step==='settlement'){u.draft={settlement:item.text,settlementId:item.id};u.step='street';delete u.options;await saveUser(id,u);await send(id,'🏘 Обрано: '+item.text+'\nВведи частину назви вулиці для пошуку в офіційному списку.');}
   else if(u.step==='street'){u.draft.street=item.text;u.draft.streetId=item.id;u.step='house';delete u.options;await saveUser(id,u);await send(id,'🏠 Обрано: '+item.text+'\nВведи номер будинку для пошуку в офіційному списку.');}
   else {const a={settlement:u.draft.settlement,street:u.draft.street,house:item.text,settlementId:u.draft.settlementId,streetId:u.draft.streetId,houseId:item.id};a.id='a'+Buffer.from([a.settlementId,a.streetId,a.houseId].join('|')).toString('base64url');u.address=a;u.step=null;delete u.draft;delete u.options;await saveUser(id,u);await send(id,'✅ Адресу підтверджено за офіційними списками:\n📍 '+addr(u)+'\n\nДані з’являться після наступної автоматичної перевірки.');}
   return res.json({ok:true});
  }
  const buttons={'⚡ Мій статус':'/status','📍 Моя адреса':'/address','🔄 Оновити':'/refresh','📅 Графіки':'/graph','📅 Сьогодні / завтра':'/schedule','📅 Офіційні графіки':'/graph','🟢 Стан бота':'/health','⏳ Відлік':'/countdown','✉️ Зворотний зв’язок':'/feedback','🔔 Сповіщення':'/alerts','💛 Підтримати автора':'/donate','ℹ️ Допомога':'/help','📰 Новини обленерго':'/news',status:'/status',graph:'/graph',refresh:'/refresh'};
  const cmd=buttons[t]||t.split(' ')[0].split('@')[0];
  if(cmd==='/start'){await send(id,greeting()+'! 👋\n\n⚡ Вітаємо у «Світло Хмельниччини» v'+VERSION+'!\n\nОбирай адресу й отримуй дані про відключення та сповіщення.\n📍 Поточна адреса: '+addr(u)+'\n\nВикористовуй кнопки нижче.\n\n🔐 Політика: '+PRIVACY+'\n📜 Умови: '+TERMS+'\nТи можеш відкликати згоду командою /delete_my_data.');}
  else if(cmd==='/privacy')await send(id,'🔐 Політика конфіденційності:\n'+PRIVACY+'\n\n📜 Умови користування:\n'+TERMS+'\nКонтакт: @kefirchaik');
  else if(cmd==='/terms')await send(id,'📜 Умови користування:\n'+TERMS); 
  else if(cmd==='/delete_my_data')await send(id,'🗑 Видалити Telegram ID, адресу та налаштування зі сховища бота? Це не можна скасувати.',{reply_markup:{inline_keyboard:[[{text:'🗑 Так, видалити',callback_data:'delete_confirm'}],[{text:'Скасувати',callback_data:'delete_cancel'}]]}});
  else if(cmd==='/address'){u.step='settlement';delete u.draft;delete u.options;await saveUser(id,u);await send(id,'📍 Введи частину назви населеного пункту. Бот запропонує варіанти з офіційного списку.\nДля скасування надішли /cancel.');}
  else if(cmd==='/cancel'){u.step=null;await saveUser(id,u);await send(id,'Вибір адреси скасовано.');}
  else if(cmd==='/status')await showStatus(id,u);
  else if(cmd==='/refresh')await requestRefresh(id,u);
  else if(cmd==='/news')await send(id,'📰 Офіційні повідомлення Хмельницькобленерго:\n'+OFFICIAL+'\n\nВажливі повідомлення з каналу надходитимуть автоматично.');
  else if(cmd==='/version')await send(id,'⚡ Світло Хмельниччини v'+VERSION+'\n🟢 Публічна версія.\nНовини: '+OFFICIAL);
  else if(cmd==='/schedule')await showSchedule(id,u);
  else if(cmd==='/countdown')await showCountdown(id,u);
  else if(cmd==='/health')await showHealth(id,u);
  else if(cmd==='/feedback'){u.step='feedback';await saveUser(id,u);await send(id,'✉️ Напиши одним повідомленням про проблему або пропозицію (до 1500 символів). Для скасування — /cancel.');}
  else if(cmd==='/graph')await send(id,'📅 Офіційні графіки погодинних відключень:\n'+GRAPH);
  else if(cmd==='/donate')await send(id,'💛 Підтримати автора бота можна добровільним внеском:\n'+DONATE+'\nДякую за підтримку!');
  else if(cmd==='/alerts'){u.alerts=!u.alerts;await saveUser(id,u);await send(id,u.alerts?'🔔 Сповіщення для твоєї адреси увімкнено.':'🔕 Сповіщення для твоєї адреси вимкнено.');}
  else if(cmd==='/help')await send(id,'📍 Моя адреса — вибір населеного пункту, вулиці та будинку.\n⚡ Мій статус — останні дані сайту.\n🔄 Оновити — замовити нову перевірку офіційного сайту.\n🔔 Сповіщення — увімкнути/вимкнути повідомлення про зміни.\n📅 Сьогодні / завтра — розклад за адресою.\n⏳ Відлік — орієнтовний час до завершення запису.\n📅 Офіційні графіки — сайт обленерго.\n/countdown — орієнтовний відлік.\n/health — стан перевірки.\n✉️ Зворотний зв’язок — написати адміністратору.\n📰 Новини обленерго — офіційний канал.\n/version — версія бота.\n💛 Підтримати автора — добровільний внесок.\n\n🔐 /privacy — політика конфіденційності.\n📜 /terms — умови користування.\n🗑 /delete_my_data — видалити особисті налаштування.\nКонтакт: @kefirchaik\n\nПеревірки запускаються приблизно кожні 10 хвилин; фактичні затримки можливі.');
  else if(u.step&&t&&!t.startsWith('/'))await choices(id,u,t);
  else if(t.startsWith('/'))await send(id,'Невідома команда. Натисни «ℹ️ Допомога».');
 }catch(e){console.error('Bot error',e.message);try{await send(id,u?.step?'⚠️ Не вдалося завантажити офіційний список адрес. Спробуй пізніше або натисни /cancel.':'⚠️ Сталася помилка. Спробуй ще раз пізніше.');}catch{}}
 return res.json({ok:true});
}
