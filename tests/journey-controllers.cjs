'use strict';
// V2 controller regression. Only public inputs mutate the game; snapshots guide an
// automated, fully informed route and are not evidence of novice understanding.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { distance, crosses, overlaps, nextWaypoint } = require('./journey-navigation.cjs');
const sandbox = vm.createContext({ window: {}, console });
for (const file of ['giant-art.js', 'heart-journey.js', 'journey-art.js']) {
  const full = path.join(__dirname, '..', 'src', file);
  if (fs.existsSync(full)) vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
}
let passed = 0, failed = 0;
function test(name, run) { if (require.main !== module) return; try { run(); passed++; console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); } }
const state = game => game.getDebugState();
const toolKeys = { precision: 'Digit1', sprayer: 'Digit2', probe: 'Digit3' };
function fresh() {
  const events = { success: 0, fail: 0, equipment: 0, progress: [], feedback: [], heartbeats: [], sounds: [], tasks: [] }; let game;
  game = sandbox.window.GiantCureGames.heartJourney({
    progress(value) { assert(Number.isFinite(value) && value >= 0 && value <= 1); events.progress.push(value); },
    success() { events.success++; }, fail() { events.fail++; }, offerEquipment() { events.equipment++; },
    feedback(text, kind) { events.feedback.push({ text, kind }); }, setTask(text) { events.tasks.push(text); }, effect() {},
    sound(name) { events.sounds.push(name); if (name === 'heartbeat') events.heartbeats.push({ elapsed: state(game).elapsed, ...state(game).beat }); }
  }); return { game, events };
}
function advance(game, seconds, dt = 1 / 60) { for (let t = 0; t < seconds - 1e-9; t += dt) game.update(Math.min(dt, seconds - t)); }
function press(game, code) { game.keyDown(code, false); game.keyUp(code); }
function scan(game, enabled = true) { if (state(game).scanner !== enabled) press(game, 'KeyQ'); }
function equip(game, id) { game.pointerUp(); press(game, toolKeys[id]); assert.equal(state(game).tool, id); }
function steer(game, target) {
  const s = state(game), waypoint = nextWaypoint(s, target);
  for (const [key, down] of [['KeyA', waypoint && waypoint.x - s.player.x < -3], ['KeyD', waypoint && waypoint.x - s.player.x > 3], ['KeyW', waypoint && waypoint.y - s.player.y < -3], ['KeyS', waypoint && waypoint.y - s.player.y > 3]]) { if (down) game.keyDown(key); else game.keyUp(key); }
  game.keyDown('ShiftLeft');
}
function moveTo(game, target, tolerance = 8) {
  assert(target, 'navigation target exists');
  for (let i = 0; i < 4000; i++) {
    const s = state(game); assert(!s.failed, 'equipment survives navigation');
    if (distance(s.player, target) < tolerance) { game.clearInput(); return; }
    steer(game, target); game.update(1 / 60);
  }
  assert.fail(`movement blocked ${state(game).room}/${state(game).stage}: ${JSON.stringify(state(game).player)} -> ${JSON.stringify(target)}`);
}
function node(game, id) { const n = state(game).nodes.find(n => n.id === id); assert(n, 'node exists: ' + id); return n; }
function portal(game, id) { const n = state(game).portals.find(n => n.id === id); assert(n, 'portal exists: ' + id); return n; }
function interact(game, target) { moveTo(game, target); press(game, 'KeyE'); }
function discover(game, target) { scan(game); moveTo(game, target); advance(game, 1.4); }
function diagnose(game, normal = true) {
  if (normal) { discover(game, node(game, 'flow')); assert(state(game).scanned.flow); assert(portal(game, 'to-main').locked); }
  discover(game, node(game, 'pressure')); assert(!portal(game, 'to-main').locked);
  interact(game, portal(game, 'to-main')); assert.equal(state(game).room, 'main');
  const clot = state(game).clot; discover(game, { x: clot.x, y: clot.y + 145 }); assert.equal(state(game).stage, 'bypass');
}
function approachHunter(game) {
  for (let i = 0; i < 16; i++) {
    const s = state(game), enemy = s.enemies.find(e => e.hp > 0); assert(enemy, 'living Hunter exists');
    if (distance(s.player, enemy) >= 70 && distance(s.player, enemy) < 180 && !s.obstacles.some(r => r.blocking !== false && crosses(s.player, enemy, r))) return;
    const candidates = Array.from({ length: 24 }, (_, n) => ({ x: enemy.x + Math.cos(n * Math.PI / 12) * 150, y: enemy.y + Math.sin(n * Math.PI / 12) * 150 }))
      .filter(p => p.x > s.bounds.left + 20 && p.x < s.bounds.right - 20 && p.y > s.bounds.top + 20 && p.y < s.bounds.bottom - 20 && !s.obstacles.some(r => r.blocking !== false && (overlaps(p, r, 22) || crosses(p, enemy, r))))
      .sort((a, b) => distance(a, s.player) - distance(b, s.player));
    assert(candidates.length, 'reachable firing angle'); moveTo(game, candidates[0]);
  }
  assert.fail('could not approach Hunter');
}
function clearInterference(game) {
  equip(game, 'precision'); scan(game); let dodge = null, dodgeUntil = 0;
  for (let frame = 0; frame < 60 * 150; frame++) {
    const s = state(game), alive = s.enemies.filter(e => e.hp > 0).sort((a, b) => distance(a, s.player) - distance(b, s.player)), enemy = alive[0];
    assert(!s.failed, 'defensive public input route survives');
    if (!enemy && !s.encounter.pending && !s.spawnTelegraphs.length) { game.clearInput(); return; }
    if (!enemy) { game.clearInput(); game.update(1 / 60); continue; }
    const covered = s.obstacles.some(r => r.blocking !== false && crosses(s.player, enemy, r));
    const danger = alive.find(e => ['telegraph', 'lunge'].includes(e.state) && distance(s.player, e) < 290);
    if (danger && s.elapsed >= dodgeUntil) {
      const d = distance(danger, s.player) || 1, dx = (s.player.x - danger.x) / d, dy = (s.player.y - danger.y) / d;
      const candidates = [1, -1].map(sign => ({ x: s.player.x - dy * 140 * sign, y: s.player.y + dx * 140 * sign }))
        .filter(p => p.x > s.bounds.left + 25 && p.x < s.bounds.right - 25 && p.y > s.bounds.top + 25 && p.y < s.bounds.bottom - 25 && !s.obstacles.some(r => r.blocking !== false && overlaps(p, r, 22)));
      dodge = candidates[0]; dodgeUntil = s.elapsed + .85;
    }
    if (dodge && s.elapsed < dodgeUntil) steer(game, dodge);
    else if (distance(s.player, enemy) < 95) {
      const d = distance(s.player, enemy) || 1;
      steer(game, { x: Math.max(s.bounds.left + 30, Math.min(s.bounds.right - 30, s.player.x + (s.player.x - enemy.x) / d * 100)), y: Math.max(s.bounds.top + 30, Math.min(s.bounds.bottom - 30, s.player.y + (s.player.y - enemy.y) / d * 100)) });
    } else if (distance(s.player, enemy) > 205 || covered) {
      game.pointerUp(); approachHunter(game); continue;
    } else for (const key of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) game.keyUp(key);
    game.pointerDown({ ...(enemy.state === 'recover' && enemy.weakpoint ? enemy.weakpoint : enemy), button: 0 }); game.update(1 / 60);
  }
  assert.fail('finite encounter clears without hidden state mutation');
}
function branch(game, id) { const b = state(game).branches.find(b => b.id === id); assert(b); return b; }
function treatBranch(game, id = 'left', seconds = 8) {
  equip(game, 'precision'); const b = branch(game, id); moveTo(game, { x: b.x, y: b.y + 90 }); scan(game, false);
  game.pointerDown({ ...b, button: 0 });
  for (let i = 0; i < seconds * 60 && !branch(game, id).complete; i++) game.update(1 / 60);
  game.pointerUp();
}
function supply(game, id) { const s = state(game).supplies.find(s => s.id === id); assert(s, 'supply exists: ' + id); return s; }
function assertDeliveryPath(game, id) {
  const s = state(game), route = supply(game, id).route; assert(route.length >= 2);
  for (let i = 1; i < route.length; i++) for (const wall of s.obstacles.filter(w => w.blocking !== false)) assert(!crosses(route[i - 1], route[i], wall), id + ' delivery centerline avoids ' + wall.id);
}
function collectSupply(game, id) {
  if (supply(game, id).state === 'collected') return;
  for (let i = 0; i < 600 && !['ready', 'collected'].includes(supply(game, id).state); i++) game.update(1 / 60);
  assert.equal(supply(game, id).state, 'ready'); assertDeliveryPath(game, id); interact(game, supply(game, id)); assert.equal(supply(game, id).state, 'collected');
}
// Kept as a route helper name for browser parity; V2 has no ABC connections.
function connectBypasses(game, id = 'left') {
  clearInterference(game); treatBranch(game, id); assert(branch(game, id).complete); assert.equal(state(game).checkpoint, 'bypass');
  assert.equal(state(game).pressure, 'safe'); assert.equal(state(game).stage, 'supply'); collectSupply(game, 'lysis'); assert(state(game).tools.find(t => t.id === 'sprayer').unlocked);
}
function fightTutorial(game) { clearInterference(game); assert.equal(state(game).stage, 'clot'); }
function weakpointPosition(game, id) {
  const s = state(game), weak = s.weakpoints.find(p => p.id === id), clot = s.obstacles.find(p => p.kind === 'clot'), range = weak.kind === 'fiber' ? 135 : 210;
  const positions = [-100, -50, 0, 50, 100].flatMap(offset => [{ x: weak.x + offset, y: clot.y - 50 }, { x: clot.x + clot.w + 55, y: weak.y + offset }, { x: weak.x + offset, y: clot.y + clot.h + 55 }, { x: clot.x - 55, y: weak.y + offset }]);
  return positions.filter(p => distance(p, weak) <= range && !s.obstacles.some(r => r.kind !== 'clot' && r.blocking !== false && (overlaps(p, r, 20) || crosses(p, weak, r)))).sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
}
function soften(game, id, seconds = 8, leaveAlive = false) {
  if (!leaveAlive) clearInterference(game);
  const weak = state(game).weakpoints.find(p => p.id === id); equip(game, weak.requiredTool); moveTo(game, weakpointPosition(game, id));
  scan(game, false); game.pointerDown({ ...weak, button: 0 });
  for (let i = 0; i < seconds * 60 && !state(game).weakpoints.find(p => p.id === id).complete; i++) { game.update(1 / 60); assert(!state(game).failed, 'therapy survives'); }
  game.pointerUp();
}
function restoreFlow(game) {
  for (const w of state(game).weakpoints) { soften(game, w.id); assert(state(game).weakpoints.find(p => p.id === w.id).complete); }
  interact(game, node(game, 'release')); assert.equal(state(game).stage, 'burst'); advance(game, 4.1);
  assert.equal(state(game).checkpoint, 'flow'); assert(state(game).flowRestored); assert(!state(game).enemies.some(e => e.hp > 0));
}
function enterHeart(game) { interact(game, portal(game, 'to-heart')); assert.equal(state(game).room, 'heart'); advance(game, 1.6); }
function connectHeart(game) {
  clearInterference(game); discover(game, state(game).fault); assert(state(game).fault.scanned); collectSupply(game, 'probe');
  equip(game, 'probe'); const f = state(game).fault; moveTo(game, { x: f.x, y: f.y + 90 }); scan(game, false);
  game.pointerDown({ ...f, button: 0 });
  for (let i = 0; i < 480 && !state(game).fault.complete; i++) game.update(1 / 60);
  game.pointerUp(); assert(state(game).fault.complete); assert.equal(state(game).stage, 'recovery');
  for (let i = 0; i < 900 && !state(game).dashUnlocked; i++) game.update(1 / 60);
  assert(state(game).dashUnlocked); assert(state(game).conductionSignal.verifiedBeats >= state(game).conductionSignal.requiredBeats); assert.equal(state(game).heartbeat, 'stable');
}
function toFlow(id = 'left') { const run = fresh(); diagnose(run.game); connectBypasses(run.game, id); fightTutorial(run.game); restoreFlow(run.game); return run; }
function toRevivedHeart(id = 'left') { const run = toFlow(id); enterHeart(run.game); connectHeart(run.game); return run; }
function combatRun() { const run = fresh(); diagnose(run.game); advance(run.game, 1.4); approachHunter(run.game); return run; }
function verifyDraw(game) {
  let depth = 0, calls = 0;
  const finite = values => values.forEach(value => { if (typeof value === 'number') assert(Number.isFinite(value)); });
  const ctx = new Proxy({}, { get(object, key) {
    if (key in object) return object[key];
    if (key === 'save') return () => { depth++; };
    if (key === 'restore') return () => { assert(depth > 0); depth--; };
    if (key === 'measureText') return text => ({ width: String(text).length * 9 });
    if (/^create.*Gradient$/.test(key)) return () => ({ addColorStop(offset) { assert(offset >= 0 && offset <= 1); } });
    return (...args) => { calls++; finite(args); if (key === 'arc') assert(args[2] >= 0); if (key === 'ellipse') assert(args[2] >= 0 && args[3] >= 0); };
  }, set(object, key, value) { object[key] = value; return true; } });
  const before = JSON.stringify(state(game));
  for (const hideLabels of [false, true]) game.draw(ctx, state(game).elapsed, { viewport: { x: 24, y: 84, w: 1232, h: 552 }, camera: { ...state(game).player, zoom: .8 }, hideLabels });
  assert.equal(depth, 0); assert(calls > 100); assert.equal(JSON.stringify(state(game)), before);
}
function firePreview(game, target) {
  assert.equal(state(game).reloadRemaining, 0, 'ray probe starts loaded');
  game.pointerDown({ ...target, button: 2 }); const before = state(game), preview = before.toolPreview; verifyDraw(game);
  game.pointerDown({ ...target, button: 0 }); game.update(.000001); game.pointerUp({ ...target, button: 0 }); game.pointerUp({ ...target, button: 2 });
  const after = state(game); assert.equal(after.ammo, before.ammo - 1); assert(after.shot);
  for (const key of ['kind', 'hitType', 'targetId', 'weakpoint', 'blocked', 'tool']) assert.equal(after.shot[key], preview[key], 'preview agrees: ' + key);
  assert(distance(after.shot.to, preview.to) < 1e-7); return { before, after, preview };
}
function segmentDistance(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / denominator)) : 0;
  return distance(point, { x: from.x + t * dx, y: from.y + t * dy });
}

