// Standalone regression runner; use an isolated browser profile, never a live save.
const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  assert.equal(await page.locator('[data-tile]').count(),37);
  const money=async()=>+(await page.locator('#totals .coins strong').innerText()).replace(/,/g,'');
  assert.equal(await money(),1000);
  assert.ok((await page.locator('#contract-strip').innerText()).includes('第一步'));
  // Illegal: quarry to camp has nothing to carry, refused with a reason and no roads.
  await page.locator('[data-tile="-1,0"]').dragTo(page.locator('[data-tile="0,-1"]'));
  assert.equal(await page.locator('.road-hit').count(),2);
  assert.ok((await page.locator('#toast').innerText()).includes('不需要石头'));
  // Unaffordable: east town needs a bridge and rich-rock segments (2850 coins).
  await page.locator('[data-tile="0,0"]').dragTo(page.locator('[data-tile="3,-1"]'));
  assert.equal(await page.locator('.road-hit').count(),2);
  assert.ok((await page.locator('#toast').innerText()).includes('金币不足'));
  // Affordable: quarry to west town over rock and forest costs exactly the starting 1000 coins.
  await page.locator('[data-tile="-1,0"]').dragTo(page.locator('[data-tile="-3,1"]'));
  assert.equal(await page.locator('.road-hit').count(),4);
  assert.equal(await money(),0);
  await page.locator('[data-tile="-3,1"]').click();
  assert.equal(await page.locator('#selection h2').innerText(),'西镇');
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.waitForFunction(()=>+document.querySelector('#totals .coins strong').textContent.replace(/,/g,'')>=1200,null,{timeout:180000});
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  assert.ok((await page.locator('#contract-strip').innerText()).includes('西镇'));
  assert.ok(await page.locator('#freight').count()===1,'freight layer present');
  assert.ok(/\+\d+\/回合/.test(await page.locator('[data-tile="-3,1"]').textContent()),'town tile shows income only');
  assert.equal(await page.locator('.legend').count(),0,'no legend');
  await page.locator('[data-build="camp"]').dragTo(page.locator('[data-tile="-2,0"]'));
  assert.equal(await page.locator('[data-tile="-2,0"]').getAttribute('aria-label'),'伐木营 (-2,0)');
  await page.locator('[data-tile="-2,0"]').click();
  assert.equal(await page.locator('#selection h2').innerText(),'伐木营');
  const before=await money();
  await page.reload();
  assert.equal(await page.locator('[data-tile="-2,0"]').getAttribute('aria-label'),'伐木营 (-2,0)');
  assert.equal(await page.locator('.road-hit').count(),4);
  assert.equal(await money(),before);
  await page.screenshot({path:'tmp/design/prototype-v10-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'tmp/design/prototype-v10-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: illegal link refused, coin gate, terrain-priced road, automatic sales, town tile shows income, persistence, responsive layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
