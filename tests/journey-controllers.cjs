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
let passed = 0, failed = 0;
function test(name, run) { try { run(); passed++; console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); } }
const state = game => game.getDebugState();
function fresh() {
  const events = { success: 0, fail: 0, progress: [], feedback: [], heartbeats: [], sounds: [], tasks: [] }; let game;
  game = sandbox.window.GiantCureGames.heartJourney({
    progress(value) { assert(Number.isFinite(value) && value >= 0 && value <= 1); events.progress.push(value); },
    success() { events.success++; }, fail() { events.fail++; }, feedback(text, kind) { events.feedback.push({ text, kind }); },
    sound(name) { events.sounds.push(name); if (name === 'heartbeat') { const s = state(game); events.heartbeats.push({ elapsed: s.elapsed, ...s.beat }); } },
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
    if (distance(s.player, enemy) >= 70 && distance(s.player, enemy) < 180 && !covered) return;
    const candidates = Array.from({ length: 16 }, (_, n) => ({ x: enemy.x + Math.cos(n * Math.PI / 8) * 150, y: enemy.y + Math.sin(n * Math.PI / 8) * 150 }))
      .filter(p => p.x > s.bounds.left + 20 && p.x < s.bounds.right - 20 && p.y > s.bounds.top + 20 && p.y < s.bounds.bottom - 20 && !s.obstacles.some(r => r.blocking !== false && (overlaps(p, r, 22) || crosses(p, enemy, r))))
      .sort((a, b) => distance(a, s.player) - distance(b, s.player));
    assert(candidates.length, 'Hunter has a reachable firing angle'); moveTo(game, candidates[0]);
  }
  assert.fail('could not approach the visible Hunter');
}
function clearInterference(game) {
  game.pointerUp(); scan(game);
  for (let frame = 0; frame < 60 * 90; frame++) {
    const s = state(game), enemy = s.enemies.filter(e => e.hp > 0).sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
    assert(!s.failed, 'active defensive route survives the encounter');
    if (!enemy && !s.encounter.pending) { game.clearInput(); return; }
    if (!enemy) { game.update(1 / 60); continue; }
    const covered = s.obstacles.some(r => r.blocking !== false && crosses(s.player, enemy, r));
    if (distance(enemy, s.player) > 210 || covered) {
      game.pointerUp();
      const d = distance(enemy, s.player) || 1, candidate = { x: enemy.x + (s.player.x - enemy.x) / d * 160, y: enemy.y + (s.player.y - enemy.y) / d * 160 }, waypoint = nextWaypoint(s, candidate);
      if (waypoint) { const dx = waypoint.x - s.player.x, dy = waypoint.y - s.player.y; for (const [key, down] of [['KeyA', dx < -3], ['KeyD', dx > 3], ['KeyW', dy < -3], ['KeyS', dy > 3]]) { if (down) game.keyDown(key); else game.keyUp(key); } game.keyDown('ShiftLeft'); }
      game.update(1 / 60); continue;
    }
    game.clearInput();
    if (s.ammo === 0) { game.pointerUp(); press(game, 'KeyR'); }
    game.pointerDown({ ...enemy.weakpoint, button: 0 }); game.update(1 / 60);
  }
  assert.fail('finite encounter can be cleared through public inputs');
}
function segmentDistance(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0;
  return distance(point, { x: from.x + t * dx, y: from.y + t * dy });
}
function circleEntry(from, to, center, radius) {
  const dx = to.x - from.x, dy = to.y - from.y, ox = from.x - center.x, oy = from.y - center.y, a = dx * dx + dy * dy;
  const b = ox * dx + oy * dy, discriminant = b * b - a * (ox * ox + oy * oy - radius * radius);
  if (discriminant < 0) return Infinity;
  const t = (-b - Math.sqrt(discriminant)) / a; return t >= 0 && t <= 1 ? t : Infinity;
}
function weakpointPosition(game, id, avoidEnemies = false) {
  const s = state(game), weak = s.weakpoints.find(p => p.id === id), clot = s.obstacles.find(p => p.kind === 'clot');
  const positions = [-120, -60, 0, 60, 120].flatMap(offset => [{ x: weak.x + offset, y: clot.y - 50 }, { x: clot.x + clot.w + 55, y: weak.y + offset }, { x: weak.x + offset, y: clot.y + clot.h + 55 }, { x: clot.x - 55, y: weak.y + offset }]);
  return positions
    .filter(p => distance(p, weak) <= (weak.scanned ? s.toolRange - 10 : s.scanRange - 12) && !s.obstacles.some(r => r.kind !== 'clot' && r.blocking !== false && (overlaps(p, r, 20) || crosses(p, weak, r))) && (!avoidEnemies || !s.enemies.some(e => e.hp > 0 && segmentDistance(e, p, weak) < 28)))
    .sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
}
function soften(game, id, seconds = 6, leaveAlive = false) {
  scan(game); moveTo(game, weakpointPosition(game, id)); advance(game, 1.4); assert(state(game).weakpoints.find(p => p.id === id).scanned, 'locally discover ' + id);
  for (let attempts = 0, treated = 0; attempts < 3600 && treated < seconds && !state(game).weakpoints.find(p => p.id === id).complete; attempts++) {
    const s = state(game), weak = s.weakpoints.find(p => p.id === id), threat = s.enemies.find(e => e.hp > 0 && distance(e, s.player) < 190 && !s.obstacles.some(r => r.blocking !== false && crosses(s.player, e, r)));
    if (state(game).ammo === 0) { game.pointerUp(); press(game, 'KeyR'); advance(game, 1.71); }
    if (threat && !leaveAlive) { scan(game); game.pointerDown({ ...threat.weakpoint, button: 0 }); game.update(1 / 60); continue; }
    game.pointerMove(weak);
    if (state(game).toolPreview.hitType !== 'treatment' || state(game).toolPreview.targetId !== id) {
      game.pointerUp(); const alternate = weakpointPosition(game, id, true); assert(alternate, 'an unobstructed treatment angle remains available'); moveTo(game, alternate, 4); game.update(1 / 60); continue;
    }
    game.pointerDown({ ...weak, button: 0 }); game.update(1 / 60); treated += 1 / 60; assert(!state(game).failed, 'therapy remains survivable');
  } game.pointerUp(); advance(game, .21);
}
function restoreFlow(game) {
  for (const [index, p] of state(game).weakpoints.entries()) { soften(game, p.id, 6, index === 2); assert(state(game).weakpoints.find(w => w.id === p.id).complete); }
  assert(state(game).enemies.some(e => e.hp > 0), 'interferers may remain alive at release');
  interact(game, node(game, 'release')); assert.equal(state(game).stage, 'burst'); advance(game, 4.1);
  assert.equal(state(game).checkpoint, 'flow'); assert(state(game).flowRestored); assert(state(game).enemies.every(e => e.hp <= 0));
}
function enterHeart(game) { interact(game, portal(game, 'to-heart')); assert.equal(state(game).room, 'heart'); advance(game, 1.6); }
function connectHeart(game) {
  interact(game, node(game, 'C1')); assert.equal(state(game).conduction.length, 0, 'diagnosis gates connections');
  assert.equal(state(game).guidance, null); discover(game, node(game, 'heart-signal')); assert(state(game).scanned['heart-signal']); assert.equal(state(game).guidance.target.id, 'C1');
  interact(game, node(game, 'C3')); assert.equal(state(game).conduction.length, 0); assert.equal(state(game).guidance.target.id, 'C1');
  for (const [index, id] of ['C1', 'C2', 'C3'].entries()) { interact(game, node(game, id)); if (index < 2) { assert.equal(state(game).guidance.source.id, id); assert.equal(state(game).guidance.target.id, ['C2', 'C3'][index]); assert.doesNotMatch(state(game).scannerInfo.join(' '), /传导中断/); } }
  assert.equal(state(game).guidance, null); assert.equal(state(game).stage, 'recovery'); assert.doesNotMatch(state(game).scannerInfo.join(' '), /传导中断/); assert.equal(state(game).dashUnlocked, false); advance(game, 6.1); assert(state(game).dashUnlocked); assert.equal(state(game).heartbeat, 'stable'); assert.match(state(game).scannerInfo.join(' '), /稳定/); assert.doesNotMatch(state(game).scannerInfo.join(' '), /传导中断/);
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
  for (const hideLabels of [false, true]) game.draw(ctx, state(game).elapsed, { viewport: { x: 24, y: 84, w: 1232, h: 552 }, camera: { ...state(game).player, zoom: .8 }, hideLabels });
  assert.equal(depth, 0); assert(calls > 100, 'scene contains drawing primitives'); assert.equal(JSON.stringify(state(game)), before, 'rendering cannot mutate simulation');
}
function combatRun() { const run = fresh(); diagnose(run.game); connectBypasses(run.game); approachHunter(run.game); return run; }
function firePreview(game, target) {
  game.pointerDown({ ...target, button: 2 }); const before = state(game), preview = before.toolPreview;
  verifyDraw(game);
  game.pointerDown({ ...target, button: 0 }); game.update(.000001); game.pointerUp({ ...target, button: 0 }); game.pointerUp({ ...target, button: 2 });
  const after = state(game); assert.equal(after.ammo, before.ammo - 1, 'every emitted ray spends exactly one dose'); assert(after.shot);
  for (const key of ['kind', 'hitType', 'targetId', 'weakpoint', 'blocked']) assert.equal(after.shot[key], preview[key], 'preview agrees with emitted ' + key);
  assert(distance(after.shot.to, preview.to) < 1e-7, 'preview and visible shot end at the same point'); return { before, after, preview };
}

test('entry: bounded scan, normal branch retracing, dormant dash and immutable snapshots', () => {
  const { game, events } = fresh(); scan(game); advance(game, 125, .5); assert.equal(state(game).stage, 'diagnosis'); assert.equal(events.fail, 0); assert.equal(state(game).health, 100); assert.equal(Object.keys(state(game).scanned).length, 0);
  const before = state(game).player; press(game, 'Space'); advance(game, .5); assert(!state(game).dashUnlocked); assert.equal(state(game).player.y, before.y);
  const s = state(game); assert(Object.isFrozen(s)); assert(Object.isFrozen(s.player)); assert(Object.isFrozen(s.exteriorRecovery)); assert.throws(() => { s.player.x = 0; }, TypeError);
  assert.deepEqual({ ...s.exteriorRecovery }, { elapsed: 0, duration: 8, progress: 0 });
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

test('tool: 16 ms frames preserve five doses per second and exact sustained treatment duration', () => {
  for (const precise of [false, true]) {
    const { game } = fresh(), target = { x: 900, y: 830 };
    if (precise) game.pointerDown({ ...target, button: 2 }); game.pointerDown({ ...target, button: 0 }); advance(game, 2.05, .016); assert.equal(state(game).ammo, 13, 'eleven doses have fired at t=0 through t=2.0');
    advance(game, 2.56, .016); assert.equal(state(game).ammo, 0, 'the twenty-fourth dose fires at t=4.6 without frame-rate drift');
  }
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); clearInterference(game); moveTo(game, weakpointPosition(game, 'W1')); scan(game); advance(game, 1.4); scan(game, false); press(game, 'KeyR'); advance(game, 1.71);
  game.pointerDown({ ...state(game).weakpoints.find(w => w.id === 'W1'), button: 0 }); advance(game, 3.21, .016); game.pointerUp(); assert(state(game).weakpoints.find(w => w.id === 'W1').complete, '3.2 seconds of paid therapy survives fractional RAF frames');
});
test('tool: a solid tissue wall stops the shot at its near face and consumes one round', () => {
  const { game } = fresh(); const wall = state(game).obstacles.find(r => r.kind === 'tissue'); assert(wall);
  const from = { x: wall.x + wall.w / 2, y: wall.y + wall.h + 35 }; moveTo(game, from);
  const target = { x: from.x, y: wall.y + wall.h - 10 }; game.pointerDown({ ...target, button: 0 }); game.update(1 / 60); game.pointerUp();
  const s = state(game); assert.equal(s.ammo, 23); assert(s.shot); assert.equal(s.shot.blocked, true); assert(s.shot.to.y >= wall.y + wall.h - .1, 'shot ends at the first wall surface');
});

test('ray: a near cursor only sets direction and the visible ray reaches the full tool range', () => {
  const { game } = fresh(), s = state(game); const result = firePreview(game, { x: s.player.x + 15, y: s.player.y });
  assert.equal(result.preview.hitType, 'none'); assert(Math.abs(distance(result.preview.from, result.preview.to) - s.toolRange) < 1e-7);
  assert(Object.isFrozen(state(game).toolPreview), 'new preview remains read-only'); assert.equal(state(game).precision, false);
});

test('ray: aim beyond a Hunter, including far outside range, hits the first Hunter body', () => {
  for (const factor of [1.2, 8]) {
    const { game } = combatRun(); scan(game, false); const s = state(game), hunter = s.enemies.find(e => e.hp > 0);
    const target = { x: s.player.x + (hunter.x - s.player.x) * factor, y: s.player.y + (hunter.y - s.player.y) * factor };
    assert(distance(target, hunter) > 22, 'cursor is visibly beyond the Hunter'); if (factor === 8) assert(distance(target, s.player) > s.toolRange);
    const result = firePreview(game, target); assert.equal(result.preview.hitType, 'hunter'); assert.equal(result.preview.targetId, hunter.id);
    assert.equal(result.preview.weakpoint, false); assert.equal(state(game).enemies.find(e => e.id === hunter.id).hp, hunter.hp - 1);
  }
});

test('ray: scanning exposes same-Hunter weakpoints while an off-center body ray stays ordinary', () => {
  for (const weakHit of [false, true]) {
    const { game } = combatRun(); scan(game); const s = state(game), hunter = s.enemies.find(e => e.hp > 0), d = distance(s.player, hunter);
    const direction = { x: (hunter.x - s.player.x) / d, y: (hunter.y - s.player.y) / d };
    const target = weakHit ? hunter.weakpoint : { x: hunter.x - direction.y * 18, y: hunter.y + direction.x * 18 };
    const result = firePreview(game, target); assert.equal(result.preview.hitType, 'hunter'); assert.equal(result.preview.weakpoint, weakHit);
    assert.equal(state(game).enemies.find(e => e.id === hunter.id).hp, hunter.hp - (weakHit ? 3 : 1));
  }
});

test('ray: tissue before a pursuing Hunter keeps the Hunter unharmed', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); moveTo(game, { x: 1195, y: 670 });
  const wall = state(game).obstacles.find(r => r.id === 'main-island-r'); let blockedTarget;
  for (let i = 0; i < 12 * 60 && distance(state(game).player, state(game).enemies[0]) > 150; i++) game.update(1 / 60);
  for (let i = 0; i < 8 * 60; i++) {
    const s = state(game), hunter = s.enemies.find(e => e.hp > 0);
    if (distance(s.player, hunter) < s.toolRange + 15 && crosses(s.player, hunter, wall)) { blockedTarget = hunter; break; }
    const waypoint = nextWaypoint(s, { x: 960, y: 670 }); assert(waypoint);
    for (const [key, down] of [['KeyA', waypoint.x - s.player.x < -3], ['KeyD', waypoint.x - s.player.x > 3], ['KeyW', waypoint.y - s.player.y < -3], ['KeyS', waypoint.y - s.player.y > 3]]) { if (down) game.keyDown(key); else game.keyUp(key); }
    game.keyDown('ShiftLeft');
    game.update(1 / 60); assert(!state(game).failed);
  }
  game.clearInput(); assert(blockedTarget, 'natural Hunter path crosses the island sight line'); const result = firePreview(game, blockedTarget);
  assert.equal(result.preview.hitType, 'wall'); assert.equal(result.preview.targetId, wall.id); assert.equal(state(game).enemies.find(e => e.id === blockedTarget.id).hp, blockedTarget.hp);
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

test('guidance: no diagnosis spoiler, selected endpoint, wrong-order reset, safe-window wait and retry reset', () => {
  const { game } = fresh(); assert.equal(state(game).guidance, null); diagnose(game); assert.equal(state(game).guidance, null);
  interact(game, node(game, 'A1')); let guide = state(game).guidance; assert.equal(guide.kind, 'bypass'); assert.equal(guide.source.id, 'A1'); assert.equal(guide.target.id, 'A2'); assert.match(state(game).task, /A.*寻找 B/); verifyDraw(game);
  interact(game, node(game, 'B2')); assert.equal(state(game).guidance, null); assert.equal(state(game).connection.length, 0);
  interact(game, node(game, 'A1')); interact(game, node(game, 'A2')); assert.equal(state(game).guidance, null);
  interact(game, node(game, 'B1')); moveTo(game, node(game, 'B2')); while (state(game).beat.safe) game.update(1 / 60);
  assert.equal(state(game).guidance.target.id, 'B2'); assert.equal(state(game).guidance.waiting, true); press(game, 'KeyE'); assert.equal(state(game).guidance.source.id, 'B1');
  while (!state(game).beat.safe) game.update(1 / 60); assert.equal(state(game).guidance.waiting, false); press(game, 'KeyE'); assert.equal(state(game).guidance, null);
  game.retryFromCheckpoint(); assert.equal(state(game).guidance, null); assert.equal(state(game).connection.length, 0);
});
test('Hunter: normal/weakpoint damage, warning, invulnerability, retreat and checkpoint revival', () => {
  const { game, events } = fresh(); diagnose(game); connectBypasses(game); approachHunter(game); let target = state(game).enemies.find(e => e.hp > 0);
  scan(game, false); target = state(game).enemies.find(e => e.hp > 0); game.pointerDown({ x: target.x, y: target.y, button: 0 }); game.update(1 / 60); game.pointerUp(); assert.equal(state(game).enemies.find(e => e.id === target.id).hp, 8);
  advance(game, .21); scan(game); target = state(game).enemies.find(e => e.hp > 0); game.pointerDown({ ...target.weakpoint, button: 0 }); game.update(1 / 60); game.pointerUp(); assert.equal(state(game).enemies.find(e => e.id === target.id).hp, 5);
  moveTo(game, portal(game, 'to-entry')); const before = state(game); press(game, 'KeyE'); assert.equal(state(game).room, 'entry'); const ids = s => s.hunters.map(e => e.id + ':' + e.hp).join(','); advance(game, 2); assert.equal(state(game).health, before.health); assert.equal(ids(state(game)), ids(before)); assert.equal(state(game).ammo, before.ammo);
  interact(game, portal(game, 'to-main')); approachHunter(game); let warning = false, prior = state(game).health;
  for (let i = 0; i < 60 * 100 && !state(game).failed; i++) { if (state(game).enemies.some(e => e.state === 'telegraph')) warning = true; game.update(1 / 60); const health = state(game).health; if (health < prior) { assert.equal(prior - health, 20); if (health > 0) { advance(game, .4); assert.equal(state(game).health, health); } prior = health; } }
  assert(warning); assert(state(game).failed); assert.equal(events.fail, 1); const elapsed = state(game).elapsed; advance(game, 5); assert.equal(events.fail, 1); assert.equal(state(game).elapsed, elapsed);
  assert(game.retryFromCheckpoint()); assert.equal(state(game).checkpoint, 'bypass'); assert(state(game).bypassA && state(game).bypassB); assert.equal(state(game).stage, 'combat'); assert.equal(state(game).elapsed, elapsed); assert.equal(state(game).health, 100); assert.equal(state(game).ammo, 24);
});
test('therapy: independent local scans, partial progress, queued interferers and checkpoint reset', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); assert(state(game).weakpoints.some(p => !p.scanned), 'clot scan does not reveal every structure');
  const id = state(game).weakpoints[0].id; soften(game, id, .7); const amount = state(game).weakpoints[0].progress; assert(amount > 0 && amount < 1);
  moveTo(game, { x: 500, y: 220 }); advance(game, .5); assert.equal(state(game).weakpoints[0].progress, amount); soften(game, id); assert(state(game).weakpoints[0].complete); assert(state(game).encounter.triggered['structure-1']); assert(state(game).encounter.alive <= 4); assert.equal(state(game).stage, 'clot');
  const elapsed = state(game).elapsed; game.retryFromCheckpoint(); assert.equal(state(game).elapsed, elapsed); assert(state(game).weakpoints.every(p => p.progress === 0 && !p.complete)); assert.equal(state(game).stage, 'combat');
});

