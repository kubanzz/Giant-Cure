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
  const dialog = elements.get('test-dialog'); dialog.append(elements.get('dialog-actions')); dialog.append(elements.get('dialog-body'));
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
  const hook = 'window.__host = { state, records, cases, prepareChapter, createChapter, showScreen, updateHUD, frame, offerEquipment, finishGame, pauseGame, resumeGame };';
  assert(app.includes('resetDiagnosis(); requestAnimationFrame(frame);'), 'test hook follows actual host initialization');
  vm.runInContext(app.replace('resetDiagnosis(); requestAnimationFrame(frame);', hook + '\nresetDiagnosis(); requestAnimationFrame(frame);'), sandbox);
  const host = window.__host;
  const start = () => { host.prepareChapter('heartJourney', 'playing'); host.createChapter('heartJourney'); host.showScreen('treatment'); host.state.phase = 'playing'; return host.state.game; };
  const key = code => { documentEvents.keydown({ code, key: code, repeat: false, target: elements.get('world'), preventDefault() {} }); documentEvents.keyup({ code }); };
  return { host, window, elements, storage, start, key, documentEvents, windowEvents };
}

let passed = 0;
function test(name, action) { action(); passed++; console.log('PASS ' + name); }
test('records: v1 wins migrate once and old best time never carries to v2', () => {
  const h = boot({ 'giant-cure-journey-v1': JSON.stringify({ wins: 4, bestSeconds: 116 }) });
  assert.equal(h.host.records.heartJourney.wins, 4); assert.equal(h.host.records.heartJourney.bestSeconds, null);
  assert.deepEqual(JSON.parse(h.storage.get('giant-cure-journey-v2')), { wins: 4, bestSeconds: null });
  assert.equal(JSON.parse(h.storage.get('giant-cure-journey-v1')).bestSeconds, 116);
});
test('records: existing v2 takes precedence and storage failure does not prevent play', () => {
  const h = boot({ 'giant-cure-journey-v1': JSON.stringify({ wins: 4, bestSeconds: 116 }), 'giant-cure-journey-v2': JSON.stringify({ wins: 7, bestSeconds: 400 }) });
  assert.equal(h.host.records.heartJourney.wins, 7); assert.equal(h.host.records.heartJourney.bestSeconds, 400);
  const offline = boot({}, true); assert(offline.start()); assert.equal(offline.host.state.phase, 'playing');
});
test('records: host success writes a new-rule best once and leaves legacy data intact', () => {
  const legacy = JSON.stringify({ wins: 4, bestSeconds: 116 });
  const h = boot({ 'giant-cure-journey-v1': legacy }); h.start(); h.host.state.elapsed = 400;
  // White-box the trusted success callback; controller completion has separate public-input tests.
  h.host.finishGame(true); h.host.finishGame(true);
  assert.deepEqual(JSON.parse(h.storage.get('giant-cure-journey-v2')), { wins: 5, bestSeconds: 400 });
  assert.equal(h.storage.get('giant-cure-journey-v1'), legacy);
});
test('HUD: real controller publishes locked tools, selected tool and automatic reload status', () => {
  const h = boot(), game = h.start();
  assert.equal(h.elements.get('journey-tool-precision').disabled, false); assert.equal(h.elements.get('journey-tool-sprayer').disabled, true);
  assert.equal(h.elements.get('journey-tool-precision').getAttribute('aria-pressed'), 'true');
  game.pointerDown({ x: 1200, y: 830, button: 0 }); game.update(4.82);
  assert(game.getDebugState().reloadRemaining > 0);
  assert.match(h.elements.get('journey-reload').textContent, /自动装填/);
  assert.doesNotMatch(h.elements.get('journey-reload').textContent, /按 R/);
});
test('equipment: actual chest E pauses host, later restores play, and choosing equips exactly once', () => {
  const h = boot(), game = h.start();
  const { nextWaypoint, distance } = require('./journey-navigation.cjs');
  const target = game.getDebugState().chest;
  for (let i = 0; i < 3000 && distance(game.getDebugState().player, target) > 8; i++) {
    const s = game.getDebugState(), p = nextWaypoint(s, target); assert(p);
    for (const [code, down] of [['KeyA', p.x < s.player.x - 3], ['KeyD', p.x > s.player.x + 3], ['KeyW', p.y < s.player.y - 3], ['KeyS', p.y > s.player.y + 3]]) if (down) game.keyDown(code); else game.keyUp(code);
    game.update(1 / 60);
  }
  game.clearInput(); h.key('KeyE'); assert.equal(h.host.state.phase, 'paused'); assert.equal(h.host.state.modal, true);
  const before = game.getDebugState().elapsed; h.host.frame(0); h.host.frame(1000); assert.equal(game.getDebugState().elapsed, before);
  h.elements.get('equipment-later').onclick(); assert.equal(h.host.state.phase, 'playing'); assert.equal(game.getDebugState().chest.claimed, false);
  h.key('KeyE'); h.elements.get('choose-equipment-steady').onclick();
  assert.equal(h.host.state.phase, 'playing'); assert.equal(h.host.state.modal, false);
  assert.equal(game.getDebugState().equipment, 'steady'); assert.equal(game.getDebugState().reloadDuration, 1.2);
  assert.equal(game.chooseEquipment('gel'), false); assert.match(h.elements.get('journey-equipment').textContent, /稳流/);
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
console.log(`\n${passed} host integration checks passed (minimal DOM; browser/layout/audio unverified).`);