test('entry: idle has no deadline, immutable V2 snapshots and dormant dash', () => {
  const { game, events } = fresh(); scan(game); advance(game, 125, .5); assert.equal(events.fail, 0); assert.equal(state(game).stage, 'diagnosis'); assert.equal(state(game).health, 100);
  const before = state(game).player; press(game, 'Space'); advance(game, .5); assert.equal(state(game).player.y, before.y);
  const s = state(game); for (const value of [s, s.player, s.tools, s.supplies, s.conductionSignal]) assert(Object.isFrozen(value)); assert.throws(() => { s.player.x = 0; }, TypeError);
  assert.equal(s.tool, 'precision'); press(game, 'Digit2'); assert.equal(state(game).tool, 'precision'); press(game, 'Numpad3'); assert.equal(state(game).tool, 'precision');
  discover(game, node(game, 'flow')); assert(portal(game, 'to-main').locked); assert(state(game).scanned.flow);
});
test('heartbeat: normal and low-frame clocks agree, without historical sound backlog', () => {
  for (const dt of [1 / 60, .25]) { const { game, events } = fresh(); advance(game, 9.51, dt); assert.equal(events.heartbeats.length, 5); events.heartbeats.forEach((b, i) => { assert.equal(b.period, 1.9); assert(Math.abs(b.elapsed - (i + 1) * 1.9) < .018); }); }
  const { game, events } = fresh(); game.update(20); assert.equal(events.heartbeats.length, 1); assert(Math.abs(state(game).beat.phase - (20 / 1.9) % 1) < 1e-6);
});
test('scanner: target progress is observable and diagnosis still permits route comparison', () => {
  const { game } = fresh(); moveTo(game, node(game, 'pressure')); scan(game); advance(game, .5);
  const target = state(game).scanTargets.find(t => t.id === 'pressure'); assert(target.inRange); assert(target.progress > 0 && target.progress < 1); assert(!target.complete);
  advance(game, .9); assert(state(game).scanTargets.find(t => t.id === 'pressure').complete); assert(!portal(game, 'to-main').locked);
});
test('valve: shared beat safely ejects an overlapping medic without injury', () => {
  const { game } = fresh(); discover(game, node(game, 'pressure')); const valve = state(game).obstacles.find(r => r.kind === 'valve');
  moveTo(game, { x: valve.x + valve.w / 2, y: valve.y + valve.h + 18 }); while (!state(game).beat.safe) game.update(1 / 60);
  game.keyDown('KeyW'); advance(game, .1); game.keyUp('KeyW'); assert(overlaps(state(game).player, valve)); while (state(game).beat.safe) game.update(1 / 60);
  assert(!overlaps(state(game).player, valve)); assert.equal(state(game).health, 100);
});
test('ray: precision preview uses direction and the first tissue surface', () => {
  const { game } = fresh(); const s = state(game), near = firePreview(game, { x: s.player.x + 15, y: s.player.y }); assert.equal(near.preview.hitType, 'none'); assert(Math.abs(distance(near.preview.from, near.preview.to) - s.toolRange) < 1e-7);
  advance(game, .21); const wall = state(game).obstacles.find(r => r.kind === 'tissue'); moveTo(game, { x: wall.x + wall.w / 2, y: wall.y + wall.h + 35 });
  const hit = firePreview(game, { x: state(game).player.x, y: wall.y }); assert(hit.preview.blocked); assert.equal(hit.preview.targetId, wall.id); assert(hit.preview.to.y >= wall.y + wall.h - .1);
});
test('ray: aim beyond a Hunter still hits its first body, with Q off', () => {
  for (const factor of [1.2, 8]) { const { game } = combatRun(); scan(game, false); const s = state(game), hunter = s.enemies.find(e => e.hp > 0); const hit = firePreview(game, { x: s.player.x + (hunter.x - s.player.x) * factor, y: s.player.y + (hunter.y - s.player.y) * factor }); assert.equal(hit.preview.targetId, hunter.id); assert(!hit.preview.weakpoint); assert.equal(state(game).enemies.find(e => e.id === hunter.id).hp, hunter.hp - 1); }
});
test('Hunter: scanning a body center does not expose a weakpoint outside recovery', () => {
  const { game } = combatRun(); scan(game); let s = state(game), hunter = s.enemies.find(e => e.hp > 0); assert.notEqual(hunter.state, 'recover');
  let hit = firePreview(game, hunter); assert(!hit.preview.weakpoint); assert.equal(state(game).enemies.find(e => e.id === hunter.id).hp, hunter.hp - 1);
  game.keyDown('KeyD'); let recovering;
  for (let i = 0; i < 600; i++) { game.update(1 / 60); s = state(game); hunter = s.enemies.find(e => e.hp > 0); if (hunter && hunter.state === 'recover' && hunter.weakpoint && distance(s.player, hunter) < 210 && !s.obstacles.some(r => r.blocking !== false && crosses(s.player, hunter.weakpoint, r))) { recovering = hunter; break; } }
  game.clearInput(); assert(recovering, 'a dodged lunge exposes a recovery weakpoint'); advance(game, .21); hunter = state(game).enemies.find(e => e.id === recovering.id); hit = firePreview(game, hunter.weakpoint); assert(hit.preview.weakpoint); assert.equal(state(game).enemies.find(e => e.id === hunter.id).hp, hunter.hp - 3);
});
test('tool: fixed cadence, manual reload and automatic hold-to-resume share one reload', () => {
  const count = precise => { const { game } = fresh(); if (precise) game.pointerDown({ x: 900, y: 830, button: 2 }); game.pointerDown({ x: 900, y: 830, button: 0 }); advance(game, 2.05, .016); return state(game).ammo; }; assert.equal(count(false), 13); assert.equal(count(true), 13);
  const { game, events } = fresh(); game.pointerDown({ x: 900, y: 830, button: 0 }); advance(game, 4.81, .016); assert(state(game).reloadRemaining > 0); advance(game, 1.72, .016); assert(state(game).ammo < 24 && state(game).ammo > 0); assert.equal(events.sounds.filter(n => n === 'reloadOut').length, 1); game.clearInput(); const ammo = state(game).ammo; advance(game, 1); assert.equal(state(game).ammo, ammo); assert.equal(state(game).precision, false); assert.equal(state(game).keys.length, 0);
  press(game, 'KeyR'); press(game, 'KeyR'); assert.equal(state(game).reloadStage, 'eject'); advance(game, 1.71); assert.equal(state(game).ammo, 24);
});
test('ray: clustered Hunters intercept the precision ray before a rear body', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); equip(game, 'precision'); scan(game, false); moveTo(game, { x: 800, y: 830 }); let found;
  for (let i = 0; i < 900 && !found; i++) {
    const s = state(game), alive = s.enemies.filter(e => e.hp > 0); assert(!s.failed);
    for (const far of alive) for (const near of alive.filter(e => e.id !== far.id)) {
      if (distance(s.player, far) >= 210 || distance(s.player, near) >= distance(s.player, far) - 25 || segmentDistance(near, s.player, far) > 18) continue;
      game.pointerMove(far); if (state(game).toolPreview.hitType === 'hunter' && state(game).toolPreview.targetId === near.id) { found = { near, far }; break; }
    }
    if (!found) game.update(1 / 60);
  }
  assert(found, 'public pursuit produces front/back Hunter geometry'); const result = firePreview(game, found.far); assert.equal(result.preview.targetId, found.near.id);
  assert.equal(state(game).enemies.find(e => e.id === found.near.id).hp, found.near.hp - 1); assert.equal(state(game).enemies.find(e => e.id === found.far.id).hp, found.far.hp);
});
test('sprayer: 60-degree preview and one dose can affect multiple unblocked Hunters once each', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); equip(game, 'sprayer'); moveTo(game, { x: 800, y: 830 }); let found;
  for (let i = 0; i < 900 && !found; i++) {
    const s = state(game); assert(!s.failed); const alive = s.enemies.filter(e => e.hp > 0);
    for (const a of alive) for (const b of alive) {
      const aim = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; game.pointerMove(aim);
      const preview = state(game).toolPreview, targets = preview.targets.filter(t => t.hitType === 'hunter');
      if (targets.length >= 2) { found = { aim, targets, hp: new Map(alive.map(e => [e.id, e.hp])) }; break; }
    }
    if (!found) game.update(1 / 60);
  }
  assert(found, 'actual pursuit presents a multi-target fan opportunity'); const result = firePreview(game, found.aim);
  assert(Math.abs(result.preview.angle - Math.PI / 3) < 1e-9); assert.equal(result.preview.fanPoints.length, 13);
  const unique = new Set(result.preview.targets.filter(t => t.hitType === 'hunter').map(t => t.targetId)); assert.equal(unique.size, found.targets.length);
  for (const id of unique) assert.equal(state(game).enemies.find(e => e.id === id).hp, found.hp.get(id) - 1, 'one fan never double-hits the same Hunter');
});
test('sprayer: every preview spoke stops at the same nearby tissue face as the actual dose', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); clearInterference(game); interact(game, portal(game, 'to-entry')); equip(game, 'sprayer');
  const wall = state(game).obstacles.find(r => r.kind === 'tissue'); moveTo(game, { x: wall.x + wall.w / 2, y: wall.y + wall.h + 35 });
  const result = firePreview(game, { x: state(game).player.x, y: wall.y }); assert.equal(result.preview.hitType, 'wall'); assert.equal(result.preview.fanPoints.length, 13);
  for (const point of result.preview.fanPoints) assert(Math.abs(point.y - (wall.y + wall.h)) < .001, 'fan outline is clipped, not a decorative through-wall cone');
  assert(result.after.shot.targets.every(t => t.hitType === 'wall')); assert(result.after.shot.targets.every(t => t.targetId === wall.id));
});
test('equipment: one optional chest, atomic selection, numeric keys and retry persistence', () => {
  for (const choice of ['gel', 'steady']) { const { game, events } = fresh(); assert.equal(game.chooseEquipment(choice), false, 'cannot claim remotely'); interact(game, state(game).chest); assert.equal(events.equipment, 1); assert.equal(game.chooseEquipment('invalid'), false); assert(game.chooseEquipment(choice)); assert.equal(state(game).equipment, choice); assert(state(game).chest.claimed); assert.equal(game.chooseEquipment(choice === 'gel' ? 'steady' : 'gel'), false); assert.equal(state(game).shield, choice === 'gel' ? 20 : 0); assert.equal(state(game).reloadDuration, choice === 'steady' ? 1.2 : 1.7); game.retryFromCheckpoint(); assert.equal(state(game).equipment, choice); assert(state(game).chest.claimed); interact(game, state(game).chest); assert.equal(events.equipment, 1); }
});
test('equipment: fast reload phases and callbacks occur once', () => {
  const { game, events } = fresh(); interact(game, state(game).chest); assert(game.chooseEquipment('steady')); game.pointerDown({ x: 900, y: 830, button: 0 }); advance(game, .01); game.pointerUp(); press(game, 'KeyR'); advance(game, 1.19); assert.equal(state(game).ammo, 23); advance(game, .02); assert.equal(state(game).ammo, 24); for (const n of ['reloadOut', 'reloadIn', 'reloadReady']) assert.equal(events.sounds.filter(s => s === n).length, 1);
});
test('equipment: selecting the fast loader during reload preserves progress and event uniqueness', () => {
  const { game, events } = fresh(); moveTo(game, state(game).chest); game.pointerDown({ x: 500, y: 500, button: 0 }); advance(game, .01); game.pointerUp();
  press(game, 'KeyR'); advance(game, .6); const before = state(game); assert.equal(before.reloadStage, 'insert');
  press(game, 'KeyE'); assert(game.chooseEquipment('steady')); const after = state(game);
  assert(after.reloadProgress >= before.reloadProgress - 1e-9); assert(after.reloadRemaining <= 1.2); assert(Math.abs(after.reloadRemaining / 1.2 - before.reloadRemaining / 1.7) < 1e-8);
  advance(game, 1.21); assert.equal(state(game).ammo, 24); assert.equal(state(game).reloadStage, 'idle');
  for (const name of ['reloadOut', 'reloadIn', 'reloadReady']) assert.equal(events.sounds.filter(n => n === name).length, 1, name + ' does not repeat when timing changes');
});
test('equipment: gel absorbs one hit per attempt and checkpoint retry restores one shield', () => {
  const { game } = fresh(); interact(game, state(game).chest); assert(game.chooseEquipment('gel')); diagnose(game); approachHunter(game);
  for (let i = 0; i < 3000 && state(game).shield > 0; i++) game.update(1 / 60);
  assert.equal(state(game).shield, 0); assert.equal(state(game).health, 100); advance(game, .4); assert.equal(state(game).shield, 0);
  game.retryFromCheckpoint(); assert.equal(state(game).equipment, 'gel'); assert.equal(state(game).shield, 20); assert(state(game).chest.claimed);
  interact(game, portal(game, 'to-main')); approachHunter(game);
  for (let i = 0; i < 3000 && state(game).shield > 0; i++) game.update(1 / 60);
  assert.equal(state(game).shield, 0); assert.equal(state(game).health, 100); advance(game, .4); assert.equal(state(game).shield, 0); assert.equal(state(game).health, 100);
});
test('branches: left and right are alternative treatments, without ABC or mandatory Q', () => {
  for (const id of ['left', 'right']) { const { game } = fresh(); diagnose(game, false); clearInterference(game); assert.equal(branch(game, 'left').duration, 4); assert.equal(branch(game, 'right').duration, 2.4); assert(!state(game).nodes.some(n => ['A1', 'B1'].includes(n.id))); interact(game, node(game, 'release')); assert(!state(game).flowRestored); treatBranch(game, id); const s = state(game); assert.equal(s.scanner, false); assert(branch(game, id).complete); assert(!branch(game, id === 'left' ? 'right' : 'left').complete); assert.equal(s.pressure, 'safe'); assert.equal(s.checkpoint, 'bypass'); assert.equal(s.connection.length, 0); assert(supply(game, 'lysis').state !== 'waiting'); assertDeliveryPath(game, 'lysis'); }
});
test('supply: actual transit, atomic pickup and tool ownership survive checkpoint retry', () => {
  const { game } = fresh(); diagnose(game); clearInterference(game); treatBranch(game, 'right'); const transit = supply(game, 'lysis'); assert.equal(transit.state, 'transit'); assert(transit.progress < 1); advance(game, .7); assert(supply(game, 'lysis').progress > transit.progress); collectSupply(game, 'lysis'); const spawned = state(game).encounters.main.spawned; const scheduled = spawned + state(game).encounters.main.pending; const before = state(game).supplies; game.retryFromCheckpoint(); assert.equal(supply(game, 'lysis').state, 'collected'); assert(state(game).tools.find(t => t.id === 'sprayer').unlocked); assert(branch(game, 'right').complete); assert.equal(state(game).encounters.main.spawned, spawned); assert.deepEqual(state(game).supplies.map(s => s.state), before.map(s => s.state)); press(game, 'Numpad2'); assert.equal(state(game).tool, 'sprayer'); interact(game, supply(game, 'lysis')); assert.equal(state(game).encounters.main.spawned + state(game).encounters.main.pending, scheduled); assert.equal(state(game).keys.length, 0);
});
test('therapy: correct tool and layer exposure matter, diagnosis is informative rather than a hit gate', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); const core = state(game).weakpoints.find(w => w.id === 'W3'); assert(!core.exposed); const fiber = state(game).weakpoints.find(w => w.id === 'W1'); moveTo(game, weakpointPosition(game, fiber.id)); scan(game, false); equip(game, 'precision'); game.pointerDown({ ...fiber, button: 0 }); advance(game, .3); game.pointerUp(); assert.equal(state(game).weakpoints.find(w => w.id === fiber.id).progress, 0); equip(game, 'sprayer'); game.pointerDown({ ...fiber, button: 0 }); advance(game, .6); game.pointerUp(); const p = state(game).weakpoints.find(w => w.id === fiber.id).progress; assert(p > 0 && p < 1); moveTo(game, { x: 500, y: 220 }); advance(game, .3); assert.equal(state(game).weakpoints.find(w => w.id === fiber.id).progress, p); game.retryFromCheckpoint(); assert.equal(state(game).weakpoints.find(w => w.id === fiber.id).progress, 0); assert.equal(state(game).scanner, false);
});
test('therapy: outer fibers retain completed results and expose the precision-only core', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); soften(game, 'W1'); assert(state(game).weakpoints.find(w => w.id === 'W1').complete); assert(!state(game).weakpoints.find(w => w.id === 'W3').exposed); soften(game, 'W2'); assert(state(game).weakpoints.find(w => w.id === 'W3').exposed); game.retryFromCheckpoint(); assert(state(game).weakpoints.filter(w => w.kind === 'fiber').every(w => w.complete)); assert(state(game).weakpoints.find(w => w.id === 'W3').exposed); clearInterference(game); moveTo(game, weakpointPosition(game, 'W3')); equip(game, 'sprayer'); game.pointerDown({ ...state(game).weakpoints.find(w => w.id === 'W3'), button: 0 }); advance(game, .4); game.pointerUp(); assert.equal(state(game).weakpoints.find(w => w.id === 'W3').progress, 0); soften(game, 'W3'); assert(state(game).weakpoints.every(w => w.complete));
});
test('strategy: a protected objective-first route can flush living interference instead of clearing every wave', () => {
  const { game } = fresh(); interact(game, state(game).chest); assert(game.chooseEquipment('gel')); diagnose(game); connectBypasses(game, 'left');
  for (const id of ['W1', 'W2', 'W3']) { soften(game, id, 10, true); assert(state(game).weakpoints.find(w => w.id === id).complete); }
  const before = state(game); assert(before.enemies.some(e => e.hp > 0)); assert(before.encounter.pending > 0); assert(before.health > 0); assert.equal(before.shield, 0);
  interact(game, node(game, 'release')); assert.equal(state(game).stage, 'burst'); assert(state(game).encounters.main.closed); assert.equal(state(game).encounters.main.pending, 0); advance(game, 4.1);
  assert(state(game).flowRestored); assert(!state(game).enemies.some(e => e.hp > 0)); assert.equal(state(game).encounters.main.spawned, before.encounters.main.spawned, 'objective completion cancels pending reinforcement');
});
test('dose: automatic reload cannot swallow the last 200 ms of paid treatment', () => {
  const { game } = fresh(); diagnose(game); clearInterference(game); equip(game, 'precision'); press(game, 'KeyR'); advance(game, 1.71); game.pointerDown({ x: state(game).player.x + 40, y: state(game).player.y, button: 0 }); advance(game, 4.41, .016); game.pointerUp(); assert.equal(state(game).ammo, 1); advance(game, .21); const b = branch(game, 'left'); moveTo(game, { x: b.x, y: b.y + 90 }); game.pointerDown({ ...b, button: 0 }); advance(game, .201, .001); game.pointerUp(); assert(Math.abs(branch(game, 'left').progress * b.duration - .2) < .002, 'last cartridge delivers its full lease'); assert(state(game).reloadRemaining > 0); const progress = branch(game, 'left').progress; advance(game, 1.71); assert.equal(branch(game, 'left').progress, progress); assert.equal(state(game).ammo, 24);
});
test('Hunter: warning, invulnerability, retreat and retry cannot duplicate kills or budgets', () => {
  const { game, events } = combatRun(); moveTo(game, portal(game, 'to-entry')); const before = state(game); press(game, 'KeyE'); const frozen = s => ({ hunters: s.hunters, encounter: s.encounters.main }); const entered = state(game); advance(game, 3); assert.deepEqual(frozen(state(game)), frozen(entered)); assert.equal(state(game).health, before.health); interact(game, portal(game, 'to-main')); approachHunter(game); let warned = false, prior = state(game).health;
  for (let i = 0; i < 6000 && !state(game).failed; i++) { if (state(game).enemies.some(e => e.state === 'telegraph')) warned = true; game.update(1 / 60); if (state(game).health < prior) { assert.equal(prior - state(game).health, 20); prior = state(game).health; if (prior > 0) { advance(game, .4); assert.equal(state(game).health, prior); } } }
  assert(warned); assert(state(game).failed); assert.equal(events.fail, 1); const failedState = state(game); advance(game, 5); assert.equal(state(game).elapsed, failedState.elapsed); game.retryFromCheckpoint(); assert.equal(state(game).health, 100); assert.equal(state(game).ammo, 24); assert.equal(state(game).encounters.main.spawned, failedState.encounters.main.spawned); assert.equal(state(game).encounters.main.pending, failedState.encounters.main.pending); assert.equal(state(game).elapsed, failedState.elapsed);
});
test('encounters: every observed birth respects cap, finite budget, telegraph and protected targets', () => {
  const { game } = fresh(), births = new Set(), update = game.update; let warnings = 0;
  game.update = dt => {
    const before = state(game); if (before.spawnTelegraphs.length) warnings++;
    update(dt); const s = state(game); assert(s.encounter.alive <= s.encounter.cap); assert(s.encounters.main.spawned <= 10);
    for (const e of s.enemies) if (!births.has(e.id)) {
      births.add(e.id); assert(distance(e, s.player) >= 276, 'birth stays outside the medical unit safety radius');
      assert(!s.obstacles.some(o => o.blocking !== false && overlaps(e, o, 22)), 'new Hunter never overlaps tissue');
      const protectedPoints = [...s.nodes, ...s.portals, ...s.branches, ...s.supplies.filter(p => p.room === s.room && p.state === 'ready'), ...(s.room === 'heart' ? [s.fault] : [])];
      assert(!protectedPoints.some(p => distance(e, p) < 88), 'new Hunter leaves interaction and treatment targets clear');
    }
  };
  diagnose(game); connectBypasses(game); fightTutorial(game); for (const id of ['W1', 'W2', 'W3']) soften(game, id);
  assert(warnings > 0); assert.equal(state(game).encounters.main.spawned, 10); assert(!state(game).encounters.main.triggered.signal);
});
test('flow: noncurrent rooms give executable portal tasks rather than an absent heart target', () => {
  const { game } = toFlow(); assert.equal(state(game).room, 'main'); assert.match(state(game).task, /心脏|心腔/); assert(state(game).guidance && state(game).guidance.target.id === 'to-heart'); enterHeart(game); clearInterference(game); discover(game, state(game).fault); interact(game, portal(game, 'to-main')); assert(state(game).guidance && state(game).guidance.target.id === 'to-heart'); interact(game, portal(game, 'to-entry')); assert(state(game).guidance && state(game).guidance.target.id === 'to-main');
});
test('heart: fixed encounter is independent of Q, sample E spam cannot connect or reset anything', () => {
  const { game } = toFlow(); enterHeart(game); const before = state(game).encounters.heart; assert(before.spawned + before.pending > 0); const total = before.spawned + before.pending; for (let i = 0; i < 10; i++) press(game, 'KeyQ'); assert.equal(state(game).encounters.heart.spawned + state(game).encounters.heart.pending, total); clearInterference(game); for (const id of ['C3', 'C1', 'C2', 'C2']) interact(game, node(game, id)); assert(!state(game).heartConnected); assert.equal(state(game).conduction.length, 0); assert.equal(state(game).fault.progress, 0); assert(!state(game).dashUnlocked);
});
test('heart: diagnostic pulses stop before the fault and real repaired arrivals gate revival', () => {
  const { game } = toFlow(); enterHeart(game); clearInterference(game); discover(game, state(game).fault); advance(game, 5.8); let s = state(game); assert.equal(s.conductionSignal.verifiedBeats, 0); assert(s.fault.input && !s.fault.output); assert(s.conductionSignal.samples.filter(p => p.id !== 'C3').every(p => p.input && p.output)); assert(s.conductionSignal.samples.find(p => p.id === 'C3').output === false); assert(!s.fault.output); collectSupply(game, 'probe'); equip(game, 'precision'); moveTo(game, { x: s.fault.x, y: s.fault.y + 90 }); game.pointerDown({ ...s.fault, button: 0 }); advance(game, .5); game.pointerUp(); assert.equal(state(game).fault.progress, 0); equip(game, 'probe'); game.pointerDown({ ...state(game).fault, button: 0 }); advance(game, 2.5); game.pointerUp(); s = state(game); assert(s.fault.complete); assert(s.fault.output); assert(s.conductionSignal.repaired); assert(!s.dashUnlocked); assert.equal(s.conductionSignal.verifiedBeats, 0); assert.equal(s.conductionSignal.samples.find(p => p.id === 'C3').output, false, 'repair alone cannot fabricate a downstream arrival'); for (let i = 0; i < 900 && !state(game).dashUnlocked; i++) { game.update(1 / 60); const current = state(game); if (current.conductionSignal.verifiedBeats === 0) assert.equal(current.conductionSignal.samples.find(p => p.id === 'C3').output, false); else assert(current.conductionSignal.samples.find(p => p.id === 'C3').output); if (current.conductionSignal.verifiedBeats < 3) assert(!current.dashUnlocked); } assert(state(game).dashUnlocked); assert(state(game).conductionSignal.verifiedBeats >= 3); assert(state(game).conductionSignal.samples.every(p => p.output));
});
test('chapter: both branch strategies can complete without the optional chest and settle once', () => {
  for (const id of ['left', 'right']) { const { game, events } = toRevivedHeart(id); assert.equal(state(game).equipment, null); const barrier = state(game).obstacles.find(r => r.kind === 'dashBarrier'); moveTo(game, { x: 1300, y: barrier.y + barrier.h + 25 }); game.keyDown('KeyW'); advance(game, .3); game.keyUp('KeyW'); assert(!state(game).crossedBarrier); game.keyDown('KeyW'); press(game, 'Space'); advance(game, .35); game.clearInput(); assert(state(game).crossedBarrier); assert(!overlaps(state(game).player, barrier)); const growth = state(game).growth; discover(game, growth); equip(game, 'precision'); press(game, 'KeyR'); advance(game, 1.71); game.pointerDown({ ...growth, button: 0 }); advance(game, 1.51, .016); game.pointerUp(); assert.equal(state(game).stage, 'ending'); advance(game, 2); assert(state(game).growth.regrowing); advance(game, 2); assert.equal(state(game).endingScene, 'exterior'); const s = state(game), remaining = s.endingDuration - s.ending; game.update(remaining); assert.equal(state(game).stage, 'complete'); assert.equal(events.success, 1); assert.equal(events.fail, 0); assert.equal(state(game).exteriorRecovery.elapsed, 8); advance(game, 30); assert.equal(events.success, 1); assert.equal(game.retryFromCheckpoint(), false); console.log('INFO V2 ' + id + ' public-input completion: ' + state(game).elapsed.toFixed(1) + ' seconds; not human play time'); }
});
test('dash: clearInput and natural expiry never embed the medic; completed repair survives retry', () => {
  const { game } = toRevivedHeart(); const barrier = state(game).obstacles.find(r => r.kind === 'dashBarrier'); moveTo(game, { x: 1300, y: barrier.y + barrier.h + 25 }); game.keyDown('KeyW'); press(game, 'Space'); advance(game, .06); assert(overlaps(state(game).player, barrier)); game.clearInput(); assert(!overlaps(state(game).player, barrier)); advance(game, 2.5); for (const offset of [18, 80, 145, 190]) { if (state(game).player.y < barrier.y) { game.keyDown('KeyS'); press(game, 'Space'); advance(game, .35); game.clearInput(); advance(game, 2.6); } moveTo(game, { x: 1300, y: barrier.y + barrier.h + offset }); game.keyDown('KeyW'); press(game, 'Space'); advance(game, .35); game.clearInput(); assert(!overlaps(state(game).player, barrier)); advance(game, 2.6); } const before = state(game); assert(game.retryFromCheckpoint()); assert.equal(state(game).elapsed, before.elapsed); assert(state(game).fault.complete); assert.equal(supply(game, 'probe').state, 'collected'); assert(state(game).tools.find(t => t.id === 'probe').unlocked); assert.equal(state(game).conductionSignal.verifiedBeats, 0); const downstream = state(game).conductionSignal.samples.find(p => p.id === 'C3'); assert(!downstream.input && !downstream.output, 'checkpoint retry rechecks actual downstream arrival');
});
test('renderer: finite geometry in all rooms and new V2 states never mutates simulation', () => {
  const { game } = fresh(); verifyDraw(game); diagnose(game); verifyDraw(game); connectBypasses(game); verifyDraw(game); fightTutorial(game); restoreFlow(game); verifyDraw(game); enterHeart(game); verifyDraw(game); connectHeart(game); verifyDraw(game);
});
module.exports = { sandbox, state, fresh, advance, press, scan, equip, moveTo, node, portal, interact, discover, diagnose, clearInterference, branch, treatBranch, supply, collectSupply, connectBypasses, fightTutorial, weakpointPosition, soften, restoreFlow, enterHeart, connectHeart, toFlow, toRevivedHeart };
if (require.main === module) {
  console.log(`\n${passed} heart-journey V2 controller checks passed; ${failed} failed.`);
  if (failed) process.exitCode = 1;
}