test('therapy: unknown structure reports diagnosis; scanned structure admits its own clot with Q off and retains progress through reload', () => {
  const { game, events } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); scan(game, false);
  const weak = state(game).weakpoints.find(p => !p.scanned); assert(weak); moveTo(game, weakpointPosition(game, weak.id));
  let result = firePreview(game, weak); assert.equal(result.preview.hitType, 'clot'); assert.match(result.preview.label, /扫描|诊断/); assert.equal(state(game).weakpoints.find(w => w.id === weak.id).progress, 0); assert(events.feedback.some(f => /扫描|诊断/.test(f.text)));
  scan(game); advance(game, 1.4); scan(game, false); advance(game, .21); assert(state(game).weakpoints.find(w => w.id === weak.id).scanned);
  result = firePreview(game, weak); assert.equal(result.preview.hitType, 'treatment'); assert.equal(result.preview.targetId, weak.id); assert.equal(result.preview.blocked, false);
  const clot = state(game).obstacles.find(o => o.kind === 'clot'); assert(result.preview.to.x >= clot.x && result.preview.to.x <= clot.x + clot.w && result.preview.to.y >= clot.y && result.preview.to.y <= clot.y + clot.h, 'diagnosed treatment enters its target clot');
  game.pointerDown({ ...weak, button: 0 }); advance(game, .31); game.clearInput(); const progress = state(game).weakpoints.find(w => w.id === weak.id).progress; assert(progress > 0 && progress < 1); assert.equal(state(game).scanner, false);
  press(game, 'KeyR'); advance(game, .85); assert.equal(state(game).weakpoints.find(w => w.id === weak.id).progress, progress); advance(game, .86); assert.equal(state(game).ammo, 24); assert.equal(state(game).weakpoints.find(w => w.id === weak.id).progress, progress);
  game.pointerDown({ ...weak, button: 0 }); advance(game, .31); game.pointerUp(); assert(state(game).weakpoints.find(w => w.id === weak.id).progress > progress);
});

