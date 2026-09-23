const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(()=>{world=E.newWorld(1);world.money=5000;world.paused=true;render();openIndustry();});
  assert.match(await page.locator('[data-industry="camp"]').innerText(),/工艺 I[\s\S]*可升级/);assert.match(await page.locator('[data-industry="quarry"]').innerText(),/可解锁/);
  await page.locator('[data-industry="quarry"]').click();await page.locator('#tech-body button').click();assert.match(await page.locator('[data-industry="quarry"]').innerText(),/工艺 I[\s\S]*可升级/);
  await page.locator('#tech-body button').click();assert.match(await page.locator('[data-industry="quarry"]').innerText(),/工艺 II/);assert.match(await page.locator('#tech-body button').innerText(),/升级工艺 · III/);
  await page.evaluate(()=>{world.money=0;render();});assert.match(await page.locator('#tech-body').innerText(),/还差/);assert.ok(await page.locator('#tech-body button').isDisabled());
  const deficit=await page.locator('.tech-shortfall').innerText();await page.evaluate(()=>{world.money=1;render();});assert.notEqual(await page.locator('.tech-shortfall').innerText(),deficit);
  await page.evaluate(()=>{world.money=1e6;E.command(world,{type:'tech',key:'sawmill'});E.command(world,{type:'tech',key:'waterway'});world.tech.era=4;setIndustryMode('tech');selectIndustry('era',true);});
  assert.match(await page.locator('[data-industry="era"]').innerText(),/V \/ V[\s\S]*已满级/);assert.equal(await page.locator('#tech-body button').count(),0);
  await page.locator('[data-industry="waterway"]').click();assert.match(await page.locator('#tech-body').innerText(),/已开通/);assert.equal(await page.locator('#tech-body button').count(),0);
  await page.evaluate(()=>{world.money=4000;selectIndustry('quarry',true);});
  await page.screenshot({path:`tmp/tech-states-${width}.png`});
  await page.evaluate(()=>{world.money=1e9;while(world.unlocked<16){const f=Object.values(world.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(world,{type:'explore',flower:f.id});}for(const key of ['mason','paperMill'])E.command(world,{type:'tech',key});selectIndustry('printer',true);});
  assert.equal(await page.locator('.planner-level').filter({hasText:'Lv.'}).count(),0);
  assert.ok(await page.locator('.planner-details').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:`tmp/tech-readable-${width}.png`});
  const clipped=await page.locator('.planner-node').evaluateAll(nodes=>nodes.filter(n=>n.scrollHeight>n.clientHeight+2).map(n=>n.dataset.industry));assert.deepEqual(clipped,[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();console.log(`${width}: unlock, upgrade, live shortfall, maximum era and completed research passed`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
