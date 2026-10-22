// Diagnosis room, case archives, chapter input, checkpoints and presentation.
(() => {
  'use strict';
  let W = 720, H = 1280;
  const viewport = Object.freeze({ x: 24, y: 84, w: 1232, h: 552 });
  const view = { viewport, camera: { x: 800, y: 500, zoom: 1.1 } };
  const $ = id => document.getElementById(id);
  const canvas = $('world'), ctx = canvas.getContext('2d');
  const screens = ['home', 'cases', 'treatment', 'result'];
  // Only implemented chapters own gameplay and saved treatment records.
  const cases = {
    heartJourney: {
      title: '心脏巡诊', number: '01', world: '生命之城', en: 'HEART JOURNEY',
      subtitle: '在巨人的心河里，找回生命的回响。',
      instruction: 'WASD 移动 · Q 扫描状态 · E 与近处目标交互',
      mechanic: '键盘与鼠标 · 约 3–5 分钟', recordKey: 'giant-cure-journey-v1',
      successTitle: '一颗心，重新有了光。',
      successText: '你修复了河流与传导。巨人缓缓睁开眼，胸口重新有了起伏。肺叶深处，仍有微弱的求救。',
      poem: '心脏已稳定 · 下一个求救信号来自肺部'
    }
  };
  const caseIds = Object.keys(cases);
  const entryCatalog = [
    { id: 'heartJourney', title: '心脏巡诊', icon: 'heart', operation: '探索 · 键盘与鼠标', status: 'available' },
    { id: 'blood', title: '血河淤堵', icon: 'river', operation: '拖拽 · 疏通血河', status: 'comingSoon' },
    { id: 'spore', title: '孢子侵染', icon: 'forest', operation: '点击 · 净化孢子', status: 'comingSoon' },
    { id: 'heart', title: '心跳失序', icon: 'rhythm', operation: '节奏 · 校准心跳', status: 'comingSoon' }
  ];
  const playableCaseIds = () => entryCatalog.filter(entry => entry.status === 'available'
    && cases[entry.id] && typeof window.GiantCureGames[entry.id] === 'function').map(entry => entry.id);
  // This is an initial screening, not the chapter's own close-range diagnosis.
  const screeningCase = Object.freeze({
    caseId: 'heartJourney', finding: '心区血流信号减弱', detail: '具体病因待近距离确认'
  });
  const diagnosis = { phase: 'idle', caseId: null, token: 0, frame: null };
  const clinic = { phase: 'idle', elapsed: 0, paused: false };
  const transition = { phase: 'idle', caseId: null, token: 0, frame: null, settle: null, abort: null, context: null, skipped: false, preparation: 0 };
  const forwardedGameKeys = new Set();
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

  function openCaseArchive() {
    if (state.screen !== 'cases' || state.modal || diagnosis.phase === 'scanning' || transition.phase !== 'idle') return;
    const playable = playableCaseIds();
    const completed = caseIds.filter(id => records[id].wins > 0).length;
    const cards = entryCatalog.map(entry => {
      const available = playable.includes(entry.id);
      const record = available ? records[entry.id] : null;
      const mechanic = available ? record.wins && record.bestSeconds ? `键盘与鼠标 · 最佳 ${record.bestSeconds} 秒` : cases[entry.id].mechanic : operationIcon(entry.icon) + entry.operation;
      const content = `<span class="option-art">${entryIcon(entry.icon)}</span><span class="case-copy"><strong>${entry.title}</strong><span class="case-mechanic">${mechanic}</span>${available ? `<span class="case-complete"${record.wins ? '' : ' hidden'}>已治愈 ✓</span>` : ''}</span><span class="option-state">${available ? record.wins ? '再次巡诊' : '前往巡诊 ↗' : '待开放'}</span>`;
      return available
        ? `<button type="button" class="case-option" data-case="${entry.id}">${content}</button>`
        : `<div class="case-option is-coming-soon" data-preview-case="${entry.id}" role="group" aria-label="${entry.title}，待开放">${content}</div>`;
    }).join('');
    openDialog('病例档案', `<div id="case-records" class="case-summary"><span id="record-summary">已治愈 ${completed} / ${caseIds.length} 个病例</span><span id="case-count">${playable.length} 项可出诊</span></div><div id="case-options" class="case-options">${cards}</div>`, [
      { label: '返回诊断室', primary: true, action: closeModal }
    ], 'CASE ARCHIVE / FIELD NOTES', 'archive');
  }
  function updateDiagnosisControls() {
    const scanning = diagnosis.phase === 'scanning', ready = diagnosis.phase === 'ready' && clinic.phase === 'ready', busy = clinicActive();
    $('diagnosis-panel').dataset.diagnosisPhase = diagnosis.phase;
    $('diagnosis-panel').dataset.clinicPhase = clinic.phase;
    $('diagnosis-panel').dataset.clinicPaused = String(clinic.paused);
    $('diagnosis-panel').setAttribute('aria-busy', String(scanning));
    $('diagnosis-action').hidden = !ready;
    $('diagnosis-action').disabled = !ready || transition.phase !== 'idle' || !playableCaseIds().includes(screeningCase.caseId);
    $('diagnosis-action-label').textContent = '进入体内治疗';
    $('clinic-continue').hidden = !busy || !clinic.paused;
    $('clinic-skip').hidden = !busy || clinic.paused;
    $('clinic-skip').disabled = clinic.paused;
    $('case-archive').disabled = busy || transition.phase !== 'idle';
    $('diagnosis-report').hidden = !['report', 'ready'].includes(clinic.phase);
  }
  function resetDiagnosis() {
    diagnosis.token++;
    if (diagnosis.frame !== null) cancelAnimationFrame(diagnosis.frame);
    Object.assign(diagnosis, { phase: 'idle', caseId: null, frame: null });
    $('diagnosis-panel').style.setProperty('--scan-progress', '0');
    $('diagnosis-monitor').style.opacity = '';
    Object.assign(clinic, { phase: 'idle', elapsed: 0, paused: false });
    $('diagnosis-panel').style.setProperty('--clinic-scene-opacity', '0');
    $('diagnosis-panel').style.setProperty('--clinic-body-opacity', '1');
    $('diagnosis-status').textContent = '生命信号待采集';
    updateDiagnosisControls();
  }
  function clinicActive() { return ['arriving', 'examining', 'report'].includes(clinic.phase); }
  function clinicPresentation() {
    const write = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
    const arrival = reducedMotion ? .16 : 4, examination = reducedMotion ? .16 : 4.5, report = reducedMotion ? .16 : 1.5;
    clinic.phase = clinic.elapsed < arrival ? 'arriving' : clinic.elapsed < arrival + examination ? 'examining' : clinic.elapsed < arrival + examination + report ? 'report' : 'ready';
    if (clinic.phase === 'ready') clinic.elapsed = arrival + examination + report;
    const scan = Math.max(0, Math.min(1, (clinic.elapsed - arrival) / examination));
    diagnosis.phase = ['arriving', 'examining'].includes(clinic.phase) ? 'scanning' : 'ready';
    diagnosis.caseId = diagnosis.phase === 'ready' ? screeningCase.caseId : null;
    const reveal = clinic.phase === 'arriving' ? 0 : clinic.phase === 'examining' ? Math.max(0, Math.min(1, (scan - .5) * 2)) : 1;
    $('diagnosis-panel').style.setProperty('--scan-progress', String(scan));
    $('diagnosis-panel').style.setProperty('--clinic-scene-opacity', String(1 - reveal));
    $('diagnosis-panel').style.setProperty('--clinic-body-opacity', String(reveal));
    $('diagnosis-panel').style.setProperty('--clinic-report-progress', String(clinic.phase === 'ready' ? 1 : Math.max(0, Math.min(1, (clinic.elapsed - arrival - examination) / report))));
    write('cases-title', clinic.phase === 'arriving' ? '巨人来诊' : clinic.phase === 'examining' ? '医生问诊' : '生命诊断');
    write('clinic-step', clinic.phase === 'arriving' ? '01 / 来诊' : clinic.phase === 'examining' ? '02 / 听诊' : '03 / 初筛报告');
    write('diagnosis-status', clinic.paused ? '接诊已暂停 · 等你回来' : clinic.phase === 'arriving' ? '“医生，我的胸口有些沉。”' : clinic.phase === 'examining' ? scan < .5 ? '“深呼吸，让我听听你的心跳。”' : '正在比对心肺与循环信号…' : '心区异常已定位');
    write('clinic-caption', clinic.phase === 'arriving' ? '一位远道而来的病人，正在等待帮助。' : clinic.phase === 'examining' ? '巨人医生初筛中 · 体内病因仍待近距离确认' : '医生：“小医疗兵，接下来交给你了。”');
    write('diagnosis-finding', screeningCase.finding);
    write('diagnosis-detail', screeningCase.detail);
    updateDiagnosisControls();
  }
  function beginClinic() {
    Object.assign(clinic, { phase: 'arriving', elapsed: 0, paused: false });
    clinicPresentation(); lastFrame = null;
  }
  function completeClinic() {
    if (!clinicActive()) return;
    clinic.elapsed = reducedMotion ? .48 : 10; clinic.paused = false;
    clearInput(); clinicPresentation(); $('diagnosis-action').focus({ preventScroll: true });
  }
  function pauseClinic() {
    if (state.screen !== 'cases' || !clinicActive() || clinic.paused) return;
    clinic.paused = true; clearInput(); clinicPresentation();
  }
  function resumeClinic() {
    closeModal(); if (!clinicActive()) return;
    clinic.paused = false; lastFrame = null; clinicPresentation(); $('clinic-skip').focus({ preventScroll: true });
  }

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

  function clearInput() { forwardedGameKeys.clear(); if (state.game) state.game.clearInput(); }
  function showScreen(name) {
    if (state.screen === 'cases' || name === 'cases') resetDiagnosis();
    clearInput(); state.screen = name;
    for (const id of screens) $(id).hidden = id !== name;
    $('folio-page').textContent = { home: '001', cases: '002', treatment: '003', result: '004' }[name];
    $('app').classList.toggle('journey-mode', name === 'treatment');
    if (name !== 'treatment') $('app').classList.remove('journey-exterior', 'exterior-finishing');
    document.body.classList.toggle('landscape-treatment', name === 'treatment');
    W = name === 'treatment' ? 1280 : 720; H = name === 'treatment' ? 720 : 1280;
    resize();
    updateExteriorControls();
  }
  function goHome() { cancelEntry(false); loadToken++; closeModal(); clearInput(); state.phase = 'idle'; state.game = null; particles = []; showScreen('home'); }
  function goCases() { cancelEntry(false); loadToken++; closeModal(); clearInput(); state.phase = 'idle'; state.game = null; particles = []; showScreen('cases'); beginClinic(); }
  function requestHome() {
    if (state.screen === 'treatment' && ['playing', 'paused'].includes(state.phase)) {
      pauseGame();
      openDialog('离开这次巡诊？', '<p>离开后将结束本次巡诊，阶段检查点不会保留。已完成的病例记录会留在病历簿里。</p>', [
        { label: '继续巡诊', primary: true, action: resumeGame },
        { label: '回到封面', action: goHome }
      ], 'LEAVE THIS TREATMENT');
    } else if (state.phase !== 'finishing') goHome();
  }

  function prepareChapter(id, phase) {
    const info = cases[id];
    Object.assign(state, { id, game: null, progress: 0, elapsed: 0, activeTime: 0, result: null, finishWait: 0, feedbackTime: 0, phase, hud: {}, cameraRoom: null });
    pointerScreen = null; pointerClient = null;
    particles = [];
    $('case-number').textContent = `CASE ${info.number} / ${info.en}`;
    $('treatment-title').textContent = info.title;
    $('treatment-subtitle').textContent = info.subtitle;
    $('time-caption').textContent = '巡诊用时';
    $('progress-label').textContent = '治疗进程';
    feedback('正在展开巨人的心河…');
    $('journey-task').textContent = '正在准备巡诊';
    updateStats();
  }
  function createChapter(id) {
    state.game = window.GiantCureGames[id]({
      progress: value => { state.progress = Math.max(0, Math.min(1, value)); updateStats(); },
      feedback, success: () => finishGame(true), fail: reason => finishGame(false, reason),
      effect: spawnParticles, sound: playSound, hud: updateHUD,
      setTask: text => { state.hud.task = text; $('journey-task').textContent = text; }
    });
    updateCamera(0, true); updateStats();
  }
  async function startGame(id, entryMode = 'direct') {
    if (!cases[id] || diagnosis.phase === 'scanning' || transition.phase !== 'idle' || !playableCaseIds().includes(id)) return;
    if (entryMode !== 'direct') return enterTreatment(id, entryMode);
    closeModal(); clearInput();
    const token = ++loadToken;
    prepareChapter(id, 'loading'); showScreen('treatment');
    try { if (window.GiantCureAssets) await window.GiantCureAssets.ready; }
    catch {
      if (token !== loadToken) return;
      state.phase = 'load-error';
      openDialog('心河还没有展开', '<p>场景插画未能载入，请重试或返回诊断室。</p>', [
        { label: '重新载入', primary: true, action: () => { if (window.GiantCureAssets?.retry) window.GiantCureAssets.retry(); startGame(id); } },
        { label: '返回诊断室', action: goCases }
      ]);
      return;
    }
    if (token !== loadToken) return;
    createChapter(id); state.phase = 'playing'; feedback(cases[id].instruction); lastFrame = null;
  }
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const p = clamp01(value); return p * p * (3 - 2 * p); };
  function entryFrame(duration, draw) {
    const token = transition.token; let start = performance.now(), skipped = transition.skipped;
    if (skipped) duration = Math.min(duration, 100);
    return new Promise((resolve, reject) => {
      transition.settle = resolve;
      draw(0);
      function animate(now) {
        if (token !== transition.token) { resolve(false); return; }
        if (transition.skipped && !skipped) {
          skipped = true; start = now;
          duration = transition.phase === 'preparing' ? 1 : transition.phase === 'arriving' ? 200 : 100;
        }
        const p = clamp01((now - start) / duration);
        try { draw(p); }
        catch (error) { transition.frame = null; transition.settle = null; reject(error); return; }
        if (p < 1) transition.frame = requestAnimationFrame(animate);
        else { transition.frame = null; transition.settle = null; resolve(true); }
      }
      transition.frame = requestAnimationFrame(animate);
    });
  }
  function captureEntrySource() {
    const monitor = $('diagnosis-monitor'), rect = monitor.getBoundingClientRect();
    const heart = $('diagnosis-heart-anchor').getBoundingClientRect();
    const ghost = $('entry-transition-ghost');
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, transformOrigin: `${heart.x + heart.width / 2 - rect.left}px ${heart.y + heart.height / 2 - rect.top}px` });
    const clone = ghost.firstElementChild;
    if (clone) Object.assign(clone.style, { width: `${monitor.offsetWidth}px`, height: `${monitor.offsetHeight}px`, transform: `scale(${rect.width / monitor.offsetWidth})` });
    return { x: heart.x + heart.width / 2, y: heart.y + heart.height / 2 };
  }
  function entryFocus(point, opacity, scale = 1) {
    Object.assign($('entry-transition-focus').style, { left: `${point.x}px`, top: `${point.y}px`, opacity: String(opacity), transform: `scale(${scale})` });
  }
  function releaseEntryUI() {
    $('entry-transition').hidden = true;
    $('entry-transition').setAttribute('aria-busy', 'false');
    $('entry-transition-ghost').replaceChildren();
    $('entry-transition-status').textContent = '';
    $('entry-preparation').hidden = true;
    $('entry-transition-skip').disabled = false;
    $('diagnosis-monitor').style.visibility = '';
    document.body.classList.remove('entry-in-progress');
    $('app').style.removeProperty('--entry-hud-opacity');
    $('cases').style.removeProperty('--entry-source-opacity');
    for (const id of screens) $(id).inert = state.modal;
    document.querySelector('.app-header').inert = state.modal;
    $('help').disabled = false;
    updateDiagnosisControls();
  }
  function cancelEntry(restore = true) {
    if (transition.phase === 'idle') return;
    const context = transition.context;
    loadToken++; transition.token++;
    if (transition.frame !== null) cancelAnimationFrame(transition.frame);
    transition.settle?.(false); transition.abort?.({ canceled: true });
    Object.assign(transition, { phase: 'idle', caseId: null, frame: null, settle: null, abort: null, context: null, skipped: false, preparation: 0 });
    clearInput(); Object.assign(state, { phase: 'idle', game: null, id: null, progress: 0, elapsed: 0, activeTime: 0, cameraRoom: null, hud: {} });
    particles = []; lastFrame = null;
    if (restore) {
      showScreen('cases');
      if (context.diagnosis.phase === 'ready') {
        Object.assign(diagnosis, { phase: 'ready', caseId: context.diagnosis.caseId });
        Object.assign(clinic, { phase: 'ready', elapsed: reducedMotion ? .48 : 10, paused: false });
        $('diagnosis-panel').style.setProperty('--scan-progress', '1');
        $('diagnosis-status').textContent = '异常已定位';
        $('diagnosis-finding').textContent = screeningCase.finding; $('diagnosis-detail').textContent = screeningCase.detail;
        clinicPresentation();
      }
    }
    releaseEntryUI();
    if (restore) $(context.mode === 'diagnosis' ? 'diagnosis-action' : 'case-archive').focus({ preventScroll: true });
  }
  async function enterTreatment(id, mode) {
    const context = { mode, diagnosis: { phase: diagnosis.phase, caseId: diagnosis.caseId } };
    closeModal(); clearInput();
    const load = ++loadToken, token = ++transition.token;
    const current = () => load === loadToken && token === transition.token;
    Object.assign(transition, { phase: mode === 'diagnosis' && !reducedMotion ? 'preparing' : 'departing', caseId: id, context, skipped: false, preparation: 0 });
    try {
    prepareChapter(id, 'entering');
    const full = mode === 'diagnosis' && !reducedMotion;
    const coverDuration = full ? 500 : reducedMotion ? 100 : 100;
    const arriveDuration = full ? 900 : reducedMotion ? 100 : 150;
    const resource = Promise.resolve(window.GiantCureAssets?.ready).then(() => ({ ready: true }), error => ({ error }));
    const aborted = new Promise(resolve => { transition.abort = resolve; });
    const ghost = $('entry-transition-ghost'), veil = $('entry-transition-veil');
    ghost.replaceChildren(); ghost.style.transform = ''; ghost.style.opacity = full ? '1' : '0';
    if (full) {
      const clone = $('diagnosis-monitor').cloneNode(true);
      const identities = new Map();
      for (const element of [clone, ...clone.querySelectorAll('[id]')]) if (element.id) { identities.set(element.id, `entry-ghost-${element.id}`); element.id = identities.get(element.id); }
      for (const element of [clone, ...clone.querySelectorAll('*')]) for (const attribute of [...element.attributes]) {
        let value = attribute.value;
        for (const [oldId, newId] of identities) { value = value.replaceAll(`url(#${oldId})`, `url(#${newId})`); if (value === `#${oldId}`) value = `#${newId}`; }
        if (value !== attribute.value) element.setAttribute(attribute.name, value);
      }
      for (const [selector, id] of [['.anatomy-silhouette', 'anatomy-skin'], ['.anatomy-lungs', 'anatomy-lung'], ['.anatomy-heart', 'anatomy-heart']]) {
        const element = clone.querySelector(selector); if (element) element.style.fill = `url(#${identities.get(id)})`;
      }
      clone.style.visibility = ''; ghost.append(clone); captureEntrySource();
      $('diagnosis-monitor').style.visibility = 'hidden';
    }
    veil.style.opacity = '0'; $('entry-transition-focus').style.opacity = '0';
    $('entry-transition-status').textContent = '';
    $('entry-transition').hidden = false; $('entry-transition').setAttribute('aria-busy', 'true');
    $('entry-transition-skip').hidden = !full;
    $('entry-transition-skip').disabled = false;
    document.body.classList.add('entry-in-progress'); $('app').style.setProperty('--entry-hud-opacity', '0');
    $('cases').style.setProperty('--entry-source-opacity', '1');
    for (const screen of screens) $(screen).inert = true;
    document.querySelector('.app-header').inert = true; $('help').disabled = true;
    updateDiagnosisControls();
    $('entry-transition').tabIndex = -1; $('entry-transition').focus({ preventScroll: true });
    if (transition.phase === 'preparing') {
      $('entry-preparation').hidden = false;
      if (!await entryFrame(2000, p => {
        transition.preparation = p;
        const preparation = $('entry-preparation');
        window.GiantCureClinicArt?.drawPreparation(preparation.getContext('2d'), p, reducedMotion);
        $('entry-transition-status').textContent = p < .4 ? '小医疗兵正在检查药剂与装备…' : p < .78 ? '医疗背包就绪 · 进入微缩装置' : '目标锁定：巨人心区';
      }) || !current()) return;
      $('entry-preparation').hidden = true; $('entry-transition-status').textContent = '';
      transition.phase = 'departing';
    }
    if (!await entryFrame(coverDuration, p => {
      if (full && !transition.skipped) {
        const point = captureEntrySource(), push = smooth(p / .7), scale = 1 + .9 * push;
        ghost.style.transform = `translate(${(innerWidth / 2 - point.x) * push}px, ${(innerHeight / 2 - point.y) * push}px) scale(${scale})`;
        $('cases').style.setProperty('--entry-source-opacity', String(1 - push));
        veil.style.opacity = String(smooth((p - .7) / .3));
      } else { ghost.style.opacity = '0'; veil.style.opacity = String(smooth(p)); }
    }) || !current()) return;
    transition.phase = 'waiting'; veil.style.opacity = '1';
    $('entry-transition-status').textContent = '正在准备治疗场景…';
    const outcome = await Promise.race([resource, aborted]);
    if (!current() || outcome.canceled) return;
    if (!outcome.ready) throw outcome.error;
    $('entry-transition-status').textContent = ''; ghost.style.opacity = '0';
    showScreen('treatment'); $('treatment').inert = true;
    createChapter(id);
    const end = { ...view.camera }, g = state.game.getDebugState(), size = g.worldSize;
    const center = (value, total, half) => total <= half * 2 ? total / 2 : Math.max(half, Math.min(total - half, value));
    const start = { x: center(g.player.x, size.width, viewport.w / 2 / .88), y: center(g.player.y, size.height, viewport.h / 2 / .88), zoom: .88 };
    transition.phase = 'arriving';
    if (!await entryFrame(transition.skipped ? 100 : arriveDuration, p => {
      const moving = full && !transition.skipped, cameraProgress = moving ? smooth(p * 1.5) : 1;
      for (const key of ['x', 'y', 'zoom']) view.camera[key] = start[key] + (end[key] - start[key]) * cameraProgress;
      if (p === 0) drawPage(0);
      veil.style.opacity = String(1 - (moving ? smooth(p * 1.5) : smooth(p)));
      $('app').style.setProperty('--entry-hud-opacity', String(moving ? clamp01((p - 2 / 3) * 3) : p));
      if (moving) {
        const rect = canvas.getBoundingClientRect();
        entryFocus({ x: rect.x + (viewport.x + viewport.w / 2 + (g.player.x - view.camera.x) * view.camera.zoom) * rect.width / W, y: rect.y + (viewport.y + viewport.h / 2 + (g.player.y - view.camera.y) * view.camera.zoom) * rect.height / H }, .65 * (1 - cameraProgress), 1.8 - .8 * cameraProgress);
      }
    }) || !current()) return;
    Object.assign(view.camera, end);
    Object.assign(transition, { phase: 'idle', caseId: null, context: null, abort: null, preparation: 0 });
    clearInput(); lastFrame = null; releaseEntryUI();
    state.phase = 'playing'; feedback(cases[id].instruction);
    canvas.tabIndex = -1; canvas.focus({ preventScroll: true });
    } catch {
      if (!current()) return;
      cancelEntry();
      openDialog('心河还没有展开', '<p>治疗场景未能准备完成，请重试或返回诊断室。</p>', [
        { label: '重新载入', primary: true, action: () => { window.GiantCureAssets?.retry?.(); startGame(id, mode); } },
        { label: '返回诊断室', action: closeModal }
      ]);
    }
  }
  function updateHUD(data) {
    Object.assign(state.hud, data);
    const h = state.hud;
    const write = (id, text) => { if ($(id).textContent !== String(text)) $(id).textContent = text; };
    write('journey-integrity', Math.max(0, Math.round(h.integrity ?? 100)));
    $('integrity-fill').style.width = `${Math.max(0, Math.min(100, h.integrity ?? 100))}%`;
    write('journey-ammo', `${h.ammo ?? 24} / 24`);
    const reloading = h.reloadRemaining > 0, ammo = h.ammo ?? 24;
    const stage = reloading ? h.reloadStage || 'eject' : 'idle';
    write('journey-reload', reloading ? `${({ eject: '退出药剂匣', insert: '插入新药剂', lock: '锁定供药' })[stage] || '装填中'} ${h.reloadRemaining.toFixed(1)}s` : ammo === 0 ? '空仓 · 按 R 装填' : ammo <= 6 ? '药剂不足 · 按 R 装填' : '无限备药');
    $('journey-magazine').dataset.reloadStage = stage;
    $('journey-magazine').dataset.ammoState = ammo === 0 ? 'empty' : ammo <= 6 ? 'low' : 'ready';
    const reloadProgress = reloading ? Math.max(0, Math.min(1, h.reloadProgress ?? 1 - h.reloadRemaining / 1.7)) : 0;
    $('reload-fill').style.width = `${reloadProgress * 100}%`;
    $('reload-track').setAttribute('aria-valuenow', String(Math.round(reloadProgress * 100)));
    $('journey-reload-button').dataset.reloading = String(reloading);
    $('journey-reload-button').setAttribute('aria-label', reloading ? '正在装填药剂' : '装填药剂，快捷键 R');
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
    const exterior = won && chapter.endingScene === 'exterior';
    // The controller clamps its final time slice. Use that same boundary for
    // natural playback and a skipped recovery before rounding the saved time.
    if (exterior) { state.elapsed = chapter.elapsed; state.activeTime = chapter.elapsed; }
    clearInput(); state.phase = 'finishing'; state.finishWait = exterior ? .2 : won ? 1.8 : .8;
    updateExteriorControls(chapter);
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
    $('result-next').firstElementChild.textContent = r.won ? '完成巡诊 · 返回诊断室' : '从最近安全节点重启';
    $('result-next').onclick = r.won ? goCases : retryCheckpoint;
    showScreen('result');
  }
  function updateExteriorControls(chapter = state.game?.getDebugState()) {
    const exterior = state.screen === 'treatment' && chapter?.endingScene === 'exterior';
    $('app').classList.toggle('exterior-finishing', exterior && state.phase === 'finishing');
    const button = $('exterior-skip');
    if (!button) return;
    button.hidden = !exterior || state.phase !== 'playing' || state.modal;
    button.disabled = button.hidden;
  }
  function skipExterior() {
    if (state.screen !== 'treatment' || state.phase !== 'playing' || state.modal || !state.game) return;
    const chapter = state.game.getDebugState();
    if (chapter.endingScene !== 'exterior' || chapter.finished) return;
    const remaining = Math.max(0, chapter.endingDuration - chapter.ending);
    const button = $('exterior-skip');
    if (button) button.disabled = true;
    clearInput(); state.elapsed += remaining; state.activeTime += remaining;
    state.game.update(remaining); updateExteriorControls();
  }
  function pauseGame() { if (state.phase === 'playing') { clearInput(); state.phase = 'paused'; updateExteriorControls(); } }
  function showPause() {
    if (!['playing', 'paused'].includes(state.phase)) return;
    pauseGame();
    openDialog('让世界歇一会儿', '<p>风停在树梢，河流等你回来。<br>巡诊已暂停，时间不会流逝。<br>返回诊断室会结束本次巡诊。</p>', [
      { label: '继续巡诊 ↗', primary: true, action: resumeGame },
      { label: '从头重新巡诊', action: () => startGame(state.id) },
      { label: '返回诊断室', action: goCases }
    ]);
  }
  function resumeGame() { closeModal(); if (state.phase === 'paused') { state.phase = 'playing'; lastFrame = null; updateExteriorControls(); } }
  function showHelp() {
    if (state.phase === 'finishing' || transition.phase !== 'idle') return;
    if (state.screen === 'cases') {
      pauseClinic();
      openDialog('听见生命的求救', '<p>先迎接病人，由巨人医生听诊、定位异常。初筛报告完成后，点击出发，跟随小医疗兵进入体内。</p><p class="dialog-tip">初筛只定位异常区域。进入身体后，再近距离检查具体病因。接诊可跳过；报告会等你准备好。</p><p>接诊已暂停，关闭帮助后点击“继续接诊”恢复。</p>', [
        { label: clinicActive() ? '继续接诊 ↗' : '明白了 ↗', primary: true, action: clinicActive() ? resumeClinic : closeModal }
      ], 'LIFE DIAGNOSTICS / FIELD GUIDE');
      return;
    }
    const wasPlaying = ['playing', 'paused'].includes(state.phase);
    if (wasPlaying) pauseGame();
    const chapter = state.game?.getDebugState();
    const hints = {
      diagnosis: '正常血流应当平稳。对比两条支路的流量与压力，沿着淤积的血河寻找上游异常；瓣膜在舒张时开放。',
      bypass: '血栓前方压力过高。先恢复两条侧支，让血流有去处，再处理血栓。第二条侧支需要留意心跳的舒张窗口。',
      combat: '观察 Hunter 扑击前的预警，躲开后瞄准发光弱点。先解除第一只 Hunter 的干扰，再开始治疗。',
      clot: '血栓有三处结构。扫描发现后，关闭 Q 也能继续治疗。让射线对准结构，遇到组织或敌人遮挡时调整位置；躲避和装填都会保留软化进度。',
      burst: '两条侧支降低了上游压力，软化后的血栓正在被主血流带走。观察下游重新恢复流动。',
      conduction: '血流已恢复，但心跳信号仍然中断。扫描传导节点，接近后依次连接 A、B、C，重新建立搏动顺序。',
      recovery: '传导顺序已经接通。第一声强心跳将唤醒城市，并为医疗单位提供循环冲刺能力。',
      escape: '沿着恢复的血流前进，按 Space 越过循环屏障。出口处还有一小片不随心跳变化的组织，先扫描再尝试治疗。',
      growth: '扫描出口处异常组织，持续照射直至暂时压制，再观察它的变化。',
      ending: '这片异常组织在被压制后重新生长。心脏已恢复，但巨人的其他部位仍需要你。'
    };
    const hint = chapter ? chapter.stage === 'escape' && chapter.crossedBarrier ? hints.growth : hints[chapter.stage] || (chapter.room === 'entry' ? hints.diagnosis : chapter.room === 'heart' ? hints.conduction : hints.bypass) : '进入诊断室，检查生命信号并定位异常，再前往巨人的身体开展巡诊。';
    openDialog('带着好奇，进入心河', `<p class="dialog-tip">${hint}</p><div class="help-item"><strong>移动与观察</strong><p>WASD 移动，Shift 疾行。组织地面和浅血流槽都可行走，高起组织墙会挡路。Q 读取附近症状，静态目标的诊断会保留；Hunter 弱点需要实时扫描。</p></div><div class="help-item"><strong>治疗与连接</strong><p>鼠标决定方向，左键沿射线治疗或射击，射程 225；前方实体会挡住射线。按住右键减速，提前查看第一命中点。R 装填，备弹无限。接近节点按 E，连接后跟随下一端提示。</p></div><div class="help-item"><strong>安全与恢复</strong><p>避开扑击预警。设备耐久归零后，从最近安全节点重启。心脏恢复后，Space 使用循环冲刺。不限时，退出或刷新会清除本次检查点。</p></div><p>本章使用键盘与鼠标。声音默认关闭，可点击右上角音符开启。</p>`, [
      { label: wasPlaying ? '继续巡诊 ↗' : '明白了 ↗', primary: true, action: wasPlaying ? resumeGame : closeModal }
    ], 'HEART JOURNEY / FIELD GUIDE');
  }
  function dialogControls() {
    return [...$('modal').querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.disabled && !element.closest('[hidden], [inert]') && element.getClientRects().length);
  }
  function openDialog(title, body, buttons, kicker = 'A MOMENT OF CARE', variant = '') {
    if (clinicActive()) pauseClinic();
    if ($('modal').hidden) previousFocus = document.activeElement;
    const dialog = $('modal').querySelector('.dialog');
    dialog.classList.toggle('archive-dialog', variant === 'archive');
    state.modal = true; $('dialog-title').textContent = title; $('dialog-kicker').textContent = kicker;
    updateExteriorControls();
    $('dialog-body').innerHTML = body; $('dialog-actions').replaceChildren();
    buttons.forEach((item, index) => {
      const button = document.createElement('button');
      button.className = item.primary ? 'primary-button' : index === buttons.length - 1 && buttons.length > 2 ? 'text-button' : 'secondary-button';
      button.textContent = item.label; button.onclick = item.action; $('dialog-actions').append(button);
    });
    $('modal').hidden = false;
    for (const id of screens) $(id).inert = true;
    document.querySelector('.app-header').inert = true;
    dialog.scrollTop = 0;
    dialogControls()[0]?.focus({ preventScroll: true });
  }
  function closeModal() {
    $('modal').hidden = true; state.modal = false;
    updateExteriorControls();
    for (const id of screens) $(id).inert = false;
    document.querySelector('.app-header').inert = false;
    $('modal').querySelector('.dialog').classList.remove('archive-dialog');
    $('dialog-body').replaceChildren(); $('dialog-actions').replaceChildren();
    if (previousFocus && previousFocus.isConnected && !previousFocus.disabled && !previousFocus.closest('[hidden], [inert]') && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  const toPoint = event => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height }; };
  const inWorld = p => p.x >= viewport.x && p.x <= viewport.x + viewport.w && p.y >= viewport.y && p.y <= viewport.y + viewport.h;
  const toWorld = p => ({ x: view.camera.x + (p.x - viewport.x - viewport.w / 2) / view.camera.zoom, y: view.camera.y + (p.y - viewport.y - viewport.h / 2) / view.camera.zoom });
  const acceptsInput = () => state.screen === 'treatment' && state.phase === 'playing' && !state.modal && transition.phase === 'idle';
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
    if (transition.phase !== 'idle') {
      if (event.code === 'Escape') { event.preventDefault(); cancelEntry(); }
      else if (event.key === 'Tab') {
        event.preventDefault();
        const controls = [$('entry-transition-skip'), $('entry-transition-home')].filter(el => !el.hidden && !el.disabled);
        const index = controls.indexOf(document.activeElement), step = event.shiftKey ? -1 : 1;
        controls[index < 0 ? (step > 0 ? 0 : controls.length - 1) : (index + step + controls.length) % controls.length]?.focus({ preventScroll: true });
      }
      else if (gameKeys.has(event.code) && !(event.code === 'Space' && !event.repeat && [$('entry-transition-home'), $('entry-transition-skip')].includes(event.target))
        || event.repeat && ['Enter', 'Space'].includes(event.code)) event.preventDefault();
      return;
    }
    if (event.code === 'Escape') {
      event.preventDefault();
      if (state.screen === 'cases' && clinicActive() && !state.modal) { goHome(); return; }
      if (state.phase === 'playing') showPause(); else if (state.phase === 'paused') resumeGame(); else if (state.modal) closeModal();
      return;
    }
    if (event.target === $('exterior-skip') && ['Enter', 'Space'].includes(event.code)) {
      if (event.repeat) event.preventDefault();
      return;
    }
    if (acceptsInput() && gameKeys.has(event.code)) {
      event.preventDefault();
      if (!event.repeat || forwardedGameKeys.has(event.code)) { forwardedGameKeys.add(event.code); state.game.keyDown(event.code, event.repeat); }
    }
    if (event.key === 'Tab' && state.modal) {
      const controls = dialogControls(), first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if ((!event.shiftKey && document.activeElement === last) || !controls.includes(document.activeElement)) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('keyup', event => { forwardedGameKeys.delete(event.code); if (state.game) state.game.keyUp(event.code); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (transition.phase !== 'idle') { cancelEntry(); return; }
    pauseClinic();
    if (state.phase === 'playing') showPause();
  });
  window.addEventListener('blur', () => {
    if (transition.phase !== 'idle') { cancelEntry(); return; }
    pauseClinic();
    if (state.phase === 'playing') showPause(); else clearInput();
  });
  $('brand').onclick = requestHome;
  $('begin').onclick = goCases; $('case-back').onclick = goHome;
  $('help').onclick = showHelp; $('pause').onclick = showPause;
  $('retry').onclick = () => state.result && !state.result.won ? retryCheckpoint() : startGame(state.id);
  $('result-cases').onclick = goCases;
  $('diagnosis-action').onclick = () => {
    if (state.screen !== 'cases' || state.modal) return;
    if (diagnosis.phase === 'ready' && playableCaseIds().includes(diagnosis.caseId)) startGame(diagnosis.caseId, 'diagnosis');
  };
  $('clinic-skip').onclick = completeClinic;
  $('clinic-continue').onclick = resumeClinic;
  $('diagnosis-action').addEventListener('keydown', event => {
    if (event.repeat && ['Enter', 'Space'].includes(event.code)) event.preventDefault();
  });
  $('case-archive').onclick = openCaseArchive;
  $('entry-transition-home').onclick = goHome;
  $('entry-transition-skip').onclick = () => { if (transition.phase !== 'idle') { transition.skipped = true; clearInput(); $('entry-transition-skip').disabled = true; } };
  if ($('exterior-skip')) $('exterior-skip').onclick = skipExterior;
  $('dialog-body').addEventListener('click', event => {
    const card = event.target.closest('button[data-case]');
    if (card && state.modal && $('modal').querySelector('.dialog').classList.contains('archive-dialog')) startGame(card.dataset.case, 'archive');
  });
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
      const profile = ({
        shot: { notes: [349.23], duration: .07, volume: .018, spacing: 0, type: 'triangle' },
        hit: { notes: [659.25], duration: .12, volume: .03, spacing: 0 },
        hitWeak: { notes: [880, 1318.51], duration: .13, volume: .04, spacing: .055 },
        treatment: { notes: [523.25, 659.25], duration: .09, volume: .018, spacing: .035 },
        wall: { notes: [164.81], duration: .055, volume: .016, spacing: 0, type: 'triangle' },
        reloadOut: { notes: [196, 130.81], duration: .065, volume: .028, spacing: .055, type: 'triangle' },
        reloadIn: { notes: [293.66, 392], duration: .075, volume: .03, spacing: .055, type: 'triangle' },
        reloadReady: { notes: [523.25, 783.99], duration: .13, volume: .035, spacing: .06 },
        empty: { notes: [98], duration: .04, volume: .024, spacing: 0, type: 'triangle' }
      })[kind];
      const notes = profile?.notes || (heartbeat ? [110, 73.42] : kind === 'flow' ? [146.83, 220, 293.66, 440] : kind === 'win' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'miss' || kind === 'lose' ? [261.63, 220] : [440]);
      notes.forEach((hz, i) => {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        const time = audioContext.currentTime + i * (profile?.spacing ?? (heartbeat ? .14 : .1)), duration = profile?.duration ?? (heartbeat ? .24 : .65);
        oscillator.type = profile?.type || 'sine'; oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(profile?.volume ?? (kind === 'heartbeatStrong' ? .07 : heartbeat ? .035 : .045), time + .015); gain.gain.exponentialRampToValueAtTime(.001, time + duration);
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
    $('app').classList.toggle('journey-exterior', g.endingScene === 'exterior');
    updateExteriorControls(g);
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
      zoom = cue.zoom ?? (cue.kind === 'burst' ? .8 : cue.kind === 'recovery' ? .82 : .72);
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
    if (state.screen === 'cases') {
      drawBotanical(638, 1175, time, .7);
      if (window.GiantCureClinicArt) {
        const scene = $('clinic-scene'), sceneCtx = scene.getContext('2d');
        window.GiantCureClinicArt.draw(sceneCtx, { ...clinic, reducedMotion }, clinic.elapsed, window.GiantCureAssets?.images || {});
      }
    }
    if (state.screen === 'result') { drawBotanical(79, 651, time, .55); drawBotanical(656, 725, time, .6, -1); }
    if (state.screen === 'treatment' && state.game) { ctx.save(); state.game.draw(ctx, state.activeTime, { ...view, reducedMotion }); ctx.restore(); }
  }
  function frame(now) {
    const raw = lastFrame === null ? 0 : Math.max(0, (now - lastFrame) / 1000); lastFrame = now;
    const dt = Math.min(raw, .1);
    if (state.screen === 'cases' && clinicActive() && !clinic.paused && !state.modal) {
      if (raw > 2 || document.hidden) pauseClinic();
      else {
        const previous = clinic.phase; clinic.elapsed += raw; clinicPresentation();
        if (previous !== 'ready' && clinic.phase === 'ready') $('diagnosis-action').focus({ preventScroll: true });
      }
    }
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

  function operationIcon(kind) {
    const paths = {
      heart: '<circle cx="12" cy="12" r="8"/><path d="m15 9-2 4-4 2 2-4Z"/>',
      river: '<path d="M4 12h16m-4-4 4 4-4 4M8 8l-4 4 4 4"/>',
      forest: '<path d="m8 6 1 14 4-5 6-1Zm-4-1L2 3m6-1V0m5 4 2-2M3 9H0"/>',
      rhythm: '<path d="M2 12h4l3-7 5 14 3-7h5"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || paths.heart}</svg>`;
  }
  function entryIcon(kind) {
    if (kind === 'heart') return heartIcon();
    const art = {
      river: '<path d="M22 43c14-11 26-9 38-2s23 7 40-3M19 89c16-10 27-8 40-1s24 6 42-2" stroke="#b9c9a7" stroke-width="2"/><path d="M57 20c-35 26 23 33 0 55s-8 28-1 35h27c-25-19-5-22 3-38S48 42 79 21" fill="#a9c9bd"/><path d="M64 28c-17 18 27 28 5 49s-4 23 1 27" stroke="#eff5e7" stroke-width="2"/><path d="m36 60 12-10 15 5 3 14-16 6-15-6Z" fill="#c2b096"/><path d="m68 82 9-7 11 4 1 11-13 4-8-5Z" fill="#cdbda0"/><path d="M22 35v-8m-4 4h8" stroke="#bca46d"/>',
      forest: '<path d="M25 98c23-12 51-12 74 0" fill="#d0dcbc"/><path d="M43 91V48m34 46V40" stroke="#92a981" stroke-width="2"/><path d="M22 68c0-17 6-34 21-42 16 9 22 26 22 42-15 9-29 9-43 0Z" fill="#b0c79e"/><path d="M59 62c0-20 7-37 18-46 14 11 21 28 21 46-12 8-26 9-39 0Z" fill="#91b29a"/><path d="m43 57-9-8m43-1 9-8" stroke="#f0f4e4" stroke-width="2"/><circle cx="63" cy="82" r="9" fill="#c1b2c7"/><circle cx="62" cy="80" r="3" fill="#e4dbe4"/><path d="M28 89v-7m-3 3h6m64-7v-7m-3 3h6" stroke="#bda773"/>',
      rhythm: '<path d="M23 101c26-10 49-10 74 0" stroke="#c9d6ba"/><path d="M59 94C24 71 21 43 37 36c12-6 23 6 23 6s10-12 23-6c18 8 12 36-24 58Z" fill="#cfb99e"/><path d="M26 66h21l7-14 12 29 9-17h20" stroke="#f8f5e8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="75" cy="64" r="4" fill="#bf9f60"/><path d="M89 24v-9m-4 4h8" stroke="#bca46d"/>'
    };
    return `<svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="60" cy="66" rx="55" ry="55" fill="#e8edde"/>${art[kind] || art.river}</svg>`;
  }
  function heartIcon() {
    return '<svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="60" cy="66" rx="55" ry="55" fill="#e8edde"/><path d="M14 92Q50 109 105 91" stroke="#c7d4b9"/><circle cx="96" cy="28" r="3" fill="#c2a96e"/><path d="M60 108C8 74 19 33 43 39c11 1 17 12 17 12s7-16 22-12c35 9 12 48-22 69Z" fill="#c7aa8b" opacity=".6"/><path d="M30 91c20-19 40-18 60-2l-5 17H36Z" fill="#a3b68e"/><path d="M39 78V51h15v27m5 1V40h16v39m5 5V58h13v26" fill="#dce2c8" stroke="#8da580" stroke-width="1.5"/><path d="m37 51 10-12 9 12m1-11 10-17 10 17m0 18 10-14 8 14" fill="#81a48b"/><path d="M46 60v5m20-15v6m20 9v5" stroke="#bd9f59" stroke-width="3"/><path d="M18 91h19l6-9 9 19 9-25 8 15h35" stroke="#6e997e" stroke-width="2"/><path d="M67 16v-8m-4 4h8" stroke="#c0a35e"/></svg>';
  }
  function leafIcon() { return '<svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30 103C12 51 45 23 98 23c3 58-15 88-68 80Z" fill="#cedbc1" stroke="#90aa83" stroke-width="1.5"/><path d="m31 103 48-60m-33 43-6-26m19 10 26-1" stroke="#88a17d" stroke-width="1.5"/><path d="M29 107c-2 7-4 10-9 14" stroke="#88a17d" stroke-width="2"/></svg>'; }
  for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = entryIcon(element.dataset.icon);
  // Read-only diagnostics locate visible objects for input-driven tests.
  window.GiantCure = Object.freeze({ snapshot: () => ({
    screen: state.screen, phase: state.phase, id: state.id, progress: state.progress,
    remaining: null, elapsed: state.elapsed, modal: state.modal,
    result: state.result ? { ...state.result } : null,
    diagnosis: { phase: diagnosis.phase, caseId: diagnosis.caseId },
    clinic: { phase: clinic.phase, elapsed: clinic.elapsed, paused: clinic.paused },
    transition: { phase: transition.phase, caseId: transition.caseId },
    game: state.game ? state.game.getDebugState() : null,
    view: { viewport: { ...view.viewport }, camera: { ...view.camera }, reducedMotion },
    logicalSize: { width: W, height: H }, reducedMotion,
    particles: particles.map(p => ({ ...p })), activeTime: state.activeTime
  }) });
  resetDiagnosis(); requestAnimationFrame(frame);
})();
