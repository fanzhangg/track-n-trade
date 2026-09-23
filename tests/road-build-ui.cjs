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
   const target=await page.evaluate(()=>{
    world=E.newWorld(1);world.money=1e7;world.paused=true;
    world.tech.sawmill=1;const occupied=new Set(Object.values(world.edges).flatMap(e=>[e.a,e.b]));const tile=Object.values(world.tiles).find(t=>t.terrain==='grass'&&!t.building&&!occupied.has(t.id));
    if(!tile)throw Error('No spare grass tile');
    E.command(world,{type:'build',tile:tile.id,buildType:'sawmill'});
    selected=E.START_TILE;selectedEdge=null;mapKey='';render();
    return tile.id;
   });
   await page.locator('details.more[data-key="manage"] summary').click();
   await page.locator('#connect-accessible').click();await page.evaluate(id=>{const [x,y]=position(world.tiles[id]);centerOn(x,y);if(innerWidth<740){view.y+=(innerHeight/2-190)/view.scale;applyView();}},target);
   assert.equal(await page.evaluate(()=>connectFrom),await page.evaluate(()=>E.START_TILE));
   const point=await page.locator(`[data-tile="${target}"] .ground`).evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
   await page.mouse.click(point.x,point.y);
   assert.ok(await page.evaluate(id=>E.path(world,E.START_TILE,id),target));
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
  }finally{await context.close();}
 }}finally{await browser.close();}
});
