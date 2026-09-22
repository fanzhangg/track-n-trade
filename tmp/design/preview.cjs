const { chromium } = require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  for (const name of ['tracks_trade_gameplay_spec','tracks_trade_mvp_design']) {
    await page.goto(pathToFileURL(path.resolve('docs',name+'.html')).href);
    await page.screenshot({path:path.resolve('tmp/design',name+'-desktop.png')});
    console.log(name, await page.evaluate(() => ({title:document.title, sections:document.querySelectorAll('section').length, horizontalOverflow:document.documentElement.scrollWidth>innerWidth, brokenImages:[...document.images].filter(x=>!x.complete||!x.naturalWidth).length})));
    if (name.includes('gameplay')) {
      await page.locator('#logistics').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.resolve('tmp/design','logistics-desktop.png')});
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(pathToFileURL(path.resolve('docs',name+'.html')).href);
    await page.screenshot({path:path.resolve('tmp/design',name+'-mobile.png')});
    console.log(name,'mobile',await page.evaluate(()=>({horizontalOverflow:document.documentElement.scrollWidth>innerWidth, width:document.documentElement.scrollWidth})));
    await page.setViewportSize({width:1440,height:1000});
  }
  await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
