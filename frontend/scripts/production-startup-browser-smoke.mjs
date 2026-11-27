import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.CSV_BASE_URL || 'http://127.0.0.1:4201';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const out = process.env.STARTUP_EVIDENCE_DIR || '/tmp/csv-production-startup';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless:true,args:['--no-sandbox']});
const evidence = {errors:[],external:[],checks:[]};
try {
 const context = await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==new URL(base).origin){evidence.external.push(route.request().url());return route.abort();}return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
 for(const mode of ['cold','warm']){
  if(mode==='cold') await page.goto(base);else await page.reload();
  await page.getByText('Select a file',{exact:true}).first().waitFor({timeout:30000});
  await page.locator('#app-loading-screen').waitFor({state:'hidden',timeout:30000});
  const chooser=page.waitForEvent('filechooser');await page.getByText('Select a file',{exact:true}).first().click();await (await chooser).setFiles([]);
  assert.deepEqual(evidence.errors,[]);evidence.checks.push(mode);
  await page.screenshot({path:`${out}/${mode}.png`,fullPage:true});
 }
 assert.deepEqual(evidence.external,[]);
} finally {await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));await browser.close();}
