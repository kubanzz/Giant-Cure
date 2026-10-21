'use strict';
// Controller regressions: node tests/controllers.cjs (no packages or browser required).
// Tests act through public pointer/update APIs; getDebugState only locates visible objects.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = vm.createContext({ window: {}, console });
for (const game of ['blood', 'spore', 'heart']) {
  const file = path.join(__dirname, '..', 'src', game + '.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}
let passed = 0;
function test(name, run) {
  try { run(); passed++; console.log('PASS ' + name); }
  catch (error) { console.error('FAIL ' + name); throw error; }
}
function fresh(name) {
  const events = { success: 0, fail: 0, progress: [], feedback: [], effects: 0 };
  const game = sandbox.window.GiantCureGames[name]({
    progress(value) {
      assert(Number.isFinite(value) && value >= 0 && value <= 1, 'valid normalized progress');
      events.progress.push(value);
    },
    success() { events.success++; }, fail() { events.fail++; },
    feedback(text, kind) { events.feedback.push({ text, kind }); },
    effect() { events.effects++; }, sound() {}, setTask() {}
  });
  return { game, events };
}
function advance(game, seconds, dt = 1 / 60) {
  for (let time = 0; time < seconds - 1e-9; time += dt) game.update(Math.min(dt, seconds - time));
}
function eventually(game, action, complete, limit = 90, dt = 1 / 60) {
  for (let time = 0; time < limit; time += dt) {
    game.update(dt); action(game.getDebugState());
    if (complete()) return time + dt;
  }
  assert.fail('expected condition before ' + limit + ' seconds');
}
function validDrop(game, clot) {
  const bank = game.getDebugState().banks[0];
  const point = { x: bank.x + bank.w / 2, y: Math.max(bank.y + 30, Math.min(bank.y + bank.h - 30, clot.y)) };
  game.pointerDown(clot); game.pointerMove(point); game.pointerUp(point);
}
function invalidDrop(game, clot) {
  const point = { x: 360, y: clot.y < 700 ? clot.y + 75 : clot.y - 75 };
  game.pointerDown(clot); game.pointerMove(point); game.pointerUp(point);
}
function mockCanvas() {
  let depth = 0, calls = 0;
  const assertNumbers = args => args.forEach(value => {
    if (typeof value === 'number') assert(Number.isFinite(value), 'finite canvas geometry');
  });
  const methods = {};
  ['beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arcTo',
    'arc', 'ellipse', 'fillRect', 'strokeRect', 'clearRect', 'translate', 'rotate', 'scale',
    'setTransform', 'fill', 'stroke', 'clip', 'fillText', 'strokeText', 'setLineDash'].forEach(name => {
    methods[name] = (...args) => {
      calls++; assertNumbers(args);
      if (name === 'arc') assert(args[2] >= 0, 'nonnegative circle radius');
      if (name === 'ellipse') assert(args[2] >= 0 && args[3] >= 0, 'nonnegative ellipse radii');
    };
  });
  for (const name of ['createLinearGradient', 'createRadialGradient']) {
    methods[name] = (...args) => {
      assertNumbers(args);
      return { addColorStop(offset, color) {
        assert(Number.isFinite(offset) && offset >= 0 && offset <= 1, 'valid gradient stop');
        assert.equal(typeof color, 'string');
      } };
    };
  }
  methods.save = () => { depth++; }; methods.restore = () => { assert(depth > 0, 'balanced restore'); depth--; };
  return { ctx: methods, verify() { assert.equal(depth, 0, 'draw restores its context'); assert(calls > 100); } };
}
function verifyDraw(game, time) { const canvas = mockCanvas(); game.draw(canvas.ctx, time); canvas.verify(); }

test('blood: tap, cancelled drag and outside pointer release do not become a valid drop', () => {
  const { game, events } = fresh('blood');
  const first = game.getDebugState().clots[0];
  game.pointerDown(first); game.pointerUp(first);
  assert.equal(game.getDebugState().mistakes, 0); assert.equal(game.getDebugState().removed, 0);
  game.pointerDown(first); game.pointerMove({ x: 130, y: first.y }); game.pointerCancel();
  assert.equal(game.getDebugState().draggingId, null); assert.equal(game.getDebugState().mistakes, 0);
  assert.equal(game.getDebugState().removed, 0);
  advance(game, 1);
  assert(Math.abs(game.getDebugState().clots[0].x - first.x) < 1);
  game.pointerDown(game.getDebugState().clots[0]);
  game.pointerUp({ x: -1000, y: -1000 });
  assert.equal(game.getDebugState().draggingId, null);
  assert.equal(game.getDebugState().removed, 0); assert.equal(events.fail, 0);
  verifyDraw(game, 1);
});

test('blood: all nine valid drags, wave transitions and a single success', () => {
  const { game, events } = fresh('blood');
  for (let wave = 0; wave < 3; wave++) {
    for (const clot of game.getDebugState().clots) validDrop(game, clot);
    assert.equal(game.getDebugState().removed, (wave + 1) * 3);
    verifyDraw(game, wave * 2);
    advance(game, wave < 2 ? 1.3 : 1.7, .25);
  }
  assert.equal(events.success, 1); assert.equal(events.fail, 0);
  assert.equal(events.progress.at(-1), 1);
  advance(game, 5); game.pointerUp({ x: 130, y: 500 }); game.pointerCancel();
  assert.equal(events.success, 1);
});

test('blood: five invalid moving releases fail once; completed/failed inputs remain inert', () => {
  const { game, events } = fresh('blood');
  for (let i = 0; i < 5; i++) {
    invalidDrop(game, game.getDebugState().clots[0]); advance(game, .5);
  }
  assert.equal(events.fail, 1); assert.equal(game.getDebugState().health, 0);
  validDrop(game, game.getDebugState().clots[0]); advance(game, 10);
  assert.equal(events.fail, 1); assert.equal(events.success, 0); assert.equal(game.getDebugState().removed, 0);
  verifyDraw(game, 6);
});

test('spore: only pointerDown clears a target; forgiving hitbox and repeated-tap guard', () => {
  const { game } = fresh('spore'); advance(game, 1.2);
  const target = game.getDebugState().targets.find(t => t.kind === 'bad');
  game.pointerMove(target); game.pointerUp(target);
  if (game.pointerCancel) game.pointerCancel();
  assert.equal(game.getDebugState().removed, 0);
  game.pointerDown({ x: target.x + target.radius - .1, y: target.y });
  game.pointerDown(target); game.pointerDown({ x: 0, y: 0 });
  assert.equal(game.getDebugState().removed, 1); assert.equal(game.getDebugState().health, 5);
  verifyDraw(game, 1.2);
});

for (const dt of [1 / 60, .25, .5]) test(`spore: successful human-paced clicks at ${1 / dt} fps`, () => {
  const { game, events } = fresh('spore');
  const time = eventually(game, state => {
    for (const target of state.targets) {
      // Leave each infection visible for ~2 s and deliberately keep beneficial life untouched.
      if (target.kind === 'bad' && target.remaining < 6.8) game.pointerDown({ x: target.x + 32, y: target.y });
    }
  }, () => events.success || events.fail, 85, dt);
  assert.equal(events.success, 1); assert.equal(events.fail, 0);
  assert.equal(game.getDebugState().removed, 22); assert.equal(game.getDebugState().health, 5);
  assert(time < 85, 'enough time remains in the 90 second host timer');
  for (const target of game.getDebugState().targets) game.pointerDown(target);
  advance(game, 10); assert.equal(events.success, 1); assert.equal(events.fail, 0);
  verifyDraw(game, time);
});

test('spore: five ignored infections fail once', () => {
  const { game, events } = fresh('spore');
  eventually(game, () => {}, () => events.fail, 40, .25);
  assert.equal(game.getDebugState().health, 0); assert.equal(events.fail, 1);
  advance(game, 40); assert.equal(events.fail, 1); assert.equal(events.success, 0);
  verifyDraw(game, 25);
});

test('spore: beneficial life costs health and gives no clearing progress', () => {
  const { game, events } = fresh('spore');
  eventually(game, state => {
    for (const target of state.targets) game.pointerDown(target);
  }, () => events.fail, 45, .1);
  assert.equal(game.getDebugState().health, 0); assert.equal(events.fail, 1);
  assert(game.getDebugState().removed < 22); assert.equal(events.success, 0);
});

test('heart: warmup is safe; one early press consumes only one round despite repeated taps', () => {
  const { game, events } = fresh('heart');
  for (let n = 0; n < 50; n++) game.pointerDown({ x: 300, y: 825 });
  assert.equal(game.getDebugState().mistakes, 0);
  game.pointerMove({ x: 400, y: 825 }); game.pointerUp(); game.pointerCancel();
  game.update(3); game.pointerDown();
  for (let n = 0; n < 50; n++) game.pointerDown();
  assert.equal(game.getDebugState().mistakes, 1); assert.equal(events.fail, 0);
  game.update(game.getDebugState().roundDuration + .01); assert.equal(game.getDebugState().roundIndex, 1);
  assert.equal(game.getDebugState().roundResolved, false);
  verifyDraw(game, 6.21);
});

test('heart: seventeen correctly timed rounds restore city; repeated presses cannot add hits', () => {
  const { game, events } = fresh('heart'); game.update(3);
  for (let n = 0; n < 17; n++) {
    let state = game.getDebugState();
    const targetTime = (state.targetX - 92) / (628 - 92) * state.roundDuration;
    game.update(targetTime - state.roundElapsed);
    game.pointerDown();
    for (let i = 0; i < 30; i++) game.pointerDown();
    assert.equal(game.getDebugState().hits, n + 1);
    verifyDraw(game, 3 + n * 3.2 + targetTime);
    if (n < 16) { state = game.getDebugState(); game.update(state.roundDuration - state.roundElapsed + .001); }
  }
  assert.equal(events.success, 1); assert.equal(events.fail, 0);
  assert.equal(events.progress.at(-1), 1); game.update(30); game.pointerDown();
  assert.equal(events.success, 1); assert.equal(game.getDebugState().hits, 17);
});

test('heart: a large frame delta accounts for all missed rounds and fails only once', () => {
  const { game, events } = fresh('heart'); game.update(30);
  assert.equal(events.fail, 1); assert.equal(events.success, 0);
  assert.equal(game.getDebugState().mistakes, 6); assert.equal(game.getDebugState().health, 0);
  game.update(90); game.pointerDown(); assert.equal(events.fail, 1);
  verifyDraw(game, 30);
});

console.log(`\n${passed} controller checks passed.`);
