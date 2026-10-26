'use strict';
// Defense-specific V4 regression. The bot only uses public key/pointer inputs;
// snapshots are frozen observations, never a way to arrange combat state.
const assert = require('node:assert/strict');
const route = require('./journey-controllers.cjs');
const { distance, crosses, overlaps, nextWaypoint } = require('./journey-navigation.cjs');
const { state, fresh, advance, press, moveTo, node, portal, interact, discover, equip } = route;
const DT = 1 / 60;
let passed = 0, failed = 0;
function test(name, run) {
  if (require.main !== module || process.env.JOURNEY_TEST_FILTER && !new RegExp(process.env.JOURNEY_TEST_FILTER).test(name)) return;
  try { run(); passed++; console.log('PASS defense: ' + name); }
  catch (error) { failed++; console.error('FAIL defense: ' + name + '\n' + error.stack); }
}
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(.001,dx*dx+dy*dy)));
  return distance(p,{x:a.x+dx*t,y:a.y+dy*t});
}
function walls(s, target) { return s.obstacles.filter(o => o.blocking !== false && !(target && target.kind && ['fiber','core'].includes(target.kind) && o.kind === 'clot')); }
function clearShot(s, target) { return !walls(s,target).some(o => crosses(s.player,target,o)); }
function walk(game, target) {
  const s = state(game), waypoint = target && nextWaypoint(s,target);
  for (const [key, down] of [['KeyA',waypoint&&waypoint.x<s.player.x-4],['KeyD',waypoint&&waypoint.x>s.player.x+4],['KeyW',waypoint&&waypoint.y<s.player.y-4],['KeyS',waypoint&&waypoint.y>s.player.y+4]]) {
    if (down) game.keyDown(key); else game.keyUp(key);
  }
  game.keyDown('ShiftLeft');
}
function pose(s, target, range) {
  if(distance(s.player,target)<range-12&&clearShot(s,target))return {...s.player};
  const candidates=[];
  for(const radius of [Math.min(110,range-20),range-28])for(let i=0;i<16;i++){
    const a=i*Math.PI/8,p={x:target.x+Math.cos(a)*radius,y:target.y+Math.sin(a)*radius};
    if(p.x<s.bounds.left+24||p.x>s.bounds.right-24||p.y<s.bounds.top+24||p.y>s.bounds.bottom-24)continue;
    if(walls(s).some(w=>overlaps(p,w,20))||walls(s,target).some(w=>crosses(p,target,w)))continue;
    candidates.push(p);
  }
  candidates.sort((a,b)=>distance(a,s.player)-distance(b,s.player));
  assert(candidates[0],'a reachable treatment/firing pose exists for '+target.id);
  return candidates[0];
}
function setup(options={}) {
  const run=fresh(),game=run.game,lesion=state(game).entryLesion;
  moveTo(game,{x:lesion.x,y:lesion.y+90});
  assert(!state(game).scanner);
  game.pointerDown({...lesion,button:0});advance(game,lesion.duration+.05);game.pointerUp();
  assert(state(game).entryLesion.complete,'known entry lesion responds without Q');
  assert(!state(game).scanned.pressure,'entry route never enabled diagnostic scan');
  assert(!portal(game,'to-main').locked);
  interact(game,portal(game,'to-main'));
  discover(game,{x:state(game).clot.x,y:state(game).clot.y+145});
  if(options.collect===false)route.treatBranch(game,'right');else route.connectBypasses(game,'right');
  return run;
}
class DefenseBot {
  constructor(game) { this.game=game;this.dodgeUntil=0;this.dodgeTarget=null;this.repairId=null;this.enemyId=null; }
  tick(options={}) {
    const game=this.game,s=state(game);
    assert(!s.failed,'public-input defense bot survives: '+s.failureReason+' at '+s.elapsed.toFixed(2)+'s');
    let tissue=options.tissueId?s.tissues.find(t=>t.id===options.tissueId):null;
    if(!tissue&&s.organStability<(options.repairFloor===undefined?82:options.repairFloor)){
      tissue=s.tissues.find(t=>t.id===this.repairId&&t.integrity<t.maxIntegrity)||s.tissues.slice().sort((a,b)=>a.integrity-b.integrity)[0];
      this.repairId=tissue&&tissue.id;
    }else if(!options.tissueId)this.repairId=null;
    if(tissue&&tissue.integrity>=tissue.maxIntegrity&&!tissue.attached)tissue=null;
    const living=s.enemies.filter(e=>e.hp>0),inRange=living.filter(e=>distance(s.player,e)<218&&clearShot(s,e));
    let target=tissue,tool=tissue&&tissue.attached?'sprayer':'precision';
    if(!target&&options.primaryId){target=s.weakpoints.find(w=>w.id===options.primaryId&&!w.complete);if(target)tool=target.requiredTool;}
    if(!target&&options.kill!==false){
      target=living.find(e=>e.id===this.enemyId)||(inRange.length?inRange:living).slice().sort((a,b)=>distance(a,s.player)-distance(b,s.player))[0];
      this.enemyId=target&&target.id;
      if(target&&target.state==='recover'&&target.weakpoint)target={...target.weakpoint,id:target.id};
    }
    if(s.tool!==tool)equip(game,tool);
    let destination=target?pose(state(game),target,tool==='sprayer'?145:225):options.destination||s.nodes.find(n=>n.id==='release')||{...s.player};
    if(this.dodgeUntil>s.elapsed&&this.dodgeTarget)destination=this.dodgeTarget;
    else {
      const danger=living.find(e=>e.target&&['telegraph','lunge'].includes(e.state)&&distance(e,s.player)<340&&segmentDistance(s.player,e,e.target)<62&&(e.targetKind==='player'||e.state==='lunge'&&distance(e,s.player)<70));
      if(danger){
        const dx=danger.target.x-danger.x,dy=danger.target.y-danger.y,d=Math.max(1,Math.hypot(dx,dy));
        const candidates=[1,-1].map(sign=>({x:s.player.x-dy/d*140*sign,y:s.player.y+dx/d*140*sign}))
          .filter(p=>p.x>s.bounds.left+25&&p.x<s.bounds.right-25&&p.y>s.bounds.top+25&&p.y<s.bounds.bottom-25&&!walls(s).some(w=>crosses(s.player,p,w,18)));
        candidates.sort((a,b)=>distance(a,{x:(s.bounds.left+s.bounds.right)/2,y:s.bounds.bottom-250})-distance(b,{x:(s.bounds.left+s.bounds.right)/2,y:s.bounds.bottom-250}));
        if(candidates[0]){
          destination=this.dodgeTarget=candidates[0];this.dodgeUntil=s.elapsed+Math.max(.3,danger.timer||.8)+.65;
          walk(game,destination);if(s.dashCooldown<=0)press(game,'Space');
        }
      }
    }
    walk(game,destination);
    if(target){
      game.pointerMove(target);
      const preview=state(game).toolPreview;
      // An enemy can physically intercept repair. Clear that blocker using the
      // same public pointer instead of assuming the tissue receives the beam.
      if(preview.hitType==='hunter'&&tool==='sprayer'&&tissue&&!tissue.attached)equip(game,'precision');
      game.pointerDown({...target,button:0});
    }else game.pointerUp();
    game.update(DT);
    const result=state(game);invariant(result);return result;
  }
  until(predicate, options={}, seconds=45) {
    for(let i=0;i<seconds/DT;i++){
      const s=state(this.game);if(predicate(s)){this.game.clearInput();return s;}
      this.tick(options);
    }
    assert.fail('public-input objective did not finish: '+JSON.stringify({stage:state(this.game).stage,stability:state(this.game).organStability,primary:options.primaryId}));
  }
}
function invariant(s) {
  assert.equal(s.organStability,s.tissues.reduce((n,t)=>n+t.integrity,0));
  assert(s.tissues.every(t=>t.localFlow===t.integrity/t.maxIntegrity));
  assert(s.enemies.filter(e=>e.hp>0).length<=s.encounter.cap);
  assert(s.enemies.filter(e=>e.hp>0&&['telegraph','lunge','cast'].includes(e.state)).length<=2);
}
function waitFor(game, predicate, seconds=60) {
  const bot=new DefenseBot(game);
  return bot.until(predicate,{repairFloor:0,kill:false},seconds);
}

