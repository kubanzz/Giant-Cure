'use strict';
// Diagnosis room and case archive QA through real offline browser input.
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
const testedEntry = entryHash(), card = '[data-case="heartJourney"]';
const previews = { blood: ['血河淤堵', '拖拽'], spore: ['孢子侵染', '点击'], heart: ['心跳失序', '节奏'] };
let browser, page;
const snapshot = page => page.evaluate(() => window.GiantCure.snapshot());
const tick = (page, ms) => page.clock.runFor(ms);
async function click(page, selector, ms = 32) { await page.locator(selector).click(); if (ms) await tick(page, ms); }
const primary = page => click(page, '#dialog-actions .primary-button');
async function ready(page) {
  await page.evaluate(async () => { if (window.GiantCureAssets) await window.GiantCureAssets.ready; }); await tick(page, 32);
}
async function waitForEntry(page, limit = 6000) {
  for (let elapsed = 0; elapsed <= limit; elapsed += 16) {
    const s = await snapshot(page);
    if (s.phase === 'playing') {
      assert.deepEqual(s.transition, { phase: 'idle', caseId: null });
      assert.equal(await page.locator('#entry-transition').isHidden(), true);
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('entry-in-progress')), false);
      return s;
    }
    assert.equal(s.phase, 'entering', 'entry remains in its loading/arrival phase until play begins');
    await tick(page, 16);
  }
  assert.fail('entry did not reach playing within ' + limit + ' ms');
}
async function setup(context, seed, storage = {}) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('request', request => { if (!/^(file|data):/.test(request.url())) remoteRequests.push(request.url()); });
  const epoch = Date.parse('2026-10-21T05:00:00Z');
  await page.clock.install({ time: new Date(epoch) }); await page.clock.pauseAt(new Date(epoch + 1000));
  if (seed || storage.raw || storage.unavailable) await page.addInitScript(({ values, raw, unavailable }) => {
    for (const [key, value] of Object.entries(values || {})) localStorage.setItem(key, JSON.stringify(value));
    for (const [key, value] of Object.entries(raw || {})) localStorage.setItem(key, value);
    if (unavailable) for (const method of ['getItem', 'setItem']) Object.defineProperty(Storage.prototype, method, { configurable: true, value() { throw new DOMException('Storage unavailable', 'SecurityError'); } });
  }, { values: seed, ...storage });
  await page.goto(url); await ready(page);
  assert(await page.evaluate(() => !!window.GiantCure && !!document.querySelector('#diagnosis-panel'))); return page;
}
async function mark(name, action) {
  await action(); checks.push(name); console.log('PASS ' + name); assert.deepEqual(errors, [], 'no browser runtime errors');
}
async function capture(page, name, settle = 0) {
  if (settle) await tick(page, settle);
  const folder = path.join(__dirname, 'screenshots'); fs.mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, 'diagnosis-' + name + '.png'), animations: 'allow' });
}
async function expectState(page, screen, phase) {
  const state = await snapshot(page); assert.equal(state.screen, screen); assert.equal(state.phase, phase); return state;
}
async function inspectFit(page) {
  const fit = await page.evaluate(() => {
    const app = document.querySelector('#app').getBoundingClientRect();
    const visibleButtons = [...document.querySelectorAll('button')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && !el.closest('[inert]');
    });
    return { width: innerWidth, height: innerHeight, app: { x: app.x, y: app.y, right: app.right, bottom: app.bottom },
      scrollWidth: document.documentElement.scrollWidth,
      buttons: visibleButtons.map(el => { const r = el.getBoundingClientRect(); return { id: el.id || el.textContent.trim(), x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }) };
  });
  assert(fit.app.x >= -.5 && fit.app.y >= -.5 && fit.app.right <= fit.width + .5 && fit.app.bottom <= fit.height + .5, 'game stays inside viewport: ' + JSON.stringify(fit));
  assert(fit.scrollWidth <= fit.width, 'no horizontal document overflow');
  for (const b of fit.buttons) assert(b.x >= -.5 && b.y >= -.5 && b.right <= fit.width + .5 && b.bottom <= fit.height + .5, 'visible button fits viewport: ' + b.id);
}
async function resizeViewport(page, size) {
  await page.setViewportSize(size);
  // Native resize and visualViewport events may arrive after the mocked clock's first frame.
  for (let attempt = 0; attempt < 10; attempt++) {
    await tick(page, 32);
    if (await page.evaluate(() => { const r = document.querySelector('#app').getBoundingClientRect(); return r.x >= -.5 && r.y >= -.5 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5; })) return;
  }
  await inspectFit(page);
}
async function painted(page, selector) {
  return page.locator(selector).evaluate(el => {
    if (!el.getClientRects().length) return false;
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (p.hidden || s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  });
}
async function assertDiagnosis(page, phase = 'idle') {
  const s = await expectState(page, 'cases', 'idle');
  assert.deepEqual(s.transition, { phase: 'idle', caseId: null });
  assert.equal(await page.locator('#entry-transition').isHidden(), true);
  assert.equal('selector' in s, false, 'random selector diagnostics are retired');
  assert.deepEqual(s.diagnosis, { phase, caseId: phase === 'ready' ? 'heartJourney' : null });
  assert.equal(s.game, null, 'diagnosis presentation does not instantiate a game');
  assert.equal(await page.locator('#diagnosis-panel').getAttribute('data-diagnosis-phase'), phase);
  assert.equal(await page.locator('#diagnosis-panel').getAttribute('aria-busy'), String(phase === 'scanning'));
  assert.equal(await page.locator('#diagnosis-action').isDisabled(), phase === 'scanning');
  assert.equal(await page.locator('#case-archive').isDisabled(), phase === 'scanning');
  assert.equal(await page.locator('#diagnosis-action-label').innerText(), { idle: '开始检查', scanning: '检查中…', ready: '前往治疗' }[phase]);
  assert.equal(await page.locator('#diagnosis-report').isVisible(), phase === 'ready');
  assert.equal(await painted(page, '#diagnosis-target'), phase === 'ready');
  assert.equal(await page.locator('#random-case, #case-reel-window, #selected-case-start, #tab-quick').count(), 0);
  const mainCopy = await page.locator('#cases').innerText();
  assert.doesNotMatch(mainCopy, /随机|再抽|血栓|传导|A\s*(?:→|->)\s*B|孢子侵染|心跳失序|血河淤堵/, 'diagnosis does not reveal exact causes, routes or archive previews');
  if (phase === 'idle') assert.match(await page.locator('#diagnosis-status').innerText(), /生命信号待采集/);
  await inspectFit(page); return s;
}
async function assertReady(page) {
  await assertDiagnosis(page, 'ready');
  assert.equal(await page.locator('#diagnosis-finding').innerText(), '心区血流信号减弱');
  assert.equal(await page.locator('#diagnosis-detail').innerText(), '具体病因待近距离确认');
  const a = await page.locator('#diagnosis-heart-anchor').boundingBox(), b = await page.locator('#diagnosis-target > circle:first-child').boundingBox();
  assert(a && b); assert(Math.abs(a.x + a.width / 2 - b.x - b.width / 2) <= 1 && Math.abs(a.y + a.height / 2 - b.y - b.height / 2) <= 1, 'amber target stays centered on the heart anchor within one pixel');
}
async function openArchive(page, cured = 0) {
  await click(page, '#case-archive');
  assert.equal(await page.locator('#modal').isVisible(), true);
  assert.equal(await page.locator('#case-records').isVisible(), true);
  assert.deepEqual(await page.locator('[data-case]').evaluateAll(cards => cards.map(el => el.dataset.case)), ['heartJourney']);
  assert.match(await page.locator('#record-summary').innerText(), new RegExp(cured + '\\s*\\/\\s*1'));
  assert.equal(await page.locator(card + ' .case-complete').isVisible(), !!cured);
  assert.match(await page.locator(card + ' strong').innerText(), /心脏巡诊/);
  assert.deepEqual(await page.locator('[data-preview-case]').evaluateAll(cards => cards.map(el => el.dataset.previewCase)), Object.keys(previews));
  for (const [id, [title, mechanic]] of Object.entries(previews)) {
    const preview = page.locator('[data-preview-case="' + id + '"]');
    assert.match(await preview.innerText(), new RegExp(title)); assert.match(await preview.innerText(), /待开放/); assert.match(await preview.innerText(), new RegExp(mechanic));
    assert.equal(await preview.evaluate(el => el.tagName), 'DIV');
    assert.equal(await preview.locator('button, a, [tabindex="0"]').count(), 0, 'previews have no live start or keyboard target');
    assert(await preview.locator('svg').count(), 'each preview includes its mechanic icon');
  }
  if (cured) assert.equal(await page.locator(card + ' .option-state').innerText(), '再次巡诊');
  await inspectFit(page);
}
async function assertFreshChapter(page) {
  const s = await waitForEntry(page); assert.equal(s.screen, 'treatment');
  assert(s.elapsed <= .05 && s.activeTime <= .05 && s.game.elapsed <= .05, 'entry presentation does not count as active treatment time');
  assert.equal(s.id, 'heartJourney'); assert.equal(s.remaining, null);
  assert.equal(s.game.stage, 'diagnosis'); assert.equal(s.game.checkpoint, 'entry'); assert.deepEqual(s.game.scanned, {});
  assert.equal(s.game.health, 100); assert.equal(s.game.retries, 0); assert.equal(s.game.scanner, false);
  assert.equal(await page.locator('#modal').isHidden(), true, 'treatment opens without a preparation dialog'); await inspectFit(page);
}
async function mouseClick(page, selector, count = 1) {
  const box = await page.locator(selector).boundingBox(); assert(box);
  for (let i = 0; i < count; i++) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function scanToReady(page) {
  await click(page, '#diagnosis-action'); await assertDiagnosis(page, 'scanning'); await tick(page, 3000); await assertReady(page);
}
async function returnFromChapter(page) {
  await click(page, '#pause'); await click(page, '#dialog-actions button:last-child'); await assertDiagnosis(page);
}
const opacity = (page, selector) => page.locator(selector).evaluate(el => Number(getComputedStyle(el).opacity));
const hudOpacity = page => page.locator('#app').evaluate(el => Number(getComputedStyle(el).getPropertyValue('--entry-hud-opacity')));
async function assertEntering(page, phase) {
  const s = await snapshot(page); assert.equal(s.phase, 'entering');
  assert.equal(s.transition.caseId, 'heartJourney');
  assert(['departing', 'waiting', 'arriving'].includes(s.transition.phase));
  if (phase) assert.equal(s.transition.phase, phase);
  assert.equal(await page.locator('#entry-transition').isVisible(), true);
  assert.equal(await page.locator('#entry-transition').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('entry-in-progress')), true);
  for (const selector of ['#help', '#case-archive', '#diagnosis-action']) assert.equal(await page.locator(selector).isDisabled(), true, 'entry disables ' + selector);
  for (const id of ['cases', 'treatment']) assert.equal(await page.locator('#' + id).evaluate(el => el.inert), true);
  assert.equal(await page.locator('#entry-transition-home').isEnabled(), true);
  assert.equal(s.elapsed, 0); assert.equal(s.activeTime, 0);
  if (s.game) { assert.equal(s.game.elapsed, 0); assert.deepEqual(s.game.scanned, {}); assert.deepEqual(s.game.keys, []); }
  await inspectFit(page); return s;
}
async function cancelEntry(page, reason) {
  if (reason === 'Escape') await page.keyboard.press('Escape');
  else if (reason === 'home') await click(page, '#entry-transition-home', 0);
  else if (reason === 'homeSpace') {
    await page.keyboard.press('Tab'); assert.equal(await page.locator('#entry-transition-home').evaluate(el => document.activeElement === el), true);
    await page.keyboard.press('Space');
  }
  else if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  else await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await tick(page, 16);
  if (reason === 'visibility') await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  assert.deepEqual((await snapshot(page)).transition, { phase: 'idle', caseId: null });
  assert.equal(await page.locator('#entry-transition').isHidden(), true);
  if (['home', 'homeSpace'].includes(reason)) await expectState(page, 'home', 'idle'); else await assertReady(page);
}
async function ensureReady(page) {
  if ((await snapshot(page)).screen === 'home') await click(page, '#begin');
  if ((await snapshot(page)).diagnosis.phase === 'idle') await scanToReady(page); else await assertReady(page);
}
async function withEntryPage(run, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 }, ...options });
  const p = await setup(context);
  try { await click(p, '#begin'); await scanToReady(p); await run(p); }
  catch (error) { console.error('Entry scenario snapshot:', JSON.stringify(await snapshot(p)).slice(0, 14000)); await capture(p, 'entry-failure'); throw error; }
  finally { await context.close(); }
}
async function deferAssets(page) {
  await page.evaluate(() => {
    const assets = window.GiantCureAssets, original = { ready: assets.ready, retry: assets.retry };
    let resolve, reject;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; }); pending.catch(() => {});
    // Resource provider controls simulate delayed decoding; game and transition diagnostics stay read-only.
    window.__entryAssetHarness = { original, resolve, reject, retryCount: 0 };
    assets.ready = pending;
    assets.retry = () => { window.__entryAssetHarness.retryCount++; assets.ready = Promise.resolve(); return assets.ready; };
  });
}
async function restoreAssets(page) {
  await page.evaluate(() => { const harness = window.__entryAssetHarness; Object.assign(window.GiantCureAssets, harness.original); delete window.__entryAssetHarness; });
}

