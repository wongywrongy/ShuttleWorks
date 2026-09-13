import {chromium} from '/home/kyle/code/ShuttleWorks/tests/e2e/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
const out='/tmp/sw-final-audit';const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:900}});const p=await c.newPage();const result={};
await p.goto('http://127.0.0.1:5173/');
try {await p.getByText('Taipei Open',{exact:true}).first().waitFor({timeout:25000});result.hubLoaded=true;}catch{result.hubLoaded=false;}
result.hubText=(await p.locator('body').innerText()).slice(0,3000);await p.screenshot({path:out+'/hub-settled.png'});
await p.goto('http://127.0.0.1:5175/e/2026-korea-masters-t030/enter',{waitUntil:'networkidle'});
result.before=await p.locator('body').innerText();
await p.locator('input[name=playerName]').fill('Audit Draft Only');await p.locator('select[name=gender]').selectOption({index:1});await p.locator('input[name=events]').first().check();
let quoteRequests=0;p.on('request',r=>{if(r.url().includes('/quote/'))quoteRequests++});
await p.getByRole('button',{name:'Review entry',exact:true}).click();
result.afterReview={quoteRequests,text:await p.locator('body').innerText(),focus:await p.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,100)}))};
await p.screenshot({path:out+'/entry-review-unquoted.png'});
await p.getByRole('button',{name:/back|edit/i}).first().click();await p.reload({waitUntil:'networkidle'});result.reloadDraft=await p.locator('input[name=playerName]').inputValue();
// No submission: test offline draft retention and truthful absence of receipt only.
await c.setOffline(true);await p.locator('input[name=playerName]').fill('Audit Offline Draft');await p.waitForTimeout(350);result.offlineText=(await p.locator('body').innerText()).includes('Entry received');await c.setOffline(false);await p.reload({waitUntil:'networkidle'});result.reconnectDraft=await p.locator('input[name=playerName]').inputValue();
await b.close();fs.writeFileSync(out+'/interactions.json',JSON.stringify(result,null,2));console.log({hubLoaded:result.hubLoaded,quoteRequests:result.afterReview.quoteRequests,reloadDraft:result.reloadDraft,reconnectDraft:result.reconnectDraft});