test('ray: clustered living interferers stop at the first Hunter without penetrating the second', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); soften(game, 'W1'); scan(game, false); moveTo(game, { x: 975, y: 560 });
  let aligned;
  for (let i = 0; i < 20 * 60 && !aligned; i++) {
    const s = state(game), alive = s.enemies.filter(e => e.hp > 0);
    assert(alive.length >= 2 && alive.length <= 4);
    for (const far of alive) for (const near of alive.filter(e => e.id !== far.id)) { if (distance(s.player, far) < s.toolRange && distance(s.player, near) < distance(s.player, far) - 24 && segmentDistance(near, s.player, far) < 18) { game.pointerMove(far); const ray = state(game).toolPreview; if (ray.hitType === 'hunter' && ray.targetId === near.id) { aligned = { near, far }; break; } } }
    if (!aligned) { game.update(1 / 60); assert(!state(game).failed, 'two-Hunter lineup remains survivable'); }
  }
  assert(aligned, 'natural pursuit creates a front/back Hunter lineup'); const result = firePreview(game, aligned.far); assert.equal(result.preview.targetId, aligned.near.id);
  assert.equal(state(game).enemies.find(e => e.id === aligned.near.id).hp, aligned.near.hp - 1); assert.equal(state(game).enemies.find(e => e.id === aligned.far.id).hp, aligned.far.hp);
});

