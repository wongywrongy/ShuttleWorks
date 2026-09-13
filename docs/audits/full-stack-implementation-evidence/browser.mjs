import { chromium } from '/home/kyle/code/ShuttleWorks/tests/e2e/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
const out='/tmp/sw-final-audit';const b=await chromium.launch();const findings={};
const base='http://127.0.0.1:5175/e';
const pid='4e966892-c915-4158-b1fd-20fc28121a9c';
const collect=()=>({title:document.title,h1:[...document.querySelectorAll('h1')].map(e=>e.innerText),overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>e.innerText),path:[...document.querySelectorAll('.bracket-link-edge.is-person-path')].map(e=>[e.getAttribute('data-feeder-node'),e.getAttribute('data-edge')]),selected:[...document.querySelectorAll('.bracket-slot.is-person-path')].map(e=>[e.getAttribute('data-node-key'),e.getAttribute('data-selected-side')]),stages:[...document.querySelectorAll('[data-entry-stage]')].map(e=>({stage:e.getAttribute('data-entry-stage'),visible:!!e.getClientRects().length})),fields:[...document.querySelectorAll('input,select')].filter(e=>e.type!=='hidden').map(e=>({name:e.name,type:e.type,visible:!!e.getClientRects().length})),errors:[...document.querySelectorAll('[role=alert]')].map(e=>e.innerText)});
for(const width of [1440,390]){
 const c=await b.newContext({viewport:{width,height:900}});const p=await c.newPage();
 for(const [name,url] of [['hub','http://127.0.0.1:5173/'],['discovery',base+'/'],['overview',base+'/2026-korea-masters-t030'],['entry',base+'/2026-korea-masters-t030/enter'],['path',base+`/2026-taipei-open-t029/draws/WS?view=path&player=${pid}`]]){
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url,{waitUntil:'networkidle'}); findings[`${name}-${width}`]={...await p.evaluate(collect),runtimeErrors:errors};
  await p.screenshot({path:`${out}/${name}-${width}.png`});
  if(name==='path'&&width===1440){const clear=p.getByRole('button',{name:/clear path/i});if(await clear.count()){await clear.click();findings.cleared=await p.evaluate(collect);}}
 }
 await c.close();
}
const c=await b.newContext({javaScriptEnabled:false,viewport:{width:1440,height:900}});const p=await c.newPage();
for(const [name,url] of [['entry',base+'/2026-korea-masters-t030/enter'],['path',base+`/2026-taipei-open-t029/draws/WS?view=path&player=${pid}`]]){
 await p.goto(url,{waitUntil:'networkidle'});findings[name+'-nojs']=await p.evaluate(collect);await p.screenshot({path:`${out}/${name}-nojs.png`});
}
await b.close();fs.writeFileSync(out+'/browser.json',JSON.stringify(findings,null,2));console.log(Object.fromEntries(Object.entries(findings).map(([k,v])=>[k,{overflow:v.overflow,errors:v.runtimeErrors,stages:v.stages,path:v.path,selected:v.selected}])));
