export default function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 res.setHeader('Cache-Control','no-store');
 return res.json({version:'1.0.0',commit:process.env.VERCEL_GIT_COMMIT_SHA||null});
}
