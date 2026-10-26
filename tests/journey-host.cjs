'use strict';
// Host integration in a minimal DOM harness. This is not browser/layout QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');

function boot(initial = {}, unavailable = false) {
  const elements = new Map(), storage = new Map(Object.entries(initial)), documentEvents = {}, windowEvents = {};
  let document;
  const context = new Proxy({}, { get(o, k) {
    if (k in o) return o[k];
    if (k === 'measureText') return text => ({ width: String(text).length * 8 });
    if (/^create.*Gradient$/.test(k)) return () => ({ addColorStop() {} });
    return () => {};
  }, set(o, k, v) { o[k] = v; return true; } });
  class Element {
    constructor(id = '', tagName = 'DIV') {
      this.id = id; this.tagName = tagName; this.children = []; this.dataset = {}; this.attributes = {};
      this.hidden = false; this.inert = false; this.disabled = false; this.isConnected = true; this.textContent = '';
      this.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
      this.classes = new Set(); this.events = {};
      this.classList = { add: (...names) => names.forEach(n => this.classes.add(n)), remove: (...names) => names.forEach(n => this.classes.delete(n)), contains: n => this.classes.has(n), toggle: (n, force) => { const next = force === undefined ? !this.classes.has(n) : force; if (next) this.classes.add(n); else this.classes.delete(n); return next; } };
      this.width = 720; this.height = 1280;
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
    addEventListener(k, fn) { this.events[k] = fn; }
    focus() { document.activeElement = this; }
    append(child) { child.parentElement = this; child.isConnected = true; this.children.push(child); if (child.id) elements.set(child.id, child); }
    replaceChildren(...children) { this.children.forEach(c => { c.isConnected = false; }); this.children = []; children.forEach(c => this.append(c)); }
    get firstElementChild() { return this.children[0] || this; }
    getContext() { return context; }
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: this.width, height: this.height }; }
    getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
    closest(selector) { if (selector.includes('[hidden]') && (this.hidden || this.inert)) return this; return this.parentElement?.closest(selector) || null; }
    querySelector(selector) { return selector === '.dialog' ? elements.get('test-dialog') : null; }
    querySelectorAll() {
      const out = []; const visit = el => { if (el.tagName === 'BUTTON') out.push(el); el.children.forEach(visit); }; this.children.forEach(visit); return out;
    }
    set innerHTML(value) { this.html = value; this.textContent = String(value).replace(/<[^>]+>/g, ''); }
    get innerHTML() { return this.html || ''; }
  }
  for (const match of template.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const el = new Element(match[2], match[1].toUpperCase()); el.hidden = /\shidden(?:\s|>)/.test(match[0]); elements.set(el.id, el);
  }
  for (const id of ['test-dialog', 'test-header']) elements.set(id, new Element(id));
  const dialog = elements.get('test-dialog'); dialog.append(elements.get('dialog-actions')); dialog.append(elements.get('dialog-body')); elements.get('modal').append(dialog);
  document = { activeElement: null, hidden: false, documentElement: { clientWidth: 1366 }, body: new Element('body'),
    getElementById: id => { assert(elements.has(id), 'template contains #' + id); return elements.get(id); },
    createElement: tag => new Element('', tag.toUpperCase()),
    querySelector: selector => selector === '.app-header' ? elements.get('test-header') : selector === '#modal .dialog' ? dialog : null,
    querySelectorAll: () => [], addEventListener: (name, fn) => { documentEvents[name] = fn; }
  };
  const localStorage = {
    getItem(key) { if (unavailable) throw Error('storage unavailable'); return storage.get(key) ?? null; },
    setItem(key, value) { if (unavailable) throw Error('storage unavailable'); storage.set(key, value); }
  };
  const window = { GiantCureGames: {}, innerHeight: 768, addEventListener: (name, fn) => { windowEvents[name] = fn; } };
  const sandbox = vm.createContext({ window, document, localStorage, console, devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ paddingTop: '0', paddingBottom: '0' }), requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: () => 1, clearTimeout() {}, performance: { now: () => 0 } });
  for (const file of ['giant-art.js', 'clinic-art.js', 'heart-journey.js']) vm.runInContext(fs.readFileSync(path.join(root, 'src', file), 'utf8'), sandbox);
  const hook = 'window.__host = { state, records, cases, prepareChapter, createChapter, showScreen, updateHUD, frame, finishGame, showResult, pauseGame, resumeGame };';
  assert(app.includes('resetDiagnosis(); requestAnimationFrame(frame);'), 'test hook follows actual host initialization');
  vm.runInContext(app.replace('resetDiagnosis(); requestAnimationFrame(frame);', hook + '\nresetDiagnosis(); requestAnimationFrame(frame);'), sandbox);
  const host = window.__host;
  const start = () => { host.prepareChapter('heartJourney', 'playing'); host.createChapter('heartJourney'); host.showScreen('treatment'); host.state.phase = 'playing'; return host.state.game; };
  const down = (code, repeat = false) => documentEvents.keydown({ code, key: code, repeat, target: document.activeElement || elements.get('world'), preventDefault() {} });
  const up = code => documentEvents.keyup({ code, key: code, preventDefault() {} });
  const key = code => { down(code); up(code); };
  return { host, window, document, elements, storage, start, key, down, up, documentEvents, windowEvents };
}

