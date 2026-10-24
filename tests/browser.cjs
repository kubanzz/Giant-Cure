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
    if (mode === 'malformed') { localStorage.setItem('giant-cure-journey-v1', '{invalid'); localStorage.setItem('giant-cure-journey-v2', '{invalid'); }
    if (mode === 'journey-v1') localStorage.setItem('giant-cure-journey-v1', JSON.stringify({ wins: 4, bestSeconds: 120 }));
    if (mode === 'journey-v2') { localStorage.setItem('giant-cure-journey-v1', JSON.stringify({ wins: 9, bestSeconds: 100 })); localStorage.setItem('giant-cure-journey-v2', JSON.stringify({ wins: 2, bestSeconds: 420 })); }
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
async function captureScene(p, name) {
  const folder = path.join(__dirname, 'screenshots'); fs.mkdirSync(folder, { recursive: true });
  // The actual painted Canvas, without surrounding report copy, is a separate
  // visual review artifact. Pixel coverage cannot establish artistic quality.
  const data = await p.locator('#clinic-scene').evaluate(el => {
    const r = el.getBoundingClientRect(), actual = document.createElement('canvas');
    actual.width = Math.round(r.width); actual.height = Math.round(r.height);
    actual.getContext('2d').drawImage(el, 0, 0, actual.width, actual.height);
    return actual.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(folder, 'clinic-scene-' + name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
}
async function scenePixels(p, selector = '#clinic-scene') {
  return p.locator(selector).evaluate(el => {
    const sample = document.createElement('canvas'); sample.width = sample.height = 48;
    const c = sample.getContext('2d'); c.drawImage(el, 0, 0, 48, 48);
    return [...c.getImageData(0, 0, 48, 48).data];
  });
}
async function assertPaintedScene(p) {
  const pixels = await scenePixels(p); let painted = 0, illustrated = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 200) painted++;
    if (Math.abs(pixels[i] - 247) + Math.abs(pixels[i + 1] - 246) + Math.abs(pixels[i + 2] - 237) > 45) illustrated++;
  }
  assert(painted > 48 * 48 * .9, 'paper-backed scene has no blank transparent areas');
  assert(illustrated > 48 * 48 * .04, 'giant scene contains visible drawing on its paper background');
  assert.equal(await p.locator('#clinic-scene').evaluate(el => Number(getComputedStyle(el).opacity)), 1, 'report retains the giant scene');
}
async function assertArtworkAnchor(p) {
  const alignment = await p.evaluate(() => {
    const s = window.GiantCure.snapshot(), art = window.GiantCureClinicArt;
    const images = window.GiantCureAssets.images, clinic = { ...s.clinic, reducedMotion: s.reducedMotion };
    const frame = art.getFrame ? art.getFrame(clinic, clinic.elapsed, images) : (() => {
      const scratch = document.createElement('canvas'); scratch.width = 1248; scratch.height = 1140;
      return art.draw(scratch.getContext('2d'), clinic, clinic.elapsed, images);
    })();
    const canvas = document.querySelector('#clinic-scene').getBoundingClientRect();
    const anchor = document.querySelector('#diagnosis-heart-anchor').getBoundingClientRect();
    return { heart: frame.heart, expected: { x: canvas.x + frame.heart.x / 624 * canvas.width, y: canvas.y + frame.heart.y / 570 * canvas.height }, actual: { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 } };
  });
  assert(Number.isFinite(alignment.heart.x) && Number.isFinite(alignment.heart.y), 'renderer publishes its projected heart location');
  assert(Math.abs(alignment.expected.x - alignment.actual.x) < 1 && Math.abs(alignment.expected.y - alignment.actual.y) < 1, 'DOM heart anchor follows the same painted-scene camera transform: ' + JSON.stringify(alignment));
}
async function assertGhostAnchor(p) {
  const alignment = await p.evaluate(() => {
    const s = window.GiantCure.snapshot(), clinic = { ...s.clinic, reducedMotion: s.reducedMotion };
    const frame = window.GiantCureClinicArt.getFrame(clinic, clinic.elapsed, window.GiantCureAssets.images);
    const canvas = document.querySelector('#entry-transition-ghost canvas').getBoundingClientRect();
    const anchor = document.querySelector('#entry-ghost-diagnosis-heart-anchor').getBoundingClientRect();
    return { expected: { x: canvas.x + frame.heart.x / 624 * canvas.width, y: canvas.y + frame.heart.y / 570 * canvas.height }, actual: { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 } };
  });
  assert(Math.abs(alignment.expected.x - alignment.actual.x) < 1 && Math.abs(alignment.expected.y - alignment.actual.y) < 1, 'capsule scene and entry heart anchor stay registered: ' + JSON.stringify(alignment));
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
  assert.equal(await p.locator('#diagnosis-action-label').innerText(), '将医疗兵送入心区');
  const anchor = await p.locator('#diagnosis-heart-anchor').boundingBox();
  const ring = await p.locator('#diagnosis-target > circle:first-child').boundingBox();
  assert(anchor && ring); assert(Math.abs(anchor.x + anchor.width / 2 - ring.x - ring.width / 2) < 1);
  assert(Math.abs(anchor.y + anchor.height / 2 - ring.y - ring.height / 2) < 1);
  await assertArtworkAnchor(p); await assertPaintedScene(p);
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
  await mark('offline startup decodes only three chapter plates and retains help and sound controls', async () => {
    assert.equal((await snapshot(page)).screen, 'home');
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
    await click(page, '#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true'); await click(page, '#sound');
    await click(page, '#help'); assert(await page.locator('#modal').isVisible()); await primary(page);
    const assets = await page.evaluate(() => Object.entries(window.GiantCureAssets.images).map(([name, image]) => ({ name, valid: image.complete && image.naturalWidth > 0 })));
    assert.deepEqual(assets.map(a => a.name).sort(), ['entry', 'heart', 'main']);
    for (const name of ['entry', 'heart', 'main']) assert(assets.some(a => a.name === name && a.valid), 'required local illustration is decoded: ' + name);
    assert(assets.every(a => a.valid)); await inspectFit(page);
  });
  await mark('giant reveal, heart diagnosis and report form a three-second clinic without starting gameplay', async () => {
    await freshClinic(page); await tick(page, 200); await assertPresentation(page, 'arriving'); await capture(page, 'arrival'); await captureScene(page, 'arrival');
    await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyR');
    await tick(page, 700); await assertPresentation(page, 'examining'); await capture(page, 'diagnosing'); await captureScene(page, 'heart-diagnosis');
    await tick(page, 1000); await assertPresentation(page, 'examining'); await assertArtworkAnchor(page);
    await tick(page, 650); await assertPresentation(page, 'report'); await capture(page, 'report-reveal');
    await tick(page, 550); const s = await assertReport(page); assert(s.clinic.elapsed >= 3 && s.clinic.elapsed < 3.1);
    await tick(page, 3000); assert.equal((await snapshot(page)).phase, 'idle'); await capture(page, 'report'); await captureScene(page, 'report');
  });
  await mark('help freezes an examination and requires explicit continuation without elapsed-time jumps', async () => {
    await freshClinic(page); await tick(page, 900); await click(page, '#help');
    const before = await snapshot(page); assert(before.clinic.paused); assert.equal(before.clinic.phase, 'examining');
    const pixels = await scenePixels(page);
    await tick(page, 10000); assert.deepEqual((await snapshot(page)).clinic, before.clinic);
    assert.deepEqual(await scenePixels(page), pixels, 'giant and diagnosis wave pixels freeze with the clinic clock');
    assert.match(await page.locator('#dialog-actions .primary-button').innerText(), /继续接诊/, 'the help action explicitly resumes diagnosis');
    await primary(page);
    await tick(page, 500); const resumed = (await snapshot(page)).clinic.elapsed;
    assert(resumed > before.clinic.elapsed && resumed < before.clinic.elapsed + .65); await report(page);
  });
  for (const reason of ['blur', 'hidden']) await mark(reason + ' freezes arrival until Continue, while Escape leaves without late callbacks', async () => {
    await freshClinic(page); await tick(page, 200); await cancel(page, reason);
    const before = (await snapshot(page)).clinic; assert(before.paused); await tick(page, 8000);
    assert.deepEqual((await snapshot(page)).clinic, before); assert(await page.locator('#clinic-continue').isVisible());
    await click(page, '#clinic-continue'); await tick(page, 200); assert((await snapshot(page)).clinic.elapsed < .6);
    await page.keyboard.press('Escape'); assert.equal((await snapshot(page)).screen, 'home');
    await tick(page, 12000); assert.equal((await snapshot(page)).screen, 'home'); assert.equal((await snapshot(page)).game, null);
  });
  await mark('skip clinic is idempotent, reveals the report and leaves explicit departure to the player', async () => {
    await freshClinic(page); await report(page); const before = (await snapshot(page)).clinic;
    await page.keyboard.press('KeyE'); await tick(page, 500); assert.deepEqual((await snapshot(page)).clinic, before);
    assert.equal((await snapshot(page)).game, null); assert.equal(await page.locator('#clinic-skip').isHidden(), true);
    assert.equal(await page.locator('#diagnosis-body .giant-outline, #diagnosis-body [class^="anatomy-"]').count(), 0, 'full-body anatomy linework has been removed');
    await assertPaintedScene(page);
  });
  await mark('capsule delivery shares the giant heart anchor and returns immutable scene metadata', async () => {
    await freshClinic(page); await report(page);
    const before = await snapshot(page);
    const delivery = await page.evaluate(() => {
      const art = window.GiantCureClinicArt, clinic = window.GiantCure.snapshot().clinic;
      const frame = art.getFrame(clinic, clinic.elapsed, window.GiantCureAssets.images);
      const scratch = document.createElement('canvas'); scratch.width = 1248; scratch.height = 1140;
      const samples = [0, .2, .6, 1].map(progress => {
        const result = art.drawPreparation(scratch.getContext('2d'), progress, false);
        return { ...result, frozen: Object.isFrozen(result) && Object.isFrozen(result.heart) && Object.isFrozen(result.capsule) };
      });
      return { heart: frame.heart, start: frame.injectionStart, samples };
    });
    const [start, boarding, traveling, delivered] = delivery.samples;
    for (const sample of delivery.samples) {
      assert(sample.frozen, 'delivery diagnostics and their positions are read only');
      assert(Number.isFinite(sample.capsule.x) && Number.isFinite(sample.capsule.y));
      assert.deepEqual(sample.heart, delivery.heart, 'delivery and diagnosis use the same heart');
    }
    assert.deepEqual(start.capsule, delivery.start, 'capsule begins at the visible injection dock');
    assert.deepEqual(boarding.capsule, delivery.start, 'capsule waits at the dock while the medic boards');
    assert.notDeepEqual(traveling.capsule, start.capsule, 'capsule travels after the medic boards');
    assert.notDeepEqual(traveling.capsule, delivered.capsule, 'capsule is still traveling before delivery completes');
    assert.equal(start.delivered, false); assert.equal(traveling.delivered, false);
    assert.equal(delivered.delivered, true); assert.equal(delivered.progress, 1);
    assert.deepEqual(delivered.capsule, delivery.heart, 'capsule reaches the actual heart before chapter entry');
    assert.deepEqual(await snapshot(page), before, 'rendering diagnostic samples does not change the live clinic or chapter');
  });
  await mark('medic boards, enters the heart and reveals the chapter in two seconds while inputs and timer stay frozen', async () => {
    await freshClinic(page); await report(page); const began = await page.evaluate(() => performance.now());
    await click(page, '#diagnosis-action', 0); await assertEntry(page, 'preparing'); await tick(page, 250); await capture(page, 'medic-boarding');
    const boardingPixels = await scenePixels(page, '#entry-transition-ghost canvas');
    const ghost = await page.evaluate(() => {
      const original = document.querySelector('#clinic-scene'), clone = document.querySelector('#entry-transition-ghost canvas');
      if (!clone) return { exists: false };
      return { exists: true, width: clone.width, height: clone.height, originalWidth: original.width, originalHeight: original.height };
    });
    assert(ghost.exists, 'injection is drawn into the cloned giant scene');
    assert.equal(ghost.width, ghost.originalWidth); assert.equal(ghost.height, ghost.originalHeight);
    assert.equal(await page.locator('#entry-preparation').count(), 0, 'injection does not cut away to a separate preparation page');
    await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyR'); await page.keyboard.press('KeyE');
    await tick(page, 750); await assertEntry(page, 'preparing'); await assertGhostAnchor(page); await capture(page, 'capsule-in-transit');
    assert.notDeepEqual(await scenePixels(page, '#entry-transition-ghost canvas'), boardingPixels, 'live capsule delivery advances in the same giant scene');
    await tick(page, 450); await assertEntry(page, 'departing'); await capture(page, 'capsule-delivered');
    const duplicates = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return ids.filter((id, i) => ids.indexOf(id) !== i); });
    assert.deepEqual(duplicates, [], 'cloned scene and heart overlay use unique IDs');
    await capture(page, 'heart-departure'); await tick(page, 300); await assertEntry(page, 'arriving'); await capture(page, 'arrival-world');
    await playing(page); const elapsed = await page.evaluate(() => performance.now()) - began; assert(elapsed >= 2000 && elapsed <= 2064); await capture(page, 'medic-in-body');
  });
  await mark('skip departure uses a short safe fade and starts one fresh chapter', async () => {
    await freshClinic(page); await report(page);
    await page.evaluate(() => {
      const original = window.GiantCureGames.heartJourney;
      window.__chapterStarts = 0;
      window.GiantCureGames.heartJourney = api => { window.__chapterStarts++; return original(api); };
    });
    const action = await page.locator('#diagnosis-action').boundingBox();
    await click(page, '#diagnosis-action');
    await page.mouse.click(action.x + action.width / 2, action.y + action.height / 2);
    await tick(page, 400);
    await click(page, '#entry-transition-skip', 0); const began = await page.evaluate(() => performance.now()); await playing(page);
    assert(await page.evaluate(() => performance.now()) - began < 350);
    assert.equal(await page.evaluate(() => window.__chapterStarts), 1, 'repeated departure clicks and skip create exactly one chapter');
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
    for (const at of [300, 1450, 1800]) for (const reason of ['escape', 'blur', 'hidden', 'home']) {
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
  await mark('storybook diagnosis renders without any image assets and resumes with the same heart composition', async () => {
    await freshClinic(page); await tick(page, 900); await cancel(page, 'blur');
    const before = await scenePixels(page);
    const drawing = await page.evaluate(() => {
      const assets = window.GiantCureAssets, s = window.GiantCure.snapshot();
      const clinic = { ...s.clinic, reducedMotion: s.reducedMotion }, art = window.GiantCureClinicArt;
      const original = assets.images, expected = art.getFrame(clinic, clinic.elapsed, original);
      assets.images = {};
      try {
        const scratch = document.createElement('canvas'); scratch.width = 1248; scratch.height = 1140;
        const actual = art.draw(scratch.getContext('2d'), clinic, clinic.elapsed, {});
        const sample = document.createElement('canvas'); sample.width = sample.height = 48;
        const c = sample.getContext('2d'); c.drawImage(scratch, 0, 0, 48, 48);
        return { heart: actual.heart, expectedHeart: expected.heart, pixels: [...c.getImageData(0, 0, 48, 48).data], clinicError: assets.clinicError, recoveryError: assets.recoveryError };
      } finally { assets.images = original; }
    });
    assert.deepEqual(drawing.heart, drawing.expectedHeart);
    assert.deepEqual(drawing.pixels, before, 'the same paper giant renders when all image assets are absent');
    assert.equal(drawing.clinicError, null); assert.equal(drawing.recoveryError, null);
    await click(page, '#clinic-continue'); await tick(page, 300); await assertPresentation(page, 'examining'); await assertArtworkAnchor(page);
    await report(page); await captureScene(page, 'procedural-report');
  });
  await mark('reduced motion uses static clinic keyframes and a 200ms entry without camera travel', async () => {
    await withContext({ reducedMotion: 'reduce' }, async p => {
      await click(p, '#begin'); await tick(p, 550); await assertReport(p); assert((await snapshot(p)).reducedMotion);
      await capture(p, 'reduced-motion'); await click(p, '#diagnosis-action', 0); const began = await p.evaluate(() => performance.now());
      await assertEntry(p, 'departing');
      assert.equal(await p.locator('#entry-transition-ghost canvas').count(), 1, 'reduced motion keeps the delivered capsule as a static frame');
      const delivered = await p.evaluate(() => {
        const live = document.querySelector('#entry-transition-ghost canvas');
        const scratch = document.createElement('canvas'); scratch.width = live.width; scratch.height = live.height;
        const frame = window.GiantCureClinicArt.drawPreparation(scratch.getContext('2d'), 1, true);
        const pixels = canvas => { const sample = document.createElement('canvas'); sample.width = sample.height = 48; const c = sample.getContext('2d'); c.drawImage(canvas, 0, 0, 48, 48); return [...c.getImageData(0, 0, 48, 48).data]; };
        return { delivered: frame.delivered, heart: frame.heart, capsule: frame.capsule, matches: JSON.stringify(pixels(live)) === JSON.stringify(pixels(scratch)) };
      });
      assert(delivered.delivered && delivered.matches); assert.deepEqual(delivered.capsule, delivered.heart);
      await capture(p, 'reduced-capsule-delivered'); await playing(p);
      assert(await p.evaluate(() => performance.now()) - began <= 250);
    });
  });
  for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) await mark(size.width + 'px mobile supports arrival, touch skip, chest scan and archive without overflow', async () => {
    await withContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async p => {
      await p.locator('#begin').tap(); await tick(p, 500); await inspectFit(p); await capture(p, size.width + '-arrival');
      await p.locator('#clinic-skip').tap(); await tick(p, 32); await assertReport(p); await capture(p, size.width + '-report'); await captureScene(p, size.width + '-report');
      await p.locator('#case-archive').tap(); await tick(p, 32); await inspectFit(p); await capture(p, size.width + '-archive');
    });
  });
  await mark('DPR2 resizing during diagnosis and capsule delivery keeps the giant heart and overlays aligned', async () => {
    await withContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }, async p => {
      await click(p, '#begin'); await tick(p, 900); await p.setViewportSize({ width: 680, height: 840 }); await tick(p, 128); await inspectFit(p); await assertArtworkAnchor(p);
      await report(p); await click(p, '#diagnosis-action'); await tick(p, 800);
      await p.setViewportSize({ width: 1366, height: 768 }); await tick(p, 128); await assertEntry(p); await assertGhostAnchor(p); await playing(p); await inspectFit(p);
    });
  });
  await mark('legacy, malformed and unavailable storage do not block diagnosis or alter playable case totals', async () => {
    for (const mode of ['legacy', 'malformed', 'unavailable']) await withContext({}, async p => {
      await report(p); await click(p, '#case-archive'); assert.match(await p.locator('#record-summary').innerText(), /0\s*\/\s*1/); await primary(p);
      await click(p, '#diagnosis-action'); await click(p, '#entry-transition-skip'); await playing(p);
    }, mode);
  });
  await mark('V2 retains V1 completion counts without importing incomparable best times', async () => {
    await withContext({}, async p => {
      await report(p); await click(p, '#case-archive'); assert.match(await p.locator('#record-summary').innerText(), /1\s*\/\s*1/);
      assert.equal(await p.locator('[data-case="heartJourney"] .option-state').innerText(), '再次巡诊');
      assert.doesNotMatch(await p.locator('[data-case="heartJourney"] .case-mechanic').innerText(), /最佳.*120/);
      const records = await p.evaluate(() => ({ old: JSON.parse(localStorage.getItem('giant-cure-journey-v1')), current: JSON.parse(localStorage.getItem('giant-cure-journey-v2')) }));
      assert.deepEqual(records.old, { wins: 4, bestSeconds: 120 }); assert.deepEqual(records.current, { wins: 4, bestSeconds: null });
      await primary(p); await h.start(p);
    }, 'journey-v1');
    await withContext({}, async p => {
      await report(p); await click(p, '#case-archive'); assert.match(await p.locator('[data-case="heartJourney"] .case-mechanic').innerText(), /新版最佳.*420/);
      assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('giant-cure-journey-v2'))), { wins: 2, bestSeconds: 420 });
    }, 'journey-v2');
  });
  assert.deepEqual(errors, []); assert.deepEqual(requests, [], 'standalone game makes no external requests');
  assert.equal(entryHash(), testedEntry, 'tested entry stays identical throughout the suite');
  console.log('\n' + checks.length + ' clinic/browser checks passed; no errors or external requests.');
})().catch(async error => {
  console.error(error.stack || error);
  if (page && !page.isClosed()) { console.error('Last snapshot:', JSON.stringify(await snapshot(page)).slice(0, 9000)); await capture(page, 'failure'); }
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
