'use strict';
// Case catalog and navigation QA through real offline browser input.
// Optional tooling: npm install --no-save --package-lock=false playwright
// PLAYWRIGHT_PATH and CHROME_PATH can point to existing installations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const errors = [], remoteRequests = [], checks = [];
const entryHash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'index.html'))).digest('hex');
const testedEntry = entryHash();
const card = '[data-case="heartJourney"]';
let browser;
const snapshot = page => page.evaluate(() => window.GiantCure.snapshot());
const tick = (page, ms) => page.clock.runFor(ms);
async function click(page, selector, ms = 32) {
  await page.locator(selector).click();
  if (ms) await tick(page, ms);
}
const primary = page => click(page, '#dialog-actions .primary-button');
async function setup(context, seed) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('request', request => { if (!/^(file|data):/.test(request.url())) remoteRequests.push(request.url()); });
  const epoch = Date.parse('2026-10-21T05:00:00Z');
  await page.clock.install({ time: new Date(epoch) });
  await page.clock.pauseAt(new Date(epoch + 1000));
  if (seed) await page.addInitScript(values => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
  }, seed);
  await page.goto(url); await page.evaluate(async () => { if (window.GiantCureAssets) await window.GiantCureAssets.ready; }); await tick(page, 32);
  await page.waitForFunction(() => !!window.GiantCure && !!document.querySelector('[data-case="heartJourney"]'));
  return page;
}
async function mark(name, action) {
  await action(); checks.push(name); console.log('PASS ' + name);
  assert.deepEqual(errors, [], 'no browser runtime errors');
}
async function capture(page, name) {
  await tick(page, 2300); // Catalog screenshots should not include temporary setting toasts.
  const folder = path.join(__dirname, 'screenshots'); fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, 'catalog-' + name + '.png'), animations: 'disabled' });
}
async function expectState(page, screen, phase) {
  const state = await snapshot(page); assert.equal(state.screen, screen); assert.equal(state.phase, phase); return state;
}
async function inspectFit(page) {
  const fit = await page.evaluate(() => {
    const app = document.querySelector('#app').getBoundingClientRect();
    const visibleButtons = [...document.querySelectorAll('button')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && !el.closest('[inert]');
    });
    return { width: innerWidth, height: innerHeight,
      app: { x: app.x, y: app.y, right: app.right, bottom: app.bottom },
      scrollWidth: document.documentElement.scrollWidth,
      buttons: visibleButtons.map(el => { const r = el.getBoundingClientRect(); return { id: el.id || el.textContent.trim(), x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }) };
  });
  assert(fit.app.x >= -.5 && fit.app.y >= -.5 && fit.app.right <= fit.width + .5 && fit.app.bottom <= fit.height + .5, 'game stays inside viewport');
  assert(fit.scrollWidth <= fit.width, 'no horizontal document overflow');
  for (const b of fit.buttons) assert(b.x >= -.5 && b.y >= -.5 && b.right <= fit.width + .5 && b.bottom <= fit.height + .5, 'visible button fits viewport: ' + b.id);
}
async function assertCatalog(page, cured) {
  await expectState(page, 'cases', 'idle');
  assert.deepEqual(await page.locator('[data-case]').evaluateAll(cards => cards.map(el => el.dataset.case)), ['heartJourney']);
  assert.match(await page.locator('#record-summary').textContent(), new RegExp(cured + '\\s*\\/\\s*1'));
  assert.equal(await page.locator(card + ' .case-complete').isVisible(), !!cured);
  assert.equal(await page.locator('#tab-journey, #tab-quick, #random-case, #journey-start, [data-case="blood"], [data-case="spore"], [data-case="heart"]').count(), 0);
  assert.doesNotMatch(await page.locator('#cases').innerText(), /快捷治疗|血河淤堵|孢子侵染|心跳失序|90\s*秒/);
  await inspectFit(page);
}
async function assertDirectEntry(page) {
  await page.evaluate(async () => { if (window.GiantCureAssets) await window.GiantCureAssets.ready; }); await tick(page, 16);
  const state = await expectState(page, 'treatment', 'playing');
  assert.equal(state.id, 'heartJourney'); assert.equal(state.remaining, null);
  assert.equal(state.game.stage, 'diagnosis'); assert.equal(state.game.checkpoint, 'entry');
  assert.equal(state.game.health, 100); assert.equal(state.game.retries, 0);
  assert.equal(await page.locator('#modal').isHidden(), true, 'clicking a case needs no preparation dialog');
}