test('entry can be treated without Q; defense begins on therapy and locks retreat',()=>{
  const {game}=setup(),s=state(game);assert(s.defense.active);assert(portal(game,'to-entry').locked);assert.equal(s.tissues.length,2);invariant(s);
  interact(game,portal(game,'to-entry'));assert.equal(state(game).room,'main','E at the real return portal cannot leave active defense');
});

test('both disease behaviors damage actual tissue and perfusion; zero tissue survives and enemies retarget',()=>{
  const {game}=setup(),bot=new DefenseBot(game);let previous=state(game),coagHit=false,weaverHit=false,zero=null,retargeted=false;
  for(let i=0;i<60*65&&!zero;i++){
    const s=bot.tick({repairFloor:0,kill:false});invariant(s);
    for(const t of s.tissues){
      const old=previous.tissues.find(p=>p.id===t.id);
      if(t.integrity<old.integrity){
        assert(t.localFlow<old.localFlow);assert(s.organStability<previous.organStability);
        const projectileImpact=previous.projectiles.some(p=>p.targetId===t.id&&p.remaining<=DT+1e-7);
        const touchingLunge=[...previous.enemies,...s.enemies].some(e=>e.type==='coagulator'&&e.state==='lunge'&&distance(e,t)<56);
        assert(projectileImpact||touchingLunge,'tissue loss is explained by a real projectile impact or touching lunge');
        if(projectileImpact)weaverHit=true;else if(touchingLunge)coagHit=true;
      }
    }
    previous=s;
    zero=s.tissues.find(t=>t.integrity===0&&s.organStability>0)||null;
  }
  assert(coagHit,'coagulator lunge actually hit tissue');assert(weaverHit,'weaver projectile actually hit tissue');assert(zero,'one tissue can reach zero before shared failure');assert(!state(game).failed);
  const otherId=state(game).tissues.find(t=>t.id!==zero.id).id;
  const depletedAttackers=new Set(state(game).enemies.filter(e=>e.targetId===zero.id).map(e=>e.id));
  assert(depletedAttackers.size>0,'an observed attacker targeted the depleted tissue');
  for(let i=0;i<60*5&&!retargeted;i++){
    const s=bot.tick({repairFloor:0,kill:false});
    retargeted=s.enemies.some(e=>depletedAttackers.has(e.id)&&e.targetKind==='tissue'&&e.targetId===otherId&&['approach','telegraph','lunge','cast'].includes(e.state));
  }
  assert(retargeted,'remaining live tissue becomes an attack target');
  bot.until(s=>s.tissues.find(t=>t.id===zero.id).integrity>5,{tissueId:zero.id,kill:false},15);
  assert.equal(state(game).tissues.length,2,'depleted tissue remains repairable');assert(!state(game).failed);
});

