'use strict';
// Standalone native Canvas visual checks. These are controller-driven images,
// not browser/DOM screenshots and not evidence of a novice player's experience.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
function loadCanvas() {
  if(process.env.CANVAS_PATH)return require(process.env.CANVAS_PATH);
  try{return require('@napi-rs/canvas');}
  catch{return require(path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','@napi-rs','canvas'));}
}
const { createCanvas, loadImage, GlobalFonts } = loadCanvas();
const route = require('./journey-controllers.cjs');
const { sandbox, state, fresh, advance, press, scan, equip, moveTo, node, diagnose,
  clearInterference, branch, supply, collectSupply, weakpointPosition, soften, enterHeart } = route;
const root = path.join(__dirname, '..');
const destination = path.join(__dirname, 'screenshots');
const captures = [];

function capture(game, name, title, camera) {
  const snapshot = state(game), before = JSON.stringify(snapshot), image = createCanvas(1280, 720), context = image.getContext('2d');
  context.fillStyle = '#f7f6ed'; context.fillRect(0, 0, 1280, 720);
  context.textBaseline = 'middle'; context.fillStyle = '#315e50'; context.font = '22px "Microsoft YaHei"'; context.fillText(title, 28, 30);
  context.font = '11px "Microsoft YaHei"'; context.fillStyle = '#76846b'; context.fillText('独立 Canvas 观测 · 无 DOM · 非浏览器或真人试玩', 28, 61);
  context.textAlign = 'right'; context.fillText(`${snapshot.roomLabel} / ${snapshot.stage} / ${snapshot.elapsed.toFixed(1)}s`, 1252, 61); context.textAlign = 'left';
  game.draw(context, snapshot.elapsed, { viewport: { x: 24, y: 84, w: 1232, h: 552 }, camera: camera || { ...snapshot.player, zoom: 1.1 }, reducedMotion: false });
  context.textAlign = 'left'; context.fillStyle = '#315e50'; context.font = '16px "Microsoft YaHei"'; context.fillText(snapshot.task, 28, 665, 1224);
  context.font = '12px "Microsoft YaHei"'; context.fillStyle = '#76846b';
  context.fillText(`工具 ${snapshot.tool} · 耐久 ${snapshot.integrity} · 药剂 ${snapshot.ammo}/24 · 扫描 ${snapshot.scanner ? '开' : '关'} · 本图仅验证世界绘制`, 28, 695);
  assert.equal(JSON.stringify(state(game)), before, 'rendering leaves the simulation unchanged');
  const file = path.join(destination, 'v3-' + name + '.png'); fs.writeFileSync(file, image.toBuffer('image/png'));
  const summary = { name, file, stage: snapshot.stage, tool: snapshot.tool, elapsed: Number(snapshot.elapsed.toFixed(2)), failed: snapshot.failed };
  assert(!snapshot.failed, 'visual route survives: ' + name); captures.push(summary); console.log(JSON.stringify(summary));
}
function readyCartridge(game) { game.clearInput(); press(game, 'KeyR'); advance(game, (state(game).reloadDuration || 1.7) + .02); }

async function main() {
  fs.mkdirSync(destination, { recursive: true });
  const font = 'C:/Windows/Fonts/msyh.ttc'; if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'Microsoft YaHei');
  const images = Object.fromEntries(await Promise.all(['entry', 'main', 'heart'].map(async name => [name, await loadImage(path.join(root, 'assets', 'heart-journey', name + '.png'))])));
  sandbox.window.GiantCureAssets = { images };
  const entry=fresh().game;
  const lesion=state(entry).entryLesion,entryCamera={x:lesion.x-70,y:lesion.y+10,zoom:1.1};
  capture(entry,'entry-rescue','入口救治：先查明局部供血不足的原因',entryCamera);
  moveTo(entry,node(entry,'pressure'));scan(entry);advance(entry,.6);
  capture(entry,'entry-scan','Q 只读取当前病例，诊断结果进入暂停报告',entryCamera);
  route.acknowledgeDiagnosis(entry);scan(entry,false);equip(entry,'precision');moveTo(entry,{x:lesion.x,y:lesion.y+90});entry.pointerDown({...lesion,button:0});advance(entry,.6);
  capture(entry,'entry-treatment','精准枪解除凝块：治疗进度与组织反应一致',entryCamera);advance(entry,1.1);entry.clearInput();assert(state(entry).entryLesion.complete);
  capture(entry,'entry-restored','局部灌流恢复，深处高压仍需继续追查',entryCamera);

  const branchGame=fresh().game;diagnose(branchGame);capture(branchGame,'branches','选择一条侧支，同时准备保护两处灌流组织',{x:1100,y:730,zoom:.6});
  readyCartridge(branchGame);let target=branch(branchGame,'left');moveTo(branchGame,{x:target.x,y:target.y+90});scan(branchGame,false);branchGame.pointerDown({...target,button:0});advance(branchGame,1.2);
  capture(branchGame,'branch-treatment','治疗开始：病灶激活，先警示保护目标',{x:target.x+160,y:target.y+100,zoom:1.1});advance(branchGame,3);branchGame.pointerUp();assert(branch(branchGame,'left').complete);
  advance(branchGame,.6);capture(branchGame,'supply-transit','恢复的侧支运来裂解工具',{...supply(branchGame,'lysis'),zoom:.9});
  while(supply(branchGame,'lysis').state!=='ready')branchGame.update(1/60);
  capture(branchGame,'supply-ready','医疗胶囊抵达，靠近按 E 领取',{...supply(branchGame,'lysis'),zoom:1.1});collectSupply(branchGame,'lysis');
  assert.equal(state(branchGame).tool,'precision');capture(branchGame,'supply-collected','新工具已入库，保留当前枪械等待玩家主动选择',{...state(branchGame).player,zoom:1.1});

  const treatment=fresh().game;diagnose(treatment);route.connectBypasses(treatment);clearInterference(treatment);route.repairTissues(treatment,70);
  target=state(treatment).weakpoints.find(p=>p.id==='W1');equip(treatment,'sprayer');moveTo(treatment,weakpointPosition(treatment,'W1'));scan(treatment,false);treatment.pointerDown({...target,button:0});
  for(let frame=0;frame<240&&state(treatment).weakpoints.find(p=>p.id==='W1').progress<.25;frame++)treatment.update(1/60);
  assert(state(treatment).weakpoints.find(p=>p.id==='W1').progress>0);capture(treatment,'spray-fiber','2 裂解纤维：扇形范围读取真实遮挡',{...state(treatment).clot,zoom:1.1});treatment.clearInput();

  const core=fresh().game;diagnose(core);route.connectBypasses(core);soften(core,'W1');soften(core,'W2');
  target=state(core).weakpoints.find(p=>p.id==='W3');assert(target.exposed);equip(core,'precision');moveTo(core,weakpointPosition(core,'W3'));core.pointerDown({...target,button:0});advance(core,.6);
  capture(core,'core-exposed','外层剥落：换 1 精准枪治疗暴露核心',{...state(core).clot,zoom:1.1});core.clearInput();

  const damaged=fresh().game;diagnose(damaged);route.connectBypasses(damaged,'right');
  for(let frame=0;frame<900&&state(damaged).organStability>=90;frame++)damaged.update(1/60);
  assert(state(damaged).organStability<100);capture(damaged,'tissue-damaged','组织实际受损：裂口、漏流、灯窗与稳定度共同变化',{x:1100,y:1000,zoom:1});

  const game=route.toFlow().game;capture(game,'flow-restored','主流冲走病灶与余敌，组织恢复稳定',{x:1100,y:730,zoom:.6});enterHeart(game);
  capture(game,'heart-districts','西区纤维与东区凝块：自主决定先救哪一区',{x:1300,y:1010,zoom:.64});
  const west=state(game).heartSectors.find(s=>s.id==='heart-west');route.discover(game,west);collectSupply(game,'probe');
  capture(game,'conduction-before','两区病因不同，清除病灶后接通传导',{x:west.x,y:west.y+80,zoom:1});
  route.treatHeartSector(game,'heart-west');
  assert(state(game).heartSectors.find(s=>s.id==='heart-west').complete);
  assert(!state(game).heartSectors.find(s=>s.id==='heart-east').complete);
  capture(game,'conduction-repair','西区先复苏：局部来源停止，金色传导与居民灯火恢复',{x:west.x,y:west.y+80,zoom:1});
  route.treatHeartSector(game,'heart-east');
  if(state(game).stage!=='recovery')route.repairTissues(game,80);
  advance(game,.02);assert.equal(state(game).stage,'recovery');
  capture(game,'conduction-restored','双区恢复后，由玩家主动发出三次验证脉冲',{x:1300,y:700,zoom:.85});
  const sync=state(game).syncCore;equip(game,'probe');scan(game,false);moveTo(game,{x:sync.x,y:sync.y+110});readyCartridge(game);
  for(let beat=0;beat<3;beat++){
    const before=state(game).conductionSignal.verifiedBeats;
    game.pointerDown({...sync,button:0});advance(game,.02);game.pointerUp();
    if(beat===0)capture(game,'sync-pulse-travel','点击核心发出真实脉冲，抵达前不计为验证成功',{...sync,zoom:1.1});
    for(let frame=0;frame<240&&state(game).conductionSignal.verifiedBeats===before;frame++)game.update(1/60);
    assert.equal(state(game).conductionSignal.verifiedBeats,before+1);
    if(beat===0)capture(game,'sync-first-verified','第一拍真实抵达下游，点亮一枚确认标记',{...sync,zoom:1.1});
    advance(game,.24);
  }
  for(let frame=0;frame<300&&!state(game).heartStable;frame++)game.update(1/60);
  assert(state(game).heartStable);capture(game,'heart-stable','三拍复测通过，心腔全部亮起，撤离通道开放',{x:1300,y:680,zoom:.85});
  console.log(`Standalone Canvas visual route rendered ${captures.length} images. No DOM/browser or human playtest was performed.`);
}

if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { main };
