'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { distance, crosses, overlaps, nextWaypoint } = require('./journey-navigation.cjs');
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
async function waitForEntry(page, limit = 6000) {
  for (let elapsed = 0; elapsed <= limit; elapsed += 16) {
    const s = await snapshot(page);
    if (s.phase === 'playing') {
      assert.deepEqual(s.transition, { phase: 'idle', caseId: null });
      assert.equal(await page.locator('#entry-transition').isHidden(), true);
      assert(s.elapsed <= .05 && s.activeTime <= .05 && s.game.elapsed <= .05, 'entry presentation cannot advance treatment time');
      return s;
    }
    assert.equal(s.phase, 'entering'); await tick(page, 16);
  }
  assert.fail('entry did not reach playing within ' + limit + ' ms');
}
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
  if ((await snapshot(page)).clinic?.phase !== 'ready') await click(page, '#clinic-skip');
  const diagnosis = (await snapshot(page)).diagnosis;
  assert.deepEqual(diagnosis, { phase: 'ready', caseId: 'heartJourney' });
  await click(page, '#diagnosis-action');
  const s = await waitForEntry(page); assert.equal(s.id, 'heartJourney'); assert.equal(s.phase, 'playing');
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
async function equip(page, id) {
  await page.mouse.up(); await page.keyboard.press(({ precision: 'Digit1', sprayer: 'Digit2', probe: 'Digit3' })[id]);
  assert.equal((await game(page)).tool, id);
}
async function diagnose(page) {
  await discover(page, await node(page, 'flow')); assert((await game(page)).scanned.flow); assert((await portal(page, 'to-main')).locked);
  await discover(page, await node(page, 'pressure')); assert(!(await portal(page, 'to-main')).locked);
  await interact(page, await portal(page, 'to-main')); assert.equal((await game(page)).room, 'main');
  const clot = (await game(page)).clot; await discover(page, { x: clot.x, y: clot.y + 145 }); assert.equal((await game(page)).stage, 'bypass');
}
async function collectSupply(page, id) {
  for (let i = 0; i < 150; i++) {
    const supply = (await game(page)).supplies.find(s => s.id === id); assert(supply);
    if (supply.state === 'collected') return;
    if (supply.state === 'ready') { await interact(page, supply); assert.equal((await game(page)).supplies.find(s => s.id === id).state, 'collected'); return; }
    assert.notEqual(supply.state, 'waiting', 'the delivery has been requested by gameplay'); await tick(page, 32);
  }
  assert.fail('delivery did not arrive: ' + id);
}
// Compatibility helper name only: V2 treats one alternative branch; no E sequence.
async function connectBypasses(page, id = 'left') {
  await clearInterference(page); await equip(page, 'precision');
  const branch = (await game(page)).branches.find(b => b.id === id); assert(branch);
  await moveTo(page, { x: branch.x, y: branch.y + 90 }); await scan(page, false); await mouseAt(page, branch);
  await page.mouse.down();
  try { for (let i = 0; i < 250 && !(await game(page)).branches.find(b => b.id === id).complete; i++) await tick(page, 32); }
  finally { await page.mouse.up(); }
  const s = await game(page); assert(s.branches.find(b => b.id === id).complete); assert.equal(s.checkpoint, 'bypass'); assert.equal(s.pressure, 'safe');
  await collectSupply(page, 'lysis'); assert((await game(page)).tools.find(t => t.id === 'sprayer').unlocked);
}
async function approachHunter(page) {
  for (let attempt = 0; attempt < 160; attempt++) {
    const s = await game(page), enemy = s.enemies.find(e => e.hp > 0);
    if (!enemy) { assert(s.encounter.pending || s.spawnTelegraphs.length, 'a Hunter is alive or pending'); await tick(page, 32); continue; }
    const covered = s.obstacles.some(r => r.blocking !== false && crosses(s.player, enemy, r));
    if (distance(s.player, enemy) >= 70 && distance(s.player, enemy) < 180 && !covered) return;
    const candidates = Array.from({ length: 16 }, (_, n) => ({ x: enemy.x + Math.cos(n * Math.PI / 8) * 150, y: enemy.y + Math.sin(n * Math.PI / 8) * 150 }))
      .filter(p => p.x > s.bounds.left + 20 && p.x < s.bounds.right - 20 && p.y > s.bounds.top + 20 && p.y < s.bounds.bottom - 20 && !s.obstacles.some(r => r.blocking !== false && (overlaps(p, r, 22) || crosses(p, enemy, r))))
      .sort((a, b) => distance(a, s.player) - distance(b, s.player));
    assert(candidates.length, 'Hunter has a reachable firing angle'); await moveTo(page, candidates[0]);
  }
  assert.fail('native movement can approach a Hunter for aimed fire');
}
async function clearInterference(page) {
  await equip(page, 'precision'); await scan(page); let firing = false, dodge = null, dodgeUntil = 0;
  const held = new Set();
  const release = async () => { for (const key of held) await page.keyboard.up(key); held.clear(); if (firing) { await page.mouse.up(); firing = false; } };
  try {
    for (let i = 0; i < 5000; i++) {
      const s = await game(page); assert(!s.failed, 'defensive native input survives');
      const alive = s.enemies.filter(e => e.hp > 0).sort((a, b) => distance(a, s.player) - distance(b, s.player)), enemy = alive[0];
      if (!enemy && !s.encounter.pending && !s.spawnTelegraphs.length) return;
      if (!enemy) { await release(); await tick(page, 32); continue; }
      const covered = s.obstacles.some(r => r.blocking !== false && crosses(s.player, enemy, r));
      const danger = alive.find(e => ['telegraph', 'lunge'].includes(e.state) && distance(s.player, e) < 290);
      if (danger && s.elapsed >= dodgeUntil) {
        const d = distance(danger, s.player) || 1, dx = (s.player.x - danger.x) / d, dy = (s.player.y - danger.y) / d;
        dodge = [1, -1].map(sign => ({ x: s.player.x - dy * 140 * sign, y: s.player.y + dx * 140 * sign })).find(p => p.x > s.bounds.left + 25 && p.x < s.bounds.right - 25 && p.y > s.bounds.top + 25 && p.y < s.bounds.bottom - 25 && !s.obstacles.some(r => r.blocking !== false && overlaps(p, r, 22))); dodgeUntil = s.elapsed + .85;
      }
      if ((!dodge || s.elapsed >= dodgeUntil) && (distance(s.player, enemy) > 205 || covered)) { await release(); await approachHunter(page); continue; }
      let waypoint = dodge && s.elapsed < dodgeUntil ? nextWaypoint(s, dodge) : null;
      if (!waypoint && distance(s.player, enemy) < 95) {
        const d = distance(s.player, enemy) || 1;
        waypoint = nextWaypoint(s, { x: Math.max(s.bounds.left + 30, Math.min(s.bounds.right - 30, s.player.x + (s.player.x - enemy.x) / d * 100)), y: Math.max(s.bounds.top + 30, Math.min(s.bounds.bottom - 30, s.player.y + (s.player.y - enemy.y) / d * 100)) });
      }
      const wanted = new Set(waypoint ? ['ShiftLeft'] : []);
      if (waypoint) { if (waypoint.x - s.player.x < -3) wanted.add('KeyA'); if (waypoint.x - s.player.x > 3) wanted.add('KeyD'); if (waypoint.y - s.player.y < -3) wanted.add('KeyW'); if (waypoint.y - s.player.y > 3) wanted.add('KeyS'); }
      for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
      const aim = enemy.state === 'recover' && enemy.weakpoint ? enemy.weakpoint : enemy, projected = project(await snapshot(page), aim), viewport = (await snapshot(page)).view.viewport;
      if (projected.x <= viewport.x || projected.x >= viewport.x + viewport.w || projected.y <= viewport.y || projected.y >= viewport.y + viewport.h) { if (firing) { await page.mouse.up(); firing = false; } await tick(page, 32); continue; }
      await mouseAt(page, aim); if (!firing) { await page.mouse.down(); firing = true; } await tick(page, 32);
    }
    assert.fail('finite encounter did not clear through native input');
  } finally { await release(); }
}
async function fightTutorial(page) { await clearInterference(page); assert.equal((await game(page)).stage, 'clot'); }
function segmentDistance(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0;
  return distance(point, { x: from.x + t * dx, y: from.y + t * dy });
}
function therapyPosition(s, id, avoidEnemies = false) {
  const w = s.weakpoints.find(p => p.id === id), clot = s.obstacles.find(r => r.kind === 'clot'), range = w.kind === 'fiber' ? 135 : 210;
  return [-120, -60, 0, 60, 120].flatMap(offset => [{ x: w.x + offset, y: clot.y - 50 }, { x: clot.x + clot.w + 55, y: w.y + offset }, { x: w.x + offset, y: clot.y + clot.h + 55 }, { x: clot.x - 55, y: w.y + offset }])
    .filter(p => distance(p, w) <= range && !s.obstacles.some(r => r.kind !== 'clot' && r.blocking !== false && (overlaps(p, r, 20) || crosses(p, w, r))) && (!avoidEnemies || !s.enemies.some(e => e.hp > 0 && segmentDistance(e, p, w) < 35)))
    .sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
}
async function soften(page, id, onPartial, leaveAlive = false) {
  if (!leaveAlive) await clearInterference(page);
  const weak = (await game(page)).weakpoints.find(p => p.id === id); await equip(page, weak.requiredTool); await moveTo(page, therapyPosition(await game(page), id));
  await scan(page, false); let held = false, observedPartial = false;
  try {
    for (let i = 0; i < 600 && !(await game(page)).weakpoints.find(p => p.id === id).complete; i++) {
      const s = await game(page); assert(!s.failed, 'treatment survives interference before retrying input');
      await scan(page, false); await mouseAt(page, s.weakpoints.find(p => p.id === id)); const ray = (await game(page)).toolPreview;
      if (ray.hitType !== 'treatment' || !(ray.targetId === id || ray.targets.some(t => t.targetId === id))) { if (held) { await page.mouse.up(); held = false; } const alternate = therapyPosition(await game(page), id, true); assert(alternate, 'alternate treatment angle is available'); await moveTo(page, alternate, 6); await tick(page, 16); continue; }
      if (!held) { await page.mouse.down(); held = true; } await tick(page, 32); assert(!(await game(page)).failed, 'treatment survives interference');
      if (onPartial && !observedPartial && (await game(page)).weakpoints.find(p => p.id === id).progress > .2) { observedPartial = true; if (held) { await page.mouse.up(); held = false; } await onPartial(id); }
    }
  } finally { if (held) await page.mouse.up(); }
  await tick(page, 220); assert((await game(page)).weakpoints.find(p => p.id === id).complete, 'sustained local therapy completes ' + id);
}
async function restoreFlow(page, beforeRelease, duringBurst, duringTherapy) {
  for (const [index, w] of (await game(page)).weakpoints.entries()) await soften(page, w.id, index === 0 ? duringTherapy : undefined);
  await moveTo(page, await node(page, 'release')); if (beforeRelease) await beforeRelease(); await page.keyboard.press('KeyE'); await tick(page, 32); assert.equal((await game(page)).stage, 'burst');
  if (duringBurst) await duringBurst();
  await tick(page, 4100); assert.equal((await game(page)).checkpoint, 'flow');
}
async function enterHeart(page) { await interact(page, await portal(page, 'to-heart')); assert.equal((await game(page)).room, 'heart'); await tick(page, 1600); }
async function connectHeart(page, onRecovery) {
  await clearInterference(page); await interact(page, await node(page, 'C1')); assert.equal((await game(page)).conduction.length, 0); assert(!(await game(page)).heartConnected);
  await discover(page, (await game(page)).fault); assert((await game(page)).fault.scanned); await collectSupply(page, 'probe');
  const fault = (await game(page)).fault; await equip(page, 'probe'); await moveTo(page, { x: fault.x, y: fault.y + 90 }); await scan(page, false); await mouseAt(page, fault);
  await page.mouse.down();
  try { for (let i = 0; i < 250 && !(await game(page)).fault.complete; i++) await tick(page, 32); }
  finally { await page.mouse.up(); }
  assert((await game(page)).fault.complete); assert.equal((await game(page)).stage, 'recovery');
  const justRepaired = await game(page); assert.equal(justRepaired.conductionSignal.verifiedBeats, 0);
  assert.equal(justRepaired.conductionSignal.samples.find(p => p.id === 'C3').output, false, 'repair is followed by a real downstream pulse check');
  if (onRecovery) await onRecovery();
  for (let i = 0; i < 400 && !(await game(page)).dashUnlocked; i++) {
    const current = await game(page);
    if (current.conductionSignal.verifiedBeats === 0) assert.equal(current.conductionSignal.samples.find(p => p.id === 'C3').output, false);
    else assert(current.conductionSignal.samples.find(p => p.id === 'C3').output);
    await tick(page, 32);
  }
  const s = await game(page); assert(s.dashUnlocked); assert(s.conductionSignal.verifiedBeats >= s.conductionSignal.requiredBeats); assert.equal(s.heartbeat, 'stable');
}
async function exitAndSuppress(page) {
  const barrier = (await game(page)).obstacles.find(r => r.kind === 'dashBarrier');
  await moveTo(page, { x: 1300, y: barrier.y + barrier.h + 25 });
  await page.keyboard.down('KeyW'); await tick(page, 300); await page.keyboard.up('KeyW'); assert(!(await game(page)).crossedBarrier);
  await page.keyboard.down('KeyW'); await page.keyboard.press('Space'); await tick(page, 350); await page.keyboard.up('KeyW');
  assert((await game(page)).crossedBarrier); assert(!overlaps((await game(page)).player, barrier));
  const growth = (await game(page)).growth; await discover(page, growth); assert((await game(page)).growth.scanned);
  await equip(page, 'precision');
  if ((await game(page)).ammo < 8) { await page.keyboard.press('KeyR'); await tick(page, 1720); }
  await mouseAt(page, growth); await page.mouse.down(); await tick(page, 1550); await page.mouse.up(); assert.equal((await game(page)).stage, 'ending');
}
async function waitForExterior(page) {
  for (let i = 0; i < 200; i++) {
    const s = await game(page);
    if (s.endingScene === 'exterior') { assert.equal(s.exteriorRecovery.duration, 8); return s; }
    assert.equal(s.stage, 'ending'); await tick(page, 32);
  }
  assert.fail('giant exterior did not follow the regrowth sequence');
}
async function recoveryAt(page, elapsed) {
  const s = await game(page), recovery = s.exteriorRecovery;
  assert.equal(s.endingScene, 'exterior'); assert(elapsed >= recovery.elapsed && elapsed < recovery.duration);
  await tick(page, (elapsed - recovery.elapsed) * 1000);
  const reached = await game(page); assert(Math.abs(reached.exteriorRecovery.elapsed - elapsed) < .04, 'recovery uses the controller clock'); return reached;
}
const canvasPixels = page => page.locator('#world').evaluate(canvas => canvas.toDataURL());
async function capture(page, name, hideLabels = false) {
  const folder = path.join(__dirname, 'screenshots'); fs.mkdirSync(folder, { recursive: true });
  if (hideLabels) await page.evaluate(() => {
    const s = window.GiantCure.snapshot(), canvas = document.querySelector('#world'), ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / s.logicalSize.width, 0, 0, canvas.height / s.logicalSize.height, 0, 0);
    window.GiantCureJourneyArt.draw(ctx, s.game, s.activeTime, { ...s.view, reducedMotion: s.reducedMotion, hideLabels: true });
  });
  await page.screenshot({ path: path.join(folder, 'journey-' + name + '.png'), animations: 'disabled' });
  if (hideLabels) await page.evaluate(() => {
    const s = window.GiantCure.snapshot(), canvas = document.querySelector('#world'), ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / s.logicalSize.width, 0, 0, canvas.height / s.logicalSize.height, 0, 0);
    window.GiantCureJourneyArt.draw(ctx, s.game, s.activeTime, { ...s.view, reducedMotion: s.reducedMotion });
  });
}
async function inspectFit(page) {
  const fit = await page.evaluate(() => { const r = document.querySelector('#app').getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight, scroll: document.documentElement.scrollWidth }; });
  assert(fit.x >= -.5 && fit.y >= -.5 && fit.right <= fit.w + .5 && fit.bottom <= fit.h + .5, 'game fits viewport'); assert(fit.scroll <= fit.w, 'no horizontal overflow');
}
module.exports = { snapshot, game, tick, ready, click, primary, waitForEntry, setup, start, project, mouseScreen, mouseAt, moveTo, scan, equip, node, portal, interact, discover, diagnose, collectSupply, connectBypasses, approachHunter, clearInterference, fightTutorial, soften, restoreFlow, enterHeart, connectHeart, exitAndSuppress, waitForExterior, recoveryAt, canvasPixels, capture, inspectFit };