test('precision repairs coated tissue directly while spray separately removes attachment without healing',()=>{
  const {game}=setup(),s=waitFor(game,s=>s.tissues.some(t=>t.attached&&t.integrity>0));
  const id=s.tissues.find(t=>t.attached&&t.integrity>0).id,bot=new DefenseBot(game);
  const t=s.tissues.find(t=>t.id===id);moveTo(game,{x:t.x,y:t.y+95});equip(game,'precision');game.pointerMove(t);
  let preview=state(game).toolPreview;
  assert.equal(preview.targetId,id);assert.equal(preview.hitType,'treatment');
  assert.equal(preview.repairHint.reason,'ready');assert.equal(preview.repairHint.requiredTool,'precision');
  const before=state(game).tissues.find(t=>t.id===id).integrity;
  game.pointerDown({...t,button:0});advance(game,.21);game.pointerUp();
  const repaired=state(game).tissues.find(t=>t.id===id);
  assert(repaired.integrity>before,'precision heals the wound despite the visible coating');assert(repaired.attached,'precision does not silently remove the coating');
  const beforeCleaning=repaired.integrity;
  bot.until(s=>!s.tissues.find(t=>t.id===id).attached,{tissueId:id,kill:false},12);
  const cleared=state(game).tissues.find(t=>t.id===id).integrity;
  assert(cleared<=beforeCleaning,'spray removes coating without adding tissue integrity');
  bot.until(s=>s.tissues.find(t=>t.id===id).integrity>cleared+3,{tissueId:id,kill:false},12);
  invariant(state(game));
});

test('an actual fiber projectile landing during held precision fire does not interrupt ongoing repair',()=>{
  const {game}=setup(),bot=new DefenseBot(game);
  const nearby=state(game).tissues.slice().sort((a,b)=>distance(a,state(game).player)-distance(b,state(game).player))[0];
  moveTo(game,{x:nearby.x,y:nearby.y+130});
  const inPosition=(s,p)=>p.targetKind==='tissue'&&p.remaining>.2&&s.tissues.some(t=>t.id===p.targetId&&!t.attached&&t.integrity>0&&t.integrity<t.maxIntegrity&&distance(s.player,t)<205&&clearShot(s,t));
  let s=bot.until(s=>s.projectiles.some(p=>inPosition(s,p)),{repairFloor:60,kill:false,destination:{x:nearby.x,y:nearby.y+130}},65);
  const projectile=s.projectiles.find(p=>inPosition(s,p));
  const target=s.tissues.find(t=>t.id===projectile.targetId);
  equip(game,'precision');game.pointerMove(target);
  while((state(game).projectiles.find(p=>p.id===projectile.id)?.remaining||0)>.16)game.update(DT);
  s=state(game);assert(s.projectiles.some(p=>p.id===projectile.id),'the observed fiber projectile is still in flight before firing');
  assert(!s.tissues.find(t=>t.id===target.id).attached);assert.equal(s.toolPreview.hitType,'treatment');assert.equal(s.toolPreview.targetId,target.id);
  game.pointerDown({...target,button:0});let healingBeforeImpact=false,impact=null;
  for(let frame=0;frame<60&&!impact;frame++){
    const before=state(game),previous=before.tissues.find(t=>t.id===target.id);game.update(DT);
    const after=state(game),current=after.tissues.find(t=>t.id===target.id);
    if(!current.attached&&current.integrity>previous.integrity)healingBeforeImpact=true;
    if(!previous.attached&&current.attached){
      assert(before.projectiles.some(p=>p.id===projectile.id&&p.remaining<=DT+1e-7),'coating came from the real approaching projectile');
      assert(!after.projectiles.some(p=>p.id===projectile.id));assert(current.integrity<previous.integrity,'the projectile delivered actual tissue damage');impact=current;
    }
  }
  assert(healingBeforeImpact,'precision was already healing before the hit');assert(impact,'the real projectile landed during the same held trigger');
  for(let frame=0;frame<6;frame++){
    const before=state(game),t=before.tissues.find(t=>t.id===target.id);assert.equal(before.tool,'precision');assert.equal(before.toolPreview.repairHint.reason,'ready');
    game.update(DT);const repaired=state(game).tissues.find(t=>t.id===target.id);
    assert(repaired.attached);assert(Math.abs(repaired.integrity-t.integrity-20*DT)<1e-7,'paid precision healing continues at 20 per second with no new trigger or gun change');
  }
  game.pointerUp();invariant(state(game));
});

