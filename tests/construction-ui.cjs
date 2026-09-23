const {chromium}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL}=require('node:url'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(()=>{world=E.newWorld(1);world.money=1e6;world.paused=true;E.command(world,{type:'demolish',tile:E.START_TILE});E.command(world,{type:'build',tile:E.START_TILE,buildType:'camp'});selected=E.START_TILE;render();});
  assert.equal(await page.locator('#project-list').isVisible(),false);assert.equal(await page.locator('[data-industry-kind=build][data-industry-state=progress] .industry-action-label').innerText(),'建造中');
  assert.match(await page.locator('.construction-meter').textContent(),/建造 · 0%/);
  assert.equal(await page.locator('.construction-meter .bt-float-bg').getAttribute('rx'),'8');assert.equal(await page.locator('.construction-meter clipPath rect').getAttribute('rx'),'8');
  await page.locator('#industry-open').click();await page.locator('[data-industry="quarry"]').click();
  const buy=page.locator('#tech-body .industry-button');assert.ok(await buy.isEnabled());assert.equal(await buy.locator('.industry-action-label').innerText(),'解锁');
  assert.doesNotMatch(await buy.innerText(),/回合|可解锁|可升级|加成/);await buy.click();assert.ok(await page.locator('#tech-body .industry-button').isDisabled());
  await page.locator('#industry-close').click();
  await page.evaluate(()=>{for(let i=0;i<16;i++)E.tick(world);render();});
  assert.equal(await page.locator('#project-list .industry-button').count(),1);
  assert.match(await page.locator('#project-list').innerText(),/采石场/);assert.doesNotMatch(await page.locator('#project-list').innerText(),/伐木营|剩余|回合/);
  await page.screenshot({path:`tmp/quiet-construction-${width}.png`});
  await page.locator('[data-progress-tech="quarry"]').click();
  assert.ok(await page.locator('#industry-dialog').isVisible());assert.equal(await page.evaluate(()=>industrySelected),'quarry');
  for(const selector of ['#tech-body .industry-button','[data-industry="quarry"]','#project-list .industry-button'])assert.equal(await page.locator(selector+' .industry-action-label').innerText(),'解锁中');const percent=await page.locator('#tech-body .industry-progress').getAttribute('aria-valuenow');
  assert.equal(await page.locator('[data-industry="quarry"] .industry-progress').getAttribute('aria-valuenow'),percent);
  assert.doesNotMatch(await page.locator('#planner-graph').innerText(),/回合|可解锁|可升级|每人|加成/);
  await page.screenshot({path:`tmp/quiet-research-${width}.png`});
  await page.evaluate(()=>{while(E.techProgress(world,'quarry'))E.tick(world);render();});
  assert.equal(await page.locator('#project-list .industry-button').count(),0);
  assert.equal(await page.locator('#tech-body .industry-button').getAttribute('data-industry-kind'),'upgrade');
  await page.locator('#tech-body .industry-button').click();assert.ok(await page.locator('#tech-body .industry-button').isDisabled());
  assert.match(await page.locator('#tech-body .industry-action-label').innerText(),/工艺升级中/);assert.equal(await page.locator('#planner-extra [data-build] .industry-action-label').innerText(),'建造');assert.ok(await page.locator('#planner-extra [data-build]').evaluate(el=>el.classList.contains('industry-button')));assert.deepEqual(errors,[]);await page.close();
 }
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('docs/ui-components.html')).href);
  await page.locator('#industry-button-samples [data-demo-tech="quarry"]').click();await page.locator('#industry-demo-step').click();
  assert.equal(await page.locator('#industry-button-samples .industry-progress').count(),1);
  await page.screenshot({path:`tmp/quiet-samples-${width}.png`});assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
