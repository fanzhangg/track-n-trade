const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(()=>{
   world=E.newWorld(1);world.paused=true;world.money=1e8;
   const unlock=k=>{for(const d of E.TECH[k].requires)if(!world.tech[d])unlock(d);if(!world.tech[k])E.command(world,{type:'tech',key:k});};
   for(let i=0;i<16;i++){const f=Object.values(world.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(world,{type:'explore',flower:f.id});}
   for(const b of E.NEW_BUILDINGS)unlock(b);
   for(const b of E.NEW_BUILDINGS){const t=Object.values(world.tiles).find(t=>t.terrain==='grass'&&!t.building);E.command(world,{type:'build',tile:t.id,buildType:b});E.command(world,{type:'worker',tile:t.id});}
   const factory=Object.values(world.tiles).find(t=>t.building?.type==='machineWorks');selected=factory.id;mapKey='';render();
   openIndustry();selectIndustry('machineWorks');
  });
  assert.equal(await page.locator('[data-industry]').count(),10);
  assert.match(await page.locator('#planner-extra').innerText(),/木板[\s\S]*铁[\s\S]*木炭/);
  assert.match(await page.locator('#selection').innerText(),/木炭/);
  assert.equal(await page.locator('[data-build="machineWorks"]').count(),1);
  await page.locator('#planner-fit').click();
  await page.screenshot({path:`tmp/chains-${width}-game.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>E.validate(world));
  assert.equal(await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>i.complete&&!i.naturalWidth).length),0);
  await page.reload();assert.equal(await page.evaluate(()=>world.schemaVersion),25);
  assert.equal(await page.evaluate(()=>Object.values(world.tiles).filter(t=>E.NEW_BUILDINGS.includes(t.building?.type)).length),4);
  for(const file of ['docs/ui-system.html','docs/ui-components.html']){
   await page.goto(pathToFileURL(path.resolve(file)).href);
   if(file.includes('components')){assert.equal(await page.locator('#expanded-chain-samples .chain-recipe').count(),4);await page.locator('#expanded-chain-samples').scrollIntoViewIfNeeded();}
   else await page.locator('#building-tiles .bt-samples article').filter({hasText:'炭窑'}).first().scrollIntoViewIfNeeded();
   await page.screenshot({path:`tmp/chains-${width}-${path.basename(file,'.html')}.png`});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>i.complete&&!i.naturalWidth).length),0);
  }
  assert.deepEqual(errors,[]);console.log(`Chains UI ${width}: recipes, new assets, toolbar, details, reload and design samples passed`);await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
