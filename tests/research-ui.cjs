// Isolated contexts keep all sample purchases away from the player's progress.
const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(()=>{world=E.newWorld(4);world.paused=true;world.money=100000;render();openIndustry();setIndustryMode('tech');selectIndustry('waterPower');});
  assert.equal(await page.locator('[data-industry]').count(),2);
  assert.equal(await page.locator('[data-tech="waterPower"]').count(),0);
  await page.evaluate(()=>{
   for(let i=0;i<8;i++){const f=Object.values(world.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(world,{type:'explore',flower:f.id});}
   function unlock(k){for(const d of E.TECH[k].requires)if(!world.tech[d])unlock(d);if(!world.tech[k])E.command(world,{type:'tech',key:k});}
  for(const k of ['mason','waterway','mine','smelter','sawmillCraft'])unlock(k);render();
  });
  assert.ok(await page.locator('[data-industry="waterPower"]').count()>0);
  for(const key of ['roadEngineering','navigation','waterPower','specialization','mountainPass','deepMining']){
   await page.evaluate(k=>selectIndustry(k),key);
   const node=page.locator(`[data-tech="${key}"]`),money=await page.evaluate(()=>world.money);
   const cost=await page.evaluate(k=>E.techCost(world,k),key);
   await node.locator('button').click();
   assert.equal(await page.evaluate(()=>world.money),money-cost);
   assert.match(await node.innerText(),/已研究/);assert.equal(await node.locator('button').count(),0);
  }
  await page.evaluate(()=>selectIndustry('waterPower'));
  await page.screenshot({path:path.resolve('tmp',`research-${width}.png`)});
  await page.evaluate(()=>{world.tech.deepMining=0;world.money=0;selectIndustry('deepMining');render();});
  assert.ok(await page.locator('[data-tech="deepMining"]').evaluate(el=>el.classList.contains('costly')));
  assert.ok(await page.locator('[data-tech="deepMining"] button').isDisabled());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>{
   world.money=100000;const lake=world.tiles['1,-1'];lake.terrain='lake';world.flowers['0,0'].design.ring[1]='lake';
   E.command(world,{type:'build',tile:'0,0',buildType:'sawmill'});
   for(let i=0;i<2;i++)E.command(world,{type:'worker',tile:'0,0'});
   selected='0,0';$('industry-dialog').close();mapKey='';render();
  });
  assert.match(await page.locator('#selection').innerText(),/每回合多产 6 件/);
  await page.locator('#selection button').filter({hasText:'雇用工人'}).click();
  await page.locator('#selection [data-key="bonuses"]>summary').click();assert.match(await page.locator('#selection').innerText(),/水力机械[\s\S]*\+3[\s\S]*件／回合[\s\S]*专业分工[\s\S]*\+3[\s\S]*件／回合/);
  assert.equal(await page.evaluate(()=>E.rate(world,world.tiles['0,0'])),12);
  assert.match(await page.evaluate(()=>E.researchStatus(world,'specialization')),/1 \/ 1 座加工工坊满 3 人/);
  await page.screenshot({path:path.resolve('tmp',`research-${width}-production.png`)});
  await page.evaluate(()=>{$('industry-dialog').close();const t=Object.values(world.tiles).find(t=>t.terrain==='mountain');selected=t.id;render();});
  assert.match(await page.locator('#selection').innerText(),/山地工程已开放/);
  await page.goto('about:blank'); // Let the game finish its normal page-leave save first.
  await page.addInitScript(()=>{
   window.progressAccess=[];
   for(const method of ['getItem','setItem','removeItem']){
    const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(key==='tnt-mvp-v17')window.progressAccess.push(method);return original.call(this,key,...args);};
   }
  });
  for(const file of ['docs/ui-system.html','docs/ui-components.html']){
   await page.goto(pathToFileURL(path.resolve(file)).href);
   if(file.endsWith('ui-components.html')){
    await page.locator('#research-demo').click();assert.match(await page.locator('.node.kind-road').innerText(),/已研究/);
    await page.locator('.node.kind-road').scrollIntoViewIfNeeded();
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.resolve('tmp',`research-${width}-${path.basename(file,'.html')}.png`)});
   assert.deepEqual(await page.evaluate(()=>window.progressAccess),[]);
  }
  assert.deepEqual(errors,[]);console.log(`Research UI ${width}px: unlock, prerequisites, owned, unaffordable, mountain and isolated examples passed`);await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
