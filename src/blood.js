(function () {
  'use strict';

  const AREA = { x: 36, y: 340, w: 648, h: 620 };
  const BANKS = [
    { x: 65, y: 438, w: 132, h: 464, side: -1 },
    { x: 523, y: 438, w: 132, h: 464, side: 1 }
  ];
  const WAVES = [
    [{ y: 495, offset: -10 }, { y: 652, offset: 13 }, { y: 813, offset: -7 }],
    [{ y: 469, offset: 20 }, { y: 619, offset: -20 }, { y: 784, offset: 19 }],
    [{ y: 514, offset: 7 }, { y: 680, offset: -15 }, { y: 847, offset: 11 }]
  ];
  const TOTAL = WAVES.reduce((sum, wave) => sum + wave.length, 0);
  const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = value => 'rgb(' + value.join(',') + ')';
  const riverX = y => 357 + Math.sin((y - 343) / 104) * 83 + Math.sin(y / 61) * 13;

  function roundRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function riverPath(ctx, shift) {
    ctx.beginPath();
    for (let y = AREA.y - 40; y <= AREA.y + AREA.h + 40; y += 5) {
      const x = riverX(y) + (shift || 0);
      if (y === AREA.y - 40) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  function seedRandom(seed) {
    return function () {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function makeScenery() {
    const random = seedRandom(20814);
    return {
      specks: Array.from({ length: 190 }, () => ({
        x: 48 + random() * 624, y: 352 + random() * 596,
        r: 0.4 + random() * 1.1, alpha: 0.03 + random() * 0.08
      })),
      plants: Array.from({ length: 35 }, (_, i) => {
        const left = i % 2 === 0;
        const y = 398 + random() * 520;
        return {
          x: left ? 48 + random() * 30 : 643 + random() * 29,
          y, size: 9 + random() * 15, phase: random() * Math.PI * 2,
          flower: random() > 0.45
        };
      }),
      blooms: Array.from({ length: 25 }, () => ({
        x: random() > 0.5 ? 76 + random() * 108 : 536 + random() * 108,
        y: 487 + random() * 393, phase: random() * Math.PI * 2,
        size: 3 + random() * 4
      })),
      sparks: Array.from({ length: 20 }, () => ({
        x: 70 + random() * 580, y: 405 + random() * 510,
        phase: random() * Math.PI * 2, r: 1 + random() * 2
      }))
    };
  }

  window.GiantCureGames = window.GiantCureGames || {};
  window.GiantCureGames.blood = function createBloodGame(api) {
    const scenery = makeScenery();
    const state = {
      wave: 0, removed: 0, mistakes: 0, clots: [], dragging: null,
      dragStart: null, dragOffset: null, dragDistance: 0,
      transition: 0, healTimer: -1, life: 0, healthFlash: 0,
      finished: false, displayProgress: 0, floating: [], lastTime: 0
    };

    function task() {
      api.setTask('拖走血栓 · ' + state.removed + '/' + TOTAL + '　河流耐受 ' + (5 - state.mistakes) + '/5');
    }

    function activateWave(index) {
      state.wave = index;
      state.clots = WAVES[index].map((item, i) => {
        const x = riverX(item.y) + item.offset;
        return {
          id: index * 3 + i, x, y: item.y, homeX: x, homeY: item.y,
          radius: 36 + (i % 2) * 3, phase: i * 1.7 + index,
          born: 0, returning: false, removed: false
        };
      });
      task();
    }

    function insideBank(p) {
      return BANKS.some(bank =>
        p.x >= bank.x + 5 && p.x <= bank.x + bank.w - 5 &&
        p.y >= bank.y + 10 && p.y <= bank.y + bank.h - 10
      );
    }

    function resetDrag(clot) {
      if (clot) clot.returning = true;
      state.dragging = null;
      state.dragStart = null;
      state.dragOffset = null;
      state.dragDistance = 0;
    }

    function release(p, cancelled) {
      const clot = state.dragging;
      if (!clot || state.finished) return;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pointerMove(p);
      const moved = state.dragDistance > 15;
      if (!cancelled && moved && insideBank(clot)) {
        clot.removed = true;
        state.removed += 1;
        state.floating.push({ x: clot.x, y: clot.y, age: 0, text: '河流舒畅了', good: true });
        api.progress(state.removed / TOTAL);
        api.feedback('血栓已化作养分 · ' + state.removed + '/' + TOTAL, 'good');
        api.effect(clot.x, clot.y, '#d9bf78', 20);
        api.sound('hit');
        resetDrag(null);
        task();
        if (state.removed === TOTAL) {
          state.healTimer = 1.6;
          state.finished = true;
          api.feedback('河流重新流动，生命正在归来', 'good');
          api.success();
        } else if (state.clots.every(item => item.removed)) {
          state.transition = 1.25;
          api.feedback('支流已经疏通 · 继续清理下游', 'good');
        }
        return;
      }
      resetDrag(clot);
      if (cancelled || !moved) return;
      state.mistakes += 1;
      state.healthFlash = 0.6;
      state.floating.push({ x: clot.x, y: clot.y - 30, age: 0, text: '请移到发光草地', good: false });
      api.feedback('放到两侧的发光草地上，河水才不会再次淤堵', 'bad');
      api.sound('miss');
      task();
      if (state.mistakes >= 5) {
        state.finished = true;
        api.fail('河道受到过多扰动。下次把血栓放在两侧发光草地上。');
      }
    }

    function pointerDown(p) {
      if (state.finished || state.dragging || state.transition > 0 || state.healTimer >= 0) return;
      const hit = state.clots.slice().reverse().find(clot =>
        !clot.removed && Math.hypot(p.x - clot.x, p.y - clot.y) <= clot.radius + 15
      );
      if (!hit) return;
      hit.returning = false;
      state.dragging = hit;
      state.dragStart = { x: p.x, y: p.y };
      state.dragOffset = { x: hit.x - p.x, y: hit.y - p.y };
      state.dragDistance = 0;
    }

    function pointerMove(p) {
      const clot = state.dragging;
      if (!clot || state.finished) return;
      state.dragDistance = Math.max(state.dragDistance, Math.hypot(p.x - state.dragStart.x, p.y - state.dragStart.y));
      clot.x = clamp(p.x + state.dragOffset.x, AREA.x + clot.radius + 6, AREA.x + AREA.w - clot.radius - 6);
      clot.y = clamp(p.y + state.dragOffset.y, AREA.y + clot.radius + 12, AREA.y + AREA.h - clot.radius - 8);
    }

    function update(dt) {
      state.life += dt;
      state.healthFlash = Math.max(0, state.healthFlash - dt);
      state.displayProgress += (state.removed / TOTAL - state.displayProgress) * Math.min(1, dt * 2);
      state.clots.forEach(clot => {
        clot.born = Math.min(1, clot.born + dt * 2);
        if (clot.returning) {
          const ease = Math.min(1, dt * 13);
          clot.x += (clot.homeX - clot.x) * ease;
          clot.y += (clot.homeY - clot.y) * ease;
          if (Math.hypot(clot.homeX - clot.x, clot.homeY - clot.y) < 0.8) {
            clot.x = clot.homeX;
            clot.y = clot.homeY;
            clot.returning = false;
          }
        }
      });
      state.floating.forEach(item => { item.age += dt; });
      state.floating = state.floating.filter(item => item.age < 1.5);
      // The host freezes the deadline on success and keeps drawing the recovery.
      if (state.finished) {
        if (state.healTimer >= 0) state.healTimer = Math.max(0, state.healTimer - dt);
        return;
      }
      if (state.transition > 0) {
        state.transition -= dt;
        if (state.transition <= 0) activateWave(state.wave + 1);
      }
    }

    function drawPlant(ctx, plant, time, recovery) {
      ctx.save();
      ctx.translate(plant.x, plant.y);
      ctx.rotate(Math.sin(time * 0.7 + plant.phase) * 0.05);
      const growth = 0.62 + recovery * 0.38;
      ctx.scale(growth, growth);
      ctx.strokeStyle = rgb(mix([139, 153, 121], [68, 125, 93], recovery));
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.quadraticCurveTo(-4, -9, 0, -plant.size * 1.5); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const y = -i * plant.size * 0.33;
        for (const side of [-1, 1]) {
          ctx.fillStyle = rgb(mix([151, 165, 133], [108, 160, 115], recovery));
          ctx.beginPath();
          ctx.ellipse(side * plant.size * 0.25, y - plant.size * 0.28, plant.size * 0.38, plant.size * 0.14, side * -0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (plant.flower && recovery > 0.12) drawFlower(ctx, 0, -plant.size * 1.5, 4 * recovery, plant.phase);
      ctx.restore();
    }

    function drawFlower(ctx, x, y, size, phase) {
      ctx.fillStyle = phase > Math.PI ? '#f5e8c4' : '#f0c6b0';
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 0.4 + phase;
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * size * 0.64, y + Math.sin(a) * size * 0.64, size * 0.62, size * 0.4, a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#c1a66b';
      ctx.beginPath(); ctx.arc(x, y, size * 0.3, 0, Math.PI * 2); ctx.fill();
    }

    function drawBanks(ctx, time, recovery) {
      BANKS.forEach(bank => {
        const active = state.dragging && insideBank(state.dragging) &&
          state.dragging.x >= bank.x && state.dragging.x <= bank.x + bank.w;
        const glow = ctx.createRadialGradient(bank.x + bank.w / 2, bank.y + bank.h / 2, 20, bank.x + bank.w / 2, bank.y + bank.h / 2, bank.h * 0.6);
        glow.addColorStop(0, 'rgba(247,233,174,' + (active ? 0.65 : 0.27) + ')');
        glow.addColorStop(1, 'rgba(247,233,174,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(bank.x - 22, bank.y - 30, bank.w + 44, bank.h + 60);
        roundRect(ctx, bank.x, bank.y, bank.w, bank.h, 58);
        ctx.fillStyle = active ? 'rgba(225,235,184,.78)' : 'rgba(208,225,188,.52)';
        ctx.fill();
        ctx.strokeStyle = active ? '#f9e2a0' : 'rgba(246,238,200,.9)';
        ctx.lineWidth = active ? 4 : 2;
        ctx.setLineDash([5, 8]);
        ctx.lineDashOffset = -time * 8;
        ctx.stroke();
        ctx.setLineDash([]);
        const cx = bank.x + bank.w / 2;
        ctx.fillStyle = '#537b59';
        ctx.font = '600 19px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('养分草地', cx, bank.y + 41);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#6e966a';
        ctx.font = '15px ' + FONT;
        ctx.fillText('拖到这里', cx, bank.y + bank.h - 27);
        ctx.globalAlpha = 1;
        const sy = bank.y + bank.h * 0.48;
        ctx.strokeStyle = '#75955f';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(cx, sy + 21); ctx.quadraticCurveTo(cx - 3, sy - 1, cx + 1, sy - 20); ctx.stroke();
        ctx.fillStyle = '#86a573';
        ctx.beginPath(); ctx.ellipse(cx - 10, sy + 1, 13, 6, 0.58, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 10, sy - 10, 13, 6, -0.58, 0, Math.PI * 2); ctx.fill();
        if (active) {
          ctx.fillStyle = '#496f54';
          ctx.font = '700 20px ' + FONT;
          ctx.fillText('松手滋养', cx, sy + 60);
        }
      });
      scenery.blooms.forEach((bloom, index) => {
        const growth = clamp(recovery * 1.6 - index / scenery.blooms.length * 0.6, 0, 1);
        if (growth > 0) drawFlower(ctx, bloom.x, bloom.y + Math.sin(time + bloom.phase) * 1.1, bloom.size * growth, bloom.phase);
      });
    }

    function drawClot(ctx, clot, time) {
      if (clot.removed) return;
      const dragging = state.dragging === clot;
      const r = clot.radius;
      const scale = (0.7 + 0.3 * clot.born) * (dragging ? 1.09 : 1);
      ctx.save();
      ctx.translate(clot.x, clot.y + (dragging ? -3 : Math.sin(time * 1.3 + clot.phase) * 1.7));
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.min(1, clot.born * 2);
      ctx.fillStyle = dragging ? 'rgba(58,66,48,.16)' : 'rgba(97,62,56,.18)';
      ctx.beginPath(); ctx.ellipse(3, r * 0.63, r * 1.08, r * 0.45, -0.12, 0, Math.PI * 2); ctx.fill();
      if (dragging) {
        ctx.strokeStyle = '#f6e5a9'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, Math.PI * 2); ctx.stroke();
      }
      const points = [];
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2;
        const rr = r * (0.9 + Math.sin(i * 2.4 + clot.phase) * 0.09);
        points.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.91 });
      }
      const fill = ctx.createLinearGradient(-r, -r, r, r);
      fill.addColorStop(0, '#bc8b83'); fill.addColorStop(0.45, '#a37173'); fill.addColorStop(1, '#875b63');
      ctx.fillStyle = fill; ctx.strokeStyle = '#774f5a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo((points[0].x + points[8].x) / 2, (points[0].y + points[8].y) / 2);
      points.forEach((point, i) => {
        const next = points[(i + 1) % points.length];
        ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
      });
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(246,211,173,.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.47, -r * 0.26); ctx.quadraticCurveTo(-r * 0.2, -r * 0.67, r * 0.26, -r * 0.44); ctx.stroke();
      ctx.strokeStyle = 'rgba(100,63,70,.44)'; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.1); ctx.lineTo(r * 0.1, r * 0.1); ctx.lineTo(0, r * 0.42); ctx.moveTo(r * 0.1, r * 0.1); ctx.lineTo(r * 0.39, r * 0.03); ctx.stroke();
      ctx.fillStyle = '#f6dec0';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc((i - 1) * 8, -2, 1.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    function draw(ctx, time) {
      state.lastTime = time;
      const recovery = state.displayProgress;
      ctx.save();
      roundRect(ctx, AREA.x, AREA.y, AREA.w, AREA.h, 30);
      ctx.fillStyle = '#e8ebd8'; ctx.fill();
      ctx.clip();
      const ground = ctx.createLinearGradient(0, AREA.y, 0, AREA.y + AREA.h);
      ground.addColorStop(0, rgb(mix([222, 225, 204], [211, 232, 200], recovery)));
      ground.addColorStop(0.6, rgb(mix([222, 229, 209], [227, 239, 208], recovery)));
      ground.addColorStop(1, '#eae8d1');
      ctx.fillStyle = ground; ctx.fillRect(AREA.x, AREA.y, AREA.w, AREA.h);
      scenery.specks.forEach(speck => {
        ctx.fillStyle = 'rgba(75,100,70,' + speck.alpha + ')';
        ctx.beginPath(); ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      riverPath(ctx); ctx.strokeStyle = 'rgba(102,124,87,.13)'; ctx.lineWidth = 173; ctx.stroke();
      riverPath(ctx); ctx.strokeStyle = '#eee5cd'; ctx.lineWidth = 158; ctx.stroke();
      riverPath(ctx); ctx.strokeStyle = rgb(mix([177, 138, 130], [215, 146, 124], recovery)); ctx.lineWidth = 140; ctx.stroke();
      riverPath(ctx); ctx.strokeStyle = rgb(mix([190, 152, 140], [233, 172, 145], recovery)); ctx.lineWidth = 125; ctx.stroke();
      riverPath(ctx, -17); ctx.strokeStyle = 'rgba(249,216,179,' + (0.12 + recovery * 0.22) + ')'; ctx.lineWidth = 39; ctx.stroke();
      // Narrow travelling strokes make the direction and the restored current legible.
      for (let i = 0; i < 24; i++) {
        const y = AREA.y + ((i * 34 + time * (8 + recovery * 37)) % (AREA.h + 80)) - 40;
        const offset = Math.sin(i * 2.7) * 42;
        ctx.strokeStyle = 'rgba(255,238,205,' + (0.18 + recovery * 0.45) + ')';
        ctx.lineWidth = i % 3 === 0 ? 3 : 1.7;
        ctx.beginPath();
        ctx.moveTo(riverX(y) + offset, y);
        ctx.quadraticCurveTo(riverX(y + 9) + offset + 4, y + 9, riverX(y + 18) + offset, y + 18);
        ctx.stroke();
      }
      drawBanks(ctx, time, recovery);
      scenery.plants.forEach(plant => drawPlant(ctx, plant, time, recovery));
      // Two little islands and their moss provide scale without obscuring interaction.
      [{ y: 567, offset: 49 }, { y: 734, offset: -49 }].forEach((island, i) => {
        const x = riverX(island.y) + island.offset;
        ctx.fillStyle = '#d8d9b8';
        ctx.beginPath(); ctx.ellipse(x, island.y, 17, 10, 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgb(mix([150, 161, 125], [103, 155, 108], recovery));
        ctx.beginPath(); ctx.ellipse(x - 2, island.y - 3, 13, 7, 0.45, 0, Math.PI * 2); ctx.fill();
        if (recovery > 0.2) drawFlower(ctx, x - 3, island.y - 9, 4 * recovery, i * 4);
      });
      scenery.sparks.forEach(spark => {
        const glow = (Math.sin(time * 1.6 + spark.phase) * 0.5 + 0.5) * recovery;
        if (glow < 0.01) return;
        ctx.fillStyle = 'rgba(255,245,189,' + glow * 0.8 + ')';
        ctx.beginPath(); ctx.arc(spark.x + Math.sin(time * 0.5 + spark.phase) * 8, spark.y - Math.sin(time * 0.7 + spark.phase) * 9, spark.r, 0, Math.PI * 2); ctx.fill();
      });
      // The quiet top label stays within the scene and is never an input target.
      roundRect(ctx, 224, 360, 272, 46, 23);
      ctx.fillStyle = 'rgba(249,247,232,.91)'; ctx.fill();
      ctx.fillStyle = '#537668'; ctx.textAlign = 'center'; ctx.font = '600 19px ' + FONT;
      ctx.fillText(state.healTimer >= 0 ? '生命之河 · 重获新生' : '第 ' + (state.wave + 1) + ' 段河道  /  3', 360, 390);
      ctx.fillStyle = '#617e67'; ctx.font = '15px ' + FONT;
      ctx.textAlign = 'right'; ctx.fillText('河道耐受', 328, 429);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(345 + i * 20, 424, 6.5, 4.4, -0.6, 0, Math.PI * 2);
        ctx.fillStyle = i < 5 - state.mistakes ? '#6f9678' : '#d6ada1';
        ctx.fill();
      }
      state.clots.filter(clot => clot !== state.dragging).forEach(clot => drawClot(ctx, clot, time));
      if (state.dragging) drawClot(ctx, state.dragging, time);
      if (state.removed === 0 && !state.dragging && state.life < 10) {
        const clot = state.clots[0];
        const pulse = Math.sin(time * 3) * 3;
        ctx.strokeStyle = '#fbebbe'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(clot.x, clot.y, clot.radius + 12 + pulse, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#755b51'; ctx.font = '600 18px ' + FONT; ctx.textAlign = 'center';
        ctx.fillText('按住石块，拖向草地', 360, 936);
      }
      if (state.transition > 0) {
        ctx.fillStyle = 'rgba(247,245,223,.82)';
        roundRect(ctx, 236, 622, 248, 60, 24); ctx.fill();
        ctx.fillStyle = '#52725b'; ctx.font = '600 20px ' + FONT; ctx.textAlign = 'center';
        ctx.fillText('正在查看下一段河道…', 360, 660);
      }
      state.floating.forEach(item => {
        ctx.globalAlpha = Math.max(0, 1 - item.age / 1.5);
        ctx.fillStyle = item.good ? '#4a725b' : '#8e514d';
        ctx.font = '700 20px ' + FONT; ctx.textAlign = 'center';
        const x = clamp(item.x, 145, 575);
        ctx.fillText(item.text, x, item.y - 38 - item.age * 24);
      });
      ctx.globalAlpha = 1;
      if (state.healthFlash > 0) {
        ctx.strokeStyle = 'rgba(174,101,89,' + state.healthFlash * 0.7 + ')';
        ctx.lineWidth = 8;
        roundRect(ctx, AREA.x + 4, AREA.y + 4, AREA.w - 8, AREA.h - 8, 26); ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      roundRect(ctx, AREA.x, AREA.y, AREA.w, AREA.h, 30);
      ctx.strokeStyle = 'rgba(77,111,91,.25)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }

    activateWave(0);
    api.progress(0);
    return {
      update, draw, pointerDown, pointerMove,
      pointerUp: p => release(p, false),
      pointerCancel: () => release(null, true),
      getDebugState: () => ({
        type: 'blood', wave: state.wave + 1, removed: state.removed, total: TOTAL,
        mistakes: state.mistakes, health: 5 - state.mistakes, finished: state.finished,
        transition: state.transition, healing: state.healTimer >= 0,
        draggingId: state.dragging ? state.dragging.id : null,
        banks: BANKS.map(bank => ({ x: bank.x, y: bank.y, w: bank.w, h: bank.h })),
        clots: state.clots.filter(clot => !clot.removed).map(clot => ({
          id: clot.id, x: clot.x, y: clot.y, radius: clot.radius,
          returning: clot.returning
        }))
      })
    };
  };
})();
