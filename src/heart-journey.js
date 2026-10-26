// Heart Journey controller: input, collision and particles use world coordinates.
(function () {
  'use strict';
  const AREA = { x: 24, y: 84, w: 1232, h: 552 };
  const RADIUS = 14, SCAN_RANGE = 145, SCAN_TIME = 1.35, INTERACT_RANGE = 64;
  const TOOL_RANGE = 225, MAGAZINE = 24, RELOAD_TIME = .85;
  const HUNTER_HP = 9, SPAWN_WARNING = 1, SPAWN_INTERVAL = 8;
  const REVEAL_TIME = 1.5, BURST_TIME = 4, RECOVERY_TIME = 6;
  const EXTERIOR_START = 0, EXTERIOR_DURATION = 8, ENDING_TIME = EXTERIOR_DURATION;
  const STAGES = { diagnosis: '入口诊断与救治', bypass: '疏通侧支', supply: '接收外部补给', clot: '分层处理血栓', burst: '主血流恢复', conduction: '追踪传导中断', recovery: '传导复测与复苏', escape: '安全撤离', ending: '肺部求救信号', complete: '心脏已复苏' };
  const ROOMS = { entry: '血管入口', main: '主血管与侧支', heart: '心脏内腔' };
  const CHECKPOINTS = { entry: '血管入口', bypass: '侧支分流恢复', flow: '主血流恢复', 'heart-west': '西区传导恢复', 'heart-east': '东区传导恢复' };
  const TASKS = {
    diagnosis: '入口组织正在缺血 · Q 对比正常支路与东侧凝块，找到供血不足的原因',
    bypass: '沿侧支找到局部阻塞 · 任选一条，用 1 精准治疗器疏通',
    supply: '侧支已分流降压 · 外部注射的裂解工具正沿血流送来',
    clot: '观察包裹层与核心 · 2 裂解纤维，1 处理暴露的核心',
    burst: '主血流正在带走淤堵 · 下游重新得到灌流',
    conduction: '追踪脉冲在何处中断 · 检查输入与输出，用 3 修复探针处理',
    recovery: '修复后复测 · 观察三次脉冲抵达下游与心腔复苏',
    escape: '三拍复测通过 · 撤离通道已开放，前往出口按 E 完成巡诊',
    ending: '心脏恢复稳定 · 巨人正在苏醒，肺部传来新的求救', complete: '心脏恢复稳定 · 巡诊完成'
  };
  const GEOMETRY = {
    entry: {
      size: { w: 2000, h: 1250, width: 2000, height: 1250 },
      bounds: { x: 80, y: 80, w: 1840, h: 1090, left: 80, right: 1920, top: 80, bottom: 1170 },
      nodes: [
        { id: 'flow', x: 500, y: 750, label: '正常支路', kind: 'diagnostic', symptom: '血流正常' },
        { id: 'pressure', x: 1400, y: 800, label: '缺血支路', kind: 'diagnostic', symptom: '血流减弱' }
      ],
      obstacles: [
        { id: 'entry-divider-l', x: 80, y: 462.5, w: 1157.5, h: 87.5, kind: 'tissue' },
        { id: 'entry-divider-r', x: 1587.5, y: 462.5, w: 332.5, h: 87.5, kind: 'tissue' }
      ],
      paths: [
        { id: 'normal', points: [{ x: 1000, y: 1030 }, { x: 500, y: 975 }, { x: 500, y: 660 }], kind: 'normal', width: 150, flow: 1 },
        { id: 'abnormal', points: [{ x: 1000, y: 1030 }, { x: 1400, y: 975 }, { x: 1412.5, y: 275 }], kind: 'abnormal', width: 180, flow: 0.18 }
      ]
    },
    main: {
      size: { w: 2200, h: 1400, width: 2200, height: 1400 },
      bounds: { x: 80, y: 80, w: 2040, h: 1240, left: 80, right: 2120, top: 80, bottom: 1320 },
      nodes: [
        { id: 'A2', x: 450, y: 330, label: '西侧支', kind: 'branch' },
        { id: 'B2', x: 1750, y: 330, label: '东侧支', kind: 'branch' },
        { id: 'release', x: 1100, y: 1170, label: '主流阀', kind: 'release' }
      ],
      obstacles: [
        { id: 'clot', x: 980, y: 310, w: 240, h: 210, kind: 'clot' },
        { id: 'main-rib-l', x: 80, y: 740, w: 400, h: 70, kind: 'tissue' },
        { id: 'main-rib-r', x: 1720, y: 740, w: 400, h: 70, kind: 'tissue' },
        { id: 'left-branch-cover', x: 540, y: 270, w: 60, h: 115, kind: 'tissue' }
      ],
      paths: [
        { id: 'main-flow', points: [{ x: 1100, y: 1300 }, { x: 1100, y: 160 }], kind: 'main', width: 210 },
        { id: 'bypass-a', points: [{ x: 1100, y: 1230 }, { x: 450, y: 1120 }, { x: 530, y: 880 }, { x: 530, y: 640 }, { x: 450, y: 550 }, { x: 450, y: 330 }, { x: 450, y: 180 }, { x: 720, y: 180 }, { x: 1100, y: 160 }], kind: 'bypass', branch: 'A', width: 100 },
        { id: 'bypass-b', points: [{ x: 1100, y: 1230 }, { x: 1750, y: 1120 }, { x: 1640, y: 880 }, { x: 1640, y: 640 }, { x: 1750, y: 550 }, { x: 1750, y: 330 }, { x: 1100, y: 160 }], kind: 'bypass', branch: 'B', width: 100 }
      ]
    },
    heart: {
      size: { w: 2600, h: 1700, width: 2600, height: 1700 },
      bounds: { x: 80, y: 80, w: 2440, h: 1540, left: 80, right: 2520, top: 80, bottom: 1620 },
      nodes: [
        { id: 'C1', x: 1300, y: 1450, label: '上游采样点', kind: 'sample' },
        { id: 'C2', x: 1300, y: 970, label: '汇流采样点', kind: 'sample' },
        { id: 'C3', x: 1300, y: 365, label: '下游采样点', kind: 'sample' }
      ],
      obstacles: [
        { id: 'heart-island-west', x: 410, y: 1010, w: 170, h: 90, kind: 'tissue' },
        { id: 'heart-island-east', x: 2020, y: 1010, w: 170, h: 90, kind: 'tissue' },
        { id: 'exit-barrier', x: 80, y: 280, w: 2440, h: 36, kind: 'dashBarrier' }
      ],
      paths: [{ id: 'heart-flow', points: [{ x: 1300, y: 1600 }, { x: 1300, y: 970 }, { x: 1300, y: 500 }, { x: 1300, y: 160 }], kind: 'main', width: 160 }]
    }
  };
  const VALVE = { id: 'entry-valve', x: 1237.5, y: 487.5, w: 350, h: 32, kind: 'valve', label: '心跳瓣膜' };
  const CLOT = { x: 1100, y: 410, radius: 116 };
  const ENTRY_LESION = { id: 'entry-lesion', x: 1400, y: 800, radius: 28, label: '入口凝块', requiredTool: 'precision', duration: 1.6 };
  const TISSUES = [
    { id: 'main-tissue-l', room: 'main', x: 800, y: 900, label: '西侧组织' },
    { id: 'main-tissue-r', room: 'main', x: 1400, y: 900, label: '东侧组织' },
    { id: 'heart-tissue-l', room: 'heart', sourceId: 'heart-west', x: 1000, y: 1220, label: '西区组织' },
    { id: 'heart-tissue-r', room: 'heart', sourceId: 'heart-east', x: 1600, y: 1220, label: '东区组织' }
  ];
  const SOURCES = { main: { id: 'main-clot', room: 'main', x: 1100, y: 410, label: '主血栓' } };
  const HEART_SECTORS = [
    { id: 'heart-west', room: 'heart', x: 850, y: 760, radius: 36, label: '西区纤维病灶', requiredTool: 'sprayer', duration: 2, enemyType: 'weaver' },
    { id: 'heart-east', room: 'heart', x: 1750, y: 760, radius: 36, label: '东区凝块病灶', requiredTool: 'precision', duration: 2, enemyType: 'coagulator' }
  ];
  const SYNC_CORE = { id: 'sync-core', x: 1300, y: 500, radius: 34, label: '同步核心', requiredTool: 'probe' };
  const WEAKPOINTS = [
    { id: 'W1', x: 1000, y: 348, label: '外层纤维', kind: 'fiber', requiredTool: 'sprayer', duration: 2.4 },
    { id: 'W2', x: 1202, y: 412, label: '侧面纤维', kind: 'fiber', requiredTool: 'sprayer', duration: 2.4 },
    { id: 'W3', x: 1100, y: 503, label: '暴露核心', kind: 'core', requiredTool: 'precision', duration: 3.2 }
  ];
  const BRANCHES = [
    { id: 'left', nodeId: 'A2', x: 450, y: 330, radius: 28, label: '西侧支凝块', duration: 4, requiredTool: 'precision' },
    { id: 'right', nodeId: 'B2', x: 1750, y: 330, radius: 28, label: '东侧支凝块', duration: 2.4, requiredTool: 'precision' }
  ];
  const FAULT = { ...SYNC_CORE, id: 'conduction-fault', room: 'heart', duration: 1.6 };
  const TOOLS = [
    { id: 'precision', label: '精准治疗枪', description: '疏通凝块、修补组织、命中弱点', key: '1', range: TOOL_RANGE },
    { id: 'sprayer', label: '纤维裂解喷头', description: '近距离裂解纤维、清除覆盖', key: '2', range: 145 },
    { id: 'probe', label: '导电脉冲探针', description: '接通传导、发出验证脉冲', key: '3', range: TOOL_RANGE }
  ];
  const SPAWN_POINTS = {
    main: [{ x: 1450, y: 500 }, { x: 700, y: 240 }, { x: 1550, y: 370 }, { x: 240, y: 190 }, { x: 1960, y: 190 }, { x: 540, y: 1200 }, { x: 1680, y: 1200 }, { x: 1100, y: 740 }, { x: 1100, y: 200 }],
    heart: [{ x: 480, y: 650 }, { x: 650, y: 1030 }, { x: 900, y: 450 }, { x: 1100, y: 700 }, { x: 2120, y: 650 }, { x: 1950, y: 1030 }, { x: 1700, y: 450 }, { x: 1500, y: 700 }]
  };
  const freshEncounters = () => ({
    main: { cap: 4, queue: [], warning: null, cooldown: 0, attackCooldown: 0, triggered: {}, spawned: 0, active: false, closed: false, grace: 0 },
    heart: { cap: 4, queue: [], warning: null, cooldown: 0, attackCooldown: 0, triggered: {}, spawned: 0, active: false, closed: false, grace: 0 }
  });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const copy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

  window.GiantCureGames = window.GiantCureGames || {};
  window.GiantCureGames.heartJourney = function createHeartJourney(api) {
    const state = {
      room: 'entry', stage: 'diagnosis', player: { x: 1000, y: 1030, radius: RADIUS, velocity: { x: 0, y: 0 }, moving: false, walkDistance: 0 }, aim: { x: 1400, y: 800 }, aimDirection: { x: 0, y: -1 }, keys: new Set(), firing: false, precision: false,
      scanner: false, scanFocusId: null, scanned: {}, scanProgress: {}, reported: {}, pendingDiagnosis: null, diagnosisReport: null, bypassA: false, bypassB: false, connection: [], conduction: [], heartConnected: false, flowRestored: false,
      branches: BRANCHES.map(p => ({ ...p, progress: 0, complete: false, scanned: false, scanProgress: 0 })),
      fault: { ...FAULT, progress: 0, complete: false, scanned: false, scanProgress: 0, input: true, output: false },
      heartSectors: HEART_SECTORS.map(s => ({ ...s, progress: 0, cleared: false, complete: false, scanned: false, relay: { id: s.id + '-relay', x: s.x, y: s.y, radius: 30, label: s.id === 'heart-west' ? '西区传导' : '东区传导', requiredTool: 'probe', duration: 1.6, progress: 0, complete: false } })),
      runMetrics: { minStability: 100, weakpointEnemies: [] },
      tool: 'precision', unlockedTools: { precision: true, sprayer: false, probe: false }, newTools: {},
      entryLesion: { ...ENTRY_LESION, progress: 0, complete: false, scanned: false, scanProgress: 0 },
      tissues: TISSUES.map(t => ({ ...t, radius: 30, hitArea: { rx: 60, ry: 30 }, integrity: 50, maxIntegrity: 50, attached: false, attachmentProgress: 0, hitFlash: 0 })), projectiles: [], projectileSerial: 0, heartStable: false, failureReason: null,
      supplies: [
        { id: 'lysis', room: 'main', label: '裂解喷头', tool: 'sprayer', state: 'waiting', route: [], x: 1100, y: 1230, progress: 0 },
        { id: 'probe', room: 'heart', label: '脉冲探针', tool: 'probe', state: 'waiting', route: [{ x: 1300, y: 1580 }, { x: 1300, y: 1430 }, { x: 1300, y: 1330 }], x: 1300, y: 1580, progress: 0 }
      ],
      verifiedBeats: 0, downstreamReceived: false, signalPulses: [], signalSerial: 0, reloadAutomatic: false,
      weakpoints: WEAKPOINTS.map(p => ({ ...p, scanned: false, scanProgress: 0, progress: 0, complete: false })),
      integrity: 100, ammo: MAGAZINE, reloadRemaining: 0, reloadStage: 'idle', emptyLatched: false, shotCooldown: 0, enemies: [], enemySerial: 0, spawnSerial: 0, encounters: freshEncounters(), combatWave: 0, waveDelay: 0, combatComplete: false,
      elapsed: 0, heartbeatClock: 0, checkpoint: 'entry', retries: 0, dashUnlocked: true, dashRemaining: 0, dashCooldown: 0, dashDirection: { x: 0, y: -1 },
      burst: 0, recovery: 0, ending: 0, invulnerable: 0, revealRemaining: 0, heartRevealed: false, firstStrongBeat: false, valveSide: 'below',
      damageFlash: 0, notice: '', noticeTime: 0, warningCooldown: 0, shot: null, treatmentLease: 0, treatmentTargetId: null, treatmentTargetIds: [], failed: false, finished: false, lastProgress: -1, hudTimer: 0
    };
    let playedHeartbeatThisUpdate = false;
    function call(name, ...args) { if (typeof api[name] === 'function') api[name](...args); }
    function feedback(text, kind = 'info') { state.notice = text; state.noticeTime = 3.6; call('feedback', text, kind); }
    function task() {
      if (state.room === 'entry') return state.entryLesion.complete ? '穿过瓣膜，前往主血管' : state.scanned.pressure ? '用 1 清除入口凝块' : '靠近缺血支路，按 Q 诊断';
      const guide = guidance(); if (guide) return guide.text;
      if (state.stage === 'diagnosis') return '靠近主血栓，按 Q 诊断';
      if (state.stage === 'bypass') return '用 1 疏通任一侧支';
      if (state.stage === 'supply') return '领取沿血流送来的裂解喷头';
      if (state.stage === 'clot') return state.weakpoints.every(p => p.complete) ? '前往主流阀，按 E 释放血流' : fibersComplete() ? '用 1 处理暴露核心' : '用 2 裂解两处纤维';
      if (state.stage === 'conduction') return '任选一侧病灶，诊断并恢复传导';
      if (state.stage === 'recovery') return '用 3 点击同步核心：' + state.verifiedBeats + '/3';
      return ({ burst: '主血流正在恢复', escape: '前往出口，按 E 撤离', ending: '巨人正在苏醒', complete: '心脏已复苏' })[state.stage];
    }
    function guidance() {
      const guide = (kind, text, target) => ({ kind, label: target && target.label, text, target, source: null, waiting: false });
      if ((defending() || state.room === 'heart') && organStability() < 60) {
        const t = currentTissues().filter(t => t.integrity < 50).sort((a,b) => a.integrity-b.integrity)[0];
        if (t) return guide('repair', '用 1 修补组织，稳定度需达到 60', { ...t });
      }
      if (state.room === 'entry' && state.entryLesion.complete) return guide('portal', '穿过瓣膜，前往主血管', portalList().find(p => p.id === 'to-main'));
      if (state.room === 'heart' && state.heartStable) return guide('portal', '前往出口，按 E 撤离', portalList().find(p => p.id === 'exit'));
      if (state.room === 'main' && state.flowRestored) return guide('portal', '前往心脏内腔', portalList().find(p => p.id === 'to-heart'));
      const supply = state.supplies.find(s => s.room === state.room && s.state === 'ready');
      if (supply) return guide('supply', '靠近补给，按 E 领取' + supply.label, { ...supply });
      if (state.room === 'main' && state.stage === 'clot' && state.weakpoints.every(p => p.complete)) return guide('release', '前往主流阀，按 E 释放血流', { ...GEOMETRY.main.nodes.find(n => n.id === 'release') });
      if (state.room === 'heart' && state.stage === 'recovery') return guide('sync', '用 3 点击同步核心：' + state.verifiedBeats + '/3', { ...SYNC_CORE });
      if (state.room === 'heart') {
        const sector = state.heartSectors.filter(s => !s.complete).sort((a,b) => distance(a,state.player)-distance(b,state.player))[0];
        if (sector) return guide('sector', !sector.scanned ? '靠近病灶，按 Q 诊断' : sector.cleared ? state.unlockedTools.probe ? '用 3 接通传导' : '领取脉冲探针' : sector.requiredTool === 'sprayer' ? '用 2 裂解西区纤维' : '用 1 疏通东区凝块', { ...sector });
      }
      return null;
    }
    function fibersComplete() { return state.weakpoints.filter(p => p.kind === 'fiber').every(p => p.complete); }
    function branchRestored() { return state.bypassA || state.bypassB; }
    function reloadDuration() { return RELOAD_TIME; }
    function toolDefinition() { return TOOLS.find(t => t.id === state.tool); }
    function currentTissues(room = state.room) { return state.tissues.filter(t => t.room === room); }
    function organStability() { const tissues = currentTissues(); return tissues.length ? tissues.reduce((sum, t) => sum + t.integrity, 0) : 100; }
    function defending(room = state.room) { const encounter = state.encounters[room]; return !!encounter && encounter.active && !encounter.closed; }
    function restoreTissues(room) { currentTissues(room).forEach(t => { t.integrity = 50; t.attached = false; t.attachmentProgress = 0; t.hitFlash = 0; }); }
    function selectTool(id) {
      const tool = TOOLS.find(t => t.id === id);
      if (!tool || !state.unlockedTools[id] || state.failed || state.finished || inputLocked()) return false;
      state.firing = false; state.treatmentLease = 0; state.treatmentTargetIds = []; state.treatmentTargetId = null;
      state.tool = id; state.newTools[id] = false; feedback('已选择 ' + tool.key + ' ' + tool.label + ' · ' + tool.description); publish(true); return true;
    }
    function beginRecovery() {
      if (state.failed || state.stage !== 'conduction' || !state.heartSectors.every(s => s.complete) || organStability() < 60) return;
      state.heartConnected = true; state.recovery = .001; state.firstStrongBeat = true; state.verifiedBeats = 0; state.downstreamReceived = false; state.signalPulses = [];
      closeEncounter('heart'); clearInput(); setStage('recovery'); feedback('传导已接通 · 用 3 点击同步核心，验证三次脉冲', 'good');
    }
    function requestSupply(id, branch) {
      const supply = state.supplies.find(s => s.id === id); if (!supply || supply.state !== 'waiting') return;
      if (id === 'lysis') { const path = GEOMETRY.main.paths.find(p => p.branch === (branch.id === 'left' ? 'A' : 'B')); const stop = path.points.findIndex(p => p.x === branch.x && p.y === branch.y); supply.route = [...copy(path.points.slice(0, stop + 1)), { x: branch.x + (branch.id === 'left' ? -70 : 70), y: branch.y }]; }
      if (id === 'probe' && branch) supply.route = [{ x: 1300, y: 1580 }, { x: 1300, y: 1330 }, { x: branch.x, y: branch.y + 180 }];
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
    function inputLocked() { return !!state.pendingDiagnosis || state.revealRemaining > 0 || ['burst', 'ending'].includes(state.stage); }
    function beat() {
      const silent = false, stable = state.heartConnected && state.firstStrongBeat;
      const period = stable ? 1.35 : 1.9, phase = (state.heartbeatClock / period) % 1;
      return { phase, pulse: silent ? 0 : Math.exp(-phase * 15) + Math.exp(-Math.pow((phase - 0.19) * 16, 2)) * 0.42, safe: phase >= 0.52 && phase <= 0.86,
        state: stable ? 'stable' : state.heartConnected ? 'recovering' : state.flowRestored ? 'weak' : 'critical', period, silent, strong: stable };
    }
    function bounds(room = state.room) { return GEOMETRY[room].bounds; }
    function overlapsRect(x, y, radius, rect) { return Math.hypot(x - clamp(x, rect.x, rect.x + rect.w), y - clamp(y, rect.y, rect.y + rect.h)) < radius; }
    function resolveDashOverlap() {
      if (state.room !== 'heart' || state.heartStable) return;
      const barrier = GEOMETRY.heart.obstacles.find(o => o.kind === 'dashBarrier');
      if (overlapsRect(state.player.x, state.player.y, RADIUS, barrier)) {
        state.player.y = barrier.y + barrier.h + RADIUS + 1;
      }
    }
    function clearInput() { state.keys.clear(); state.firing = false; state.syncArmed = false; state.precision = false; state.emptyLatched = false; state.player.velocity = { x: 0, y: 0 }; state.player.moving = false; state.treatmentLease = 0; state.treatmentTargetId = null; state.treatmentTargetIds = []; if (state.dashRemaining > 0) resolveDashOverlap(); state.dashRemaining = 0; }
    function obstacles(room = state.room, forEnemy = false) {
      const items = GEOMETRY[room].obstacles.filter(o => !(o.kind === 'clot' && state.flowRestored) && !(o.kind === 'dashBarrier' && state.heartStable));
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
    function hunterDestination(enemy, dt, target = state.player) {
      if (!blockedSegment(enemy, target, 23)) return target;
      enemy.pathTimer = (enemy.pathTimer || 0) - dt;
      if (enemy.pathTimer > 0 && enemy.waypoint && distance(enemy, enemy.waypoint) > 5) return enemy.waypoint;
      enemy.pathTimer = 0.35;
      const b = bounds(), walls = obstacles(state.room, true), points = [{ x: enemy.x, y: enemy.y }, { x: target.x, y: target.y }];
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
      enemy.waypoint = Number.isFinite(costs[1]) ? points[first] : { x: target.x, y: target.y }; return enemy.waypoint;
    }
    function updateValve() {
      if (state.room !== 'entry') return;
      if (!beat().safe && overlapsRect(state.player.x, state.player.y, RADIUS, VALVE)) { state.player.y = state.valveSide === 'above' ? VALVE.y - RADIUS - 1 : VALVE.y + VALVE.h + RADIUS + 1; feedback('瓣膜收缩 · 等待舒张'); }
      if (state.player.y < VALVE.y - RADIUS) state.valveSide = 'above'; else if (state.player.y > VALVE.y + VALVE.h + RADIUS) state.valveSide = 'below';
    }
    function progress() {
      if (state.finished) return 1;
      if (state.ending > 0) return 0.98;
      if (state.heartStable) return 0.96;
      if (state.heartConnected) return 0.9 + state.verifiedBeats / 3 * 0.04;
      if (state.flowRestored) return 0.78 + state.heartSectors.reduce((n,s) => n + (s.cleared ? 1 : s.progress) + s.relay.progress, 0) / 4 * .11;
      if (state.stage === 'burst') return 0.74 + Math.min(1, state.burst / BURST_TIME) * 0.04;
      if (state.unlockedTools.sprayer) return 0.4 + state.weakpoints.reduce((sum, p) => sum + p.progress, 0) * 0.11;
      if (branchRestored()) return 0.32;
      if (state.stage === 'bypass') return 0.14 + Math.max(...state.branches.map(p => p.progress)) * 0.17;
      return (state.entryLesion.complete ? .08 : state.entryLesion.progress * .06) + (state.scanned.clot ? .04 : 0);
    }
    function publish(force) {
      const value = progress(); if (force || Math.abs(value - state.lastProgress) > 0.001) { call('progress', value); state.lastProgress = value; }
      if (force || state.hudTimer <= 0) { call('setTask', task()); call('hud', { integrity: state.integrity, organStability: organStability(), tissues: currentTissues(), defense: defenseSnapshot(), heartStable: state.heartStable, ammo: state.ammo, reloadRemaining: state.reloadRemaining, reloadProgress: reloadProgress(), reloadStage: state.reloadStage, reloadDuration: reloadDuration(), reloadAutomatic: state.reloadAutomatic, tool: state.tool, tools: TOOLS.map(t => ({ ...t, unlocked: !!state.unlockedTools[t.id], isNew: !!state.newTools[t.id] })), scanner: state.scanner, stageLabel: STAGES[state.stage], roomLabel: ROOMS[state.room], task: task(), checkpoint: CHECKPOINTS[state.checkpoint], checkpointId: state.checkpoint, retries: state.retries, heartbeatState: beat().state, dashUnlocked: true, dashCooldown: state.dashCooldown }); state.hudTimer = 0.1; }
    }
    function portalList(room = state.room) {
      if (room === 'entry') return [{ id: 'to-main', x: 1412.5, y: 275, label: '主血管', locked: !state.entryLesion.complete, requires: '先用 1 清除东侧轻度凝块，恢复入口供血' }];
      if (room === 'main') return [{ id: 'to-entry', x: 1100, y: 1280, label: '血管入口', locked: defending(room), requires: '关键组织正在受袭，先完成本区治疗并恢复稳定' }, { id: 'to-heart', x: 1100, y: 160, label: '心脏内腔', locked: !state.flowRestored, requires: '主血管仍被淤堵阻断' }];
      return [{ id: 'to-main', x: 1300, y: 1560, label: '主血管', locked: defending(room) || state.stage === 'recovery', requires: '先修复故障、稳定组织并通过三拍复测' }, { id: 'exit', x: 1300, y: 160, label: '撤离出口', locked: !state.heartStable, requires: '心脏尚未通过三拍复测' }];
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

      return candidates.filter(item => distance(item, state.player) <= INTERACT_RANGE).sort((a, b) => distance(a, state.player) - distance(b, state.player))[0] || null;
    }
    function enterRoom(room) {
      clearInput(); const previous = state.room; state.room = room;
      Object.assign(state.player, room === 'entry' ? { x: 1412.5, y: 330 } : room === 'main' ? previous === 'heart' ? { x: 1100, y: 210 } : { x: 1100, y: 1230 } : { x: 1300, y: 1500 });
      if (room === 'heart' && !state.heartRevealed) { state.heartRevealed = true; state.revealRemaining = REVEAL_TIME; }
      if (room === 'entry') state.valveSide = 'above';
      feedback(room === 'heart' ? '任选东西两区，诊断并救治' : ROOMS[room] + ' · Q 诊断，E 交互'); publish(true);
    }
    function interactNode(node) {
      if (node.kind === 'diagnostic') { feedback(state.scanned[node.id] ? diagnosticText(node.id) : 'Q 开启扫描，在附近停留以读取组织状态'); return; }
      if (node.kind === 'supply') {
        const supply = state.supplies.find(s => s.id === node.id); if (!supply || supply.state !== 'ready') return;
        supply.state = 'collected'; state.unlockedTools[supply.tool] = true; state.newTools[supply.tool] = true; clearInput();
        if (supply.id === 'lysis') { state.combatComplete = true; setStage('clot'); }
        feedback(supply.label + '已领取 · ' + (supply.tool === 'sprayer' ? '2 切换裂解喷雾，针对纤维包裹层' : '3 切换修复探针，处理脉冲输出中断处'), 'good'); publish(true); return;
      }
      if (node.kind === 'branch') { feedback(state.branches.find(p => p.nodeId === node.id).complete ? '该侧支已疏通 · 血流正持续通过' : '这是局部阻塞 · 瞄准并用 1 精准治疗器疏通，无需 E 连接'); return; }
      if (node.kind === 'sample') { feedback(sampleState(node.id).label + ' · 沿脉冲继续追踪，不需要依次按 E'); return; }
      if (node.kind === 'fault') { feedback(state.fault.complete ? '输入与输出均已恢复 · 正在随心跳复测' : '输入有脉冲、输出中断 · 需要修复探针，扫描可请求外部补给'); return; }
      if (node.kind === 'release') {
        if (state.flowRestored) { feedback('主血流畅通 · 心脏入口已经打开', 'good'); return; }
        if (!branchRestored()) { feedback('上游压力仍高 · 先疏通任一侧支，让血流有分流通路'); return; }
        if (!state.weakpoints.every(p => p.complete)) { feedback('包裹层或核心仍未处理 · 分层治疗后再启动主流'); return; }
        if (organStability() < 60) { feedback('心脏稳定度不足 60 · 先用 1 抢修组织，纤维附着需用 2 清除', 'bad'); return; }
        state.burst = 0.001; closeEncounter('main'); clearInput(); setStage('burst'); feedback('压力安全，结构已软化 · 主血流将带走碎屑和干扰者', 'good'); call('sound', 'hit');
      }
    }
    function interact() {
      if (state.failed || state.finished || inputLocked()) return;
      const target = nearbyInteraction(); if (!target) { feedback('靠近组织节点或房间入口，再按 E 交互'); return; }
      if (target.kind) { interactNode(target); return; } if (target.locked) { feedback(target.requires); return; }
      if (target.id === 'to-main') enterRoom('main'); else if (target.id === 'to-entry') enterRoom('entry'); else if (target.id === 'to-heart') enterRoom('heart'); else if (target.id === 'exit' && state.heartStable) beginEnding();
    }
    function diagnosticText(id) {
      const targetId=id==='pressure'?'entry-lesion':id==='heart-signal'?'sync-core':id;
      const target=diagnosisTargets().find(t=>t.id===targetId);
      return target?diagnosisFor(target).result:['C1','C2','C3'].includes(id)?sampleState(id).label:'按 Q 扫描组织';
    }
    function sampleState(id) {
      const downstream = id === 'C3', receiving = !downstream || state.downstreamReceived;
      return { input: receiving, output: receiving, healthy: receiving, label: (id === 'C1' ? '上游' : id === 'C2' ? '中段' : '下游') + (receiving ? '：输入与输出均有脉冲' : state.fault.complete ? '：传导已修复，等待首个真实脉冲抵达' : '：没有脉冲抵达 · 沿路径向上游追查') };
    }
    // A case groups anatomy that should share one diagnosis and one pause.
    function diagnosisTargets(room = state.room) {
      const targets = currentTissues(room).map(t => ({ ...t, caseKind: 'tissue', critical: t.integrity < 50, revision: (t.integrity < 50 ? 'damaged' : 'healthy') + (t.attached ? '-covered' : ''), scanRadius: SCAN_RANGE }));
      if (room === 'entry') targets.push({ ...GEOMETRY.entry.nodes[0], caseKind: 'normal', critical: false, revision: 'normal', scanRadius: SCAN_RANGE }, { ...state.entryLesion, caseKind: 'entry', critical: true, revision: state.entryLesion.complete ? 'restored' : 'blocked', scanRadius: SCAN_RANGE });
      if (room === 'main') {
        targets.push(...state.branches.map(t => ({ ...t, caseKind: 'branch', critical: true, revision: t.complete ? 'restored' : 'blocked', scanRadius: SCAN_RANGE })));
        targets.push({ ...CLOT, id: 'clot', label: '主血栓', caseKind: 'clot', critical: true, revision: state.flowRestored ? 'restored' : fibersComplete() ? state.weakpoints.every(p => p.complete) ? 'treated' : 'core' : branchRestored() ? 'fiber' : 'pressure', scanRadius: 230 });
      }
      if (room === 'heart') targets.push(...state.heartSectors.map(t => ({ ...t, caseKind: 'sector', critical: true, revision: t.complete ? 'restored' : t.cleared ? 'relay' : 'blocked', scanRadius: SCAN_RANGE })), { ...SYNC_CORE, caseKind: 'sync', critical: true, revision: state.heartStable ? 'stable' : state.heartConnected ? 'verify' : 'disconnected', scanRadius: SCAN_RANGE });
      return targets.map(t => ({ ...t, room }));
    }
    function diagnosisFor(target) {
      let result, actions, requiredTool = null;
      if (target.caseKind === 'normal') { result = '血流与压力正常。'; actions = ['检查另一侧缺血支路。']; }
      else if (target.caseKind === 'entry') { result = state.entryLesion.complete ? '局部供血已恢复，深处仍有高压。' : '轻度凝块阻流，局部组织缺血。'; actions = [state.entryLesion.complete ? '穿过瓣膜，追查主血管。' : '使用 1 清除凝块。']; requiredTool = state.entryLesion.complete ? null : 'precision'; }
      else if (target.caseKind === 'branch') { result = target.complete ? '侧支已疏通，分流正常。' : '局部凝块阻断侧支。'; actions = [target.complete ? '领取补给，处理主血栓。' : '使用 1 疏通此处；两侧任选其一。']; requiredTool = target.complete ? null : 'precision'; }
      else if (target.caseKind === 'clot') {
        result = state.flowRestored ? '主血流已恢复。' : !branchRestored() ? '主流高压，侧支存在可疏通通路。' : fibersComplete() ? state.weakpoints.every(p => p.complete) ? '包裹层与核心均已处理。' : '外层已剥离，核心暴露。' : '纤维包裹核心，需分层处理。';
        actions = [state.flowRestored ? '前往心腔检查传导。' : !branchRestored() ? '使用 1 疏通任一侧支。' : state.weakpoints.every(p => p.complete) ? '稳定度达到 60 后，按 E 启动主流阀。' : fibersComplete() ? '使用 1 处理暴露核心。' : '使用 2 裂解两处纤维，再用 1 处理核心。']; requiredTool = state.flowRestored || state.weakpoints.every(p => p.complete) ? null : !branchRestored() || fibersComplete() ? 'precision' : 'sprayer';
      } else if (target.caseKind === 'tissue') {
        result = target.integrity < 50 ? '组织受损，完整度 ' + Math.ceil(target.integrity) + '/50' + (target.attached ? '，有纤维覆盖。' : '。') : target.attached ? '组织完整，仍有纤维覆盖。' : '组织完整，灌流稳定。';
        actions = target.integrity < 50 ? ['使用 1 直接修补裂口。', ...(target.attached ? ['可另用 2 清除覆盖物。'] : [])] : [target.attached ? '可用 2 清除覆盖物。' : '无需治疗。']; requiredTool = target.integrity < 50 ? 'precision' : target.attached ? 'sprayer' : null;
      } else if (target.caseKind === 'sector') {
        result = target.complete ? '本区传导恢复，增援来源已关闭。' : target.cleared ? '病灶外层已清除，传导仍中断。' : target.requiredTool === 'sprayer' ? '纤维束缚传导，持续释放织体。' : '凝块阻流，持续释放凝集体。';
        requiredTool = target.complete ? null : target.cleared ? 'probe' : target.requiredTool;
        actions = target.complete ? ['检查另一区；受损组织用 1 修补。'] : [target.cleared ? '使用 3 接通传导。' : '使用 ' + (target.requiredTool === 'sprayer' ? '2 裂解纤维' : '1 疏通凝块') + '，再用 3 接通。', ...(!state.unlockedTools.probe ? ['领取沿血流送来的脉冲探针。'] : [])];
      } else { result = state.heartStable ? '三次脉冲完整抵达，心脏同步稳定。' : state.heartConnected ? '双区传导接通，等待验证。' : '双区传导尚未全部接通。'; actions = [state.heartStable ? '前往出口，按 E 撤离。' : state.heartConnected ? '用 3 分别点击核心三次；等待每次脉冲抵达。' : '先恢复东西两区，稳定度达到 60。']; requiredTool = state.heartConnected && !state.heartStable ? 'probe' : null; }
      return { targetId: target.id, room: target.room, title: target.label, result, actions, requiredTool, revision: target.revision };
    }
    function acknowledgeDiagnosis() { if (!state.pendingDiagnosis) return false; state.pendingDiagnosis = null; clearInput(); publish(true); return true; }
    function reviewDiagnosis() {
      if (state.failed || state.finished || state.pendingDiagnosis || state.revealRemaining > 0 || ['burst','ending'].includes(state.stage)) return false;
      const known = diagnosisTargets().filter(t => state.scanned[t.id]);
      const aimed = known.filter(t => distance(t, state.aim) <= (t.radius || 45) + 25).sort((a,b) => distance(a,state.aim)-distance(b,state.aim))[0];
      let target = aimed || known.find(t => t.id === state.scanFocusId);
      if (!target && state.diagnosisReport) target = diagnosisTargets(state.diagnosisReport.room).find(t => t.id === state.diagnosisReport.targetId);
      if (!target) { feedback('先按 Q 扫描组织'); return false; }
      state.pendingDiagnosis = state.diagnosisReport = diagnosisFor(target); state.scanner = false; clearInput(); publish(true); return true;
    }
    function updateScanner(dt) {
      if (!state.scanner) return;
      const targets = diagnosisTargets();
      if (!state.scanFocusId) {
        const eligible = targets.filter(t => distance(t,state.player) <= t.scanRadius);
        const aimed = eligible.filter(t => distance(t,state.aim) <= (t.radius || 40) + 35).sort((a,b) => distance(a,state.aim)-distance(b,state.aim));
        const target = aimed[0] || eligible.sort((a,b) => distance(a,state.player)-distance(b,state.player))[0];
        if (!target) return;
        state.scanFocusId = target.id;
      }
      const target = targets.find(t => t.id === state.scanFocusId);
      if (!target || distance(target,state.player) > target.scanRadius) return;
      const key = target.id + '@' + target.revision;
      state.scanProgress[key] = Math.min(1, (state.scanProgress[key] || 0) + dt / SCAN_TIME);
      if (state.scanProgress[key] < 1 - 1e-8) return;
      state.scanner = false; state.scanProgress[key] = 0; state.scanProgress[target.id] = 1; state.scanned[target.id] = true;
      if (target.caseKind === 'entry') { state.scanned.pressure = true; state.entryLesion.scanned = true; }
      if (target.caseKind === 'branch') state.branches.find(p => p.id === target.id).scanned = true;
      if (target.caseKind === 'clot') { state.weakpoints.forEach(p => p.scanned = true); if (state.stage === 'diagnosis') setStage('bypass'); }
      if (target.caseKind === 'sector') { state.heartSectors.find(p => p.id === target.id).scanned = true; state.fault.scanned = true; requestSupply('probe', target); }
      state.diagnosisReport = diagnosisFor(target);
      if (target.critical && !state.reported[key]) { state.reported[key] = true; state.pendingDiagnosis = state.diagnosisReport; clearInput(); }
      else feedback(state.diagnosisReport.result);
      publish(true);
    }
    function reloadProgress() { return state.reloadRemaining > 0 ? clamp(1 - state.reloadRemaining / reloadDuration(), 0, 1) : 0; }
    function startReload(automatic = false) { if (state.reloadRemaining > 0 || state.ammo === MAGAZINE || state.failed || state.finished || inputLocked() || automatic && state.treatmentLease > 1e-8) return; if (!automatic) { state.treatmentLease = 0; state.treatmentTargetIds = []; state.treatmentTargetId = null; } state.reloadRemaining = reloadDuration(); state.reloadStage = 'eject'; state.reloadAutomatic = automatic; call('sound', 'reloadOut'); feedback(automatic ? '自动装填中' : '装填中'); publish(true); }
    function warning(text) { if (state.warningCooldown <= 0) { state.warningCooldown = 2; feedback(text); } }
    function enemyWeakpoint(enemy) { const direction = enemy.direction || { x: 0, y: 1 }, angle = Math.atan2(direction.y, direction.x) + Math.PI / 2; return { x: enemy.x + Math.cos(angle) * 16, y: enemy.y + Math.sin(angle) * 16, radius: 10, exposed: enemy.state === 'recover' }; }
    function circleHit(from, to, center, radius) {
      const dx = to.x - from.x, dy = to.y - from.y, ox = from.x - center.x, oy = from.y - center.y, a = dx * dx + dy * dy, c = ox * ox + oy * oy - radius * radius;
      if (c <= 0) return 0;
      const b = ox * dx + oy * dy, discriminant = b * b - a * c;
      if (a < 1e-12 || discriminant < 0) return null;
      const t = (-b - Math.sqrt(discriminant)) / a; return t >= 0 && t <= 1 ? t : null;
    }
    function treatmentHit(from, to, target) {
      if (!target.hitArea) return circleHit(from, to, target, target.radius || 25);
      const { rx, ry } = target.hitArea;
      return circleHit({ x: (from.x-target.x)/rx, y: (from.y-target.y)/ry }, { x: (to.x-target.x)/rx, y: (to.y-target.y)/ry }, { x: 0, y: 0 }, 1);
    }
    // Preview, fan outline and every delivered dose share these first-entity queries.
    function tissueTreatmentTool(tissue) {
      return tissue.attached && (state.tool === 'sprayer' || tissue.integrity >= tissue.maxIntegrity) ? 'sprayer' : 'precision';
    }
    function treatmentEndpoints() {
      // Coating is a separate cleaning target, never a gate on precision repair.
      // A full tissue must not absorb precision shots just because it is coated.
      const tissues = currentTissues().filter(t => t.integrity < t.maxIntegrity || t.attached && state.tool !== 'precision').map(t => ({ ...t, requiredTool: tissueTreatmentTool(t), treatmentKind: 'tissue', available: true }));
      if (state.room === 'entry') return state.entryLesion.complete ? [] : [{ ...state.entryLesion, treatmentKind: 'entry', available: true }];
      if (state.room === 'main') return [
        ...tissues,
        ...state.branches.filter(p => !p.complete).map(p => ({ ...p, treatmentKind: 'branch', available: true })),
        ...(!state.flowRestored ? state.weakpoints.filter(p => !p.complete).map(p => ({ ...p, radius: 25, treatmentKind: p.kind, available: branchRestored() && (p.kind !== 'core' || fibersComplete()) })) : [])
      ];
      if (state.room === 'heart') return [
        ...tissues,
        ...state.heartSectors.filter(s => !s.complete).map(s => s.cleared ? { ...s.relay, treatmentKind: 'relay', available: true } : { ...s, treatmentKind: 'sector', available: true }),
        ...(state.stage === 'recovery' ? [{ ...SYNC_CORE, treatmentKind: 'sync', available: true }] : [])
      ];
      return [];
    }
    function resolveRay(direction, range) {
      const from = { x: state.player.x, y: state.player.y }, far = { x: from.x + direction.x * range, y: from.y + direction.y * range }, candidates = [];
      const endpoints = treatmentEndpoints().map(p => ({ p, t: treatmentHit(from, far, p) })).filter(item => item.t !== null).sort((a, b) => a.t - b.t);
      const structural = endpoints.find(item => ['fiber', 'core'].includes(item.p.treatmentKind));
      const wall = wallHit(from, far, 0, structural ? 'clot' : '');
      if (wall) candidates.push({ t: wall.t, priority: 0, hitType: wall.rect.kind === 'clot' ? 'clot' : 'wall', targetId: wall.rect.id, weakpoint: false, blocked: true, label: wall.rect.kind === 'clot' ? '血栓实体 · 观察包裹层与核心，瞄准具体病灶' : '组织墙遮挡' });
      const b = bounds();
      for (const [delta, origin, edge] of [[far.x - from.x, from.x, b.left], [far.x - from.x, from.x, b.right], [far.y - from.y, from.y, b.top], [far.y - from.y, from.y, b.bottom]]) {
        if (Math.abs(delta) < 1e-8) continue;
        const t = (edge - origin) / delta;
        if (t >= 0 && t <= 1) candidates.push({ t, priority: 0, hitType: 'wall', targetId: 'boundary', weakpoint: false, blocked: true, label: '边界遮挡' });
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
        const bodyT = circleHit(from, far, enemy, 22), weakpoint = enemyWeakpoint(enemy), weakT = state.tool === 'precision' && weakpoint.exposed ? circleHit(from, far, weakpoint, weakpoint.radius) : null;
        if (bodyT === null) return;
        const weak = weakT !== null && (!wall || weakT < wall.t - 1e-8);
        candidates.push({ t: bodyT, endpointT: weak ? weakT : bodyT, priority: 1, hitType: 'hunter', targetId: enemy.id, weakpoint: weak, blocked: false, label: state.tool === 'probe' ? '修复探针对异常细胞无效 · 切换 1 或 2' : weak ? '恢复期弱点 · 精准命中 3 点' : '异常细胞身体 · 1 点伤害' });
      });
      candidates.sort((a, b) => Math.abs(a.t - b.t) <= 1e-8 ? a.priority - b.priority : a.t - b.t);
      const hit = candidates[0], t = hit ? hit.endpointT === undefined ? hit.t : hit.endpointT : 1;
      return { from, to: { x: from.x + (far.x - from.x) * t, y: from.y + (far.y - from.y) * t }, kind: hit && hit.hitType === 'treatment' ? 'treatment' : hit && ['clot', 'ineffective', 'healthy'].includes(hit.hitType) ? 'warning' : 'shot', hitType: hit ? hit.hitType : 'none', targetId: hit ? hit.targetId : null, treatmentKind: hit ? hit.treatmentKind || null : null, weakpoint: hit ? hit.weakpoint : false, blocked: hit ? hit.blocked : false, label: hit ? hit.label : '射程内无目标', range, tool: state.tool };
    }
    function repairHint(ray) {
      const target = currentTissues().find(t => Math.pow((state.aim.x-t.x)/t.hitArea.rx,2) + Math.pow((state.aim.y-t.y)/t.hitArea.ry,2) <= 1);
      if (!target) return ray;
      const requiredTool = tissueTreatmentTool(target), hits = ray.targets || [], targetHit = hits.find(hit => hit.targetId === target.id);
      let reason, text;
      if (state.reloadRemaining > 0) { reason = 'reloading'; text = '正在装填'; }
      else if (target.integrity >= target.maxIntegrity && (!target.attached || state.tool !== 'sprayer')) { reason = 'healthy'; text = target.attached ? '组织已修复 · 2 清覆盖' : '组织完好'; }
      else if (targetHit) {
        if (state.tool !== requiredTool) { reason = 'wrong-tool'; text = target.attached ? '1 修补 · 2 清覆盖' : '请用 1 修补裂口'; }
        else { reason = 'ready'; text = state.tool === 'sprayer' ? '按住左键清除覆盖' : target.attached ? '按住左键修补裂口' : '按住左键修补裂口'; }
      }
      else if (ray.blocked) { reason = 'wall'; text = '组织墙遮挡 · 换个角度'; }
      else if (ray.hitType === 'hunter') { reason = 'enemy'; text = '敌人挡住治疗'; }
      else { reason = 'out-of-range'; text = state.tool === 'sprayer' ? '喷头距离不足 · 再靠近' : '治疗距离不足 · 再靠近'; }
      return { ...ray, repairHint: { targetId: target.id, target: { x: target.x, y: target.y }, reason, text, requiredTool } };
    }
    function resolveToolRay() {
      const from = state.player, dx = state.aim.x - from.x, dy = state.aim.y - from.y, length = Math.hypot(dx, dy), direction = length > 1e-8 ? { x: dx / length, y: dy / length } : state.aimDirection;
      if (state.tool !== 'sprayer') {
        const ray = resolveRay(direction, toolDefinition().range);
        return repairHint({ ...ray, angle: 0, targets: ray.targetId === null ? [] : [{ id: ray.targetId, x: ray.to.x, y: ray.to.y, ...ray }], fanPoints: [] });
      }
      const angle = Math.PI / 3, base = Math.atan2(direction.y, direction.x), rays = [];
      for (let i = 0; i <= 12; i++) { const a = base - angle / 2 + angle * i / 12; rays.push(resolveRay({ x: Math.cos(a), y: Math.sin(a) }, 145)); }
      const targets = [], seen = new Set();
      rays.forEach(ray => { const key = ray.hitType + ':' + ray.targetId; if (ray.targetId === null || seen.has(key)) return; seen.add(key); targets.push({ id: ray.targetId, x: ray.to.x, y: ray.to.y, ...ray }); });
      const primary = rays[6];
      return repairHint({ ...primary, angle, targets, fanPoints: rays.map(ray => ({ ...ray.to })) });
    }
    function currentEnemies(room = state.room) { return state.enemies.filter(e => e.room === room && e.hp > 0); }
    function startDefense(room, grace = 3) {
      const encounter = state.encounters[room];
      if (!encounter || encounter.closed || encounter.active) return;
      encounter.active = true; encounter.grace = grace; encounter.queue = ['first', 'first']; encounter.cooldown = 0;
      feedback('病灶开始增援 · 用 1 保护组织', 'bad'); publish(true);
    }
    function defenseSnapshot() {
      const e = state.encounters[state.room], sources = sourceList();
      return { active: defending(), closed: e ? e.closed : true, grace: e ? e.grace : 0, source: sources[0] || null, sources, safeThreshold: 60 };
    }
    function sourceList() { return state.room === 'heart' ? state.heartSectors.map(s => ({ id: s.id, room: 'heart', x: s.x, y: s.y, label: s.label, closed: s.complete })) : SOURCES[state.room] ? [{ ...SOURCES[state.room], closed: state.encounters[state.room].closed }] : []; }
    function tissueProtected(tissue) { return tissue.room === 'heart' && !!state.heartSectors.find(s => s.id === tissue.sourceId && s.complete); }
    function closeEncounter(room) {
      const encounter = state.encounters[room];
      encounter.closed = true; encounter.active = false; encounter.queue = []; encounter.warning = null; encounter.cooldown = 0; state.projectiles = state.projectiles.filter(p => p.room !== room);
    }
    function safeSpawnInRoom(point, room, player) {
      const b = bounds(room), protectedPoints = [
        ...GEOMETRY[room].nodes, ...portalList(room),
        ...(room === 'main' ? [...state.branches, ...state.weakpoints] : room === 'heart' ? [...state.heartSectors, SYNC_CORE] : []), ...currentTissues(room),
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
      const type = point.type || (state.unlockedTools.sprayer && encounter.spawned % 2 === 0 ? 'weaver' : 'coagulator');
      state.enemies.push({ x: point.x, y: point.y, room: state.room, sourceId: point.sourceId || 'main-clot', id, type, label: type === 'weaver' ? '纤维织体' : '凝集体', hp: HUNTER_HP, state: 'approach', timer: 1.2 + id % 3 * .3, target: null, targetKind: null, targetId: null, hasHit: false, hitFlash: 0, telegraph: 0 });
      encounter.spawned++;
    }
    function updateSpawns(dt) {
      const encounter = state.encounters[state.room];
      if (!encounter || encounter.closed || !encounter.active) return;
      if (encounter.grace > 0) { encounter.grace = Math.max(0, encounter.grace - dt); return; }
      encounter.cooldown = Math.max(0, encounter.cooldown - dt);
      encounter.attackCooldown = Math.max(0, encounter.attackCooldown - dt);
      if (encounter.warning) {
        if (!safeSpawn(encounter.warning)) { encounter.warning = null; encounter.cooldown = .2; return; }
        encounter.warning.remaining = Math.max(0, encounter.warning.remaining - dt);
        if (encounter.warning.remaining <= 1e-8 && currentEnemies().length < encounter.cap) {
          spawnHunters(encounter.warning); encounter.queue.shift(); encounter.warning = null; encounter.cooldown = encounter.queue.length ? .2 : SPAWN_INTERVAL - SPAWN_WARNING;
        }
        return;
      }
      if (currentEnemies().length >= encounter.cap || encounter.cooldown > 1e-8) return;
      if (!encounter.queue.length) encounter.queue.push('reinforcement');
      const source = state.room === 'heart' ? state.heartSectors.filter(s => !s.complete && currentEnemies().filter(e => e.sourceId === s.id).length < 2).sort((a,b) => currentEnemies().filter(e => e.sourceId === a.id).length-currentEnemies().filter(e => e.sourceId === b.id).length)[0] : null;
      if (state.room === 'heart' && !source) return;
      const points = SPAWN_POINTS[state.room].filter(p => !source || (p.x < 1300) === (source.id === 'heart-west')).filter(safeSpawn).sort((a, b) => distance(a, state.player) - distance(b, state.player));
      if (!points.length) { encounter.cooldown = .25; return; }
      encounter.warning = { ...points[0], sourceId: source ? source.id : 'main-clot', type: source ? source.enemyType : state.unlockedTools.sprayer && encounter.spawned % 2 === 0 ? 'weaver' : 'coagulator', room: state.room, id: ++state.spawnSerial, radius: 34, remaining: SPAWN_WARNING };
    }
    function beginEnding() { state.ending = .001; clearInput(); setStage('ending'); feedback('心脏已稳定 · 巨人重新呼吸，树林和村落随之苏醒', 'good'); }
    function completeTreatment(target) {
      target.progress = 1; target.complete = true; call('effect', target.x, target.y, '#f4df9c', 22);
      if (target === state.entryLesion) {
        feedback('入口供血恢复 · 前往主血管', 'good');
      } else if (state.branches.includes(target)) {
        const first = !branchRestored();
        if (target.id === 'left') state.bypassA = true; else state.bypassB = true;
        if (first) { state.checkpoint = 'bypass'; setStage('supply'); requestSupply('lysis', target); }
        feedback(target.label + '已疏通 · 血细胞通过，压力已降至安全范围' + (first ? '；外部补给已请求' : '；第二条侧支作为可选分流恢复'), 'good');
      } else if (state.heartSectors.includes(target)) {
        target.cleared = true; target.complete = false; feedback('病灶外层已清除 · 用 3 接通本区传导', 'good');
      } else if (state.heartSectors.some(s => s.relay === target)) {
        const sector = state.heartSectors.find(s => s.relay === target); sector.complete = true; state.checkpoint = sector.id;
        state.enemies.filter(e => e.sourceId === sector.id).forEach(e => call('effect', e.x, e.y, '#cce3af', 16));
        state.enemies = state.enemies.filter(e => e.sourceId !== sector.id); state.projectiles = state.projectiles.filter(p => p.sourceId !== sector.id);
        const encounter = state.encounters.heart; if (encounter.warning && encounter.warning.sourceId === sector.id) encounter.warning = null;
        state.fault.complete = state.heartSectors.every(s => s.complete); state.fault.progress = state.heartSectors.filter(s => s.complete).length / 2; state.fault.output = state.fault.complete;
        feedback((sector.id === 'heart-west' ? '西区' : '东区') + '传导恢复 · 本区增援停止', 'good'); call('sound', 'heartbeatStrong'); beginRecovery();
      }
      else {
        if (target.kind === 'fiber') { feedback(fibersComplete() ? '核心已暴露 · 用 1 处理' : target.label + '已裂解 · 处理另一处纤维', 'good'); }
        else feedback('核心处理完成 · 前往主流阀', 'good');
      }
      publish(true);
    }
    function treatmentTarget(id) { return state.tissues.find(p => p.id === id) || state.branches.find(p => p.id === id) || state.weakpoints.find(p => p.id === id) || state.heartSectors.find(s => s.id === id) || state.heartSectors.map(s => s.relay).find(r => r.id === id) || (id === ENTRY_LESION.id ? state.entryLesion : null); }
    function useTool(dt, timing) {
      if (!state.firing || state.reloadRemaining > 0 || state.failed || state.finished || inputLocked()) return;
      const inactive = Math.min(dt, timing.reloadRemaining), active = dt - inactive;
      if (active <= 1e-10) return;
      const cooldown = Math.max(0, timing.cooldown - inactive), lease = Math.max(0, timing.lease - inactive), ray = resolveToolRay();
      const targets = ray.targets || [], sync = ray.treatmentKind === 'sync' && ray.hitType === 'treatment';
      if (sync && (!state.syncArmed || state.signalPulses.some(p => p.verification))) { state.syncArmed = false; return; }
      const treatments = targets.filter(p => p.hitType === 'treatment' && p.treatmentKind !== 'sync'), paidTimes = new Map();
      treatments.forEach(hit => paidTimes.set(hit.targetId, (timing.targetIds || []).includes(hit.targetId) ? Math.min(active, lease) : 0));
      if (state.ammo > 0 && cooldown <= active + 1e-8) {
        const beforeShot = Math.min(active, cooldown), afterShot = active - beforeShot;
        treatments.forEach(hit => paidTimes.set(hit.targetId, ((timing.targetIds || []).includes(hit.targetId) ? Math.min(beforeShot, lease) : 0) + afterShot));
        state.shotCooldown = 0.2 - afterShot; state.ammo--; state.shot = { ...ray, age: afterShot }; state.treatmentTargetIds = treatments.map(hit => hit.targetId); state.treatmentTargetId = state.treatmentTargetIds[0] || null; state.treatmentLease = treatments.length ? 0.2 - afterShot : 0;
        call('sound', 'shot');
        if (sync) { state.syncArmed = false; emitVerification(); }
        if (ray.repairHint && !['ready','reloading'].includes(ray.repairHint.reason)) warning(ray.repairHint.text);
        targets.forEach(hit => {
          if (hit.hitType === 'hunter' && state.tool !== 'probe') {
            const enemy = state.enemies.find(e => e.id === hit.targetId); if (!enemy || enemy.hp <= 0) return;
            enemy.hp = Math.max(0, enemy.hp - (hit.weakpoint && state.tool === 'precision' ? 3 : 1)); enemy.hitFlash = 0.18; call('sound', hit.weakpoint ? 'hitWeak' : 'hit'); call('effect', hit.x, hit.y, hit.weakpoint ? '#fae3a7' : '#dbc5d7', hit.weakpoint ? 12 : 5);
            if (hit.weakpoint && state.tool === 'precision' && enemy.type === 'coagulator' && !state.runMetrics.weakpointEnemies.includes(enemy.id)) state.runMetrics.weakpointEnemies.push(enemy.id);
            if (enemy.hp === 0) { feedback('异常细胞已净化' + (hit.weakpoint ? ' · 恢复期弱点命中' : ''), 'good'); call('effect', enemy.x, enemy.y, '#b5dbb6', 18); }
          } else if (hit.hitType === 'treatment') { call('sound', 'treatment'); call('effect', hit.x, hit.y, '#c3e4c1', 3); }
          else if (hit.blocked) { call('sound', 'wall'); call('effect', hit.x, hit.y, '#b8aa99', 3); }
          if (!ray.repairHint && (['ineffective', 'healthy', 'clot'].includes(hit.hitType) || hit.hitType === 'hunter' && state.tool === 'probe')) warning(hit.label);
        });
      }
      for (const [id, paid] of paidTimes) {
        if (paid <= 0 || inputLocked()) continue;
        const target = treatmentTarget(id); if (!target || target.complete) continue;
        if (state.tissues.includes(target)) {
          if (target.attached && state.tool === 'sprayer') { target.attachmentProgress = clamp(target.attachmentProgress + paid / .8, 0, 1); if (target.attachmentProgress >= 1 - 1e-8) { target.attached = false; target.attachmentProgress = 0; feedback('覆盖物已清除' + (target.integrity < target.maxIntegrity ? ' · 1 可继续修补裂口' : ' · 组织已完好'), 'good'); } }
          else if (state.tool === 'precision') target.integrity = Math.min(target.maxIntegrity, target.integrity + paid * 20);
          if (state.stage === 'conduction') beginRecovery();
          continue;
        }
        if (state.branches.includes(target)) startDefense('main');
        const duration = target.duration || 1.5;
        target.progress = clamp(target.progress + paid / duration, 0, 1);
        if (target.progress >= 1 - 1e-8) completeTreatment(target);
      }
    }
    function hurt() {
      if (state.invulnerable > 0 || state.failed || state.finished) return;
      state.integrity = Math.max(0, state.integrity - 20); state.invulnerable = 0.85; state.damageFlash = 0.45; call('effect', state.player.x, state.player.y, '#dc9b91', 12); call('sound', 'miss');
      if (state.integrity <= 0) { state.failed = true; state.failureReason = 'medic'; clearInput(); call('fail', '医疗设备耐久耗尽。可从安全节点重启，完整治疗成果与工具保留，组织恢复稳定。'); } else feedback('设备受到冲撞 · Space 躲避，耐久 ' + state.integrity + '/100', 'bad'); publish(true);
    }
    function damageTissue(tissue, attached = false) {
      if (!tissue || tissue.integrity <= 0 || state.failed || !defending(tissue.room) || tissueProtected(tissue)) return;
      tissue.integrity = Math.max(0, tissue.integrity - 10); tissue.hitFlash = .5;
      state.runMetrics.minStability = Math.min(state.runMetrics.minStability, organStability());
      if (attached && !tissue.attached) { tissue.attached = true; tissue.attachmentProgress = 0; }
      call('effect', tissue.x, tissue.y, '#cf9574', 12); call('sound', 'miss');
      feedback(tissue.label + '受损，心脏稳定度 ' + Math.round(organStability()) + '/100 · ' + (tissue.attached ? '1 可直接修补，2 可清理覆盖物' : '用 1 修补裂口'), 'bad');
      if (organStability() <= 1e-8) { state.failed = true; state.failureReason = 'tissue'; clearInput(); call('fail', '心脏稳定度归零，关键组织失守。重启会恢复组织并清除当前威胁，完整治疗成果保留。'); }
      publish(true);
    }
    function updateEnemies(dt) {
      if (!defending()) return;
      updateSpawns(dt);
      const encounter = state.encounters[state.room], living = currentEnemies();
      currentTissues().forEach(t => { t.hitFlash = Math.max(0, t.hitFlash - dt); });
      living.forEach(enemy => {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt); enemy.timer -= dt;
        if (enemy.hp <= 0) return;
        const tissueOptions = currentTissues().filter(t => t.integrity > 0 && !tissueProtected(t) && (state.room !== 'heart' || t.sourceId === enemy.sourceId)).sort((a,b) => distance(a,enemy) - distance(b,enemy));
        if (enemy.state === 'approach') {
          const wantsTissue = enemy.type === 'weaver' || enemy.id % 2 === 0;
          const target = wantsTissue && tissueOptions.length ? tissueOptions[0] : state.player;
          const kind = target === state.player ? 'player' : 'tissue';
          if (enemy.targetId !== target.id || enemy.targetKind !== kind) { enemy.waypoint = null; enemy.pathTimer = 0; }
          enemy.targetKind = kind; enemy.targetId = target.id || null;
          const d = distance(enemy, target), covered = blockedSegment(enemy, target, 22), cast = enemy.type === 'weaver', reach = cast ? 330 : 220;
          if (d > (cast ? 250 : 80) || covered) {
            const destination = hunterDestination(enemy, dt, target), travel = Math.max(1, distance(enemy, destination));
            moveBody(enemy, (destination.x-enemy.x)/travel*105*dt, (destination.y-enemy.y)/travel*105*dt, 22, true);
          }
          if (enemy.timer <= 0 && d < reach && !covered && encounter.attackCooldown <= 0 && living.filter(e => ['telegraph','lunge','cast'].includes(e.state)).length < 2) {
            enemy.state = 'telegraph'; enemy.timer = cast ? 1.1 : .9; enemy.windup = enemy.timer; enemy.telegraph = 0; enemy.target = { x: target.x, y: target.y }; encounter.attackCooldown = .55;
          }
        } else if (enemy.state === 'telegraph') {
          enemy.telegraph = clamp(1-enemy.timer/enemy.windup,0,1);
          const target = enemy.targetKind === 'tissue' ? currentTissues().find(t => t.id === enemy.targetId) : state.player;
          if (!target || target.integrity === 0) { enemy.state = 'approach'; enemy.timer = .3; return; }
          if (enemy.timer <= 0) {
            const length = Math.max(1,distance(enemy,enemy.target)); enemy.direction = { x:(enemy.target.x-enemy.x)/length,y:(enemy.target.y-enemy.y)/length };
            if (enemy.type === 'weaver') {
              state.projectiles.push({ id: ++state.projectileSerial, room: state.room, sourceId: enemy.sourceId, x:enemy.x,y:enemy.y, from:{x:enemy.x,y:enemy.y},target:{...enemy.target},targetId:enemy.targetId,targetKind:enemy.targetKind,remaining:length/260, duration:length/260 });
              enemy.state = 'cast'; enemy.timer = .3;
            } else { enemy.state = 'lunge'; enemy.timer = .55; enemy.hasHit = false; }
          }
        } else if (enemy.state === 'lunge') {
          moveBody(enemy,enemy.direction.x*350*dt,enemy.direction.y*350*dt,22,true);
          if (!enemy.hasHit && distance(enemy,state.player) < 36) { enemy.hasHit = true; hurt(); }
          const tissue = currentTissues().find(t => t.integrity > 0 && !tissueProtected(t) && (state.room !== 'heart' || t.sourceId === enemy.sourceId) && distance(enemy,t) < 48);
          if (!enemy.hasHit && tissue) { enemy.hasHit = true; damageTissue(tissue); }
          if (enemy.timer <= 0) { enemy.state = 'recover'; enemy.timer = 1.2; }
        } else if (enemy.state === 'cast') { if (enemy.timer <= 0) { enemy.state = 'recover'; enemy.timer = 1.2; } }
        else if (enemy.timer <= 0) { enemy.state = 'approach'; enemy.timer = 1.5; }
      });
      state.projectiles = state.projectiles.filter(p => {
        if (p.room !== state.room) return true;
        const previous = {x:p.x,y:p.y}; p.remaining = Math.max(0,p.remaining-dt);
        const progress = p.duration > 0 ? 1-p.remaining/p.duration : 1;
        p.x=p.from.x+(p.target.x-p.from.x)*progress;p.y=p.from.y+(p.target.y-p.from.y)*progress;
        if (blockedSegment(previous,p,2)) return false;
        if (p.remaining > 0) return true;
        if (p.targetKind === 'tissue') { const tissue=currentTissues().find(t=>t.id===p.targetId); damageTissue(tissue,true); }
        else if (distance(p,state.player)<36) hurt();
        return false;
      });
      for (let i=0;i<living.length;i++) for(let j=i+1;j<living.length;j++) {
        const a=living[i],b=living[j],gap=distance(a,b); if(gap>=54||a.state==='lunge'||b.state==='lunge')continue;
        const dx=gap>.01?(a.x-b.x)/gap:a.id%2?1:-1,dy=gap>.01?(a.y-b.y)/gap:0,push=Math.min((54-gap)/2,48*dt);
        moveBody(a,dx*push,dy*push,22,true);moveBody(b,-dx*push,-dy*push,22,true);
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
    }
    function signalPath(pulse) {
      const nodes = GEOMETRY.heart.nodes, end = nodes.find(n => n.id === 'C3');
      if (pulse && pulse.verification) return [SYNC_CORE, end];
      const sector = state.heartSectors.find(s => s.id === (pulse && pulse.sectorId)) || state.heartSectors[0];
      return [nodes.find(n => n.id === 'C1'), sector, SYNC_CORE, end];
    }
    function pathLength(path) { return path.slice(1).reduce((n,p,i) => n + distance(path[i],p), 0); }
    function emitSignalPulse() {
      if (state.room !== 'heart' || state.revealRemaining > 0 || ['recovery','escape','ending','complete'].includes(state.stage)) return;
      state.heartSectors.forEach(s => state.signalPulses.push({ id: ++state.signalSerial, sectorId: s.id, distance: 0, age: 0, delivered: false, verification: false }));
    }
    function emitVerification() {
      if (state.stage !== 'recovery' || state.verifiedBeats >= 3 || state.signalPulses.some(p => p.verification)) return;
      state.signalPulses.push({ id: ++state.signalSerial, distance: 0, age: 0, delivered: false, verification: true });
      call('sound', 'heartbeatStrong'); publish(true);
    }
    function signalPosition(pulse) {
      const path = signalPath(pulse); let remaining = pulse.distance;
      for (let i=1;i<path.length;i++) { const length=distance(path[i-1],path[i]); if(remaining<=length || i===path.length-1) { const t=clamp(remaining/Math.max(1,length),0,1);return {x:path[i-1].x+(path[i].x-path[i-1].x)*t,y:path[i-1].y+(path[i].y-path[i-1].y)*t}; } remaining-=length; }
      return { ...path[0] };
    }
    function updateSignals(dt) {
      if (state.room !== 'heart' || state.revealRemaining > 0) return;
      state.signalPulses.forEach(pulse => {
        const path=signalPath(pulse), total=pathLength(path), sector=state.heartSectors.find(s=>s.id===pulse.sectorId), limit=pulse.verification || sector && sector.complete ? total : distance(path[0],path[1]);
        pulse.age+=dt; pulse.distance=Math.min(limit,pulse.distance+dt*(pulse.verification ? 270 : 800));
        if(pulse.distance>=total-1e-8 && !pulse.delivered) {
          pulse.delivered=true; state.downstreamReceived=true;
          if(pulse.verification && state.stage==='recovery') {
            state.verifiedBeats++; state.recovery=1.1+(RECOVERY_TIME-1.1)*state.verifiedBeats/3;
            feedback('复测 '+state.verifiedBeats+'/3 · 脉冲已抵达下游','good');call('effect',path[path.length-1].x,path[path.length-1].y,'#f3dfa1',18);
            if(state.verifiedBeats===3) { state.heartStable=true;clearInput();setStage('escape');feedback('三拍复测通过 · 前往出口撤离','good');call('sound','win'); }
          }
        }
      });
      state.signalPulses=state.signalPulses.filter(p=>!p.delivered && p.age<pathLength(signalPath(p))/(p.verification ? 270 : 800)+1.5);
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
        const duration = reloadDuration(), previous = duration - state.reloadRemaining, insertAt = duration * .45 / 1.7, lockAt = duration * 1.25 / 1.7;
        state.reloadRemaining = Math.max(0, state.reloadRemaining - dt); if (state.reloadRemaining < 1e-8) state.reloadRemaining = 0;
        const elapsed = duration - state.reloadRemaining;
        if (previous < insertAt - 1e-8 && elapsed >= insertAt - 1e-8) call('sound', 'reloadIn');
        state.reloadStage = state.reloadRemaining <= 0 ? 'idle' : elapsed < insertAt - 1e-8 ? 'eject' : elapsed < lockAt - 1e-8 ? 'insert' : 'lock';
        if (state.reloadRemaining === 0) { state.ammo = MAGAZINE; state.emptyLatched = false; state.reloadAutomatic = false; call('sound', 'reloadReady'); feedback('装填完成 · 24/24', 'good'); }
      }
      if (state.revealRemaining > 0) { state.revealRemaining = Math.max(0, state.revealRemaining - dt); if (state.revealRemaining <= 0 && state.room === 'heart' && !state.heartConnected) { startDefense('heart'); emitSignalPulse(); } }
      else if (state.stage === 'burst') { state.burst += dt; if (state.burst >= BURST_TIME) { state.flowRestored = true; state.checkpoint = 'flow'; state.enemies = []; restoreTissues('main'); state.waveDelay = 0; setStage('conduction'); call('effect', CLOT.x, CLOT.y, '#f3d4a1', 40); feedback('血栓和干扰者被血流带走 · Q 复查：血流恢复，心腔脉冲仍有中断', 'good'); } }
      else if (state.stage === 'recovery') { updateMovement(dt); updateScanner(dt); if (state.pendingDiagnosis) return; useTool(dt, toolTiming); if (state.ammo <= 0 && state.treatmentLease <= 1e-8) startReload(true);
      } else if (state.stage === 'ending') {
        const previous = state.ending; state.ending += dt;
        if (state.ending >= EXTERIOR_START && previous < EXTERIOR_START) feedback('巨人的胸口重新起伏 · 山谷中的生命随之苏醒');
        if (state.ending >= ENDING_TIME - 1e-8) { state.ending = ENDING_TIME; state.finished = true; clearInput(); setStage('complete'); call('success'); }
      } else { updateMovement(dt); updateScanner(dt); if (state.pendingDiagnosis) return; useTool(dt, toolTiming); updateEnemies(dt); if (state.ammo <= 0 && state.treatmentLease <= 1e-8) startReload(true); }
      updateSignals(dt);
      const wasDashing = state.dashRemaining > 0; state.dashRemaining = Math.max(0, state.dashRemaining - dt); if (wasDashing && state.dashRemaining === 0) resolveDashOverlap(); publish(false);
    }
    function update(dt) { if (!Number.isFinite(dt) || dt <= 0 || state.failed || state.finished || state.pendingDiagnosis) return; playedHeartbeatThisUpdate = false; let remaining = dt; while (remaining > 1e-8 && !state.failed && !state.finished && !state.pendingDiagnosis) { const slice = Math.min(remaining, 1 / 60); step(slice); remaining -= slice; } }
    function dash() {
      if (state.dashCooldown > 0) return;
      let x = (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0), y = (state.keys.has('KeyS') || state.keys.has('ArrowDown') ? 1 : 0) - (state.keys.has('KeyW') || state.keys.has('ArrowUp') ? 1 : 0), length = Math.hypot(x, y);
      if (!length) { x = state.aim.x - state.player.x; y = state.aim.y - state.player.y; length = Math.hypot(x, y); } if (!length) { x = 0; y = -1; length = 1; }
      state.dashDirection = { x: x / length, y: y / length }; state.dashRemaining = 0.34; state.dashCooldown = 2.4; call('effect', state.player.x, state.player.y, '#d2edc1', 12); call('sound', 'hit');
    }
    function keyDown(code, repeat = false) {
      if (state.failed || state.finished || inputLocked()) return; state.keys.add(code); if (repeat) return;
      const toolKey = /^(?:Digit|Numpad)([123])$/.exec(code);
      if (toolKey) {
        const tool = TOOLS[Number(toolKey[1]) - 1]; if (!selectTool(tool.id)) feedback(tool.label + '尚未领取 · Q 诊断并接收针对补给'); return;
      }
      if (code === 'KeyQ') { state.scanner = !state.scanner; state.scanFocusId = null; feedback(state.scanner ? '靠近并指向组织，读取诊断' : '扫描已关闭'); publish(true); }
      else if (code === 'KeyJ') reviewDiagnosis();
      else if (code === 'KeyE') interact(); else if (code === 'KeyR') startReload(false); else if (code === 'Space') dash();
    }
    function keyUp(code) { state.keys.delete(code); }
    function pointerMove(point) { if (!state.pendingDiagnosis && point && Number.isFinite(point.x) && Number.isFinite(point.y)) { state.aim = { x: point.x, y: point.y }; const dx = point.x - state.player.x, dy = point.y - state.player.y, length = Math.hypot(dx, dy); if (length > 1e-8) state.aimDirection = { x: dx / length, y: dy / length }; } }
    function pointerDown(point) {
      if (state.failed || state.finished || inputLocked() || !point) return;
      pointerMove(point);
      if (point.button === 2) { state.precision = true; return; }
      const pressed = !state.firing; state.firing = true; if (pressed) state.syncArmed = true;
      if (pressed) {
        const hint = resolveToolRay().repairHint;
        if (hint && hint.reason !== 'ready') { state.warningCooldown = 2; feedback(hint.text); }
      }
    }
    function pointerUp(point) { pointerMove(point); if (point && point.button === 2) state.precision = false; else { state.firing = false; state.emptyLatched = false; } }
    function retryFromCheckpoint() {
      if (state.finished || state.stage === 'ending') return false;
      clearInput(); state.retries++; state.failed=false;state.failureReason=null;state.integrity=100;state.ammo=MAGAZINE;
      state.reloadRemaining=0;state.reloadStage='idle';state.reloadAutomatic=false;state.shotCooldown=0;state.invulnerable=1.5;
      state.damageFlash=0;state.shot=null;state.pendingDiagnosis=null;state.scanner=false;state.scanFocusId=null;state.dashRemaining=0;state.dashCooldown=0;state.heartStable=false;state.revealRemaining=0;
      [...state.branches,...state.weakpoints,state.fault,state.entryLesion].forEach(p=>{if(!p.complete)p.progress=0;});
      state.heartSectors.forEach(s => { if (!s.complete) { s.progress=0;s.cleared=false;s.relay.progress=0;s.relay.complete=false; } });
      state.fault.complete=state.heartSectors.every(s=>s.complete);state.fault.progress=state.heartSectors.filter(s=>s.complete).length/2;
      state.enemies=[];state.projectiles=[];state.encounters=freshEncounters();restoreTissues('main');restoreTissues('heart');
      state.signalPulses=[];state.verifiedBeats=0;state.downstreamReceived=false;state.player.walkDistance=0;
      if(state.flowRestored){
        state.encounters.main.closed=true;state.room='heart';const safe=state.heartSectors.find(s=>s.id===state.checkpoint && s.complete);Object.assign(state.player,safe?{x:safe.x,y:safe.y+160}:{x:1300,y:1500});state.heartRevealed=true;state.firstStrongBeat=false;
        setStage('conduction');if(state.fault.complete)beginRecovery();else startDefense('heart',3);
      }else if(branchRestored()){
        state.room='main';Object.assign(state.player,{x:1100,y:1230});setStage(state.unlockedTools.sprayer?'clot':'supply');startDefense('main',3);
      }else{
        state.room='entry';Object.assign(state.player,{x:1000,y:1030});state.valveSide='below';setStage('diagnosis');
      }
      feedback('安全节点重启 · 3 秒准备','good');publish(true);return true;
    }
    function links() {
      if (state.room === 'main') return state.branches.filter(p => p.complete).map(p => ({ from: { x: p.x, y: 1120 }, to: { x: p.x, y: p.y }, kind: 'bypass', complete: true }));
      if (state.room === 'heart') { const points = GEOMETRY.heart.nodes.filter(p => p.kind === 'sample'); return points.slice(1).map((p, i) => ({ from: { ...points[i] }, to: { ...p }, kind: 'conduction', complete: state.fault.complete })); }
      return [];
    }
    function cameraCue() {
      if (state.revealRemaining > 0) return { kind: 'reveal', target: { x: 1300, y: 950 }, progress: 1 - state.revealRemaining / REVEAL_TIME };
      if (state.stage === 'burst') return { kind: 'burst', target: { ...CLOT }, progress: Math.min(1, state.burst / BURST_TIME) };
      if (state.stage === 'ending') return { kind: 'ending', target: { x: 900, y: 640 }, progress: Math.min(1, state.ending / ENDING_TIME) };
      return { kind: 'follow', target: { x: state.player.x, y: state.player.y }, progress: 0 };
    }
    function scanTargets() {
      return diagnosisTargets().map(t => ({ ...t, progress: state.scanProgress[t.id+'@'+t.revision] || 0, complete: state.scanner && state.scanFocusId===t.id ? false : !!state.scanned[t.id], inRange: distance(t,state.player)<=t.scanRadius }));
    }
    function performance() {
      const medals = [
        { id:'guardian',label:'组织守护',earned:state.runMetrics.minStability>=60 },
        { id:'precision',label:'精准医师',earned:state.runMetrics.weakpointEnemies.length>=3 },
        { id:'steady',label:'稳健巡诊',earned:state.retries===0 }
      ];
      const count=medals.filter(m=>m.earned).length;
      return {grade:count===3?'S':count===2?'A':'B',medals};
    }
    function snapshot() {
      const nearest = nearbyInteraction(), currentBeat = beat(), hunters = state.enemies.map(e => ({ ...e, weakpoint: enemyWeakpoint(e), weakpointExposed: e.state === 'recover', purifyProgress: e.room === 'main' && state.stage === 'burst' ? clamp(state.burst / BURST_TIME, 0, 1) : e.room === 'heart' && state.stage === 'recovery' ? clamp(state.recovery / 1.1, 0, 1) : 0 }));
      const encounter = state.encounters[state.room], encounters = Object.fromEntries(Object.entries(state.encounters).map(([room, e]) => [room, { room, alive: currentEnemies(room).length, pending: e.queue.length, spawned: e.spawned, cap: e.cap, active: e.active, closed: e.closed, grace: e.grace, triggered: { ...e.triggered } }]));
      const scans=scanTargets(), focus=scans.find(t=>t.id===state.scanFocusId), info=state.scanner ? [focus ? focus.label+' · '+(focus.inRange ? '扫描 '+Math.round(focus.progress*100)+'%' : '靠近继续扫描') : '靠近组织，指向后扫描'] : [];
      const walls = GEOMETRY[state.room].obstacles.filter(o => (o.kind !== 'clot' || !state.flowRestored) && (o.kind !== 'dashBarrier' || !state.heartStable)).map(o => ({ ...o, blocking: true, dashPassable: false }));
      if (state.room === 'entry') walls.push({ ...VALVE, blocking: !currentBeat.safe });
      const weakpoints = state.weakpoints.map(p => ({ ...p, exposed: p.kind !== 'core' || fibersComplete() })), signalNodes = GEOMETRY.heart.nodes.filter(n => n.kind === 'sample');
      return {
        type: 'heartJourney', version: 4, area: { ...AREA }, bounds: { ...bounds() }, worldSize: { ...GEOMETRY[state.room].size }, room: state.room, roomLabel: ROOMS[state.room],
        scanFocusId: state.scanFocusId, pendingDiagnosis: state.pendingDiagnosis && copy(state.pendingDiagnosis), diagnosisReport: state.diagnosisReport && copy(state.diagnosisReport), heartSectors: copy(state.heartSectors), syncCore: { ...SYNC_CORE }, sources: sourceList(), runMetrics: { ...copy(state.runMetrics), retries: state.retries }, performance: performance(),
        player: { ...state.player, dashing: state.dashRemaining > 0, invulnerable: state.invulnerable > 0 }, aim: { ...state.aim }, scanner: state.scanner, scanOn: state.scanner, precision: state.precision, toolPreview: resolveToolRay(), guidance: guidance(),
        tool: state.tool, tools: TOOLS.map(t => ({ ...t, unlocked: !!state.unlockedTools[t.id], isNew: !!state.newTools[t.id] })), reloadDuration: reloadDuration(), reloadAutomatic: state.reloadAutomatic,
        branches: state.branches.map(p => ({ ...p })), supplies: copy(state.supplies), entryLesion: { ...state.entryLesion }, fault: { ...state.fault }, scanTargets: scans,
        tissues: currentTissues().map(t => ({ ...t, localFlow: t.integrity / 50, repairing: state.firing && state.treatmentTargetIds.includes(t.id) })), organStability: organStability(), defense: defenseSnapshot(), heartStable: state.heartStable, failureReason: state.failureReason, projectiles: copy(state.projectiles),
        conductionSignal: { points: signalNodes.map(n => ({ x: n.x, y: n.y })), samples: signalNodes.map(n => ({ id: n.id, x: n.x, y: n.y, ...sampleState(n.id) })), faultPosition: { x: FAULT.x, y: FAULT.y }, repaired: state.fault.complete, pulses: state.signalPulses.map(p => ({ id: p.id, sectorId: p.sectorId, verification: p.verification, ...signalPosition(p) })), verifiedBeats: state.verifiedBeats, requiredBeats: 3 },
        beat: currentBeat, stage: state.stage, phase: state.stage, stageLabel: STAGES[state.stage], task: task(), integrity: state.integrity, health: state.integrity, ammo: state.ammo, reloadRemaining: state.reloadRemaining, reloadProgress: reloadProgress(), reloadStage: state.reloadStage,
        nodes: nodeList(), portals: portalList(), obstacles: walls, valves: state.room === 'entry' ? [{ ...VALVE, open: currentBeat.safe, blocking: !currentBeat.safe, enteredFrom: state.valveSide }] : [],
        paths: GEOMETRY[state.room].paths.map(p => ({ ...copy(p), active: p.branch ? p.branch === 'A' ? state.bypassA : state.bypassB : true, flow: p.kind === 'abnormal' && state.entryLesion.complete ? .65 : p.flow === undefined ? (state.flowRestored ? 1 : p.kind === 'bypass' ? (p.branch === 'A' ? state.bypassA : state.bypassB) ? 0.7 : 0.05 : 0.14) * Math.max(.1,organStability()/100) : p.flow })),
        enemies: hunters.filter(e => e.room === state.room), hunters,
        encounter: encounters[state.room] || { room: state.room, alive: 0, pending: 0, spawned: 0, cap: 0, active: false, closed: true, triggered: {} }, encounters,
        spawnTelegraphs: encounter && encounter.warning ? [{ ...encounter.warning, progress: clamp(1 - encounter.warning.remaining / SPAWN_WARNING, 0, 1) }] : [],
        clot: { ...CLOT, scanned: !!state.scanned.clot, scanProgress: state.scanProgress.clot || 0, removed: state.flowRestored, burst: state.burst, weakpoints }, weakpoints,
        links: links(),
        checkpoint: state.checkpoint, checkpointLabel: CHECKPOINTS[state.checkpoint], retries: state.retries, elapsed: state.elapsed,
        dashUnlocked: true, dashCooldown: state.dashCooldown, dashRemaining: state.dashRemaining,
        burst: state.burst, burstDuration: BURST_TIME, recovery: state.recovery, recoveryDuration: RECOVERY_TIME, ending: state.ending, endingDuration: ENDING_TIME,
        revealRemaining: state.revealRemaining, reveal: state.heartRevealed ? REVEAL_TIME - state.revealRemaining : 0, revealDuration: REVEAL_TIME, inputLocked: inputLocked(), cameraCue: cameraCue(), firstStrongBeat: state.firstStrongBeat,
        endingScene: ['ending','complete'].includes(state.stage) ? 'exterior' : null,
        exteriorRecovery: { elapsed: clamp(state.ending - EXTERIOR_START, 0, EXTERIOR_DURATION), duration: EXTERIOR_DURATION, progress: clamp((state.ending - EXTERIOR_START) / EXTERIOR_DURATION, 0, 1) },
        flowRestored: state.flowRestored, bypassA: state.bypassA, bypassB: state.bypassB, flow: state.flowRestored ? 'open' : branchRestored() ? 'partial' : 'low', pressure: branchRestored() ? 'safe' : 'high', heartbeat: currentBeat.state,
        combatWave: state.combatWave, combatComplete: state.combatComplete, heartConnected: state.heartConnected, scanned: { ...state.scanned }, connection: [], conduction: [], keys: [...state.keys], scannerInfo: info, nearestId: nearest ? nearest.id : null,
        interactionHint: nearest ? 'E · ' + nearest.label + (nearest.locked ? '（' + nearest.requires + '）' : '') : state.room === 'entry' ? 'Q 诊断东侧缺血 · 1 清除轻度凝块 · Space 冲刺' : 'Tab 按住选枪 · Space 冲刺 · 1 修组织 / 2 清纤维 / 3 接通传导',
        notice: state.noticeTime > 0 ? state.notice : '', noticeTime: state.noticeTime, shot: state.shot ? copy(state.shot) : null, damageFlash: state.damageFlash, failed: state.failed, finished: state.finished, progress: progress(), toolRange: toolDefinition().range, scanRange: SCAN_RANGE, interactRange: INTERACT_RANGE
      };
    }
    function draw(ctx, time, view) { const renderer = window.GiantCureJourneyArt; if (renderer && typeof renderer.draw === 'function') renderer.draw(ctx, snapshot(), time, view); }
    setStage('diagnosis'); feedback('靠近缺血支路，按 Q 诊断');
    return { update, draw, acknowledgeDiagnosis, reviewDiagnosis, pointerDown, pointerMove, pointerUp, pointerCancel: clearInput, clearInput, keyDown, keyUp, selectTool, retryFromCheckpoint, getDebugState: () => freeze(copy(snapshot())) };
  };
})();