test('therapy: a living Hunter in front of a diagnosed clot structure intercepts treatment', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); soften(game, 'W1');
  discover(game, { x: 975, y: 382 }); const weak = state(game).weakpoints.find(w => w.id === 'W2'); assert(weak.scanned); scan(game, false); let intercepted;
  for (let i = 0; i < 8 * 60; i++) { game.pointerMove(weak); const s = state(game); if (s.toolPreview.hitType === 'hunter') { intercepted = s; break; } game.update(1 / 60); assert(!state(game).failed); }
  assert(intercepted, 'approaching interference actually crosses the treatment ray'); const result = firePreview(game, weak); assert.equal(result.preview.hitType, 'hunter');
  assert.equal(state(game).weakpoints.find(w => w.id === weak.id).progress, weak.progress); const prior = intercepted.enemies.find(e => e.id === result.preview.targetId); assert.equal(state(game).enemies.find(e => e.id === prior.id).hp, prior.hp - 1);
});

test('ray: a rear overlapping Hunter weakpoint cannot steal the nearer Hunter body hit', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); soften(game, 'W1'); scan(game);
  const route = [{ x: 1400, y: 850 }, { x: 1400, y: 450 }, { x: 1000, y: 800 }, { x: 1250, y: 500 }]; let leg = 0, found;
  // Genuine pursuit eventually overlaps the two Hunters. Search read-only geometry
  // for the regression where the rear weakpoint protrudes before the front body.
  for (let frame = 0; frame < 3600 && !found; frame++) {
    const s = state(game), alive = s.enemies.filter(e => e.hp > 0);
    for (let degrees = 0; degrees < 360; degrees++) {
      const angle = degrees * Math.PI / 180, target = { x: s.player.x + Math.cos(angle) * s.toolRange, y: s.player.y + Math.sin(angle) * s.toolRange };
      const bodies = alive.map(e => ({ enemy: e, at: circleEntry(s.player, target, e, 22) })).filter(e => Number.isFinite(e.at)).sort((a, b) => a.at - b.at);
      if (bodies.length < 2 || Number.isFinite(circleEntry(s.player, target, bodies[0].enemy.weakpoint, 11)) || circleEntry(s.player, target, bodies[1].enemy.weakpoint, 11) >= bodies[0].at) continue;
      game.pointerMove(target); if (state(game).toolPreview.hitType === 'hunter') { found = { target, front: bodies[0].enemy, rear: bodies[1].enemy }; break; }
    }
    if (found) break;
    if (distance(s.player, route[leg]) < 10) leg = (leg + 1) % route.length;
    const waypoint = nextWaypoint(s, route[leg]); assert(waypoint);
    for (const [key, down] of [['KeyA', waypoint.x - s.player.x < -3], ['KeyD', waypoint.x - s.player.x > 3], ['KeyW', waypoint.y - s.player.y < -3], ['KeyS', waypoint.y - s.player.y > 3]]) { if (down) game.keyDown(key); else game.keyUp(key); }
    game.keyDown('ShiftLeft'); game.update(1 / 60); assert(!state(game).failed, 'public kiting route survives until overlap');
  }
  game.clearInput(); assert(found, 'natural gameplay reproduces overlapping body/weakpoint priority'); const result = firePreview(game, found.target);
  assert.equal(result.preview.targetId, found.front.id); assert.equal(result.preview.weakpoint, false); assert.equal(state(game).enemies.find(e => e.id === found.front.id).hp, found.front.hp - 1); assert.equal(state(game).enemies.find(e => e.id === found.rear.id).hp, found.rear.hp);
});
test('chapter: flush with living Hunters, heart diagnosis, growth suppression/regrowth and one result', () => {
  const { game, events } = toRevivedHeart(); const beats = events.heartbeats.length; advance(game, 1.35); assert.equal(events.heartbeats.length - beats, 1); assert.equal(events.heartbeats.at(-1).period, 1.35);
  const barrier = state(game).obstacles.find(r => r.kind === 'dashBarrier'); moveTo(game, { x: 1300, y: barrier.y + barrier.h + 25 }); game.keyDown('KeyW'); advance(game, .3); game.keyUp('KeyW'); assert(!state(game).crossedBarrier);
  game.keyDown('KeyW'); press(game, 'Space'); advance(game, .35); game.clearInput(); assert(state(game).crossedBarrier); assert(!overlaps(state(game).player, barrier));
  const growth = state(game).growth; moveTo(game, growth); game.pointerDown({ ...growth, button: 0 }); advance(game, .3); game.pointerUp(); assert.equal(state(game).stage, 'escape');
  discover(game, growth); assert(state(game).growth.scanned); advance(game, 2.5); moveTo(game, { x: 1300, y: barrier.y - 25 }); game.keyDown('KeyS'); press(game, 'Space'); advance(game, .35); game.clearInput();
  moveTo(game, { x: 1300, y: barrier.y + barrier.h + 25 }); scan(game, false); const blocked = firePreview(game, growth); assert.equal(blocked.preview.hitType, 'wall'); assert.equal(blocked.preview.targetId, barrier.id); assert.equal(state(game).growth.progress, 0, 'another tissue barrier still blocks diagnosed treatment');
  advance(game, 2.5); game.keyDown('KeyW'); press(game, 'Space'); advance(game, .35); game.clearInput(); moveTo(game, growth); game.pointerDown({ ...growth, button: 0 }); advance(game, 1.51, .016); game.pointerUp(); assert.equal(state(game).stage, 'ending'); assert.equal(state(game).scanner, false, 'growth treatment also preserves diagnosis with Q off');
  advance(game, 2.5); assert(state(game).growth.regrowing); advance(game, 3); assert.equal(state(game).endingScene, 'exterior');
  assert.equal(state(game).endingDuration, 11.8); assert.equal(state(game).exteriorRecovery.duration, 8); assert(state(game).exteriorRecovery.progress > 0 && state(game).exteriorRecovery.progress < 1);
  const before = state(game), remaining = before.endingDuration - before.ending;
  game.update(remaining);
  assert.equal(state(game).ending, 11.8); assert.equal(state(game).exteriorRecovery.elapsed, 8); assert.equal(state(game).exteriorRecovery.progress, 1);
  assert(Math.abs(state(game).elapsed - before.elapsed - remaining) < 1e-8, 'fast-forward advances the full remaining cinematic time');
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

test('medic: measured movement and reload phases emit each sound once, including empty-trigger feedback', () => {
  const { game, events } = fresh();
  game.keyDown('KeyD'); advance(game, .1); const moving = state(game).player;
  assert(moving.moving); assert(Math.abs(moving.velocity.x - 128) < .001); assert(moving.walkDistance > 12);
  game.clearInput(); assert.equal(state(game).player.moving, false); assert.equal(state(game).player.velocity.x, 0);
  game.pointerDown({ x: 1100, y: 830, button: 0 }); game.update(.001); game.pointerUp();
  press(game, 'KeyR'); press(game, 'KeyR'); assert.equal(state(game).reloadStage, 'eject'); assert.equal(state(game).reloadProgress, 0);
  advance(game, .44); assert.equal(state(game).reloadStage, 'eject'); advance(game, .02); assert.equal(state(game).reloadStage, 'insert');
  advance(game, .8); assert.equal(state(game).reloadStage, 'lock'); assert(state(game).reloadProgress > .7); advance(game, .44);
  assert.equal(state(game).reloadStage, 'idle'); assert.equal(state(game).ammo, 24);
  for (const name of ['reloadOut', 'reloadIn', 'reloadReady']) assert.equal(events.sounds.filter(s => s === name).length, 1, name + ' occurs once');
  game.pointerDown({ x: 1100, y: 830, button: 0 }); advance(game, 7); assert.equal(events.sounds.filter(s => s === 'empty').length, 1);
  advance(game, 2); assert.equal(events.sounds.filter(s => s === 'empty').length, 1); game.pointerUp();
  game.pointerDown({ x: 1100, y: 830, button: 0 }); advance(game, .02); assert.equal(events.sounds.filter(s => s === 'empty').length, 2); game.pointerUp();
  press(game, 'KeyR'); advance(game, .1); game.retryFromCheckpoint(); assert.equal(state(game).reloadStage, 'idle'); assert.equal(state(game).reloadProgress, 0);
  advance(game, 2); assert.equal(events.sounds.filter(s => s === 'reloadReady').length, 1, 'retry cancels the unfinished reload');
});

test('encounters: warning, stagger, cap, finite budget, safe terrain and retreat freeze', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game);
  assert.equal(state(game).encounter.pending, 3); game.update(1 / 60);
  const warning = state(game).spawnTelegraphs[0]; assert(warning); assert.equal(warning.remaining, 1); assert(distance(warning, state(game).player) >= 280);
  advance(game, .9); assert.equal(state(game).enemies.filter(e => e.hp > 0).length, 0, 'full warning precedes the first reinforcement');
  const births = new Map();
  const observe = () => {
    const s = state(game); assert(s.encounter.alive <= 4); assert(s.encounter.spawned <= 10);
    for (const e of s.enemies.filter(e => e.hp > 0)) if (!births.has(e.id)) {
      births.set(e.id, s.elapsed); assert(distance(e, s.player) >= 276, 'new Hunter is outside the player safety radius');
      assert(!s.obstacles.some(o => o.blocking !== false && overlaps(e, o, 22)), 'spawn does not overlap solid tissue');
      assert(!s.nodes.some(n => distance(e, n) < 85), 'spawn leaves node interaction space');
    }
  };
  for (let n = 0; n < 240; n++) { game.update(1 / 60); observe(); }
  const times = [...births.values()]; assert.equal(times.length, 3); for (let i = 1; i < times.length; i++) assert(times[i] - times[i - 1] >= 1.19);
  interact(game, portal(game, 'to-entry')); const frozen = state(game);
  const roomState = s => ({ enemies: s.hunters.map(e => ({ id: e.id, room: e.room, x: e.x, y: e.y, hp: e.hp, timer: e.timer, state: e.state })), encounter: s.encounters.main });
  advance(game, 3); assert.deepEqual(roomState(state(game)), roomState(frozen)); assert.equal(state(game).enemies.length, 0);
  interact(game, portal(game, 'to-main')); assert.equal(state(game).encounter.spawned, frozen.encounters.main.spawned, 'returning does not repeat a triggered encounter');
  game.retryFromCheckpoint(); const retry = state(game); assert.equal(retry.stage, 'combat'); assert.equal(retry.encounter.spawned, 0); assert.equal(retry.encounter.pending, 1); assert(!retry.encounter.triggered.treatment);
  assert.equal(retry.obstacles.find(o => o.id === 'main-island-l').w, 170);
  assert.equal(retry.obstacles.find(o => o.id === 'main-island-r').h, 150);
  assert.equal(retry.obstacles.find(o => o.id === 'main-island-l').x - (retry.obstacles.find(o => o.id === 'main-rib-l').x + retry.obstacles.find(o => o.id === 'main-rib-l').w), 120);
});

