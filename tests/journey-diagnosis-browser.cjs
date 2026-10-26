'use strict';
// Real offline browser inputs; snapshots only observe the live chapter.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const h = require('./journey-browser-helpers.cjs');
const { snapshot, game, tick, click, primary, setup, start, mouseAt, moveTo, canvasPixels, capture, inspectFit } = h;
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'index.html'))).digest('hex');
const testedEntry = hash(), errors = [], requests = [];
let browser, currentPage, checks = 0;
async function mark(name, run) { await run(); assert.deepEqual(errors, []); checks++; console.log('PASS ' + name); }
const frozenPart = s => ({ elapsed: s.elapsed, activeTime: s.activeTime, camera: s.view.camera, particles: s.particles, game: s.game });
async function reportReady(page) {
  const s = await snapshot(page); assert.equal(s.phase, 'paused'); assert.equal(s.modalKind, 'diagnosis-report');
  assert(s.game.pendingDiagnosis); assert.equal(s.elapsed, s.game.elapsed);
  assert(await page.locator('#diagnosis-continue').isVisible());
  const fits = await page.locator('.diagnosis-report-dialog').evaluate(dialog => {
    const box = dialog.getBoundingClientRect(); return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight && dialog.scrollHeight <= dialog.clientHeight + 1;
  });
  assert(fits, 'the full diagnosis and its action fit the visible card'); return s;
}
(async () => {
  console.log('INFO diagnosis browser entry SHA-256: ' + testedEntry);
  const launch = { headless: true }; if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(launch);
  for (const options of [{ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }, { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, reducedMotion: 'reduce' }]) {
    const context = await browser.newContext(options), page = await setup(context, errors, requests); currentPage = page;
    await start(page); await inspectFit(page);
    const lesion = (await game(page)).entryLesion;
    await moveTo(page, { x: lesion.x, y: lesion.y + 100 });
    await mark('DPR ' + options.deviceScaleFactor + ': one entry diagnosis freezes a real reload, held input and canvas pixels', async () => {
      const player = (await game(page)).player;
      await mouseAt(page, { x: player.x + 160, y: player.y }); await page.mouse.down(); await tick(page, 32); await page.mouse.up();
      assert((await game(page)).ammo < 24);
      await mouseAt(page, lesion); await page.keyboard.press('KeyQ'); await tick(page, 950);
      assert.equal((await game(page)).scanFocusId, lesion.id);
      await page.keyboard.press('KeyR'); await tick(page, 200);
      await mouseAt(page, { x: player.x + 160, y: player.y }); await page.mouse.down(); await page.keyboard.down('KeyD'); await tick(page, 500);
      const opened = await reportReady(page);
      assert.equal(opened.game.pendingDiagnosis.targetId, lesion.id); assert(opened.game.reloadRemaining > 0);
      assert.equal(opened.game.scanned.pressure, true); assert.equal(opened.game.scanner, false);
      assert.deepEqual(opened.game.keys, []);
      assert.match(await page.locator('#dialog-body').innerText(), /轻度凝块|局部.*缺血/);
      assert.match(await page.locator('#dialog-body').innerText(), /使用 1/);
      const frozen = frozenPart(opened), pixels = await canvasPixels(page);
      await tick(page, 2000); assert.deepEqual(frozenPart(await snapshot(page)), frozen); assert.equal(await canvasPixels(page), pixels);
      await page.keyboard.up('KeyD'); await page.mouse.up(); await page.keyboard.down('Tab'); await page.keyboard.up('Tab'); await page.keyboard.press('Digit2');
      assert.deepEqual(frozenPart(await snapshot(page)), frozen, 'report controls do not become world input');
      await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await tick(page, 3000);
      assert.equal((await snapshot(page)).modalKind, 'diagnosis-report'); assert.deepEqual(frozenPart(await snapshot(page)), frozen);
      await capture(page, 'diagnosis-paused-dpr' + options.deviceScaleFactor);
      await click(page, '#diagnosis-continue'); await tick(page, 1000);
      const resumed = await game(page); assert.equal(resumed.ammo, 24); assert.equal(resumed.reloadRemaining, 0);
      assert.equal(resumed.player.x, opened.game.player.x); assert.equal(resumed.player.y, opened.game.player.y);
    });
    await mark('DPR ' + options.deviceScaleFactor + ': repeated scans stay brief; J and the button review live results; Esc stays paused', async () => {
      await mouseAt(page, lesion); await page.keyboard.press('KeyQ'); await tick(page, 1450);
      assert.equal((await snapshot(page)).modal, false, 'an unchanged diagnosis does not interrupt twice');
      await page.keyboard.press('KeyJ'); await reportReady(page); await page.keyboard.press('Escape');
      assert.equal((await snapshot(page)).phase, 'paused'); assert.equal((await snapshot(page)).modalKind, 'dialog'); assert.equal((await game(page)).pendingDiagnosis, null);
      await primary(page); await mouseAt(page, lesion); await page.mouse.down(); await tick(page, 1800); await page.mouse.up();
      assert.equal((await game(page)).entryLesion.complete, true);
      await click(page, '#journey-report'); const reviewed = await reportReady(page);
      assert.equal(reviewed.game.pendingDiagnosis.revision, 'restored'); assert.match(await page.locator('#dialog-body').innerText(), /供血已恢复/);
      assert.match(await page.locator('#dialog-body').innerText(), /穿过瓣膜/); await capture(page, 'diagnosis-restored-dpr' + options.deviceScaleFactor);
      await page.locator('#diagnosis-continue').focus(); await page.keyboard.press('Enter'); await tick(page, 32);
      assert.equal((await snapshot(page)).phase, 'playing'); assert.equal((await game(page)).pendingDiagnosis, null);
    });
    await context.close(); currentPage = null;
  }
  assert.deepEqual(requests, []); assert.equal(hash(), testedEntry, 'entry stays identical throughout diagnosis checks');
  console.log('\n' + checks + ' diagnosis browser checks passed; no errors or external requests.');
})().catch(async error => {
  console.error(error.stack || error); if (currentPage && !currentPage.isClosed()) { console.error(JSON.stringify(await snapshot(currentPage)).slice(0, 8000)); await capture(currentPage, 'diagnosis-failure'); }
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
