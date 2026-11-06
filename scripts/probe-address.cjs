// Diagnostic-only browser probe. No Telegram alerts are sent until verified.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({locale:'uk-UA',timezoneId:'Europe/Kyiv'});
  const requests = [];
  page.on('response', r => {
    const u = r.url();
    if (u.startsWith('https://hoe.com.ua/') && /json|ajax|shutdown|api/i.test(u))
      requests.push({status:r.status(), method:r.request().method(), url:u.split('?')[0]});
  });
  try {
    await page.goto('https://hoe.com.ua/shutdown/new',{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(6000);
    console.log('PAGE_TITLE',await page.title());
    const selects = await page.locator('select').evaluateAll(nodes => nodes.map(n => ({
      id:n.id, name:n.name, className:n.className,
      options:[...n.options].slice(0,8).map(o=>({text:o.text.trim(),value:o.value}))
    })));
    console.log('SELECTS',JSON.stringify(selects));
    const controls = await page.locator('input,[role="combobox"],.select2,.choices').evaluateAll(nodes => nodes.slice(0,30).map(n=>({
      tag:n.tagName,id:n.id,className:n.className,placeholder:n.getAttribute('placeholder')
    })));
    console.log('CONTROLS',JSON.stringify(controls));
    console.log('SITE_REQUESTS',JSON.stringify(requests.slice(-30)));
    console.log('TABLES',JSON.stringify((await page.locator('table').allTextContents()).map(t=>t.trim().slice(0,800))));
  } catch(e) { console.error('PROBE_ERROR',e.message); process.exitCode=1; }
  finally { await browser.close(); }
})();