test('heart encounter: local hits, room isolation, checkpoint rearm and first strong beat purification', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); restoreFlow(game); enterHeart(game); game.retryFromCheckpoint();
  assert.equal(state(game).encounter.budget, 3); assert.equal(state(game).encounters.main.closed, true);
  discover(game, node(game, 'heart-signal')); assert.equal(state(game).encounter.pending, 3); advance(game, 1.1); approachHunter(game);
  if (state(game).ammo < 4) { press(game, 'KeyR'); advance(game, 1.71); }
  const enemy = state(game).enemies.find(e => e.hp > 0), before = enemy.hp; game.pointerDown({ ...enemy.weakpoint, button: 0 }); game.update(.001); game.pointerUp();
  assert.equal(state(game).shot.hitType, 'hunter'); assert.equal(state(game).enemies.find(e => e.id === enemy.id).hp, before - 3, 'heart enemies use the shared tool ray');
  interact(game, portal(game, 'to-main')); const frozen = state(game), heartEnemies = s => s.hunters.filter(e => e.room === 'heart').map(e => ({ id: e.id, x: e.x, y: e.y, timer: e.timer, hp: e.hp }));
  assert.equal(frozen.enemies.length, 0); advance(game, 2); assert.deepEqual(heartEnemies(state(game)), heartEnemies(frozen)); assert.deepEqual(state(game).encounters.heart, frozen.encounters.heart);
  interact(game, portal(game, 'to-heart')); assert.equal(state(game).encounter.spawned, frozen.encounters.heart.spawned);
  game.retryFromCheckpoint(); assert.equal(state(game).encounter.pending, 0); assert.equal(state(game).encounter.spawned, 0); assert(!state(game).scanned['heart-signal']);
  discover(game, node(game, 'heart-signal')); assert.equal(state(game).encounter.pending, 3);
  for (const id of ['C1', 'C2', 'C3']) interact(game, node(game, id));
  const recovery = state(game); assert.equal(recovery.stage, 'recovery'); assert.equal(recovery.encounter.pending, 0); assert(recovery.encounter.closed); assert(recovery.enemies.some(e => e.hp > 0));
  const health = recovery.health; advance(game, 1.05); assert(state(game).enemies.every(e => e.purifyProgress > .9)); assert.equal(state(game).health, health);
  advance(game, .1); assert(state(game).firstStrongBeat); assert.equal(state(game).enemies.length, 0);
});
console.log(`\n${passed} heart-journey controller checks passed; ${failed} failed.`);
if (failed) process.exitCode = 1;
