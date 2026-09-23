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
   assert.equal(await page.locator('[data-road-target]').count(),1);
   assert.equal(await page.locator(`[data-road-target="${target}"]`).count(),1);
   assert.match(await page.locator('#build-intent').innerText(),/1 座可连接/);
   await page.locator(`[data-tile="${target}"]`).focus();
   assert.equal(await page.locator(`[data-road-target="${target}"].hover`).count(),1);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('[data-road-target]').count(),0);
   await page.evaluate(()=>{world.money=0;render();});
   await page.locator('#connect-accessible').click();
   assert.equal(await page.locator('[data-road-target].unaffordable').count(),1);
   const poorColor=await page.locator('[data-road-target]').evaluate(el=>getComputedStyle(el).stroke);
   assert.match(await page.locator('#build-intent').innerText(),/金币不足/);
   await page.locator(`[data-tile="${target}"]`).focus();await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>world.money),0);
   assert.notEqual(await page.evaluate(()=>connectFrom),null);
   assert.equal(await page.locator('[data-road-target].unaffordable').count(),1);
   await page.evaluate(()=>{world.money=1e7;render();});
   assert.equal(await page.locator('[data-road-target].affordable').count(),1);
   assert.notEqual(await page.locator('[data-road-target]').evaluate(el=>getComputedStyle(el).stroke),poorColor);
   const point=await page.locator(`[data-tile="${target}"] .ground`).evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
   await page.mouse.click(point.x,point.y);
   assert.ok(await page.evaluate(id=>E.path(world,E.START_TILE,id),target));
   assert.equal(await page.locator('[data-road-target]').count(),0);
   assert.equal(await page.evaluate(()=>connectFrom),null,JSON.stringify(await page.evaluate(([x,y])=>({x,y,view:document.querySelector('#map').getAttribute('viewBox'),at:tileAt(x,y),top:document.elementFromPoint(x,y)?.outerHTML.slice(0,200),toast:document.querySelector('#toast').textContent,selected,connectFrom}),[point.x,point.y])));
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
   assert.equal(await page.locator('#road-target-demo .hl').evaluate(el=>el.hasAttribute('hidden')),false);
   assert.equal(await page.locator('#road-poor-demo .hl').evaluate(el=>el.hasAttribute('hidden')),false);
   await page.locator('#road-poor-demo').focus();await page.keyboard.press('Enter');
   assert.match(await page.locator('#road-build-demo-state').innerText(),/金币不足/);
   await page.locator('#road-target-demo').focus();await page.keyboard.press('Enter');
   assert.match(await page.locator('#road-build-demo-state').innerText(),/已连接锯木厂/);
  }finally{await context.close();}
 }}finally{await browser.close();}
});
