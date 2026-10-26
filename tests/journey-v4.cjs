'use strict';
// New chapter contracts are exercised only through public inputs and actions.
const assert = require('node:assert/strict');
const route = require('./journey-controllers.cjs');
const { state, fresh, advance, press, scan, moveTo, discover, node, equip, acknowledgeDiagnosis, collectSupply, treatHeartSector } = route;
let passed = 0, failed = 0;
function test(name, run) { try { run(); passed++; console.log('PASS V4: ' + name); } catch (e) { failed++; console.error('FAIL V4: ' + name + '\n' + e.stack); } }
function world(s) {
  return { elapsed:s.elapsed,player:s.player,beat:s.beat,ammo:s.ammo,reloadRemaining:s.reloadRemaining,reloadStage:s.reloadStage,enemies:s.enemies,projectiles:s.projectiles,tissues:s.tissues,supplies:s.supplies,encounters:s.encounters,heartSectors:s.heartSectors,conductionSignal:s.conductionSignal,runMetrics:s.runMetrics };
}
function assertLayout(game) {
  const s=state(game),inside=p=>p.x>=s.bounds.left&&p.x<=s.bounds.right&&p.y>=s.bounds.top&&p.y<=s.bounds.bottom;
  const cases=s.scanTargets;
  for(let i=0;i<cases.length;i++)for(let j=i+1;j<cases.length;j++) {
    const a=cases[i],b=cases[j],range=t=>t.scanRadius||(t.id==='clot'?230:145);
    assert(Math.hypot(a.x-b.x,a.y-b.y)>=range(a)+range(b)+80-1e-6,'independent diagnosis groups keep a scan gap: '+a.id+'/'+b.id);
  }
  for(const p of [...s.nodes,...s.portals,...s.tissues,...cases])assert(inside(p),'interactive point stays inside room bounds: '+p.id);
  if(s.tissues.length===2){const gap=Math.hypot(s.tissues[0].x-s.tissues[1].x,s.tissues[0].y-s.tissues[1].y);assert(gap>=500&&gap<=600,'maintenance points are 500–600 world units apart');}
  if(s.room==='heart')assert.equal(Math.hypot(s.heartSectors[0].x-s.heartSectors[1].x,s.heartSectors[0].y-s.heartSectors[1].y),900);
  const therapy=s.room==='entry'?[s.entryLesion]:s.room==='main'?[...s.branches,...s.weakpoints]:s.heartSectors.flatMap(t=>[t,t.relay]);
  for(const p of therapy)for(const wall of s.obstacles.filter(w=>w.blocking!==false&&!(w.kind==='clot'&&s.weakpoints.some(t=>t.id===p.id))))assert(!(p.x>wall.x&&p.x<wall.x+wall.w&&p.y>wall.y&&p.y<wall.y+wall.h),'therapy target avoids unrelated solid anatomy: '+p.id+'/'+wall.id);
}

test('entry scan groups the co-located lesion, locks one focus and freezes at the diagnosis boundary', () => {
  const { game } = fresh(), lesion = state(game).entryLesion;
  assertLayout(game);assert(!state(game).scanTargets.some(t=>t.id==='pressure'),'pressure and lesion share one diagnosis group');
  assert.deepEqual({w:state(game).worldSize.w,h:state(game).worldSize.h},{w:2000,h:1250});
  moveTo(game,{x:lesion.x,y:lesion.y+90}); game.pointerMove(lesion); scan(game); advance(game,.6);
  let s=state(game); assert.equal(s.scanFocusId,lesion.id);
  assert.equal(s.scanTargets.filter(t=>t.progress>0&&t.progress<1).length,1,'only the focused case accumulates scan time');
  game.pointerMove(node(game,'flow')); advance(game,1.1); s=state(game);
  assert(s.pendingDiagnosis); assert.equal(s.pendingDiagnosis.targetId,lesion.id); assert.equal(s.scanner,false);
  assert.equal(s.pendingDiagnosis.actions.length,1); assert.equal(s.pendingDiagnosis.requiredTool,'precision');
  const before=world(s); game.update(3); assert.deepEqual(world(state(game)),before,'pending diagnosis freezes all simulation clocks');
  acknowledgeDiagnosis(game); assert.equal(state(game).keys.length,0);const resumed=state(game);advance(game,.25);assert.equal(state(game).ammo,resumed.ammo);assert.deepEqual(state(game).player,resumed.player,'confirmation cannot inherit movement');
  game.pointerMove(lesion); scan(game); advance(game,1.4); assert.equal(state(game).pendingDiagnosis,null,'unchanged critical diagnosis does not repause');
  assert(game.reviewDiagnosis()); assert(state(game).pendingDiagnosis); acknowledgeDiagnosis(game);
});

