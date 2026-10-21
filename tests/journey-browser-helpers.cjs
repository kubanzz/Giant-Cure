'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { distance, overlaps, nextWaypoint } = require('./journey-navigation.cjs');
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const snapshot = page => page.evaluate(() => window.GiantCure.snapshot());
const game = async page => (await snapshot(page)).game;
const tick = (page, ms) => page.clock.runFor(ms);
async function ready(page) {
  await page.evaluate(async () => { if (window.GiantCureAssets) await window.GiantCureAssets.ready; });
  await tick(page, 48);
}
async function click(page, selector, ms = 32) { await page.locator(selector).click(); if (ms) await tick(page, ms); }
const primary = page => click(page, '#dialog-actions .primary-button');
async function setup(context, errors, requests, frameGap = 0) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.stack || e.message));
  page.on('request', r => { if (!/^(file|data):/.test(r.url())) requests.push(r.url()); });
  const epoch = Date.parse('2026-10-21T05:00:00Z');
  await page.clock.install({ time: new Date(epoch) }); await page.clock.pauseAt(new Date(epoch + 1000));
  if (frameGap) await page.addInitScript(gap => {
    const nativeFrame = requestAnimationFrame.bind(window);
    // Each pending callback shares the slow display cadence; one animation must not starve another.
    window.requestAnimationFrame = callback => {
      const requestedAt = performance.now();
      return nativeFrame(function deliver(time) { if (time - requestedAt >= gap) callback(time); else nativeFrame(deliver); });
    };
  }, frameGap);
  await page.goto(url); await ready(page);
  assert(await page.evaluate(() => !!window.GiantCure)); return page;
}
async function start(page) {
  if ((await snapshot(page)).screen === 'home') await click(page, '#begin');
  let diagnosis = (await snapshot(page)).diagnosis;
  if (diagnosis.phase === 'idle') await click(page, '#diagnosis-action');
  if ((await snapshot(page)).diagnosis.phase === 'scanning') await tick(page, 3000);
  diagnosis = (await snapshot(page)).diagnosis;
  assert.deepEqual(diagnosis, { phase: 'ready', caseId: 'heartJourney' });
  await click(page, '#diagnosis-action'); await ready(page);
  const s = await snapshot(page); assert.equal(s.id, 'heartJourney'); assert.equal(s.phase, 'playing');
  assert.deepEqual(s.game.scanned, {}, 'room inspection does not write near-field chapter scan discoveries');
  assert.equal(s.game.stage, 'diagnosis'); assert.equal(s.game.checkpoint, 'entry');
  assert.equal(await page.locator('#modal').isHidden(), true, 'inspection confirmation enters directly without a preparation dialog');
}
function project(s, world) {
  const { viewport: v, camera: c } = s.view;
  return { x: v.x + v.w / 2 + (world.x - c.x) * c.zoom, y: v.y + v.h / 2 + (world.y - c.y) * c.zoom };
}
async function mouseScreen(page, logical) {
  const s = await snapshot(page), box = await page.locator('#world').boundingBox(); assert(box);
  await page.mouse.move(box.x + logical.x * box.width / s.logicalSize.width, box.y + logical.y * box.height / s.logicalSize.height);
}
async function mouseAt(page, world) {
  const s = await snapshot(page), p = project(s, world), v = s.view.viewport;
  assert(p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h, 'real aim target is inside the visible world: ' + JSON.stringify({ world, p }));
  await mouseScreen(page, p);
}
async function moveTo(page, target, tolerance = 10) {
  const held = new Set();
  try {
    for (let i = 0; i < 450; i++) {
      const s = await game(page); assert(!s.failed, 'equipment survives movement');
      if (distance(s.player, target) < tolerance) return;
      const waypoint = nextWaypoint(s, target);
      const needed = new Set(waypoint ? ['ShiftLeft'] : []);
      if (waypoint) { const dx = waypoint.x - s.player.x, dy = waypoint.y - s.player.y; if (dx < -4) needed.add('KeyA'); if (dx > 4) needed.add('KeyD'); if (dy < -4) needed.add('KeyW'); if (dy > 4) needed.add('KeyS'); }
      for (const key of held) if (!needed.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of needed) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
      const axes = waypoint ? [Math.abs(waypoint.x - s.player.x), Math.abs(waypoint.y - s.player.y)].filter(d => d > 4) : [];
      await tick(page, axes.length ? Math.min(110, Math.max(16, Math.min(...axes) / 174 * 1000)) : 32);
    }
    assert.fail('movement blocked: ' + JSON.stringify((await game(page)).player) + ' → ' + JSON.stringify(target));
  } finally { for (const key of held) await page.keyboard.up(key); }
}
async function scan(page, enabled = true) { if ((await game(page)).scanner !== enabled) await page.keyboard.press('KeyQ'); }
async function node(page, id) { const p = (await game(page)).nodes.find(p => p.id === id); assert(p, 'node exists: ' + id); return p; }
async function portal(page, id) { const p = (await game(page)).portals.find(p => p.id === id); assert(p, 'portal exists: ' + id); return p; }
async function interact(page, target) { await moveTo(page, target); await page.keyboard.press('KeyE'); await tick(page, 32); }
async function discover(page, target) { await scan(page); await moveTo(page, target); await tick(page, 1400); }
async function diagnose(page) {
  await discover(page, await node(page, 'flow')); assert((await game(page)).scanned.flow); assert((await portal(page, 'to-main')).locked);
  await discover(page, await node(page, 'pressure')); assert(!(await portal(page, 'to-main')).locked);
  await interact(page, await portal(page, 'to-main')); assert.equal((await game(page)).room, 'main');
  const clot = (await game(page)).clot; await discover(page, { x: clot.x, y: clot.y + 145 }); assert.equal((await game(page)).stage, 'bypass');
}
async function connectBypasses(page) {
  for (const id of ['A1', 'A2', 'B1']) await interact(page, await node(page, id)); await moveTo(page, await node(page, 'B2'));
  for (let i = 0; !(await game(page)).beat.safe && i < 120; i++) await tick(page, 16);
  await page.keyboard.press('KeyE'); await tick(page, 1340); assert.equal((await game(page)).stage, 'combat'); assert.equal((await game(page)).checkpoint, 'bypass');
}
async function fightTutorial(page) {
  await scan(page); let held = false;
  try {
    for (let i = 0; i < 1200 && (await game(page)).stage === 'combat'; i++) {
      const s = await game(page), enemy = s.enemies.find(e => e.hp > 0); assert(enemy);
      if (distance(enemy, s.player) > 210) { if (held) { await page.mouse.up(); held = false; } await moveTo(page, { x: enemy.x, y: enemy.y + 110 }); continue; }
      if (s.ammo === 0) { if (held) { await page.mouse.up(); held = false; } await page.keyboard.press('KeyR'); await tick(page, 1720); continue; }
      await mouseAt(page, enemy.weakpoint); if (!held) { await page.mouse.down(); held = true; } await tick(page, 32); assert(!(await game(page)).failed);
    }
  } finally { if (held) await page.mouse.up(); }
  assert.equal((await game(page)).stage, 'clot');
}
function therapyPosition(s, id) {
  const w = s.weakpoints.find(p => p.id === id), clot = s.obstacles.find(r => r.kind === 'clot');
  return [{ x: w.x, y: clot.y - 50 }, { x: clot.x + clot.w + 55, y: w.y }, { x: w.x, y: clot.y + clot.h + 55 }, { x: clot.x - 55, y: w.y }]
    .sort((a, b) => distance(a, w) - distance(b, w)).find(p => !s.obstacles.some(r => r.kind !== 'clot' && r.blocking !== false && overlaps(p, r, 20)));
}
async function soften(page, id) {
  await scan(page); await moveTo(page, therapyPosition(await game(page), id)); await tick(page, 1400);
  assert((await game(page)).weakpoints.find(p => p.id === id).scanned); let held = false;
  try {
    for (let i = 0; i < 150 && !(await game(page)).weakpoints.find(p => p.id === id).complete; i++) {
      const s = await game(page);
      if (s.ammo === 0) { if (held) { await page.mouse.up(); held = false; } await page.keyboard.press('KeyR'); await tick(page, 1720); }
      await mouseAt(page, s.weakpoints.find(p => p.id === id)); if (!held) { await page.mouse.down(); held = true; } await tick(page, 64); assert(!(await game(page)).failed, 'treatment survives interference');
    }
  } finally { if (held) await page.mouse.up(); }
  assert((await game(page)).weakpoints.find(p => p.id === id).complete, 'sustained local therapy completes ' + id);
}
async function restoreFlow(page, beforeRelease, duringBurst) {
  for (const w of (await game(page)).weakpoints) await soften(page, w.id);
  assert((await game(page)).enemies.some(e => e.hp > 0), 'living interferers do not block release');
  await moveTo(page, await node(page, 'release')); if (beforeRelease) await beforeRelease(); await page.keyboard.press('KeyE'); await tick(page, 32); assert.equal((await game(page)).stage, 'burst');
  if (duringBurst) await duringBurst();
  await tick(page, 4100); assert.equal((await game(page)).checkpoint, 'flow');
}
async function enterHeart(page) { await interact(page, await portal(page, 'to-heart')); assert.equal((await game(page)).room, 'heart'); await tick(page, 1600); }
async function connectHeart(page, onRecovery) {
  await interact(page, await node(page, 'C1')); assert.equal((await game(page)).conduction.length, 0);
  await discover(page, await node(page, 'heart-signal')); assert((await game(page)).scanned['heart-signal']);
  for (const id of ['C1', 'C2', 'C3']) await interact(page, await node(page, id)); assert.equal((await game(page)).stage, 'recovery');
  if (onRecovery) await onRecovery(); await tick(page, 6100); assert((await game(page)).dashUnlocked); assert.equal((await game(page)).heartbeat, 'stable');
}
async function capture(page, name, hideLabels = false) {
  const folder = path.join(__dirname, 'screenshots'); fs.mkdirSync(folder, { recursive: true });
  if (hideLabels) await page.evaluate(() => {
    const s = window.GiantCure.snapshot(), canvas = document.querySelector('#world'), ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / s.logicalSize.width, 0, 0, canvas.height / s.logicalSize.height, 0, 0);
    window.GiantCureJourneyArt.draw(ctx, s.game, s.activeTime, { ...s.view, hideLabels: true });
  });
  await page.screenshot({ path: path.join(folder, 'journey-' + name + '.png'), animations: 'disabled' });
}
async function inspectFit(page) {
  const fit = await page.evaluate(() => { const r = document.querySelector('#app').getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight, scroll: document.documentElement.scrollWidth }; });
  assert(fit.x >= -.5 && fit.y >= -.5 && fit.right <= fit.w + .5 && fit.bottom <= fit.h + .5, 'game fits viewport'); assert(fit.scroll <= fit.w, 'no horizontal overflow');
}
module.exports = { snapshot, game, tick, ready, click, primary, setup, start, project, mouseScreen, mouseAt, moveTo, scan, node, portal, interact, discover, diagnose, connectBypasses, fightTutorial, soften, restoreFlow, enterHeart, connectHeart, capture, inspectFit };
