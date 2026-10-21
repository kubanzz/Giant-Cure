'use strict';
// Run: node tests/journey-controllers.cjs. Every action uses public input.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { distance, crosses, overlaps, nextWaypoint } = require('./journey-navigation.cjs');
const sandbox = vm.createContext({ window: {}, console });
for (const file of ['heart-journey.js', 'journey-art.js']) {
  const full = path.join(__dirname, '..', 'src', file);
  if (fs.existsSync(full)) vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
}
let passed = 0;
function test(name, run) { try { run(); passed++; console.log('PASS ' + name); } catch (error) { console.error('FAIL ' + name); throw error; } }
const state = game => game.getDebugState();
function fresh() {
  const events = { success: 0, fail: 0, progress: [], feedback: [], heartbeats: [], tasks: [] }; let game;
  game = sandbox.window.GiantCureGames.heartJourney({
    progress(value) { assert(Number.isFinite(value) && value >= 0 && value <= 1); events.progress.push(value); },
    success() { events.success++; }, fail() { events.fail++; }, feedback(text, kind) { events.feedback.push({ text, kind }); },
    sound(name) { if (name === 'heartbeat') { const s = state(game); events.heartbeats.push({ elapsed: s.elapsed, ...s.beat }); } },
    effect() {}, setTask(text) { events.tasks.push(text); }
  }); return { game, events };
}
function advance(game, seconds, dt = 1 / 60) { for (let t = 0; t < seconds - 1e-9; t += dt) game.update(Math.min(dt, seconds - t)); }
function press(game, code) { game.keyDown(code, false); game.keyUp(code); }
function scan(game, enabled = true) { if (state(game).scanner !== enabled) press(game, 'KeyQ'); }
function moveTo(game, target, tolerance = 8) {
  for (let i = 0; i < 4000; i++) {
    const s = state(game); assert(!s.failed, 'equipment survives navigation: ' + JSON.stringify(s.player));
    if (distance(s.player, target) < tolerance) { game.clearInput(); return; }
    const waypoint = nextWaypoint(s, target); if (!waypoint) { game.clearInput(); game.update(1 / 60); continue; }
    const dx = waypoint.x - s.player.x, dy = waypoint.y - s.player.y;
    for (const [key, down] of [['KeyA', dx < -3], ['KeyD', dx > 3], ['KeyW', dy < -3], ['KeyS', dy > 3]]) { if (down) game.keyDown(key, false); else game.keyUp(key); }
    game.keyDown('ShiftLeft', false); game.update(1 / 60);
  }
  assert.fail(`movement blocked in ${state(game).room}/${state(game).stage}: ${JSON.stringify(state(game).player)} → ${JSON.stringify(target)}`);
}
function node(game, id) { const n = state(game).nodes.find(n => n.id === id); assert(n, 'node exists: ' + id); return n; }
function portal(game, id) { const n = state(game).portals.find(n => n.id === id); assert(n, 'portal exists: ' + id); return n; }
function interact(game, target) { moveTo(game, target); press(game, 'KeyE'); }
function discover(game, target) { scan(game); moveTo(game, target); advance(game, 1.4); }
function diagnose(game, normal = true) {
  if (normal) { discover(game, node(game, 'flow')); assert(state(game).scanned.flow); assert.equal(portal(game, 'to-main').locked, true, 'normal branch alone does not identify blockage'); }
  discover(game, node(game, 'pressure')); assert.equal(portal(game, 'to-main').locked, false);
  interact(game, portal(game, 'to-main')); assert.equal(state(game).room, 'main');
  const clot = state(game).clot; discover(game, { x: clot.x, y: clot.y + 145 }); assert.equal(state(game).stage, 'bypass');
}
function connectBypasses(game) {
  interact(game, node(game, 'A1')); interact(game, node(game, 'A2')); assert(state(game).bypassA); assert(!state(game).bypassB);
  interact(game, node(game, 'B1')); moveTo(game, node(game, 'B2')); while (state(game).beat.safe) game.update(1 / 60);
  press(game, 'KeyE'); assert.equal(state(game).bypassB, false); assert.equal(state(game).connection.join(','), 'B1');
  while (!state(game).beat.safe) game.update(1 / 60); press(game, 'KeyE'); assert.equal(state(game).stage, 'combat'); assert.equal(state(game).checkpoint, 'bypass');
  advance(game, 1.31); assert.equal(state(game).enemies.filter(e => e.hp > 0).length, 1, 'one Hunter teaches weakpoint combat');
}
function fightTutorial(game) {
  scan(game);
  for (let i = 0; i < 3600 && state(game).stage === 'combat'; i++) {
    const s = state(game), enemy = s.enemies.find(e => e.hp > 0); assert(enemy);
    if (distance(enemy, s.player) > 210) { moveTo(game, { x: enemy.x, y: enemy.y + 110 }); continue; }
    if (s.ammo === 0) { game.pointerUp(); press(game, 'KeyR'); advance(game, 1.71); continue; }
    game.pointerDown({ ...enemy.weakpoint, button: 0 }); game.update(1 / 60); assert(!state(game).failed);
  }
  game.pointerUp(); assert.equal(state(game).stage, 'clot'); assert.equal(state(game).combatComplete, true);
}
function approachHunter(game) {
  for (let i = 0; i < 12; i++) {
    const s = state(game), enemy = s.enemies.find(e => e.hp > 0); assert(enemy);
    const covered = s.obstacles.some(r => r.blocking !== false && crosses(s.player, enemy, r));
    if (distance(s.player, enemy) < 180 && !covered) return;
    const d = distance(s.player, enemy) || 1;
    moveTo(game, { x: enemy.x + (s.player.x - enemy.x) / d * 90, y: enemy.y + (s.player.y - enemy.y) / d * 90 });
  }
  assert.fail('could not approach the visible Hunter');
}
function weakpointPosition(game, id) {
  const weak = state(game).weakpoints.find(p => p.id === id), clot = state(game).obstacles.find(p => p.kind === 'clot');
  return [{ x: weak.x, y: clot.y - 50 }, { x: clot.x + clot.w + 55, y: weak.y }, { x: weak.x, y: clot.y + clot.h + 55 }, { x: clot.x - 55, y: weak.y }]
    .sort((a, b) => distance(a, weak) - distance(b, weak)).find(p => !state(game).obstacles.some(r => r.kind !== 'clot' && r.blocking !== false && overlaps(p, r, 20)));
}
function soften(game, id, seconds = 6) {
  scan(game); moveTo(game, weakpointPosition(game, id)); advance(game, 1.4); assert(state(game).weakpoints.find(p => p.id === id).scanned, 'locally discover ' + id);
  for (let t = 0; t < seconds && !state(game).weakpoints.find(p => p.id === id).complete; t += 1 / 60) {
    const weak = state(game).weakpoints.find(p => p.id === id);
    if (state(game).ammo === 0) { game.pointerUp(); press(game, 'KeyR'); advance(game, 1.71); }
    game.pointerDown({ ...weak, button: 0 }); game.update(1 / 60); assert(!state(game).failed, 'therapy remains survivable');
  } game.pointerUp();
}
function restoreFlow(game) {
  for (const p of state(game).weakpoints) { soften(game, p.id); assert(state(game).weakpoints.find(w => w.id === p.id).complete); }
  assert(state(game).enemies.some(e => e.hp > 0), 'interferers may remain alive at release');
  interact(game, node(game, 'release')); assert.equal(state(game).stage, 'burst'); advance(game, 4.1);
  assert.equal(state(game).checkpoint, 'flow'); assert(state(game).flowRestored); assert(state(game).enemies.every(e => e.hp <= 0));
}
function enterHeart(game) { interact(game, portal(game, 'to-heart')); assert.equal(state(game).room, 'heart'); advance(game, 1.6); }
function connectHeart(game) {
  interact(game, node(game, 'C1')); assert.equal(state(game).conduction.length, 0, 'diagnosis gates connections');
  discover(game, node(game, 'heart-signal')); assert(state(game).scanned['heart-signal']);
  interact(game, node(game, 'C3')); assert.equal(state(game).conduction.length, 0);
  for (const id of ['C1', 'C2', 'C3']) interact(game, node(game, id));
  assert.equal(state(game).stage, 'recovery'); assert.equal(state(game).dashUnlocked, false); advance(game, 6.1); assert(state(game).dashUnlocked); assert.equal(state(game).heartbeat, 'stable');
}
function toRevivedHeart() { const run = fresh(); diagnose(run.game); connectBypasses(run.game); fightTutorial(run.game); restoreFlow(run.game); enterHeart(run.game); connectHeart(run.game); return run; }
function verifyDraw(game) {
  let depth = 0, calls = 0;
  const finite = values => values.forEach(value => { if (typeof value === 'number') assert(Number.isFinite(value), 'finite Canvas coordinate'); });
  const ctx = new Proxy({}, { get(object, key) {
    if (key in object) return object[key];
    if (key === 'save') return () => { depth++; };
    if (key === 'restore') return () => { assert(depth > 0, 'balanced Canvas restore'); depth--; };
    if (key === 'measureText') return text => ({ width: String(text).length * 9 });
    if (/^create.*Gradient$/.test(key)) return (...args) => { finite(args); return { addColorStop(offset) { assert(offset >= 0 && offset <= 1); } }; };
    return (...args) => { calls++; finite(args); if (key === 'arc') assert(args[2] >= 0); if (key === 'ellipse') assert(args[2] >= 0 && args[3] >= 0); };
  }, set(object, key, value) { object[key] = value; return true; } });
  const before = JSON.stringify(state(game));
  game.draw(ctx, state(game).elapsed, { viewport: { x: 24, y: 84, w: 1232, h: 552 }, camera: { ...state(game).player, zoom: .8 }, hideLabels: true });
  assert.equal(depth, 0); assert(calls > 100, 'scene contains drawing primitives'); assert.equal(JSON.stringify(state(game)), before, 'rendering cannot mutate simulation');
}

