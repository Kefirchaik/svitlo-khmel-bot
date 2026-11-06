const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export default async function handler(req,res) {
  if(req.method !== 'POST') return res.status(405).json({error:'POST only'});
  if(!TOKEN || !process.env.TELEGRAM_CHAT_ID || !process.env.WEBHOOK_SECRET) return res.status(500).json({error:'Missing configuration'});
  if(req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return res.status(401).json({error:'Unauthorized'});
  const msg=req.body?.message;
  if(!msg || String(msg.chat?.id)!==String(process.env.TELEGRAM_CHAT_ID)) return res.json({ok:true});
  const cmd=(msg.text||'').split(' ')[0].split('@')[0];
  const replies={
    '/start':'⚡ Вітаю! Я стежу за офіційними публікаціями Хмельницькобленерго. Підчерга 2.1. Команди: /status /graph /help',
    '/status':'🔎 Перевірка відключень за адресою: https://hoe.com.ua/shutdown/new\nУвага: автоматичний адресний моніторинг ще не реалізований.',
    '/graph':'📅 Офіційні графіки: https://hoe.com.ua/page/pogodinni-vidkljuchennja',
    '/help':'Команди: /start /status /graph /help. Автоматичні сповіщення стосуються текстових публікацій, а не змін за адресою.'
  };
  if(replies[cmd]) await fetch('https://api.telegram.org/bot'+TOKEN+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:msg.chat.id,text:replies[cmd]})});
  res.json({ok:true});
}
