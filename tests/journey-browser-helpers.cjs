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
async function defenseTick(page,ms=32,directThreatsOnly=false){
  const s=await game(page),danger=s.enemies.find(e=>e.hp>0&&['telegraph','lunge'].includes(e.state)&&e.target&&distance(e,s.player)<320&&segmentDistance(s.player,e,e.target)<65&&(!directThreatsOnly||e.targetKind==='player'||e.state==='lunge'&&distance(e,s.player)<70));
  if(danger&&s.dashCooldown===0){
    const d=distance(danger,s.player)||1,dx=(s.player.x-danger.x)/d,dy=(s.player.y-danger.y)/d;
    const target=[1,-1].map(sign=>({x:s.player.x-dy*145*sign,y:s.player.y+dx*145*sign})).find(p=>p.x>s.bounds.left+25&&p.x<s.bounds.right-25&&p.y>s.bounds.top+25&&p.y<s.bounds.bottom-25&&!s.obstacles.some(r=>r.blocking!==false&&crosses(s.player,p,r,16)));
    if(target){
      const prior=s.keys.filter(k=>['KeyA','KeyD','KeyW','KeyS'].includes(k));for(const key of prior)await page.keyboard.up(key);
      const keys=[];if(target.x-s.player.x>5)keys.push('KeyD');if(target.x-s.player.x< -5)keys.push('KeyA');if(target.y-s.player.y>5)keys.push('KeyS');if(target.y-s.player.y< -5)keys.push('KeyW');
      for(const key of keys)await page.keyboard.down(key);await page.keyboard.press('Space');for(const key of keys)await page.keyboard.up(key);for(const key of prior)await page.keyboard.down(key);
    }
  }
  await tick(page,ms);
}
async function moveTo(page, target, tolerance = 10, directThreatsOnly = false) {
  const held = new Set();
  try {
    for (let i = 0; i < 450; i++) {
      const s = await game(page); assert(!s.failed, 'equipment survives movement');
      if(s.pendingDiagnosis){for(const key of held)await page.keyboard.up(key);held.clear();await acknowledgeDiagnosis(page);continue;}
      if (distance(s.player, target) < tolerance) return;
      const waypoint = nextWaypoint(s, target);
      const needed = new Set(waypoint ? ['ShiftLeft'] : []);
      if (waypoint) { const dx = waypoint.x - s.player.x, dy = waypoint.y - s.player.y; if (dx < -4) needed.add('KeyA'); if (dx > 4) needed.add('KeyD'); if (dy < -4) needed.add('KeyW'); if (dy > 4) needed.add('KeyS'); }
      for (const key of held) if (!needed.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of needed) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
      const axes = waypoint ? [Math.abs(waypoint.x - s.player.x), Math.abs(waypoint.y - s.player.y)].filter(d => d > 4) : [];
      await defenseTick(page, axes.length ? Math.min(110, Math.max(16, Math.min(...axes) / 174 * 1000)) : 32, directThreatsOnly);
    }
    assert.fail('movement blocked: ' + JSON.stringify((await game(page)).player) + ' → ' + JSON.stringify(target));
  } finally { for (const key of held) await page.keyboard.up(key); }
}
async function scan(page, enabled = true) { if ((await game(page)).scanner !== enabled) await page.keyboard.press('KeyQ'); }
async function node(page, id) { const p = (await game(page)).nodes.find(p => p.id === id); assert(p, 'node exists: ' + id); return p; }
async function portal(page, id) { const p = (await game(page)).portals.find(p => p.id === id); assert(p, 'portal exists: ' + id); return p; }
async function interact(page, target) { await moveTo(page, target); await page.keyboard.press('KeyE'); await tick(page, 32); }
async function acknowledgeDiagnosis(page) {
  if ((await game(page)).pendingDiagnosis) {
    await page.locator('#dialog-actions .primary-button').click(); await tick(page, 16);
    assert.equal((await game(page)).pendingDiagnosis, null, 'visible diagnosis confirmation resumes treatment');
  }
}
async function discover(page, target) {
  await acknowledgeDiagnosis(page); await scan(page, false); await moveTo(page, target);
  const s = await game(page), focus = !target.id && s.room === 'main' && distance(target, s.clot) < 240 ? s.clot : target;
  await mouseAt(page, focus); await scan(page); await tick(page, 1400); await acknowledgeDiagnosis(page);
}
async function showTreatmentControls(page) {
  const intro = await page.locator('#app').evaluate(el => el.classList.contains('journey-diagnosis-entry'));
  if (!intro) return;
  await discover(page, (await game(page)).entryLesion); await tick(page, 32);
  assert.equal(await page.locator('#app').evaluate(el => el.classList.contains('journey-diagnosis-entry')), false, 'the first public diagnosis reveals treatment controls');
}
async function equip(page, id) {
  await page.mouse.up(); await page.keyboard.press(({ precision: 'Digit1', sprayer: 'Digit2', probe: 'Digit3' })[id]);
  assert.equal((await game(page)).tool, id);
}
async function diagnose(page) {
  await discover(page, await node(page, 'flow')); assert((await game(page)).scanned.flow); assert((await portal(page, 'to-main')).locked);
  await discover(page, await node(page, 'pressure')); assert((await portal(page,'to-main')).locked,'scan is diagnostic, not a door key');
  const lesion=(await game(page)).entryLesion;await equip(page,'precision');await moveTo(page,{x:lesion.x,y:lesion.y+90});await scan(page,false);await mouseAt(page,lesion);await page.mouse.down();await tick(page,1700);await page.mouse.up();assert((await game(page)).entryLesion.complete);assert(!(await portal(page,'to-main')).locked);
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
  await equip(page, 'precision');
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
  if(!(await game(page)).defense.active)return;
  await equip(page,'precision');await scan(page,false);
  const initial=await game(page),center=initial.room==='main'?await node(page,'release'):{x:(initial.bounds.left+initial.bounds.right)/2,y:initial.bounds.bottom-250};await moveTo(page,center);
  const held=new Set();let firing=false;
  const release=async()=>{for(const key of held)await page.keyboard.up(key);held.clear();if(firing){await page.mouse.up();firing=false;}};
  try{
    for(let frame=0;frame<440;frame++){
      const s=await game(page);assert(!s.failed,'defensive native input survives');
      const alive=s.enemies.filter(e=>e.hp>0);if(!alive.length&&!s.spawnTelegraphs.length)return;
      const reachable=alive.filter(e=>distance(s.player,e)<220&&!s.obstacles.some(r=>r.blocking!==false&&crosses(s.player,e,r))).sort((a,b)=>(a.type==='weaver'?-100:0)+distance(a,s.player)-(b.type==='weaver'?-100:0)-distance(b,s.player));
      if(reachable.length){
        for(const key of held)await page.keyboard.up(key);held.clear();const enemy=reachable[0];await mouseAt(page,enemy.state==='recover'&&enemy.weakpoint?enemy.weakpoint:enemy);if(!firing){await page.mouse.down();firing=true;}
      }else{
        if(firing){await page.mouse.up();firing=false;}const e=alive.sort((a,b)=>distance(a,s.player)-distance(b,s.player))[0];let waypoint;
        if(e){const d=distance(e,s.player)||1;waypoint=nextWaypoint(s,{x:e.x+(s.player.x-e.x)/d*175,y:e.y+(s.player.y-e.y)/d*175});}
        const wanted=new Set(waypoint?['ShiftLeft']:[]);if(waypoint){if(waypoint.x-s.player.x>3)wanted.add('KeyD');if(waypoint.x-s.player.x< -3)wanted.add('KeyA');if(waypoint.y-s.player.y>3)wanted.add('KeyS');if(waypoint.y-s.player.y< -3)wanted.add('KeyW');}
        for(const key of held)if(!wanted.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
      }
      await defenseTick(page,32);
    }
  }finally{await release();}
}
async function fightTutorial(page) { assert.equal((await game(page)).stage, 'clot'); }
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
async function soften(page,id,onPartial,leaveAlive=false){
  if((await game(page)).weakpoints.find(p=>p.id===id).complete)return;
  if((await game(page)).organStability<60)await repairTissues(page,65);await clearInterference(page);await repairTissues(page,70);
  const weak = (await game(page)).weakpoints.find(p => p.id === id); await equip(page, weak.requiredTool); await moveTo(page, therapyPosition(await game(page), id));
  await scan(page, false); let held = false, observedPartial = false;
  try {
    for (let i = 0; i < 1200 && !(await game(page)).weakpoints.find(p => p.id === id).complete; i++) {
      let s=await game(page);assert(!s.failed,'treatment survives interference before retrying input');
      if(s.organStability<40){if(held){await page.mouse.up();held=false;}await repairTissues(page,65);await equip(page,weak.requiredTool);await moveTo(page,therapyPosition(await game(page),id));s=await game(page);}
      await scan(page, false); await mouseAt(page, s.weakpoints.find(p => p.id === id)); const ray = (await game(page)).toolPreview;
      if (ray.hitType !== 'hunter' && (ray.hitType !== 'treatment' || !(ray.targetId === id || ray.targets.some(t => t.targetId === id)))) { if (held) { await page.mouse.up(); held = false; } const alternate = therapyPosition(await game(page), id, true); assert(alternate, 'alternate treatment angle is available'); await moveTo(page, alternate, 6); await tick(page, 16); continue; }
      if (!held) { await page.mouse.down(); held = true; } await defenseTick(page, 32); assert(!(await game(page)).failed, 'treatment survives interference');
      if (onPartial && !observedPartial && (await game(page)).weakpoints.find(p => p.id === id).progress > .2) { observedPartial = true; if (held) { await page.mouse.up(); held = false; } await onPartial(id); }
    }
  } finally { if (held) await page.mouse.up(); }
  await tick(page, 220); assert((await game(page)).weakpoints.find(p => p.id === id).complete, 'sustained local therapy completes ' + id);
}
async function repairTissues(page,minimum=70){
  if(!(await game(page)).tissues.length||(await game(page)).organStability>=minimum)return;
  let targetId;const original=(await game(page)).tool;
  try{
    for(let frame=0;frame<800&&(await game(page)).organStability<minimum;frame++){
      const s=await game(page);assert(!s.failed,'repair route survives');let t=s.tissues.find(t=>t.id===targetId);
      const weakest=s.tissues.filter(p=>p.integrity<p.maxIntegrity||p.attached).sort((a,b)=>a.integrity-b.integrity||distance(a,s.player)-distance(b,s.player))[0];
      if(!t||t.integrity>=t.maxIntegrity||t.integrity>=25&&weakest.integrity<=t.integrity-15){t=weakest;targetId=t.id;}
      // Repair a safety margin, then remove an actually hittable attacker so
      // repeated damage cannot keep this same tissue below full integrity forever.
      const attackers=s.organStability>=40&&t.integrity>0?s.enemies.filter(e=>e.hp>0&&distance(e,s.player)<330&&e.targetKind==='tissue'&&e.targetId===t.id).sort((a,b)=>a.hp-b.hp||distance(a,s.player)-distance(b,s.player)):[];
      const walls=s.obstacles.filter(r=>r.blocking!==false),wounds=s.tissues.filter(p=>p.integrity<p.maxIntegrity||p.attached).map(w=>({x:w.x-w.hitArea.rx,y:w.y-w.hitArea.ry,w:w.hitArea.rx*2,h:w.hitArea.ry*2}));
      let clearing=false;
      for(const enemy of attackers.filter(e=>distance(e,s.player)<215&&!walls.some(r=>crosses(s.player,e,r))&&!wounds.some(r=>crosses(s.player,e,r)))){
        if((await game(page)).tool!=='precision')await equip(page,'precision');
        await mouseAt(page,enemy.state==='recover'&&enemy.weakpoint?enemy.weakpoint:enemy);
        if((await game(page)).toolPreview.hitType!=='hunter')await mouseAt(page,enemy);
        if((await game(page)).toolPreview.hitType!=='hunter')continue;
        await page.mouse.down();await defenseTick(page,32,true);clearing=true;break;
      }
      if(clearing)continue;
      if(attackers.length){
        // A wound can be the real first hit in front of a weaver. Walk to a
        // firing angle rather than repeatedly shooting through that same wound.
        const enemy=attackers[0];
        const poses=[110,175].flatMap(radius=>Array.from({length:16},(_,i)=>({x:enemy.x+Math.cos(i*Math.PI/8)*radius,y:enemy.y+Math.sin(i*Math.PI/8)*radius})))
          .filter(p=>distance(p,t)<210&&p.x>s.bounds.left+25&&p.x<s.bounds.right-25&&p.y>s.bounds.top+25&&p.y<s.bounds.bottom-25&&!walls.some(r=>overlaps(p,r,20)||crosses(p,enemy,r))&&!wounds.some(r=>crosses(p,enemy,r)))
          .sort((a,b)=>distance(a,s.player)-distance(b,s.player));
        if(poses[0]){await page.mouse.up();await moveTo(page,poses[0],10,true);continue;}
      }
      if(distance(s.player,t)>195){await page.mouse.up();await moveTo(page,{x:t.x,y:t.y+150},10,true);continue;}
      const chosen=t.integrity<t.maxIntegrity?'precision':'sprayer';if((await game(page)).tool!==chosen)await equip(page,chosen);
      await mouseAt(page,t);const reason=(await game(page)).toolPreview.repairHint?.reason;
      if(reason==='out-of-range'||reason==='wall'){await page.mouse.up();await moveTo(page,{x:t.x,y:t.y+95},10,true);}
      await mouseAt(page,t);await page.mouse.down();await defenseTick(page,32,true);
    }
  }finally{await page.mouse.up();}
  assert((await game(page)).organStability>=minimum,'shared stability can be repaired');if(!(await game(page)).inputLocked)await equip(page,original);
}
async function restoreFlow(page, beforeRelease, duringBurst, duringTherapy) {
  const routeState=await game(page),order=routeState.weakpoints.slice().sort((a,b)=>a.kind==='core'?1:b.kind==='core'?-1:distance(a,routeState.player)-distance(b,routeState.player));
  for(const [index,w] of order.entries())await soften(page,w.id,index===0?duringTherapy:undefined);
  const release=await node(page,'release');
  for(let attempt=0;attempt<5&&(await game(page)).stage!=='burst';attempt++){
    await moveTo(page,release,45);
    if((await game(page)).organStability<60){
      const available=(await game(page)).tissues.filter(t=>!t.attached&&t.integrity<t.maxIntegrity).sort((a,b)=>a.integrity-b.integrity)[0];
      if(available){
        await equip(page,'precision');await mouseAt(page,available);await page.mouse.down();
        try{for(let frame=0;frame<180&&(await game(page)).organStability<65&&(await game(page)).tissues.find(t=>t.id===available.id).integrity<available.maxIntegrity;frame++){await tick(page,32);assert(!(await game(page)).failed,'valve-side repair survives');}}finally{await page.mouse.up();}
      }
      if((await game(page)).organStability<60)await repairTissues(page,80);
      continue;
    }
    if(beforeRelease)await beforeRelease();await page.keyboard.press('KeyE');await tick(page,32);
  }
  assert.equal((await game(page)).stage,'burst','the valve atomically checks current stability');
  if(duringBurst)await duringBurst();await tick(page,4100);assert.equal((await game(page)).checkpoint,'flow');
}
async function enterHeart(page) { await interact(page, await portal(page, 'to-heart')); assert.equal((await game(page)).room, 'heart'); await tick(page, 1600); }
async function treatHeartSector(page, id) {
  const sector = async () => (await game(page)).heartSectors.find(s => s.id === id);
  for (const part of ['source', 'relay']) {
    const complete = async () => part === 'source' ? (await sector()).cleared : (await sector()).relay.complete;
    if (await complete()) continue;
    if(!(await game(page)).heartSectors.some(s=>s.complete))await repairTissues(page, 70);
    const target = part === 'source' ? await sector() : (await sector()).relay, tool = target.requiredTool;
    await equip(page, tool); await scan(page, false); await moveTo(page, { x: target.x, y: target.y + 105 });
    try {
      for (let frame = 0; frame < 950 && !(await complete()); frame++) {
        const s = await game(page); assert(!s.failed, 'native heart sector treatment survives');
        if (s.organStability < 45) { await page.mouse.up(); await repairTissues(page, 80); await equip(page, tool); await moveTo(page, { x: target.x, y: target.y + 105 }); }
        const threat=(await game(page)).enemies.filter(e=>e.hp>0&&e.targetKind==='player'&&['telegraph','lunge','recover'].includes(e.state)&&distance(e,(s.player))<130).sort((a,b)=>a.hp-b.hp)[0];
        if(threat){if((await game(page)).tool!=='precision')await equip(page,'precision');await mouseAt(page,threat.state==='recover'&&threat.weakpoint?threat.weakpoint:threat);if((await game(page)).toolPreview.hitType==='hunter'){await page.mouse.down();await defenseTick(page,32);continue;}}
        const positioned=await game(page);
        if(distance(positioned.player,target)>(tool==='sprayer'?135:210)||positioned.obstacles.some(w=>w.blocking!==false&&crosses(positioned.player,target,w))){await page.mouse.up();await moveTo(page,{x:target.x,y:target.y+105});}
        await mouseAt(page, target); const ray = (await game(page)).toolPreview;
        if (ray.hitType === 'hunter') { if ((await game(page)).tool !== 'precision') await equip(page, 'precision'); }
        else if ((await game(page)).tool !== tool) await equip(page, tool);
        await page.mouse.down(); await defenseTick(page, 32);
      }
    } finally { await page.mouse.up(); }
    assert(await complete(), 'native therapy completes ' + id + ' ' + part);
  }
  assert((await sector()).complete);
}
async function synchronizeHeart(page) {
  const core = (await game(page)).syncCore; await equip(page, 'probe'); await moveTo(page, { x: core.x, y: core.y + 110 });
  for (let beat = 0; beat < 3; beat++) {
    const before = (await game(page)).conductionSignal.verifiedBeats;
    for (let attempt = 0; attempt < 10 && (await game(page)).conductionSignal.verifiedBeats === before; attempt++) {
      await page.mouse.up(); await tick(page, Math.max(220, (await game(page)).reloadRemaining * 1000 + 32));
      await mouseAt(page, core); await page.mouse.down(); await tick(page, 32); await page.mouse.up();
      for (let frame = 0; frame < 100 && (await game(page)).conductionSignal.verifiedBeats === before; frame++) await tick(page, 32);
    }
    assert.equal((await game(page)).conductionSignal.verifiedBeats, before + 1, 'one native core press reaches downstream');
  }
  for (let frame = 0; frame < 300 && !(await game(page)).heartStable; frame++) await tick(page, 32);
  assert((await game(page)).heartStable); assert.equal((await game(page)).heartbeat, 'stable');
}
async function connectHeart(page, onRecovery, order = ['heart-west', 'heart-east']) {
  await repairTissues(page, 80); await discover(page, (await game(page)).heartSectors.find(s => s.id === order[0])); await collectSupply(page, 'probe');
  for (const id of order) await treatHeartSector(page, id);
  if ((await game(page)).stage !== 'recovery') await repairTissues(page, 80);
  await tick(page, 32); assert.equal((await game(page)).stage, 'recovery');
  assert.equal((await game(page)).conductionSignal.verifiedBeats, 0, 'sector repair does not invent downstream verification');
  if (onRecovery) await onRecovery();
  await synchronizeHeart(page);
}
// Historical helper name retained by browser callers: V3 directly exits after revival.
async function exitAndSuppress(page) {
  await scan(page,false);await acknowledgeDiagnosis(page);
  assert((await game(page)).heartStable);assert(!('growth' in (await game(page))));
  await interact(page,await portal(page,'exit'));assert.equal((await game(page)).stage,'ending');assert.equal((await game(page)).endingScene,'exterior');
}
async function waitForExterior(page) {
  for (let i = 0; i < 200; i++) {
    const s = await game(page);
    if (s.endingScene === 'exterior') { assert.equal(s.exteriorRecovery.duration, 8); return s; }
    assert.equal(s.stage, 'ending'); await tick(page, 32);
  }
  assert.fail('giant exterior did not follow the completed heart treatment');
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
module.exports = { snapshot, game, acknowledgeDiagnosis, showTreatmentControls, treatHeartSector, synchronizeHeart, tick, ready, click, primary, waitForEntry, setup, start, project, mouseScreen, mouseAt, moveTo, scan, equip, node, portal, interact, discover, diagnose, collectSupply, connectBypasses, approachHunter, clearInterference, repairTissues, fightTutorial, soften, restoreFlow, enterHeart, connectHeart, exitAndSuppress, waitForExterior, recoveryAt, canvasPixels, capture, inspectFit };
