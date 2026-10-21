// Heart Journey controller: input, collision and particles use world coordinates.
(function () {
  'use strict';
  const AREA = { x: 24, y: 84, w: 1232, h: 552 };
  const RADIUS = 14, SCAN_RANGE = 145, SCAN_TIME = 1.35, INTERACT_RANGE = 64;
  const TOOL_RANGE = 225, MAGAZINE = 24, RELOAD_TIME = 1.7;
  const REVEAL_TIME = 1.5, BURST_TIME = 4, RECOVERY_TIME = 6, ENDING_TIME = 7;
  const STAGES = { diagnosis: '探索与诊断', bypass: '恢复侧支', combat: '异常细胞遭遇', clot: '血栓治疗', burst: '主血流恢复', conduction: '连接心脏传导', recovery: '心脏复苏', escape: '循环冲刺', ending: '肺部求救信号', complete: '心脏已复苏' };
  const ROOMS = { entry: '血管入口', main: '主血管与侧支', heart: '心脏内腔' };
  const CHECKPOINTS = { entry: '血管入口', bypass: '侧支分流恢复', flow: '主血流恢复' };
  const TASKS = {
    diagnosis: '血流正在变弱 · 对比支路的流量与压力，找到异常方向',
    bypass: '上游压力过高 · 恢复两条侧支，让血液分流',
    combat: '异常细胞阻碍治疗 · 扫描弱点，保护医疗设备',
    clot: '压力已下降 · 分别扫描并软化三处血栓结构',
    burst: '主血流正在带走淤堵 · 下游重新得到灌流',
    conduction: '心腔依然暗淡 · 扫描心脏信号，寻找传导失序的位置',
    recovery: '传导重新接通 · 等待第一声有力的心跳',
    escape: '血液循环已恢复 · 用 Space 冲刺穿过血流屏障',
    ending: '异常组织重新生长 · 肺叶深处传来新的求救', complete: '心脏恢复稳定 · 巡诊完成'
  };
  const GEOMETRY = {
    entry: {
      size: { w: 1600, h: 1000, width: 1600, height: 1000 },
      bounds: { x: 80, y: 80, w: 1440, h: 840, left: 80, right: 1520, top: 80, bottom: 920 },
      nodes: [
        { id: 'flow', x: 400, y: 600, label: '西侧支路', kind: 'diagnostic', symptom: '流量稳定 · 压力正常' },
        { id: 'pressure', x: 1120, y: 640, label: '东侧通路', kind: 'diagnostic', symptom: '流量低 · 上游高压' }
      ],
      obstacles: [
        { id: 'entry-divider-l', x: 80, y: 370, w: 910, h: 70, kind: 'tissue' },
        { id: 'entry-divider-r', x: 1270, y: 370, w: 250, h: 70, kind: 'tissue' }
      ],
      paths: [
        { id: 'normal', points: [{ x: 800, y: 830 }, { x: 400, y: 780 }, { x: 400, y: 530 }], kind: 'normal', width: 150, flow: 1 },
        { id: 'abnormal', points: [{ x: 800, y: 830 }, { x: 1120, y: 780 }, { x: 1130, y: 220 }], kind: 'abnormal', width: 180, flow: 0.18 }
      ]
    },
    main: {
      size: { w: 1600, h: 1000, width: 1600, height: 1000 },
      bounds: { x: 80, y: 80, w: 1440, h: 840, left: 80, right: 1520, top: 80, bottom: 920 },
      nodes: [
        { id: 'A1', x: 300, y: 780, label: '侧支一 · A', kind: 'connection' },
        { id: 'A2', x: 300, y: 270, label: '侧支一 · B', kind: 'connection' },
        { id: 'B1', x: 1300, y: 780, label: '侧支二 · A', kind: 'connection' },
        { id: 'B2', x: 1300, y: 270, label: '侧支二 · B', kind: 'timedConnection' },
        { id: 'release', x: 800, y: 690, label: '主流阀', kind: 'release' }
      ],
      obstacles: [
        { id: 'clot', x: 680, y: 280, w: 240, h: 210, kind: 'clot' },
        { id: 'main-island-l', x: 490, y: 610, w: 90, h: 110, kind: 'tissue' },
        { id: 'main-island-r', x: 1030, y: 610, w: 90, h: 110, kind: 'tissue' }
      ],
      paths: [
        { id: 'main-flow', points: [{ x: 800, y: 900 }, { x: 800, y: 140 }], kind: 'main', width: 210 },
        { id: 'bypass-a', points: [{ x: 800, y: 830 }, { x: 300, y: 780 }, { x: 300, y: 270 }, { x: 800, y: 140 }], kind: 'bypass', branch: 'A', width: 100 },
        { id: 'bypass-b', points: [{ x: 800, y: 830 }, { x: 1300, y: 780 }, { x: 1300, y: 270 }, { x: 800, y: 140 }], kind: 'bypass', branch: 'B', width: 100 }
      ]
    },
    heart: {
      size: { w: 1800, h: 1200, width: 1800, height: 1200 },
      bounds: { x: 80, y: 80, w: 1640, h: 1040, left: 80, right: 1720, top: 80, bottom: 1120 },
      nodes: [
        { id: 'heart-signal', x: 900, y: 700, label: '心脏信号', kind: 'diagnostic', symptom: '局部搏动存在 · 传导信号中断' },
        { id: 'C1', x: 600, y: 900, label: '传导 · A', kind: 'conduction' },
        { id: 'C2', x: 1180, y: 730, label: '传导 · B', kind: 'conduction' },
        { id: 'C3', x: 780, y: 500, label: '传导 · C', kind: 'conduction' }
      ],
      obstacles: [
        { id: 'heart-island', x: 800, y: 810, w: 160, h: 90, kind: 'tissue' },
        { id: 'exit-barrier', x: 80, y: 300, w: 1640, h: 36, kind: 'dashBarrier' }
      ],
      paths: [{ id: 'heart-flow', points: [{ x: 900, y: 1100 }, { x: 1040, y: 780 }, { x: 1150, y: 500 }, { x: 1400, y: 160 }], kind: 'main', width: 160 }]
    }
  };
  const VALVE = { id: 'entry-valve', x: 990, y: 390, w: 280, h: 32, kind: 'valve', label: '心跳瓣膜' };
  const CLOT = { x: 800, y: 380, radius: 116 };
  const GROWTH = { id: 'growth', x: 1300, y: 180, radius: 35, label: '异常组织' };
  const WEAKPOINTS = [{ id: 'W1', x: 700, y: 318, label: '结构一' }, { id: 'W2', x: 902, y: 382, label: '结构二' }, { id: 'W3', x: 730, y: 473, label: '结构三' }];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const copy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

  window.GiantCureGames = window.GiantCureGames || {};
  window.GiantCureGames.heartJourney = function createHeartJourney(api) {
    const state = {
      room: 'entry', stage: 'diagnosis', player: { x: 800, y: 830, radius: RADIUS }, aim: { x: 1120, y: 640 }, aimDirection: { x: 0, y: -1 }, keys: new Set(), firing: false, precision: false,
      scanner: false, scanned: {}, scanProgress: {}, bypassA: false, bypassB: false, connection: [], conduction: [], heartConnected: false, flowRestored: false,
      weakpoints: WEAKPOINTS.map(p => ({ ...p, scanned: false, scanProgress: 0, progress: 0, complete: false })),
      growth: { ...GROWTH, scanned: false, scanProgress: 0, progress: 0, suppressed: false, regrowing: false },
      integrity: 100, ammo: MAGAZINE, reloadRemaining: 0, shotCooldown: 0, enemies: [], enemySerial: 0, combatWave: 0, waveDelay: 0, combatComplete: false,
      elapsed: 0, heartbeatClock: 0, checkpoint: 'entry', retries: 0, dashUnlocked: false, dashRemaining: 0, dashCooldown: 0, dashDirection: { x: 0, y: -1 },
      crossedBarrier: false, burst: 0, recovery: 0, ending: 0, invulnerable: 0, revealRemaining: 0, heartRevealed: false, firstStrongBeat: false, valveSide: 'below',
      damageFlash: 0, notice: '', noticeTime: 0, warningCooldown: 0, shot: null, treatmentLease: 0, treatmentTargetId: null, failed: false, finished: false, lastProgress: -1, hudTimer: 0
    };
    let playedHeartbeatThisUpdate = false;
    function call(name, ...args) { if (typeof api[name] === 'function') api[name](...args); }
    function feedback(text, kind = 'info') { state.notice = text; state.noticeTime = 3.6; call('feedback', text, kind); }
    function task() {
      if (state.stage === 'diagnosis' && state.room === 'main') return '主流被堵塞 · 扫描血栓，确认高压的来源';
      const guide = guidance(); if (guide) return guide.text;
      if (state.stage === 'recovery' && state.firstStrongBeat) return '有力的心跳正在传播 · 灯窗与植物依次苏醒';
      if (state.stage === 'escape' && state.crossedBarrier) return state.growth.scanned ? '异常组织已经识别 · 持续照射，观察它的反应（扫描记录已保留）' : '出口组织仍有异常 · 扫描这处不协调的生长';
      if (state.stage === 'clot' && state.weakpoints.every(p => p.complete)) return '血栓已软化 · 回到主流阀，释放安全的血流';
      return TASKS[state.stage];
    }
    function guidance() {
      let sequence, current, label, kind;
      if (state.room === 'main' && state.stage === 'bypass' && state.connection.length) {
        const first = state.connection[0].startsWith('A'); sequence = first ? ['A1', 'A2'] : ['B1', 'B2']; current = state.connection; label = first ? '侧支一' : '侧支二'; kind = 'bypass';
      } else if (state.room === 'heart' && state.stage === 'conduction' && state.scanned['heart-signal']) {
        sequence = ['C1', 'C2', 'C3']; current = state.conduction; label = '心脏传导'; kind = 'conduction';
      } else return null;
      if (current.length >= sequence.length) return null;
      const nodes = GEOMETRY[state.room].nodes, target = nodes.find(n => n.id === sequence[current.length]), source = current.length ? nodes.find(n => n.id === current[current.length - 1]) : null;
      if (!target) return null;
      const letter = id => id === 'C1' || id === 'A1' || id === 'B1' ? 'A' : id === 'C3' ? 'C' : 'B', waiting = target.id === 'B2' && !beat().safe;
      return { kind, label, text: label + '：' + (source ? letter(source.id) + ' 已连接 → 寻找 ' : '已定位 → 连接 ') + letter(target.id) + (waiting ? ' · 等待瓣膜舒张' : ''), source: source ? { id: source.id, x: source.x, y: source.y, label: source.label } : null, target: { id: target.id, x: target.x, y: target.y, label: target.label }, waiting };
    }
    function setStage(stage) { state.stage = stage; call('setTask', task()); publish(true); }
    function inputLocked() { return state.revealRemaining > 0 || ['burst', 'recovery', 'ending'].includes(state.stage); }
    function beat() {
      const silent = state.stage === 'recovery' && state.recovery < 1.1, stable = state.heartConnected && state.firstStrongBeat;
      const period = stable ? 1.35 : 1.9, phase = (state.heartbeatClock / period) % 1;
      return { phase, pulse: silent ? 0 : Math.exp(-phase * 15) + Math.exp(-Math.pow((phase - 0.19) * 16, 2)) * 0.42, safe: phase >= 0.52 && phase <= 0.86,
        state: stable ? 'stable' : state.heartConnected ? 'recovering' : state.flowRestored ? 'weak' : 'critical', period, silent, strong: stable };
    }
    function bounds(room = state.room) { return GEOMETRY[room].bounds; }
    function overlapsRect(x, y, radius, rect) { return Math.hypot(x - clamp(x, rect.x, rect.x + rect.w), y - clamp(y, rect.y, rect.y + rect.h)) < radius; }
    function resolveDashOverlap() {
      if (state.room !== 'heart') return;
      const barrier = GEOMETRY.heart.obstacles.find(o => o.kind === 'dashBarrier');
      if (overlapsRect(state.player.x, state.player.y, RADIUS, barrier)) {
        const above = state.dashDirection.y < -0.05 || (Math.abs(state.dashDirection.y) <= 0.05 && state.player.y < barrier.y + barrier.h / 2);
        state.player.y = above ? barrier.y - RADIUS - 1 : barrier.y + barrier.h + RADIUS + 1;
      }
      if (state.player.y < barrier.y - RADIUS) state.crossedBarrier = true;
    }
    function clearInput() { state.keys.clear(); state.firing = false; state.precision = false; state.treatmentLease = 0; state.treatmentTargetId = null; if (state.dashRemaining > 0) resolveDashOverlap(); state.dashRemaining = 0; }
    function obstacles(room = state.room, forEnemy = false) {
      const items = GEOMETRY[room].obstacles.filter(o => !(o.kind === 'clot' && state.flowRestored) && !(o.kind === 'dashBarrier' && state.dashRemaining > 0 && !forEnemy));
      if (room === 'entry' && !beat().safe) items.push(VALVE);
      return items;
    }
    function moveBody(body, dx, dy, radius, forEnemy = false) {
      const b = bounds(), walls = obstacles(state.room, forEnemy), x = clamp(body.x + dx, b.left + radius, b.right - radius);
      if (!walls.some(o => overlapsRect(x, body.y, radius, o))) body.x = x;
      const y = clamp(body.y + dy, b.top + radius, b.bottom - radius);
      if (!walls.some(o => overlapsRect(body.x, y, radius, o))) body.y = y;
    }
    function segmentHit(from, to, rect, radius = 0) {
      let enter = 0, leave = 1;
      for (const [origin, delta, min, max] of [[from.x, to.x - from.x, rect.x - radius, rect.x + rect.w + radius], [from.y, to.y - from.y, rect.y - radius, rect.y + rect.h + radius]]) {
        if (Math.abs(delta) < 1e-8) { if (origin < min || origin > max) return null; }
        else { const t1 = (min - origin) / delta, t2 = (max - origin) / delta; enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2)); if (enter > leave) return null; }
      }
      return leave >= 0 && enter <= 1 ? Math.max(0, enter) : null;
    }
    function wallHit(from, to, radius = 0, ignoredId = '') {
      let nearest = null;
      obstacles(state.room, true).forEach(rect => { if (rect.id === ignoredId) return; const t = segmentHit(from, to, rect, radius); if (t !== null && (!nearest || t < nearest.t)) nearest = { t, rect, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }; });
      return nearest;
    }
    function blockedSegment(from, to, radius) { return !!wallHit(from, to, radius); }
    function hunterDestination(enemy, dt) {
      if (!blockedSegment(enemy, state.player, 23)) return state.player;
      enemy.pathTimer = (enemy.pathTimer || 0) - dt;
      if (enemy.pathTimer > 0 && enemy.waypoint && distance(enemy, enemy.waypoint) > 5) return enemy.waypoint;
      enemy.pathTimer = 0.35;
      const b = bounds(), walls = obstacles(state.room, true), points = [{ x: enemy.x, y: enemy.y }, { x: state.player.x, y: state.player.y }];
      walls.forEach(rect => { for (const x of [rect.x - 26, rect.x + rect.w + 26]) for (const y of [rect.y - 26, rect.y + rect.h + 26]) { const p = { x: clamp(x, b.left + 23, b.right - 23), y: clamp(y, b.top + 23, b.bottom - 23) }; if (!walls.some(w => overlapsRect(p.x, p.y, 23, w))) points.push(p); } });
      const costs = points.map(() => Infinity), parents = [], visited = new Set(); costs[0] = 0;
      for (let n = 0; n < points.length; n++) {
        let current = -1;
        for (let i = 0; i < points.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
        if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break;
        visited.add(current);
        for (let i = 0; i < points.length; i++) { if (visited.has(i) || blockedSegment(points[current], points[i], 23)) continue; const cost = costs[current] + distance(points[current], points[i]); if (cost < costs[i]) { costs[i] = cost; parents[i] = current; } }
      }
      let first = 1; while (parents[first] !== undefined && parents[first] !== 0) first = parents[first];
      enemy.waypoint = Number.isFinite(costs[1]) ? points[first] : { x: state.player.x, y: state.player.y }; return enemy.waypoint;
    }
    function updateValve() {
      if (state.room !== 'entry') return;
      if (!beat().safe && overlapsRect(state.player.x, state.player.y, RADIUS, VALVE)) { state.player.y = state.valveSide === 'above' ? VALVE.y - RADIUS - 1 : VALVE.y + VALVE.h + RADIUS + 1; feedback('瓣膜随心跳闭合 · 等待下一次舒张，不会损伤设备'); }
      if (state.player.y < VALVE.y - RADIUS) state.valveSide = 'above'; else if (state.player.y > VALVE.y + VALVE.h + RADIUS) state.valveSide = 'below';
    }
    function progress() {
      if (state.finished) return 1;
      if (state.ending > 0) return 0.98;
      if (state.dashUnlocked) return state.crossedBarrier ? 0.96 + state.growth.progress * 0.02 : 0.94;
      if (state.heartConnected) return 0.9 + Math.min(1, state.recovery / RECOVERY_TIME) * 0.04;
      if (state.flowRestored) return 0.78 + state.conduction.length * 0.035;
      if (state.stage === 'burst') return 0.74 + Math.min(1, state.burst / BURST_TIME) * 0.04;
      if (state.combatComplete) return 0.54 + state.weakpoints.reduce((sum, p) => sum + p.progress, 0) * 0.065;
      if (state.bypassA && state.bypassB) return 0.4;
      if (state.stage === 'bypass') return 0.14 + (state.bypassA ? 0.13 : 0) + (state.bypassB ? 0.13 : 0);
      return ['flow', 'pressure', 'clot'].filter(id => state.scanned[id]).length * 0.04;
    }
    function publish(force) {
      const value = progress(); if (force || Math.abs(value - state.lastProgress) > 0.001) { call('progress', value); state.lastProgress = value; }
      if (force || state.hudTimer <= 0) { call('setTask', task()); call('hud', { integrity: state.integrity, ammo: state.ammo, reloadRemaining: state.reloadRemaining, scanner: state.scanner, stageLabel: STAGES[state.stage], roomLabel: ROOMS[state.room], task: task(), checkpoint: CHECKPOINTS[state.checkpoint], checkpointId: state.checkpoint, retries: state.retries, heartbeatState: beat().state, dashUnlocked: state.dashUnlocked }); state.hudTimer = 0.1; }
    }
    function portalList() {
      if (state.room === 'entry') return [{ id: 'to-main', x: 1130, y: 220, label: '主血管', locked: !state.scanned.pressure, requires: '扫描异常通路，确认流量与压力' }];
      if (state.room === 'main') return [{ id: 'to-entry', x: 800, y: 870, label: '血管入口', locked: false }, { id: 'to-heart', x: 800, y: 140, label: '心脏内腔', locked: !state.flowRestored, requires: '主血管仍被淤堵阻断' }];
      return [{ id: 'to-main', x: 900, y: 1070, label: '主血管', locked: false }, { id: 'exit', x: 1510, y: 150, label: '下一封病历', locked: !state.growth.suppressed, requires: state.crossedBarrier ? '出口附近的异常组织需要检查' : '心脏恢复后才能穿过血流屏障' }];
    }
    function nodeList() {
      return GEOMETRY[state.room].nodes.map(node => {
        const isA = node.id === 'A1' || node.id === 'A2', isB = node.id === 'B1' || node.id === 'B2';
        const complete = isA ? state.bypassA : isB ? state.bypassB : node.kind === 'conduction' ? state.heartConnected : node.id === 'release' ? state.flowRestored : !!state.scanned[node.id], selected = state.connection.includes(node.id) || state.conduction.includes(node.id);
        return { ...node, symptom: node.kind === 'diagnostic' && state.scanned[node.id] ? diagnosticText(node.id) : node.symptom, scanned: !!state.scanned[node.id], complete, active: !complete, selected, progress: complete || selected ? 1 : state.scanProgress[node.id] || 0 };
      });
    }
    function nearbyInteraction() {
      const candidates = [...nodeList(), ...portalList()]; if (state.room === 'heart' && state.crossedBarrier) candidates.push({ ...GROWTH, kind: 'growth' });
      return candidates.filter(item => distance(item, state.player) <= INTERACT_RANGE).sort((a, b) => distance(a, state.player) - distance(b, state.player))[0] || null;
    }
    function enterRoom(room) {
      clearInput(); const previous = state.room; state.room = room;
      Object.assign(state.player, room === 'entry' ? { x: 1130, y: 270 } : room === 'main' ? previous === 'heart' ? { x: 800, y: 180 } : { x: 800, y: 830 } : { x: 900, y: 1020 });
      if (room === 'heart' && !state.heartRevealed) { state.heartRevealed = true; state.revealRemaining = REVEAL_TIME; }
      if (room === 'entry') state.valveSide = 'above';
      feedback(room === 'heart' ? '狭窄的血管尽头，是一座仍在等待心跳的城市' : ROOMS[room] + ' · 观察组织变化，Q 扫描，E 操作节点'); publish(true);
    }
    function connect(id, sequence, current, complete) {
      if (current.some((v, i) => v !== sequence[i])) { current.length = 0; if (id === sequence[0]) current.push(id); feedback('这两端不属于同一回路 · 当前连接已重置'); publish(true); return; }
      if (id === sequence[current.length]) {
        if (id === 'B2' && !beat().safe) { feedback('侧支瓣膜正在收缩 · 等待青绿色的舒张窗口再连接'); return; }
        current.push(id); call('sound', 'hit'); const node = GEOMETRY[state.room].nodes.find(n => n.id === id); call('effect', node.x, node.y, '#bce7c8', 12);
        if (current.length === sequence.length) complete(); else feedback('连接已暂存 · 下一端的组织仍在等待传导', 'good');
      } else { current.length = 0; if (id === sequence[0]) current.push(id); feedback('连接顺序未形成回路 · 当前连接已重置'); }
      publish(true);
    }
    function beginCombat() { state.checkpoint = 'bypass'; state.connection = []; state.combatWave = 1; state.waveDelay = 0; spawnHunters([{ x: 1120, y: 450 }]); setStage('combat'); feedback('两条侧支开始分担压力 · 一只异常细胞被血流惊醒', 'good'); }
    function interactNode(node) {
      if (node.kind === 'diagnostic') { feedback(state.scanned[node.id] ? diagnosticText(node.id) : 'Q 开启扫描，在附近停留以读取组织状态'); return; }
      if (node.kind === 'growth') { feedback(state.growth.scanned ? '扫描记录已保留 · 持续照射可以暂时压制这处组织' : '这处生长与周围组织不同 · 用 Q 扫描它'); return; }
      if (node.kind === 'connection' || node.kind === 'timedConnection') {
        if (state.stage !== 'bypass') { feedback(state.bypassA && state.bypassB ? '侧支已恢复 · 压力保持安全' : '扫描主血栓后才能读取侧支连接状态'); return; }
        const first = node.id.startsWith('A'); if (first ? state.bypassA : state.bypassB) { feedback('这条侧支已恢复流动', 'good'); return; }
        connect(node.id, first ? ['A1', 'A2'] : ['B1', 'B2'], state.connection, () => { if (first) state.bypassA = true; else state.bypassB = true; state.connection = []; feedback('血细胞进入侧支 · 主流压力' + (state.bypassA && state.bypassB ? '已降至安全范围' : '开始下降'), 'good'); if (state.bypassA && state.bypassB) beginCombat(); });
      } else if (node.kind === 'release') {
        if (state.flowRestored) { feedback('主血流畅通 · 心脏入口已经打开', 'good'); return; }
        if (!(state.bypassA && state.bypassB)) { feedback('主流压力过高 · 未形成分流，强行冲流会产生碎屑'); return; }
        if (!state.weakpoints.every(p => p.complete)) { feedback('血栓结构仍然坚硬 · 三处结构软化后才能启动主流'); return; }
        state.burst = 0.001; clearInput(); setStage('burst'); feedback('压力安全，结构已软化 · 主血流将带走碎屑和干扰者', 'good'); call('sound', 'hit');
      } else if (node.kind === 'conduction') {
        if (state.heartConnected) { feedback('传导稳定 · 心跳正在照亮生命之城', 'good'); return; }
        if (!state.scanned['heart-signal']) { feedback('信号的方向仍不清楚 · 先扫描心腔中央的心脏信号'); return; }
        connect(node.id, ['C1', 'C2', 'C3'], state.conduction, () => { state.heartConnected = true; state.recovery = 0.001; state.firstStrongBeat = false; clearInput(); setStage('recovery'); feedback('最后一段传导接通 · 心腔安静下来…', 'good'); });
      }
    }
    function interact() {
      if (state.failed || state.finished || inputLocked()) return;
      const target = nearbyInteraction(); if (!target) { feedback('靠近组织节点或房间入口，再按 E 交互'); return; }
      if (target.kind) { interactNode(target); return; } if (target.locked) { feedback(target.requires); return; }
      if (target.id === 'to-main') enterRoom('main'); else if (target.id === 'to-entry') enterRoom('entry'); else if (target.id === 'to-heart') enterRoom('heart');
    }
    function diagnosticText(id) {
      if (id === 'flow') return '正常支路：流量稳定、压力正常 · 这里的血液仍能顺畅循环';
      if (id === 'pressure') return state.flowRestored ? '通路已恢复：流量稳定、压力安全 · 血液重新抵达下游' : state.bypassA && state.bypassB ? '分流已恢复：压力安全 · 主血管等待软化和冲流' : state.bypassA || state.bypassB ? '分流开始起效：压力下降 · 仍有一条侧支等待恢复' : '异常通路：低流量、上游高压 · 阻力来自瓣膜后的主血管';
      if (id === 'clot') return state.flowRestored ? '主血管：血栓已移除 · 下游灌流恢复' : state.bypassA && state.bypassB ? '血栓：分流压力安全 · ' + state.weakpoints.filter(p => p.complete).length + '/3 处结构已软化' : '纤维性血栓：上游鼓胀、下游缺血 · 先分流降压，再软化结构';
      if (id === 'heart-signal') {
        if (state.ending >= 3.8 || state.finished) return '心脏：同步搏动稳定 · 巨人胸口重新起伏，肺部仍需巡诊';
        if (state.growth.regrowing) return '心脏：同步搏动稳定 · 异常组织再次生长，信号延伸至肺部';
        if (state.growth.suppressed) return '心脏：同步搏动稳定 · 出口异常组织已暂时压制';
        if (state.dashUnlocked) return '心脏：传导完整、同步搏动稳定 · 循环冲刺已恢复';
        if (state.heartConnected) return '心脏：传导已接通 · ' + (state.firstStrongBeat ? '有力心跳正唤醒灯火与植物' : '等待第一声有力的心跳');
        if (state.conduction.length) return '心脏：传导连接中 · ' + state.conduction.length + '/3 节点已接通';
        return '心腔：局部搏动存在，但传导中断 · 接通 A → B → C 可恢复同步';
      }
      return '连接：' + (state.scanned[id] ? '组织状态可读取' : '等待扫描');
    }
    function scanTarget(target, dt, onComplete) { if (distance(target, state.player) > SCAN_RANGE || target.scanned) return; target.scanProgress = Math.min(1, (target.scanProgress || 0) + dt / SCAN_TIME); if (target.scanProgress >= 1) { target.scanned = true; if (onComplete) onComplete(); } }
    function updateScanner(dt) {
      if (!state.scanner) return;
      GEOMETRY[state.room].nodes.forEach(node => { if (distance(node, state.player) > SCAN_RANGE || state.scanned[node.id]) return; state.scanProgress[node.id] = Math.min(1, (state.scanProgress[node.id] || 0) + dt / SCAN_TIME); if (state.scanProgress[node.id] >= 1) { state.scanned[node.id] = true; if (node.kind === 'diagnostic') feedback(diagnosticText(node.id)); } });
      if (state.room === 'main') {
        if (!state.scanned.clot && distance(state.player, CLOT) <= 230) { state.scanProgress.clot = Math.min(1, (state.scanProgress.clot || 0) + dt / SCAN_TIME); if (state.scanProgress.clot >= 1) { state.scanned.clot = true; feedback(diagnosticText('clot')); } }
        state.weakpoints.forEach(p => scanTarget(p, dt, () => feedback(p.label + '：纤维缠结 · 侧支降压后可用医疗射线软化')));
      }
      if (state.room === 'heart' && state.crossedBarrier && state.stage === 'escape') scanTarget(state.growth, dt, () => feedback('异常组织：生长紊乱 · 治疗只能暂时抑制它'));
      if (state.stage === 'diagnosis' && state.scanned.pressure && state.scanned.clot) { setStage('bypass'); feedback('病因确认 · 两条侧支失去连接，主血管无法卸压'); }
    }
    function startReload() { if (state.reloadRemaining > 0 || state.ammo === MAGAZINE || state.failed || state.finished || inputLocked()) return; state.reloadRemaining = RELOAD_TIME; feedback('正在装填医疗介质 · 1.7 秒'); publish(true); }
    function warning(text) { if (state.warningCooldown <= 0) { state.warningCooldown = 2; feedback(text); } }
    function enemyWeakpoint(enemy) { const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x); return { x: enemy.x + Math.cos(angle) * 16, y: enemy.y + Math.sin(angle) * 16, radius: 11 }; }
    function circleHit(from, to, center, radius) {
      const dx = to.x - from.x, dy = to.y - from.y, ox = from.x - center.x, oy = from.y - center.y, a = dx * dx + dy * dy, c = ox * ox + oy * oy - radius * radius;
      if (c <= 0) return 0;
      const b = ox * dx + oy * dy, discriminant = b * b - a * c;
      if (a < 1e-12 || discriminant < 0) return null;
      const t = (-b - Math.sqrt(discriminant)) / a; return t >= 0 && t <= 1 ? t : null;
    }
    // A single, read-only query drives both precision preview and the actual tool.
    // Only a diagnosed, available treatment endpoint can admit a ray into its own clot.
    function resolveToolRay() {
      const from = { x: state.player.x, y: state.player.y }, dx = state.aim.x - from.x, dy = state.aim.y - from.y, length = Math.hypot(dx, dy), direction = length > 1e-8 ? { x: dx / length, y: dy / length } : state.aimDirection;
      const far = { x: from.x + direction.x * TOOL_RANGE, y: from.y + direction.y * TOOL_RANGE }, candidates = [];
      const structures = state.room === 'main' && !state.flowRestored ? state.weakpoints.filter(p => !p.complete).map(p => ({ p, t: circleHit(from, far, p, 25) })).filter(p => p.t !== null).sort((a, b) => a.t - b.t) : [];
      const treatment = structures.length && structures[0].p.scanned && state.stage === 'clot' ? structures[0] : null;
      const wall = wallHit(from, far, 0, treatment ? 'clot' : '');
      if (wall) candidates.push({ t: wall.t, priority: 0, hitType: wall.rect.kind === 'clot' ? 'clot' : 'wall', targetId: wall.rect.id, weakpoint: false, blocked: true, label: wall.rect.kind === 'clot' ? state.stage !== 'clot' ? '血栓坚硬 · 先分流降压并处理干扰' : structures.some(item => !item.p.scanned) ? '结构尚未诊断 · Q 扫描后再治疗' : '血栓实体 · 瞄准已识别的纤维结构' : '实体组织阻挡射线' });
      // The world boundary is solid tissue as well, rather than an invisible range extension.
      const b = bounds();
      for (const [delta, origin, edge] of [[far.x - from.x, from.x, b.left], [far.x - from.x, from.x, b.right], [far.y - from.y, from.y, b.top], [far.y - from.y, from.y, b.bottom]]) {
        if (Math.abs(delta) < 1e-8) continue; const t = (edge - origin) / delta;
        if (t >= 0 && t <= 1) candidates.push({ t, priority: 0, hitType: 'wall', targetId: 'boundary', weakpoint: false, blocked: true, label: '外围组织阻挡射线' });
      }
      if (treatment) candidates.push({ t: treatment.t, priority: 2, hitType: 'treatment', targetId: treatment.p.id, weakpoint: false, blocked: false, label: treatment.p.label + ' · 持续照射软化' });
      if (state.room === 'heart' && state.stage === 'escape' && state.crossedBarrier) {
        const t = circleHit(from, far, GROWTH, GROWTH.radius);
        if (t !== null) candidates.push({ t, priority: 2, hitType: state.growth.scanned ? 'treatment' : 'undiagnosed', targetId: GROWTH.id, weakpoint: false, blocked: false, label: state.growth.scanned ? '异常组织 · 持续照射暂时压制' : '异常组织尚未诊断 · 先用 Q 扫描' });
      }
      if (state.room === 'main') state.enemies.filter(e => e.hp > 0).forEach(enemy => {
        const bodyT = circleHit(from, far, enemy, 22), weakT = state.scanner ? circleHit(from, far, enemyWeakpoint(enemy), 11) : null;
        // Identify the first body before considering that Hunter's exposed weakpoint.
        // A protruding weakpoint on an overlapping rear Hunter cannot steal the hit.
        if (bodyT === null) return;
        const weak = weakT !== null && (!wall || weakT < wall.t - 1e-8);
        candidates.push({ t: bodyT, endpointT: weak ? weakT : bodyT, priority: 1, hitType: 'hunter', targetId: enemy.id, weakpoint: weak, blocked: false, label: weak ? 'Hunter 显露弱点 · 3 点伤害' : 'Hunter 身体 · 1 点伤害' });
      });
      candidates.sort((a, b) => Math.abs(a.t - b.t) <= 1e-8 ? a.priority - b.priority : a.t - b.t);
      const hit = candidates[0], t = hit ? hit.endpointT === undefined ? hit.t : hit.endpointT : 1;
      return { from, to: { x: from.x + (far.x - from.x) * t, y: from.y + (far.y - from.y) * t }, kind: hit && hit.hitType === 'treatment' ? 'treatment' : hit && ['clot', 'undiagnosed'].includes(hit.hitType) ? 'warning' : 'shot', hitType: hit ? hit.hitType : 'none', targetId: hit ? hit.targetId : null, weakpoint: hit ? hit.weakpoint : false, blocked: hit ? hit.blocked : false, label: hit ? hit.label : '射程内无目标', range: TOOL_RANGE };
    }
    function spawnHunters(points, append = false) { const list = points.map((p, i) => ({ ...p, id: ++state.enemySerial, hp: 6, state: 'approach', timer: 1.2 + i * 0.9, target: null, hasHit: false, hitFlash: 0, telegraph: 0 })); state.enemies = append ? [...state.enemies.filter(e => e.hp > 0), ...list] : list; }
    function beginEnding() { state.growth.progress = 1; state.growth.suppressed = true; state.ending = 0.001; clearInput(); setStage('ending'); feedback('异常组织已暂时压制 · 但它的生长信号没有消失…'); call('effect', GROWTH.x, GROWTH.y, '#badbc4', 18); }
    function useTool(dt, timing) {
      if (!state.firing || state.reloadRemaining > 0 || state.failed || state.finished || inputLocked()) return;
      // Integrate the dose over the part of this frame before and after a shot.
      // Carry the 200 ms boundary through frames instead of rounding every shot up
      // to the next frame; a final, partial lease must contribute its actual time.
      const inactive = Math.min(dt, timing.reloadRemaining), active = dt - inactive;
      if (active <= 1e-10) return;
      const cooldown = Math.max(0, timing.cooldown - inactive), lease = Math.max(0, timing.lease - inactive), ray = resolveToolRay(), oldTreatment = ray.hitType === 'treatment' && timing.targetId === ray.targetId;
      let treatmentTime = oldTreatment ? Math.min(active, lease) : 0;
      if (state.ammo > 0 && cooldown <= active + 1e-8) {
        const beforeShot = Math.min(active, cooldown), afterShot = active - beforeShot;
        treatmentTime = (oldTreatment ? Math.min(beforeShot, lease) : 0) + (ray.hitType === 'treatment' ? afterShot : 0);
        state.shotCooldown = 0.2 - afterShot; state.ammo--; state.shot = { ...ray, age: afterShot }; state.treatmentTargetId = ray.hitType === 'treatment' ? ray.targetId : null; state.treatmentLease = ray.hitType === 'treatment' ? 0.2 - afterShot : 0; call('sound', 'shot');
        if (ray.hitType === 'hunter') {
          const enemy = state.enemies.find(e => e.id === ray.targetId);
          enemy.hp = Math.max(0, enemy.hp - (ray.weakpoint ? 3 : 1)); enemy.hitFlash = 0.18; call('sound', ray.weakpoint ? 'hitWeak' : 'hit'); call('effect', ray.to.x, ray.to.y, ray.weakpoint ? '#fae3a7' : '#dbc5d7', ray.weakpoint ? 12 : 5);
          if (enemy.hp === 0) { feedback('异常细胞已净化' + (ray.weakpoint ? ' · 弱点命中' : ''), 'good'); call('effect', enemy.x, enemy.y, '#b5dbb6', 18); }
        } else if (ray.hitType === 'treatment') { call('sound', 'treatment'); call('effect', ray.to.x, ray.to.y, '#c3e4c1', 3); }
        else if (ray.blocked) { call('sound', 'wall'); call('effect', ray.to.x, ray.to.y, '#b8aa99', 3); }
        if (ray.hitType === 'undiagnosed' || ray.hitType === 'clot') warning(ray.label);
      }
      if (ray.hitType !== 'treatment' || treatmentTime <= 0) { if (state.ammo <= 0) warning('医疗介质已用尽 · 按 R 装填，无限备弹'); return; }
      const weak = state.weakpoints.find(p => p.id === ray.targetId), target = weak || state.growth, duration = weak ? 3.2 : 1.5;
      target.progress = clamp(target.progress + treatmentTime / duration, 0, 1);
      if (target.progress < 1 - 1e-8) return;
      target.progress = 1;
      if (!weak) { beginEnding(); return; }
      weak.complete = true; state.treatmentLease = 0; call('effect', weak.x, weak.y, '#f4df9c', 22);
      if (state.combatWave < 2) { state.combatWave = 2; spawnHunters([{ x: 490, y: 235 }, { x: 1170, y: 420 }], true); feedback('第一处纤维松解 · 两只异常细胞逼近，治疗进度会保留'); }
      else feedback(state.weakpoints.every(p => p.complete) ? '三处结构全部软化 · 可直接启动主流阀，血流会带走干扰者' : '一处纤维结构已经软化', 'good');
    }
    function hurt() {
      if (state.invulnerable > 0 || state.failed || state.finished) return;
      state.integrity = Math.max(0, state.integrity - 20); state.invulnerable = 0.85; state.damageFlash = 0.45; call('effect', state.player.x, state.player.y, '#dc9b91', 12); call('sound', 'miss');
      if (state.integrity <= 0) { state.failed = true; clearInput(); call('fail', '医疗设备耐久耗尽。可从最近安全节点重启，已完成的大型治疗步骤会保留。'); } else feedback('设备受到扑击 · 耐久 ' + state.integrity + '/100', 'bad'); publish(true);
    }
    function updateEnemies(dt) {
      if (!['combat', 'clot'].includes(state.stage) || state.room !== 'main') return;
      if (state.waveDelay > 0) { state.waveDelay = Math.max(0, state.waveDelay - dt); if (state.waveDelay === 0) { spawnHunters([{ x: 800, y: 570 }]); feedback('异常细胞正在寻找医疗单位 · Q 扫描可见弱点'); } return; }
      state.enemies.forEach(enemy => {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt); if (enemy.hp <= 0) return;
        const d = distance(enemy, state.player); enemy.timer -= dt;
        if (enemy.state === 'approach') {
          const covered = blockedSegment(enemy, state.player, 22);
          if (d > 80 || covered) { const destination = hunterDestination(enemy, dt), travel = Math.max(1, distance(enemy, destination)); moveBody(enemy, (destination.x - enemy.x) / travel * 74 * dt, (destination.y - enemy.y) / travel * 74 * dt, 22, true); }
          if (enemy.timer <= 0 && d < 280 && !covered) { enemy.state = 'telegraph'; enemy.timer = 1; enemy.telegraph = 0; enemy.target = { x: state.player.x, y: state.player.y }; }
        } else if (enemy.state === 'telegraph') { enemy.telegraph = clamp(1 - enemy.timer, 0, 1); if (enemy.timer <= 0) { enemy.state = 'lunge'; enemy.timer = 0.55; enemy.hasHit = false; const length = Math.max(1, distance(enemy, enemy.target)); enemy.direction = { x: (enemy.target.x - enemy.x) / length, y: (enemy.target.y - enemy.y) / length }; } }
        else if (enemy.state === 'lunge') { moveBody(enemy, enemy.direction.x * 350 * dt, enemy.direction.y * 350 * dt, 22, true); if (!enemy.hasHit && distance(enemy, state.player) < 36) { enemy.hasHit = true; hurt(); } if (enemy.timer <= 0) { enemy.state = 'recover'; enemy.timer = 1.2; } }
        else if (enemy.timer <= 0) { enemy.state = 'approach'; enemy.timer = 1.5; }
      });
      if (state.stage === 'combat' && state.enemies.length && state.enemies.every(e => e.hp <= 0)) { state.combatComplete = true; state.enemies = []; setStage('clot'); feedback('医疗通路已打开 · 可开始软化结构，留意后续干扰', 'good'); }
    }
    function updateMovement(dt) {
      let x = (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0), y = (state.keys.has('KeyS') || state.keys.has('ArrowDown') ? 1 : 0) - (state.keys.has('KeyW') || state.keys.has('ArrowUp') ? 1 : 0);
      const length = Math.hypot(x, y); if (length > 0) { x /= length; y /= length; }
      const sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight'), speed = state.dashRemaining > 0 ? 450 : state.precision ? 79 : sprint ? 174 : 128;
      if (state.dashRemaining > 0) { x = state.dashDirection.x; y = state.dashDirection.y; } moveBody(state.player, x * speed * dt, y * speed * dt, RADIUS);
      if (state.room === 'heart' && state.dashUnlocked && state.player.y < 300 - RADIUS) state.crossedBarrier = true;
    }
    function advanceHeartbeat(dt) { const b = beat(), previous = Math.floor(state.heartbeatClock / b.period); state.heartbeatClock += dt; if (!b.silent && !playedHeartbeatThisUpdate && Math.floor(state.heartbeatClock / b.period) > previous) { playedHeartbeatThisUpdate = true; call('sound', 'heartbeat'); } }
    function step(dt) {
      state.elapsed += dt; advanceHeartbeat(dt); updateValve(); state.hudTimer -= dt;
      const toolTiming = { cooldown: state.shotCooldown, lease: state.treatmentLease, targetId: state.treatmentTargetId, reloadRemaining: state.reloadRemaining };
      for (const key of ['shotCooldown', 'treatmentLease', 'dashCooldown', 'invulnerable', 'damageFlash', 'noticeTime', 'warningCooldown']) state[key] = Math.max(0, state[key] - dt);
      if (state.shot) { state.shot.age += dt; if (state.shot.age > 0.16) state.shot = null; }
      if (state.reloadRemaining > 0) { state.reloadRemaining = Math.max(0, state.reloadRemaining - dt); if (state.reloadRemaining === 0) { state.ammo = MAGAZINE; feedback('装填完成 · 医疗介质 24/24', 'good'); } }
      if (state.revealRemaining > 0) state.revealRemaining = Math.max(0, state.revealRemaining - dt);
      else if (state.stage === 'burst') { state.burst += dt; if (state.burst >= BURST_TIME) { state.flowRestored = true; state.checkpoint = 'flow'; state.enemies = []; state.waveDelay = 0; setStage('conduction'); call('effect', CLOT.x, CLOT.y, '#f3d4a1', 40); feedback('血栓和干扰者被血流带走 · 心脏入口已经打开', 'good'); } }
      else if (state.stage === 'recovery') {
        state.recovery += dt;
        if (state.recovery >= 1.1 && !state.firstStrongBeat) { state.firstStrongBeat = true; state.heartbeatClock = 0; playedHeartbeatThisUpdate = true; call('sound', 'heartbeatStrong'); call('effect', 900, 620, '#f2dda6', 36); feedback('咚——第一声有力的心跳，正沿传导照亮整座城市', 'good'); }
        if (state.recovery >= RECOVERY_TIME) { state.dashUnlocked = true; state.dashCooldown = 0; setStage('escape'); call('effect', state.player.x, state.player.y, '#f3e3a7', 30); feedback('获得「循环冲刺」· 朝屏障移动并按 Space，穿过恢复的血流', 'good'); call('sound', 'win'); }
      } else if (state.stage === 'ending') {
        const previous = state.ending; state.ending += dt;
        if (state.ending >= 1.8 && previous < 1.8) { state.growth.regrowing = true; feedback('刚被压制的异常组织再次生长 · 信号延伸到肺叶深处'); }
        if (state.ending >= 3.8 && previous < 3.8) feedback('巨人的胸口重新起伏 · 肺部的求救信号仍然微弱');
        if (state.ending >= ENDING_TIME) { state.finished = true; clearInput(); setStage('complete'); call('success'); }
      } else { updateMovement(dt); updateScanner(dt); useTool(dt, toolTiming); updateEnemies(dt); }
      const wasDashing = state.dashRemaining > 0; state.dashRemaining = Math.max(0, state.dashRemaining - dt); if (wasDashing && state.dashRemaining === 0) resolveDashOverlap(); publish(false);
    }
    function update(dt) { if (!Number.isFinite(dt) || dt <= 0 || state.failed || state.finished) return; playedHeartbeatThisUpdate = false; let remaining = dt; while (remaining > 1e-8 && !state.failed && !state.finished) { const slice = Math.min(remaining, 1 / 60); step(slice); remaining -= slice; } }
    function dash() {
      if (!state.dashUnlocked) { warning('循环尚未恢复 · 冲刺能力仍在沉睡'); return; } if (state.dashCooldown > 0) return;
      let x = (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0), y = (state.keys.has('KeyS') || state.keys.has('ArrowDown') ? 1 : 0) - (state.keys.has('KeyW') || state.keys.has('ArrowUp') ? 1 : 0), length = Math.hypot(x, y);
      if (!length) { x = state.aim.x - state.player.x; y = state.aim.y - state.player.y; length = Math.hypot(x, y); } if (!length) { x = 0; y = -1; length = 1; }
      state.dashDirection = { x: x / length, y: y / length }; state.dashRemaining = 0.34; state.dashCooldown = 2.4; call('effect', state.player.x, state.player.y, '#d2edc1', 12); call('sound', 'hit');
    }
    function keyDown(code, repeat = false) { if (state.failed || state.finished || inputLocked()) return; state.keys.add(code); if (repeat) return; if (code === 'KeyQ') { state.scanner = !state.scanner; feedback(state.scanner ? '扫描已开启 · 靠近组织读取症状，敌人弱点将显现' : '扫描已关闭'); publish(true); } else if (code === 'KeyE') interact(); else if (code === 'KeyR') startReload(); else if (code === 'Space') dash(); }
    function keyUp(code) { state.keys.delete(code); }
    function pointerMove(point) { if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) { state.aim = { x: point.x, y: point.y }; const dx = point.x - state.player.x, dy = point.y - state.player.y, length = Math.hypot(dx, dy); if (length > 1e-8) state.aimDirection = { x: dx / length, y: dy / length }; } }
    function pointerDown(point) { if (state.failed || state.finished || inputLocked() || !point) return; pointerMove(point); if (point.button === 2) state.precision = true; else state.firing = true; }
    function pointerUp(point) { pointerMove(point); if (point && point.button === 2) state.precision = false; else state.firing = false; }
    function retryFromCheckpoint() {
      if (state.finished) return false; clearInput(); state.retries++; state.failed = false; state.integrity = 100; state.ammo = MAGAZINE; state.reloadRemaining = 0; state.shotCooldown = 0; state.invulnerable = 1.5;
      state.damageFlash = 0; state.shot = null; state.connection = []; state.conduction = []; state.enemies = []; state.waveDelay = 0; state.combatWave = 0; state.scanner = false;
      state.dashCooldown = 0; state.heartConnected = false; state.dashUnlocked = false; state.crossedBarrier = false; state.burst = 0; state.recovery = 0; state.ending = 0; state.firstStrongBeat = false; state.revealRemaining = 0;
      state.growth = { ...GROWTH, scanned: false, scanProgress: 0, progress: 0, suppressed: false, regrowing: false }; delete state.scanned['heart-signal']; delete state.scanProgress['heart-signal'];
      if (state.checkpoint === 'flow') { state.room = 'heart'; Object.assign(state.player, { x: 900, y: 1020 }); state.flowRestored = true; state.combatComplete = true; state.heartRevealed = true; setStage('conduction'); }
      else if (state.checkpoint === 'bypass') { state.room = 'main'; Object.assign(state.player, { x: 800, y: 830 }); state.flowRestored = false; state.combatComplete = false; state.weakpoints.forEach(p => { p.progress = 0; p.complete = false; }); beginCombat(); }
      else { state.room = 'entry'; Object.assign(state.player, { x: 800, y: 830 }); state.valveSide = 'below'; state.scanned = {}; state.scanProgress = {}; state.bypassA = false; state.bypassB = false; state.flowRestored = false; state.combatComplete = false; state.heartRevealed = false; state.weakpoints.forEach(p => { p.progress = 0; p.complete = false; p.scanned = false; p.scanProgress = 0; }); setStage('diagnosis'); }
      feedback('安全节点重启完成 · 已完成的大型治疗步骤保留', 'good'); publish(true); return true;
    }
    function links() {
      const node = id => [...GEOMETRY.main.nodes, ...GEOMETRY.heart.nodes].find(n => n.id === id), pairs = [], add = (from, to, kind, complete) => pairs.push({ from: { ...node(from) }, to: { ...node(to) }, kind, complete });
      if (state.room === 'main') { if (state.bypassA) add('A1', 'A2', 'bypass', true); if (state.bypassB) add('B1', 'B2', 'bypass', true); }
      if (state.room === 'heart') for (let i = 1; i < state.conduction.length; i++) add(state.conduction[i - 1], state.conduction[i], 'conduction', state.heartConnected); return pairs;
    }
    function cameraCue() {
      if (state.revealRemaining > 0) return { kind: 'reveal', target: { x: 900, y: 640 }, progress: 1 - state.revealRemaining / REVEAL_TIME };
      if (state.stage === 'burst') return { kind: 'burst', target: { ...CLOT }, progress: Math.min(1, state.burst / BURST_TIME) };
      if (state.stage === 'recovery') return { kind: 'recovery', target: { x: 850, y: 690 }, progress: Math.min(1, state.recovery / RECOVERY_TIME) };
      if (state.stage === 'ending') return { kind: 'ending', target: { ...GROWTH }, progress: Math.min(1, state.ending / ENDING_TIME) };
      return { kind: 'follow', target: { x: state.player.x, y: state.player.y }, progress: 0 };
    }
    function snapshot() {
      const nearest = nearbyInteraction(), currentBeat = beat(), hunters = state.enemies.map(e => ({ ...e, weakpoint: enemyWeakpoint(e) })), info = [];
      if (state.scanner) {
        if (state.room === 'entry') GEOMETRY.entry.nodes.filter(n => distance(n, state.player) <= SCAN_RANGE).forEach(n => info.push(state.scanned[n.id] ? diagnosticText(n.id) : n.label + '读取中…'));
        else if (state.room === 'main') { info.push('流量：' + (state.flowRestored ? '畅通' : state.bypassA || state.bypassB ? '部分恢复' : '低流量')); info.push('压力：' + (state.bypassA && state.bypassB ? '安全' : state.bypassA || state.bypassB ? '下降中' : '过高')); if (state.scanned.clot) info.push('结构：' + state.weakpoints.filter(p => p.complete).length + '/3 处已软化'); }
        else {
          info.push(state.scanned['heart-signal'] ? diagnosticText('heart-signal') : '心跳：局部搏动存在 · 信号尚未诊断');
          if (state.crossedBarrier) info.push(state.growth.regrowing ? '异常组织：再次生长 · 肺部出现相同信号' : state.growth.suppressed ? '异常组织：已暂时压制 · 仍有残留信号' : state.growth.scanned ? '异常组织：生长紊乱 · 扫描记录已保留，可持续照射' : '异常组织：等待近距离扫描');
        }
      } else {
        if (state.room === 'heart' && state.scanned['heart-signal']) info.push(diagnosticText('heart-signal'));
        if (state.room === 'heart' && state.crossedBarrier && state.growth.scanned && state.stage === 'escape') info.push('异常组织已识别 · 可直接照射暂时压制');
      }
      const walls = GEOMETRY[state.room].obstacles.filter(o => o.kind !== 'clot' || !state.flowRestored).map(o => ({ ...o, blocking: o.kind !== 'dashBarrier' || state.dashRemaining <= 0, dashPassable: o.kind === 'dashBarrier' && state.dashUnlocked }));
      if (state.room === 'entry') walls.push({ ...VALVE, blocking: !currentBeat.safe });
      return {
        type: 'heartJourney', area: { ...AREA }, bounds: { ...bounds() }, worldSize: { ...GEOMETRY[state.room].size }, room: state.room, roomLabel: ROOMS[state.room],
        player: { ...state.player, dashing: state.dashRemaining > 0, invulnerable: state.invulnerable > 0 }, aim: { ...state.aim }, scanner: state.scanner, scanOn: state.scanner, precision: state.precision, toolPreview: resolveToolRay(), guidance: guidance(),
        beat: currentBeat, stage: state.stage, phase: state.stage, stageLabel: STAGES[state.stage], task: task(), integrity: state.integrity, health: state.integrity, ammo: state.ammo, reloadRemaining: state.reloadRemaining,
        nodes: nodeList(), portals: portalList(), obstacles: walls, valves: state.room === 'entry' ? [{ ...VALVE, open: currentBeat.safe, blocking: !currentBeat.safe, enteredFrom: state.valveSide }] : [],
        paths: GEOMETRY[state.room].paths.map(p => ({ ...copy(p), active: p.branch ? p.branch === 'A' ? state.bypassA : state.bypassB : true, flow: p.flow === undefined ? state.flowRestored ? 1 : p.kind === 'bypass' ? (p.branch === 'A' ? state.bypassA : state.bypassB) ? 0.7 : 0.05 : 0.14 : p.flow })),
        enemies: state.room === 'main' ? hunters : [], hunters,
        clot: { ...CLOT, scanned: !!state.scanned.clot, scanProgress: state.scanProgress.clot || 0, removed: state.flowRestored, burst: state.burst, weakpoints: state.weakpoints.map(p => ({ ...p })) }, weakpoints: state.weakpoints.map(p => ({ ...p })),
        growth: { ...state.growth, state: state.growth.regrowing ? 'regrowing' : state.growth.suppressed ? 'suppressed' : state.growth.scanned ? 'activated' : 'dormant' }, links: links(),
        checkpoint: state.checkpoint, checkpointLabel: CHECKPOINTS[state.checkpoint], retries: state.retries, elapsed: state.elapsed,
        dashUnlocked: state.dashUnlocked, dashCooldown: state.dashCooldown, dashRemaining: state.dashRemaining, crossedBarrier: state.crossedBarrier,
        burst: state.burst, burstDuration: BURST_TIME, recovery: state.recovery, recoveryDuration: RECOVERY_TIME, ending: state.ending, endingDuration: ENDING_TIME,
        revealRemaining: state.revealRemaining, reveal: state.heartRevealed ? REVEAL_TIME - state.revealRemaining : 0, revealDuration: REVEAL_TIME, inputLocked: inputLocked(), cameraCue: cameraCue(), firstStrongBeat: state.firstStrongBeat,
        endingScene: state.ending >= 3.8 ? 'exterior' : state.growth.regrowing ? 'regrowth' : 'suppressed',
        flowRestored: state.flowRestored, bypassA: state.bypassA, bypassB: state.bypassB, flow: state.flowRestored ? 'open' : state.bypassA || state.bypassB ? 'partial' : 'low', pressure: state.bypassA && state.bypassB ? 'safe' : state.bypassA || state.bypassB ? 'falling' : 'high', heartbeat: currentBeat.state,
        combatWave: state.combatWave, combatComplete: state.combatComplete, heartConnected: state.heartConnected, scanned: { ...state.scanned }, connection: [...state.connection], conduction: [...state.conduction], keys: [...state.keys], scannerInfo: info, nearestId: nearest ? nearest.id : null,
        interactionHint: nearest ? 'E · ' + nearest.label + (nearest.locked ? '（' + nearest.requires + '）' : '') : state.room === 'entry' ? 'Q 观察支路症状 · 在瓣膜舒张时通过' : 'WASD 移动 · Q 扫描 · 靠近后 E 交互',
        notice: state.noticeTime > 0 ? state.notice : '', noticeTime: state.noticeTime, shot: state.shot ? copy(state.shot) : null, damageFlash: state.damageFlash, failed: state.failed, finished: state.finished, progress: progress(), toolRange: TOOL_RANGE, scanRange: SCAN_RANGE, interactRange: INTERACT_RANGE
      };
    }
    function draw(ctx, time, view) { const renderer = window.GiantCureJourneyArt; if (renderer && typeof renderer.draw === 'function') renderer.draw(ctx, snapshot(), time, view); }
    setStage('diagnosis'); feedback('两条支路的节律并不相同 · WASD 移动，Q 观察流量与压力');
    return { update, draw, pointerDown, pointerMove, pointerUp, pointerCancel: clearInput, clearInput, keyDown, keyUp, retryFromCheckpoint, getDebugState: () => freeze(copy(snapshot())) };
  };
})();
