'use strict';
// Focused repair UX regression. All fixtures are reached by public key/pointer
// input; immutable snapshots only choose targets and verify delivered effects.
const assert = require('node:assert/strict');
const route = require('./journey-controllers.cjs');
const { setup, DefenseBot } = require('./journey-defense.cjs');
const { distance, crosses, overlaps } = require('./journey-navigation.cjs');
const { state, advance, press, moveTo, equip } = route;
const DT = 1 / 60;
let passed = 0, failed = 0;
function test(name, run) {
  if (require.main !== module || process.env.JOURNEY_TEST_FILTER && !new RegExp(process.env.JOURNEY_TEST_FILTER).test(name)) return;
  try { run(); passed++; console.log('PASS repair: ' + name); }
  catch (error) { failed++; console.error('FAIL repair: ' + name + '\n' + error.stack); }
}
function tissue(game, id) { const t = state(game).tissues.find(t => t.id === id); assert(t, 'observed maintenance tissue exists'); return t; }
function hint(game, target, reason) {
  game.pointerMove(target); const preview = state(game).toolPreview;
  assert(preview.repairHint, 'aiming the visible tissue produces explicit repair diagnostics');
  assert.equal(preview.repairHint.targetId, target.id);
  assert.equal(preview.repairHint.reason, reason);
  assert.equal(preview.repairHint.target.x,target.x);assert.equal(preview.repairHint.target.y,target.y);
  assert(preview.repairHint.text.length > 0);
  return preview;
}
function firstDose(game,target,settle=true){
  game.pointerUp();
  if (state(game).reloadRemaining > 0) advance(game, state(game).reloadRemaining + .01);
  // Ensure a fresh dose rather than a treatment lease/cooldown from prior input.
  if(settle)advance(game,.21);game.pointerMove(target);
  const before = state(game), preview = before.toolPreview;
  game.pointerDown({ ...target, button: 0 });game.update(.000001);game.pointerUp();
  const after = state(game);assert(after.shot, 'public trigger delivers one actual dose');
  for (const field of ['hitType','targetId','tool','blocked','treatmentKind']) assert.equal(after.shot[field], preview[field], 'preview and delivered dose agree: ' + field);
  assert(distance(after.shot.to, preview.to) < 1e-7, 'actual dose uses the preview endpoint');
  assert.equal(after.ammo, before.ammo - 1);
  assert.deepEqual(after.shot.targets, preview.targets, 'repair diagnostics never replace the actual first-entity targets');
  return { before, after, preview };
}
function damageFixture({ coated = false } = {}) {
  const run = setup(), bot = new DefenseBot(run.game);
  const s = bot.until(s => s.tissues.some(t => t.integrity < t.maxIntegrity && (coated ? t.attached : !t.attached)), { repairFloor: 0, kill: false }, 35);
  const id = s.tissues.find(t => t.integrity < t.maxIntegrity && (coated ? t.attached : !t.attached)).id;
  return { ...run, id, bot };
}
function safePoint(s, target, offsets, reason, game, tool) {
  const candidates = offsets.map(([x,y]) => ({ x: target.x+x, y: target.y+y }))
    .filter(p => p.x>s.bounds.left+25&&p.x<s.bounds.right-25&&p.y>s.bounds.top+25&&p.y<s.bounds.bottom-25&&!s.obstacles.some(o=>o.blocking!==false&&overlaps(p,o,20)))
    .sort((a,b)=>distance(a,s.player)-distance(b,s.player));
  for (const p of candidates) {
    moveTo(game,p);equip(game,tool);game.pointerMove(tissue(game,target.id));
    const preview=state(game).toolPreview;
    if(preview.repairHint?.reason===reason)return preview;
  }
  assert.fail('public walking can reach repair pose: '+reason+' '+JSON.stringify({player:state(game).player,preview:state(game).toolPreview}));
}

