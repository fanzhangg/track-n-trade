const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:844},hasTouch:true});
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  if(await page.locator('#mobile-advice').evaluate(e=>e.open))await page.getByRole('button',{name:'继续在手机上游玩'}).click();
  await page.evaluate(()=>{world=E.newWorld(1);world.paused=true;world.edges={};selected=E.START_TILE;mapKey='';render();});
  await page.locator('#connect-accessible').tap();
  await page.locator('#map-plus').tap();
  assert.ok(await page.evaluate(()=>connectFrom),'zoom must preserve road mode');
  const cdp=await page.context().newCDPSession(page);
  async function drag(x,y){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+35,y:y+15}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  const money=await page.evaluate(()=>world.money);
  await page.locator('#selection').dispatchEvent('pointercancel',{pointerId:99,pointerType:'touch'});
  assert.ok(await page.evaluate(()=>connectFrom),'panel scroll cancellation must preserve road mode');
  await drag(width/2,300);
  assert.ok(await page.evaluate(()=>connectFrom),'map drag must preserve road mode');
  await page.evaluate(()=>{const n=document.querySelector('[data-road-price]');centerOn(+n.getAttribute('x')+44,+n.getAttribute('y')+20,1.5);});
  const price=page.locator('[data-road-price] button').first(),box=await price.boundingBox();
  const before=await page.evaluate(()=>view.x);
  await drag(box.x+box.width/2,box.y+box.height/2);
  assert.notEqual(await page.evaluate(()=>view.x),before,'drag starting on price must pan');
  assert.ok(await page.evaluate(()=>connectFrom));
  assert.equal(await page.evaluate(()=>world.money),money,'drag must not buy');
  await page.screenshot({path:path.join(require('node:os').tmpdir(),`mobile-road-${width}.png`)});
  await page.waitForTimeout(400);await price.tap();await page.waitForFunction(()=>connectFrom===null,{},{timeout:3000});
  assert.equal(await page.evaluate(()=>connectFrom),null);
  assert.ok(await page.evaluate(()=>Object.keys(world.edges).length)>0,'tap builds road');
  assert.ok(await page.evaluate(()=>world.money)<money);
  await page.close();
  console.log('PASS touch road zoom/pan/price drag/purchase '+width);
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
