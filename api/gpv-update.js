const URL=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 if(!process.env.CHECK_SECRET||req.headers.authorization!=='Bearer '+process.env.CHECK_SECRET)return res.status(401).json({error:'Unauthorized'});
 if(!URL||!TOKEN)return res.status(500).json({error:'Redis unavailable'});
 const days=req.body?.days;
 if(!days||typeof days!=='object'||Array.isArray(days))return res.status(400).json({error:'Invalid GPV'});
 try{
  let saved=0;
  for(const [day,queues] of Object.entries(days).slice(0,4)){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!queues||Object.keys(queues).length!==12)continue;
   if(!Object.entries(queues).every(([q,r])=>/^[1-6]\.[12]$/.test(q)&&Array.isArray(r)&&r.length<=8&&r.every(x=>Array.isArray(x)&&x.length===2&&x.every(t=>/^\d{2}:\d{2}$/.test(t)))))continue;
   const record={day,queues,checkedAt:new Date().toISOString()};
   const r=await fetch(URL,{method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},body:JSON.stringify(['SET','khm-energy:gpv:'+day,JSON.stringify(record),'EX',259200])});
   if(!r.ok||(await r.json()).error)throw Error('Redis write failed');
   saved++;
  }
  return res.json({ok:true,saved});
 }catch(e){return res.status(502).json({error:'Storage error'});}
}
