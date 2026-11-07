const BASE='https://hoe.com.ua';
const paths={settlement:'/settlements/',street:'/streets/',house:'/houses/'};
function extract(input){
 const data=Array.isArray(input)?input:Array.isArray(input?.results)?input.results:Array.isArray(input?.data)?input.data:Array.isArray(input?.items)?input.items:null;
 if(!data)throw Error('Unknown address list format');
 return data.map(x=>({id:String(x.id??x.value??''),text:String(x.text??x.name??x.label??'').trim()})).filter(x=>x.id&&x.text).slice(0,10000);
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const level=String(req.query.level||''),parent=String(req.query.parent||'');
 if(!paths[level]||(level!=='settlement'&&!/^\d{1,12}$/.test(parent)))return res.status(400).json({error:'Invalid level or parent'});
 try{
  const target=BASE+paths[level]+(level==='settlement'?'':encodeURIComponent(parent));
  const response=await fetch(target,{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0','X-Requested-With':'XMLHttpRequest'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Source HTTP '+response.status);
  const items=extract(await response.json());
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
  return res.json({ok:true,items});
 }catch(e){console.error('Address catalog error:',e.message);return res.status(502).json({ok:false,error:'Список адрес тимчасово недоступний'});}
}