test('shared organ failure fires once; retry restores organ and threats with a three second grace',()=>{
  const {game,events}=setup(),saved=state(game).branches.filter(b=>b.complete).map(b=>b.id);
  waitFor(game,s=>s.failed,120);
  const s=state(game);assert.equal(s.failureReason,'tissue');assert.equal(s.organStability,0);assert.equal(events.fail,1);
  advance(game,3);assert.equal(events.fail,1);assert.equal(state(game).elapsed,s.elapsed);
  assert(game.retryFromCheckpoint());const r=state(game);
  assert.equal(r.organStability,100);assert.equal(r.health,100);assert(r.tissues.every(t=>!t.attached));assert.equal(r.enemies.length,0);assert.equal(r.projectiles.length,0);assert.equal(r.spawnTelegraphs.length,0);
  assert(saved.every(id=>r.branches.find(b=>b.id===id).complete));assert(r.tools.find(t=>t.id==='sprayer').unlocked);
  advance(game,2.99);assert.equal(state(game).enemies.length,0);assert.equal(state(game).spawnTelegraphs.length,0);
  advance(game,.04);assert(state(game).spawnTelegraphs.length>0,'warning follows the preparation period');
});

test('reinforcements exceed the old total budget without exceeding simultaneous limits',()=>{
  // Leave the spray capsule unclaimed: this is a valid, continuously defended
  // early phase. Mixed enemy behavior and coating are covered independently.
  const {game}=setup({collect:false}),bot=new DefenseBot(game);
  const s=bot.until(s=>s.encounter.spawned>13,{repairFloor:82},180);
  for(const e of s.enemies)assert(['coagulator','weaver'].includes(e.type));
  assert(s.defense.active);assert(s.encounter.spawned>=14);invariant(s);
  console.log('INFO sustained defense: '+s.encounter.spawned+' reinforcements, '+s.elapsed.toFixed(1)+' simulated seconds');
});

test('completed primary lesions persist under organ damage; low stability blocks flow and restoration stops reinforcement',()=>{
  const {game}=setup(),bot=new DefenseBot(game);
  for(const id of ['W1','W2','W3']){
    bot.until(s=>s.enemies.every(e=>e.hp<=0),{repairFloor:65},35);
    bot.until(s=>s.weakpoints.find(w=>w.id===id).complete,{primaryId:id,repairFloor:60},60);
  }
  game.clearInput();const completed=state(game).weakpoints.map(w=>({id:w.id,complete:w.complete,progress:w.progress}));
  waitFor(game,s=>s.organStability<60&&s.organStability>0,60);
  moveTo(game,node(game,'release'));const low=state(game);assert(low.organStability<60);press(game,'KeyE');assert.equal(state(game).stage,'clot');assert(state(game).defense.active);
  assert.deepEqual(state(game).weakpoints.map(w=>({id:w.id,complete:w.complete,progress:w.progress})),completed);
  bot.until(s=>s.organStability>=85,{repairFloor:90},35);
  interact(game,node(game,'release'));assert.equal(state(game).stage,'burst');assert(state(game).defense.closed);const spawned=state(game).encounter.spawned;
  advance(game,20);const restored=state(game);assert(restored.flowRestored);assert.equal(restored.organStability,100);assert.equal(restored.enemies.filter(e=>e.hp>0).length,0);assert.equal(restored.spawnTelegraphs.length,0);assert.equal(restored.encounter.spawned,spawned);
});

if(require.main===module){console.log(`Defense regression: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;}
module.exports={setup,DefenseBot,invariant};
