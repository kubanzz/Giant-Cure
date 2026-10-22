'use strict';
// Native offline input exercises the clinic and entry lifecycle; snapshots are read only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const h = require('./journey-browser-helpers.cjs');
const { snapshot, tick, click, primary, ready, inspectFit } = h;
const errors = [], requests = [], checks = [];
const entryHash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'index.html'))).digest('hex');
const testedEntry = entryHash();
let browser, page;
async function setup(context, storage) {
  if (storage) await context.addInitScript(mode => {
    localStorage.clear();
    if (mode === 'legacy') localStorage.setItem('giant-cure-records-v1', JSON.stringify({ heart: { wins: 4, best: 1200, stars: 3 } }));
    if (mode === 'malformed') localStorage.setItem('giant-cure-journey-v1', '{invalid');
    if (mode === 'unavailable') for (const method of ['getItem', 'setItem']) Object.defineProperty(Storage.prototype, method, { configurable: true, value() { throw new DOMException('Unavailable', 'SecurityError'); } });
  }, storage);
  return h.setup(context, errors, requests);
}
async function mark(name, action) {
  await action(); checks.push(name); console.log('PASS ' + name);
  assert.deepEqual(errors, [], 'no browser runtime errors');
}
async function capture(p, name) {
  const folder = path.join(__dirname, 'screenshots'); fs.mkdirSync(folder, { recursive: true });
  await p.screenshot({ path: path.join(folder, 'clinic-' + name + '.png'), animations: 'allow' });
}
async function freshClinic(p) {
  await p.reload(); await ready(p); await click(p, '#begin');
}
async function report(p) {
  if ((await snapshot(p)).screen === 'home') await click(p, '#begin');
  if ((await snapshot(p)).clinic.phase !== 'ready') await click(p, '#clinic-skip');
  return assertReport(p);
}
async function assertPresentation(p, phase) {
  const s = await snapshot(p);
  assert.equal(s.screen, 'cases'); assert.equal(s.clinic.phase, phase);
  assert.equal(s.game, null); assert.equal(s.elapsed, 0); assert.equal(s.activeTime, 0);
  assert.deepEqual(s.transition, { phase: 'idle', caseId: null });
  assert.equal(await p.locator('#diagnosis-action').isDisabled(), phase !== 'ready');
  assert.equal(await p.locator('#case-archive').isDisabled(), phase !== 'ready');
  assert.equal(await p.locator('#diagnosis-panel').getAttribute('data-clinic-phase'), phase);
  return s;
}
async function assertReport(p) {
  const s = await assertPresentation(p, 'ready');
  assert.deepEqual(s.diagnosis, { phase: 'ready', caseId: 'heartJourney' });
  assert.equal(await p.locator('#diagnosis-report').isVisible(), true);
  assert.equal(await p.locator('#diagnosis-finding').innerText(), '心区血流信号减弱');
  assert.equal(await p.locator('#diagnosis-detail').innerText(), '具体病因待近距离确认');
  assert.match(await p.locator('#diagnosis-action-label').innerText(), /进入体内治疗/);
  const anchor = await p.locator('#diagnosis-heart-anchor').boundingBox();
  const ring = await p.locator('#diagnosis-target > circle:first-child').boundingBox();
  assert(anchor && ring); assert(Math.abs(anchor.x + anchor.width / 2 - ring.x - ring.width / 2) < 1);
  assert(Math.abs(anchor.y + anchor.height / 2 - ring.y - ring.height / 2) < 1);
  assert.doesNotMatch(await p.locator('#cases').innerText(), /纤维性血栓|A\s*→\s*B|传导中断/);
  await inspectFit(p); return s;
}
async function assertEntry(p, phase) {
  const s = await snapshot(p); assert.equal(s.phase, 'entering');
  if (phase) assert.equal(s.transition.phase, phase);
  assert.equal(s.transition.caseId, 'heartJourney');
  assert.equal(s.elapsed, 0); assert.equal(s.activeTime, 0);
  if (s.game) { assert.equal(s.game.elapsed, 0); assert.deepEqual(s.game.scanned, {}); assert.equal(s.game.ammo, 24); }
  assert.equal(await p.locator('#entry-transition').isVisible(), true);
  assert.equal(await p.locator('#entry-transition-home').isEnabled(), true);
  return s;
}
async function playing(p) {
  const s = await h.waitForEntry(p);
  assert.deepEqual(s.game.scanned, {}); assert.equal(s.game.stage, 'diagnosis');
  assert.deepEqual(s.logicalSize, { width: 1280, height: 720 });
  return s;
}
async function deferAssets(p) {
  await p.evaluate(() => {
    const assets = window.GiantCureAssets, original = { ready: assets.ready, retry: assets.retry };
    let resolve, reject; const pending = new Promise((yes, no) => { resolve = yes; reject = no; }); pending.catch(() => {});
    window.__assetHarness = { original, resolve, reject, retries: 0 };
    assets.ready = pending;
    assets.retry = () => { window.__assetHarness.retries++; assets.ready = Promise.resolve(); return assets.ready; };
  });
}
async function restoreAssets(p) {
  await p.evaluate(() => { Object.assign(window.GiantCureAssets, window.__assetHarness.original); delete window.__assetHarness; });
}
async function cancel(p, reason) {
  if (reason === 'escape') await p.keyboard.press('Escape');
  if (reason === 'blur') await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  if (reason === 'hidden') await p.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });
  if (reason === 'home') await click(p, '#entry-transition-home');
}
async function withContext(options, action, storage) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 }, ...options });
  try { const p = await setup(context, storage); await action(p); }
  finally { await context.close(); }
}

