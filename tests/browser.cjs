'use strict';
// Full input-driven offline browser QA: node tests/browser.cjs
// Install optional QA tooling with: npm install --no-save --package-lock=false playwright
// Then: npx playwright install chromium
// PLAYWRIGHT_PATH and CHROME_PATH may override the standard dependency and browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const index = path.join(root, 'index.html');
const url = pathToFileURL(index).href;
const errors = [], remoteRequests = [], checks = [];
let browser;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForBuild() {
  for (let i = 0; i < 60 && !fs.existsSync(index); i++) await wait(500);
  assert(fs.existsSync(index), 'Build index.html with node scripts/bundle.js before browser QA');
}
function watch(page) {
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('request', request => {
    if (!/^(file|data):/.test(request.url())) remoteRequests.push(request.url());
  });
}
async function setup(context, size, frameGap = 0) {
  const page = await context.newPage(); watch(page);
  if (size) await page.setViewportSize(size);
  const epoch = Date.parse('2026-10-21T05:00:00Z');
  await page.clock.install({ time: new Date(epoch) });
  await page.clock.pauseAt(new Date(epoch + 1000));
  if (frameGap) await page.addInitScript(gap => {
    // Emulate a slow display through the browser scheduling API, never through game state.
    const nativeFrame = window.requestAnimationFrame.bind(window);
    let lastDelivered = -Infinity;
    window.requestAnimationFrame = callback => nativeFrame(function deliver(time) {
      if (time - lastDelivered >= gap) { lastDelivered = time; callback(time); }
      else nativeFrame(deliver);
    });
  }, frameGap);
  await page.goto(url); await page.clock.runFor(32);
  await page.waitForFunction(() => !!window.GiantCure);
  return page;
}
const snapshot = page => page.evaluate(() => window.GiantCure.snapshot());
const tick = (page, ms) => page.clock.runFor(ms);
async function click(page, selector, ms = 32) {
  await page.locator(selector).click({ force: true });
  if (ms) await tick(page, ms);
}
async function primary(page) { await click(page, '#dialog-actions .primary-button'); }
async function capture(page, name) {
  const folder = path.join(__dirname, 'screenshots'); fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, name + '.png'), animations: 'disabled' });
}
async function expectState(page, screen, phase) {
  const state = await snapshot(page);
  assert.equal(state.screen, screen);
  if (phase) assert.equal(state.phase, phase);
  return state;
}
async function point(page, logical) {
  const box = await page.locator('#world').boundingBox();
  return { x: box.x + logical.x * box.width / 720, y: box.y + logical.y * box.height / 1280 };
}
async function tapCanvas(page, logical, touch = false) {
  const p = await point(page, logical);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function dragCanvas(page, from, to) {
  const a = await point(page, from), b = await point(page, to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
}
async function touchDrag(page, from, to, cancel = false) {
  const a = await point(page, from), b = await point(page, to);
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  for (let i = 1; i <= 8; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  await session.detach();
}
async function openCase(page, id) {
  await click(page, `[data-case="${id}"]`); await primary(page);
  const s = await expectState(page, 'treatment', 'playing'); assert.equal(s.id, id);
}
async function result(page, won) {
  await tick(page, 2100);
  const s = await expectState(page, 'result', 'result'); assert.equal(s.result.won, won);
  return s;
}
async function mark(name, action) {
  await action(); checks.push(name); console.log('PASS ' + name);
  assert.deepEqual(errors, [], 'no browser runtime errors');
}
async function inspectFit(page) {
  const fit = await page.evaluate(() => {
    const app = document.querySelector('#app').getBoundingClientRect();
    const modal = document.querySelector('#modal');
    const visibleButtons = [...document.querySelectorAll('button')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && !el.closest('[inert]');
    });
    return { width: innerWidth, height: innerHeight,
      app: { x: app.x, y: app.y, right: app.right, bottom: app.bottom },
      scrollWidth: document.documentElement.scrollWidth,
      buttons: visibleButtons.map(el => { const r = el.getBoundingClientRect(); return { id: el.id || el.textContent.trim(), x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }),
      modalVisible: !modal.hidden };
  });
  assert(fit.app.x >= -.5 && fit.app.y >= -.5 && fit.app.right <= fit.width + .5 && fit.app.bottom <= fit.height + .5, 'game stays inside viewport');
  assert(fit.scrollWidth <= fit.width, 'no horizontal document overflow');
  for (const b of fit.buttons) assert(b.x >= -.5 && b.y >= -.5 && b.right <= fit.width + .5 && b.bottom <= fit.height + .5, 'visible button fits viewport: ' + b.id);
}

(async () => {
  await waitForBuild();
  const launchOptions = { headless: true };
  if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(launchOptions);
  if (process.argv.includes('--timing')) {
    const timingContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const timingPage = await setup(timingContext, null, 250);
    await click(timingPage, '#begin'); await openCase(timingPage, 'blood');
    await tick(timingPage, 91000);
    const deadline = await snapshot(timingPage);
    assert.equal(deadline.result.won, false);
    assert.equal(deadline.remaining, 0);
    assert.equal(deadline.elapsed, 90);
    assert.equal(deadline.result.seconds, 90);
    await tick(timingPage, 3000);
    await expectState(timingPage, 'result', 'result');
    await capture(timingPage, 'blood-timeout');
    assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []);
    console.log('PASS focused 4 fps deadline: exactly 90 seconds, failure result and no external requests');
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const page = await setup(context);

  await mark('offline startup, help, sound toggle and manual/random selection', async () => {
    await expectState(page, 'home', 'idle'); await inspectFit(page);
    await click(page, '#help'); assert(await page.locator('#dialog-title').isVisible()); await primary(page);
    await click(page, '#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    await click(page, '#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
    await click(page, '#begin'); await expectState(page, 'cases', 'idle');
    await click(page, '#random-case');
    assert(['血河淤堵', '孢子侵染', '心跳失序'].includes(await page.locator('#dialog-title').textContent()));
    await primary(page); assert(['blood', 'spore', 'heart'].includes((await snapshot(page)).id));
    await click(page, '#pause'); await click(page, '#dialog-actions button:last-child');
    await expectState(page, 'cases', 'idle');
  });

  await mark('help/pause freeze time; leave confirmation can resume or return home', async () => {
    await openCase(page, 'blood'); await tick(page, 1200);
    await click(page, '#help'); const helpTime = (await snapshot(page)).remaining;
    await tick(page, 5000); assert.equal((await snapshot(page)).remaining, helpTime);
    await primary(page); await tick(page, 1200); assert((await snapshot(page)).remaining < helpTime - 1);
    await click(page, '#pause'); const pauseTime = (await snapshot(page)).remaining;
    await tick(page, 5000); assert.equal((await snapshot(page)).remaining, pauseTime);
    await primary(page); await expectState(page, 'treatment', 'playing');
    await click(page, '#brand'); assert.equal((await snapshot(page)).phase, 'paused');
    await primary(page); await expectState(page, 'treatment', 'playing');
    await click(page, '#brand'); await click(page, '#dialog-actions .secondary-button');
    await expectState(page, 'home', 'idle'); await click(page, '#begin');
  });

  await mark('blood failure, retry reset, nine genuine drags, next-case navigation', async () => {
    await openCase(page, 'blood');
    for (let i = 0; i < 5; i++) {
      const clot = (await snapshot(page)).game.clots[0];
      await dragCanvas(page, clot, { x: 360, y: clot.y < 700 ? clot.y + 75 : clot.y - 75 });
      await tick(page, 600);
    }
    await result(page, false); await click(page, '#result-next');
    assert.equal((await snapshot(page)).game.health, 5); assert.equal((await snapshot(page)).progress, 0);
    await tick(page, 500); await capture(page, 'blood-before');
    for (let wave = 0; wave < 3; wave++) {
      const s = await snapshot(page), bank = s.game.banks[0];
      for (const clot of s.game.clots) {
        if ((await snapshot(page)).game.removed === 8) await capture(page, 'blood-before-final-drag');
        await dragCanvas(page, clot, { x: bank.x + bank.w / 2, y: clot.y });
      }
      if (wave < 2) await tick(page, 1350);
    }
    await tick(page, 1100); await capture(page, 'blood-restored');
    const won = await result(page, true); assert.equal(won.progress, 1);
    assert(won.result.score > 0); await capture(page, 'blood-result'); await click(page, '#result-next');
    assert.equal(await page.locator('#dialog-title').textContent(), '孢子侵染'); await primary(page);
  });

  await mark('spore missed-target failure, retry, 22 input-driven clears and next-case navigation', async () => {
    await expectState(page, 'treatment', 'playing'); assert.equal((await snapshot(page)).id, 'spore');
    await tick(page, 25000); await result(page, false); await click(page, '#retry');
    assert.equal((await snapshot(page)).game.health, 5);
    await tick(page, 1500); await capture(page, 'spore-before');
    for (let i = 0; i < 310; i++) {
      await tick(page, 250); const s = await snapshot(page);
      if (s.phase !== 'playing') break;
      for (const t of s.game.targets) if (t.kind === 'bad' && t.remaining < 7.1) await tapCanvas(page, t);
    }
    await tick(page, 700); await capture(page, 'spore-restored');
    const won = await result(page, true); assert.equal(won.game.removed, 22); assert.equal(won.game.health, 5);
    await capture(page, 'spore-result');
    await click(page, '#result-next'); assert.equal(await page.locator('#dialog-title').textContent(), '心跳失序'); await primary(page);
  });

  await mark('heart missed-beat failure, retry, seventeen timed clicks and repeat protection', async () => {
    await tick(page, 26000); await result(page, false); await click(page, '#result-next');
    assert.equal((await snapshot(page)).game.hits, 0); assert.equal((await snapshot(page)).game.health, 6);
    await capture(page, 'heart-before');
    await tick(page, 3100);
    for (let i = 0; i < 17; i++) {
      let s = await snapshot(page), g = s.game;
      const centerTime = (g.targetX - 92) / (628 - 92) * g.roundDuration;
      if (centerTime > g.roundElapsed) await tick(page, Math.ceil((centerTime - g.roundElapsed) * 1000));
      // Alternate all supported desktop controls: scene, dedicated button, keyboard.
      if (i % 3 === 0) await tapCanvas(page, { x: 360, y: 825 });
      else if (i % 3 === 1) await click(page, '#beat', 0);
      else await page.keyboard.press('Space');
      s = await snapshot(page); assert.equal(s.game.hits, i + 1);
      if (i === 0) { await click(page, '#beat', 0); await click(page, '#beat', 0); assert.equal((await snapshot(page)).game.hits, 1); }
      if (i < 16) { g = (await snapshot(page)).game; await tick(page, Math.ceil((g.roundDuration - g.roundElapsed) * 1000) + 32); }
    }
    await tick(page, 700); await capture(page, 'heart-restored');
    const won = await result(page, true); assert.equal(won.game.health, 6); assert.equal(won.result.stars, 3);
    await capture(page, 'heart-result');
    await click(page, '#result-next'); await expectState(page, 'cases', 'idle');
    assert.match(await page.locator('#record-summary').textContent(), /3 \/ 3/);
  });

  await mark('refresh restores a working cover and cured records', async () => {
    await page.reload(); await tick(page, 32); await expectState(page, 'home', 'idle');
    await click(page, '#begin'); assert.match(await page.locator('#record-summary').textContent(), /3 \/ 3/);
  });

  await mark('4 fps browser frames keep simulation and countdown on the same active time', async () => {
    const slow = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await setup(slow, null, 250);
    await click(p, '#begin'); await openCase(p, 'spore'); await tick(p, 5000);
    const s = await snapshot(p); assert.equal(s.phase, 'playing');
    assert(s.elapsed >= 4.5, 'active wall time advances despite slow frames');
    assert(Math.abs(s.elapsed - s.game.elapsed) < .07, 'simulation catches up to countdown');
    assert(Math.abs(s.remaining + s.elapsed - 90) < .001);
    const target = s.game.targets.find(t => t.kind === 'bad'); await tapCanvas(p, target);
    assert.equal((await snapshot(p)).game.removed, 1);
    await click(p, '#pause'); await click(p, '#dialog-actions button:last-child');
    await openCase(p, 'blood'); await tick(p, 91000);
    const deadline = await snapshot(p);
    assert.equal(deadline.result.won, false); assert.equal(deadline.remaining, 0);
    assert.equal(deadline.elapsed, 90); assert.equal(deadline.result.seconds, 90);
    assert.match(deadline.result.reason, /时间到了/);
    await tick(p, 3000); await expectState(p, 'result', 'result'); await capture(p, 'blood-timeout');
    await slow.close();
  });

  for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
    await mark(`mobile ${size.width}×${size.height}: layouts, touch tap and dialogs`, async () => {
      const mobile = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const p = await setup(mobile); await inspectFit(p); await click(p, '#begin'); await inspectFit(p);
      await click(p, '[data-case="spore"]'); await inspectFit(p); await primary(p); await inspectFit(p);
      await tick(p, 1500); const target = (await snapshot(p)).game.targets.find(t => t.kind === 'bad');
      await tapCanvas(p, target, true); assert.equal((await snapshot(p)).game.removed, 1);
      await click(p, '#pause'); await inspectFit(p); await click(p, '#dialog-actions button:last-child');
      await openCase(p, 'blood'); let clot = (await snapshot(p)).game.clots[0];
      await touchDrag(p, clot, { x: 130, y: clot.y }, true);
      assert.equal((await snapshot(p)).game.removed, 0); assert.equal((await snapshot(p)).game.health, 5);
      await tick(p, 600); clot = (await snapshot(p)).game.clots[0];
      await touchDrag(p, clot, { x: 130, y: clot.y }); assert.equal((await snapshot(p)).game.removed, 1);
      await click(p, '#pause'); await click(p, '#dialog-actions button:last-child');
      await click(p, '#case-back'); await expectState(p, 'home', 'idle'); await mobile.close();
    });
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  assert.deepEqual(remoteRequests, [], 'no remote network requests');
  console.log(`\n${checks.length} browser checks passed; no page errors or external requests.`);
})().catch(error => {
  console.error(error.stack || error);
  if (errors.length) console.error('Page errors:', errors);
  if (remoteRequests.length) console.error('External requests:', remoteRequests);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
