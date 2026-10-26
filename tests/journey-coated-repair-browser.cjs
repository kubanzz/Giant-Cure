'use strict';
// Real Chrome and public keyboard/pointer input only. Snapshots observe the
// actual projectile impact, repair and cleaning; no combat state is injected.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const h = require('./journey-browser-helpers.cjs');
const { distance, crosses, overlaps } = require('./journey-navigation.cjs');
const { snapshot, game, tick, setup, start, diagnose, connectBypasses, moveTo, equip, scan, mouseAt, capture } = h;
const errors = [], requests = [], checks = [];
const entryHash = () => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'index.html'))).digest('hex');
let browser, page, phase = 'setup', diagnosticBusy = false;
const diagnostics = setInterval(async () => {
  if (diagnosticBusy || !page || page.isClosed()) return;
  diagnosticBusy = true;
  try {
    const s = await game(page);
    console.log(`INFO coated repair: ${phase}; ${s.room}/${s.stage} t=${s.elapsed.toFixed(1)} health=${s.integrity} stability=${s.organStability.toFixed(1)} tissues=${s.tissues.map(t=>t.id+':'+t.integrity.toFixed(1)+(t.attached?' covered':'')).join(',')}`);
  } catch {} finally { diagnosticBusy = false; }
}, 30000);
diagnostics.unref();
function tissue(s, id) { const t = s.tissues.find(t=>t.id===id); assert(t, 'observed tissue exists'); return t; }
function pass(name) { checks.push(name); console.log('PASS coated repair: ' + name); }
async function surviveTick(ms = 32) {
  const s = await game(page);
  const danger=s.enemies.find(e=>e.hp>0&&e.targetKind==='player'&&['telegraph','lunge'].includes(e.state)&&distance(e,s.player)<300);
  if(danger&&s.dashCooldown<=0) {
    const key=s.player.x<(s.bounds.left+s.bounds.right)/2?'KeyD':'KeyA';
    await page.keyboard.down(key); await page.keyboard.press('Space'); await page.keyboard.up(key);
  }
  await tick(page,ms); assert(!(await game(page)).failed,'native coating fixture survives');
}
async function waitForCoating() {
  for(let frame=0;frame<1000;frame++) {
    const before=await game(page);
    await surviveTick();
    const after=await game(page);
    const hit=after.tissues.find(t=>t.attached&&!tissue(before,t.id).attached);
    if(hit) {
      const projectile=before.projectiles.find(p=>p.targetKind==='tissue'&&p.targetId===hit.id&&p.remaining<=.05);
      assert(projectile,'new coating is caused by an observed real tissue projectile');
      assert(hit.integrity<tissue(before,hit.id).integrity,'projectile visibly damages the tissue');
      return hit.id;
    }
  }
  assert.fail('a real weaver projectile coats a tissue before the fixture deadline');
}
async function readyPose(id,tool) {
  await page.mouse.up(); await equip(page,tool);
  const s=await game(page),t=tissue(s,id),range=tool==='sprayer'?110:150;
  const candidates=[Math.PI/2,0,Math.PI,-Math.PI/2,Math.PI/4,Math.PI*3/4].map(a=>({x:t.x+Math.cos(a)*range,y:t.y+Math.sin(a)*range}))
    .filter(p=>p.x>s.bounds.left+25&&p.x<s.bounds.right-25&&p.y>s.bounds.top+25&&p.y<s.bounds.bottom-25&&!s.obstacles.some(w=>w.blocking!==false&&(overlaps(p,w,20)||crosses(p,t,w))))
    .sort((a,b)=>distance(a,s.player)-distance(b,s.player));
  for(const p of candidates) {
    await moveTo(page,p,8,true); await mouseAt(page,tissue(await game(page),id));
    const ray=(await game(page)).toolPreview;
    if(ray.repairHint?.targetId===id&&['ready','healthy'].includes(ray.repairHint.reason))return;
  }
  assert.fail('public movement reaches an unobstructed '+tool+' repair pose');
}
async function firstDose(id,expected) {
  await page.mouse.up();
  let s=await game(page); if(s.reloadRemaining>0)await tick(page,s.reloadRemaining*1000+32);
  await tick(page,220); await mouseAt(page,tissue(await game(page),id));
  const before=await game(page),ray=before.toolPreview;
  assert.equal(ray.repairHint?.reason,expected);
  await page.mouse.down(); await tick(page,16);
  const after=await game(page); assert(after.shot,'a native trigger delivers a dose');
  for(const field of ['hitType','targetId','tool','blocked','treatmentKind'])assert.equal(after.shot[field],ray[field],'actual dose matches its preview: '+field);
  // A native pointer-down repeats screen-to-world conversion while the camera
  // settles, so allow subpixel input rounding while requiring identical hits.
  assert(distance(after.shot.to,ray.to)<1.5,'actual beam ends at the predicted first impact within native input rounding');
  assert.equal(after.shot.targets.length,ray.targets.length,'actual fan/beam keeps its predicted target count');
  after.shot.targets.forEach((hit,index)=>{
    const predicted=ray.targets[index];
    for(const field of ['hitType','targetId','tool','blocked','treatmentKind'])assert.equal(hit[field],predicted[field],'predicted target agrees: '+field);
    assert(distance(hit.to,predicted.to)<1.5,'predicted target impact agrees within native input rounding');
  });
  assert.equal(after.ammo,before.ammo-1,'one actual dose spends one cartridge unit');
  return {before,after,ray};
}
(async()=>{
  const testedEntry=entryHash();
  const launch={headless:true};if(process.env.CHROME_PATH)launch.executablePath=process.env.CHROME_PATH;
  browser=await chromium.launch(launch);
  const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1});
  page=await setup(context,errors,requests);
  phase='native entry and supply'; await start(page); await diagnose(page); await connectBypasses(page,'right');
  await scan(page,false); const vessel=(await game(page)).tissues[1];await moveTo(page,{x:vessel.x,y:vessel.y+95},10,true);
  phase='observe actual coating projectile'; const id=await waitForCoating();
  pass('a real weaver projectile damages and coats a maintenance tissue');

  phase='precision repairs through coating'; await readyPose(id,'precision');
  let target=tissue(await game(page),id);assert(target.attached);assert(target.integrity<target.maxIntegrity);
  const fired=await firstDose(id,'ready');
  assert.equal(fired.ray.hitType,'treatment');assert.equal(fired.ray.targetId,id);
  assert.equal(fired.ray.repairHint.requiredTool,'precision');
  await tick(page,160);
  let repaired=tissue(await game(page),id);
  assert(repaired.integrity>tissue(fired.before,id).integrity,'1 restores actual integrity while coating is present');
  assert(repaired.attached,'precision repair does not silently clear coating');
  assert(repaired.repairing,'coated precision repair publishes the live stitching state');
  assert.equal(repaired.localFlow,repaired.integrity/repaired.maxIntegrity,'measured perfusion rises with actual repair');
  await capture(page,'coated-precision-repair');
  pass('1 directly repairs coated tissue; preview, delivered dose and perfusion agree');

  phase='full coated tissue is healthy for precision';
  for(let frame=0;frame<220;frame++) {
    const s=await game(page);target=tissue(s,id);assert(!s.failed);assert(target.attached,'coating remains a separate cleaning task');
    if(target.integrity>=target.maxIntegrity)break;
    await mouseAt(page,target);await tick(page,32);
  }
  await page.mouse.up();target=tissue(await game(page),id);assert.equal(target.integrity,target.maxIntegrity);assert(target.attached);
  const healthy=await firstDose(id,'healthy');
  assert.notEqual(healthy.ray.targetId,id,'full coated tissue is not a precision treatment endpoint');
  assert(!healthy.ray.targets.some(t=>t.targetId===id&&t.hitType==='treatment'),'full tissue never produces a fake healing target');
  await page.mouse.up();
  pass('1 reports no repair needed for full tissue even while coating remains');

  phase='spray cleans without healing';await readyPose(id,'sprayer');
  const spray=await firstDose(id,'ready');assert.equal(spray.ray.repairHint.requiredTool,'sprayer');assert.equal(spray.ray.hitType,'treatment');
  let sawProgress=tissue(spray.after,id).attachmentProgress>tissue(spray.before,id).attachmentProgress,cleared=false;
  let previous=tissue(spray.before,id);
  for(let frame=0;frame<140;frame++) {
    const s=await game(page),current=tissue(s,id);assert(!s.failed);
    assert(current.integrity<=previous.integrity+1e-7,'2 never restores tissue integrity');
    sawProgress ||= current.attachmentProgress>0;
    if(!current.attached){cleared=true;break;}
    previous=current;await mouseAt(page,current);await tick(page,32);
  }
  await page.mouse.up();assert(sawProgress,'spray applies measured cleaning progress');assert(cleared,'continuous spray removes actual coating');
  await capture(page,'coated-spray-cleared');
  pass('2 still removes coating and contributes no healing');
  assert.deepEqual(errors,[],'no browser runtime errors');assert.deepEqual(requests,[],'offline game makes no external requests');
  assert.equal(entryHash(),testedEntry,'the tested offline build remains identical throughout this suite');
  console.log(`\n${checks.length} coated-repair browser checks passed; no state injection, runtime errors or external requests.`);
})().catch(async error=>{
  console.error(error.stack||error);
  if(page&&!page.isClosed()) {console.error('Last snapshot:',JSON.stringify(await snapshot(page)).slice(0,18000));await capture(page,'coated-repair-failure');}
  process.exitCode=1;
}).finally(async()=>{clearInterval(diagnostics);if(browser)await browser.close();});
