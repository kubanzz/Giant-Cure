'use strict';
// V4 controller regression. Only public inputs mutate the game; snapshots guide an
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
function test(name, run) { if (require.main !== module || process.env.JOURNEY_TEST_FILTER && !new RegExp(process.env.JOURNEY_TEST_FILTER).test(name)) return; try { run(); passed++; console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); } }
const state = game => game.getDebugState();
const toolKeys = { precision: 'Digit1', sprayer: 'Digit2', probe: 'Digit3' };
function fresh() {
  const events = { success: 0, fail: 0, reasons: [], progress: [], feedback: [], heartbeats: [], sounds: [], tasks: [] }; let game;
  game = sandbox.window.GiantCureGames.heartJourney({
    progress(value) { assert(Number.isFinite(value) && value >= 0 && value <= 1); events.progress.push(value); },
    success() { events.success++; }, fail(reason) { events.fail++; events.reasons.push(reason); },
    feedback(text, kind) { events.feedback.push({ text, kind }); }, setTask(text) { events.tasks.push(text); }, effect() {},
    sound(name) { events.sounds.push(name); if (name === 'heartbeat') events.heartbeats.push({ elapsed: state(game).elapsed, ...state(game).beat }); }
  }); return { game, events };
}
function advance(game, seconds, dt = 1 / 60) { for (let t = 0; t < seconds - 1e-9; t += dt) game.update(Math.min(dt, seconds - t)); }
function acknowledgeDiagnosis(game) {
  if (state(game).pendingDiagnosis) {
    assert.equal(typeof game.acknowledgeDiagnosis, 'function');
    assert(game.acknowledgeDiagnosis(), 'the public diagnosis action resumes treatment');
    assert.equal(state(game).pendingDiagnosis, null);
  }
}
function press(game, code) { game.keyDown(code, false); game.keyUp(code); }
function scan(game, enabled = true) { if (state(game).scanner !== enabled) press(game, 'KeyQ'); }
function equip(game, id) { game.pointerUp(); press(game, toolKeys[id]); assert.equal(state(game).tool, id); }
function steer(game, target) {
  const s = state(game), waypoint = nextWaypoint(s, target);
  for (const [key, down] of [['KeyA', waypoint && waypoint.x - s.player.x < -3], ['KeyD', waypoint && waypoint.x - s.player.x > 3], ['KeyW', waypoint && waypoint.y - s.player.y < -3], ['KeyS', waypoint && waypoint.y - s.player.y > 3]]) { if (down) game.keyDown(key); else game.keyUp(key); }
  game.keyDown('ShiftLeft');
}
// Route assistance is ordinary public dodge input, never a state edit.
function defenseStep(game,dt=1/60){
  const s=state(game),danger=s.enemies.find(e=>e.hp>0&&['telegraph','lunge'].includes(e.state)&&e.target&&distance(e,s.player)<320&&segmentDistance(s.player,e,e.target)<65);
  if(danger&&s.dashCooldown===0){
    const d=distance(danger,s.player)||1,dx=(s.player.x-danger.x)/d,dy=(s.player.y-danger.y)/d;
    const dodge=[1,-1].map(sign=>({x:s.player.x-dy*145*sign,y:s.player.y+dx*145*sign})).find(p=>p.x>s.bounds.left+25&&p.x<s.bounds.right-25&&p.y>s.bounds.top+25&&p.y<s.bounds.bottom-25&&!s.obstacles.some(r=>r.blocking!==false&&crosses(s.player,p,r,16)));
    if(dodge){for(const key of ['KeyA','KeyD','KeyW','KeyS'])game.keyUp(key);const keys=[];if(dodge.x-s.player.x>5)keys.push('KeyD');if(dodge.x-s.player.x< -5)keys.push('KeyA');if(dodge.y-s.player.y>5)keys.push('KeyS');if(dodge.y-s.player.y< -5)keys.push('KeyW');keys.forEach(k=>game.keyDown(k));press(game,'Space');keys.forEach(k=>game.keyUp(k));}
  }
  game.update(dt);
}
function moveTo(game, target, tolerance = 8) {
  assert(target, 'navigation target exists');
  for (let i = 0; i < 4000; i++) {
    const s = state(game); assert(!s.failed, 'equipment survives navigation');
    if (distance(s.player, target) < tolerance) { game.clearInput(); return; }
    steer(game, target); defenseStep(game);
  }
  assert.fail(`movement blocked ${state(game).room}/${state(game).stage}: ${JSON.stringify(state(game).player)} -> ${JSON.stringify(target)}`);
}
function node(game, id) { const n = state(game).nodes.find(n => n.id === id); assert(n, 'node exists: ' + id); return n; }
function portal(game, id) { const n = state(game).portals.find(n => n.id === id); assert(n, 'portal exists: ' + id); return n; }
function interact(game, target) { moveTo(game, target); press(game, 'KeyE'); }
function discover(game, target) {
  acknowledgeDiagnosis(game); scan(game, false); moveTo(game, target);
  const s = state(game), focus = !target.id && s.room === 'main' && distance(target, s.clot) < 240 ? s.clot : target;
  game.pointerMove(focus); scan(game); advance(game, 1.4); acknowledgeDiagnosis(game);
}
function diagnose(game, normal = true) {
  if (normal) { discover(game, node(game, 'flow')); assert(state(game).scanned.flow); assert(portal(game, 'to-main').locked); }
  discover(game, node(game, 'pressure')); assert(portal(game, 'to-main').locked, 'diagnosis alone does not open the route');
  const lesion = state(game).entryLesion; equip(game, 'precision'); moveTo(game, {x:lesion.x,y:lesion.y+90}); scan(game,false); game.pointerDown({...lesion,button:0}); advance(game,1.7); game.pointerUp(); assert(state(game).entryLesion.complete); assert(!portal(game,'to-main').locked);
  interact(game, portal(game, 'to-main')); assert.equal(state(game).room, 'main');
  const clot = state(game).clot; discover(game, { x: clot.x, y: clot.y + 145 }); assert.equal(state(game).stage, 'bypass');
}
function approachHunter(game) {
  for (let i = 0; i < 16; i++) {
    const s = state(game), enemy = s.enemies.find(e => e.hp > 0); assert(enemy, 'living Hunter exists');
    if (distance(s.player, enemy) >= 70 && distance(s.player, enemy) < 180 && aimAtEnemy(game, enemy)) return;
    const candidates = firingAngles(s, enemy, 150);
    assert(candidates.length, 'reachable firing angle'); moveTo(game, candidates[0]);
  }
  assert.fail('could not approach Hunter');
}
function aimAtEnemy(game, enemy) {
  // Public aim/preview must agree before a combat shot: a wounded vessel can
  // intercept the same ray even when no solid wall lies between two centers.
  const targets = enemy.state === 'recover' && enemy.weakpoint ? [enemy.weakpoint, enemy] : [enemy];
  for (const target of targets) {
    game.pointerMove(target); const ray = state(game).toolPreview;
    if (ray.hitType === 'hunter' && ray.targetId === enemy.id) return target;
  }
  return null;
}
function tissueBeforeEnemy(from, enemy, tissue) {
  if (tissue.integrity >= tissue.maxIntegrity && !tissue.attached) return false;
  const { rx = 30, ry = 30 } = tissue.hitArea || {}, dx = (enemy.x - from.x) / rx, dy = (enemy.y - from.y) / ry;
  const ox = (from.x - tissue.x) / rx, oy = (from.y - tissue.y) / ry, a = dx * dx + dy * dy, b = ox * dx + oy * dy, c = ox * ox + oy * oy - 1;
  if (c <= 0) return true;
  const discriminant = b * b - a * c;
  if (a < 1e-10 || discriminant < 0) return false;
  const entry = (-b - Math.sqrt(discriminant)) / a;
  return entry >= 0 && entry * distance(from, enemy) < distance(from, enemy) - 22;
}
function firingAngles(s, enemy, radius = 175) {
  return Array.from({ length: 24 }, (_, n) => ({ x: enemy.x + Math.cos(n * Math.PI / 12) * radius, y: enemy.y + Math.sin(n * Math.PI / 12) * radius }))
    .filter(p => p.x > s.bounds.left + 20 && p.x < s.bounds.right - 20 && p.y > s.bounds.top + 20 && p.y < s.bounds.bottom - 20
      && !s.obstacles.some(r => r.blocking !== false && (overlaps(p, r, 22) || crosses(p, enemy, r)))
      && !s.tissues.some(t => tissueBeforeEnemy(p, enemy, t)))
    .sort((a, b) => distance(a, s.player) - distance(b, s.player));
}
function clearInterference(game) {
  if(!state(game).defense.active)return;
  equip(game,'precision');scan(game,false);
  const s0=state(game), center=s0.room==='main'?node(game,'release'):{x:(s0.bounds.left+s0.bounds.right)/2,y:s0.bounds.bottom-250};moveTo(game,center);
  for(let frame=0;frame<60*14;frame++){
    const s=state(game);assert(!s.failed,'defensive public input survives');
    const alive=s.enemies.filter(e=>e.hp>0);
    if(!alive.length&&!s.spawnTelegraphs.length){game.clearInput();return;}
    const reachable=alive.filter(e=>distance(s.player,e)<220&&!s.obstacles.some(r=>r.blocking!==false&&crosses(s.player,e,r))).sort((a,b)=>(a.type==='weaver'?-100:0)+distance(a,s.player)-(b.type==='weaver'?-100:0)-distance(b,s.player));
    game.pointerUp(); let firing = false;
    for (const enemy of reachable) { const target = aimAtEnemy(game, enemy); if (target) { game.pointerDown({...target,button:0}); firing = true; break; } }
    if(!firing){const enemy=alive.sort((a,b)=>distance(a,s.player)-distance(b,s.player))[0];if(enemy){const target=firingAngles(s,enemy)[0];if(target)steer(game,target);}}
    defenseStep(game);
    if(firing)for(const key of ['KeyA','KeyD','KeyW','KeyS'])game.keyUp(key);
  }
  game.clearInput();
}
function branch(game, id) { const b = state(game).branches.find(b => b.id === id); assert(b); return b; }
function treatBranch(game, id = 'left', seconds = 8) {
  equip(game, 'precision'); const b = branch(game, id); moveTo(game, { x: b.x, y: b.y + 90 }); scan(game, false);
  game.pointerDown({ ...b, button: 0 });
  for (let i = 0; i < seconds * 60 && !branch(game, id).complete; i++) defenseStep(game);
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
  assert.equal(supply(game,id).state,'ready');assertDeliveryPath(game,id);const priorTool=state(game).tool;interact(game,supply(game,id));assert.equal(supply(game,id).state,'collected');assert.equal(state(game).tool,priorTool,'pickup never selects a tool for the player');
}
// Kept as a route helper name for browser parity; V2 has no ABC connections.
function connectBypasses(game, id = 'left') {
  treatBranch(game, id); assert(branch(game, id).complete); assert.equal(state(game).checkpoint, 'bypass');
  assert.equal(state(game).pressure, 'safe'); assert.equal(state(game).stage, 'supply'); collectSupply(game, 'lysis'); assert(state(game).tools.find(t => t.id === 'sprayer').unlocked);
}
function fightTutorial(game) { assert.equal(state(game).stage, 'clot'); }
function weakpointPosition(game, id) {
  const s = state(game), weak = s.weakpoints.find(p => p.id === id), clot = s.obstacles.find(p => p.kind === 'clot'), range = weak.kind === 'fiber' ? 135 : 210;
  const positions = [-100, -50, 0, 50, 100].flatMap(offset => [{ x: weak.x + offset, y: clot.y - 50 }, { x: clot.x + clot.w + 55, y: weak.y + offset }, { x: weak.x + offset, y: clot.y + clot.h + 55 }, { x: clot.x - 55, y: weak.y + offset }]);
  return positions.filter(p => distance(p, weak) <= range && !s.obstacles.some(r => r.kind !== 'clot' && r.blocking !== false && (overlaps(p, r, 20) || crosses(p, weak, r)))).sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
}
function soften(game,id,seconds=20,leaveAlive=false){
  if(state(game).weakpoints.find(p=>p.id===id).complete)return;
  clearInterference(game);repairTissues(game,70);
  const weak = state(game).weakpoints.find(p => p.id === id); equip(game, weak.requiredTool); scan(game, false);
  moveTo(game, weakpointPosition(game,id));
  for(let i=0;i<seconds*60&&!state(game).weakpoints.find(p=>p.id===id).complete;i++){
    const s=state(game);assert(!s.failed,'therapy survives');
    if(distance(s.player,weak)>s.toolRange-5||s.obstacles.some(r=>r.kind!=='clot'&&r.blocking!==false&&crosses(s.player,weak,r))){game.pointerUp();moveTo(game,weakpointPosition(game,id));}
    game.pointerDown({...weak,button:0});defenseStep(game);
  }
  game.pointerUp();assert(state(game).weakpoints.find(p=>p.id===id).complete,'local therapy completes '+id);
}
function repairTissues(game, minimum = 90) {
  if (!state(game).tissues.length || state(game).organStability >= minimum) return;
  let targetId;
  for(let frame=0;frame<60*25 && state(game).organStability<minimum;frame++){
    const s=state(game);assert(!s.failed,'repair route survives: '+JSON.stringify({health:s.health,stability:s.organStability,room:s.room,player:s.player,stage:s.stage,enemies:s.enemies.filter(e=>e.hp>0).map(e=>({id:e.id,hp:e.hp,state:e.state,targetKind:e.targetKind}))}));
    let t=s.tissues.find(t=>t.id===targetId);
    if(!t||t.integrity>=t.maxIntegrity){t=s.tissues.slice().sort((a,b)=>a.integrity-b.integrity)[0];targetId=t.id;}
    if(s.tool!=='precision')equip(game,'precision');
    if(distance(s.player,t)>195||s.obstacles.some(r=>r.blocking!==false&&crosses(s.player,t,r))){game.pointerUp();moveTo(game,{x:t.x,y:t.y+150});}
    game.pointerMove(t);const aimed=state(game),blocker=aimed.toolPreview.hitType==='hunter'?aimed.enemies.find(e=>e.id===aimed.toolPreview.targetId):null;
    const threat=blocker||aimed.enemies.filter(e=>e.hp>0&&distance(e,aimed.player)<175&&!aimed.obstacles.some(w=>w.blocking!==false&&crosses(aimed.player,e,w))).sort((a,b)=>a.hp-b.hp)[0];
    const target=threat&&(aimAtEnemy(game,threat)||null)||t;
    game.pointerDown({...target,button:0});defenseStep(game);
  }
  game.pointerUp();assert(state(game).organStability>=minimum,'shared stability can be repaired');
}
function restoreFlow(game) {
  const order=state(game).weakpoints.slice().sort((a,b)=>a.kind==='core'?1:b.kind==='core'?-1:distance(a,state(game).player)-distance(b,state(game).player));
  for (const w of order) { soften(game, w.id); assert(state(game).weakpoints.find(p => p.id === w.id).complete); }
  repairTissues(game, 70); interact(game, node(game, 'release')); assert.equal(state(game).stage, 'burst'); advance(game, 4.1);
  assert.equal(state(game).checkpoint, 'flow'); assert(state(game).flowRestored); assert(!state(game).enemies.some(e => e.hp > 0));
}
function enterHeart(game) { interact(game, portal(game, 'to-heart')); assert.equal(state(game).room, 'heart'); advance(game, 1.6); }
function treatHeartSector(game, id) {
  const find = () => state(game).heartSectors.find(s => s.id === id);
  assert(find(), 'heart sector exists: ' + id);
  for (const part of ['source', 'relay']) {
    const complete = () => part === 'source' ? find().cleared : find().relay.complete;
    if (complete()) continue;
    if(!state(game).heartSectors.some(s=>s.complete))repairTissues(game, 70);
    const target = part === 'source' ? find() : find().relay, tool = target.requiredTool;
    equip(game, tool); scan(game, false); moveTo(game, { x: target.x, y: target.y + 105 });
    for (let i = 0; i < 60 * 30 && !complete(); i++) {
      const s = state(game); assert(!s.failed, 'heart treatment survives');
      if (s.organStability < 45) { game.pointerUp(); repairTissues(game, 70); equip(game, tool); moveTo(game, { x: target.x, y: target.y + 105 }); }
      const threat=state(game).enemies.filter(e=>e.hp>0&&e.targetKind==='player'&&['telegraph','lunge','recover'].includes(e.state)&&distance(e,state(game).player)<130).sort((a,b)=>a.hp-b.hp)[0];
      if(threat){if(state(game).tool!=='precision')equip(game,'precision');const aim=aimAtEnemy(game,threat);if(aim){game.pointerDown({...aim,button:0});defenseStep(game);continue;}}
      if(distance(state(game).player,target)>(tool==='sprayer'?135:210)||state(game).obstacles.some(w=>w.blocking!==false&&crosses(state(game).player,target,w))){game.pointerUp();moveTo(game,{x:target.x,y:target.y+105});}
      game.pointerMove(target); const ray = state(game).toolPreview;
      if (ray.hitType === 'hunter') { if(state(game).tool!=='precision')equip(game, 'precision'); const enemy=state(game).enemies.find(e=>e.id===ray.targetId);game.pointerDown({ ...(enemy&&aimAtEnemy(game,enemy)||target), button: 0 }); }
      else { if (state(game).tool !== tool) equip(game, tool); game.pointerDown({ ...target, button: 0 }); }
      defenseStep(game);
    }
    game.pointerUp(); assert(complete(), id + ' ' + part + ' completes through real therapy');
  }
  assert(find().complete);
}
function synchronizeHeart(game) {
  assert.equal(state(game).stage, 'recovery');
  const core = state(game).syncCore; equip(game, 'probe'); moveTo(game, { x: core.x, y: core.y + 110 });
  for (let beat = 0; beat < 3; beat++) {
    const before = state(game).conductionSignal.verifiedBeats;
    for (let retry = 0; retry < 10 && state(game).conductionSignal.verifiedBeats === before; retry++) {
      game.pointerUp(); advance(game, Math.max(.21, state(game).reloadRemaining + .01));
      game.pointerDown({ ...core, button: 0 }); advance(game, .02); game.pointerUp();
      for (let i = 0; i < 180 && state(game).conductionSignal.verifiedBeats === before; i++) game.update(1 / 60);
    }
    assert.equal(state(game).conductionSignal.verifiedBeats, before + 1, 'one deliberate core press reaches downstream');
  }
  for (let i = 0; i < 600 && !state(game).heartStable; i++) game.update(1 / 60);
  assert(state(game).heartStable); assert.equal(state(game).heartbeat, 'stable');
}
function connectHeart(game, order = ['heart-west', 'heart-east']) {
  repairTissues(game, 85); discover(game, state(game).heartSectors.find(s => s.id === order[0])); collectSupply(game, 'probe');
  for (const id of order) treatHeartSector(game, id);
  if(state(game).stage!=='recovery')repairTissues(game,85); game.update(1/60); assert.equal(state(game).stage, 'recovery');
  synchronizeHeart(game);
}
function toFlow(id = 'left') { const run = fresh(); diagnose(run.game); connectBypasses(run.game, id); fightTutorial(run.game); restoreFlow(run.game); return run; }
function toRevivedHeart(id = 'left') { const run = toFlow(id); enterHeart(run.game); connectHeart(run.game); return run; }
function combatRun() { const run = fresh(); diagnose(run.game); const b=branch(run.game,'right');moveTo(run.game,{x:b.x,y:b.y+90});run.game.pointerDown({...b,button:0});advance(run.game,.1);run.game.pointerUp();advance(run.game,4.3);approachHunter(run.game);return run; }
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