(async () => {
  const launch = { headless: true }; if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); page = await setup(context);
  await mark('offline startup decodes eight local illustrations and retains help and sound controls', async () => {
    assert.equal((await snapshot(page)).screen, 'home');
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
    await click(page, '#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true'); await click(page, '#sound');
    await click(page, '#help'); assert(await page.locator('#modal').isVisible()); await primary(page);
    const assets = await page.evaluate(() => Object.entries(window.GiantCureAssets.images).map(([name, image]) => ({ name, valid: image.complete && image.naturalWidth > 0 })));
    assert.deepEqual(assets.map(a => a.name).sort(), ['clinic', 'entry', 'exterior', 'heart', 'main', 'recoveryEyes', 'recoveryGiant', 'recoveryValley']); assert(assets.every(a => a.valid)); await inspectFit(page);
  });
  await mark('arrival, listening and report automatically form a ten-second clinic without starting gameplay', async () => {
    await freshClinic(page); await tick(page, 1600); await assertPresentation(page, 'arriving'); await capture(page, 'arrival');
    await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyR');
    await tick(page, 2700); await assertPresentation(page, 'examining'); await capture(page, 'listening');
    await tick(page, 4400); await assertPresentation(page, 'report'); await capture(page, 'report-reveal');
    await tick(page, 1500); const s = await assertReport(page); assert(s.clinic.elapsed >= 10 && s.clinic.elapsed < 10.1);
    await tick(page, 3000); assert.equal((await snapshot(page)).phase, 'idle'); await capture(page, 'report');
  });
  await mark('help freezes an examination and requires explicit continuation without elapsed-time jumps', async () => {
    await freshClinic(page); await tick(page, 4800); await click(page, '#help');
    const before = await snapshot(page); assert(before.clinic.paused); assert.equal(before.clinic.phase, 'examining');
    assert.equal(await page.locator('.wave-trace').evaluate(el => getComputedStyle(el).animationPlayState), 'paused', 'CSS ECG freezes with the clinic clock');
    await tick(page, 10000); assert.deepEqual((await snapshot(page)).clinic, before.clinic);
    await primary(page); await tick(page, 1000); assert((await snapshot(page)).clinic.elapsed < 6.1);
    if ((await snapshot(page)).clinic.paused) await click(page, '#clinic-continue');
    await tick(page, 1000); assert((await snapshot(page)).clinic.elapsed < 7.2); await report(page);
  });
  for (const reason of ['blur', 'hidden']) await mark(reason + ' freezes arrival until Continue, while Escape leaves without late callbacks', async () => {
    await freshClinic(page); await tick(page, 1000); await cancel(page, reason);
    const before = (await snapshot(page)).clinic; assert(before.paused); await tick(page, 8000);
    assert.deepEqual((await snapshot(page)).clinic, before); assert(await page.locator('#clinic-continue').isVisible());
    await click(page, '#clinic-continue'); await tick(page, 500); assert((await snapshot(page)).clinic.elapsed < 1.7);
    await page.keyboard.press('Escape'); assert.equal((await snapshot(page)).screen, 'home');
    await tick(page, 12000); assert.equal((await snapshot(page)).screen, 'home'); assert.equal((await snapshot(page)).game, null);
  });
  await mark('skip clinic is idempotent, reveals the report and leaves explicit departure to the player', async () => {
    await freshClinic(page); await report(page); const before = (await snapshot(page)).clinic;
    await page.keyboard.press('KeyE'); await tick(page, 500); assert.deepEqual((await snapshot(page)).clinic, before);
    assert.equal((await snapshot(page)).game, null); assert.equal(await page.locator('#clinic-skip').isHidden(), true);
    assert.equal(await page.locator('#diagnosis-body path').count() > 15, true, 'anatomy includes layered organs, bones and circulation');
  });
  await mark('medic prepares for two seconds before the 1.4-second heart entry; input and timer stay frozen', async () => {
    await freshClinic(page); await report(page); const began = await page.evaluate(() => performance.now());
    await click(page, '#diagnosis-action', 0); await assertEntry(page, 'preparing'); await tick(page, 1100); await capture(page, 'medic-preparing');
    await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyR'); await page.keyboard.press('KeyE');
    await tick(page, 1000); await assertEntry(page, 'departing');
    const duplicates = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return ids.filter((id, i) => ids.indexOf(id) !== i); });
    assert.deepEqual(duplicates, [], 'cloned anatomy rewrites paint-server IDs');
    await capture(page, 'heart-departure'); await tick(page, 600); await assertEntry(page, 'arriving'); await capture(page, 'arrival-world');
    await playing(page); const elapsed = await page.evaluate(() => performance.now()) - began; assert(elapsed >= 3400 && elapsed <= 3464); await capture(page, 'medic-in-body');
  });
  await mark('skip departure uses a short safe fade and starts one fresh chapter', async () => {
    await freshClinic(page); await report(page); await click(page, '#diagnosis-action'); await tick(page, 400);
    await click(page, '#entry-transition-skip', 0); const began = await page.evaluate(() => performance.now()); await playing(page);
    assert(await page.evaluate(() => performance.now()) - began < 350);
  });
  await mark('keyboard can skip clinic, depart and cycle both overlay controls without leaking game input', async () => {
    await freshClinic(page); await page.locator('#clinic-skip').focus(); await page.keyboard.press('Space'); await tick(page, 32); await assertReport(page);
    await page.locator('#diagnosis-action').focus(); await page.keyboard.press('Enter'); await tick(page, 32); await assertEntry(page, 'preparing');
    await page.keyboard.press('Tab'); assert.equal(await page.locator('#entry-transition-skip').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab'); assert.equal(await page.locator('#entry-transition-home').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Space'); await playing(page);
    assert.equal((await snapshot(page)).game.scanner, false); assert.equal((await snapshot(page)).game.ammo, 24);
  });
  await mark('Escape, focus, background and Home cancel preparation, departure and arrival safely', async () => {
    for (const at of [300, 2200, 2800]) for (const reason of ['escape', 'blur', 'hidden', 'home']) {
      await freshClinic(page); await report(page); await click(page, '#diagnosis-action', 0); await tick(page, at); await assertEntry(page);
      await cancel(page, reason); await tick(page, 4000); const s = await snapshot(page);
      assert.equal(s.game, null); assert.deepEqual(s.transition, { phase: 'idle', caseId: null }); assert.equal(await page.locator('#entry-transition').isHidden(), true);
      if (reason === 'home') assert.equal(s.screen, 'home'); else await assertReport(page);
    }
  });
  await mark('skipped entry still waits behind an opaque cover for assets and ignores late completion after cancellation', async () => {
    for (const cancelWait of [false, true]) {
      await freshClinic(page); await report(page); await deferAssets(page); await click(page, '#diagnosis-action'); await click(page, '#entry-transition-skip'); await tick(page, 300);
      await assertEntry(page, 'waiting'); await tick(page, 2000); await assertEntry(page, 'waiting');
      assert.equal(await page.locator('#entry-transition-veil').evaluate(el => Number(getComputedStyle(el).opacity)), 1);
      if (cancelWait) { await cancel(page, 'escape'); await assertReport(page); }
      await page.evaluate(() => window.__assetHarness.resolve()); await tick(page, 16);
      if (cancelWait) { await tick(page, 2000); await assertReport(page); assert.equal((await snapshot(page)).game, null); }
      else await playing(page);
      await restoreAssets(page);
    }
  });
  await mark('resource failure restores the report and supports retry or return without re-examination', async () => {
    for (const retry of [true, false]) {
      await freshClinic(page); await report(page); await deferAssets(page); await click(page, '#diagnosis-action'); await click(page, '#entry-transition-skip'); await tick(page, 300);
      await page.evaluate(() => window.__assetHarness.reject(new Error('Simulated decode failure'))); await tick(page, 32);
      assert.equal((await snapshot(page)).game, null); assert.equal((await snapshot(page)).clinic.phase, 'ready'); assert(await page.locator('#modal').isVisible());
      if (retry) { await primary(page); await playing(page); assert.equal(await page.evaluate(() => window.__assetHarness.retries), 1); }
      else { await click(page, '#dialog-actions .secondary-button'); await assertReport(page); }
      await restoreAssets(page);
    }
  });
  await mark('construction and frozen first-frame failures can recover and create a fresh chapter', async () => {
    for (const failure of ['factory', 'draw']) {
      await freshClinic(page); await report(page);
      await page.evaluate(kind => {
        const original = window.GiantCureGames.heartJourney; let attempts = 0;
        window.GiantCureGames.heartJourney = api => {
          const attempt = ++attempts; if (kind === 'factory' && attempt === 1) throw new Error('Simulated construction failure');
          const game = original(api); if (kind === 'draw' && attempt === 1) { const draw = game.draw; let first = true; game.draw = (...args) => { if (first) { first = false; throw new Error('Simulated first frame failure'); } return draw(...args); }; } return game;
        };
      }, failure);
      await click(page, '#diagnosis-action'); await click(page, '#entry-transition-skip'); await tick(page, 400);
      assert(await page.locator('#modal').isVisible()); assert.equal((await snapshot(page)).game, null); assert.equal((await snapshot(page)).clinic.phase, 'ready');
      await primary(page); await playing(page);
    }
  });
  await mark('archive preserves the report, keeps previews read only and uses a direct short entry', async () => {
    await freshClinic(page); await report(page); await click(page, '#case-archive');
    assert.deepEqual(await page.locator('[data-case]').evaluateAll(els => els.map(el => el.dataset.case)), ['heartJourney']);
    assert.equal(await page.locator('[data-preview-case]').count(), 3); assert.equal(await page.locator('[data-preview-case] button, [data-preview-case] a').count(), 0);
    await page.keyboard.press('Escape'); await assertReport(page); await click(page, '#case-archive');
    await click(page, '[data-case="heartJourney"]', 0); const began = await page.evaluate(() => performance.now()); await playing(page);
    assert(await page.evaluate(() => performance.now()) - began <= 300);
  });
  await mark('optional clinic artwork has a drawing fallback and a resumed clinic keeps its composition', async () => {
    await freshClinic(page);
    const fallback = await page.evaluate(async () => {
      const assets = window.GiantCureAssets, clinicSource = assets.images.clinic.src;
      const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...original, set(value) {
        if (value === clinicSource) queueMicrotask(() => this.onerror?.(new Event('error')));
        else original.set.call(this, value);
      } });
      try {
        await assets.retry();
        return { missing: !assets.images.clinic, optionalError: !!assets.clinicError, chapterError: !!assets.error };
      } finally { Object.defineProperty(HTMLImageElement.prototype, 'src', original); }
    });
    assert.deepEqual(fallback, { missing: true, optionalError: true, chapterError: false });
    await tick(page, 1500); await assertPresentation(page, 'arriving'); await capture(page, 'fallback'); await report(page);
  });
  await mark('reduced motion uses static clinic keyframes and a 200ms entry without camera travel', async () => {
    await withContext({ reducedMotion: 'reduce' }, async p => {
      await click(p, '#begin'); await tick(p, 550); await assertReport(p); assert((await snapshot(p)).reducedMotion);
      await capture(p, 'reduced-motion'); await click(p, '#diagnosis-action', 0); const began = await p.evaluate(() => performance.now()); await playing(p);
      assert(await p.evaluate(() => performance.now()) - began <= 250);
    });
  });
  for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) await mark(size.width + 'px mobile supports arrival, touch skip, anatomy and archive without overflow', async () => {
    await withContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async p => {
      await p.locator('#begin').tap(); await tick(p, 500); await inspectFit(p); await capture(p, size.width + '-arrival');
      await p.locator('#clinic-skip').tap(); await tick(p, 32); await assertReport(p); await capture(p, size.width + '-report');
      await p.locator('#case-archive').tap(); await tick(p, 32); await inspectFit(p); await capture(p, size.width + '-archive');
    });
  });
  await mark('DPR2 resizing during listening and heart departure keeps anatomy and overlays aligned', async () => {
    await withContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }, async p => {
      await click(p, '#begin'); await tick(p, 5000); await p.setViewportSize({ width: 680, height: 840 }); await tick(p, 128); await inspectFit(p);
      await report(p); await click(p, '#diagnosis-action'); await tick(p, 2100);
      await p.setViewportSize({ width: 1366, height: 768 }); await tick(p, 128); await assertEntry(p); await playing(p); await inspectFit(p);
    });
  });
  await mark('legacy, malformed and unavailable storage do not block diagnosis or alter playable case totals', async () => {
    for (const mode of ['legacy', 'malformed', 'unavailable']) await withContext({}, async p => {
      await report(p); await click(p, '#case-archive'); assert.match(await p.locator('#record-summary').innerText(), /0\s*\/\s*1/); await primary(p);
      await click(p, '#diagnosis-action'); await click(p, '#entry-transition-skip'); await playing(p);
    }, mode);
  });
  assert.deepEqual(errors, []); assert.deepEqual(requests, [], 'standalone game makes no external requests');
  assert.equal(entryHash(), testedEntry, 'tested entry stays identical throughout the suite');
  console.log('\n' + checks.length + ' clinic/browser checks passed; no errors or external requests.');
})().catch(async error => {
  console.error(error.stack || error);
  if (page && !page.isClosed()) { console.error('Last snapshot:', JSON.stringify(await snapshot(page)).slice(0, 9000)); await capture(page, 'failure'); }
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
