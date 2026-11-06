export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'POST only'});
  if (!process.env.SETUP_SECRET || req.headers.authorization !== 'Bearer ' + process.env.SETUP_SECRET)
    return res.status(401).json({error:'Unauthorized'});
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.WEBHOOK_SECRET;
  if (!token || !secret) return res.status(500).json({error:'Missing TELEGRAM_BOT_TOKEN or WEBHOOK_SECRET'});
  const url = 'https://' + req.headers.host + '/api/telegram';
  const response = await fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({url, secret_token:secret, allowed_updates:['message']})
  });
  const data = await response.json();
  return res.status(data.ok ? 200 : 502).json({ok:data.ok, description:data.description, webhook_url:url});
}
