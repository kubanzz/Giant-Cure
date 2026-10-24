// Heart Journey controller: input, collision and particles use world coordinates.
(function () {
  'use strict';
  const AREA = { x: 24, y: 84, w: 1232, h: 552 };
  const RADIUS = 14, SCAN_RANGE = 145, SCAN_TIME = 1.35, INTERACT_RANGE = 64;
  const TOOL_RANGE = 225, MAGAZINE = 24, RELOAD_TIME = 1.7;
  const HUNTER_HP = 9, SPAWN_WARNING = 1, SPAWN_INTERVAL = 1.2;
  const REVEAL_TIME = 1.5, BURST_TIME = 4, RECOVERY_TIME = 6;
  const EXTERIOR_START = 3.8, EXTERIOR_DURATION = 8, ENDING_TIME = EXTERIOR_START + EXTERIOR_DURATION;
  const STAGES = { diagnosis: '探索与诊断', bypass: '疏通侧支', supply: '接收外部补给', clot: '分层处理血栓', burst: '主血流恢复', conduction: '追踪传导中断', recovery: '传导复测与复苏', escape: '循环冲刺', ending: '肺部求救信号', complete: '心脏已复苏' };
  const ROOMS = { entry: '血管入口', main: '主血管与侧支', heart: '心脏内腔' };
  const CHECKPOINTS = { entry: '血管入口', bypass: '侧支分流恢复', flow: '主血流恢复' };
  const TASKS = {
    diagnosis: '血流正在变弱 · 对比支路的流量与压力，找到异常方向',
    bypass: '沿侧支找到局部阻塞 · 任选一条，用 1 精准治疗器疏通',
    supply: '侧支已分流降压 · 外部注射的裂解工具正沿血流送来',
    clot: '观察包裹层与核心 · 2 裂解纤维，1 处理暴露的核心',
    burst: '主血流正在带走淤堵 · 下游重新得到灌流',
    conduction: '追踪脉冲在何处中断 · 检查输入与输出，用 3 修复探针处理',
    recovery: '修复后复测 · 观察三次脉冲抵达下游与心腔复苏',
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
        { id: 'A2', x: 300, y: 270, label: '西侧支 · 局部阻塞', kind: 'branch' },
        { id: 'B2', x: 1300, y: 270, label: '东侧支 · 局部阻塞', kind: 'branch' },
        { id: 'release', x: 800, y: 690, label: '主流阀', kind: 'release' }
      ],
      obstacles: [
        { id: 'clot', x: 680, y: 280, w: 240, h: 210, kind: 'clot' },
        { id: 'main-island-l', x: 450, y: 590, w: 170, h: 150, kind: 'tissue' },
        { id: 'main-island-r', x: 990, y: 590, w: 170, h: 150, kind: 'tissue' },
        { id: 'main-rib-l', x: 80, y: 480, w: 250, h: 70, kind: 'tissue' },
        { id: 'main-rib-r', x: 1280, y: 480, w: 240, h: 70, kind: 'tissue' },
        { id: 'left-branch-cover', x: 380, y: 225, w: 60, h: 115, kind: 'tissue' }
      ],
      paths: [
        { id: 'main-flow', points: [{ x: 800, y: 900 }, { x: 800, y: 140 }], kind: 'main', width: 210 },
        { id: 'bypass-a', points: [{ x: 800, y: 830 }, { x: 300, y: 780 }, { x: 360, y: 600 }, { x: 360, y: 430 }, { x: 300, y: 400 }, { x: 300, y: 270 }, { x: 300, y: 190 }, { x: 450, y: 190 }, { x: 800, y: 140 }], kind: 'bypass', branch: 'A', width: 100 },
        { id: 'bypass-b', points: [{ x: 800, y: 830 }, { x: 1300, y: 780 }, { x: 1240, y: 600 }, { x: 1240, y: 430 }, { x: 1300, y: 400 }, { x: 1300, y: 270 }, { x: 800, y: 140 }], kind: 'bypass', branch: 'B', width: 100 }
      ]
    },
    heart: {
      size: { w: 1800, h: 1200, width: 1800, height: 1200 },
      bounds: { x: 80, y: 80, w: 1640, h: 1040, left: 80, right: 1720, top: 80, bottom: 1120 },
      nodes: [
        { id: 'heart-signal', x: 900, y: 700, label: '心脏信号', kind: 'diagnostic', symptom: '局部搏动存在 · 传导信号中断' },
        { id: 'C1', x: 600, y: 900, label: '上游采样点', kind: 'sample' },
        { id: 'C2', x: 1180, y: 730, label: '中段采样点', kind: 'sample' },
        { id: 'C3', x: 780, y: 500, label: '下游采样点', kind: 'sample' }
      ],
      obstacles: [
        { id: 'heart-island', x: 770, y: 790, w: 220, h: 130, kind: 'tissue' },
        { id: 'exit-barrier', x: 80, y: 300, w: 1640, h: 36, kind: 'dashBarrier' }
      ],
      paths: [{ id: 'heart-flow', points: [{ x: 900, y: 1100 }, { x: 1040, y: 780 }, { x: 1150, y: 500 }, { x: 1400, y: 160 }], kind: 'main', width: 160 }]
    }
  };
  const VALVE = { id: 'entry-valve', x: 990, y: 390, w: 280, h: 32, kind: 'valve', label: '心跳瓣膜' };
  const CLOT = { x: 800, y: 380, radius: 116 };
  const GROWTH = { id: 'growth', x: 1300, y: 180, radius: 35, label: '异常组织' };
  const WEAKPOINTS = [
    { id: 'W1', x: 700, y: 318, label: '外层纤维', kind: 'fiber', requiredTool: 'sprayer', duration: 2.4 },
    { id: 'W2', x: 902, y: 382, label: '侧面纤维', kind: 'fiber', requiredTool: 'sprayer', duration: 2.4 },
    { id: 'W3', x: 800, y: 473, label: '暴露核心', kind: 'core', requiredTool: 'precision', duration: 3.2 }
  ];
  const BRANCHES = [
    { id: 'left', nodeId: 'A2', x: 300, y: 270, radius: 28, label: '西侧支局部阻塞', duration: 4, requiredTool: 'precision' },
    { id: 'right', nodeId: 'B2', x: 1300, y: 270, radius: 28, label: '东侧支局部阻塞', duration: 2.4, requiredTool: 'precision' }
  ];
  const FAULT = { id: 'conduction-fault', room: 'heart', x: 1020, y: 638, radius: 30, label: '传导中断段', requiredTool: 'probe', duration: 2.4 };
  const CHEST = { id: 'medical-chest', room: 'entry', x: 400, y: 500, label: '可选医疗装备箱' };
  const TOOLS = [
    { id: 'precision', label: '精准治疗枪', description: '疏通侧支、处理暴露核心；恢复期瞄准 Hunter 弱点', key: '1', range: TOOL_RANGE },
    { id: 'sprayer', label: '纤维裂解喷头', description: '近距离扇形裂解纤维；可同时压制无遮挡的异常细胞', key: '2', range: 145 },
    { id: 'probe', label: '导电脉冲探针', description: '修复输入正常、输出中断的传导段', key: '3', range: TOOL_RANGE }
  ];
  const SPAWN_POINTS = {
    main: [{ x: 1120, y: 450 }, { x: 490, y: 235 }, { x: 1170, y: 380 }, { x: 200, y: 190 }, { x: 1410, y: 190 }, { x: 420, y: 850 }, { x: 1190, y: 850 }, { x: 800, y: 570 }, { x: 800, y: 210 }],
    heart: [{ x: 350, y: 550 }, { x: 1450, y: 550 }, { x: 1300, y: 980 }, { x: 350, y: 1040 }, { x: 1600, y: 850 }, { x: 700, y: 390 }, { x: 1200, y: 420 }]
  };
  const freshEncounters = () => ({
    main: { cap: 4, budget: 10, queue: [], warning: null, cooldown: 0, attackCooldown: 0, triggered: {}, spawned: 0, closed: false },
    heart: { cap: 3, budget: 3, queue: [], warning: null, cooldown: 0, attackCooldown: 0, triggered: {}, spawned: 0, closed: false }
  });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const copy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

  window.GiantCureGames = window.GiantCureGames || {};
  window.GiantCureGames.heartJourney = function createHeartJourney(api) {
    const state = {
      room: 'entry', stage: 'diagnosis', player: { x: 800, y: 830, radius: RADIUS, velocity: { x: 0, y: 0 }, moving: false, walkDistance: 0 }, aim: { x: 1120, y: 640 }, aimDirection: { x: 0, y: -1 }, keys: new Set(), firing: false, precision: false,
      scanner: false, scanned: {}, scanProgress: {}, bypassA: false, bypassB: false, connection: [], conduction: [], heartConnected: false, flowRestored: false,
      branches: BRANCHES.map(p => ({ ...p, progress: 0, complete: false, scanned: false, scanProgress: 0 })),
      fault: { ...FAULT, progress: 0, complete: false, scanned: false, scanProgress: 0, input: true, output: false },
      tool: 'precision', unlockedTools: { precision: true, sprayer: false, probe: false }, equipment: null, shield: 0, chestClaimed: false,
      supplies: [
        { id: 'lysis', room: 'main', label: '外部注射 · 纤维裂解喷头', tool: 'sprayer', state: 'waiting', route: [], x: 800, y: 830, progress: 0 },
        { id: 'probe', room: 'heart', label: '外部注射 · 导电脉冲探针', tool: 'probe', state: 'waiting', route: [{ x: 900, y: 1060 }, { x: 1060, y: 950 }, { x: 1040, y: 740 }], x: 900, y: 1060, progress: 0 }
      ],
      verifiedBeats: 0, downstreamReceived: false, signalPulses: [], signalSerial: 0, reloadAutomatic: false,
      weakpoints: WEAKPOINTS.map(p => ({ ...p, scanned: false, scanProgress: 0, progress: 0, complete: false })),
      growth: { ...GROWTH, scanned: false, scanProgress: 0, progress: 0, suppressed: false, regrowing: false },
      integrity: 100, ammo: MAGAZINE, reloadRemaining: 0, reloadStage: 'idle', emptyLatched: false, shotCooldown: 0, enemies: [], enemySerial: 0, spawnSerial: 0, encounters: freshEncounters(), combatWave: 0, waveDelay: 0, combatComplete: false,
      elapsed: 0, heartbeatClock: 0, checkpoint: 'entry', retries: 0, dashUnlocked: false, dashRemaining: 0, dashCooldown: 0, dashDirection: { x: 0, y: -1 },
      crossedBarrier: false, burst: 0, recovery: 0, ending: 0, invulnerable: 0, revealRemaining: 0, heartRevealed: false, firstStrongBeat: false, valveSide: 'below',
      damageFlash: 0, notice: '', noticeTime: 0, warningCooldown: 0, shot: null, treatmentLease: 0, treatmentTargetId: null, treatmentTargetIds: [], failed: false, finished: false, lastProgress: -1, hudTimer: 0
    };
    let playedHeartbeatThisUpdate = false;
    function call(name, ...args) { if (typeof api[name] === 'function') api[name](...args); }
    function feedback(text, kind = 'info') { state.notice = text; state.noticeTime = 3.6; call('feedback', text, kind); }
    function task() {
      if (state.stage === 'diagnosis' && state.room === 'main') return '主流被堵塞 · 扫描血栓，确认高压的来源';
      const guide = guidance(); if (guide) return guide.text;
      if (state.stage === 'recovery') return '传导复测：' + state.verifiedBeats + '/3 拍已抵达下游 · 灯窗与植物正在苏醒';
      if (state.stage === 'escape' && state.crossedBarrier) return state.growth.scanned ? '出口组织会再生 · 用 1 精准治疗器暂时压制，观察后续反应' : '出口组织仍有异常 · Q 扫描生长变化，选择针对工具';
      if (state.stage === 'clot' && state.weakpoints.every(p => p.complete)) return '核心与包裹层均已处理 · 回到主流阀，释放血流';
      if (state.stage === 'clot' && fibersComplete()) return '包裹层已裂解，核心已暴露 · 切换 1 精准治疗器处理核心';
      return TASKS[state.stage];
    }
    function guidance() {
      if (state.room === 'entry' && state.scanned.pressure) { const target = portalList().find(p => p.id === 'to-main'); return { kind: 'portal', label: '主血管', text: '异常方向已确认 · 经瓣膜后的入口返回主血管', source: null, target, waiting: false }; }
      if (state.room === 'main' && state.flowRestored) { const target = portalList().find(p => p.id === 'to-heart'); return { kind: 'portal', label: '心脏内腔', text: '主血流已恢复 · 进入心脏内腔继续巡诊', source: null, target, waiting: false }; }
      const supply = state.supplies.find(s => s.room === state.room && s.state === 'ready');
      if (supply) return { kind: 'supply', label: '外部补给', text: supply.label + '已抵达 · 靠近按 E 领取（本次巡诊保留，无限备药）', source: null, target: { id: supply.id, x: supply.x, y: supply.y, label: supply.label }, waiting: false };
      if (state.room === 'main' && state.stage === 'clot' && state.weakpoints.every(p => p.complete)) {
        const target = GEOMETRY.main.nodes.find(n => n.id === 'release');
        return { kind: 'release', label: '释放主流', text: '包裹层与核心均已处理 · 回到主流阀释放血流', source: null, target: { ...target }, waiting: false };
      }
      if (state.room === 'heart' && state.stage === 'conduction' && state.fault.scanned && state.unlockedTools.probe && !state.fault.complete) return { kind: 'fault', label: '传导中断', text: '该段输入有脉冲、输出中断 · 用 3 修复探针处理此处', source: null, target: { id: state.fault.id, x: state.fault.x, y: state.fault.y, label: state.fault.label }, waiting: false };
      return null;
    }
    function fibersComplete() { return state.weakpoints.filter(p => p.kind === 'fiber').every(p => p.complete); }
    function branchRestored() { return state.bypassA || state.bypassB; }
    function reloadDuration() { return state.equipment === 'steady' ? 1.2 : RELOAD_TIME; }
    function toolDefinition() { return TOOLS.find(t => t.id === state.tool); }
    function chooseEquipment(id) {
      if (!['gel', 'steady'].includes(id) || state.chestClaimed || state.failed || state.finished || state.room !== CHEST.room || distance(state.player, CHEST) > INTERACT_RANGE) return false;
      const remainingFraction = state.reloadRemaining > 0 ? state.reloadRemaining / reloadDuration() : 0;
      state.chestClaimed = true; state.equipment = id; if (id === 'gel') state.shield = 20;
      if (state.reloadRemaining > 0) state.reloadRemaining = remainingFraction * reloadDuration();
      clearInput(); feedback(id === 'gel' ? '已装备缓冲凝胶 · 20 点护盾承担首次伤害，检查点重启后恢复' : '已装备稳流药匣 · 装填时间缩短为 1.2 秒', 'good'); publish(true); return true;
    }
    function requestSupply(id, branch) {
      const supply = state.supplies.find(s => s.id === id); if (!supply || supply.state !== 'waiting') return;
      if (id === 'lysis') supply.route = branch.id === 'left' ? [{ x: 800, y: 830 }, { x: 300, y: 780 }, { x: 360, y: 600 }, { x: 360, y: 430 }, { x: 300, y: 400 }, { x: 300, y: 270 }, { x: 350, y: 250 }] : [{ x: 800, y: 830 }, { x: 1300, y: 780 }, { x: 1240, y: 600 }, { x: 1240, y: 430 }, { x: 1300, y: 400 }, { x: 1300, y: 270 }, { x: 1210, y: 250 }];
      supply.state = 'transit'; supply.progress = 0; Object.assign(supply, supply.route[0]);
      feedback('外部医生已注射' + (id === 'lysis' ? '裂解补给 · 胶囊正沿恢复的侧支进入' : '修复补给 · 胶囊正在沿血流进入心腔'), 'good');
    }
    function updateSupplies(dt) {
      state.supplies.forEach(supply => {
        if (supply.state !== 'transit') return;
        supply.progress = Math.min(1, supply.progress + dt / 3);
        const lengths = supply.route.slice(1).map((p, i) => distance(p, supply.route[i])), total = lengths.reduce((n, v) => n + v, 0);
        let remaining = total * supply.progress;
        for (let i = 0; i < lengths.length; i++) {
          if (remaining <= lengths[i] || i === lengths.length - 1) { const f = lengths[i] > 0 ? clamp(remaining / lengths[i], 0, 1) : 1, a = supply.route[i], b = supply.route[i + 1]; supply.x = a.x + (b.x - a.x) * f; supply.y = a.y + (b.y - a.y) * f; break; }
          remaining -= lengths[i];
        }
        if (supply.progress >= 1) { supply.state = 'ready'; feedback(supply.label + '已经抵达 · 靠近胶囊按 E 领取', 'good'); }
      });
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
    function clearInput() { state.keys.clear(); state.firing = false; state.precision = false; state.emptyLatched = false; state.player.velocity = { x: 0, y: 0 }; state.player.moving = false; state.treatmentLease = 0; state.treatmentTargetId = null; state.treatmentTargetIds = []; if (state.dashRemaining > 0) resolveDashOverlap(); state.dashRemaining = 0; }
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
      if (state.flowRestored) return 0.78 + state.fault.progress * 0.1;
      if (state.stage === 'burst') return 0.74 + Math.min(1, state.burst / BURST_TIME) * 0.04;
      if (state.unlockedTools.sprayer) return 0.4 + state.weakpoints.reduce((sum, p) => sum + p.progress, 0) * 0.11;
      if (branchRestored()) return 0.32;
      if (state.stage === 'bypass') return 0.14 + Math.max(...state.branches.map(p => p.progress)) * 0.17;
      return ['flow', 'pressure', 'clot'].filter(id => state.scanned[id]).length * 0.04;
    }
    function publish(force) {
      const value = progress(); if (force || Math.abs(value - state.lastProgress) > 0.001) { call('progress', value); state.lastProgress = value; }
      if (force || state.hudTimer <= 0) { call('setTask', task()); call('hud', { integrity: state.integrity, shield: state.shield, ammo: state.ammo, reloadRemaining: state.reloadRemaining, reloadProgress: reloadProgress(), reloadStage: state.reloadStage, reloadDuration: reloadDuration(), reloadAutomatic: state.reloadAutomatic, tool: state.tool, tools: TOOLS.map(t => ({ ...t, unlocked: !!state.unlockedTools[t.id] })), equipment: state.equipment, scanner: state.scanner, stageLabel: STAGES[state.stage], roomLabel: ROOMS[state.room], task: task(), checkpoint: CHECKPOINTS[state.checkpoint], checkpointId: state.checkpoint, retries: state.retries, heartbeatState: beat().state, dashUnlocked: state.dashUnlocked }); state.hudTimer = 0.1; }
    }
    function portalList(room = state.room) {
      if (room === 'entry') return [{ id: 'to-main', x: 1130, y: 220, label: '主血管', locked: !state.scanned.pressure, requires: '扫描异常通路，确认流量与压力' }];
      if (room === 'main') return [{ id: 'to-entry', x: 800, y: 870, label: '血管入口', locked: false }, { id: 'to-heart', x: 800, y: 140, label: '心脏内腔', locked: !state.flowRestored, requires: '主血管仍被淤堵阻断' }];
      return [{ id: 'to-main', x: 900, y: 1070, label: '主血管', locked: false }, { id: 'exit', x: 1510, y: 150, label: '下一封病历', locked: !state.growth.suppressed, requires: state.crossedBarrier ? '出口附近的异常组织需要检查' : '心脏恢复后才能穿过血流屏障' }];
    }
    function nodeList() {
      return GEOMETRY[state.room].nodes.map(node => {
        const branch = state.branches.find(p => p.nodeId === node.id), complete = branch ? branch.complete : node.kind === 'sample' ? state.heartConnected : node.id === 'release' ? state.flowRestored : !!state.scanned[node.id];
        const symptom = branch ? branch.complete ? '血流已贯通 · 上游压力安全' : '局部阻塞 · 精准治疗可疏通' : node.kind === 'sample' ? sampleState(node.id).label : node.kind === 'diagnostic' && state.scanned[node.id] ? diagnosticText(node.id) : node.symptom;
        return { ...node, symptom, scanned: branch ? branch.scanned : !!state.scanned[node.id], complete, active: !complete, selected: false, progress: branch ? branch.progress : complete ? 1 : state.scanProgress[node.id] || 0 };
      });
    }
    function nearbyInteraction() {
      const candidates = [...nodeList(), ...portalList(), ...state.supplies.filter(s => s.room === state.room && s.state === 'ready').map(s => ({ ...s, kind: 'supply' }))];
      if (state.room === CHEST.room && !state.chestClaimed) candidates.push({ ...CHEST, kind: 'chest' });
      if (state.room === 'heart') candidates.push({ ...state.fault, kind: 'fault' });
      if (state.room === 'heart' && state.crossedBarrier) candidates.push({ ...GROWTH, kind: 'growth' });
      return candidates.filter(item => distance(item, state.player) <= INTERACT_RANGE).sort((a, b) => distance(a, state.player) - distance(b, state.player))[0] || null;
    }
    function enterRoom(room) {
      clearInput(); const previous = state.room; state.room = room;
      Object.assign(state.player, room === 'entry' ? { x: 1130, y: 270 } : room === 'main' ? previous === 'heart' ? { x: 800, y: 180 } : { x: 800, y: 830 } : { x: 900, y: 1020 });
      if (room === 'heart' && !state.heartRevealed) { state.heartRevealed = true; state.revealRemaining = REVEAL_TIME; }
      if (room === 'main' && !state.flowRestored) queueEncounter('main', 'arrival', 1);
      if (room === 'entry') state.valveSide = 'above';
      feedback(room === 'heart' ? '沿发光脉冲找出中断位置 · 采样点只读状态，无需依次连接' : ROOMS[room] + ' · Q 观察变化，鼠标治疗，E 领取或过门'); publish(true);
    }
    function interactNode(node) {
      if (node.kind === 'diagnostic') { feedback(state.scanned[node.id] ? diagnosticText(node.id) : 'Q 开启扫描，在附近停留以读取组织状态'); return; }
      if (node.kind === 'chest') { clearInput(); call('offerEquipment'); return; }
      if (node.kind === 'supply') {
        const supply = state.supplies.find(s => s.id === node.id); if (!supply || supply.state !== 'ready') return;
        supply.state = 'collected'; state.unlockedTools[supply.tool] = true; state.tool = supply.tool; clearInput();
        if (supply.id === 'lysis') { state.combatComplete = true; queueEncounter('main', 'lysis-collected', 3); setStage('clot'); }
        feedback(supply.label + '已领取 · ' + (supply.tool === 'sprayer' ? '2 切换裂解喷雾，针对纤维包裹层' : '3 切换修复探针，处理脉冲输出中断处'), 'good'); publish(true); return;
      }
      if (node.kind === 'growth') { feedback('1 精准治疗可暂时压制 · Q 查看生长前后的变化'); return; }
      if (node.kind === 'branch') { feedback(state.branches.find(p => p.nodeId === node.id).complete ? '该侧支已疏通 · 血流正持续通过' : '这是局部阻塞 · 瞄准并用 1 精准治疗器疏通，无需 E 连接'); return; }
      if (node.kind === 'sample') { feedback(sampleState(node.id).label + ' · 沿脉冲继续追踪，不需要依次按 E'); return; }
      if (node.kind === 'fault') { feedback(state.fault.complete ? '输入与输出均已恢复 · 正在随心跳复测' : '输入有脉冲、输出中断 · 需要修复探针，扫描可请求外部补给'); return; }
      if (node.kind === 'release') {
        if (state.flowRestored) { feedback('主血流畅通 · 心脏入口已经打开', 'good'); return; }
        if (!branchRestored()) { feedback('上游压力仍高 · 先疏通任一侧支，让血流有分流通路'); return; }
        if (!state.weakpoints.every(p => p.complete)) { feedback('包裹层或核心仍未处理 · 分层治疗后再启动主流'); return; }
        state.burst = 0.001; closeEncounter('main'); clearInput(); setStage('burst'); feedback('压力安全，结构已软化 · 主血流将带走碎屑和干扰者', 'good'); call('sound', 'hit');
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
      if (id === 'pressure') return state.flowRestored ? '通路已恢复：流量稳定、压力安全 · 血液重新抵达下游' : branchRestored() ? '分流已恢复：压力安全 · 一条贯通的侧支已能承担分流' : '异常通路：低流量、上游高压 · 瓣膜后的主血管存在阻力';
      if (id === 'clot') return state.flowRestored ? '主血管：血栓已移除 · 下游灌流恢复' : !branchRestored() ? '上游鼓胀、下游缺血 · 主流受阻，沿两侧寻找可疏通的通路' : fibersComplete() ? '纤维包裹层已裂解 · 暴露核心对精准治疗有反应' : '分流压力安全 · 外层和侧面纤维包裹核心，需要裂解喷雾';
      if (id === 'heart-signal') {
        if (state.ending >= EXTERIOR_START || state.finished) return '心脏：同步搏动稳定 · 巨人胸口重新起伏，肺部仍需巡诊';
        if (state.growth.regrowing) return '心脏：同步搏动稳定 · 异常组织再次生长，信号延伸至肺部';
        if (state.growth.suppressed) return '心脏：同步搏动稳定 · 出口异常组织已暂时压制';
        if (state.dashUnlocked) return '心脏：传导完整、同步搏动稳定 · 循环冲刺已恢复';
        if (state.heartConnected) return '心脏：传导已接通 · ' + (state.firstStrongBeat ? '有力心跳正唤醒灯火与植物' : '等待第一声有力的心跳');
        return '心腔：上游脉冲存在，下游无响应 · 沿传导路径比较输入与输出';
      }
      if (['C1', 'C2', 'C3'].includes(id)) return sampleState(id).label;
      return '组织：' + (state.scanned[id] ? '状态可读取' : '等待近距离检查');
    }
    function sampleState(id) {
      const downstream = id === 'C3', receiving = !downstream || state.downstreamReceived;
      return { input: receiving, output: receiving, healthy: receiving, label: (id === 'C1' ? '上游' : id === 'C2' ? '中段' : '下游') + (receiving ? '：输入与输出均有脉冲' : state.fault.complete ? '：传导已修复，等待首个真实脉冲抵达' : '：没有脉冲抵达 · 沿路径向上游追查') };
    }
    function scanTarget(target, dt, onComplete) { if (distance(target, state.player) > SCAN_RANGE || target.scanned) return; target.scanProgress = Math.min(1, (target.scanProgress || 0) + dt / SCAN_TIME); if (target.scanProgress >= 1) { target.scanned = true; if (onComplete) onComplete(); } }
    function updateScanner(dt) {
      if (!state.scanner) return;
      GEOMETRY[state.room].nodes.forEach(node => { if (node.kind === 'branch' || distance(node, state.player) > SCAN_RANGE || state.scanned[node.id]) return; state.scanProgress[node.id] = Math.min(1, (state.scanProgress[node.id] || 0) + dt / SCAN_TIME); if (state.scanProgress[node.id] >= 1) { state.scanned[node.id] = true; if (node.kind === 'diagnostic' || node.kind === 'sample') feedback(diagnosticText(node.id)); if (node.id === 'heart-signal') requestSupply('probe'); } });
      if (state.room === 'main') {
        if (!state.scanned.clot && distance(state.player, CLOT) <= 230) { state.scanProgress.clot = Math.min(1, (state.scanProgress.clot || 0) + dt / SCAN_TIME); if (state.scanProgress.clot >= 1) { state.scanned.clot = true; feedback(diagnosticText('clot')); } }
        state.branches.forEach(p => scanTarget(p, dt, () => feedback(p.complete ? p.label + '已贯通，血流能够通过' : p.label + '：局部堵塞 · 1 精准治疗可疏通；两条路线任选其一')));
        state.weakpoints.forEach(p => scanTarget(p, dt, () => feedback(p.kind === 'fiber' ? p.label + '：包裹核心的纤维 · 2 裂解喷雾有效' : fibersComplete() ? '核心已暴露 · 1 精准治疗可处理' : '核心被纤维包裹 · 先处理外层与侧面纤维')));
      }
      if (state.room === 'heart') scanTarget(state.fault, dt, () => { feedback(state.fault.complete ? '该段脉冲已恢复通过 · 输入与输出一致' : '已定位：输入有脉冲、输出中断 · 这处才是故障，不是下游采样点'); requestSupply('probe'); });
      if (state.room === 'heart' && state.crossedBarrier && state.stage === 'escape') scanTarget(state.growth, dt, () => feedback('异常组织：生长紊乱 · 治疗只能暂时抑制它'));
      if (state.stage === 'diagnosis' && state.scanned.clot) { setStage('bypass'); feedback('主流阻力已确认 · 侧支中存在局部堵塞，疏通任一条即可分流'); }
    }
    function reloadProgress() { return state.reloadRemaining > 0 ? clamp(1 - state.reloadRemaining / reloadDuration(), 0, 1) : 0; }
    function startReload(automatic = false) { if (state.reloadRemaining > 0 || state.ammo === MAGAZINE || state.failed || state.finished || inputLocked() || automatic && state.treatmentLease > 1e-8) return; if (!automatic) { state.treatmentLease = 0; state.treatmentTargetIds = []; state.treatmentTargetId = null; } state.reloadRemaining = reloadDuration(); state.reloadStage = 'eject'; state.reloadAutomatic = automatic; call('sound', 'reloadOut'); feedback(automatic ? '药匣已空 · 自动装填中，可继续移动躲避' : '主动装填 · 卸下药匣 → 装入介质 → 锁定就绪'); publish(true); }
    function warning(text) { if (state.warningCooldown <= 0) { state.warningCooldown = 2; feedback(text); } }
    function enemyWeakpoint(enemy) { const direction = enemy.direction || { x: 0, y: 1 }, angle = Math.atan2(direction.y, direction.x) + Math.PI / 2; return { x: enemy.x + Math.cos(angle) * 16, y: enemy.y + Math.sin(angle) * 16, radius: 10, exposed: enemy.state === 'recover' }; }
    function circleHit(from, to, center, radius) {
      const dx = to.x - from.x, dy = to.y - from.y, ox = from.x - center.x, oy = from.y - center.y, a = dx * dx + dy * dy, c = ox * ox + oy * oy - radius * radius;
      if (c <= 0) return 0;
      const b = ox * dx + oy * dy, discriminant = b * b - a * c;
      if (a < 1e-12 || discriminant < 0) return null;
      const t = (-b - Math.sqrt(discriminant)) / a; return t >= 0 && t <= 1 ? t : null;
    }
    // Preview, fan outline and every delivered dose share these first-entity queries.
    function treatmentEndpoints() {
      if (state.room === 'main') return [
        ...state.branches.filter(p => !p.complete).map(p => ({ ...p, treatmentKind: 'branch', available: true })),
        ...(!state.flowRestored ? state.weakpoints.filter(p => !p.complete).map(p => ({ ...p, radius: 25, treatmentKind: p.kind, available: branchRestored() && (p.kind !== 'core' || fibersComplete()) })) : [])
      ];
      if (state.room === 'heart') return [
        ...(!state.fault.complete ? [{ ...state.fault, treatmentKind: 'fault', available: true }] : []),
        ...(state.stage === 'escape' && state.crossedBarrier ? [{ ...state.growth, requiredTool: 'precision', duration: 1.5, treatmentKind: 'growth', available: true }] : [])
      ];
      return [];
    }
    function resolveRay(direction, range) {
      const from = { x: state.player.x, y: state.player.y }, far = { x: from.x + direction.x * range, y: from.y + direction.y * range }, candidates = [];
      const endpoints = treatmentEndpoints().map(p => ({ p, t: circleHit(from, far, p, p.radius || 25) })).filter(item => item.t !== null).sort((a, b) => a.t - b.t);
      const structural = endpoints.find(item => ['fiber', 'core'].includes(item.p.treatmentKind));
      const wall = wallHit(from, far, 0, structural ? 'clot' : '');
      if (wall) candidates.push({ t: wall.t, priority: 0, hitType: wall.rect.kind === 'clot' ? 'clot' : 'wall', targetId: wall.rect.id, weakpoint: false, blocked: true, label: wall.rect.kind === 'clot' ? '血栓实体 · 观察包裹层与核心，瞄准具体病灶' : '实体组织阻挡工具' });
      const b = bounds();
      for (const [delta, origin, edge] of [[far.x - from.x, from.x, b.left], [far.x - from.x, from.x, b.right], [far.y - from.y, from.y, b.top], [far.y - from.y, from.y, b.bottom]]) {
        if (Math.abs(delta) < 1e-8) continue;
        const t = (edge - origin) / delta;
        if (t >= 0 && t <= 1) candidates.push({ t, priority: 0, hitType: 'wall', targetId: 'boundary', weakpoint: false, blocked: true, label: '外围组织阻挡工具' });
      }
      endpoints.forEach(({ p, t }) => {
        const correct = p.requiredTool === state.tool, available = p.available;
        const requirement = TOOLS.find(tool => tool.id === p.requiredTool);
        const label = !available ? p.kind === 'core' ? '核心仍被包裹 · 先用 2 裂解两处纤维' : '上游压力仍高 · 先疏通侧支' : !correct ? p.label + '没有反应 · 需要 ' + requirement.key + ' ' + requirement.label : p.label + ' · 持续针对处理';
        candidates.push({ t, priority: 2, hitType: correct && available ? 'treatment' : 'ineffective', targetId: p.id, treatmentKind: p.treatmentKind, requiredTool: p.requiredTool, weakpoint: false, blocked: !available, label });
      });
      if (state.room === 'heart') GEOMETRY.heart.nodes.filter(p => p.kind === 'sample').forEach(p => {
        const t = circleHit(from, far, p, 18);
        if (t !== null) candidates.push({ t, priority: 2, hitType: 'healthy', targetId: p.id, weakpoint: false, blocked: false, label: '采样点不是病灶 · 沿脉冲追查输入有、输出无的位置' });
      });
      currentEnemies().forEach(enemy => {
        const bodyT = circleHit(from, far, enemy, 22), weakpoint = enemyWeakpoint(enemy), weakT = state.scanner && state.tool === 'precision' && weakpoint.exposed ? circleHit(from, far, weakpoint, weakpoint.radius) : null;
        if (bodyT === null) return;
        const weak = weakT !== null && (!wall || weakT < wall.t - 1e-8);
        candidates.push({ t: bodyT, endpointT: weak ? weakT : bodyT, priority: 1, hitType: 'hunter', targetId: enemy.id, weakpoint: weak, blocked: false, label: state.tool === 'probe' ? '修复探针对异常细胞无效 · 切换 1 或 2' : weak ? '恢复期弱点 · 精准命中 3 点' : '异常细胞身体 · 1 点伤害' });
      });
      candidates.sort((a, b) => Math.abs(a.t - b.t) <= 1e-8 ? a.priority - b.priority : a.t - b.t);
      const hit = candidates[0], t = hit ? hit.endpointT === undefined ? hit.t : hit.endpointT : 1;
      return { from, to: { x: from.x + (far.x - from.x) * t, y: from.y + (far.y - from.y) * t }, kind: hit && hit.hitType === 'treatment' ? 'treatment' : hit && ['clot', 'ineffective', 'healthy'].includes(hit.hitType) ? 'warning' : 'shot', hitType: hit ? hit.hitType : 'none', targetId: hit ? hit.targetId : null, treatmentKind: hit ? hit.treatmentKind || null : null, weakpoint: hit ? hit.weakpoint : false, blocked: hit ? hit.blocked : false, label: hit ? hit.label : '射程内无目标', range, tool: state.tool };
    }
    function resolveToolRay() {
      const from = state.player, dx = state.aim.x - from.x, dy = state.aim.y - from.y, length = Math.hypot(dx, dy), direction = length > 1e-8 ? { x: dx / length, y: dy / length } : state.aimDirection;
      if (state.tool !== 'sprayer') {
        const ray = resolveRay(direction, toolDefinition().range);
        return { ...ray, angle: 0, targets: ray.targetId === null ? [] : [{ id: ray.targetId, x: ray.to.x, y: ray.to.y, ...ray }], fanPoints: [] };
      }
      const angle = Math.PI / 3, base = Math.atan2(direction.y, direction.x), rays = [];
      for (let i = 0; i <= 12; i++) { const a = base - angle / 2 + angle * i / 12; rays.push(resolveRay({ x: Math.cos(a), y: Math.sin(a) }, 145)); }
      const targets = [], seen = new Set();
      rays.forEach(ray => { const key = ray.hitType + ':' + ray.targetId; if (ray.targetId === null || seen.has(key)) return; seen.add(key); targets.push({ id: ray.targetId, x: ray.to.x, y: ray.to.y, ...ray }); });
      const primary = rays[6];
      return { ...primary, angle, targets, fanPoints: rays.map(ray => ({ ...ray.to })) };
    }
    function currentEnemies(room = state.room) { return state.enemies.filter(e => e.room === room && e.hp > 0); }
    function queueEncounter(room, trigger, count) {
      const encounter = state.encounters[room];
      if (!encounter || encounter.closed || encounter.triggered[trigger]) return;
      encounter.triggered[trigger] = true;
      for (let i = 0; i < count && encounter.spawned + encounter.queue.length < encounter.budget; i++) encounter.queue.push(trigger);
    }
    function closeEncounter(room) {
      const encounter = state.encounters[room];
      encounter.closed = true; encounter.queue = []; encounter.warning = null; encounter.cooldown = 0;
    }
    function safeSpawnInRoom(point, room, player) {
      const b = bounds(room), protectedPoints = [
        ...GEOMETRY[room].nodes, ...portalList(room),
        ...(room === 'main' ? [...state.branches, ...state.weakpoints] : room === 'heart' ? [state.fault] : [CHEST]),
        ...state.supplies.filter(s => s.room === room && s.state === 'ready')
      ];
      return point.x >= b.left + 32 && point.x <= b.right - 32 && point.y >= b.top + 32 && point.y <= b.bottom - 32
        && distance(point, player) >= 280 && !obstacles(room, true).some(w => overlapsRect(point.x, point.y, 32, w))
        && !protectedPoints.some(p => distance(point, p) < 90) && !currentEnemies(room).some(e => distance(point, e) < 65);
    }
    function safeSpawn(point) { return safeSpawnInRoom(point, state.room, state.player); }
    function spawnHunters(point) {
      const encounter = state.encounters[state.room], id = ++state.enemySerial;
      state.enemies = state.enemies.filter(e => e.room !== state.room || e.hp > 0);
      state.enemies.push({ x: point.x, y: point.y, room: state.room, id, hp: HUNTER_HP, state: 'approach', timer: 1.2 + id % 3 * .3, target: null, hasHit: false, hitFlash: 0, telegraph: 0 });
      encounter.spawned++;
    }
    function updateSpawns(dt) {
      const encounter = state.encounters[state.room];
      if (!encounter || encounter.closed) return;
      encounter.cooldown = Math.max(0, encounter.cooldown - dt);
      encounter.attackCooldown = Math.max(0, encounter.attackCooldown - dt);
      if (encounter.warning) {
        if (!safeSpawn(encounter.warning)) { encounter.warning = null; encounter.cooldown = .2; return; }
        encounter.warning.remaining = Math.max(0, encounter.warning.remaining - dt);
        if (encounter.warning.remaining <= 1e-8 && currentEnemies().length < encounter.cap) {
          spawnHunters(encounter.warning); encounter.queue.shift(); encounter.warning = null; encounter.cooldown = SPAWN_INTERVAL - SPAWN_WARNING;
        }
        return;
      }
      if (!encounter.queue.length || currentEnemies().length >= encounter.cap || encounter.cooldown > 1e-8) return;
      const points = SPAWN_POINTS[state.room].filter(safeSpawn).sort((a, b) => distance(a, state.player) - distance(b, state.player));
      if (!points.length) { encounter.cooldown = .25; return; }
      encounter.warning = { ...points[0], room: state.room, id: ++state.spawnSerial, radius: 34, remaining: SPAWN_WARNING };
    }
    function beginEnding() { state.growth.progress = 1; state.growth.suppressed = true; state.ending = 0.001; clearInput(); setStage('ending'); feedback('异常组织已暂时压制 · 但它的生长信号没有消失…'); call('effect', GROWTH.x, GROWTH.y, '#badbc4', 18); }
    function completeTreatment(target) {
      target.progress = 1; target.complete = true; call('effect', target.x, target.y, '#f4df9c', 22);
      if (state.branches.includes(target)) {
        const first = !branchRestored();
        if (target.id === 'left') state.bypassA = true; else state.bypassB = true;
        if (first) { state.checkpoint = 'bypass'; setStage('supply'); requestSupply('lysis', target); }
        feedback(target.label + '已疏通 · 血细胞通过，压力已降至安全范围' + (first ? '；外部补给已请求' : '；第二条侧支作为可选分流恢复'), 'good');
      } else if (target === state.fault) {
        state.fault.output = true; state.heartConnected = true; state.recovery = 0.001; state.firstStrongBeat = false; state.verifiedBeats = 0; state.downstreamReceived = false; state.signalPulses = [];
        closeEncounter('heart'); clearInput(); setStage('recovery'); feedback('中断段修复完成 · 输入与输出重新一致，随后复测三次真实脉冲', 'good');
      } else if (target === state.growth) beginEnding();
      else {
        if (target.kind === 'fiber') { queueEncounter('main', target.id + '-complete', 3); feedback(fibersComplete() ? '两处纤维已裂解 · 核心显露，切换 1 精准治疗器' : target.label + '已裂解 · 另一处包裹层仍在维持核心，注意异常细胞预警', 'good'); }
        else feedback('核心处理完成 · 无需清完敌人，前往主流阀释放血流', 'good');
      }
      publish(true);
    }
    function treatmentTarget(id) { return state.branches.find(p => p.id === id) || state.weakpoints.find(p => p.id === id) || (id === state.fault.id ? state.fault : id === GROWTH.id ? state.growth : null); }
    function useTool(dt, timing) {
      if (!state.firing || state.reloadRemaining > 0 || state.failed || state.finished || inputLocked()) return;
      const inactive = Math.min(dt, timing.reloadRemaining), active = dt - inactive;
      if (active <= 1e-10) return;
      const cooldown = Math.max(0, timing.cooldown - inactive), lease = Math.max(0, timing.lease - inactive), ray = resolveToolRay();
      const targets = ray.targets || [], treatments = targets.filter(p => p.hitType === 'treatment'), paidTimes = new Map();
      treatments.forEach(hit => paidTimes.set(hit.targetId, (timing.targetIds || []).includes(hit.targetId) ? Math.min(active, lease) : 0));
      if (state.ammo > 0 && cooldown <= active + 1e-8) {
        const beforeShot = Math.min(active, cooldown), afterShot = active - beforeShot;
        treatments.forEach(hit => paidTimes.set(hit.targetId, ((timing.targetIds || []).includes(hit.targetId) ? Math.min(beforeShot, lease) : 0) + afterShot));
        state.shotCooldown = 0.2 - afterShot; state.ammo--; state.shot = { ...ray, age: afterShot }; state.treatmentTargetIds = treatments.map(hit => hit.targetId); state.treatmentTargetId = state.treatmentTargetIds[0] || null; state.treatmentLease = treatments.length ? 0.2 - afterShot : 0;
        call('sound', 'shot');
        targets.forEach(hit => {
          if (hit.hitType === 'hunter' && state.tool !== 'probe') {
            const enemy = state.enemies.find(e => e.id === hit.targetId); if (!enemy || enemy.hp <= 0) return;
            enemy.hp = Math.max(0, enemy.hp - (hit.weakpoint && state.tool === 'precision' ? 3 : 1)); enemy.hitFlash = 0.18; call('sound', hit.weakpoint ? 'hitWeak' : 'hit'); call('effect', hit.x, hit.y, hit.weakpoint ? '#fae3a7' : '#dbc5d7', hit.weakpoint ? 12 : 5);
            if (enemy.hp === 0) { feedback('异常细胞已净化' + (hit.weakpoint ? ' · 恢复期弱点命中' : ''), 'good'); call('effect', enemy.x, enemy.y, '#b5dbb6', 18); }
          } else if (hit.hitType === 'treatment') { call('sound', 'treatment'); call('effect', hit.x, hit.y, '#c3e4c1', 3); }
          else if (hit.blocked) { call('sound', 'wall'); call('effect', hit.x, hit.y, '#b8aa99', 3); }
          if (['ineffective', 'healthy', 'clot'].includes(hit.hitType) || hit.hitType === 'hunter' && state.tool === 'probe') warning(hit.label);
        });
      }
      for (const [id, paid] of paidTimes) {
        if (paid <= 0 || inputLocked()) continue;
        const target = treatmentTarget(id); if (!target || target.complete) continue;
        const duration = target.duration || 1.5;
        target.progress = clamp(target.progress + paid / duration, 0, 1);
        if (target.progress >= 1 - 1e-8) completeTreatment(target);
      }
    }
    function hurt() {
      if (state.invulnerable > 0 || state.failed || state.finished) return;
      const absorbed = Math.min(state.shield, 20); state.shield -= absorbed; state.integrity = Math.max(0, state.integrity - (20 - absorbed)); state.invulnerable = 0.85; state.damageFlash = 0.45; call('effect', state.player.x, state.player.y, '#dc9b91', 12); call('sound', 'miss');
      if (state.integrity <= 0) { state.failed = true; clearInput(); call('fail', '医疗设备耐久耗尽。可从最近安全节点重启，已完成的局部治疗、工具和装备会保留。'); } else feedback(absorbed ? '缓冲凝胶吸收了这次扑击 · 护盾已消耗，设备未受损' : '设备受到扑击 · 耐久 ' + state.integrity + '/100', absorbed ? 'good' : 'bad'); publish(true);
    }
    function updateEnemies(dt) {
      if (!(state.room === 'main' && ['diagnosis', 'bypass', 'supply', 'clot'].includes(state.stage)) && !(state.room === 'heart' && state.stage === 'conduction')) return;
      updateSpawns(dt);
      const encounter = state.encounters[state.room], living = currentEnemies();
      living.forEach(enemy => {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt); if (enemy.hp <= 0) return;
        const d = distance(enemy, state.player); enemy.timer -= dt;
        if (enemy.state === 'approach') {
          const covered = blockedSegment(enemy, state.player, 22);
          if (d > 80 || covered) { const destination = hunterDestination(enemy, dt), travel = Math.max(1, distance(enemy, destination)); moveBody(enemy, (destination.x - enemy.x) / travel * 105 * dt, (destination.y - enemy.y) / travel * 105 * dt, 22, true); }
          if (enemy.timer <= 0 && d < 280 && !covered && encounter.attackCooldown <= 0 && living.filter(e => ['telegraph', 'lunge'].includes(e.state)).length < 2) { enemy.state = 'telegraph'; enemy.timer = .9; enemy.telegraph = 0; enemy.target = { x: state.player.x, y: state.player.y }; encounter.attackCooldown = .55; }
        } else if (enemy.state === 'telegraph') { enemy.telegraph = clamp(1 - enemy.timer / .9, 0, 1); if (enemy.timer <= 0) { enemy.state = 'lunge'; enemy.timer = 0.55; enemy.hasHit = false; const length = Math.max(1, distance(enemy, enemy.target)); enemy.direction = { x: (enemy.target.x - enemy.x) / length, y: (enemy.target.y - enemy.y) / length }; } }
        else if (enemy.state === 'lunge') { moveBody(enemy, enemy.direction.x * 350 * dt, enemy.direction.y * 350 * dt, 22, true); if (!enemy.hasHit && distance(enemy, state.player) < 36) { enemy.hasHit = true; hurt(); } if (enemy.timer <= 0) { enemy.state = 'recover'; enemy.timer = 1.2; } }
        else if (enemy.timer <= 0) { enemy.state = 'approach'; enemy.timer = 1.5; }
      });
      // Gentle body separation preserves readable silhouettes without changing a committed lunge.
      for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) {
        const a = living[i], b = living[j], gap = distance(a, b);
        if (gap >= 54 || a.state === 'lunge' || b.state === 'lunge') continue;
        const dx = gap > .01 ? (a.x - b.x) / gap : a.id % 2 ? 1 : -1, dy = gap > .01 ? (a.y - b.y) / gap : 0, push = Math.min((54 - gap) / 2, 48 * dt);
        moveBody(a, dx * push, dy * push, 22, true); moveBody(b, -dx * push, -dy * push, 22, true);
      }
    }
    function updateMovement(dt) {
      let x = (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0), y = (state.keys.has('KeyS') || state.keys.has('ArrowDown') ? 1 : 0) - (state.keys.has('KeyW') || state.keys.has('ArrowUp') ? 1 : 0);
      const length = Math.hypot(x, y); if (length > 0) { x /= length; y /= length; }
      const sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight'), speed = state.dashRemaining > 0 ? 450 : state.precision ? 79 : sprint ? 174 : 128;
      const previous = { x: state.player.x, y: state.player.y };
      if (state.dashRemaining > 0) { x = state.dashDirection.x; y = state.dashDirection.y; } moveBody(state.player, x * speed * dt, y * speed * dt, RADIUS);
      state.player.velocity = { x: (state.player.x - previous.x) / dt, y: (state.player.y - previous.y) / dt }; state.player.moving = distance(state.player, previous) > .001;
      state.player.walkDistance += distance(state.player, previous);
      if (state.room === 'heart' && state.dashUnlocked && state.player.y < 300 - RADIUS) state.crossedBarrier = true;
    }
    function signalPath() { const nodes = GEOMETRY.heart.nodes; return [nodes.find(n => n.id === 'C1'), nodes.find(n => n.id === 'C2'), FAULT, nodes.find(n => n.id === 'C3')]; }
    function emitSignalPulse() { if (state.room === 'heart' && state.revealRemaining <= 0 && !['ending', 'complete'].includes(state.stage)) state.signalPulses.push({ id: ++state.signalSerial, distance: 0, age: 0, delivered: false }); }
    function signalPosition(pulse) {
      const path = signalPath(); let remaining = pulse.distance;
      for (let i = 1; i < path.length; i++) { const length = distance(path[i - 1], path[i]); if (remaining <= length || i === path.length - 1) { const t = clamp(remaining / length, 0, 1); return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: path[i - 1].y + (path[i].y - path[i - 1].y) * t }; } remaining -= length; }
      return { x: path[0].x, y: path[0].y };
    }
    function updateSignals(dt) {
      if (state.room !== 'heart' || state.revealRemaining > 0) return;
      const path = signalPath(), stop = distance(path[0], path[1]) + distance(path[1], path[2]), total = stop + distance(path[2], path[3]);
      state.signalPulses.forEach(pulse => {
        pulse.age += dt; pulse.distance = Math.min(state.fault.complete ? total : stop, pulse.distance + dt * 800);
        if (state.fault.complete && pulse.distance >= total - 1e-8 && !pulse.delivered) {
          pulse.delivered = true; state.downstreamReceived = true;
          if (state.stage === 'recovery' && state.firstStrongBeat && state.verifiedBeats < 3) { state.verifiedBeats++; feedback('复测 ' + state.verifiedBeats + '/3 · 本次脉冲已真实抵达下游', 'good'); call('effect', path[3].x, path[3].y, '#f3dfa1', 10); }
        }
      });
      state.signalPulses = state.signalPulses.filter(p => p.age < 3 && !p.delivered);
    }
    function advanceHeartbeat(dt) {
      const b = beat(), previous = Math.floor(state.heartbeatClock / b.period); state.heartbeatClock += dt;
      if (!b.silent && Math.floor(state.heartbeatClock / b.period) > previous) { emitSignalPulse(); if (!playedHeartbeatThisUpdate) { playedHeartbeatThisUpdate = true; call('sound', 'heartbeat'); } }
    }
    function step(dt) {
      if (state.stage === 'ending') dt = Math.min(dt, Math.max(0, ENDING_TIME - state.ending));
      state.elapsed += dt; advanceHeartbeat(dt); updateValve(); updateSupplies(dt); state.hudTimer -= dt;
      const toolTiming = { cooldown: state.shotCooldown, lease: state.treatmentLease, targetIds: [...state.treatmentTargetIds], reloadRemaining: state.reloadRemaining };
      for (const key of ['shotCooldown', 'treatmentLease', 'dashCooldown', 'invulnerable', 'damageFlash', 'noticeTime', 'warningCooldown']) state[key] = Math.max(0, state[key] - dt);
      if (state.shot) { state.shot.age += dt; if (state.shot.age > 0.16) state.shot = null; }
      if (state.reloadRemaining > 0) {
        const duration = reloadDuration(), previous = duration - state.reloadRemaining, insertAt = duration * .45 / RELOAD_TIME, lockAt = duration * 1.25 / RELOAD_TIME;
        state.reloadRemaining = Math.max(0, state.reloadRemaining - dt); if (state.reloadRemaining < 1e-8) state.reloadRemaining = 0;
        const elapsed = duration - state.reloadRemaining;
        if (previous < insertAt - 1e-8 && elapsed >= insertAt - 1e-8) call('sound', 'reloadIn');
        state.reloadStage = state.reloadRemaining <= 0 ? 'idle' : elapsed < insertAt - 1e-8 ? 'eject' : elapsed < lockAt - 1e-8 ? 'insert' : 'lock';
        if (state.reloadRemaining === 0) { state.ammo = MAGAZINE; state.emptyLatched = false; state.reloadAutomatic = false; call('sound', 'reloadReady'); feedback('锁定就绪 · 医疗介质 24/24', 'good'); }
      }
      if (state.revealRemaining > 0) { state.revealRemaining = Math.max(0, state.revealRemaining - dt); if (state.revealRemaining <= 0 && state.room === 'heart' && !state.heartConnected) { queueEncounter('heart', 'arrival', 3); emitSignalPulse(); } }
      else if (state.stage === 'burst') { state.burst += dt; if (state.burst >= BURST_TIME) { state.flowRestored = true; state.checkpoint = 'flow'; state.enemies = []; state.waveDelay = 0; setStage('conduction'); call('effect', CLOT.x, CLOT.y, '#f3d4a1', 40); feedback('血栓和干扰者被血流带走 · 心脏入口已经打开', 'good'); } }
      else if (state.stage === 'recovery') {
        state.recovery += dt;
        if (state.recovery >= 1.1 && !state.firstStrongBeat) { state.firstStrongBeat = true; state.heartbeatClock = 0; playedHeartbeatThisUpdate = true; state.signalPulses = []; emitSignalPulse(); currentEnemies('heart').forEach(e => call('effect', e.x, e.y, '#cce3af', 12)); state.enemies = state.enemies.filter(e => e.room !== 'heart'); call('sound', 'heartbeatStrong'); call('effect', 900, 620, '#f2dda6', 36); feedback('咚——第一声有力的心跳，净化异常细胞 · 观察脉冲抵达下游', 'good'); }
        if (state.recovery >= RECOVERY_TIME && state.verifiedBeats >= 3) { state.dashUnlocked = true; state.dashCooldown = 0; setStage('escape'); call('effect', state.player.x, state.player.y, '#f3e3a7', 30); feedback('三拍输入输出一致，循环恢复 · 朝屏障移动并按 Space 冲刺', 'good'); call('sound', 'win'); }
      } else if (state.stage === 'ending') {
        const previous = state.ending; state.ending += dt;
        if (state.ending >= 1.8 && previous < 1.8) { state.growth.regrowing = true; feedback('刚被压制的异常组织再次生长 · 信号延伸到肺叶深处'); }
        if (state.ending >= EXTERIOR_START && previous < EXTERIOR_START) feedback('巨人的胸口重新起伏 · 山谷中的生命随之苏醒');
        if (state.ending >= ENDING_TIME - 1e-8) { state.ending = ENDING_TIME; state.finished = true; clearInput(); setStage('complete'); call('success'); }
      } else { updateMovement(dt); updateScanner(dt); useTool(dt, toolTiming); updateEnemies(dt); if (state.ammo <= 0 && state.treatmentLease <= 1e-8) startReload(true); }
      updateSignals(dt);
      const wasDashing = state.dashRemaining > 0; state.dashRemaining = Math.max(0, state.dashRemaining - dt); if (wasDashing && state.dashRemaining === 0) resolveDashOverlap(); publish(false);
    }
    function update(dt) { if (!Number.isFinite(dt) || dt <= 0 || state.failed || state.finished) return; playedHeartbeatThisUpdate = false; let remaining = dt; while (remaining > 1e-8 && !state.failed && !state.finished) { const slice = Math.min(remaining, 1 / 60); step(slice); remaining -= slice; } }
    function dash() {
      if (!state.dashUnlocked) { warning('循环尚未恢复 · 冲刺能力仍在沉睡'); return; } if (state.dashCooldown > 0) return;
      let x = (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0), y = (state.keys.has('KeyS') || state.keys.has('ArrowDown') ? 1 : 0) - (state.keys.has('KeyW') || state.keys.has('ArrowUp') ? 1 : 0), length = Math.hypot(x, y);
      if (!length) { x = state.aim.x - state.player.x; y = state.aim.y - state.player.y; length = Math.hypot(x, y); } if (!length) { x = 0; y = -1; length = 1; }
      state.dashDirection = { x: x / length, y: y / length }; state.dashRemaining = 0.34; state.dashCooldown = 2.4; call('effect', state.player.x, state.player.y, '#d2edc1', 12); call('sound', 'hit');
    }
    function keyDown(code, repeat = false) {
      if (state.failed || state.finished || inputLocked()) return; state.keys.add(code); if (repeat) return;
      const toolKey = /^(?:Digit|Numpad)([123])$/.exec(code);
      if (toolKey) {
        const tool = TOOLS[Number(toolKey[1]) - 1]; if (!state.unlockedTools[tool.id]) { feedback(tool.label + '尚未领取 · 观察病灶以获得外部支援'); return; }
        if (state.tool !== tool.id) { state.tool = tool.id; state.firing = false; state.treatmentLease = 0; state.treatmentTargetIds = []; state.treatmentTargetId = null; feedback('已切换 ' + tool.key + ' ' + tool.label); publish(true); } return;
      }
      if (code === 'KeyQ') { state.scanner = !state.scanner; feedback(state.scanner ? '扫描已开启 · 比较病灶与治疗后的反应，Hunter 仅恢复期显露弱点' : '扫描已关闭 · 针对治疗仍然有效'); publish(true); }
      else if (code === 'KeyE') interact(); else if (code === 'KeyR') startReload(false); else if (code === 'Space') dash();
    }
    function keyUp(code) { state.keys.delete(code); }
    function pointerMove(point) { if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) { state.aim = { x: point.x, y: point.y }; const dx = point.x - state.player.x, dy = point.y - state.player.y, length = Math.hypot(dx, dy); if (length > 1e-8) state.aimDirection = { x: dx / length, y: dy / length }; } }
    function pointerDown(point) { if (state.failed || state.finished || inputLocked() || !point) return; pointerMove(point); if (point.button === 2) state.precision = true; else state.firing = true; }
    function pointerUp(point) { pointerMove(point); if (point && point.button === 2) state.precision = false; else { state.firing = false; state.emptyLatched = false; } }
    function retryFromCheckpoint() {
      if (state.finished || state.stage === 'ending') return false;
      const failedRoom = state.room;
      clearInput(); state.retries++; state.failed = false; state.integrity = 100; state.shield = state.equipment === 'gel' ? 20 : 0; state.ammo = MAGAZINE; state.reloadRemaining = 0; state.reloadStage = 'idle'; state.reloadAutomatic = false; state.shotCooldown = 0; state.invulnerable = 1.5; state.player.walkDistance = 0;
      state.damageFlash = 0; state.shot = null; state.scanner = false; state.dashRemaining = 0; state.dashCooldown = 0; state.crossedBarrier = false; state.revealRemaining = 0;
      [...state.branches, ...state.weakpoints, state.fault, state.growth].forEach(p => { if (!p.complete) p.progress = 0; });
      state.signalPulses = []; state.verifiedBeats = 0; state.downstreamReceived = false;
      if (state.flowRestored) {
        state.room = 'heart'; Object.assign(state.player, { x: 900, y: 1020 }); state.heartRevealed = true;
        if (state.fault.complete) { state.heartConnected = true; state.recovery = 0.001; state.firstStrongBeat = false; state.dashUnlocked = false; setStage('recovery'); }
        else { queueEncounter('heart', 'arrival', 3); setStage('conduction'); }
      } else if (branchRestored()) {
        state.room = 'main'; Object.assign(state.player, { x: 800, y: 830 }); setStage(state.unlockedTools.sprayer ? 'clot' : 'supply');
      } else {
        state.room = 'entry'; Object.assign(state.player, { x: 800, y: 830 }); state.valveSide = 'below'; setStage('diagnosis');
      }
      Object.values(state.encounters).forEach(encounter => { encounter.warning = null; encounter.cooldown = .2; encounter.attackCooldown = 1.5; });
      new Set([failedRoom, state.room]).forEach(room => {
        if (!SPAWN_POINTS[room]) return;
        const spawn = room === state.room ? state.player : room === 'main' ? { x: 800, y: 830 } : { x: 900, y: 1020 }, safe = point => safeSpawnInRoom(point, room, spawn);
        currentEnemies(room).forEach(enemy => {
          let point = SPAWN_POINTS[room].find(safe);
          if (!point) { const b = bounds(room); for (let x = b.left + 60; x < b.right - 60 && !point; x += 80) for (let y = b.top + 60; y < b.bottom - 60; y += 80) if (safe({ x, y })) { point = { x, y }; break; } }
          if (point) Object.assign(enemy, { x: point.x, y: point.y });
          enemy.state = 'approach'; enemy.timer = 2.5; enemy.target = null; enemy.hasHit = false; enemy.pathTimer = 0; enemy.waypoint = null; enemy.telegraph = 0;
        });
      });
      feedback('安全节点重启 · 完成的病灶、工具、装备和补给保留；未完成照射重置，敌人预算不重刷', 'good'); publish(true); return true;
    }
    function links() {
      if (state.room === 'main') return state.branches.filter(p => p.complete).map(p => ({ from: { x: p.x, y: 780 }, to: { x: p.x, y: p.y }, kind: 'bypass', complete: true }));
      if (state.room === 'heart') { const points = GEOMETRY.heart.nodes.filter(p => p.kind === 'sample'); return points.slice(1).map((p, i) => ({ from: { ...points[i] }, to: { ...p }, kind: 'conduction', complete: state.fault.complete })); }
      return [];
    }
    function cameraCue() {
      if (state.revealRemaining > 0) return { kind: 'reveal', target: { x: 900, y: 640 }, progress: 1 - state.revealRemaining / REVEAL_TIME };
      if (state.stage === 'burst') return { kind: 'burst', target: { ...CLOT }, progress: Math.min(1, state.burst / BURST_TIME) };
      if (state.stage === 'recovery') return { kind: 'recovery', target: { x: 850, y: 690 }, progress: Math.min(1, state.recovery / RECOVERY_TIME) };
      if (state.stage === 'ending') return { kind: 'ending', target: { ...GROWTH }, progress: Math.min(1, state.ending / ENDING_TIME) };
      return { kind: 'follow', target: { x: state.player.x, y: state.player.y }, progress: 0 };
    }
    function scanTargets() {
      const targets = GEOMETRY[state.room].nodes.filter(n => n.kind !== 'branch').map(n => ({ id: n.id, x: n.x, y: n.y, label: n.label, progress: state.scanProgress[n.id] || 0, complete: !!state.scanned[n.id], inRange: distance(n, state.player) <= SCAN_RANGE }));
      const add = (target, range = SCAN_RANGE) => targets.push({ id: target.id, x: target.x, y: target.y, label: target.label, progress: target.scanProgress || 0, complete: !!target.scanned, inRange: distance(target, state.player) <= range });
      if (state.room === 'main') { state.branches.forEach(p => add(p)); state.weakpoints.forEach(p => add(p)); add({ ...CLOT, id: 'clot', label: '主流阻塞', scanProgress: state.scanProgress.clot || 0, scanned: !!state.scanned.clot }, 230); }
      if (state.room === 'heart') { add(state.fault); if (state.crossedBarrier) add(state.growth); }
      return targets;
    }
    function snapshot() {
      const nearest = nearbyInteraction(), currentBeat = beat(), hunters = state.enemies.map(e => ({ ...e, weakpoint: enemyWeakpoint(e), weakpointExposed: e.state === 'recover', purifyProgress: e.room === 'main' && state.stage === 'burst' ? clamp(state.burst / BURST_TIME, 0, 1) : e.room === 'heart' && state.stage === 'recovery' ? clamp(state.recovery / 1.1, 0, 1) : 0 }));
      const encounter = state.encounters[state.room], encounters = Object.fromEntries(Object.entries(state.encounters).map(([room, e]) => [room, { room, alive: currentEnemies(room).length, pending: e.queue.length, budget: e.budget, spawned: e.spawned, cap: e.cap, closed: e.closed, triggered: { ...e.triggered } }]));
      const info = [], scans = scanTargets();
      if (state.scanner) {
        if (state.room === 'entry') GEOMETRY.entry.nodes.filter(n => distance(n, state.player) <= SCAN_RANGE).forEach(n => info.push(state.scanned[n.id] ? diagnosticText(n.id) : n.label + '读取中…'));
        if (state.room === 'main') {
          info.push('流量：' + (state.flowRestored ? '畅通' : branchRestored() ? '侧支已分流' : '主流低流量') + ' · 压力：' + (branchRestored() ? '安全' : '过高'));
          if (state.scanned.clot) info.push(diagnosticText('clot'));
          state.branches.filter(p => p.scanned).forEach(p => info.push(p.label + (p.complete ? '：已贯通' : '：精准治疗有效，进度 ' + Math.round(p.progress * 100) + '%')));
          state.weakpoints.filter(p => p.scanned && !p.complete).forEach(p => info.push(p.label + (p.kind === 'fiber' ? '：裂解喷雾有效' : fibersComplete() ? '：已暴露，精准治疗有效' : '：仍被纤维包裹')));
        }
        if (state.room === 'heart') {
          info.push(state.scanned['heart-signal'] ? diagnosticText('heart-signal') : '脉冲存在 · 沿路径比较输入与输出');
          GEOMETRY.heart.nodes.filter(p => p.kind === 'sample' && state.scanned[p.id]).forEach(p => info.push(sampleState(p.id).label));
          if (state.fault.scanned) info.push(state.fault.complete ? '中断段：输入与输出重新一致 · 复测 ' + state.verifiedBeats + '/3 拍' : '中断段：输入有脉冲、输出中断 · 修复探针有效');
        }
      }
      if (state.room === 'heart' && state.crossedBarrier && state.growth.scanned) info.push(state.growth.regrowing ? '异常组织再次生长 · 肺部出现相同信号' : state.growth.suppressed ? '异常组织暂时压制 · 仍有残留信号' : '出口组织仍在异常生长 · 精准治疗可暂时压制');
      const walls = GEOMETRY[state.room].obstacles.filter(o => o.kind !== 'clot' || !state.flowRestored).map(o => ({ ...o, blocking: o.kind !== 'dashBarrier' || state.dashRemaining <= 0, dashPassable: o.kind === 'dashBarrier' && state.dashUnlocked }));
      if (state.room === 'entry') walls.push({ ...VALVE, blocking: !currentBeat.safe });
      const weakpoints = state.weakpoints.map(p => ({ ...p, exposed: p.kind !== 'core' || fibersComplete() })), signalNodes = GEOMETRY.heart.nodes.filter(n => n.kind === 'sample');
      return {
        type: 'heartJourney', version: 2, area: { ...AREA }, bounds: { ...bounds() }, worldSize: { ...GEOMETRY[state.room].size }, room: state.room, roomLabel: ROOMS[state.room],
        player: { ...state.player, dashing: state.dashRemaining > 0, invulnerable: state.invulnerable > 0 }, aim: { ...state.aim }, scanner: state.scanner, scanOn: state.scanner, precision: state.precision, toolPreview: resolveToolRay(), guidance: guidance(),
        tool: state.tool, tools: TOOLS.map(t => ({ ...t, unlocked: !!state.unlockedTools[t.id] })), equipment: state.equipment, shield: state.shield, reloadDuration: reloadDuration(), reloadAutomatic: state.reloadAutomatic,
        branches: state.branches.map(p => ({ ...p })), supplies: copy(state.supplies), chest: { ...CHEST, claimed: state.chestClaimed }, fault: { ...state.fault }, scanTargets: scans,
        conductionSignal: { points: signalNodes.map(n => ({ x: n.x, y: n.y })), samples: signalNodes.map(n => ({ id: n.id, x: n.x, y: n.y, ...sampleState(n.id) })), faultPosition: { x: FAULT.x, y: FAULT.y }, repaired: state.fault.complete, pulses: state.signalPulses.map(p => ({ id: p.id, ...signalPosition(p) })), verifiedBeats: state.verifiedBeats, requiredBeats: 3 },
        beat: currentBeat, stage: state.stage, phase: state.stage, stageLabel: STAGES[state.stage], task: task(), integrity: state.integrity, health: state.integrity, ammo: state.ammo, reloadRemaining: state.reloadRemaining, reloadProgress: reloadProgress(), reloadStage: state.reloadStage,
        nodes: nodeList(), portals: portalList(), obstacles: walls, valves: state.room === 'entry' ? [{ ...VALVE, open: currentBeat.safe, blocking: !currentBeat.safe, enteredFrom: state.valveSide }] : [],
        paths: GEOMETRY[state.room].paths.map(p => ({ ...copy(p), active: p.branch ? p.branch === 'A' ? state.bypassA : state.bypassB : true, flow: p.flow === undefined ? state.flowRestored ? 1 : p.kind === 'bypass' ? (p.branch === 'A' ? state.bypassA : state.bypassB) ? 0.7 : 0.05 : 0.14 : p.flow })),
        enemies: hunters.filter(e => e.room === state.room), hunters,
        encounter: encounters[state.room] || { room: state.room, alive: 0, pending: 0, budget: 0, spawned: 0, cap: 0, closed: true, triggered: {} }, encounters,
        spawnTelegraphs: encounter && encounter.warning ? [{ ...encounter.warning, progress: clamp(1 - encounter.warning.remaining / SPAWN_WARNING, 0, 1) }] : [],
        clot: { ...CLOT, scanned: !!state.scanned.clot, scanProgress: state.scanProgress.clot || 0, removed: state.flowRestored, burst: state.burst, weakpoints }, weakpoints,
        growth: { ...state.growth, state: state.growth.regrowing ? 'regrowing' : state.growth.suppressed ? 'suppressed' : state.growth.scanned ? 'activated' : 'dormant' }, links: links(),
        checkpoint: state.checkpoint, checkpointLabel: CHECKPOINTS[state.checkpoint], retries: state.retries, elapsed: state.elapsed,
        dashUnlocked: state.dashUnlocked, dashCooldown: state.dashCooldown, dashRemaining: state.dashRemaining, crossedBarrier: state.crossedBarrier,
        burst: state.burst, burstDuration: BURST_TIME, recovery: state.recovery, recoveryDuration: RECOVERY_TIME, ending: state.ending, endingDuration: ENDING_TIME,
        revealRemaining: state.revealRemaining, reveal: state.heartRevealed ? REVEAL_TIME - state.revealRemaining : 0, revealDuration: REVEAL_TIME, inputLocked: inputLocked(), cameraCue: cameraCue(), firstStrongBeat: state.firstStrongBeat,
        endingScene: state.ending >= EXTERIOR_START ? 'exterior' : state.growth.regrowing ? 'regrowth' : 'suppressed',
        exteriorRecovery: { elapsed: clamp(state.ending - EXTERIOR_START, 0, EXTERIOR_DURATION), duration: EXTERIOR_DURATION, progress: clamp((state.ending - EXTERIOR_START) / EXTERIOR_DURATION, 0, 1) },
        flowRestored: state.flowRestored, bypassA: state.bypassA, bypassB: state.bypassB, flow: state.flowRestored ? 'open' : branchRestored() ? 'partial' : 'low', pressure: branchRestored() ? 'safe' : 'high', heartbeat: currentBeat.state,
        combatWave: state.combatWave, combatComplete: state.combatComplete, heartConnected: state.heartConnected, scanned: { ...state.scanned }, connection: [], conduction: [], keys: [...state.keys], scannerInfo: info, nearestId: nearest ? nearest.id : null,
        interactionHint: nearest ? 'E · ' + nearest.label + (nearest.locked ? '（' + nearest.requires + '）' : '') : state.room === 'entry' ? 'Q 观察支路症状 · 在瓣膜舒张时通过' : 'WASD 移动 · 1/2/3 选择工具 · 左键针对治疗',
        notice: state.noticeTime > 0 ? state.notice : '', noticeTime: state.noticeTime, shot: state.shot ? copy(state.shot) : null, damageFlash: state.damageFlash, failed: state.failed, finished: state.finished, progress: progress(), toolRange: toolDefinition().range, scanRange: SCAN_RANGE, interactRange: INTERACT_RANGE
      };
    }
    function draw(ctx, time, view) { const renderer = window.GiantCureJourneyArt; if (renderer && typeof renderer.draw === 'function') renderer.draw(ctx, snapshot(), time, view); }
    setStage('diagnosis'); feedback('两条支路的节律并不相同 · WASD 移动，Q 观察流量与压力');
    return { update, draw, pointerDown, pointerMove, pointerUp, pointerCancel: clearInput, clearInput, keyDown, keyUp, retryFromCheckpoint, chooseEquipment, getDebugState: () => freeze(copy(snapshot())) };
  };
})();