test('entry: bounded scan, normal branch retracing, dormant dash and immutable snapshots', () => {
  const { game, events } = fresh(); scan(game); advance(game, 125, .5); assert.equal(state(game).stage, 'diagnosis'); assert.equal(events.fail, 0); assert.equal(state(game).health, 100); assert.equal(Object.keys(state(game).scanned).length, 0);
  const before = state(game).player; press(game, 'Space'); advance(game, .5); assert(!state(game).dashUnlocked); assert.equal(state(game).player.y, before.y);
  const s = state(game); assert(Object.isFrozen(s)); assert(Object.isFrozen(s.player)); assert.throws(() => { s.player.x = 0; }, TypeError);
  discover(game, node(game, 'flow')); moveTo(game, before); assert.equal(state(game).room, 'entry'); assert(state(game).scanned.flow); assert.equal(portal(game, 'to-main').locked, true);
});
test('heartbeat: visual/audio clock at normal and low frame rates, no catch-up backlog', () => {
  for (const dt of [1 / 60, .25]) { const { game, events } = fresh(); advance(game, 9.51, dt); assert.equal(events.heartbeats.length, 5); events.heartbeats.forEach((b, i) => { assert.equal(b.period, 1.9); assert(b.phase < .01); assert(Math.abs(b.elapsed - (i + 1) * 1.9) < .018); }); }
  const { game, events } = fresh(); game.update(20); assert.equal(events.heartbeats.length, 1); assert(Math.abs(state(game).beat.phase - ((20 / 1.9) % 1)) < 1e-6);
});
test('tool: precision cadence, exact magazine/reload and clearInput releases all controls', () => {
  const count = precise => { const { game } = fresh(); if (precise) game.pointerDown({ x: 900, y: 830, button: 2 }); game.pointerDown({ x: 900, y: 830, button: 0 }); advance(game, 1); return state(game).ammo; };
  assert.equal(count(true), count(false)); const { game } = fresh(); game.pointerDown({ x: 900, y: 830, button: 0 }); advance(game, 6); assert.equal(state(game).ammo, 0); advance(game, 2); assert.equal(state(game).ammo, 0);
  game.pointerUp(); press(game, 'KeyR'); assert.equal(state(game).reloadRemaining, 1.7); advance(game, 1.69); assert.equal(state(game).ammo, 0); advance(game, .011); assert.equal(state(game).ammo, 24);
  game.keyDown('KeyA'); game.pointerDown({ x: 900, y: 830, button: 0 }); game.pointerDown({ x: 900, y: 830, button: 2 }); game.clearInput(); const before = state(game).player; advance(game, 1);
  assert.equal(state(game).ammo, 24); assert.equal(state(game).precision, false); assert.equal(state(game).keys.length, 0); assert.equal(state(game).player.x, before.x);
  game.pointerDown({ x: 900, y: 830, button: 0 }); advance(game, .25); press(game, 'KeyR'); advance(game, 1.71); assert.equal(state(game).reloadRemaining, 0); assert.equal(state(game).ammo, 23, 'held trigger resumes after full reload'); game.pointerUp(); advance(game, .4); assert.equal(state(game).ammo, 23);
});
test('tool: a solid tissue wall stops the shot at its near face and consumes one round', () => {
  const { game } = fresh(); const wall = state(game).obstacles.find(r => r.kind === 'tissue'); assert(wall);
  const from = { x: wall.x + wall.w / 2, y: wall.y + wall.h + 35 }; moveTo(game, from);
  const target = { x: from.x, y: wall.y + wall.h - 10 }; game.pointerDown({ ...target, button: 0 }); game.update(1 / 60); game.pointerUp();
  const s = state(game); assert.equal(s.ammo, 23); assert(s.shot); assert.equal(s.shot.blocked, true); assert(s.shot.to.y >= wall.y + wall.h - .1, 'shot ends at the first wall surface');
});
test('valve: shared heartbeat, closure safely ejects overlapping unit without injury', () => {
  const { game } = fresh(); discover(game, node(game, 'pressure')); const valve = state(game).obstacles.find(r => r.kind === 'valve'); assert(valve);
  moveTo(game, { x: valve.x + valve.w / 2, y: valve.y + valve.h + 18 }); while (!state(game).beat.safe) game.update(1 / 60); assert.equal(state(game).obstacles.find(r => r.id === valve.id).blocking, false);
  game.keyDown('KeyW'); advance(game, .1); game.keyUp('KeyW'); assert(overlaps(state(game).player, valve), 'unit enters open valve');
  while (state(game).beat.safe) game.update(1 / 60); assert(!overlaps(state(game).player, valve)); assert.equal(state(game).health, 100); assert(state(game).player.y > valve.y + valve.h, 'return to entry side');
});
test('diagnosis: premature release, wrong branch sequences and cumulative entry retry', () => {
  const { game, events } = fresh(); diagnose(game); interact(game, node(game, 'release')); assert(!state(game).flowRestored); assert.equal(state(game).stage, 'bypass');
  interact(game, node(game, 'A2')); assert.equal(state(game).connection.length, 0); interact(game, node(game, 'A1')); interact(game, node(game, 'B2')); assert.equal(state(game).connection.length, 0); assert.equal(state(game).health, 100);
  const elapsed = state(game).elapsed; game.retryFromCheckpoint(); assert.equal(state(game).checkpoint, 'entry'); assert.equal(state(game).elapsed, elapsed); assert.equal(state(game).ammo, 24); assert(events.tasks.length >= 2); assert(state(game).task);
});
test('Hunter: normal/weakpoint damage, warning, invulnerability, retreat and checkpoint revival', () => {
  const { game, events } = fresh(); diagnose(game); connectBypasses(game); approachHunter(game); let target = state(game).enemies.find(e => e.hp > 0);
  scan(game, false); target = state(game).enemies.find(e => e.hp > 0); game.pointerDown({ x: target.x, y: target.y, button: 0 }); game.update(1 / 60); game.pointerUp(); assert.equal(state(game).enemies.find(e => e.id === target.id).hp, 5);
  advance(game, .21); scan(game); target = state(game).enemies.find(e => e.hp > 0); game.pointerDown({ ...target.weakpoint, button: 0 }); game.update(1 / 60); game.pointerUp(); assert.equal(state(game).enemies.find(e => e.id === target.id).hp, 2);
  moveTo(game, portal(game, 'to-entry')); const before = state(game); press(game, 'KeyE'); assert.equal(state(game).room, 'entry'); const ids = s => s.hunters.map(e => e.id + ':' + e.hp).join(','); advance(game, 2); assert.equal(state(game).health, before.health); assert.equal(ids(state(game)), ids(before)); assert.equal(state(game).ammo, before.ammo);
  interact(game, portal(game, 'to-main')); target = state(game).enemies.find(e => e.hp > 0); moveTo(game, { x: target.x, y: target.y + 80 }); let warning = false, prior = state(game).health;
  for (let i = 0; i < 60 * 100 && !state(game).failed; i++) { if (state(game).enemies.some(e => e.state === 'telegraph')) warning = true; game.update(1 / 60); const health = state(game).health; if (health < prior) { assert.equal(prior - health, 20); if (health > 0) { advance(game, .4); assert.equal(state(game).health, health); } prior = health; } }
  assert(warning); assert(state(game).failed); assert.equal(events.fail, 1); const elapsed = state(game).elapsed; advance(game, 5); assert.equal(events.fail, 1); assert.equal(state(game).elapsed, elapsed);
  assert(game.retryFromCheckpoint()); assert.equal(state(game).checkpoint, 'bypass'); assert(state(game).bypassA && state(game).bypassB); assert.equal(state(game).stage, 'combat'); assert.equal(state(game).elapsed, elapsed); assert.equal(state(game).health, 100); assert.equal(state(game).ammo, 24);
});
test('therapy: independent local scans, partial progress, two interferers and checkpoint reset', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); assert(state(game).weakpoints.some(p => !p.scanned), 'clot scan does not reveal every structure');
  const id = state(game).weakpoints[0].id; soften(game, id, .7); const amount = state(game).weakpoints[0].progress; assert(amount > 0 && amount < 1);
  moveTo(game, { x: 500, y: 220 }); advance(game, .5); assert.equal(state(game).weakpoints[0].progress, amount); soften(game, id); assert(state(game).weakpoints[0].complete); assert.equal(state(game).enemies.filter(e => e.hp > 0).length, 2); assert.equal(state(game).stage, 'clot');
  const elapsed = state(game).elapsed; game.retryFromCheckpoint(); assert.equal(state(game).elapsed, elapsed); assert(state(game).weakpoints.every(p => p.progress === 0 && !p.complete)); assert.equal(state(game).stage, 'combat');
});
test('chapter: flush with living Hunters, heart diagnosis, growth suppression/regrowth and one result', () => {
  const { game, events } = toRevivedHeart(); const beats = events.heartbeats.length; advance(game, 1.35); assert.equal(events.heartbeats.length - beats, 1); assert.equal(events.heartbeats.at(-1).period, 1.35);
  const barrier = state(game).obstacles.find(r => r.kind === 'dashBarrier'); moveTo(game, { x: 1300, y: barrier.y + barrier.h + 25 }); game.keyDown('KeyW'); advance(game, .3); game.keyUp('KeyW'); assert(!state(game).crossedBarrier);
  game.keyDown('KeyW'); press(game, 'Space'); advance(game, .35); game.clearInput(); assert(state(game).crossedBarrier); assert(!overlaps(state(game).player, barrier));
  const growth = state(game).growth; moveTo(game, growth); game.pointerDown({ ...growth, button: 0 }); advance(game, .3); game.pointerUp(); assert.equal(state(game).stage, 'escape');
  discover(game, growth); assert(state(game).growth.scanned); game.pointerDown({ ...growth, button: 0 }); advance(game, 1.51); game.pointerUp(); assert.equal(state(game).stage, 'ending');
  advance(game, 2.5); assert(state(game).growth.regrowing); advance(game, 3); assert.equal(state(game).endingScene, 'exterior'); advance(game, 2);
  assert.equal(events.success, 1); assert.equal(events.fail, 0); assert.equal(state(game).stage, 'complete'); assert.equal(events.progress.at(-1), 1); console.log('INFO input-driven controller completion: ' + state(game).elapsed.toFixed(1) + ' active seconds (no human reading/decision time)'); advance(game, 30); press(game, 'KeyE'); assert.equal(events.success, 1); assert.equal(game.retryFromCheckpoint(), false);
});
test('dash: natural expiry at several distances never embeds unit; flow checkpoint retains major progress', () => {
  const { game } = toRevivedHeart(); const barrier = state(game).obstacles.find(r => r.kind === 'dashBarrier');
  moveTo(game, { x: 1300, y: barrier.y + barrier.h + 25 }); game.keyDown('KeyW'); press(game, 'Space'); advance(game, .06); assert(overlaps(state(game).player, barrier), 'pause interrupts a dash while inside the barrier'); game.clearInput(); assert(!overlaps(state(game).player, barrier)); assert.equal(state(game).keys.length, 0); assert(!state(game).player.dashing); advance(game, 2.5);
  for (const offset of [18, 80, 145, 190]) {
    if (state(game).player.y < barrier.y) { game.keyDown('KeyS'); press(game, 'Space'); advance(game, .35); game.clearInput(); advance(game, 2.6); }
    moveTo(game, { x: 1300, y: barrier.y + barrier.h + offset }); game.keyDown('KeyW'); press(game, 'Space'); advance(game, .35); game.keyUp('KeyW'); assert(!state(game).player.dashing); assert(!overlaps(state(game).player, barrier), 'natural expiry at distance ' + offset); advance(game, 2.6);
  }
  const elapsed = state(game).elapsed; assert(game.retryFromCheckpoint()); assert.equal(state(game).checkpoint, 'flow'); assert.equal(state(game).elapsed, elapsed); assert(state(game).flowRestored); assert.equal(state(game).conduction.length, 0); assert(!state(game).dashUnlocked);
});
test('renderer: all rooms and recovery render finite geometry without modifying the simulation', () => {
  const { game } = fresh(); verifyDraw(game); diagnose(game); verifyDraw(game); connectBypasses(game); verifyDraw(game); fightTutorial(game); verifyDraw(game); restoreFlow(game); verifyDraw(game); enterHeart(game); verifyDraw(game); connectHeart(game); verifyDraw(game);
});
console.log(`\n${passed} heart-journey controller checks passed.`);