test('half-duration reload preserves three proportional stages and a single ready event', () => {
  const {game,events}=fresh(),p=state(game).player;
  game.pointerDown({x:p.x+100,y:p.y,button:0});advance(game,.01);game.pointerUp();press(game,'KeyR');
  assert.equal(state(game).reloadDuration,.85);assert.equal(state(game).reloadStage,'eject');
  advance(game,.23);assert.equal(state(game).reloadStage,'insert');
  advance(game,.4);assert.equal(state(game).reloadStage,'lock');assert(state(game).reloadRemaining>0);
  advance(game,.22);assert.equal(state(game).reloadStage,'idle');assert.equal(state(game).ammo,24);
  assert.equal(events.sounds.filter(n=>n==='reloadReady').length,1);
});

test('both heart orders close their own sources, preserve stage checkpoints and require three fresh core presses', () => {
  for(const order of [['heart-west','heart-east'],['heart-east','heart-west']]) {
    const {game}=route.toFlow(order[0]==='heart-west'?'left':'right');
    assertLayout(game);
    assert.equal(state(game).worldSize.w,2200);assert.equal(state(game).worldSize.h,1400);
    route.enterHeart(game);assert.equal(state(game).worldSize.w,2600);assert.equal(state(game).worldSize.h,1700);
    assertLayout(game);
    const first=state(game).heartSectors.find(s=>s.id===order[0]);discover(game,first);collectSupply(game,'probe');
    console.log('INFO V4 heart order '+order.join(' → ')+': before first sector health='+state(game).health+' stability='+state(game).organStability);
    treatHeartSector(game,first.id);let s=state(game),completed=s.heartSectors.find(p=>p.id===first.id);
    assert(completed.complete);assert.equal(s.checkpoint,first.id);assert(s.heartSectors.some(p=>!p.complete));
    assert(!s.enemies.some(e=>e.hp>0&&e.sourceId===first.id),'completed sector clears its surviving attackers');
    const metrics=JSON.parse(JSON.stringify(s.runMetrics));assert(game.retryFromCheckpoint());s=state(game);
    assert(s.heartSectors.find(p=>p.id===first.id).complete);assert.equal(s.runMetrics.minStability,metrics.minStability);
    assert.deepEqual(Array.from(s.runMetrics.weakpointEnemies),metrics.weakpointEnemies);assert.equal(s.runMetrics.retries,metrics.retries+1);
    advance(game,3.1);assert(!state(game).enemies.some(e=>e.hp>0&&e.sourceId===first.id),'closed source stays closed after checkpoint');
    treatHeartSector(game,order[1]);if(state(game).stage!=='recovery')route.repairTissues(game,80);advance(game,.02);
    assert.equal(state(game).stage,'recovery');assert.equal(state(game).conductionSignal.verifiedBeats,0);
    advance(game,4);assert.equal(state(game).conductionSignal.verifiedBeats,0,'waiting alone cannot complete verification');
    const core=state(game).syncCore;equip(game,'probe');moveTo(game,{x:core.x,y:core.y+110});
    press(game,'KeyR');advance(game,.86);
    const p=state(game).player;game.pointerDown({x:p.x+200,y:p.y+80,button:0});
    for(let frame=0;frame<360&&state(game).ammo>1;frame++)advance(game,1/60);
    game.pointerUp();advance(game,.21);assert.equal(state(game).ammo,1,'public firing leaves exactly one verification dose');
    game.pointerDown({...core,button:0});advance(game,6);game.pointerUp();s=state(game);
    assert.equal(s.conductionSignal.verifiedBeats,1,'held trigger produces one accepted pulse only');assert(!s.heartStable);
    assert.equal(s.reloadRemaining,0);assert.equal(s.ammo,24,'the final recovery dose automatically reloads without deadlocking verification');
    // The shared helper can finish from an already verified beat.
    for(let beat=1;beat<3;beat++) {
      game.pointerDown({...core,button:0});advance(game,.02);game.pointerUp();
      for(let i=0;i<300&&state(game).conductionSignal.verifiedBeats===beat;i++)advance(game,1/60);
      assert.equal(state(game).conductionSignal.verifiedBeats,beat+1);
    }
    advance(game,7);s=state(game);assert(s.heartStable);assert(!s.portals.find(p=>p.id==='exit').locked);
    assert.equal(new Set(s.runMetrics.weakpointEnemies).size,s.runMetrics.weakpointEnemies.length);
    assert.deepEqual(Array.from(s.performance.medals,m=>m.id),['guardian','precision','steady']);
    assert.equal(s.performance.medals.find(m=>m.id==='steady').earned,false,'retry remains visible in the final assessment');
  }
});

console.log(`\n${passed} V4 contract checks passed; ${failed} failed.`);
if(failed)process.exitCode=1;
