'use strict';
// Isolated Canvas layout fixtures derived from a public controller snapshot.
// These pictures exercise dense render states; they are not browser screenshots
// or evidence that a player reached this arrangement during a real playthrough.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const route = require('./journey-controllers.cjs');
function loadCanvas() {
  if (process.env.CANVAS_PATH) return require(process.env.CANVAS_PATH);
  try { return require('@napi-rs/canvas'); }
  catch { return require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', '@napi-rs', 'canvas')); }
}
const { createCanvas, loadImage, GlobalFonts } = loadCanvas();
const root = path.join(__dirname, '..');
const destination = path.join(__dirname, 'screenshots');
const viewport = { x: 24, y: 84, w: 1232, h: 552 };
const camera = { x: 1100, y: 950, zoom: 1 };
// Portal arrows and the spawn exclamation mark are visual glyphs, not badges.
const graphicGlyphs = new Set(['↗', '·', '!', '✓', '◎', '≈']);
let passed = 0, failed = 0;
const clone = value => JSON.parse(JSON.stringify(value));
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
function test(name, run) {
  try { run(); passed++; console.log('PASS labels: ' + name); }
  catch (error) { failed++; console.error('FAIL labels: ' + name + '\n' + error.stack); }
}
function project(point, view) {
  return { x: view.viewport.x + view.viewport.w / 2 + (point.x - view.camera.x) * view.camera.zoom,
    y: view.viewport.y + view.viewport.h / 2 + (point.y - view.camera.y) * view.camera.zoom };
}
function overlaps(a, b, padding = 0) { return Math.abs(a.x - b.x) < a.half + b.half + padding && Math.abs(a.y - b.y) < a.hh + b.hh + padding; }
function capture(scene, name, options = {}) {
  const image = createCanvas(1280, 720), native = image.getContext('2d'), texts = [];
  const view = { viewport, camera, ...options };
  native.fillStyle = '#f7f6ed'; native.fillRect(0, 0, 1280, 720);
  native.fillStyle = '#315e50'; native.font = '21px "Microsoft YaHei"';
  native.fillText('三图简洁标签 · ' + name, 28, 34);
  native.font = '12px "Microsoft YaHei"'; native.fillStyle = '#76846b';
  native.fillText('独立 Canvas 绘图场景 · 基于只读快照构造 · 非浏览器或实际游玩记录', 28, 64);
  const context = new Proxy(native, {
    get(target, key) {
      if (key === 'fillText') return (value, x, y, ...args) => {
        const matrix = target.getTransform(), size = Number((target.font.match(/([\d.]+)px/) || [0, 14])[1]);
        if (!graphicGlyphs.has(String(value))) texts.push({ value: String(value), x: matrix.a * x + matrix.c * y + matrix.e,
          y: matrix.b * x + matrix.d * y + matrix.f, half: Math.max(19, target.measureText(String(value)).width / 2 + 11), hh: (size + 14) / 2 });
        target.fillText(value, x, y, ...args);
      };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  const before = JSON.stringify(scene);
  route.sandbox.window.GiantCureJourneyArt.draw(context, frozen(scene), scene.elapsed, view);
  assert.equal(JSON.stringify(scene), before, 'rendering leaves the fixture unchanged');
  native.font = '12px "Microsoft YaHei"'; native.fillStyle = '#76846b';
  native.fillText('场内文字 ' + texts.length + ' 条 · Q ' + (scene.scanner ? '开' : '关'), 28, 674);
  if (name) fs.writeFileSync(path.join(destination, 'v3-labels-' + name + '.png'), image.toBuffer('image/png'));
  return { texts, view, pixel:(x,y)=>Array.from(native.getImageData(Math.round(x),Math.round(y),1,1).data) };
}
function assertReadable(result, scene) {
  const { texts, view } = result, p = view.viewport;
  for (let i = 0; i < texts.length; i++) {
    const item = texts[i];
    assert(item.x - item.half >= p.x && item.x + item.half <= p.x + p.w, 'badge stays horizontally in the viewport');
    assert(item.y - item.hh >= p.y && item.y + item.hh <= p.y + p.h, 'badge stays vertically in the viewport');
    for (const other of texts.slice(i + 1)) assert(!overlaps(item, other), 'badges never overlap one another');
    const bodies = [{ ...scene.player, half: 20, hh: 34 }, ...scene.enemies.map(e => ({ ...e, half: 25, hh: 30 })),
      ...scene.tissues.map(t => ({ ...t, half: t.hitArea.rx, hh: t.hitArea.ry })),
      ...(scene.room==='main'&&!scene.clot.removed ? [{ ...scene.clot, half: scene.clot.radius, hh: 110 }] : [])];
    for (const body of bodies) {
      const screen = project(body, view);
      assert(!overlaps(item, { ...screen, half: body.half * view.camera.zoom, hh: body.hh * view.camera.zoom }), 'badge avoids character or important tissue silhouette: ' + item.value);
    }
  }
}
function focused(scene, id = 'main-tissue-l', reason = 'ready') {
  const s = clone(scene), t = s.tissues.find(t => t.id === id);
  Object.assign(s, { reloadRemaining: 0, reloadProgress: 0, reloadStage: 'idle', ammo: 16 });
  s.aim = { x: t.x, y: t.y };
  s.toolPreview = { ...s.toolPreview, hitType: 'treatment', targetId: id, to: { x: t.x, y: t.y },
    repairHint: { targetId: id, target: { x: t.x, y: t.y }, reason, requiredTool: 'sprayer', text: '可以清除 · 按住左键喷掉覆盖物' } };
  return s;
}
async function main() {
  fs.mkdirSync(destination, { recursive: true });
  const font = 'C:/Windows/Fonts/msyh.ttc'; if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'Microsoft YaHei');
  route.sandbox.window.GiantCureAssets = { images: Object.fromEntries(await Promise.all(['entry', 'main', 'heart'].map(async name => [name, await loadImage(path.join(root, 'assets', 'heart-journey', name + '.png'))]))) };
  const { game } = route.fresh();
  const simulationBefore = JSON.stringify(route.state(game));
  const scene = clone(route.state(game));
  Object.assign(scene, { room:'main',roomLabel:'主血管',worldSize:{width:2200,height:1400},bounds:{left:80,right:2120,top:80,bottom:1320},
    scanner: false, scanOn: false, scanFocusId:null, precision: false, nearestId: null, guidance: null, elapsed: 12.4,
    stage: 'clot', tool: 'sprayer', player: { ...scene.player, x: 1100, y: 1090 }, aim: { x: 1100, y: 1250 },
    nodes:[{id:'release',x:1100,y:1170,label:'主流阀',kind:'release'}],paths:[],obstacles:[],valves:[],portals:[],
    ammo: 4, reloadRemaining: .8, reloadProgress: .5, reloadStage: 'insert', shot: null });
  scene.defense.active = true; scene.defense.closed = false;
  scene.tissues = [{id:'main-tissue-l',x:800,y:900,label:'西侧组织'},{id:'main-tissue-r',x:1400,y:900,label:'东侧组织'}]
    .map((t,index)=>({...t,room:'main',radius:30,hitArea:{rx:60,ry:30},maxIntegrity:50,integrity:index?20:10,attached:true,attachmentProgress:.24,localFlow:index?.4:.2}));
  scene.enemies = [
    { id: 501, type: 'weaver', room: 'main', x: 800, y: 1060, hp: 9, state: 'cast', telegraph: .65, targetId: 'main-tissue-l', targetKind: 'tissue', target: { x: 800, y: 900 } },
    { id: 502, type: 'coagulator', room: 'main', x: 1400, y: 1060, hp: 9, state: 'telegraph', telegraph: .4, targetId: 'main-tissue-r', targetKind: 'tissue', target: { x: 1400, y: 900 } }
  ];
  scene.toolPreview = { from: { ...scene.player }, to: { x: 800, y: 815 }, targets: [], fanPoints: [], angle: Math.PI / 3, tool: 'sprayer', hitType: 'none', targetId: null, blocked: false, label: '射程内无目标' };
  scene.spawnTelegraphs = [{ id: 900, x: 1500, y: 850, type: 'weaver', progress: .5 }];
  test('normal combat has no passive teaching, damage, spawn or reload labels', () => {
    const result = capture(clone(scene), 'normal'); assert.equal(result.texts.length, 0);
  });
  test('aiming a coated repair point produces one short action', () => {
    const s = focused(scene), result = capture(s, 'aim');
    assert.equal(result.texts.length, 1, 'focus is visible once, without a duplicate tissue badge');
    assert.match(result.texts[0].value, /^2 清纤维 · 10\/50$/); assertReadable(result, s);
  });
  test('repair causes stay concise and never copy long world explanations', () => {
    for (const [reason, text, hitType, targetId] of [
      ['out-of-range', '喷头距离不足 · 再靠近这段血管', 'none', null],
      ['wrong-tool', '裂口需要 1 精准枪 · 2 喷头只清除纤维', 'ineffective', 'main-tissue-l'],
      ['wall', '被组织墙挡住 · 绕到裂口同侧再治疗', 'wall', 'main-rib-l'],
      ['enemy', '敌人挡住治疗 · 先清除前方敌人或换个角度', 'hunter', 502]
    ]) {
      const s = focused(scene, 'main-tissue-l', reason);
      s.toolPreview.repairHint.text = text; s.toolPreview.hitType = hitType; s.toolPreview.targetId = targetId;
      if (reason === 'wrong-tool') s.tissues[0].attached = false;
      const result = capture(s, null);
      assert.equal(result.texts.length, 1, 'repair diagnostic has priority over the first-ray blocker: ' + reason);
      assert(!result.texts[0].value.includes(text), 'the full controller diagnosis belongs in the report: ' + reason);
      assert(result.texts[0].value.length<=17, 'only a short actionable hint stays in the world');
      assertReadable(result, s);
    }
  });
  test('a focused target and the nearest E action fit the ordinary two-label budget', () => {
    const s = focused(scene); s.nearestId = 'release';
    const result = capture(s, 'interaction'); assert.equal(result.texts.length, 2);
    assert.equal(result.texts.filter(t => /E/.test(t.value)).length, 1, 'E is merged with its target instead of being a second badge');
    assertReadable(result, s);
  });
  test('Q names only the scan focus and nearest E action', () => {
    const s = focused(scene); s.scanner = s.scanOn = true;s.scanFocusId='main-tissue-l';s.nearestId='release';
    s.scanTargets=s.tissues.map(t=>({...t,progress:.35,complete:false,inRange:true}));
    const result = capture(s, 'scan'); assert.equal(result.texts.length,2);
    assert.equal(result.texts.filter(t=>/扫描 35%/.test(t.value)).length,1);
    assert(!result.texts.some(t=>/东侧|投射|恢复期|按住左键/.test(t.value)), 'other nearby anatomy and enemies remain visual');
    assertReadable(result, s);
  });
  test('insufficient viewport space drops labels instead of forcing overlap', () => {
    const s = focused(scene); s.scanner = true; s.nearestId = 'release';
    const result = capture(s, null, { viewport: { x: 24, y: 84, w: 100, h: 70 }, camera: { x: 800, y: 900, zoom: .1 } });
    assert.equal(result.texts.length, 0, 'no full information badge fits this viewport');
  });
  test('hideLabels suppresses the new centralized labels as well', () => {
    const s = focused(scene); s.scanner = true; s.nearestId = 'release';
    assert.equal(capture(s, null, { hideLabels: true }).texts.length, 0);
  });
  test('all three rooms use the same two-label ceiling without decorative descriptions', () => {
    for(const room of ['entry','main','heart']){
      const s=focused(scene);s.room=room;s.scanner=false;s.reloadRemaining=0;s.toolPreview={...s.toolPreview,repairHint:null,hitType:'wall',targetId:'decorative-wall'};
      s.nearestId=null;s.nodes.push({id:'decoration',x:1100,y:1000,label:'实体组织阻挡工具',kind:'diagnostic',complete:true});
      const result=capture(clone(s),room==='heart'?'heart-clean':null);assert.equal(result.texts.length,0,'noncritical objects have no descriptions in '+room);
      s.scanner=true;s.scanFocusId='decoration';s.scanTargets=[{id:'decoration',x:1100,y:1000,label:'组织',progress:.5,inRange:true}];
      assert(capture(s,null).texts.length<=2);
    }
  });
  test('heart sectors revive independently and synchronization shows actual verified pulses',()=>{
    const s=clone(scene);Object.assign(s,{room:'heart',worldSize:{width:2600,height:1700},bounds:{left:80,right:2520,top:80,bottom:1620},
      stage:'conduction',tissues:[],nodes:[],enemies:[],sources:[],spawnTelegraphs:[],defense:{active:false,closed:true},
      heartSectors:[{id:'heart-west',x:850,y:760,requiredTool:'sprayer',progress:.4,cleared:false,complete:false,relay:{progress:0,complete:false}},
        {id:'heart-east',x:1750,y:760,requiredTool:'precision',progress:0,cleared:false,complete:false,relay:{progress:0,complete:false}}],
      syncCore:{id:'sync-core',x:1300,y:500,radius:34},conductionSignal:{points:[],samples:[],pulses:[],verifiedBeats:0},toolPreview:{hitType:'none'},shot:null,scanner:false} );
    const view={camera:{x:850,y:810,zoom:1.05}},before=capture(clone(s),'heart-west-blocked',view);
    s.heartSectors[0].cleared=s.heartSectors[0].complete=s.heartSectors[0].relay.complete=true;
    const after=capture(clone(s),'heart-west-restored',view),point=project({x:850,y:760},{viewport,...view});
    assert.notDeepEqual(before.pixel(point.x,point.y),after.pixel(point.x,point.y),'local treatment visibly changes its district');
    assert(!s.heartSectors[1].complete,'east remains unrestored');
    s.stage='recovery';s.heartSectors[1].cleared=s.heartSectors[1].complete=s.heartSectors[1].relay.complete=true;
    const syncView={camera:{x:1300,y:500,zoom:1}},zero=capture(clone(s),'sync-zero',syncView);
    s.conductionSignal.verifiedBeats=2;const two=capture(clone(s),'sync-two',syncView);
    const first=project({x:1271,y:594},{viewport,...syncView}),third=project({x:1329,y:594},{viewport,...syncView});
    assert.notDeepEqual(zero.pixel(first.x,first.y),two.pixel(first.x,first.y),'an arrived pulse lights its marker');
    assert.deepEqual(zero.pixel(third.x,third.y),two.pixel(third.x,third.y),'unverified third pulse stays unlit');
  });
  assert.equal(JSON.stringify(route.state(game)), simulationBefore, 'the original controller was never modified by render fixtures');
  console.log(`${passed} isolated Canvas label checks passed; ${failed} failed. Images are render fixtures, not browser or human-play evidence.`);
  if (failed) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { main };