test('visible tissue has an immutable ellipse; healthy targets explain why neither gun repairs',()=>{
  const { game }=route.fresh();route.diagnose(game);
  const t=state(game).tissues[0];assert.equal(t.hitArea.rx,60);assert.equal(t.hitArea.ry,30);assert(Object.isFrozen(t.hitArea));
  moveTo(game,{x:t.x,y:t.y+100});equip(game,'precision');
  const preview=hint(game,t,'healthy');assert.equal(preview.repairHint.requiredTool,'precision');
  const fired=firstDose(game,t);assert.equal(tissue(game,t.id).integrity,50);assert.notEqual(fired.preview.hitType,'treatment');
});

test('precision reaches coated tissue while the shorter spray correctly reports out of range',()=>{
  const {game,id}=damageFixture({coated:true});let t=tissue(game,id);
  safePoint(state(game),t,[[0,195],[0,-195]],'ready',game,'precision');
  t=tissue(game,id);assert(t.attached);const before=t.integrity;
  const precision=hint(game,t,'ready');assert.equal(precision.repairHint.requiredTool,'precision');assert(precision.targets.some(p=>p.targetId===id));
  firstDose(game,t);game.pointerDown({...t,button:0});advance(game,.15);game.pointerUp();
  assert(tissue(game,id).integrity>before,'precision directly restores a coated wound');
  assert(tissue(game,id).attached,'direct repair leaves the separate spray-cleaning task intact');
  assert.equal(tissue(game,id).localFlow,tissue(game,id).integrity/tissue(game,id).maxIntegrity);
  equip(game,'sprayer');const spray=hint(game,tissue(game,id),'out-of-range');assert(!spray.targets.some(p=>p.targetId===id),'diagnostics do not synthesize a spray hit beyond 145');
  const fired=firstDose(game,tissue(game,id));assert.equal(fired.preview.repairHint.reason,'out-of-range');assert.equal(tissue(game,id).attachmentProgress,0);
});

test('the visible ellipse edge heals although it lies outside the former 30-radius circle',()=>{
  const {game,id}=damageFixture();let t=tissue(game,id);
  safePoint(state(game),t,[[0,105],[0,-105],[100,0],[-100,0]],'ready',game,'precision');
  t=tissue(game,id);const from=state(game).player;
  const candidates=[{...t,x:t.x+50,y:t.y},{...t,x:t.x-50,y:t.y},{...t,x:t.x+42,y:t.y+15},{...t,x:t.x-42,y:t.y-15}];
  let edge;
  for(const p of candidates){
    const dx=p.x-from.x,dy=p.y-from.y,den=dx*dx+dy*dy,u=Math.max(0,Math.min(1,((t.x-from.x)*dx+(t.y-from.y)*dy)/den));
    if(distance(t,{x:from.x+dx*u,y:from.y+dy*u})<=31)continue;
    game.pointerMove(p);const ray=state(game).toolPreview;
    if(ray.repairHint?.reason==='ready'&&ray.targetId===id){edge=p;break;}
  }
  assert(edge,'a public aim point on the visible lateral vessel misses the old circular target');
  const fired=firstDose(game,edge);assert.equal(fired.preview.targetId,id);assert.equal(fired.preview.hitType,'treatment');
  const before=tissue(game,id).integrity;game.pointerDown({...edge,button:0});advance(game,.15);game.pointerUp();assert(tissue(game,id).integrity>before,'holding the edge aim restores measured integrity');
});

test('decorative windows and labels do not select tissue or create a repair target',()=>{
  const {game,id}=damageFixture();const t=tissue(game,id);moveTo(game,{x:t.x,y:t.y+105});equip(game,'precision');
  const decorations=[{x:t.x+78,y:t.y+8},{x:t.x+85,y:t.y+60}];
  for(const p of decorations){
    game.pointerMove(p);const preview=state(game).toolPreview;assert.equal(preview.repairHint,undefined,'outside the ellipse never selects a repair target');
    assert(!preview.targets.some(hit=>hit.targetId===id),'a ray that misses the ellipse cannot heal a window or badge');
    const before=tissue(game,id).integrity;firstDose(game,p);assert(tissue(game,id).integrity<=before);
  }
});