test('entry: idle has no deadline, immutable V4 snapshots and basic dash', () => {
  const { game, events } = fresh(); scan(game); advance(game, 125, .5); assert.equal(events.fail, 0); assert.equal(state(game).stage, 'diagnosis'); assert.equal(state(game).health, 100);
  const before = state(game).player; press(game, 'Space'); advance(game, .5); assert(state(game).player.y < before.y); assert(state(game).progress < .2); assert(!state(game).heartStable);
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
  const target = state(game).scanTargets.find(t => t.id === 'pressure' || t.id === 'entry-lesion'); assert(target.inRange); assert(target.progress > 0 && target.progress < 1); assert(!target.complete);
  advance(game, .9); acknowledgeDiagnosis(game); assert(state(game).scanTargets.some(t => (t.id === 'pressure' || t.id === 'entry-lesion') && t.complete)); assert(portal(game, 'to-main').locked, 'scan alone cannot open treatment route');
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
test('main: both former inner islands allow direct movement and unobstructed shots', () => {
  const { game } = fresh(); diagnose(game); scan(game, false); equip(game, 'precision');
  for (const x of state(game).tissues.map(t=>t.x)) {
    const tissueY=state(game).tissues[0].y, formerIsland = { x: x - 85, y: tissueY+40, w: 170, h: 150 }, centre = { x, y: tissueY+115 };
    moveTo(game, { x, y: tissueY+230 });
    const shot = firePreview(game, { x, y: tissueY+10 });
    assert(crosses(shot.preview.from, shot.preview.to, formerIsland), 'the shot crosses the former island footprint');
    assert.equal(shot.preview.hitType, 'none'); assert(!shot.preview.blocked);
    assert(Math.abs(distance(shot.preview.from, shot.preview.to) - shot.before.toolRange) < 1e-7, 'the actual shot retains its full range');
    game.keyDown('KeyW'); game.keyDown('ShiftLeft');
    for (let frame = 0; frame < 180 && state(game).player.y > centre.y; frame++) game.update(1 / 60);
    assert(distance(state(game).player, centre) < 10, 'ordinary forward input reaches the former island centre');
    for (let frame = 0; frame < 180 && state(game).player.y > tissueY+15; frame++) game.update(1 / 60);
    game.clearInput();
    assert(state(game).player.y < tissueY+25 && Math.abs(state(game).player.x - x) < 10, 'the medic walks straight through the entire former island');
  }
});
test('ray: aim beyond a Hunter still hits its first body, with Q off', () => {
  for (const factor of [1.2, 8]) { const { game } = combatRun(); scan(game, false); const s = state(game), hunter = s.enemies.find(e => e.hp > 0); const hit = firePreview(game, { x: s.player.x + (hunter.x - s.player.x) * factor, y: s.player.y + (hunter.y - s.player.y) * factor }); assert.equal(hit.preview.targetId, hunter.id); assert(!hit.preview.weakpoint); assert.equal(state(game).enemies.find(e => e.id === hunter.id).hp, hunter.hp - 1); }
});
test('Hunter: scanning a body center does not expose a weakpoint outside recovery', () => {
  const { game } = combatRun(); scan(game); let s = state(game), hunter = s.enemies.find(e => e.hp > 0);for(let i=0;i<120&&hunter.state==='recover';i++){game.update(1/60);s=state(game);hunter=s.enemies.find(e=>e.hp>0);}assert.notEqual(hunter.state,'recover');
  let hit = firePreview(game, hunter); assert(!hit.preview.weakpoint); assert.equal(state(game).enemies.find(e => e.id === hunter.id).hp, hunter.hp - 1);
  game.keyDown('KeyD'); let recovering;
  for (let i = 0; i < 600; i++) { game.update(1 / 60); s = state(game); hunter = s.enemies.find(e => e.hp > 0); if (hunter && hunter.state === 'recover' && hunter.weakpoint && distance(s.player, hunter) < 210 && !s.obstacles.some(r => r.blocking !== false && crosses(s.player, hunter.weakpoint, r))) { recovering = hunter; break; } }
  game.clearInput(); assert(recovering, 'a dodged lunge exposes a recovery weakpoint'); advance(game, .21); hunter = state(game).enemies.find(e => e.id === recovering.id); hit = firePreview(game, hunter.weakpoint); assert(hit.preview.weakpoint); assert.equal(state(game).enemies.find(e => e.id === hunter.id).hp, hunter.hp - 3);
});
test('tool: fixed cadence, manual reload and automatic hold-to-resume share one reload', () => {
  const count = precise => { const { game } = fresh(); if (precise) game.pointerDown({ x: 900, y: 830, button: 2 }); game.pointerDown({ x: 900, y: 830, button: 0 }); advance(game, 2.05, .016); return state(game).ammo; }; assert.equal(count(false), 13); assert.equal(count(true), 13);
  const { game, events } = fresh(); game.pointerDown({ x: 900, y: 830, button: 0 }); advance(game, 4.81, .016); assert(state(game).reloadRemaining > 0); advance(game, .87, .016); assert(state(game).ammo < 24 && state(game).ammo > 0); assert.equal(events.sounds.filter(n => n === 'reloadOut').length, 1); game.clearInput(); const ammo = state(game).ammo; advance(game, 1); assert.equal(state(game).ammo, ammo); assert.equal(state(game).precision, false); assert.equal(state(game).keys.length, 0);
  press(game, 'KeyR'); press(game, 'KeyR'); assert.equal(state(game).reloadStage, 'eject'); advance(game, .86); assert.equal(state(game).ammo, 24);
});
test('ray: clustered Hunters intercept the precision ray before a rear body', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game,'right'); equip(game, 'precision'); scan(game, false);const tissue=state(game).tissues[1]; moveTo(game,{x:tissue.x,y:tissue.y+145}); let found;
  for (let i = 0; i < 900 && !found; i++) {
    const s = state(game), alive = s.enemies.filter(e => e.hp > 0); assert(!s.failed);
    for (const far of alive) for (const near of alive.filter(e => e.id !== far.id)) {
      if (distance(s.player, far) >= 210 || distance(s.player, near) >= distance(s.player, far) - 25 || segmentDistance(near, s.player, far) > 18) continue;
      game.pointerMove(far); if (state(game).toolPreview.hitType === 'hunter' && state(game).toolPreview.targetId === near.id) { found = { near, far }; break; }
    }
    if (!found) {
      const pair=alive.flatMap(near=>alive.filter(far=>far.id!==near.id&&distance(near,far)<130).map(far=>({near,far}))).find(({near,far})=>distance(near,far)>35);
      if(pair&&i%45===0){const d=distance(pair.near,pair.far),p={x:pair.near.x+(pair.near.x-pair.far.x)/d*65,y:pair.near.y+(pair.near.y-pair.far.y)/d*65};if(p.x>s.bounds.left+25&&p.x<s.bounds.right-25&&p.y>s.bounds.top+25&&p.y<s.bounds.bottom-25&&!s.obstacles.some(w=>w.blocking!==false&&overlaps(p,w,22)))moveTo(game,p);}
      defenseStep(game);
    }
  }
  assert(found, 'public pursuit produces front/back Hunter geometry'); const result = firePreview(game, found.far); assert.equal(result.preview.targetId, found.near.id);
  assert.equal(state(game).enemies.find(e => e.id === found.near.id).hp, found.near.hp - 1); assert.equal(state(game).enemies.find(e => e.id === found.far.id).hp, found.far.hp);
});
test('sprayer: 60-degree preview applies each unblocked target once',()=>{
  const {game}=fresh();diagnose(game);connectBypasses(game,'right');equip(game,'sprayer');const t=state(game).tissues[1],center={x:t.x,y:t.y+115};moveTo(game,center);let found;
  for(let i=0;i<600&&!found;i++){
    const s=state(game);assert(!s.failed);const alive=s.enemies.filter(e=>e.hp>0);
    const targets=[...alive,...s.tissues.filter(t=>t.attached)];
    for(const a of targets)for(const b of targets){if(a.id===b.id)continue;const aim={x:(a.x+b.x)/2,y:(a.y+b.y)/2};game.pointerMove(aim);const preview=state(game).toolPreview,valid=preview.targets.filter(t=>['hunter','treatment'].includes(t.hitType));if(valid.length>=2){found={aim,targets:valid,hp:new Map(alive.map(e=>[e.id,e.hp]))};break;}}
    if(!found){const theta=i/60;steer(game,{x:center.x+Math.cos(theta)*100,y:center.y+Math.sin(theta)*80});defenseStep(game);}
  }
  assert(found,'native pursuit and tissue attack offer a multi-target fan');game.clearInput();advance(game,.21);const result=firePreview(game,found.aim);assert(Math.abs(result.preview.angle-Math.PI/3)<1e-9);assert.equal(result.preview.fanPoints.length,13);
  const unique=new Set(result.preview.targets.filter(t=>t.hitType==='hunter').map(t=>t.targetId));for(const id of unique)assert.equal(state(game).enemies.find(e=>e.id===id).hp,result.before.enemies.find(e=>e.id===id).hp-1,'one fan dose does not double-hit a body');
});
test('sprayer: every preview spoke stops at the same nearby tissue face as the actual dose', () => {
  const {game}=toFlow();interact(game,portal(game,'to-entry'));equip(game,'sprayer');
  const wall = state(game).obstacles.find(r => r.kind === 'tissue'); moveTo(game, { x: wall.x + wall.w / 2, y: wall.y + wall.h + 35 });
  const result = firePreview(game, { x: state(game).player.x, y: wall.y }); assert.equal(result.preview.hitType, 'wall'); assert.equal(result.preview.fanPoints.length, 13);
  for (const point of result.preview.fanPoints) assert(Math.abs(point.y - (wall.y + wall.h)) < .001, 'fan outline is clipped, not a decorative through-wall cone');
  assert(result.after.shot.targets.every(t => t.hitType === 'wall')); assert(result.after.shot.targets.every(t => t.targetId === wall.id));
});
test('V3 removal: no equipment or unknown biological target remains',()=>{const {game}=fresh(),s=state(game);for(const key of ['chest','equipment','shield','growth','crossedBarrier'])assert(!(key in s),key+' removed');assert.equal(game.chooseEquipment,undefined);assert.equal(s.reloadDuration,.85);});
test('branches: left and right are alternative treatments, without ABC or mandatory Q', () => {
  for (const id of ['left', 'right']) { const { game } = fresh(); diagnose(game, false); clearInterference(game); assert.equal(branch(game, 'left').duration, 4); assert.equal(branch(game, 'right').duration, 2.4); assert(!state(game).nodes.some(n => ['A1', 'B1'].includes(n.id))); interact(game, node(game, 'release')); assert(!state(game).flowRestored); treatBranch(game, id); const s = state(game); assert.equal(s.scanner, false); assert(branch(game, id).complete); assert(!branch(game, id === 'left' ? 'right' : 'left').complete); assert.equal(s.pressure, 'safe'); assert.equal(s.checkpoint, 'bypass'); assert.equal(s.connection.length, 0); assert(supply(game, 'lysis').state !== 'waiting'); assertDeliveryPath(game, 'lysis'); }
});
test('supply: actual transit, atomic pickup and tool ownership survive checkpoint retry', () => {
  const { game } = fresh(); diagnose(game); clearInterference(game); treatBranch(game, 'right'); const transit = supply(game, 'lysis'); assert.equal(transit.state, 'transit'); assert(transit.progress < 1); advance(game, .7); assert(supply(game, 'lysis').progress > transit.progress); collectSupply(game, 'lysis'); const spawned = state(game).encounters.main.spawned; const scheduled = spawned + state(game).encounters.main.pending; const before = state(game).supplies; game.retryFromCheckpoint(); assert.equal(supply(game, 'lysis').state, 'collected'); assert(state(game).tools.find(t => t.id === 'sprayer').unlocked); assert(branch(game, 'right').complete); assert.equal(state(game).enemies.length,0); assert.deepEqual(state(game).supplies.map(s => s.state), before.map(s => s.state)); press(game, 'Numpad2'); assert.equal(state(game).tool, 'sprayer'); interact(game, supply(game, 'lysis')); assert.equal(state(game).supplies.find(s=>s.id==='lysis').state,'collected'); assert.equal(state(game).keys.length, 0);
});
test('therapy: correct tool and layer exposure matter, diagnosis is informative rather than a hit gate', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); const core = state(game).weakpoints.find(w => w.id === 'W3'); assert(!core.exposed); const fiber = state(game).weakpoints.find(w => w.id === 'W1'); moveTo(game, weakpointPosition(game, fiber.id)); scan(game, false); equip(game, 'precision'); game.pointerDown({ ...fiber, button: 0 }); advance(game, .3); game.pointerUp(); assert.equal(state(game).weakpoints.find(w => w.id === fiber.id).progress, 0); equip(game, 'sprayer'); game.pointerDown({ ...fiber, button: 0 }); advance(game, .6); game.pointerUp(); const p = state(game).weakpoints.find(w => w.id === fiber.id).progress; assert(p > 0 && p < 1); moveTo(game, { x: fiber.x-200, y: fiber.y-70 }); advance(game, .3); assert.equal(state(game).weakpoints.find(w => w.id === fiber.id).progress, p); game.retryFromCheckpoint(); assert.equal(state(game).weakpoints.find(w => w.id === fiber.id).progress, 0); assert.equal(state(game).scanner, false);
});
test('therapy: outer fibers retain completed results and expose the precision-only core', () => {
  const { game } = fresh(); diagnose(game); connectBypasses(game); fightTutorial(game); soften(game, 'W1'); assert(state(game).weakpoints.find(w => w.id === 'W1').complete); assert(!state(game).weakpoints.find(w => w.id === 'W3').exposed); soften(game, 'W2'); assert(state(game).weakpoints.find(w => w.id === 'W3').exposed); game.retryFromCheckpoint(); assert(state(game).weakpoints.filter(w => w.kind === 'fiber').every(w => w.complete)); assert(state(game).weakpoints.find(w => w.id === 'W3').exposed); clearInterference(game); moveTo(game, weakpointPosition(game, 'W3')); equip(game, 'sprayer'); game.pointerDown({ ...state(game).weakpoints.find(w => w.id === 'W3'), button: 0 }); advance(game, .4); game.pointerUp(); assert.equal(state(game).weakpoints.find(w => w.id === 'W3').progress, 0); soften(game, 'W3'); assert(state(game).weakpoints.every(w => w.complete));
});
test('strategy: treatment can close a continuous defense with living enemies',()=>{const {game}=fresh();diagnose(game);connectBypasses(game,'left');for(const id of ['W1','W2','W3'])soften(game,id,20,true);repairTissues(game,70);const before=state(game);assert(before.defense.active);assert(before.enemies.some(e=>e.hp>0),'release does not require a cleared arena');interact(game,node(game,'release'));assert.equal(state(game).stage,'burst');assert(state(game).encounters.main.closed);advance(game,4.1);assert(state(game).flowRestored);assert.equal(state(game).organStability,100);assert(!state(game).enemies.some(e=>e.hp>0));});
test('dose: automatic reload cannot swallow the last 200 ms of paid treatment', () => {
  const { game } = fresh(); diagnose(game); clearInterference(game); equip(game, 'precision'); press(game, 'KeyR'); advance(game, .86); game.pointerDown({ x: state(game).player.x + 40, y: state(game).player.y, button: 0 }); advance(game, 4.41, .016); game.pointerUp(); assert.equal(state(game).ammo, 1); advance(game, .21); const b = branch(game, 'left'); moveTo(game, { x: b.x, y: b.y + 90 }); game.pointerDown({ ...b, button: 0 }); advance(game, .201, .001); game.pointerUp(); assert(Math.abs(branch(game, 'left').progress * b.duration - .2) < .002, 'last cartridge delivers its full lease'); assert(state(game).reloadRemaining > 0); const progress = branch(game, 'left').progress; advance(game, .86); assert.equal(branch(game, 'left').progress, progress); assert.equal(state(game).ammo, 24);
});
test('defense: entry is safe, first therapy starts warnings and locks retreat',()=>{const {game}=fresh();diagnose(game);advance(game,25);assert.equal(state(game).enemies.length,0);const b=branch(game,'right');moveTo(game,{x:b.x,y:b.y+90});game.pointerDown({...b,button:0});advance(game,.1);game.pointerUp();assert(state(game).defense.active);assert(portal(game,'to-entry').locked);assert(state(game).tissues.length===2);assert(state(game).tissues.every(t=>t.maxIntegrity===50));});
test('defense: real attacks damage shared stability and ignoring tissue can fail',()=>{const {game,events}=fresh();diagnose(game);connectBypasses(game,'right');let damaged=false,attached=false,warnings=false;for(let i=0;i<60*100&&!state(game).failed;i++){game.update(1/60);const s=state(game);damaged ||= s.organStability<100;attached ||= s.tissues.some(t=>t.attached);warnings ||= s.spawnTelegraphs.length>0;assert(s.encounter.alive<=s.encounter.cap);assert.equal(s.organStability,s.tissues.reduce((n,t)=>n+t.integrity,0));}assert(damaged,'attacks change tissue');assert(warnings,'reinforcement telegraphs occur');assert(state(game).failed);assert.equal(events.fail,1);const failed=state(game);game.update(3);assert.equal(state(game).elapsed,failed.elapsed);assert(game.retryFromCheckpoint());const r=state(game);assert.equal(r.organStability,100);assert.equal(r.health,100);assert.equal(r.enemies.length,0);assert.equal(r.spawnTelegraphs.length,0);assert(r.branches.some(b=>b.complete));assert(r.tools.find(t=>t.id==='sprayer').unlocked);advance(game,2.9);assert.equal(state(game).enemies.length,0,'three second preparation');});
test('tissue: precision restores damaged tissue and actual perfusion with coverage',()=>{
  const {game}=fresh();diagnose(game);connectBypasses(game,'right');
  for(let i=0;i<2400&&!state(game).tissues.some(t=>t.integrity<50)&&!state(game).failed;i++)game.update(1/60);
  let t=state(game).tissues.find(t=>t.integrity<50);assert(t);moveTo(game,{x:t.x,y:t.y+95});
  t=state(game).tissues.find(p=>p.id===t.id);
  equip(game,'precision');const prior=state(game).tissues.find(p=>p.id===t.id).integrity;game.pointerDown({...t,button:0});let repaired=false;
  for(let i=0;i<240&&!repaired;i++){defenseStep(game);repaired=state(game).tissues.find(p=>p.id===t.id).integrity>prior+1;}
  game.pointerUp();assert(repaired,'paid precision therapy repairs a real wound');assert(state(game).tissues.every(p=>Math.abs(p.localFlow-p.integrity/p.maxIntegrity)<1e-8));
});
test('flow: completed zone has executable onward and return tasks',()=>{const {game}=toFlow();assert.match(state(game).task,/心脏|心腔/);assert.equal(state(game).guidance.target.id,'to-heart');assert(!portal(game,'to-entry').locked);interact(game,portal(game,'to-entry'));assert.equal(state(game).guidance.target.id,'to-main');});
test('heart: pulses stop at fault; probe repair plus stability gates actual three beats',()=>{const {game}=toFlow();enterHeart(game);assert(state(game).defense.active);assert(!state(game).heartStable);assert(portal(game,'to-main').locked);assert(state(game).dashUnlocked);assert(!state(game).conductionSignal.samples.find(p=>p.id==='C3').output);connectHeart(game);const s=state(game);assert(s.heartSectors.every(p=>p.complete));assert(s.heartStable);assert(s.conductionSignal.verifiedBeats>=3);assert(s.conductionSignal.samples.every(p=>p.output));assert(!portal(game,'exit').locked);});
test('chapter: both branch strategies complete through exit and one eight-second exterior',()=>{for(const id of ['left','right']){const {game,events}=toRevivedHeart(id);assert(!('growth' in state(game)));interact(game,portal(game,'exit'));assert.equal(state(game).stage,'ending');assert.equal(state(game).endingScene,'exterior');assert.equal(state(game).endingDuration,8);const s=state(game);game.update(s.endingDuration-s.ending);assert.equal(state(game).stage,'complete');assert.equal(events.success,1);assert.equal(events.fail,0);assert.equal(state(game).exteriorRecovery.elapsed,8);advance(game,10);assert.equal(events.success,1);assert.equal(game.retryFromCheckpoint(),false);console.log('INFO V4 '+id+' public-input completion: '+state(game).elapsed.toFixed(1)+'s; not human play time');}});
test('tool selection: a new gun preserves reload and clears its new-tool indicator',()=>{
  const {game}=fresh();diagnose(game);connectBypasses(game);assert(state(game).tools.find(t=>t.id==='sprayer').isNew);
  press(game,'KeyR');advance(game,.5);const before=state(game);assert(before.reloadRemaining>0);assert(game.selectTool('sprayer'));const after=state(game);
  assert.equal(after.ammo,before.ammo);assert.equal(after.reloadRemaining,before.reloadRemaining);assert.equal(after.reloadStage,before.reloadStage);assert(!after.tools.find(t=>t.id==='sprayer').isNew);assert.equal(game.selectTool('probe'),false);
  advance(game,1.3);assert.equal(state(game).ammo,24);assert.equal(state(game).tool,'sprayer');
});
test('dash: a basic dash cannot cross the physical heart gate before revival',()=>{
  const {game}=toFlow();enterHeart(game);const barrier=state(game).obstacles.find(o=>o.kind==='dashBarrier');assert(barrier.blocking);moveTo(game,{x:1300,y:barrier.y+barrier.h+25});
  game.keyDown('KeyW');press(game,'Space');advance(game,.4);game.clearInput();const s=state(game);assert(s.player.y>=barrier.y+barrier.h+s.player.radius-1);assert(!overlaps(s.player,barrier));assert(!s.heartStable);assert(portal(game,'exit').locked);
});
test('checkpoint: completed fault persists but downstream verification must run again',()=>{const {game}=toRevivedHeart();assert(game.retryFromCheckpoint());const s=state(game);assert(s.heartSectors.every(p=>p.complete));assert(s.dashUnlocked);assert(!s.heartStable);assert.equal(s.dashCooldown,0);assert.equal(s.conductionSignal.verifiedBeats,0);assert(!s.conductionSignal.samples.find(p=>p.id==='C3').output);assert(s.tools.find(t=>t.id==='probe').unlocked);});
test('renderer: finite geometry in all rooms and new V3 states never mutates simulation', () => {
  const { game } = fresh(); verifyDraw(game); diagnose(game); verifyDraw(game); connectBypasses(game); verifyDraw(game); fightTutorial(game); restoreFlow(game); verifyDraw(game); enterHeart(game); verifyDraw(game); connectHeart(game); verifyDraw(game);
});
module.exports = { sandbox, state, fresh, acknowledgeDiagnosis, treatHeartSector, synchronizeHeart, advance, press, scan, equip, moveTo, node, portal, interact, discover, diagnose, clearInterference, repairTissues, branch, treatBranch, supply, collectSupply, connectBypasses, fightTutorial, weakpointPosition, soften, restoreFlow, enterHeart, connectHeart, toFlow, toRevivedHeart };
if (require.main === module) {
  console.log(`\n${passed} heart-journey V4 controller checks passed; ${failed} failed.`);
  if (failed) process.exitCode = 1;
}
