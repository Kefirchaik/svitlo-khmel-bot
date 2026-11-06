const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({locale:'uk-UA',timezoneId:'Europe/Kyiv'});
 const traffic=[];
 page.on('response',r=>{if(r.url().startsWith('https://hoe.com.ua/') && !/\.(css|png|jpg|svg|woff|js)(\?|$)/i.test(r.url())) traffic.push({status:r.status(),method:r.request().method(),url:r.url().split('?')[0]});});
 try{
 await page.goto('https://hoe.com.ua/shutdown/new',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForTimeout(2000);
 const names=['settlment','street','house'];
 const searches=['Чаньків','Миру','5'];
 for(let i=0;i<3;i++){
  const sel=page.locator('select[name="'+names[i]+'"]');
  const container=sel.locator('xpath=following-sibling::span[contains(@class,"select2")]');
  await container.click({timeout:12000});
  const search=page.locator('.select2-container--open input.select2-search__field');
  if(await search.count()) await search.fill(searches[i]);
  await page.waitForTimeout(1700);
  const options=await page.locator('.select2-results__option').allTextContents();
  console.log('OPTIONS_'+names[i],JSON.stringify(options.slice(0,12)));
  const wanted=page.locator('.select2-results__option').filter({hasText:searches[i]}).first();
  if(await wanted.count()) await wanted.click(); else throw new Error('No matching option for '+names[i]);
  console.log('SELECTED_'+names[i],JSON.stringify(await sel.evaluate(n=>({value:n.value,text:n.selectedOptions[0]?.text}))));
  await page.waitForTimeout(1200);
 }
 await page.waitForTimeout(3000);
 console.log('TABLES',JSON.stringify((await page.locator('table').allTextContents()).map(s=>s.trim().slice(0,3000))));
 console.log('TRAFFIC',JSON.stringify(traffic.slice(-30)));
 }catch(e){console.error('PROBE_ERROR',e.message);console.log('TRAFFIC',JSON.stringify(traffic.slice(-30)));process.exitCode=1}
 finally{await browser.close()}
})();