test('real boundary walls block distant repair rays without inventing extra reach',()=>{
  const {game,id}=damageFixture();const t=tissue(game,id),wall=state(game).obstacles.find(o=>o.id===(id==='main-tissue-l'?'main-rib-l':'main-rib-r'));
  const p={x:id==='main-tissue-l'?wall.x+wall.w-100:wall.x+100,y:wall.y-25};moveTo(game,p);equip(game,'precision');
  const preview=hint(game,tissue(game,id),'wall');assert(preview.blocked);assert.equal(preview.hitType,'wall');assert.notEqual(preview.targetId,id);
  assert.equal(preview.targetId,id==='main-tissue-l'?'main-rib-l':'main-rib-r','the remaining boundary tissue is the real obstruction');
  const before=tissue(game,id).integrity;firstDose(game,tissue(game,id));assert(tissue(game,id).integrity<=before,'diagnostic hint cannot bypass walls');
});

test('the expanded open space beside tissue permits actual repair without an invisible wall',()=>{
  const {game,id}=damageFixture();let t=tissue(game,id);
  const side=id==='main-tissue-l'?-1:1;
  safePoint(state(game),t,[[side*115,115],[side*75,95],[side*60,70]],'ready',game,'precision');
  t=tissue(game,id);const from=state(game).player;
  const openSpace={x:t.x+(side<0?-150:0),y:t.y+40,w:150,h:150};
  assert(overlaps(from,openSpace,0.1),'public movement reaches the open treatment space');
  const fired=firstDose(game,t);assert.equal(fired.preview.targetId,id);assert.equal(fired.preview.hitType,'treatment');assert(!fired.preview.blocked);
  const before=tissue(game,id).integrity;
  game.pointerDown({...t,button:0});advance(game,.15);game.pointerUp();
  assert(tissue(game,id).integrity>before,'a held shot from the former obstacle restores measured tissue integrity');
});

test('a foreground enemy still intercepts actual treatment and is identified in the repair hint',()=>{
  const {game,id}=damageFixture();let t=tissue(game,id);moveTo(game,{x:t.x,y:t.y+105});equip(game,'precision');game.pointerUp();advance(game,.21);let observed;
  for(let frame=0;frame<900&&!observed;frame++){
    assert(!state(game).failed,'observing a real attack line survives');game.pointerMove(tissue(game,id));const preview=state(game).toolPreview;
    if(preview.repairHint?.reason==='enemy'){observed=preview;break;}
    game.update(DT);
  }
  assert(observed,'actual attack movement can occupy the line in front of a wound');assert.equal(observed.hitType,'hunter');assert.notEqual(observed.targetId,id);
  const fired=firstDose(game,tissue(game,id),false);
  assert.equal(fired.preview.repairHint.reason,'enemy');const enemyBefore=fired.before.enemies.find(e=>e.id===fired.preview.targetId),enemyAfter=fired.after.enemies.find(e=>e.id===fired.preview.targetId);
  assert(enemyAfter.hp<enemyBefore.hp,'the dose hits the blocker instead of secretly healing through it');
});

test('spray really clears coating, then precision restores tissue and its measured flow',()=>{
  const {game,id,bot}=damageFixture({coated:true});let t=tissue(game,id);
  safePoint(state(game),t,[[0,95],[0,-95],[95,0],[-95,0]],'ready',game,'sprayer');
  const preview=hint(game,tissue(game,id),'ready');assert.equal(preview.repairHint.requiredTool,'sprayer');firstDose(game,tissue(game,id));
  bot.until(s=>!s.tissues.find(t=>t.id===id).attached,{tissueId:id,kill:false},15);
  t=tissue(game,id);const integrity=t.integrity;
  bot.until(s=>s.tissues.find(t=>t.id===id).integrity>integrity+2,{tissueId:id,kill:false},15);
  const repaired=tissue(game,id);assert(repaired.integrity>integrity);assert.equal(repaired.localFlow,repaired.integrity/repaired.maxIntegrity);
  equip(game,'sprayer');hint(game,repaired,repaired.integrity>=50?'healthy':'wrong-tool');
});

