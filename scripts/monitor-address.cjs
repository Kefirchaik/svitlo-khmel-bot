const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({locale:'uk-UA',timezoneId:'Europe/Kyiv'});
 try{
  await page.goto('https://hoe.com.ua/shutdown/new',{waitUntil:'domcontentloaded',timeout:45000});
  for(const [name,search,exact] of [['settlment','Чаньків','с. Чаньків (Дунаєвецька громада)'],['street','Миру','вул. Миру'],['house','5','5']]){
   const select=page.locator('select[name="'+name+'"]');
   await select.locator('xpath=following-sibling::span[contains(@class,"select2")]').click();
   const field=page.locator('.select2-container--open input.select2-search__field');
   if(await field.count()) await field.fill(search);
   const option=page.locator('.select2-results__option').filter({hasText:exact}).first();
   await option.waitFor({state:'visible',timeout:20000});
   await option.click();
   const selected=await select.evaluate(n=>n.selectedOptions[0]?.text?.trim());
   if(selected!==exact) throw new Error('Unexpected '+name+': '+selected);
  }
  await page.waitForTimeout(2200);
  const table=page.locator('table').filter({hasText:'Тип відключення'}).first();
  await table.waitFor({state:'visible',timeout:20000});
  const headings=await table.locator('thead th').allTextContents();
  if(!headings.some(x=>x.includes('Початок'))||!headings.some(x=>x.includes('Кінець')))throw new Error('Unexpected table columns');
  const rows=await table.locator('tbody tr').evaluateAll(trs=>trs.map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.replace(/\s+/g,' ').trim())).filter(row=>row.length>=6&&row[4]&&row[5]));
  const events=rows.map(r=>({kind:r[1],gpv:r[2],gav:r[3],start:r[4],end:r[5]})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  console.log('ADDRESS_CHECK',JSON.stringify({count:events.length,events}));
  const response=await fetch(process.env.ADDRESS_UPDATE_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.CHECK_SECRET},body:JSON.stringify({address:'с. Чаньків, вул. Миру, 5',events})});
  const data=await response.text();
  console.log('UPDATE_RESPONSE',response.status,data.slice(0,1000));
  if(!response.ok)throw new Error('Address update failed: '+response.status);
 }catch(e){console.error('ADDRESS_CHECK_ERROR',e.message);process.exitCode=1}
 finally{await browser.close()}
})();
