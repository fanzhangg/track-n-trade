// Every browser context is isolated from player progress.
const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(()=>{world=E.newWorld(5);world.money=1e6;world.paused=true;E.command(world,{type:'tech',key:'quarry'});E.command(world,{type:'tech',key:'sawmill'});E.command(world,{type:'build',tile:'0,0',buildType:'sawmill'});E.command(world,{type:'worker',tile:'0,0'});world.tech.sawmillCraft=10;selected='0,0';for(let i=0;i<50;i++)E.tick(world);mapKey='';render();});
  let text=await page.locator('#selection').innerText();assert.match(text,/固定产量/);assert.match(text,/11 件木板/);assert.equal(await page.locator('#selection [data-key="recipe"]').getAttribute('open'),null);assert.doesNotMatch(text,/自动效率|积压|满仓|瓶颈|运入|消耗/);
  assert.equal(await page.locator('.tile-store.full,.inventory-warning').count(),0);
  await page.screenshot({path:`tmp/casual-${width}-workshop.png`});
  const before=await page.evaluate(()=>({money:world.money,workers:world.tiles['0,0'].building.workers.length,cost:E.workerCost(world,world.tiles['0,0']),clicks:world.clicks,craft:world.tech.sawmillCraft}));
  assert.ok(await page.locator('#selection .detail-button>.tt-icon').count()>=3);
  await page.locator('#produce').click();assert.equal(await page.evaluate(()=>world.clicks),before.clicks+1);assert.equal(await page.evaluate(()=>document.activeElement.id),'produce');
  await page.locator('#selection [data-command]').filter({hasText:'雇用工人'}).click();assert.equal(await page.evaluate(()=>world.money),before.money-before.cost);
  await page.locator('#selection [data-key="craft"]>summary').click();await page.locator('#selection [data-command]').filter({hasText:'升级工艺'}).click();assert.equal(await page.evaluate(()=>world.tech.sawmillCraft),before.craft+1);
  await page.locator('#selection [data-key="manage"]>summary').click();assert.ok(await page.locator('#connect-accessible').isVisible());await page.locator('#connect-accessible').click();assert.equal(await page.evaluate(()=>connectFrom),'0,0');await page.keyboard.press('Escape');
  await page.evaluate(()=>{world.money=0;render();});assert.ok(await page.locator('#selection [data-command]').filter({hasText:'雇用工人'}).isDisabled());await page.evaluate(()=>{world.money=1e6;render();});
  await page.evaluate(()=>{for(const edge of Object.keys(world.edges))E.command(world,{type:'removeRoad',edge});E.tick(world);render();});
  assert.match(await page.locator('#selection').innerText(),/待连接伐木营/);
  await page.evaluate(()=>{selected=E.START_TOWN;render();});assert.match(await page.locator('#selection').innerText(),/不限量收购/);
  const old=await page.evaluate(()=>townRevenue(E.START_TOWN,'log'));
  await page.locator('#selection [data-command]').filter({hasText:'增加居民'}).click();
  assert.equal(await page.evaluate(()=>townRevenue(E.START_TOWN,'log')),old);await page.locator('#selection [data-key="market"]>summary').click();assert.match(await page.locator('#selection').innerText(),/售价加成 25%/);
  await page.screenshot({path:`tmp/casual-${width}-town.png`});
  await page.locator('#industry-open').click();assert.ok(await page.locator('#industry-dialog').isVisible());await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const saved=await page.evaluate(()=>JSON.stringify(localStorage));await page.goto(pathToFileURL(path.resolve('docs/ui-components.html')).href);assert.equal(await page.locator('#unified-building-demo .workshop-metrics').count(),1);assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),saved);
  await page.screenshot({path:`tmp/casual-${width}-components.png`});assert.deepEqual(errors,[]);await context.close();console.log(`Casual ${width}px: production, disconnection, unlimited market, price history, planner and isolated samples passed`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