(async () => {
  console.log('INFO offline entry SHA-256: ' + testedEntry);
  const options = { headless: true }; if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(options);
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); page = await setup(context);

  await mark('offline startup keeps chapter registration, help and sound usable', async () => {
    await expectState(page, 'home', 'idle'); await inspectFit(page);
    assert.deepEqual(await page.evaluate(() => Object.keys(window.GiantCureGames)), ['heartJourney']);
    await click(page, '#help'); assert(await page.locator('#dialog-title').isVisible()); await inspectFit(page);
    assert.doesNotMatch(await page.locator('#dialog-body').innerText(), /随机|再抽|血栓|传导|90\s*秒/);
    await primary(page); await expectState(page, 'home', 'idle');
    await click(page, '#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true');
    await click(page, '#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false'); await tick(page, 2300);
  });

  await mark('cover opens a quiet diagnosis room with a body monitor and no case spoilers', async () => {
    await click(page, '#begin'); await assertDiagnosis(page);
    assert.equal(await page.locator('#diagnosis-body').isVisible(), true);
    assert.equal(await page.locator('#case-records').isVisible(), false);
    await capture(page, 'idle');
  });

  await mark('a 2.8 second inspection collects signals, checks circulation and locates the heart before explicit treatment', async () => {
    const before = await snapshot(page);
    await click(page, '#diagnosis-action'); await assertDiagnosis(page, 'scanning');
    assert.match(await page.locator('#diagnosis-status').innerText(), /采集生命信号/);
    assert.notEqual(await page.locator('#diagnosis-wave .wave-trace').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator('#case-back').isEnabled(), true);
    const startY = (await page.locator('#diagnosis-scan-line').boundingBox()).y;
    await mouseClick(page, '#diagnosis-action', 4); await mouseClick(page, '#case-archive', 3);
    await tick(page, 1000); await assertDiagnosis(page, 'scanning');
    assert.match(await page.locator('#diagnosis-status').innerText(), /检查循环状态/);
    assert((await page.locator('#diagnosis-scan-line').boundingBox()).y > startY + 5, 'scan line moves from head toward feet');
    await capture(page, 'scanning');
    await tick(page, 1100); await assertDiagnosis(page, 'scanning');
    assert.match(await page.locator('#diagnosis-status').innerText(), /定位异常/);
    await tick(page, 400); await assertDiagnosis(page, 'scanning');
    assert.equal((await snapshot(page)).elapsed, before.elapsed, 'inspection cannot advance chapter time');
    await tick(page, 500); await assertReady(page); await capture(page, 'ready');
    await page.locator('#diagnosis-action').focus(); await page.keyboard.press('Enter'); await tick(page, 32); await assertFreshChapter(page);
    assert((await snapshot(page)).elapsed < .15, 'inspection does not carry time into the chapter');
  });

  await mark('treatment help and pause freeze active time; returning opens a fresh diagnosis room', async () => {
    await page.keyboard.down('KeyD'); await tick(page, 500); await page.keyboard.up('KeyD');
    await click(page, '#help'); const helpTime = (await snapshot(page)).elapsed;
    await tick(page, 4000); assert.equal((await snapshot(page)).elapsed, helpTime); await primary(page);
    await tick(page, 500); assert((await snapshot(page)).elapsed > helpTime + .4);
    await click(page, '#pause'); const pauseTime = (await snapshot(page)).elapsed;
    await tick(page, 4000); assert.equal((await snapshot(page)).elapsed, pauseTime);
    assert.equal(await page.locator('#dialog-actions button').count(), 3);
    await click(page, '#dialog-actions button:last-child'); await assertDiagnosis(page);
    await openArchive(page); await click(page, card + ' strong'); await assertFreshChapter(page);
  });

  await mark('brand can resume or leave treatment and both cover routes reopen idle diagnosis', async () => {
    await click(page, '#brand'); await expectState(page, 'treatment', 'paused'); await primary(page); await expectState(page, 'treatment', 'playing');
    await click(page, '#brand'); await click(page, '#dialog-actions .secondary-button');
    await expectState(page, 'home', 'idle'); await click(page, '#begin'); await assertDiagnosis(page);
    await click(page, '#case-back'); await expectState(page, 'home', 'idle');
    await page.reload(); await ready(page); await expectState(page, 'home', 'idle'); await click(page, '#begin'); await assertDiagnosis(page);
  });

  await mark('archive previews are read only; keyboard focus includes case and close buttons and Escape restores focus', async () => {
    await openArchive(page); await capture(page, 'archive');
    for (const id of Object.keys(previews)) { await mouseClick(page, '[data-preview-case="' + id + '"]'); await tick(page, 32); await expectState(page, 'cases', 'idle'); }
    const buttons = page.locator('#dialog-body button, #dialog-actions button'), count = await buttons.count(); assert(count >= 2);
    // Clicking read-only preview text can blur a button; the next Tab must recover into the dialog.
    await page.keyboard.press('Tab');
    const visited = new Set();
    for (let i = 0; i <= count; i++) {
      assert(await page.evaluate(() => !!document.activeElement.closest('#modal')), 'Tab stays inside archive dialog');
      visited.add(await buttons.evaluateAll(items => items.indexOf(document.activeElement))); await page.keyboard.press('Tab');
    }
    assert.equal(visited.size, count, 'Tab reaches both archive entries and dialog actions'); assert(!visited.has(-1));
    for (let i = 0; i <= count; i++) {
      await page.keyboard.press('Shift+Tab');
      assert(await page.evaluate(() => !!document.activeElement.closest('#modal')), 'Shift+Tab stays inside archive dialog');
    }
    await page.keyboard.press('Escape'); await tick(page, 32); assert.equal(await page.locator('#modal').isHidden(), true);
    assert.equal(await page.locator('#case-archive').evaluate(el => document.activeElement === el), true); await assertDiagnosis(page);
  });

  await mark('closing the archive preserves idle or ready diagnosis and a direct archived case starts unscanned', async () => {
    await openArchive(page); await primary(page); await assertDiagnosis(page);
    await scanToReady(page); await openArchive(page); await primary(page); await assertReady(page);
    await openArchive(page); await page.locator(card).focus(); await page.keyboard.press('Enter'); await tick(page, 32); await assertFreshChapter(page);
    await returnFromChapter(page);
  });

  await mark('cover and brand cancel an inspection and discard stale completion callbacks', async () => {
    for (const exit of ['#case-back', '#brand']) {
      await click(page, '#diagnosis-action'); await tick(page, 600); await assertDiagnosis(page, 'scanning');
      await click(page, exit); await expectState(page, 'home', 'idle');
      assert.deepEqual((await snapshot(page)).diagnosis, { phase: 'idle', caseId: null });
      await tick(page, 4000); await expectState(page, 'home', 'idle');
      assert.deepEqual((await snapshot(page)).diagnosis, { phase: 'idle', caseId: null });
      await click(page, '#begin'); await assertDiagnosis(page); await scanToReady(page);
      await click(page, '#case-back'); await click(page, '#begin'); await assertDiagnosis(page);
    }
  });

  await mark('diagnosis help cancels scanning without revealing an exact cause or late report', async () => {
    await click(page, '#diagnosis-action'); await tick(page, 500); await click(page, '#help');
    assert.equal(await page.locator('#modal').isVisible(), true);
    assert.deepEqual((await snapshot(page)).diagnosis, { phase: 'idle', caseId: null });
    assert.match(await page.locator('#dialog-body').innerText(), /检查|诊断/);
    assert.doesNotMatch(await page.locator('#dialog-body').innerText(), /血栓|传导|A\s*→\s*B|随机/);
    await inspectFit(page); await tick(page, 4000); await primary(page); await assertDiagnosis(page);
  });

  await mark('browser visibility and focus loss cancel scanning while allowing a fresh check afterward', async () => {
    for (const reason of ['visibility', 'blur']) {
      await click(page, '#diagnosis-action'); await tick(page, 500);
      // Simulate browser environment signals without writing game or diagnosis state.
      if (reason === 'visibility') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await assertDiagnosis(page); await tick(page, 4000); await assertDiagnosis(page);
      if (reason === 'visibility') await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await scanToReady(page); await click(page, '#case-back'); await click(page, '#begin'); await assertDiagnosis(page);
    }
  });

  await mark('resizing during and after inspection keeps the report target on the heart and never starts gameplay', async () => {
    await click(page, '#diagnosis-action'); await tick(page, 700);
    await resizeViewport(page, { width: 680, height: 840 }); await assertDiagnosis(page, 'scanning');
    await tick(page, 2400); await assertReady(page);
    await resizeViewport(page, { width: 1100, height: 1000 }); await assertReady(page);
    await click(page, '#brand'); await click(page, '#begin'); await assertDiagnosis(page);
  });

  await mark('reduced motion uses a short inspection fade without a traveling line or looping waveform', async () => {
    const reducedContext = await browser.newContext({ viewport: { width: 1100, height: 1000 }, reducedMotion: 'reduce' });
    const reduced = await setup(reducedContext); await click(reduced, '#begin'); await assertDiagnosis(reduced);
    assert.equal((await snapshot(reduced)).reducedMotion, true);
    assert.equal(await painted(reduced, '#diagnosis-scan-line'), false);
    assert.equal(await reduced.locator('#diagnosis-wave .wave-trace').evaluate(el => getComputedStyle(el).animationName), 'none');
    await click(reduced, '#diagnosis-action'); await assertDiagnosis(reduced, 'scanning');
    assert.equal(await reduced.locator('#diagnosis-wave .wave-trace').evaluate(el => getComputedStyle(el).animationName), 'none');
    await tick(reduced, 64); await assertDiagnosis(reduced, 'scanning'); await tick(reduced, 160); await assertReady(reduced);
    await capture(reduced, 'reduced-motion'); await click(reduced, '#diagnosis-action'); await assertFreshChapter(reduced); await reducedContext.close();
  });

  await mark('old quick-game wins cannot complete the chapter or inflate archive totals', async () => {
    const legacyContext = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
    const legacy = await setup(legacyContext, { 'giant-cure-records-v1': { blood: { wins: 3, best: 1500, stars: 3 }, spore: { wins: 2, best: 1400, stars: 3 }, heart: { wins: 1, best: 1300, stars: 3 } } });
    await click(legacy, '#begin'); await assertDiagnosis(legacy); await openArchive(legacy);
    assert.doesNotMatch(await legacy.locator(card + ' .case-mechanic').innerText(), /最佳/);
    await click(legacy, card); await assertFreshChapter(legacy); await legacyContext.close();
  });

  await mark('real heart records preserve completion, best time and an explicit revisit action after refresh', async () => {
    const recordedContext = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
    const recorded = await setup(recordedContext, { 'giant-cure-journey-v1': { wins: 2, bestSeconds: 198 } });
    await click(recorded, '#begin'); await assertDiagnosis(recorded); await openArchive(recorded, 1);
    assert.match(await recorded.locator(card + ' .case-mechanic').innerText(), /最佳.*198.*秒/); await capture(recorded, 'completed');
    await recorded.reload(); await ready(recorded); await expectState(recorded, 'home', 'idle');
    await click(recorded, '#begin'); await openArchive(recorded, 1); await click(recorded, card); await assertFreshChapter(recorded); await recordedContext.close();
  });

  await mark('malformed or unavailable local storage cannot prevent diagnosis, archive access or treatment', async () => {
    for (const storage of [{ raw: { 'giant-cure-journey-v1': '{broken json' } }, { unavailable: true }]) {
      const storageContext = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
      const safe = await setup(storageContext, undefined, storage); await click(safe, '#begin'); await assertDiagnosis(safe); await openArchive(safe);
      await primary(safe); await scanToReady(safe); await click(safe, '#diagnosis-action'); await assertFreshChapter(safe); await storageContext.close();
    }
  });

  for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
    await mark('mobile ' + size.width + '×' + size.height + ': monitor, report and archive fit; touch supports inspection and direct cases', async () => {
      const mobileContext = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const mobile = await setup(mobileContext); await inspectFit(mobile);
      await mobile.locator('#begin').tap(); await tick(mobile, 32); await assertDiagnosis(mobile); await capture(mobile, size.width + 'x' + size.height + '-idle');
      await mobile.locator('#diagnosis-action').tap(); await tick(mobile, 32); await assertDiagnosis(mobile, 'scanning'); await tick(mobile, 3000); await assertReady(mobile);
      await capture(mobile, size.width + 'x' + size.height + '-ready');
      await mobile.locator('#case-archive').tap(); await tick(mobile, 32); assert.equal(await mobile.locator('#case-records').isVisible(), true); await inspectFit(mobile);
      await capture(mobile, size.width + 'x' + size.height + '-archive'); await primary(mobile); await assertReady(mobile);
      await mobile.locator('#diagnosis-action').tap(); await tick(mobile, 32); await assertFreshChapter(mobile); await returnFromChapter(mobile);
      await mobile.locator('#case-archive').tap(); await tick(mobile, 32); await mobile.locator(card).tap(); await tick(mobile, 32); await assertFreshChapter(mobile); await returnFromChapter(mobile);
      await mobile.locator('#help').tap(); await tick(mobile, 32); await inspectFit(mobile); await primary(mobile);
      await click(mobile, '#case-back'); await expectState(mobile, 'home', 'idle'); await mobileContext.close();
    });
  }

  await mark('main entry moves through a covered layout switch, camera arrival and HUD reveal with frozen gameplay', async () => {
    await withEntryPage(async p => {
      await p.keyboard.down('KeyD');
      const started = await p.evaluate(() => performance.now()); await click(p, '#diagnosis-action', 0); await assertEntering(p, 'departing');
      assert.equal(await p.locator('#entry-transition-ghost [id]').count(), 0, 'monitor clone cannot duplicate document IDs');
      const initialGhost = await p.locator('#entry-transition-ghost').boundingBox(); assert(initialGhost);
      await mouseClick(p, '#diagnosis-action', 4); await mouseClick(p, '#case-archive'); await mouseClick(p, '#help');
      await p.keyboard.down('KeyQ'); await tick(p, 240); await assertEntering(p, 'departing');
      assert.equal((await snapshot(p)).screen, 'cases');
      assert((await p.locator('#entry-transition-ghost').boundingBox()).width > initialGhost.width + 5, 'departure pushes into the heart region');
      await capture(p, 'entry-departing');
      await tick(p, 280); const covered = await assertEntering(p);
      assert.equal(covered.screen, 'treatment'); assert(await opacity(p, '#entry-transition-veil') >= .97, 'layout switches underneath a fully covered veil');
      assert.equal(await hudOpacity(p), 0); await capture(p, 'entry-covered');
      await tick(p, 280); const arrived = await assertEntering(p, 'arriving');
      assert(arrived.game); assert(arrived.view.camera.zoom > .88 && arrived.view.camera.zoom < 1.1);
      assert.equal(await painted(p, '#entry-transition-focus'), true);
      assert.equal(await hudOpacity(p), 0); await capture(p, 'entry-arriving');
      await tick(p, 400); const revealing = await assertEntering(p, 'arriving');
      assert.deepEqual(revealing.game, arrived.game, 'camera arrival cannot update chapter simulation');
      assert(Math.abs(revealing.view.camera.zoom - 1.1) < 1e-6); const hud = await hudOpacity(p); assert(hud > 0 && hud < 1);
      await capture(p, 'entry-hud'); await tick(p, 176); await assertEntering(p);
      await assertFreshChapter(p); const ended = await p.evaluate(() => performance.now());
      assert(ended - started >= 1400 && ended - started <= 1432, 'full entry lasts about 1400 ms');
      const player = (await snapshot(p)).game.player;
      await p.keyboard.down('KeyD'); await p.keyboard.down('KeyQ'); await tick(p, 200);
      assert.deepEqual((await snapshot(p)).game.player, player, 'held/repeated movement cannot cross into play');
      assert.equal((await snapshot(p)).game.scanner, false, 'held scan key cannot cross into play');
      await p.keyboard.up('KeyD'); await p.keyboard.up('KeyQ'); await p.keyboard.down('KeyD'); await tick(p, 160); await p.keyboard.up('KeyD');
      assert((await snapshot(p)).game.player.x > player.x + 1, 'a fresh movement press works after releasing the held key');
      await p.keyboard.press('KeyQ'); await tick(p, 16); assert.equal((await snapshot(p)).game.scanner, true);
    });
  });

  await mark('Escape, focus loss, backgrounding and home cancel every main entry stage without late starts', async () => {
    await withEntryPage(async p => {
      for (const reason of ['Escape', 'blur', 'visibility', 'home', 'homeSpace']) for (const at of [200, 800, 1250]) {
        await ensureReady(p); await click(p, '#diagnosis-action', 0); await tick(p, at); await assertEntering(p);
        await cancelEntry(p, reason); await tick(p, 1800);
        if (['home', 'homeSpace'].includes(reason)) await expectState(p, 'home', 'idle'); else await assertReady(p);
        assert.equal((await snapshot(p)).game, null);
      }
    });
  });

  await mark('resizing during departure and arrival keeps the overlay usable and reveals a fitted entry world', async () => {
    await withEntryPage(async p => {
      await click(p, '#diagnosis-action', 0); await tick(p, 200);
      await resizeViewport(p, { width: 680, height: 840 }); await assertEntering(p);
      const focus = await p.locator('#entry-transition-focus').boundingBox(); assert(focus);
      assert(focus.x + focus.width / 2 >= 0 && focus.x + focus.width / 2 <= 680 && focus.y + focus.height / 2 >= 0 && focus.y + focus.height / 2 <= 840, 'heart focus is repositioned inside resized viewport');
      await tick(p, 500); await resizeViewport(p, { width: 1100, height: 1000 }); await assertEntering(p);
      await assertFreshChapter(p); await inspectFit(p);
    });
  });

  await mark('archive entry uses a 250 ms fade and archive cancellation preserves the original diagnosis state', async () => {
    await withEntryPage(async p => {
      await click(p, '#case-back'); await click(p, '#begin'); await assertDiagnosis(p);
      for (const phase of ['idle', 'ready']) {
        if (phase === 'ready') await scanToReady(p);
        await openArchive(p); await click(p, card, 0); await tick(p, 80); await assertEntering(p);
        assert.equal(await painted(p, '#entry-transition-ghost'), false); assert.equal(await painted(p, '#entry-transition-focus'), false);
        await p.keyboard.press('Escape'); await tick(p, 16); await assertDiagnosis(p, phase);
        assert.equal(await p.locator('#modal').isHidden(), true, 'archive cancellation returns to diagnosis rather than reopening the archive');
      }
      await openArchive(p); const started = await p.evaluate(() => performance.now()); await click(p, card, 0);
      await tick(p, 128); const s = await assertEntering(p);
      assert.equal(await painted(p, '#entry-transition-ghost'), false); assert.equal(await painted(p, '#entry-transition-focus'), false);
      if (s.game) assert.equal(s.view.camera.zoom, 1.1, 'archive entry has no camera push');
      await tick(p, 112); await assertEntering(p); await assertFreshChapter(p);
      const ended = await p.evaluate(() => performance.now()); assert(ended - started >= 250 && ended - started <= 282);
    });
  });

  await mark('reduced motion enters in 200 ms using only a fade without a focus ring or camera travel', async () => {
    await withEntryPage(async p => {
      const started = await p.evaluate(() => performance.now()); await click(p, '#diagnosis-action', 0); await tick(p, 96);
      const s = await assertEntering(p);
      assert.equal(await painted(p, '#entry-transition-ghost'), false); assert.equal(await painted(p, '#entry-transition-focus'), false);
      if (s.game) assert.equal(s.view.camera.zoom, 1.1);
      await tick(p, 80); await assertEntering(p); await assertFreshChapter(p);
      const ended = await p.evaluate(() => performance.now()); assert(ended - started >= 200 && ended - started <= 232);
      await capture(p, 'entry-reduced-motion');
    }, { reducedMotion: 'reduce' });
  });

  await mark('a delayed resource promise waits behind an opaque cover and begins no gameplay before resolving', async () => {
    await withEntryPage(async p => {
      await deferAssets(p); await click(p, '#diagnosis-action', 0); await tick(p, 700); await assertEntering(p, 'waiting');
      assert.equal(await opacity(p, '#entry-transition-veil'), 1); assert.match(await p.locator('#entry-transition-status').innerText(), /准备|展开|载入/);
      await capture(p, 'entry-waiting'); const held = await snapshot(p); await tick(p, 2400); const waiting = await assertEntering(p, 'waiting');
      assert.deepEqual(waiting.game, held.game); assert.equal(waiting.elapsed, 0); assert.equal(await opacity(p, '#entry-transition-veil'), 1);
      await p.evaluate(() => window.__entryAssetHarness.resolve()); await assertFreshChapter(p); await restoreAssets(p);
    });
  });

  await mark('canceling a covered resource wait ignores late resolution for Escape, blur, visibility and home', async () => {
    await withEntryPage(async p => {
      for (const reason of ['Escape', 'blur', 'visibility', 'home', 'homeSpace']) {
        await ensureReady(p); await deferAssets(p); await click(p, '#diagnosis-action', 0); await tick(p, 700); await assertEntering(p, 'waiting');
        await cancelEntry(p, reason); await p.evaluate(() => window.__entryAssetHarness.resolve()); await tick(p, 1800); await restoreAssets(p);
        if (['home', 'homeSpace'].includes(reason)) await expectState(p, 'home', 'idle'); else await assertReady(p);
        assert.equal((await snapshot(p)).game, null); assert.deepEqual((await snapshot(p)).transition, { phase: 'idle', caseId: null });
      }
    });
  });

  await mark('resource rejection restores the ready report; retry repeats entry without scanning and return stays in diagnosis', async () => {
    await withEntryPage(async p => {
      for (const action of ['retry', 'return']) {
        await ensureReady(p); await deferAssets(p); await click(p, '#diagnosis-action', 0); await tick(p, 700); await assertEntering(p, 'waiting');
        await p.evaluate(() => window.__entryAssetHarness.reject(new Error('Simulated image decoding failure'))); await tick(p, 16);
        assert.equal(await p.locator('#modal').isVisible(), true); assert.deepEqual((await snapshot(p)).transition, { phase: 'idle', caseId: null });
        assert.deepEqual((await snapshot(p)).diagnosis, { phase: 'ready', caseId: 'heartJourney' });
        assert.equal(await p.locator('#diagnosis-report').isVisible(), true); assert.equal(await p.locator('#entry-transition').isHidden(), true);
        if (action === 'retry') {
          await primary(p); await assertEntering(p); assert.equal(await p.evaluate(() => window.__entryAssetHarness.retryCount), 1);
          await assertFreshChapter(p); await restoreAssets(p); await returnFromChapter(p); await scanToReady(p);
        } else { await click(p, '#dialog-actions .secondary-button'); await assertReady(p); await restoreAssets(p); }
      }
    });
  });

  await mark('restarting an active chapter skips the entry presentation', async () => {
    await withEntryPage(async p => {
      await click(p, '#diagnosis-action'); await assertFreshChapter(p); await click(p, '#pause');
      await click(p, '#dialog-actions button:nth-child(2)', 0); await tick(p, 16);
      const s = await snapshot(p); assert.equal(s.phase, 'playing'); assert.deepEqual(s.transition, { phase: 'idle', caseId: null });
      assert.equal(await p.locator('#entry-transition').isHidden(), true); assert.deepEqual(s.game.scanned, {});
    });
  });

  await mark('chapter construction or frozen first-frame failure restores diagnosis and can retry without a runtime error', async () => {
    for (const failure of ['factory', 'draw']) await withEntryPage(async p => {
      await p.evaluate(kind => {
        const original = window.GiantCureGames.heartJourney;
        const harness = window.__entryFactoryHarness = { original, attempts: 0 };
        // Simulate a failing registered provider, keeping the original chapter implementation intact.
        window.GiantCureGames.heartJourney = services => {
          const attempt = ++harness.attempts;
          if (kind === 'factory' && attempt === 1) throw new Error('Simulated chapter construction failure');
          const game = original(services);
          if (kind === 'draw' && attempt === 1) {
            const draw = game.draw; let first = true;
            game.draw = function (...args) { if (first) { first = false; throw new Error('Simulated frozen first-frame failure'); } return draw.apply(this, args); };
          }
          return game;
        };
      }, failure);
      try {
        await click(p, '#diagnosis-action', 0); await tick(p, 700);
        const failed = await snapshot(p); assert.equal(failed.screen, 'cases'); assert.equal(failed.phase, 'idle'); assert.equal(failed.game, null);
        assert.deepEqual(failed.transition, { phase: 'idle', caseId: null }); assert.deepEqual(failed.diagnosis, { phase: 'ready', caseId: 'heartJourney' });
        assert.equal(await p.locator('#entry-transition').isHidden(), true); assert.equal(await p.locator('#diagnosis-report').isVisible(), true);
        assert.equal(await p.locator('#modal').isVisible(), true); assert.deepEqual(errors, [], 'provider failure is handled without a pageerror');
        await primary(p); await assertEntering(p);
        await p.evaluate(async () => { if (window.GiantCureAssets) await window.GiantCureAssets.ready; });
        await assertFreshChapter(p); assert.equal(await p.evaluate(() => window.__entryFactoryHarness.attempts), 2, 'retry creates one fresh chapter');
      } finally {
        await p.evaluate(() => { window.GiantCureGames.heartJourney = window.__entryFactoryHarness.original; delete window.__entryFactoryHarness; });
      }
    });
  });

  assert.deepEqual(errors, [], 'no browser runtime errors'); assert.deepEqual(remoteRequests, [], 'no external resource requests');
  assert.equal(entryHash(), testedEntry, 'offline entry remains identical throughout the suite');
  console.log('\n' + checks.length + ' diagnosis-room browser checks passed; no errors or external requests.');
})().catch(async error => {
  console.error(error.stack || error);
  if (page && !page.isClosed()) { console.error('Last snapshot:', JSON.stringify(await snapshot(page)).slice(0, 12000)); await capture(page, 'failure'); }
  if (errors.length) console.error('Page errors:', errors); if (remoteRequests.length) console.error('External requests:', remoteRequests); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
