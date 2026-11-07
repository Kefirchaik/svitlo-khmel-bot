const URL=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
const TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const KEY='khm-energy:refresh:requests:v1';
async function redis(cmd){const r=await fetch(URL,{method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},body:JSON.stringify(cmd)});if(!r.ok)throw Error('Redis HTTP '+r.status);const d=await r.json();if(d.error)throw Error(d.error);return d.result;}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 if(!process.env.CHECK_SECRET||req.headers.authorization!=='Bearer '+process.env.CHECK_SECRET)return res.status(401).json({error:'Unauthorized'});
 if(!URL||!TOKEN)return res.status(500).json({error:'Redis not configured'});
 try{
  const ids=(await redis(['SMEMBERS',KEY])||[]).slice(0,60);
  return res.json({ok:true,ids});
 }catch(e){return res.status(502).json({error:e.message});}
}