test('a fully repaired tissue can retain coating without pretending precision has more healing to do',()=>{
  const {game,id}=damageFixture({coated:true});let t=tissue(game,id);
  safePoint(state(game),t,[[0,100],[0,-100],[100,0],[-100,0]],'ready',game,'precision');
  press(game,'KeyR');advance(game,state(game).reloadDuration+.02);
  game.pointerDown({...t,button:0});
  for(let frame=0;frame<60*8&&tissue(game,id).integrity<tissue(game,id).maxIntegrity;frame++){
    assert(!state(game).failed,'repairing a coated tissue remains survivable');game.update(DT);
  }
  game.pointerUp();t=tissue(game,id);assert.equal(t.integrity,t.maxIntegrity);assert(t.attached,'direct healing does not require stripping the coating');
  const preview=hint(game,t,'healthy');assert.notEqual(preview.hitType,'treatment');assert(!preview.targets.some(p=>p.targetId===id&&p.hitType==='treatment'));
  assert.match(preview.repairHint.text,/无需修复|已完好|已修复|完整/,'full tissue explains that no more healing is needed');
  equip(game,'sprayer');advance(game,.21);safePoint(state(game),tissue(game,id),[[0,95],[0,-95],[95,0],[-95,0]],'ready',game,'sprayer');
  const cleaning=hint(game,tissue(game,id),'ready');assert.equal(cleaning.repairHint.requiredTool,'sprayer');
  const before=tissue(game,id).integrity;const delivered=firstDose(game,tissue(game,id),false);
  assert(tissue(game,id).attachmentProgress>0||!tissue(game,id).attached,'spray can still clean the remaining coating on fully repaired tissue: '+JSON.stringify({before:delivered.before.tissues.find(t=>t.id===id),after:tissue(game,id),ray:delivered.preview}));
  assert(tissue(game,id).integrity<=before,'spray does not fabricate additional healing');
});

test('each fresh trigger reports its current failure immediately, including a fast gun change and reload',()=>{
  const {game,id,events}=damageFixture({coated:true});let t=tissue(game,id);
  safePoint(state(game),t,[[0,295],[0,-295]],'out-of-range',game,'precision');t=tissue(game,id);
  let diagnostic=hint(game,t,'out-of-range').repairHint,count=events.feedback.length;
  game.pointerDown({...t,button:0});assert.equal(state(game).notice,diagnostic.text);assert.equal(events.feedback.length,count+1);
  game.pointerDown({...t,button:0});assert.equal(events.feedback.length,count+1,'holding the same trigger does not repeat diagnostics');
  equip(game,'sprayer');diagnostic=hint(game,tissue(game,id),'out-of-range').repairHint;count=events.feedback.length;
  game.pointerDown({...t,button:0});assert.equal(state(game).notice,diagnostic.text);assert.equal(events.feedback.length,count+1,'the old warning cooldown cannot hide the new distance reason');game.pointerUp();
  press(game,'KeyR');assert(state(game).reloadRemaining>0);diagnostic=hint(game,tissue(game,id),'reloading').repairHint;count=events.feedback.length;
  game.pointerDown({...t,button:0});assert.equal(state(game).notice,diagnostic.text);assert.equal(events.feedback.length,count+1,'reload is explained on initial press without waiting for a shot');game.pointerUp();
});

test('reload diagnostics freeze repair without inventing a hit or consuming another dose',()=>{
  const {game,id}=damageFixture();let t=tissue(game,id);
  safePoint(state(game),t,[[0,100],[0,-100],[100,0],[-100,0]],'ready',game,'precision');firstDose(game,tissue(game,id));
  press(game,'KeyR');assert(state(game).reloadRemaining>0);t=tissue(game,id);const preview=hint(game,t,'reloading');
  const before=state(game);game.pointerDown({...t,button:0});advance(game,.2);game.pointerUp();const after=state(game);
  assert.equal(after.ammo,before.ammo);assert(tissue(game,id).integrity<=t.integrity,'reload cannot deliver new paid repair');
  assert.equal(preview.hitType,'treatment','the hint reports readiness independently of first-entity geometry');
  assert.equal(preview.targetId,id);
});

if(require.main===module){console.log(`Repair regression: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;}
module.exports={damageFixture};