(async () => {
  console.log('INFO offline entry SHA-256: ' + testedEntry);
  const options = { headless: true }; if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(options);
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const page = await setup(context);

  await mark('file startup, help and sound remain usable with only the heart chapter registered', async () => {
    await expectState(page, 'home', 'idle'); await inspectFit(page);
    assert.deepEqual(await page.evaluate(() => Object.keys(window.GiantCureGames)), ['heartJourney']);
    await click(page, '#help'); assert(await page.locator('#dialog-title').isVisible()); await inspectFit(page);
    assert.doesNotMatch(await page.locator('#dialog-body').innerText(), /快捷治疗|血河淤堵|孢子侵染|心跳失序|90\s*秒/);
    await primary(page); await expectState(page, 'home', 'idle');
    await click(page, '#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    await click(page, '#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
  });

  await mark('the single case card enters heart journey directly without another start button', async () => {
    await click(page, '#begin'); await assertCatalog(page, 0); await capture(page, 'desktop');
    assert.match(await page.locator(card).innerText(), /心脏巡诊/);
    await click(page, card + ' strong'); await assertDirectEntry(page); await inspectFit(page);
  });

  await mark('help and pause freeze active time; returning to the case list starts a fresh chapter', async () => {
    await page.keyboard.down('KeyD'); await tick(page, 500); await page.keyboard.up('KeyD');
    await click(page, '#help'); const helpTime = (await snapshot(page)).elapsed;
    await tick(page, 4000); assert.equal((await snapshot(page)).elapsed, helpTime); await primary(page);
    await tick(page, 500); assert((await snapshot(page)).elapsed > helpTime + .4);
    await click(page, '#pause'); const pauseTime = (await snapshot(page)).elapsed;
    await tick(page, 4000); assert.equal((await snapshot(page)).elapsed, pauseTime);
    assert.equal(await page.locator('#dialog-actions button').count(), 3);
    assert.match(await page.locator('#dialog-actions button:last-child').innerText(), /返回病历簿/);
    await click(page, '#dialog-actions button:last-child'); await assertCatalog(page, 0);
    await page.locator(card).focus(); await page.keyboard.press('Enter'); await tick(page, 32); await assertDirectEntry(page);
    assert((await snapshot(page)).elapsed < .1);
  });

  await mark('cover navigation can resume safely or leave the chapter and reopen the catalog', async () => {
    await click(page, '#brand'); await expectState(page, 'treatment', 'paused');
    await primary(page); await expectState(page, 'treatment', 'playing');
    await click(page, '#brand'); await click(page, '#dialog-actions .secondary-button');
    await expectState(page, 'home', 'idle'); await click(page, '#begin'); await assertCatalog(page, 0);
    await click(page, '#case-back'); await expectState(page, 'home', 'idle');
    await page.reload(); await tick(page, 32); await expectState(page, 'home', 'idle');
    await click(page, '#begin'); await assertCatalog(page, 0);
  });

  await mark('old quick-game wins cannot complete the heart chapter or inflate its catalog count', async () => {
    const legacyContext = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
    const legacy = await setup(legacyContext, { 'giant-cure-records-v1': {
      blood: { wins: 3, best: 1500, stars: 3 }, spore: { wins: 2, best: 1400, stars: 3 }, heart: { wins: 1, best: 1300, stars: 3 }
    } });
    await click(legacy, '#begin'); await assertCatalog(legacy, 0);
    assert.doesNotMatch(await legacy.locator(card + ' .case-mechanic').innerText(), /最佳/);
    await click(legacy, card); await assertDirectEntry(legacy); await legacyContext.close();
  });

  await mark('real heart records show one completed case, its completion badge and best time after refresh', async () => {
    const recordedContext = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
    const recorded = await setup(recordedContext, { 'giant-cure-journey-v1': { wins: 2, bestSeconds: 198 } });
    await click(recorded, '#begin'); await assertCatalog(recorded, 1);
    assert.match(await recorded.locator(card + ' .case-mechanic').innerText(), /最佳.*198.*秒/);
    await capture(recorded, 'completed');
    await recorded.reload(); await tick(recorded, 32); await expectState(recorded, 'home', 'idle');
    await click(recorded, '#begin'); await assertCatalog(recorded, 1);
    await click(recorded, card); await assertDirectEntry(recorded); await recordedContext.close();
  });

  for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
    await mark(`mobile ${size.width}×${size.height}: catalog fits and touch opens the chapter directly`, async () => {
      const mobileContext = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const mobile = await setup(mobileContext); await inspectFit(mobile);
      await mobile.locator('#begin').tap(); await tick(mobile, 32); await assertCatalog(mobile, 0);
      await capture(mobile, `${size.width}x${size.height}`);
      await mobile.locator(card).tap(); await tick(mobile, 32); await assertDirectEntry(mobile); await inspectFit(mobile);
      await mobile.locator('#pause').tap(); await tick(mobile, 32); await inspectFit(mobile);
      await mobile.locator('#dialog-actions button:last-child').tap(); await tick(mobile, 32); await assertCatalog(mobile, 0);
      await mobile.locator('#help').tap(); await tick(mobile, 32); await inspectFit(mobile); await primary(mobile);
      await click(mobile, '#case-back'); await expectState(mobile, 'home', 'idle'); await mobileContext.close();
    });
  }
  assert.deepEqual(errors, [], 'no browser runtime errors'); assert.deepEqual(remoteRequests, [], 'no external resource requests'); assert.equal(entryHash(), testedEntry, 'offline entry remains identical throughout the suite');
  console.log(`\n${checks.length} case-catalog browser checks passed; no errors or external requests.`);
})().catch(error => {
  console.error(error.stack || error); if (errors.length) console.error('Page errors:', errors); if (remoteRequests.length) console.error('External requests:', remoteRequests); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
