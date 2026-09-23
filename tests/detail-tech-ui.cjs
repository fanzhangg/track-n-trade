const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(()=>{
   world=E.newWorld(1);world.paused=true;world.money=100000;
   for(let i=0;i<2;i++){const f=Object.values(world.flowers).find(f=>f.state==='fog');E.command(world,{type:'explore',flower:f.id});}
   selected=Object.values(world.tiles).find(t=>t.terrain==='rock'&&!t.building).id;mapKey='';render();
  });
  assert.equal(await page.locator('#growth-panel').count(),0);
  assert.equal(await page.locator('#selection [data-command*="quarry"]').count(),1);
  await page.locator('#selection button').filter({hasText:'解锁采石场'}).click();
  assert.equal(await page.evaluate(()=>world.tech.quarry),1);
  assert.ok(await page.locator('#selection button').filter({hasText:'建造采石场'}).count()>0);
  await page.evaluate(()=>{selected=E.START_TILE;render();});
  const beforeCraft=await page.evaluate(()=>world.tech.campCraft);
  await page.locator('#selection button').filter({hasText:'升级工艺'}).click();
  assert.equal(await page.evaluate(()=>world.tech.campCraft),beforeCraft+1);
  await page.evaluate(()=>{selected=E.START_TOWN;render();});
  const beforeEra=await page.evaluate(()=>world.tech.era);
  await page.locator('#selection button').filter({hasText:'提升时代'}).click();
  assert.equal(await page.evaluate(()=>world.tech.era),beforeEra+1);
  await page.evaluate(()=>{
   while(!E.boughtGoods(world).has('tool')){const f=Object.values(world.flowers).find(f=>f.state==='fog');E.command(world,{type:'explore',flower:f.id});}E.command(world,{type:'tech',key:'sawmill'});E.command(world,{type:'tech',key:'mason'});
   selected=null;selectedEdge=Object.keys(world.edges)[0];render();
  });
  await page.locator('#selection button').filter({hasText:'研究石工筑路'}).click();
  assert.equal(await page.evaluate(()=>world.tech.roadEngineering),1);
  assert.deepEqual(errors,[]);await context.close();
  console.log(`Detail tech ${width}px: direct unlock, craft, era, no growth panel passed`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
