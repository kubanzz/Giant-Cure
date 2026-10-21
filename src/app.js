// Casebook shell: catalog, chapter input, active time, checkpoints and presentation.
(() => {
  'use strict';
  let W = 720, H = 1280;
  const viewport = Object.freeze({ x: 24, y: 84, w: 1232, h: 552 });
  const view = { viewport, camera: { x: 800, y: 500, zoom: 1.1 } };
  const $ = id => document.getElementById(id);
  const canvas = $('world'), ctx = canvas.getContext('2d');
  const screens = ['home', 'cases', 'treatment', 'result'];
  // Only implemented chapters belong in the catalog. New chapters can use this contract.
  const cases = {
    heartJourney: {
      title: '心脏巡诊', number: '01', world: '生命之城', en: 'HEART JOURNEY',
      subtitle: '在巨人的心河里，找回生命的回响。',
      instruction: 'WASD 移动 · Q 扫描状态 · E 与近处目标交互',
      mechanic: '键盘与鼠标 · 约 3–5 分钟', recordKey: 'giant-cure-journey-v1',
      successTitle: '一颗心，重新有了光。',
      successText: '你修复了河流与传导。巨人的下一声呼吸，正在远方等待。',
      poem: '心脏已稳定 · 下一个求救信号来自肺部'
    }
  };
  const caseIds = Object.keys(cases);
  function readRecord(key) {
    try {
      const record = JSON.parse(localStorage.getItem(key) || '{}') || {};
      const wins = Number(record.wins), best = Number(record.bestSeconds);
      return {
        wins: Number.isFinite(wins) && wins > 0 ? Math.floor(wins) : 0,
        bestSeconds: Number.isFinite(best) && best > 0 ? Math.ceil(best) : null
      };
    } catch { return { wins: 0, bestSeconds: null }; }
  }
  const records = Object.fromEntries(caseIds.map(id => [id, readRecord(cases[id].recordKey)]));
  const state = {
    screen: 'home', phase: 'idle', id: null, game: null, progress: 0,
    elapsed: 0, activeTime: 0, result: null, finishWait: 0, feedbackTime: 0, modal: false, hud: {}, cameraRoom: null
  };
  let particles = [], previousFocus = null, soundEnabled = false;
  let audioContext = null, toastTimer = null, lastFrame = null, loadToken = 0;
  let pointerScreen = null, pointerClient = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    const vw = document.documentElement.clientWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const style = getComputedStyle(document.body);
    const safePadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const scale = Math.min(vw / W, (vh - (vw > 600 ? 30 : 0) - safePadding) / H);
    $('viewport').style.width = `${W * scale}px`;
    $('viewport').style.height = `${H * scale}px`;
    $('app').style.transform = `scale(${scale})`;
    $('app').style.width = canvas.style.width = `${W}px`;
    $('app').style.height = canvas.style.height = `${H}px`;
    const dpr = Math.min(2, Math.max(1, devicePixelRatio * scale));
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    if (pointerClient) pointerScreen = toPoint(pointerClient);
  }
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  function clearInput() { if (state.game) state.game.clearInput(); }
  function showScreen(name) {
    clearInput(); state.screen = name;
    for (const id of screens) $(id).hidden = id !== name;
    $('folio-page').textContent = { home: '001', cases: '002', treatment: '003', result: '004' }[name];
    $('app').classList.toggle('journey-mode', name === 'treatment');
    document.body.classList.toggle('landscape-treatment', name === 'treatment');
    W = name === 'treatment' ? 1280 : 720; H = name === 'treatment' ? 720 : 1280;
    resize();
    if (name === 'cases') updateRecords();
  }
  function updateRecords() {
    const completed = caseIds.filter(id => records[id].wins > 0).length;
    $('record-summary').textContent = `已治愈 ${completed} / ${caseIds.length} 个病例`;
    $('case-count').textContent = `/ ${String(caseIds.length).padStart(2, '0')}`;
    for (const card of document.querySelectorAll('[data-case]')) {
      const id = card.dataset.case, record = records[id], info = cases[id];
      card.querySelector('.case-complete').hidden = !record.wins;
      card.querySelector('.case-mechanic').textContent = record.wins && record.bestSeconds
        ? `键盘与鼠标 · 最佳 ${record.bestSeconds} 秒` : info.mechanic;
    }
  }
  function goHome() { loadToken++; closeModal(); clearInput(); state.phase = 'idle'; state.game = null; particles = []; showScreen('home'); }
  function goCases() { loadToken++; closeModal(); clearInput(); state.phase = 'idle'; state.game = null; particles = []; showScreen('cases'); }
  function requestHome() {
    if (state.screen === 'treatment' && ['playing', 'paused'].includes(state.phase)) {
      pauseGame();
      openDialog('离开这次巡诊？', '<p>离开后将结束本次巡诊，阶段检查点不会保留。已完成的病例记录会留在病历簿里。</p>', [
        { label: '继续巡诊', primary: true, action: resumeGame },
        { label: '回到封面', action: goHome }
      ], 'LEAVE THIS TREATMENT');
    } else if (state.phase !== 'finishing') goHome();
  }

  async function startGame(id) {
    const info = cases[id], factory = window.GiantCureGames[id];
    if (!info || !factory) return;
    closeModal(); clearInput();
    const token = ++loadToken;
    Object.assign(state, { id, game: null, progress: 0, elapsed: 0, activeTime: 0, result: null, finishWait: 0, feedbackTime: 0, phase: 'loading', hud: {}, cameraRoom: null });
    pointerScreen = null; pointerClient = null;
    particles = [];
    $('case-number').textContent = `CASE ${info.number} / ${info.en}`;
    $('treatment-title').textContent = info.title;
    $('treatment-subtitle').textContent = info.subtitle;
    $('time-caption').textContent = '巡诊用时';
    $('progress-label').textContent = '治疗进程';
    feedback('正在展开巨人的心河…');
    $('journey-task').textContent = '正在准备巡诊';
    showScreen('treatment'); updateStats();
    try { if (window.GiantCureAssets) await window.GiantCureAssets.ready; }
    catch {
      if (token !== loadToken) return;
      state.phase = 'load-error';
      openDialog('心河还没有展开', '<p>场景插画未能载入，请重试或回到病历簿。</p>', [
        { label: '重新载入', primary: true, action: () => { if (window.GiantCureAssets?.retry) window.GiantCureAssets.retry(); startGame(id); } },
        { label: '返回病历簿', action: goCases }
      ]);
      return;
    }
    if (token !== loadToken) return;
    state.phase = 'playing'; feedback(info.instruction);
    state.game = factory({
      progress: value => { state.progress = Math.max(0, Math.min(1, value)); updateStats(); },
      feedback, success: () => finishGame(true), fail: reason => finishGame(false, reason),
      effect: spawnParticles, sound: playSound, hud: updateHUD,
      setTask: text => { state.hud.task = text; $('journey-task').textContent = text; }
    });
    updateCamera(0, true); updateStats(); lastFrame = null;
  }
  function updateHUD(data) {
    Object.assign(state.hud, data);
    const h = state.hud;
    const write = (id, text) => { if ($(id).textContent !== String(text)) $(id).textContent = text; };
    write('journey-integrity', Math.max(0, Math.round(h.integrity ?? 100)));
    $('integrity-fill').style.width = `${Math.max(0, Math.min(100, h.integrity ?? 100))}%`;
    write('journey-ammo', `${h.ammo ?? 24} / 24`);
    write('journey-reload', h.reloadRemaining > 0 ? `装填中 ${h.reloadRemaining.toFixed(1)}s` : '无限备弹');
    $('journey-scan').setAttribute('aria-pressed', String(!!h.scanner));
    write('journey-checkpoint', `安全节点 · ${h.checkpoint || '血管入口'}　/　重启 ${h.retries || 0} 次`);
    write('journey-dash-label', h.dashUnlocked ? '循环冲刺 · 已解锁' : '循环冲刺 · 等待心脏恢复');
    if (h.task) write('journey-task', h.task);
    if (h.roomLabel) write('journey-room', h.roomLabel);
    if (h.scannerInfo) { const info = Array.isArray(h.scannerInfo) ? h.scannerInfo.join(' · ') : h.scannerInfo; write('journey-scanner-info', info); $('journey-scanner-info').title = info; }
    if (h.beat) {
      write('journey-beat', h.beat.safe ? '舒张 · 安全窗口' : '收缩 · 观察节律');
      $('journey-beat').dataset.safe = String(!!h.beat.safe);
    }
  }
  function retryCheckpoint() {
    if (!state.game) return startGame(state.id);
    closeModal(); clearInput();
    Object.assign(state, { phase: 'playing', result: null, finishWait: 0 });
    particles = []; state.cameraRoom = null; state.game.retryFromCheckpoint(); updateCamera(0, true);
    showScreen('treatment'); updateStats(); lastFrame = null;
  }
  function updateStats() {
    const percent = Math.round(state.progress * 100);
    $('progress-value').innerHTML = `${percent}<span>%</span>`;
    $('progress-fill').style.width = `${percent}%`;
    const seconds = Math.max(0, Math.floor(state.elapsed));
    $('time-value').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function feedback(text, kind = 'info') {
    $('game-feedback').textContent = text; $('game-feedback').dataset.kind = kind;
    state.feedbackTime = 3.4;
  }
  function finishGame(won, reason = '') {
    if (state.phase !== 'playing') return;
    const chapter = state.game.getDebugState();
    clearInput(); state.phase = 'finishing'; state.finishWait = won ? 1.8 : .8;
    if (won) state.progress = 1;
    state.result = { won, reason, seconds: Math.ceil(state.elapsed), progress: state.progress, integrity: chapter.integrity, retries: chapter.retries };
    if (won) {
      const previous = records[state.id];
      records[state.id] = { wins: previous.wins + 1, bestSeconds: Math.min(previous.bestSeconds || Infinity, state.result.seconds) };
      try { localStorage.setItem(cases[state.id].recordKey, JSON.stringify(records[state.id])); } catch { /* Saving is optional. */ }
      feedback('治疗完成 · 你听见世界苏醒的声音了吗？', 'good');
      for (let i = 0; i < 5; i++) spawnParticles(360 + i * 140, 350 + Math.sin(i) * 95, ['#a3c797', '#d2b96d', '#f0d2aa'][i % 3], 18, 'screen');
      playSound('win');
    } else { feedback('安全节点在等你。休息一下，再来一次。', 'bad'); playSound('lose'); }
    updateStats();
  }
  function showResult() {
    const r = state.result, info = cases[state.id]; state.phase = 'result';
    $('result-kicker').textContent = r.won ? 'A WORLD REBORN' : 'A LITTLE MORE CARE';
    $('result-case').textContent = `CASE ${info.number} / ${info.world}`;
    $('result-emblem').innerHTML = r.won ? heartIcon() : leafIcon();
    $('result-stars').classList.add('journey-status');
    $('result-stars').textContent = r.won ? 'HEART STATUS / STABLE' : 'MEDICAL UNIT / OFFLINE';
    $('result-title').textContent = r.won ? info.successTitle : '再给世界一点时间。';
    $('result-description').textContent = r.won ? info.successText : r.reason;
    $('result-stamp').textContent = r.won ? 'HEART STABLE ✓' : 'SAFE NODE AVAILABLE';
    $('result-score').textContent = Math.max(0, Math.round(r.integrity));
    $('result-time').innerHTML = `${r.seconds}<span> 秒</span>`;
    $('result-restored').textContent = r.retries;
    $('metric-score-label').textContent = '医疗设备耐久';
    $('metric-restored-label').textContent = '重启次数';
    $('result-message').textContent = r.won ? info.poem : '每次尝试，都是对生命的一次靠近。';
    $('retry').textContent = r.won ? '↻ 重新巡诊' : '↻ 从安全节点重启';
    $('result-next').firstElementChild.textContent = r.won ? '完成巡诊 · 回到病历簿' : '从最近安全节点重启';
    $('result-next').onclick = r.won ? goCases : retryCheckpoint;
    showScreen('result');
  }
  function pauseGame() { if (state.phase === 'playing') { clearInput(); state.phase = 'paused'; } }
  function showPause() {
    if (!['playing', 'paused'].includes(state.phase)) return;
    pauseGame();
    openDialog('让世界歇一会儿', '<p>风停在树梢，河流等你回来。<br>巡诊已暂停，时间不会流逝。<br>返回病历簿会结束本次巡诊。</p>', [
      { label: '继续巡诊 ↗', primary: true, action: resumeGame },
      { label: '从头重新巡诊', action: () => startGame(state.id) },
      { label: '返回病历簿', action: goCases }
    ]);
  }
  function resumeGame() { closeModal(); if (state.phase === 'paused') { state.phase = 'playing'; lastFrame = null; } }
  function showHelp() {
    if (state.phase === 'finishing') return;
    const wasPlaying = ['playing', 'paused'].includes(state.phase);
    if (wasPlaying) pauseGame();
    const chapter = state.game?.getDebugState();
    const hints = {
      diagnosis: '正常血流应当平稳。对比两条支路的流量与压力，沿着淤积的血河寻找上游异常；瓣膜在舒张时开放。',
      bypass: '血栓前方压力过高。先恢复两条侧支，让血流有去处，再处理血栓。第二条侧支需要留意心跳的舒张窗口。',
      combat: '观察 Hunter 扑击前的预警，躲开后瞄准发光弱点。先解除第一只 Hunter 的干扰，再开始治疗。',
      clot: '血栓有三处结构。扫描发现后持续照射，松开照射可躲避敌人，软化进度会保留。全部软化后主血流便能带走它。',
      burst: '两条侧支降低了上游压力，软化后的血栓正在被主血流带走。观察下游重新恢复流动。',
      conduction: '血流已恢复，但心跳信号仍然中断。扫描传导节点，接近后依次连接 A、B、C，重新建立搏动顺序。',
      recovery: '传导顺序已经接通。第一声强心跳将唤醒城市，并为医疗单位提供循环冲刺能力。',
      escape: '沿着恢复的血流前进，按 Space 越过循环屏障。出口处还有一小片不随心跳变化的组织，先扫描再尝试治疗。',
      growth: '扫描出口处异常组织，持续照射直至暂时压制，再观察它的变化。',
      ending: '这片异常组织在被压制后重新生长。心脏已恢复，但巨人的其他部位仍需要你。'
    };
    const hint = chapter ? chapter.stage === 'escape' && chapter.crossedBarrier ? hints.growth : hints[chapter.stage] || (chapter.room === 'entry' ? hints.diagnosis : chapter.room === 'heart' ? hints.conduction : hints.bypass) : '在病历簿中点击「心脏巡诊」卡片，即可进入巨人的心脏世界。';
    openDialog('带着好奇，进入心河', `<p class="dialog-tip">${hint}</p><div class="help-item"><strong>移动与观察</strong><p>WASD 移动，Shift 疾行，鼠标瞄准。Q 开关扫描：读取附近的流量、压力、组织和节点状态。扫描不耗能，世界仍在运转。</p></div><div class="help-item"><strong>治疗与连接</strong><p>接近节点后按 E 交互，依次选择节点建立连接。左键持续治疗或射击，右键精瞄。R 装填，备弹无限。</p></div><div class="help-item"><strong>安全与恢复</strong><p>避开扑击预警。设备耐久归零后，从最近安全节点重启。心脏恢复后，Space 使用循环冲刺。不限时，退出或刷新会清除本次检查点。</p></div><p>本章使用键盘与鼠标。声音默认关闭，可点击右上角音符开启。</p>`, [
      { label: wasPlaying ? '继续巡诊 ↗' : '明白了 ↗', primary: true, action: wasPlaying ? resumeGame : closeModal }
    ], 'HEART JOURNEY / FIELD GUIDE');
  }
  function openDialog(title, body, buttons, kicker = 'A MOMENT OF CARE') {
    if ($('modal').hidden) previousFocus = document.activeElement;
    state.modal = true; $('dialog-title').textContent = title; $('dialog-kicker').textContent = kicker;
    $('dialog-body').innerHTML = body; $('dialog-actions').replaceChildren();
    buttons.forEach((item, index) => {
      const button = document.createElement('button');
      button.className = item.primary ? 'primary-button' : index === buttons.length - 1 && buttons.length > 2 ? 'text-button' : 'secondary-button';
      button.textContent = item.label; button.onclick = item.action; $('dialog-actions').append(button);
    });
    $('modal').hidden = false;
    for (const id of screens) $(id).inert = true;
    document.querySelector('.app-header').inert = true;
    $('dialog-actions').firstElementChild.focus({ preventScroll: true });
  }
  function closeModal() {
    $('modal').hidden = true; state.modal = false;
    for (const id of screens) $(id).inert = false;
    document.querySelector('.app-header').inert = false;
    if (previousFocus && previousFocus.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  const toPoint = event => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height }; };
  const inWorld = p => p.x >= viewport.x && p.x <= viewport.x + viewport.w && p.y >= viewport.y && p.y <= viewport.y + viewport.h;
  const toWorld = p => ({ x: view.camera.x + (p.x - viewport.x - viewport.w / 2) / view.camera.zoom, y: view.camera.y + (p.y - viewport.y - viewport.h / 2) / view.camera.zoom });
  const acceptsInput = () => state.screen === 'treatment' && state.phase === 'playing' && !state.modal;
  const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE', 'KeyR', 'Space']);
  canvas.addEventListener('pointermove', event => { pointerClient = { clientX: event.clientX, clientY: event.clientY }; pointerScreen = toPoint(pointerClient); if (acceptsInput()) state.game.pointerMove(toWorld(pointerScreen)); });
  canvas.addEventListener('pointerdown', event => {
    if (acceptsInput() && [0, 2].includes(event.button) && inWorld(toPoint(event))) canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointercancel', clearInput);
  canvas.addEventListener('mousedown', event => {
    if (!acceptsInput() || ![0, 2].includes(event.button)) return;
    const p = toPoint(event);
    if (!inWorld(p)) return;
    pointerClient = { clientX: event.clientX, clientY: event.clientY }; pointerScreen = p; event.preventDefault(); state.game.pointerDown({ ...toWorld(p), button: event.button });
  });
  document.addEventListener('mouseup', event => { if (state.game) state.game.pointerUp({ ...toWorld(toPoint(event)), button: event.button }); });
  document.addEventListener('pointerup', event => { if (state.game) state.game.pointerUp({ ...toWorld(toPoint(event)), button: event.button }); });
  canvas.addEventListener('contextmenu', event => { if (state.screen === 'treatment') event.preventDefault(); });
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape') {
      event.preventDefault();
      if (state.phase === 'playing') showPause(); else if (state.phase === 'paused') resumeGame(); else if (state.modal) closeModal();
    }
    if (acceptsInput() && gameKeys.has(event.code)) { event.preventDefault(); state.game.keyDown(event.code, event.repeat); }
    if (event.key === 'Tab' && state.modal) {
      const buttons = [...$('dialog-actions').querySelectorAll('button')], first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('keyup', event => { if (state.game) state.game.keyUp(event.code); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.phase === 'playing') showPause(); });
  window.addEventListener('blur', () => { if (state.phase === 'playing') showPause(); else clearInput(); });
  $('brand').onclick = requestHome;
  $('begin').onclick = goCases; $('case-back').onclick = goHome;
  $('help').onclick = showHelp; $('pause').onclick = showPause;
  $('retry').onclick = () => state.result && !state.result.won ? retryCheckpoint() : startGame(state.id);
  $('result-cases').onclick = goCases;
  document.querySelectorAll('[data-case]').forEach(card => { card.onclick = () => startGame(card.dataset.case); });
  for (const [id, key] of [['journey-scan', 'KeyQ'], ['journey-interact', 'KeyE'], ['journey-reload-button', 'KeyR']]) $(id).onclick = () => {
    if (acceptsInput()) { state.game.keyDown(key, false); state.game.keyUp(key); }
  };

  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2200);
  }
  $('sound').onclick = () => {
    soundEnabled = !soundEnabled;
    $('sound').setAttribute('aria-pressed', String(soundEnabled));
    $('sound').setAttribute('aria-label', soundEnabled ? '关闭声音' : '开启声音');
    $('sound').title = soundEnabled ? '关闭声音' : '开启声音';
    if (soundEnabled) { playSound('hit'); toast('声音已开启 · 让生命有回响'); } else toast('声音已关闭');
  };
  function playSound(kind) {
    if (!soundEnabled) return;
    try {
      if (!audioContext) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return; audioContext = new Audio(); }
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const heartbeat = kind === 'heartbeat' || kind === 'heartbeatStrong';
      const notes = heartbeat ? [110, 73.42] : kind === 'flow' ? [146.83, 220, 293.66, 440] : kind === 'win' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'hit' ? [659.25, 880] : kind === 'miss' || kind === 'lose' ? [261.63, 220] : [440];
      notes.forEach((hz, i) => {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        const time = audioContext.currentTime + i * (heartbeat ? .14 : .1), duration = heartbeat ? .24 : .65;
        oscillator.type = 'sine'; oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(kind === 'heartbeatStrong' ? .07 : heartbeat ? .035 : .045, time + .015); gain.gain.exponentialRampToValueAtTime(.001, time + duration);
        oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(time); oscillator.stop(time + duration + .05);
      });
    } catch { soundEnabled = false; $('sound').setAttribute('aria-pressed', 'false'); toast('此浏览器暂不支持声音，可继续游玩'); }
  }
  function spawnParticles(x, y, color = '#b8c98f', count = 12, space = 'world') {
    const limit = reducedMotion ? Math.min(3, count) : Math.min(count, 30);
    for (let i = 0; i < limit && particles.length < 170; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 28 + Math.random() * 95;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 35, age: 0, life: .8 + Math.random() * .9, size: 2 + Math.random() * 4, color, leaf: i % 3 === 0, space });
    }
  }
  function drawParticles(dt) {
    particles = particles.filter(p => p.age < p.life);
    for (const space of ['world', 'screen']) {
      ctx.save();
      if (space === 'world') {
        ctx.beginPath(); ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h); ctx.clip();
        ctx.translate(viewport.x + viewport.w / 2, viewport.y + viewport.h / 2);
        ctx.scale(view.camera.zoom, view.camera.zoom); ctx.translate(-view.camera.x, -view.camera.y);
      }
      for (const p of particles) {
        if (p.space !== space) continue;
        p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 19 * dt;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - p.age / p.life); ctx.fillStyle = p.color; ctx.translate(p.x, p.y); ctx.rotate(p.age * 2);
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.leaf ? p.size * .4 : p.size, .4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }
  }
  function updateCamera(dt, snap = false) {
    if (!state.game) return;
    const g = state.game.getDebugState(), roomChanged = state.cameraRoom !== g.room;
    const size = g.worldSize || { width: g.room === 'heart' ? 1800 : 1600, height: g.room === 'heart' ? 1200 : 1000 };
    const cue = g.cameraCue || { kind: 'follow' };
    const progress = Math.max(0, Math.min(1, cue.progress || 0));
    let target = g.player, zoom = 1.1;
    if (cue.kind === 'reveal') {
      const blend = progress * progress * (3 - 2 * progress);
      target = { x: (cue.target?.x ?? g.player.x) * (1 - blend) + g.player.x * blend, y: (cue.target?.y ?? g.player.y) * (1 - blend) + g.player.y * blend };
      zoom = .74 + .36 * blend;
    } else if (cue.kind !== 'follow') {
      target = cue.target || g.player;
      zoom = cue.kind === 'burst' ? .8 : cue.kind === 'recovery' ? .65 : .72;
    }
    if (reducedMotion && cue.kind === 'reveal') { target = g.player; zoom = 1.1; }
    const clampCenter = (v, total, half) => total <= half * 2 ? total / 2 : Math.max(half, Math.min(total - half, v));
    const k = snap || roomChanged || reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
    view.camera.zoom += (zoom - view.camera.zoom) * k;
    const halfW = viewport.w / view.camera.zoom / 2, halfH = viewport.h / view.camera.zoom / 2;
    const tx = clampCenter(target.x, size.width ?? size.w, halfW), ty = clampCenter(target.y, size.height ?? size.h, halfH);
    view.camera.x += (tx - view.camera.x) * k; view.camera.y += (ty - view.camera.y) * k;
    view.camera.x = clampCenter(view.camera.x, size.width ?? size.w, halfW);
    view.camera.y = clampCenter(view.camera.y, size.height ?? size.h, halfH);
    state.cameraRoom = g.room;
    if (g.task && $('journey-task').textContent !== g.task) $('journey-task').textContent = g.task;
    $('journey-room').textContent = g.roomLabel || ({ entry: '血管入口', main: '主血管', heart: '生命之城' }[g.room] || '心脏巡诊');
    if (g.scannerInfo != null) {
      const info = Array.isArray(g.scannerInfo) ? g.scannerInfo.join(' · ') : g.scannerInfo;
      $('journey-scanner-info').textContent = info || '按 Q 扫描，观察流量与压力'; $('journey-scanner-info').title = info;
    }
    if (g.beat) {
      $('journey-beat').textContent = g.beat.safe ? '舒张 · 安全窗口' : '收缩 · 观察节律';
      $('journey-beat').dataset.safe = String(!!g.beat.safe);
    }
    if (acceptsInput() && pointerScreen) state.game.pointerMove(toWorld(pointerScreen));
  }
  function drawBotanical(x, y, time, scale = 1, flip = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale * flip, scale); ctx.rotate(Math.sin(time * .4) * .015);
    ctx.strokeStyle = '#b4c4a4'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-20, -30, 12, -85, -12, -130); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1, yy = -15 - i * 19, xx = -4 + Math.sin(i) * 5;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 39 * side, yy - 4, xx + 28 * side, yy - 25); ctx.quadraticCurveTo(xx + 6 * side, yy - 25, xx, yy);
      ctx.fillStyle = i % 2 ? '#d4dec4' : '#e0e6cf'; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPage(time) {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#c5cdb6';
    for (let i = 0; i < 44; i++) { ctx.globalAlpha = .12 + (i % 4) * .025; ctx.beginPath(); ctx.arc((i * 193 + 37) % W, (i * 293 + 117) % H, .7 + i % 2 * .3, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (state.screen === 'home' && window.GiantCureCover) window.GiantCureCover.draw(ctx, reducedMotion ? 0 : time, caseIds.filter(id => records[id].wins).length / caseIds.length);
    if (state.screen === 'cases') drawBotanical(638, 1175, time, .7);
    if (state.screen === 'result') { drawBotanical(79, 651, time, .55); drawBotanical(656, 725, time, .6, -1); }
    if (state.screen === 'treatment' && state.game) { ctx.save(); state.game.draw(ctx, state.activeTime, view); ctx.restore(); }
  }
  function frame(now) {
    const raw = lastFrame === null ? 0 : Math.max(0, (now - lastFrame) / 1000); lastFrame = now;
    const dt = Math.min(raw, .1);
    if (state.phase === 'playing' && raw > 2) showPause();
    if (state.phase === 'playing' && !state.modal) {
      let pending = raw;
      while (pending > 0 && state.phase === 'playing') {
        const step = Math.min(.05, pending); state.elapsed += step; state.activeTime += step; state.game.update(step); pending -= step;
      }
      updateStats(); state.feedbackTime -= dt;
      if (state.feedbackTime <= 0) { $('game-feedback').textContent = ''; $('game-feedback').dataset.kind = 'info'; }
    } else if (state.phase === 'finishing' && !state.modal) {
      state.activeTime += dt; state.game.update(Math.min(raw, 2)); state.finishWait -= raw;
      if (state.finishWait <= 0) showResult();
    }
    const active = ['playing', 'finishing'].includes(state.phase) && !state.modal;
    if (active) updateCamera(dt);
    drawPage(now / 1000); if (state.screen === 'treatment') drawParticles(active ? dt : 0); requestAnimationFrame(frame);
  }

  function heartIcon() {
    return '<svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="60" cy="66" rx="55" ry="55" fill="#e8edde"/><path d="M14 92Q50 109 105 91" stroke="#c7d4b9"/><circle cx="96" cy="28" r="3" fill="#c2a96e"/><path d="M60 108C8 74 19 33 43 39c11 1 17 12 17 12s7-16 22-12c35 9 12 48-22 69Z" fill="#c7aa8b" opacity=".6"/><path d="M30 91c20-19 40-18 60-2l-5 17H36Z" fill="#a3b68e"/><path d="M39 78V51h15v27m5 1V40h16v39m5 5V58h13v26" fill="#dce2c8" stroke="#8da580" stroke-width="1.5"/><path d="m37 51 10-12 9 12m1-11 10-17 10 17m0 18 10-14 8 14" fill="#81a48b"/><path d="M46 60v5m20-15v6m20 9v5" stroke="#bd9f59" stroke-width="3"/><path d="M18 91h19l6-9 9 19 9-25 8 15h35" stroke="#6e997e" stroke-width="2"/><path d="M67 16v-8m-4 4h8" stroke="#c0a35e"/></svg>';
  }
  function leafIcon() { return '<svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30 103C12 51 45 23 98 23c3 58-15 88-68 80Z" fill="#cedbc1" stroke="#90aa83" stroke-width="1.5"/><path d="m31 103 48-60m-33 43-6-26m19 10 26-1" stroke="#88a17d" stroke-width="1.5"/><path d="M29 107c-2 7-4 10-9 14" stroke="#88a17d" stroke-width="2"/></svg>'; }
  for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = heartIcon();
  // Read-only diagnostics locate visible objects for input-driven tests.
  window.GiantCure = Object.freeze({ snapshot: () => ({
    screen: state.screen, phase: state.phase, id: state.id, progress: state.progress,
    remaining: null, elapsed: state.elapsed, modal: state.modal,
    result: state.result ? { ...state.result } : null,
    game: state.game ? state.game.getDebugState() : null,
    view: { viewport: { ...view.viewport }, camera: { ...view.camera } },
    logicalSize: { width: W, height: H }, reducedMotion,
    particles: particles.map(p => ({ ...p })), activeTime: state.activeTime
  }) });
  updateRecords(); requestAnimationFrame(frame);
})();
