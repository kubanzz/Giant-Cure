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
  const file = path.join(destination, 'v2-' + name + '.png'); fs.writeFileSync(file, image.toBuffer('image/png'));
  const summary = { name, file, stage: snapshot.stage, tool: snapshot.tool, elapsed: Number(snapshot.elapsed.toFixed(2)), failed: snapshot.failed };
  assert(!snapshot.failed, 'visual route survives: ' + name); captures.push(summary); console.log(JSON.stringify(summary));
}
function readyCartridge(game) { game.clearInput(); press(game, 'KeyR'); advance(game, (state(game).reloadDuration || 1.7) + .02); }

async function main() {
  fs.mkdirSync(destination, { recursive: true });
  const font = 'C:/Windows/Fonts/msyh.ttc'; if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'Microsoft YaHei');
  const images = Object.fromEntries(await Promise.all(['entry', 'main', 'heart'].map(async name => [name, await loadImage(path.join(root, 'assets', 'heart-journey', name + '.png'))])));
  sandbox.window.GiantCureAssets = { images };
  const { game } = fresh();

  moveTo(game, { x: state(game).chest.x + 55, y: state(game).chest.y + 20 });
  capture(game, 'medical-chest', '可选医疗箱：不领取也可继续主流程', { x: 650, y: 600, zoom: 1.1 });
  moveTo(game, node(game, 'pressure')); scan(game); advance(game, .6);
  assert(state(game).scanTargets.some(target => target.id === 'pressure' && target.progress > 0 && !target.complete));
  capture(game, 'entry-scan', '静态扫描：读取中的范围与进度', { x: 1030, y: 620, zoom: 1.1 });
  diagnose(game, false); capture(game, 'branches', '局部堵塞：左右侧支可选，左侧有组织掩体', { x: 800, y: 450, zoom: .78 });
  clearInterference(game); equip(game, 'precision'); scan(game, false); readyCartridge(game);
  let target = branch(game, 'left'); moveTo(game, { x: target.x, y: target.y + 90 }); game.pointerDown({ ...target, button: 0 }); advance(game, 1.2);
  capture(game, 'branch-treatment', '精准治疗：侧支堵塞正在缩小', { x: 480, y: 340, zoom: 1.1 });
  advance(game, target.duration + .1); game.pointerUp(); assert(branch(game, 'left').complete);
  advance(game, .8); assert.equal(supply(game, 'lysis').state, 'transit');
  capture(game, 'supply-transit', '外部支援：补给沿实际恢复的侧支运输', { x: 440, y: 500, zoom: .9 });
  for(let frame=0;frame<300&&supply(game,'lysis').state!=='ready';frame++)game.update(1/60);
  assert.equal(supply(game,'lysis').state,'ready');
  capture(game, 'supply-ready', '运输抵达：可见胶囊等待领取', { x: 480, y: 340, zoom: 1.1 });
  collectSupply(game, 'lysis'); capture(game, 'supply-collected', '裂解工具已领取，侧支保持贯通', { x: 480, y: 340, zoom: 1.1 });
  clearInterference(game); equip(game, 'sprayer'); readyCartridge(game);
  target = state(game).weakpoints.find(item => item.id === 'W1'); moveTo(game, weakpointPosition(game, target.id));
  game.pointerDown({ ...target, button: 2 }); game.pointerDown({ ...target, button: 0 }); advance(game, .9);
  assert(state(game).toolPreview.fanPoints.length >= 9); assert(state(game).weakpoints.find(item => item.id === 'W1').progress > 0);
  capture(game, 'spray-fiber', '喷雾裂解：扇形轮廓来自同一遮挡查询', { x: 800, y: 380, zoom: 1.1 }); game.clearInput();
  soften(game, 'W1'); soften(game, 'W2'); target = state(game).weakpoints.find(item => item.id === 'W3'); assert(target.exposed);
  equip(game, 'precision'); moveTo(game, weakpointPosition(game, target.id)); readyCartridge(game); game.pointerDown({ ...target, button: 2 }); game.pointerDown({ ...target, button: 0 }); advance(game, .7);
  capture(game, 'core-exposed', '两层已裂解：核心暴露并接受精准治疗', { x: 800, y: 420, zoom: 1.1 }); game.clearInput();
  soften(game, 'W3'); route.interact(game, node(game, 'release')); advance(game, 4.1); enterHeart(game); clearInterference(game);
  moveTo(game, { x: state(game).fault.x, y: state(game).fault.y + 90 }); scan(game); advance(game, 1.4);
  assert(state(game).fault.scanned); advance(game, 1.1);
  capture(game, 'conduction-before', '被动采样：上游有脉冲，故障后方无输出', { x: 920, y: 700, zoom: .92 });
  collectSupply(game, 'probe'); equip(game, 'probe'); moveTo(game, { x: state(game).fault.x, y: state(game).fault.y + 90 }); scan(game, false); readyCartridge(game);
  game.pointerDown({ ...state(game).fault, button: 2 }); game.pointerDown({ ...state(game).fault, button: 0 }); advance(game, .8);
  capture(game, 'conduction-repair', '修复探针：处理中断段，不连接采样点', { x: 1040, y: 670, zoom: 1.1 });
  advance(game, state(game).fault.duration + .1); game.clearInput(); assert(state(game).fault.complete);
  for (let frame = 0; frame < 480 && state(game).conductionSignal.verifiedBeats < 1; frame++) game.update(1 / 60);
  assert(state(game).conductionSignal.verifiedBeats >= 1); assert(!state(game).dashUnlocked);
  capture(game, 'conduction-restored', '实际脉冲抵达下游：复苏中进行三拍复测', { x: 900, y: 680, zoom: .92 });
  console.log(`Standalone Canvas visual route rendered ${captures.length} images. No DOM/browser or human playtest was performed.`);
}

if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { main };
