// Isolated browser contexts only: never reads or writes the player's browser profile.
const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const file of ['index.html','docs/ui-system.html','docs/ui-components.html','docs/design.html','docs/mapgen.html']){
   await page.goto(pathToFileURL(path.resolve(file)).href);await page.waitForLoadState('load');
   if(file==='index.html'){
    if(await page.locator('#mobile-warning-dismiss').isVisible())await page.locator('#mobile-warning-dismiss').click();
    await page.locator('#pause').click();
    await page.evaluate(()=>{world=E.newWorld(1);E.command(world,{type:'build',tile:E.START_TILE,buildType:'camp'});E.command(world,{type:'connect',from:E.START_TILE,to:E.START_TOWN});E.command(world,{type:'worker',tile:E.START_TILE});world.paused=true;for(let i=0;i<40;i++)E.tick(world);mapKey='';render();});
    const before=await page.evaluate(()=>JSON.stringify({money:world.money,sold:world.sold,clicks:world.clicks}));
    await page.locator('[data-tile="0,-1"]').dispatchEvent('click');
    assert.equal(await page.evaluate(()=>JSON.stringify({money:world.money,sold:world.sold,clicks:world.clicks})),before);
    assert.equal(await page.locator('#produce').count(),0);assert.equal(await page.locator('#goals-body .goal').count(),2);
    await page.evaluate(()=>setPanel('tech-panel',false));assert.ok(!(await page.locator('#tech-body').innerText()).includes('金手指'));
    await page.locator('[data-tile="1,0"]').dispatchEvent('click');assert.equal(await page.locator('#produce').count(),1);
    await page.evaluate(()=>setPanel('tech-panel',true));
   }
   if(file==='docs/ui-system.html')assert.ok(await page.locator('#building-tiles .bt-samples article').count()>0);
   if(file==='docs/ui-components.html')assert.equal(await page.locator('.goals .goal').count(),2);
   if(file==='docs/design.html'){
    await page.waitForFunction(()=>document.getElementById('summary').textContent.includes('固定策略样本'),null,{timeout:60000});
    assert.ok(await page.locator('#timeline tr').count()>20);
    assert.ok((await page.locator('#first-sales').innerText()).includes('铁：第'));
    await page.locator('#model-seed').fill('2');await page.locator('#model-rounds').fill('200');await page.locator('#run').click();
    await page.waitForFunction(()=>document.getElementById('summary').textContent.includes('种子 2 · 200 回合'),null,{timeout:60000});
    await page.locator('#economy').scrollIntoViewIfNeeded();
   }
   if(file==='docs/mapgen.html'){
    await page.locator('#count').fill('1');await page.locator('#run').click();
    assert.ok((await page.locator('#stats').innerText()).includes('岩地'));
    await page.locator('#more').click();assert.equal(await page.locator('#count').inputValue(),'2');
   }
   await page.screenshot({path:path.resolve('tmp',`progression-${width}-${path.basename(file,'.html')}.png`),fullPage:false});
  }
  assert.deepEqual(errors,[]);console.log(`UI ${width}px: prototype, examples, economic model and map explorer passed`);await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
