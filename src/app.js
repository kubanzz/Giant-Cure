// Shared shell: navigation, input, timing, sound, scoring and presentation.
(() => {
  'use strict';
  const W = 720, H = 1280, LIMIT = 90;
  const $ = id => document.getElementById(id);
  const canvas = $('world'), ctx = canvas.getContext('2d');
  const scenes = ['home', 'cases', 'treatment', 'result'];
  const order = ['blood', 'spore', 'heart'];
  const cases = {
    blood: { title: '血河淤堵', number: '01', world: '河流生态', en: 'RIVER', subtitle: '搬走沉积的疲惫，让生命再次流动。', glyph: '↔', task: '拖动血栓，疏通河道', instruction: '按住河中的石块，拖到发光草地后松手。', note: '鼠标 / 触屏拖拽', successTitle: '河流，重新呼吸。', successText: '你搬走的不只是石块，还有世界的疲惫。', poem: '一条河流醒来，一座世界重生。', intro: '河道被九处血栓堵住了。按住石块，拖到任意一侧发光草地再松开。分三批疏通，让血河恢复流动。', tolerance: '错误投放 5 次会结束治疗；单击或取消拖动不扣耐受。' },
    spore: { title: '孢子侵染', number: '02', world: '森林生态', en: 'FOREST', subtitle: '守护林间的微光，让绿意再次生长。', glyph: '✧', task: '净化紫色孢子，保护绿叶精灵', instruction: '点击标有「感染」的紫色孢子，避开「守护」绿叶。', note: '鼠标 / 触屏点击', successTitle: '森林，再次苏醒。', successText: '散落的微光，终于又长成了一整片春天。', poem: '每一片新叶，都记得你的温柔。', intro: '点击带有「感染」字样的紫色孢子，累计净化 22 颗。带有「守护」字样的绿叶精灵是森林的朋友，请让它们自由飞过。', tolerance: '漏掉感染或误伤精灵都会消耗生机；共可承受 5 次。' },
    heart: { title: '心跳失序', number: '03', world: '生命之城', en: 'HEART', subtitle: '听见生命的节奏，点亮沉睡的城市。', glyph: '♡', task: '光点进入金色区域时轻点一下', instruction: '跟随光点，在金色安定区按下共鸣。', note: '点击场景 / 共鸣按钮 / 空格', successTitle: '心跳，温柔有序。', successText: '当心跳找回节奏，整座城都有了光。', poem: '一声心跳，是万物生长的回音。', intro: '先看一次 3 秒的节奏示范。随后，光点每次进入金色安定区时，点击场景或「共鸣」按钮。成功共鸣 17 次，就能唤醒生命之城。', tolerance: '每轮只结算一次。提前点击或漏拍消耗安定度，共可承受 6 次。也可以按空格键。' }
  };
  let records = {};
  try { records = JSON.parse(localStorage.getItem('giant-cure-records-v1') || '{}') || {}; } catch { records = {}; }
  if (typeof records !== 'object' || Array.isArray(records)) records = {};
  const state = { screen: 'home', phase: 'idle', id: null, game: null, progress: 0, remaining: LIMIT, elapsed: 0, mistakes: 0, result: null, finishWait: 0, feedbackTime: 0, modal: null };
  let particles = [], pointerId = null, previousFocus = null, soundEnabled = false;
  let audioContext = null, toastTimer = null, lastFrame = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    const vw = document.documentElement.clientWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const margin = vw > 600 ? 30 : 0;
    const bodyStyle = getComputedStyle(document.body);
    const safePadding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
    const scale = Math.min(vw / W, (vh - margin - safePadding) / H);
    $('viewport').style.width = `${W * scale}px`;
    $('viewport').style.height = `${H * scale}px`;
    $('app').style.transform = `scale(${scale})`;
    // Extra backing pixels keep original Canvas artwork crisp on mobile displays.
    const dpr = Math.min(2, Math.max(1, devicePixelRatio * scale));
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
  }
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  function showScreen(name) {
    cancelPointer();
    state.screen = name;
    for (const id of scenes) $(id).hidden = id !== name;
    $('folio-page').textContent = ({ home: '001', cases: '002', treatment: '00' + (3 + order.indexOf(state.id)), result: '006' })[name];
    if (name === 'cases') updateRecords();
    $('app').classList.toggle('heart-mode', name === 'treatment' && state.id === 'heart');
  }
  function updateRecords() {
    const count = order.filter(id => records[id] && records[id].wins > 0).length;
    $('record-summary').textContent = `已治愈 ${count} / 3 个病例`;
    for (const card of document.querySelectorAll('[data-case]')) card.querySelector('.case-complete').hidden = !(records[card.dataset.case] && records[card.dataset.case].wins);
  }
  function goHome() { closeModal(); state.phase = 'idle'; state.game = null; particles = []; showScreen('home'); }
  function goCases() { closeModal(); state.phase = 'idle'; state.game = null; particles = []; showScreen('cases'); }
  function requestNavigation(destination) {
    if (state.screen === 'treatment' && (state.phase === 'playing' || state.phase === 'paused')) {
      pauseGame();
      openDialog('离开这次治疗？', '<p>当前治疗进度不会保存。已完成的病例记录会留在病历簿里。</p>', [
        { label: '继续治疗', primary: true, action: resumeGame },
        { label: destination === 'home' ? '回到封面' : '回到病历簿', action: destination === 'home' ? goHome : goCases }
      ], 'LEAVE THIS TREATMENT');
    } else if (state.phase !== 'finishing') (destination === 'home' ? goHome : goCases)();
  }
  function openCase(id) {
    const info = cases[id];
    openDialog(info.title, `<p>${info.intro}</p><p class="dialog-tip">${info.tolerance}<br>限时 90 秒 · 随时可暂停</p>`, [
      { label: '准备好了，开始治疗 ↗', primary: true, action: () => startGame(id) },
      { label: '再看看其他病例', action: closeModal }
    ], `CASE ${info.number} / ${info.world}`);
  }
  function startGame(id) {
    closeModal();
    const info = cases[id];
    Object.assign(state, { id, progress: 0, elapsed: 0, remaining: LIMIT, mistakes: 0, result: null, finishWait: 0, feedbackTime: 0, phase: 'playing' });
    particles = [];
    $('case-number').textContent = `CASE ${info.number} / ${info.en}`;
    $('treatment-title').textContent = info.title;
    $('treatment-subtitle').textContent = info.subtitle;
    $('control-glyph').textContent = info.glyph;
    $('task-text').textContent = info.task;
    $('instruction-text').textContent = info.instruction;
    $('control-note').textContent = info.note;
    $('beat').hidden = id !== 'heart';
    feedback(info.instruction, 'info');
    state.game = window.GiantCureGames[id]({
      progress: value => { state.progress = Math.max(0, Math.min(1, value)); updateStats(); },
      feedback,
      success: () => finishGame(true),
      fail: reason => finishGame(false, reason),
      effect: spawnParticles,
      sound: playSound,
      setTask: text => { $('task-text').textContent = text; }
    });
    showScreen('treatment');
    updateStats();
    lastFrame = null;
  }
  function updateStats() {
    const percent = Math.round(state.progress * 100);
    $('progress-value').innerHTML = `${percent}<span>%</span>`;
    $('progress-fill').style.width = `${percent}%`;
    const seconds = Math.max(0, Math.ceil(state.remaining));
    $('time-value').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    $('time-value').classList.toggle('urgent', seconds <= 15);
  }
  function feedback(text, kind = 'info') {
    $('game-feedback').textContent = text;
    $('game-feedback').dataset.kind = kind;
    state.feedbackTime = 3.4;
    if (kind === 'bad' && state.phase === 'playing') state.mistakes++;
  }
  function finishGame(won, reason = '') {
    if (state.phase !== 'playing') return;
    cancelPointer();
    state.phase = 'finishing';
    state.finishWait = won ? 1.8 : .8;
    if (won) state.progress = 1;
    const score = won ? Math.max(300, Math.round(1000 + state.remaining * 8 - state.mistakes * 45)) : Math.round(state.progress * 600);
    state.result = { won, reason, score, seconds: Math.ceil(state.elapsed), progress: state.progress, stars: won ? (state.mistakes === 0 ? 3 : state.mistakes <= 2 ? 2 : 1) : 0 };
    if (won) {
      const previous = records[state.id] || {};
      records[state.id] = { wins: (Number(previous.wins) || 0) + 1, best: Math.max(Number(previous.best) || 0, score), stars: Math.max(Number(previous.stars) || 0, state.result.stars) };
      try { localStorage.setItem('giant-cure-records-v1', JSON.stringify(records)); } catch { /* Private/offline browsers may disallow storage; play remains available. */ }
      feedback('治疗完成 · 你听见世界苏醒的声音了吗？', 'good');
      for (let i = 0; i < 5; i++) spawnParticles(130 + i * 115, 600 + Math.sin(i) * 95, ['#a3c797', '#d2b96d', '#f0d2aa'][i % 3], 18);
      playSound('win');
    } else { feedback('世界在等你。休息一下，再来一次。', 'bad'); playSound('lose'); }
    updateStats();
  }
  function showResult() {
    const r = state.result, info = cases[state.id];
    state.phase = 'result';
    $('result-kicker').textContent = r.won ? 'A WORLD REBORN' : 'A LITTLE MORE CARE';
    $('result-case').textContent = `CASE ${info.number} / ${info.world}`;
    $('result-emblem').innerHTML = r.won ? caseIcon(state.id) : leafIcon();
    $('result-stars').textContent = r.won ? '✦ '.repeat(r.stars).trim() + ' ✧'.repeat(3 - r.stars) : '✧  ✧  ✧';
    $('result-title').textContent = r.won ? info.successTitle : '再给世界一点时间。';
    $('result-description').textContent = r.won ? info.successText : r.reason;
    $('result-stamp').textContent = r.won ? 'CURED ✓' : 'TO BE CONTINUED';
    $('result-score').textContent = r.score.toLocaleString('en-US');
    $('result-time').innerHTML = `${r.seconds}<span> 秒</span>`;
    $('result-restored').innerHTML = `${Math.round(r.progress * 100)}<span>%</span>`;
    $('result-message').textContent = r.won ? info.poem : '每次尝试，都是对生命的一次靠近。';
    const allCured = order.every(id => records[id] && records[id].wins);
    $('result-next').firstElementChild.textContent = !r.won ? '重新开始这次治疗' : allCured ? '完成巡诊 · 回到病历簿' : '走向下一处生命';
    $('result-next').onclick = !r.won ? () => startGame(state.id) : allCured ? goCases : () => {
      const current = order.indexOf(state.id);
      const next = [...order.slice(current + 1), ...order.slice(0, current + 1)].find(id => !records[id] || !records[id].wins);
      goCases(); openCase(next || order[(current + 1) % 3]);
    };
    showScreen('result');
  }
  function pauseGame() {
    if (state.phase !== 'playing') return;
    cancelPointer(); state.phase = 'paused';
  }
  function showPause() {
    if (state.phase !== 'playing' && state.phase !== 'paused') return;
    pauseGame();
    openDialog('让世界歇一会儿', '<p>风停在树梢，河流等你回来。<br>治疗已暂停，时间不会流逝。</p>', [
      { label: '继续治疗 ↗', primary: true, action: resumeGame },
      { label: '重新治疗这个病例', action: () => startGame(state.id) },
      { label: '返回病历簿', action: goCases }
    ]);
  }
  function resumeGame() { closeModal(); if (state.phase === 'paused') { state.phase = 'playing'; lastFrame = null; } }
  function showHelp() {
    if (state.phase === 'finishing') return;
    const wasPlaying = state.phase === 'playing' || state.phase === 'paused';
    if (wasPlaying) pauseGame();
    openDialog('在微小之处，照顾世界', '<p>巨人沉睡着。他的身体，就是万物赖以生存的奇幻生态。</p>' + order.map(id => `<div class="help-item"><strong>${cases[id].glyph} ${cases[id].title}</strong><p>${cases[id].instruction}</p></div>`).join('') + '<p class="dialog-tip">每次治疗限时 90 秒。可自由选择病例或随机巡诊。完成三次治疗约需 3–5 分钟。声音默认关闭，可点击右上角音符开启。</p>', [
      { label: wasPlaying ? '明白了，继续治疗 ↗' : '明白了 ↗', primary: true, action: wasPlaying ? resumeGame : closeModal }
    ], 'HOW TO CARE');
  }
  function openDialog(title, body, buttons, kicker = 'A MOMENT OF CARE') {
    if ($('modal').hidden) previousFocus = document.activeElement;
    state.modal = true;
    $('dialog-title').textContent = title;
    $('dialog-kicker').textContent = kicker;
    $('dialog-body').innerHTML = body;
    $('dialog-actions').replaceChildren();
    buttons.forEach((item, index) => {
      const button = document.createElement('button');
      button.className = item.primary ? 'primary-button' : index === buttons.length - 1 && buttons.length > 2 ? 'text-button' : 'secondary-button';
      button.textContent = item.label; button.onclick = item.action;
      $('dialog-actions').append(button);
    });
    $('modal').hidden = false;
    for (const id of scenes) $(id).inert = true;
    document.querySelector('.app-header').inert = true;
    $('dialog-actions').firstElementChild.focus({ preventScroll: true });
  }
  function closeModal() {
    $('modal').hidden = true; state.modal = null;
    for (const id of scenes) $(id).inert = false;
    document.querySelector('.app-header').inert = false;
    if (previousFocus && previousFocus.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function cancelPointer() {
    if (pointerId !== null && state.game && state.game.pointerCancel) state.game.pointerCancel();
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
  }
  const toPoint = event => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height }; };
  function acceptsInput() { return state.screen === 'treatment' && state.phase === 'playing' && !state.modal; }
  canvas.addEventListener('pointerdown', event => {
    if (!acceptsInput() || pointerId !== null || event.button > 0) return;
    const p = toPoint(event);
    if (p.x < 36 || p.x > 684 || p.y < 340 || p.y > 960) return;
    event.preventDefault(); pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId); state.game.pointerDown(p);
  });
  canvas.addEventListener('pointermove', event => { if (acceptsInput() && pointerId === event.pointerId) { event.preventDefault(); state.game.pointerMove(toPoint(event)); } });
  canvas.addEventListener('pointerup', event => {
    if (pointerId !== event.pointerId) return;
    if (acceptsInput()) state.game.pointerUp(toPoint(event));
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    pointerId = null;
  });
  canvas.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('lostpointercapture', () => { if (pointerId !== null) cancelPointer(); });
  $('beat').onclick = () => { if (acceptsInput()) state.game.pointerDown({ x: 360, y: 1072 }); };
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape') { event.preventDefault(); if (state.phase === 'playing') showPause(); else if (state.phase === 'paused') resumeGame(); else if (state.modal) closeModal(); }
    if (event.code === 'Space' && state.id === 'heart' && acceptsInput() && !event.repeat) { event.preventDefault(); state.game.pointerDown({ x: 360, y: 1072 }); }
    if (event.key === 'Tab' && state.modal) {
      const buttons = [...$('dialog-actions').querySelectorAll('button')], first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.phase === 'playing') showPause(); });
  $('brand').onclick = () => requestNavigation('home');
  $('begin').onclick = goCases;
  $('case-back').onclick = goHome;
  $('help').onclick = showHelp;
  $('pause').onclick = showPause;
  $('random-case').onclick = () => openCase(order[Math.floor(Math.random() * order.length)]);
  $('retry').onclick = () => startGame(state.id);
  $('result-cases').onclick = goCases;
  document.querySelectorAll('[data-case]').forEach(card => { card.onclick = () => openCase(card.dataset.case); });

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
      const notes = kind === 'win' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'hit' ? [659.25, 880] : kind === 'miss' || kind === 'lose' ? [261.63, 220] : [440];
      notes.forEach((hz, i) => {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        const time = audioContext.currentTime + i * .1;
        oscillator.type = 'sine'; oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.045, time + .015); gain.gain.exponentialRampToValueAtTime(.001, time + .65);
        oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(time); oscillator.stop(time + .7);
      });
    } catch { soundEnabled = false; $('sound').setAttribute('aria-pressed', 'false'); toast('此浏览器暂不支持声音，可继续游玩'); }
  }

  function spawnParticles(x, y, color = '#b8c98f', count = 12) {
    const limit = reducedMotion ? Math.min(3, count) : Math.min(count, 30);
    for (let i = 0; i < limit && particles.length < 170; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 28 + Math.random() * 95;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 35, age: 0, life: .8 + Math.random() * .9, size: 2 + Math.random() * 4, color, leaf: i % 3 === 0 });
    }
  }
  function drawParticles(dt) {
    particles = particles.filter(p => p.age < p.life);
    for (const p of particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 19 * dt;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - p.age / p.life); ctx.fillStyle = p.color; ctx.translate(p.x, p.y); ctx.rotate(p.age * 2);
      ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.leaf ? p.size * .4 : p.size, .4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  function drawPage(time) {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Scattered warm paper flecks and botanical margins, shared by every page.
    ctx.fillStyle = '#c5cdb6';
    for (let i = 0; i < 44; i++) { ctx.globalAlpha = .12 + (i % 4) * .025; const x = (i * 193 + 37) % W, y = (i * 293 + 117) % H; ctx.beginPath(); ctx.arc(x, y, .7 + i % 2 * .3, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (state.screen === 'home' && window.GiantCureCover) window.GiantCureCover.draw(ctx, reducedMotion ? 0 : time, order.filter(id => records[id] && records[id].wins).length / 3);
    if (state.screen === 'cases') drawBotanical(638, 1175, time, .7);
    if (state.screen === 'result') { drawBotanical(79, 651, time, .55); drawBotanical(656, 725, time, .6, -1); }
    if (state.screen === 'treatment' && state.game) { ctx.save(); state.game.draw(ctx, reducedMotion ? 0 : time); ctx.restore(); }
  }
  function drawBotanical(x, y, time, scale = 1, flip = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale * flip, scale); ctx.rotate(Math.sin(time * .4) * .015);
    ctx.strokeStyle = '#b4c4a4'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-20, -30, 12, -85, -12, -130); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1, yy = -15 - i * 19, xx = -4 + Math.sin(i) * 5;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 39 * side, yy - 4, xx + 28 * side, yy - 25); ctx.quadraticCurveTo(xx + 6 * side, yy - 25, xx, yy); ctx.fillStyle = i % 2 ? '#d4dec4' : '#e0e6cf'; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  function frame(now) {
    const raw = lastFrame === null ? 0 : Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now;
    const dt = Math.min(raw, .1);
    if (state.phase === 'playing' && raw > 2) showPause();
    if (state.phase === 'playing') {
      const activeTime = Math.min(raw, state.remaining);
      state.remaining = Math.max(0, state.remaining - activeTime);
      state.elapsed = LIMIT - state.remaining;
      // Advance the simulation by active wall time, including slower mobile frames.
      // Small substeps keep dragging recovery and spawning consistent at any frame rate.
      let pending = activeTime;
      while (pending > 0 && state.phase === 'playing') {
        const step = Math.min(.05, pending);
        state.game.update(step); pending -= step;
      }
      if (state.phase === 'playing' && state.remaining <= 0) finishGame(false, '时间到了。世界的恢复需要耐心，试着再来一次。');
      updateStats();
      state.feedbackTime -= dt;
      if (state.feedbackTime <= 0) { $('game-feedback').textContent = cases[state.id].instruction; $('game-feedback').dataset.kind = 'info'; }
    } else if (state.phase === 'finishing') {
      state.game.update(Math.min(raw, 2)); state.finishWait -= raw;
      if (state.finishWait <= 0) showResult();
    }
    drawPage(now / 1000);
    drawParticles(state.phase === 'paused' ? 0 : dt);
    requestAnimationFrame(frame);
  }

  function caseIcon(id) {
    const base = '<svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    const back = '<ellipse cx="60" cy="66" rx="55" ry="55" fill="#e8edde"/><path d="M14 92Q50 109 105 91" stroke="#c7d4b9"/><circle cx="96" cy="28" r="3" fill="#c2a96e"/><path d="M16 29v8m-4-4h8" stroke="#b3c49d"/>';
    const art = id === 'blood' ? '<path d="M52 19C80 34 27 49 57 67s28 28 7 47" stroke="#c3d5bd" stroke-width="27"/><path d="M52 19C80 34 27 49 57 67s28 28 7 47" stroke="#90b7a8" stroke-width="18"/><path d="M53 22C80 36 33 51 59 66s25 29 7 45" stroke="#e0ead6" stroke-width="2" stroke-dasharray="9 8"/><path d="m56 58 13-6 13 7-3 12-14 4-12-8Z" fill="#c58b79" stroke="#b87a6a"/><path d="M24 72V43m0 18c-16 0-15-14-15-14 14-1 15 14 15 14Zm0-8c15-1 16-13 16-13-16-2-16 13-16 13Z" fill="#a0ba91" stroke="#819f78"/><path d="M95 97V73m0 12c-12-2-13-11-13-11 12-2 13 11 13 11Z" fill="#adc69a" stroke="#86a67e"/>' : id === 'spore' ? '<path d="M31 99V65m58 35V74" stroke="#8ba782" stroke-width="3"/><path d="M12 69c1-32 39-38 44 0-10 6-33 7-44 0Z" fill="#abb99e"/><path d="M68 77c0-25 35-26 38 0-10 5-27 5-38 0Z" fill="#c5cfac"/><circle cx="29" cy="60" r="4" fill="#e9eedb"/><circle cx="42" cy="66" r="3" fill="#e9eedb"/><path d="M46 96c2-20 26-34 41-28 3 22-17 32-41 28Z" fill="#93b48c" stroke="#7a9e74"/><path d="m47 95 28-18" stroke="#d8e4c6"/><circle cx="74" cy="35" r="13" fill="#b7a8ba"/><path d="m74 17 0-5m17 15 5-2m-10 24 4 4m-28-6-5 3m1-20-5-2" stroke="#a38fa6" stroke-width="3" stroke-linecap="round"/><circle cx="70" cy="32" r="2" fill="#eee8e7"/>' : '<path d="M60 108C8 74 19 33 43 39c11 1 17 12 17 12s7-16 22-12c35 9 12 48-22 69Z" fill="#c7aa8b" opacity=".6"/><path d="M30 91c20-19 40-18 60-2l-5 17H36Z" fill="#a3b68e"/><path d="M39 78V51h15v27m5 1V40h16v39m5 5V58h13v26" fill="#dce2c8" stroke="#8da580" stroke-width="1.5"/><path d="m37 51 10-12 9 12m1-11 10-17 10 17m0 18 10-14 8 14" fill="#81a48b"/><path d="M46 60v5m20-15v6m20 9v5" stroke="#bd9f59" stroke-width="3"/><path d="M18 91h19l6-9 9 19 9-25 8 15h35" stroke="#6e997e" stroke-width="2"/><path d="M67 16v-8m-4 4h8" stroke="#c0a35e"/>';
    return base + back + art + '</svg>';
  }
  function leafIcon() { return '<svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M30 103C12 51 45 23 98 23c3 58-15 88-68 80Z" fill="#cedbc1" stroke="#90aa83" stroke-width="1.5"/><path d="m31 103 48-60m-33 43-6-26m19 10 26-1" stroke="#88a17d" stroke-width="1.5"/><path d="M29 107c-2 7-4 10-9 14" stroke="#88a17d" stroke-width="2"/></svg>'; }
  for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = caseIcon(element.dataset.icon);
  // Read-only diagnostics used by automated input tests and future bug reports.
  window.GiantCure = Object.freeze({ snapshot: () => ({ screen: state.screen, phase: state.phase, id: state.id, progress: state.progress, remaining: state.remaining, elapsed: state.elapsed, mistakes: state.mistakes, modal: !!state.modal, result: state.result ? { ...state.result } : null, game: state.game && state.game.getDebugState ? state.game.getDebugState() : null }) });
  updateRecords();
  requestAnimationFrame(frame);
})();
