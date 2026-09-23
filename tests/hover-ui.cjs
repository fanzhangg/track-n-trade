const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(()=>{world=E.newWorld(1);selected=E.START_TILE;render();window.hoverButton=document.querySelector('#selection [data-command]');window.nextButton=document.getElementById('next-step-action');});
  const button=page.locator('#selection [data-command]').first();await button.hover();
  await page.waitForTimeout(250);
  const color=await button.evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.waitForTimeout(2400);
  assert.ok(await page.evaluate(()=>hoverButton===document.querySelector('#selection [data-command]')&&hoverButton.matches(':hover')));
  assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),color);
  assert.ok(await page.evaluate(()=>nextButton===document.getElementById('next-step-action')));
  await page.evaluate(()=>{world.paused=true;world.money=0;render();});assert.ok(await button.isDisabled());
  await page.evaluate(()=>{world.money=10000;render();});assert.ok(await button.isEnabled());
  const count=await page.evaluate(()=>world.tiles[E.START_TILE].building.workers.length);
  await button.click();assert.equal(await page.evaluate(()=>world.tiles[E.START_TILE].building.workers.length),count+1);
  assert.deepEqual(errors,[]);await context.close();console.log(`Hover ${width}px: stable through live ticks, affordability updates and purchase passed`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
