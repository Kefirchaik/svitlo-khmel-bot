const {chromium}=require('playwright');
const API='https://svitlo-khmel-bot.vercel.app';
const secret=process.env.CHECK_SECRET;
const normalize=s=>String(s||'').toLocaleLowerCase('uk-UA').replace(/^(с\.|м\.|смт\.|вул\.|пров\.|село|місто|селище)\s*/,'').replace(/\s*\([^)]*\)/g,'').replace(/[^\p{L}\p{N}]/gu,'');
async function api(path,body){
 const r=await fetch(API+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();if(!r.ok)throw Error(path+' HTTP '+r.status+' '+text.slice(0,300));return JSON.parse(text);
}
async function select(page,name,wanted,id){
 const s=page.locator('select[name="'+name+'"]');
 if(id){
  const value=String(id);
  await s.waitFor({state:'attached',timeout:15000});
  await s.evaluate((el,{value,label})=>{
   let opt=Array.from(el.options).find(o=>o.value===value);
   if(!opt){opt=new Option(label,value,true,true);el.add(opt);}
   opt.selected=true;
   if(window.jQuery){
    const $=window.jQuery;
    $(el).val(value).trigger('change').trigger({type:'select2:select',params:{data:{id:value,text:label}}});
   }else el.dispatchEvent(new Event('change',{bubbles:true}));
  },{value,label:wanted});
  await page.waitForTimeout(1800);
  const selected=await s.inputValue();
  if(selected!==value)throw Error('Не вдалося вибрати '+name+' ID '+value);
  console.log('SELECTED_ID',name,value);
  return;
 }
 await s.locator('xpath=following-sibling::span[contains(@class,"select2")]').click();
 const field=page.locator('.select2-container--open input.select2-search__field');
 if(await field.count())await field.fill(wanted.replace(/^(с\.|м\.|смт\.|вул\.|пров\.)\s*/,'').replace(/\s*\([^)]*\)/g,''));
 await page.waitForTimeout(1700);
 const opts=page.locator('.select2-results__option');
 const options=(await opts.allTextContents()).map(s=>s.trim()).filter(Boolean);
 let match=options.find(x=>x.toLocaleLowerCase('uk-UA')===wanted.toLocaleLowerCase('uk-UA'));
 if(!match)match=options.find(x=>normalize(x)===normalize(wanted));
 if(!match)throw Error('Не знайдено '+name+': '+wanted+'; варіанти: '+options.slice(0,8).join(' | '));
 await opts.filter({hasText:match}).first().click();
 await page.waitForTimeout(1700);
}

(async()=>{
 if(!secret)throw Error('Missing CHECK_SECRET');
 const {addresses}=await api('/api/subscriptions');
 const requested=await api('/api/refresh-requests').catch(e=>{console.error('Refresh queue unavailable:',e.message);return {ids:[]};});
 console.log('Addresses to monitor:',addresses.length,'requested:',requested.ids.length);
 const browser=await chromium.launch({headless:true});
 try{
  const batchSize=12;const batchCount=Math.max(1,Math.ceil(addresses.length/batchSize));
  const batch=Math.floor(Date.now()/600000)%batchCount;
  console.log('Batch',batch+1,'of',batchCount);
  const selected=new Map();
  for(const address of addresses.filter(a=>requested.ids.includes(a.id)).slice(0,12))selected.set(address.id,address);
  for(const address of addresses.slice(batch*batchSize,(batch+1)*batchSize))selected.set(address.id,address);
  for(const address of selected.values()){
   const page=await browser.newPage({locale:'uk-UA',timezoneId:'Europe/Kyiv'});
   try{
    await page.goto('https://hoe.com.ua/shutdown/new',{waitUntil:'domcontentloaded',timeout:45000});
    await select(page,'settlment',address.settlement,address.settlementId);
    await select(page,'street',address.street,address.streetId);
    await select(page,'house',address.house,address.houseId);
    await page.waitForTimeout(1700);
    const table=page.locator('table').filter({hasText:'Тип відключення'}).first();
    await table.waitFor({state:'visible',timeout:18000});
    const headings=await table.locator('thead th').allTextContents();
    if(!headings.some(x=>x.includes('Початок'))||!headings.some(x=>x.includes('Кінець')))throw Error('Unexpected table columns');
    const rows=await table.locator('tbody tr').evaluateAll(trs=>trs.map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.replace(/\s+/g,' ').trim())).filter(r=>r.length>=6&&r[4]&&r[5]));
    const events=rows.map(r=>({kind:r[1],gpv:r[2],gav:r[3],start:r[4],end:r[5]}));
    await api('/api/address-update',{address,events});
    console.log('OK',address.id,events.length);
   }catch(e){
    console.error('ADDRESS_ERROR',address.id,e.message);
    await api('/api/address-update',{address,error:e.message}).catch(err=>console.error('REPORT_ERROR',err.message));
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
