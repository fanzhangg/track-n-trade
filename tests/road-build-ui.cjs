const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');

test('building detail road action connects a clicked building on desktop and narrow screens',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960}});
  const page=await context.newPage();
  try{
   await page.goto(pathToFileURL(path.resolve('index.html')).href);
   if(await page.locator('#mobile-advice').evaluate(e=>e.open))await page.getByRole('button',{name:'继续在手机上游玩'}).click();
   const entrances=await page.evaluate(()=>[...E.BUILDINGS,'town'].map(type=>{
    world=E.newWorld(1);world.paused=true;selected=type==='town'?E.START_TOWN:E.START_TILE;selectedEdge=null;
    if(type!=='town'){world.tiles[selected].building.type=type;world.tech[type]=1;}
    renderSelection();const button=document.getElementById('connect-accessible');
    return {type,visible:!!button&&!button.closest('details')&&button.getClientRects().length>0};
   }));
   assert.ok(entrances.every(row=>row.visible),JSON.stringify(entrances));
   const target=await page.evaluate(()=>{
    world=E.newWorld(1);world.money=1e7;world.paused=true;
    world.tech.sawmill=1;const occupied=new Set(Object.values(world.edges).flatMap(e=>[e.a,e.b]));const tile=Object.values(world.tiles).find(t=>t.terrain==='grass'&&!t.building&&!occupied.has(t.id));
    if(!tile)throw Error('No spare grass tile');
    E.command(world,{type:'build',tile:tile.id,buildType:'sawmill'});
    selected=E.START_TILE;selectedEdge=null;mapKey='';render();
    return tile.id;
   });
   assert.equal(await page.locator('#connect-accessible').evaluate(el=>!!el.closest('details')),false);
   await page.locator('#connect-accessible').click();await page.evaluate(id=>{const [x,y]=position(world.tiles[id]);centerOn(x,y);if(innerWidth<740){view.y+=(innerHeight/2-190)/view.scale;applyView();}},target);
   assert.equal(await page.evaluate(()=>connectFrom),await page.evaluate(()=>E.START_TILE));
   const price=page.locator(`[data-road-price="${target}"] button`);
   assert.equal(await page.locator('[data-road-price]').count(),1);
   assert.deepEqual(await page.evaluate(id=>{
    const original=world.tiles[id].building;
    const check=building=>{world.tiles[id].building=building;render();return {prices:document.querySelectorAll('[data-road-price]').length,previews:document.querySelectorAll('[data-road-preview]').length};};
    const unrelated=check({id:original.id,type:'town',buys:{stone:20},residents:1});
    const related=check({id:original.id,type:'town',buys:{log:20},residents:1});
    world.tiles[id].building=original;render();
    return {unrelated,related,reverse:roadTradePair(original,world.tiles[E.START_TILE].building),same:roadTradePair(original,original)};
   },target),{unrelated:{prices:0,previews:0},related:{prices:1,previews:1},reverse:true,same:false});
   assert.match(await price.innerText(),/\$[\d,]+/);
   assert.equal(await price.isEnabled(),true);
   assert.equal(await page.locator('#map.road-picking.chain').count(),1);
   assert.equal(await page.locator('#map .hex:not(.chain-node) .ground').first().evaluate(el=>getComputedStyle(el).opacity),'0.3');
   assert.equal(await page.locator(`[data-tile-ui="${target}"].chain-dim`).count(),0);
   await page.locator(`[data-tile="${target}"]`).focus();await page.keyboard.press('Enter');
   assert.notEqual(await page.evaluate(()=>connectFrom),null,'selecting a building does not purchase');
   assert.equal(await page.evaluate(()=>selected),target);
   assert.equal(await page.locator('#selection button').count(),0);
   assert.equal(await page.locator('[data-road-preview]').count(),1);
   await price.focus();
   await price.evaluate(el=>window.roadButtonBefore=el);await page.evaluate(()=>render());
   assert.equal(await price.evaluate(el=>el===window.roadButtonBefore&&el===document.activeElement),true);
   await page.keyboard.press('Escape');assert.equal(await page.locator('[data-road-price]').count(),0);
   await page.evaluate(()=>{selected=E.START_TILE;render();});
   const invalidTiles=await page.evaluate(()=>[E.START_TILE,E.START_TOWN,Object.values(world.tiles).find(t=>!t.building).id]);
   for(const id of invalidTiles){
    await page.locator('#connect-accessible').click();
    const before=await page.evaluate(()=>JSON.stringify(world));
    await page.locator(`[data-tile="${id}"]`).dispatchEvent('click');
    assert.equal(await page.evaluate(()=>connectFrom),null,'non-target tile cancels');
    assert.equal(await page.evaluate(()=>JSON.stringify(world)),before,'dismissal does not produce or purchase');
    assert.equal(await page.locator('[data-road-price]').count(),0);
   }
   for(const selector of ['#fog .fog-flower','#map','body']){
    await page.locator('#connect-accessible').click();
    await page.locator(selector).first().dispatchEvent('click',{clientX:-100,clientY:-100});
    assert.equal(await page.evaluate(()=>connectFrom),null,`${selector} cancels`);
   }
   await page.locator('#connect-accessible').click();
   await page.mouse.move(width/2,300);await page.mouse.down();await page.mouse.move(width/2+30,330,{steps:5});await page.mouse.up();
   assert.notEqual(await page.evaluate(()=>connectFrom),null,'panning preserves road picking');
   assert.equal(await page.locator('[data-road-preview]').count(),1,'panning preserves preview paths');
   await page.keyboard.press('Escape');
   await page.evaluate(()=>{world.money=0;render();});await page.locator('#connect-accessible').click();
   assert.equal(await price.isDisabled(),true);
   const poorColor=await price.evaluate(el=>getComputedStyle(el).getPropertyValue('--button-bg'));
   assert.match(await price.getAttribute('title'),/还差/);
   await page.evaluate(()=>{world.money=1e7;render();});assert.equal(await price.isEnabled(),true);
   assert.notEqual(await price.evaluate(el=>getComputedStyle(el).getPropertyValue('--button-bg')),poorColor);
   await price.click();
   assert.ok(await page.evaluate(id=>E.path(world,E.START_TILE,id),target));
   assert.equal(await page.locator('[data-road-price]').count(),0);
   assert.equal(await page.evaluate(()=>connectFrom),null);
   const old=await page.evaluate(()=>Object.values(world.edges).find(e=>e.road===E.edgeId(E.START_TILE,E.START_TOWN)).id);
   const road=page.locator(`[data-edge="${old}"]`);
   await road.focus();await road.press('Enter');
   assert.equal(await page.locator('.road.selected').count(),2);
   assert.ok(await page.locator('.road').count()>2);
   assert.match(await page.locator('#selection').innerText(),/仅管理这条连接/);
   await page.getByRole('button',{name:/拆除整条路/}).click();
   assert.ok(await page.evaluate(id=>E.path(world,E.START_TILE,id),target),'the other connection still works');
   assert.equal(await page.locator('.road.removing').count(),2);
   await page.getByRole('button',{name:/撤销拆除/}).click();
   await page.goto(pathToFileURL(path.resolve('docs/ui-system.html')).href);
   const samples=page.locator('.bt-road-demo .road-hit');
   await samples.first().focus();await samples.first().press('Enter');
   assert.equal(await page.locator('.bt-road-demo .road.selected').count(),2);
   await samples.last().focus();await samples.last().press('Enter');
   assert.equal(await page.locator('.bt-road-demo .road.selected').count(),1);
   await page.goto(pathToFileURL(path.resolve('docs/ui-components.html')).href);
   await page.locator('#road-start-demo').click();
   assert.equal(await page.locator('#road-target-demo').isVisible(),true);
   assert.equal(await page.locator('#road-poor-demo').isDisabled(),true);
   await page.locator('#road-build-demo-map').dispatchEvent('click');
   assert.match(await page.locator('#road-build-demo-state').innerText(),/已取消修路/);
   assert.equal(await page.locator('#road-target-demo').isVisible(),false);
   await page.locator('#road-start-demo').click();
   await page.locator('#road-target-demo').focus();await page.keyboard.press('Enter');
   assert.match(await page.locator('#road-build-demo-state').innerText(),/已连接锯木厂/);
  }finally{await context.close();}
 }}finally{await browser.close();}
});
