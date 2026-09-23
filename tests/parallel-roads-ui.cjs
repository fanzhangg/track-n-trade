const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
test('each parallel lane can be hovered, selected and removed independently',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:960}});
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(()=>{
   world=E.newWorld(1);world.paused=true;selected=null;selectedEdge=null;
   const original=Object.values(world.edges);for(const e of original){e.road='A';world.edges[e.id+'#B']={...e,id:e.id+'#B',road:'B'};}
   mapKey='';render();centerOn(...position(world.tiles['0,0']),1.6);
   if(innerWidth<740){view.y+=(innerHeight/2-220)/view.scale;applyView();}
  });
  for(const road of ['A','B']){
   const point=await page.evaluate(road=>{
    const e=Object.values(world.edges).find(e=>e.road===road),shape=decorativeRoads.roads.get(e.id),p=shape.at(.65);
    const screen=new DOMPoint(...p).matrixTransform(svg.getScreenCTM());return{x:screen.x,y:screen.y};
   },road);
   await page.mouse.move(point.x,point.y);
   assert.equal(await page.locator('#roads .road.hovered').count(),2);
   assert.equal(await page.evaluate(()=>world.edges[hoveredRoad].road),road);
   await page.mouse.click(point.x,point.y);
   assert.equal(await page.evaluate(()=>world.edges[selectedEdge].road),road);
   assert.equal(await page.locator('#roads .road.selected').count(),2);
   await page.evaluate(()=>render());
   assert.equal(await page.locator('#roads .road.hovered').count(),2,'render preserves entire hovered connection');
  }
  await page.getByRole('button',{name:/拆除整条路/}).click();
  assert.equal(await page.locator('#roads .road.removing').count(),2);
  assert.ok(await page.evaluate(()=>Object.values(world.edges).filter(e=>e.road==='A').every(e=>!e.removing)));
  await page.goto(pathToFileURL(path.resolve('docs/ui-system.html')).href);
  const demo=page.locator('.parallel-road-demo');await demo.scrollIntoViewIfNeeded();
  await demo.locator('[data-parallel="A"] .road-hit').first().focus();
  assert.equal(await demo.locator('.road.hovered').count(),5);
  await page.keyboard.press('Enter');assert.equal(await demo.locator('.road.selected').count(),5);
  await page.screenshot({path:path.join(require('node:os').tmpdir(),`parallel-roads-${width}.png`)});
  await page.close();
 }}finally{await browser.close();}
});
