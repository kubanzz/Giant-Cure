'use strict';
// Offline QA uses genuine browser keyboard/mouse events; diagnostics are read-only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const h = require('./journey-browser-helpers.cjs');
const { distance, overlaps } = require('./journey-navigation.cjs');
const { snapshot, game, tick, click, primary, setup, start, mouseAt, mouseScreen, moveTo, node, portal, interact, discover, diagnose, connectBypasses, fightTutorial, restoreFlow, enterHeart, connectHeart, capture, inspectFit } = h;
const errors = [], requests = [], checks = []; let browser, page;
const entryHash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'index.html'))).digest('hex');
const testedEntry = entryHash();
async function mark(name, run) { await run(); checks.push(name); console.log('PASS ' + name); assert.deepEqual(errors, [], 'no browser runtime errors'); }
function frozenPart(s) { return { elapsed: s.elapsed, activeTime: s.activeTime, camera: s.view.camera, particles: s.particles, player: s.game.player, beat: s.game.beat, burst: s.game.burst, recovery: s.game.recovery, ending: s.game.ending, revealRemaining: s.game.revealRemaining }; }
async function assertFrozen(page, open, close = primary) {
  await open(); assert.equal((await snapshot(page)).phase, 'paused'); const before = frozenPart(await snapshot(page));
  await tick(page, 2000); assert.deepEqual(frozenPart(await snapshot(page)), before, 'pause freezes time, camera, world particles and sequence state'); await close(page);
}
async function exitAndSuppress(page) {
  const barrier = (await game(page)).obstacles.find(r => r.kind === 'dashBarrier');
  await moveTo(page, { x: 1300, y: barrier.y + barrier.h + 25 }); await page.keyboard.down('KeyW'); await tick(page, 300); await page.keyboard.up('KeyW'); assert(!(await game(page)).crossedBarrier);
  await page.keyboard.down('KeyW'); await page.keyboard.press('Space'); await tick(page, 350); await page.keyboard.up('KeyW'); assert((await game(page)).crossedBarrier); assert(!overlaps((await game(page)).player, barrier));
  const growth = (await game(page)).growth; await discover(page, growth); assert((await game(page)).growth.scanned);
  await mouseAt(page, growth); await page.mouse.down(); await tick(page, 1550); await page.mouse.up(); assert.equal((await game(page)).stage, 'ending');
}
(async () => {
  console.log('INFO offline entry SHA-256: ' + testedEntry);
  const launch = { headless: true }; if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  page = await setup(context, errors, requests);
  await mark('single offline chapter preloads and opens directly into a 1280×720 world', async () => {
    await click(page, '#begin'); assert.deepEqual(await page.locator('[data-case]').evaluateAll(items => items.map(item => item.dataset.case)), ['heartJourney']);
    await start(page); await inspectFit(page); const s = await snapshot(page);
    assert.deepEqual(s.logicalSize, { width: 1280, height: 720 }); assert.deepEqual(s.view.viewport, { x: 24, y: 84, w: 1232, h: 552 }); assert.equal(s.remaining, null);
    const images = await page.evaluate(() => Object.entries(window.GiantCureAssets.images).map(([name, image]) => ({ name, loaded: image.complete && image.naturalWidth > 0 })));
    assert.deepEqual(images.map(i => i.name).sort(), ['entry', 'exterior', 'heart', 'main']); assert(images.every(i => i.loaded), 'all four embedded illustrations are decoded before play');
    assert.equal(await page.locator('#journey-task').textContent(), s.game.task); await tick(page, 4000);
    assert.equal(await page.locator('#journey-task').textContent(), (await game(page)).task, 'persistent task survives transient feedback'); await capture(page, 'entry');
  });
  await mark('stationary cursor is transformed again while the follow camera moves', async () => {
    const logical = { x: 950, y: 400 }; await mouseScreen(page, logical); const before = await snapshot(page);
    await page.keyboard.down('KeyD'); await tick(page, 900); await page.keyboard.up('KeyD'); const after = await snapshot(page);
    assert(distance(before.view.camera, after.view.camera) > 10, 'test moves the camera');
    const v = after.view.viewport, c = after.view.camera;
    assert(Math.abs(after.game.aim.x - (c.x + (logical.x - v.x - v.w / 2) / c.zoom)) < .1);
    assert(Math.abs(after.game.aim.y - (c.y + (logical.y - v.y - v.h / 2) / c.zoom)) < .1);
    assert(distance(before.game.aim, after.game.aim) > 10, 'world aim changes even without pointermove');
  });
  await mark('HUD cannot fire, mouse release outside the world stops firing, Esc/help/blur clear input and freeze everything', async () => {
    await click(page, '#journey-reload-button'); const ammo = (await game(page)).ammo; await tick(page, 500); assert.equal((await game(page)).ammo, ammo, 'HUD click never fires');
    const p = (await game(page)).player; await mouseAt(page, { x: p.x - 60, y: p.y - 40 }); await page.mouse.down(); await tick(page, 80);
    await mouseScreen(page, { x: 12, y: 12 }); await page.mouse.up(); const released = (await game(page)).ammo; await tick(page, 400); assert.equal((await game(page)).ammo, released);
    await mouseAt(page, { x: p.x - 60, y: p.y - 40 }); await page.mouse.down(); await page.mouse.down({ button: 'right' }); await page.keyboard.down('KeyA'); await tick(page, 80);
    await assertFrozen(page, async () => { await page.keyboard.press('Escape'); await page.keyboard.up('KeyA'); await page.mouse.up(); await page.mouse.up({ button: 'right' }); });
    let s = await game(page); assert.equal(s.keys.length, 0); assert.equal(s.precision, false); const before = s.ammo; await tick(page, 500); assert.equal((await game(page)).ammo, before);
    await assertFrozen(page, () => click(page, '#help'));
    await page.keyboard.down('KeyA'); await mouseAt(page, (await game(page)).player); await page.mouse.down();
    await assertFrozen(page, async () => { await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('KeyA'); await page.mouse.up(); });
    assert.equal((await game(page)).keys.length, 0);
  });
  await mark('normal/abnormal scanning, visible分流 changes, combat retreat, real failure and cumulative checkpoint recovery', async () => {
    await diagnose(page); await capture(page, 'diagnosis'); await capture(page, 'bypass-before'); await connectBypasses(page); await capture(page, 'bypass-after');
    const enemy = (await game(page)).enemies.find(e => e.hp > 0); await moveTo(page, { x: enemy.x, y: enemy.y + 100 });
    for (let i = 0; i < 100 && (await game(page)).health === 100; i++) await tick(page, 100);
    assert((await game(page)).health > 0 && (await game(page)).health < 100); await capture(page, 'hunter');
    await moveTo(page, await portal(page, 'to-entry')); const before = await game(page); await page.keyboard.press('KeyE'); await tick(page, 32); assert.equal((await game(page)).room, 'entry');
    const ids = s => s.hunters.map(e => e.id + ':' + e.hp).join(','); await tick(page, 2000); const retreat = await game(page);
    assert.equal(retreat.health, before.health); assert.equal(retreat.ammo, before.ammo); assert.equal(ids(retreat), ids(before)); assert(retreat.elapsed > before.elapsed + 1.99);
    await interact(page, await portal(page, 'to-main')); const hunter = (await game(page)).enemies.find(e => e.hp > 0); await moveTo(page, { x: hunter.x, y: hunter.y + 80 });
    for (let i = 0; i < 180 && (await snapshot(page)).phase === 'playing'; i++) await tick(page, 500);
    let s = await snapshot(page); assert.equal(s.result.won, false); await tick(page, 1200); s = await snapshot(page); assert.equal(s.screen, 'result'); const elapsed = s.elapsed;
    await click(page, '#result-next'); s = await snapshot(page); assert.equal(s.phase, 'playing'); assert.equal(s.game.checkpoint, 'bypass'); assert(s.game.bypassA && s.game.bypassB); assert.equal(s.game.ammo, 24); assert.equal(s.game.health, 100); assert.equal(s.game.retries, 1); assert(s.elapsed >= elapsed && s.elapsed < elapsed + .1);
    const c = s.view.camera; assert(distance(c, s.game.player) < 700, 'retry repositions the camera to the checkpoint');
  });
  await mark('Hunter tutorial opens treatment; living interferers do not prevent flushing; burst pauses correctly', async () => {
    await fightTutorial(page); await capture(page, 'clot-before'); await capture(page, 'clot-before-no-labels', true);
    await restoreFlow(page, async () => { await capture(page, 'clot-softened'); }, async () => { await assertFrozen(page, () => click(page, '#pause')); await capture(page, 'burst'); }); await capture(page, 'flow-restored'); await capture(page, 'flow-restored-no-labels', true);
    assert((await game(page)).flowRestored); assert((await game(page)).enemies.every(e => e.hp <= 0));
  });
  await mark('heart diagnosis gates the ordered connections, reveal/recovery pause and restored city provide a dash', async () => {
    await interact(page, await portal(page, 'to-heart')); assert.equal((await game(page)).room, 'heart');
    await assertFrozen(page, () => click(page, '#pause')); await tick(page, 1600); await capture(page, 'heart-before'); await capture(page, 'heart-before-no-labels', true);
    await connectHeart(page, async () => { await tick(page, 1200); assert((await snapshot(page)).particles.length > 0, 'first strong heartbeat produces world particles'); await assertFrozen(page, () => click(page, '#pause')); }); await capture(page, 'heart-restored'); await capture(page, 'heart-restored-no-labels', true);
    assert.equal((await game(page)).heartbeat, 'stable');
  });
  await mark('dash crosses the barrier, scanned tissue is suppressed then regrows and giant exterior precedes one result', async () => {
    await exitAndSuppress(page); await capture(page, 'growth-suppressed'); await assertFrozen(page, () => click(page, '#pause'));
    await tick(page, 2600); const s = await game(page); assert(s.growth.regrowing); await capture(page, 'growth-regrown');
    await tick(page, 2500); assert.equal((await game(page)).endingScene, 'exterior'); await capture(page, 'giant-exterior'); await tick(page, 4000);
    const result = await snapshot(page); assert.equal(result.screen, 'result'); assert.equal(result.result.won, true); assert.equal(result.game.retries, 1); assert.equal(result.progress, 1); console.log('INFO browser completion: ' + result.result.seconds + ' active seconds including one deliberate failure'); await capture(page, 'result');
    await tick(page, 10000); assert.equal((await snapshot(page)).result.seconds, result.result.seconds, 'result cannot be recorded repeatedly');
    await click(page, '#result-next'); assert.equal((await snapshot(page)).screen, 'cases'); assert.match(await page.locator('#record-summary').textContent(), /1\s*\/\s*1/);
    assert.match(await page.locator('[data-case="heartJourney"] .case-mechanic').textContent(), new RegExp(`最佳.*${result.result.seconds}.*秒`));
  });
  await mark('refresh preserves the completion record and opens a fresh entry checkpoint', async () => {
    await page.reload(); await h.ready(page); assert.equal((await snapshot(page)).screen, 'home'); await click(page, '#begin'); assert.match(await page.locator('#record-summary').textContent(), /1\s*\/\s*1/);
    await start(page); const s = await game(page); assert.equal(s.checkpoint, 'entry'); assert.equal(s.retries, 0); assert.equal(s.health, 100); assert(!s.bypassA);
  });
  for (const size of [{ width: 1366, height: 768, dpr: 2 }, { width: 1920, height: 1080, dpr: 1 }, { width: 1920, height: 1080, dpr: 2 }, { width: 800, height: 900, dpr: 1 }]) {
    await mark(`${size.width}×${size.height} DPR ${size.dpr}: layout, projection and resize keep real tool hits aligned`, async () => {
      const responsive = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr }); const p = await setup(responsive, errors, requests); await start(p); await inspectFit(p);
      const before = await snapshot(p), target = { x: before.game.player.x + 100, y: before.game.player.y - 50 }; await mouseAt(p, target); await p.mouse.down(); await tick(p, 32); await p.mouse.up();
      const pointerTolerance = async () => { const s = await snapshot(p), box = await p.locator('#world').boundingBox(); return Math.SQRT2 * s.logicalSize.width / box.width / s.view.camera.zoom + .05; };
      assert.equal((await game(p)).ammo, 23); assert(distance((await game(p)).aim, target) < await pointerTolerance(), 'projection error stays within one CSS pixel of native input quantization');
      await p.setViewportSize({ width: 1000, height: 700 }); await tick(p, 48); await inspectFit(p); const next = { x: (await game(p)).player.x - 90, y: (await game(p)).player.y - 20 };
      await mouseAt(p, next); await tick(p, 220); await p.mouse.down(); await tick(p, 32); await p.mouse.up(); assert.equal((await game(p)).ammo, 22); assert(distance((await game(p)).aim, next) < await pointerTolerance(), 'resize keeps projection within native pointer quantization');
      const hud = await p.locator('#journey-task').boundingBox(), canvas = await p.locator('#world').boundingBox(), s = await snapshot(p); const bottom = canvas.y + (s.view.viewport.y + s.view.viewport.h) / s.logicalSize.height * canvas.height; assert(hud.y >= bottom - 1, 'task stays below playable world');
      await capture(p, `${size.width}x${size.height}-dpr${size.dpr}`);
      if (size.width === 1366 && size.dpr === 2) { await diagnose(p); await connectBypasses(p); await fightTutorial(p); assert.equal((await game(p)).stage, 'clot', 'DPR 2 after resizing still hits Hunter weakpoints with real mouse input'); }
      await responsive.close();
    });
  }
  await mark('reduced motion uses stable camera and 4 fps time remains synchronized without a deadline', async () => {
    const reduced = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' }); const p = await setup(reduced, errors, requests, 250); await start(p); assert((await snapshot(p)).reducedMotion);
    await p.keyboard.down('KeyD'); await tick(p, 1000); await p.keyboard.up('KeyD'); const stable = await snapshot(p); assert(Math.abs(stable.view.camera.x - stable.game.player.x) < 1e-6, 'reduced motion camera follows without an interpolated glide'); assert(Math.abs(stable.view.camera.zoom - 1.1) < 1e-9);
    await tick(p, 95000); const s = await snapshot(p); assert.equal(s.phase, 'playing'); assert.equal(s.result, null); assert.equal(s.remaining, null); assert(s.elapsed > 94); assert(Math.abs(s.elapsed - s.game.elapsed) < .08); await reduced.close();
  });
  assert.deepEqual(errors, [], 'no runtime errors'); assert.deepEqual(requests, [], 'no external resource requests'); assert.equal(entryHash(), testedEntry, 'offline entry remains identical throughout the suite'); console.log(`\n${checks.length} heart-journey browser checks passed; no errors or external requests.`);
})().catch(async e => { console.error(e.stack || e); if (page) { console.error('Last snapshot:', JSON.stringify(await snapshot(page)).slice(0, 12000)); await capture(page, 'failure'); } if (errors.length) console.error(errors); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