let passed = 0;
function test(name, action) { action(); passed++; console.log('PASS ' + name); }
test('records: v1 wins migrate once and old best time never carries to v4', () => {
  const h = boot({ 'giant-cure-journey-v1': JSON.stringify({ wins: 4, bestSeconds: 116 }) });
  assert.equal(h.host.records.heartJourney.wins, 4); assert.equal(h.host.records.heartJourney.bestSeconds, null);
  assert.deepEqual(JSON.parse(h.storage.get('giant-cure-journey-v4')), { wins: 4, bestSeconds: null, bestGrade: null, medals: [] });
  assert.equal(JSON.parse(h.storage.get('giant-cure-journey-v1')).bestSeconds, 116);
});
test('records: v2 wins take precedence over v1 and the old best is reset', () => {
  const h = boot({ 'giant-cure-journey-v1': JSON.stringify({ wins: 4, bestSeconds: 116 }), 'giant-cure-journey-v2': JSON.stringify({ wins: 7, bestSeconds: 400 }) });
  assert.equal(h.host.records.heartJourney.wins, 7); assert.equal(h.host.records.heartJourney.bestSeconds, null);
  assert.deepEqual(JSON.parse(h.storage.get('giant-cure-journey-v2')), { wins: 7, bestSeconds: 400 });
});
test('records: v3 wins take precedence but old time and awards are reset; storage remains optional', () => {
  const h = boot({ 'giant-cure-journey-v2': JSON.stringify({ wins: 7, bestSeconds: 400 }), 'giant-cure-journey-v3': JSON.stringify({ wins: 2, bestSeconds: 510 }) });
  assert.equal(h.host.records.heartJourney.wins, 2); assert.equal(h.host.records.heartJourney.bestSeconds, null);
  assert.deepEqual(JSON.parse(h.storage.get('giant-cure-journey-v4')), { wins: 2, bestSeconds: null, bestGrade: null, medals: [] });
  const offline = boot({}, true); assert(offline.start()); assert.equal(offline.host.state.phase, 'playing');
});
test('records: host success writes a new-rule best once and leaves legacy data intact', () => {
  const legacy = JSON.stringify({ wins: 4, bestSeconds: 116 });
  const h = boot({ 'giant-cure-journey-v1': legacy }), game = h.start();
  const performance = { grade: 'A', medals: [{ id: 'steady', label: '稳住心脏', earned: true }, { id: 'precision', label: '精准治疗', earned: false }] };
  h.host.state.game = { ...game, getDebugState: () => ({ ...game.getDebugState(), elapsed: 400, performance, runMetrics: { minStability: 70, weakpointEnemies: [], retries: 0 } }) };
  // White-box the trusted success callback; controller completion has separate public-input tests.
  h.host.finishGame(true); h.host.finishGame(true);
  assert.deepEqual(JSON.parse(h.storage.get('giant-cure-journey-v4')), { wins: 5, bestSeconds: 400, bestGrade: 'A', medals: ['steady'] });
  assert.equal(h.storage.get('giant-cure-journey-v1'), legacy);
  h.host.showResult(); assert.match(h.elements.get('result-stars').textContent, /评级 A/);
  assert.deepEqual(h.elements.get('result-medals').children.map(item => item.textContent), ['✓ 稳住心脏', '○ 精准治疗']);
  assert.match(h.elements.get('result-medals').children[0].title, /0 次重试/);
  assert.match(h.elements.get('result-medals').children[1].getAttribute('aria-label'), /3 个不同凝集体/);
});
test('records: v4 preserves the best grade and accumulated medals across later wins', () => {
  const previous = { wins: 3, bestSeconds: 300, bestGrade: 'S', medals: ['steady'] };
  const h = boot({ 'giant-cure-journey-v3': JSON.stringify({ wins: 99, bestSeconds: 10 }), 'giant-cure-journey-v4': JSON.stringify(previous) }), game = h.start();
  assert.equal(h.host.records.heartJourney.wins, 3);
  h.host.state.game = { ...game, getDebugState: () => ({ ...game.getDebugState(), elapsed: 400, performance: { grade: 'B', medals: [{ id: 'precise', label: '精准治疗', earned: true }] } }) };
  h.host.finishGame(true);
  assert.deepEqual(JSON.parse(h.storage.get('giant-cure-journey-v4')), { wins: 4, bestSeconds: 300, bestGrade: 'S', medals: ['steady', 'precise'] });
});
test('HUD: real controller publishes locked tools, selected tool and automatic reload status', () => {
  const h = boot(), game = h.start();
  assert.equal(h.elements.get('journey-tool-precision').disabled, false); assert.equal(h.elements.get('journey-tool-sprayer').disabled, true);
  assert.equal(h.elements.get('journey-tool-precision').getAttribute('aria-pressed'), 'true');
  game.pointerDown({ x: 1200, y: 830, button: 0 }); game.update(4.82);
  assert(game.getDebugState().reloadRemaining > 0);
  assert.match(h.elements.get('journey-reload').textContent, /自动装填/);
  assert.doesNotMatch(h.elements.get('journey-reload').textContent, /按 R/);
  const tools = game.getDebugState().tools.map(tool => ({ ...tool, unlocked: tool.id !== 'probe', isNew: tool.id === 'sprayer' }));
  h.host.updateHUD({ tools });
  assert.equal(h.elements.get('journey-tool-sprayer').dataset.new, 'true'); assert.match(h.elements.get('journey-tool-sprayer').getAttribute('aria-label'), /新获得/);
  h.host.updateHUD({ tool: 'sprayer', tools: tools.map(tool => ({ ...tool, isNew: false })) });
  assert.equal(h.elements.get('journey-tool-sprayer').dataset.new, 'false'); assert.match(h.elements.get('journey-tool-sprayer').getAttribute('aria-label'), /已选中/);
});
test('selector: holding Tab freezes the world and release confirms without continuing fire', () => {
  const h = boot(), game = h.start();
  h.elements.get('world').focus();
  game.pointerDown({ x: 1200, y: 830, button: 0 }); game.update(.1);
  h.down('KeyW'); h.down('Tab');
  assert.equal(h.host.state.phase, 'paused'); assert.equal(h.host.state.modalKind, 'tool-selector');
  assert.equal(h.elements.get('select-tool-sprayer').disabled, true);
  for (const id of ['precision', 'sprayer', 'probe']) assert.match(h.elements.get('select-tool-' + id).innerHTML, /<svg[^>]+aria-hidden="true"/, 'every card has its own inline tool outline');
  const frozen = JSON.stringify(game.getDebugState()), elapsed = h.host.state.elapsed;
  h.host.frame(0); h.host.frame(1000); assert.equal(JSON.stringify(game.getDebugState()), frozen); assert.equal(h.host.state.elapsed, elapsed);
  h.documentEvents.mouseup({ clientX: 500, clientY: 200, button: 0 }); h.documentEvents.pointerup({ clientX: 550, clientY: 250, button: 0 });
  assert.equal(JSON.stringify(game.getDebugState()), frozen, 'clicking selector cards cannot move world aim while paused');
  h.key('Digit2'); assert.equal(h.host.state.pendingTool, 'precision');
  h.down('Tab', true); assert.equal(h.host.state.modalKind, 'tool-selector');
  h.up('Tab'); assert.equal(h.host.state.phase, 'playing'); assert.equal(h.host.state.modal, false);
  assert.equal(h.document.activeElement, h.elements.get('world'));
  const before = game.getDebugState(); game.update(.4); const after = game.getDebugState();
  assert.equal(after.ammo, before.ammo); assert.equal(after.player.y, before.player.y); assert.deepEqual(Array.from(after.keys), []);
});
test('selector: candidates accept mouse, arrows and numbers and only commit on Tab release', () => {
  const h = boot(), game = h.start(); let selected = 'precision', commits = 0;
  // This adapter supplies an unlocked catalog; controller unlock rules have their own tests.
  h.host.state.game = { ...game, getDebugState: () => { const s = game.getDebugState(); return { ...s, tool: selected, tools: s.tools.map(t => ({ ...t, unlocked: true })) }; }, selectTool: id => { selected = id; commits++; return true; } };
  h.down('Tab'); h.key('ArrowRight'); assert.equal(h.host.state.pendingTool, 'sprayer'); assert.equal(selected, 'precision');
  h.key('Digit3'); assert.equal(h.host.state.pendingTool, 'probe');
  h.elements.get('select-tool-sprayer').events.mouseenter(); assert.equal(h.host.state.pendingTool, 'sprayer');
  h.up('Tab'); assert.equal(selected, 'sprayer'); assert.equal(commits, 1); assert.equal(h.host.state.phase, 'playing');
});
test('selector: Escape, blur, hidden document and long frame cancel and stay paused after Tab release', () => {
  for (const cancel of [h => h.key('Escape'), h => h.windowEvents.blur(), h => { h.document.hidden = true; h.documentEvents.visibilitychange(); }, h => { h.host.frame(0); h.host.frame(3000); }]) {
    const h = boot(); h.start(); h.down('Tab'); cancel(h);
    assert.equal(h.host.state.phase, 'paused'); assert.equal(h.host.state.modalKind, 'dialog');
    h.up('Tab'); assert.equal(h.host.state.phase, 'paused'); assert.equal(h.host.state.game.getDebugState().tool, 'precision');
  }
});
test('HUD: stability and base dash cooldown are visible and organ failure has its own result', () => {
  const h = boot(); h.start();
  h.host.updateHUD({ organStability: 25, tissues: [{ integrity: 20, maxIntegrity: 50, attached: true }], dashCooldown: 1.3 });
  assert.equal(h.elements.get('journey-organ-value').textContent, '25'); assert.equal(h.elements.get('journey-organ').dataset.state, 'critical');
  assert.match(h.elements.get('journey-organ-info').textContent, /1 直接修补/); assert.match(h.elements.get('journey-organ-info').textContent, /2 清覆盖物/); assert.match(h.elements.get('journey-dash-label').textContent, /1.3s/);
  h.host.updateHUD({ tissues: [{ integrity: 50, maxIntegrity: 50, attached: true }] }); assert.match(h.elements.get('journey-organ-info').textContent, /组织已修复/); assert.doesNotMatch(h.elements.get('journey-organ-info').textContent, /1.*修补/);
  h.host.updateHUD({ tissues: [{ integrity: 20, maxIntegrity: 50, attached: false }] }); assert.match(h.elements.get('journey-organ-info').textContent, /1 处组织受损 · 1 修补/); assert.doesNotMatch(h.elements.get('journey-organ-info').textContent, /2/);
  h.host.updateHUD({ tissues: [{ integrity: 50, maxIntegrity: 50, attached: false }], defense: { active: true } }); assert.match(h.elements.get('journey-organ-info').textContent, /病灶持续增援 · 保护组织/);
  const game = h.host.state.game; h.host.state.game = { ...game, getDebugState: () => ({ ...game.getDebugState(), organStability: 0 }) };
  h.host.finishGame(false, '器官稳定度耗尽'); h.host.showResult(); assert.match(h.elements.get('result-stars').textContent, /ORGAN/); assert.match(h.elements.get('result-description').textContent, /稳定度/);
});
test('host: help, blur and tool controls clear fire while retaining the intended phase', () => {
  const h = boot(), game = h.start();
  game.pointerDown({ x: 1200, y: 830, button: 0 }); game.update(.1);
  h.windowEvents.blur(); assert.equal(h.host.state.phase, 'paused');
  const before = game.getDebugState().ammo; h.host.resumeGame(); game.update(.3); assert.equal(game.getDebugState().ammo, before);
  h.key('Digit2'); assert.equal(game.getDebugState().tool, 'precision', 'locked tool cannot be equipped through host keys');
  h.elements.get('help').onclick(); assert.equal(h.host.state.phase, 'paused'); assert.equal(h.host.state.modal, true);
  assert.match(h.elements.get('dialog-body').innerHTML, /空匣自动装填/); assert.doesNotMatch(h.elements.get('dialog-body').innerHTML, /依次连接 A/);
});
test('diagnosis: a report pauses on the controller boundary, survives background events and clears held input', () => {
  const h = boot(), game = h.start(); let pending = null, reported = false, acknowledged = 0;
  const report = { targetId: 'entry-lesion', title: '入口凝块', result: '局部缺血', actions: ['1 精准枪清除凝块'], requiredTool: 'precision', revision: 'blocked' };
  // A bounded controller adapter verifies the host contract independently of
  // chapter geometry. Real scans are covered by controller and browser routes.
  h.host.state.game = { ...game,
    update(seconds) { const dt = reported ? seconds : Math.min(seconds, .017); game.update(dt); if (!reported) { pending = report; reported = true; } },
    getDebugState: () => ({ ...game.getDebugState(), pendingDiagnosis: pending, diagnosisReport: report }),
    acknowledgeDiagnosis() { pending = null; acknowledged++; game.clearInput(); },
    reviewDiagnosis() { pending = { ...report, result: '当前组织状态' }; }
  };
  h.elements.get('world').focus(); h.down('KeyW'); game.pointerDown({ x: 1200, y: 830, button: 0 });
  h.host.frame(0); h.host.frame(100);
  assert.equal(h.host.state.modalKind, 'diagnosis-report'); assert.equal(h.host.state.phase, 'paused');
  assert(Math.abs(h.host.state.elapsed - .017) < 1e-9, 'unused update slices do not count as active visit time');
  assert.equal(h.host.state.elapsed, game.getDebugState().elapsed);
  assert.match(h.elements.get('dialog-body').innerHTML, /诊断结果/); assert.match(h.elements.get('dialog-body').innerHTML, /局部缺血/); assert.match(h.elements.get('dialog-body').innerHTML, /1 精准枪/);
  const frozen = JSON.stringify(game.getDebugState()); h.host.frame(1500); h.host.frame(2500);
  assert.equal(JSON.stringify(game.getDebugState()), frozen);
  h.down('KeyD'); h.down('Tab'); h.up('Tab'); h.key('Digit2'); h.key('KeyR');
  assert.equal(h.host.state.modalKind, 'diagnosis-report'); assert.equal(JSON.stringify(game.getDebugState()), frozen);
  h.windowEvents.blur(); h.document.hidden = true; h.documentEvents.visibilitychange();
  assert.equal(h.host.state.modalKind, 'diagnosis-report'); assert.equal(h.host.state.phase, 'paused'); h.document.hidden = false;
  h.elements.get('diagnosis-continue').onclick(); assert.equal(acknowledged, 1); assert.equal(h.host.state.phase, 'playing');
  const before = game.getDebugState(); game.update(.1); const after = game.getDebugState();
  assert.equal(after.ammo, before.ammo); assert.equal(after.player.x, before.player.x); assert.equal(after.player.y, before.player.y); assert.deepEqual(Array.from(after.keys), []);
  h.key('KeyJ'); assert.equal(h.host.state.modalKind, 'diagnosis-report'); assert.match(h.elements.get('dialog-body').innerHTML, /当前组织状态/);
  h.key('Escape'); assert.equal(acknowledged, 2); assert.equal(h.host.state.phase, 'paused'); assert.equal(h.host.state.modalKind, 'dialog');
  h.host.resumeGame(); assert.equal(h.host.state.phase, 'playing');
  h.elements.get('journey-report').onclick(); assert.equal(h.host.state.modalKind, 'diagnosis-report');
});
test('diagnosis: real scan groups the entry lesion, deduplicates repeats and reviews current treatment state', () => {
  const h = boot(), game = h.start(); let now = 0; h.host.frame(now);
  const advance = seconds => { for (let time = 0; time < seconds - 1e-9; time += .05) { now += Math.min(.05, seconds - time) * 1000; h.host.frame(now); } };
  const lesion = game.getDebugState().entryLesion, destination = { x: lesion.x, y: lesion.y + 100 };
  for (let i = 0; i < 100; i++) {
    const player = game.getDebugState().player, dx = destination.x - player.x, dy = destination.y - player.y;
    if (Math.hypot(dx, dy) <= 10) break;
    for (const [key, held] of [['KeyD', dx > 6], ['KeyA', dx < -6], ['KeyS', dy > 6], ['KeyW', dy < -6]]) held ? h.down(key) : h.up(key);
    advance(.05);
  }
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) h.up(key);
  assert(Math.hypot(game.getDebugState().player.x - lesion.x, game.getDebugState().player.y - lesion.y) < 145);
  game.pointerMove(lesion); h.key('KeyQ'); advance(1.4);
  assert.equal(h.host.state.modalKind, 'diagnosis-report'); assert.equal(game.getDebugState().pendingDiagnosis.targetId, lesion.id);
  assert.equal(game.getDebugState().scanned.pressure, true); assert.equal(game.getDebugState().entryLesion.scanned, true);
  assert.equal(h.host.state.elapsed, game.getDebugState().elapsed);
  const frozen = JSON.stringify(game.getDebugState()), elapsed = h.host.state.elapsed; advance(1.8);
  assert.equal(JSON.stringify(game.getDebugState()), frozen); assert.equal(h.host.state.elapsed, elapsed);
  h.elements.get('diagnosis-continue').onclick(); advance(.05); h.key('KeyQ'); advance(1.4);
  assert.equal(h.host.state.modal, false, 'same object and revision do not automatically interrupt again');
  game.pointerDown({ ...lesion, button: 0 }); advance(1.8); game.pointerUp();
  assert.equal(game.getDebugState().entryLesion.complete, true);
  h.key('KeyJ'); assert.equal(h.host.state.modalKind, 'diagnosis-report'); assert.equal(game.getDebugState().pendingDiagnosis.revision, 'restored');
  assert.match(h.elements.get('dialog-body').innerHTML, /已恢复/); assert.match(h.elements.get('dialog-body').innerHTML, /穿过瓣膜/);
});
console.log(`\n${passed} host integration checks passed (minimal DOM; browser/layout/audio unverified).`);
