/* Spore meadow — all coordinates use the shared 720 × 1280 canvas. */
(function () {
  'use strict';
  const registry = window.GiantCureGames = window.GiantCureGames || {};
  const BOX = { x: 36, y: 340, w: 648, h: 620 };
  const GOAL = 22;
  const COLORS = { green: '#346e60', mint: '#b5d6b0', ink: '#2c534c', bad: '#8c789a', gold: '#c1a66b' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = c => `rgb(${c.join(',')})`;

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function ellipse(ctx, x, y, rx, ry, color, angle = 0) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); ctx.fill();
  }
  function label(ctx, text, x, y, size, color, weight = '500') {
    ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }
  function heart(ctx, x, y, full) {
    ctx.save(); ctx.translate(x, y); ctx.scale(.8, .8);
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-22, -7, -18, -24, -7, -19);
    ctx.bezierCurveTo(-2, -18, 0, -14, 0, -14); ctx.bezierCurveTo(12, -31, 30, -11, 0, 6);
    ctx.fillStyle = full ? COLORS.green : '#d6dbcd'; ctx.fill(); ctx.restore();
  }

  registry.spore = function createSporeGame(api) {
    let elapsed = 0, removed = 0, health = 5, finished = false, nextId = 1;
    let nextBad = 1.0, nextGood = 9.1, hurtTimer = 0;
    let targets = [], bursts = [];
    let displayProgress = 0;
    let seed = 91207;
    function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    const flowers = Array.from({ length: 29 }, (_, i) => ({
      x: 58 + random() * 604, y: 734 + random() * 151, phase: random() * 6.28,
      size: 5 + random() * 6, at: i / 32, tint: i % 3
    }));
    const motes = Array.from({ length: 25 }, () => ({ x: random() * 648, y: random() * 500, p: random() * 6.28 }));

    api.progress(0);
    api.setTask('净化 22 颗紫色孢子 · 保护绿叶精灵');

    function position(target) {
      const alive = elapsed - target.born;
      return { x: target.x + Math.sin(alive * .9 + target.phase) * 8,
        y: target.y + Math.sin(alive * 1.25 + target.phase) * 9 };
    }
    function spawn(kind) {
      // Large, well separated targets remain easy to select with a finger.
      let point, bestPoint = { x: 360, y: 620 }, bestDistance = -1;
      for (let i = 0; i < 45; i++) {
        point = { x: 108 + random() * 504, y: 463 + random() * 355 };
        const distance = targets.reduce((d, t) => {
          const p = position(t); return Math.min(d, Math.hypot(p.x - point.x, p.y - point.y));
        }, 1000);
        if (distance > bestDistance) { bestDistance = distance; bestPoint = point; }
        if (distance > 145) break;
      }
      if (bestDistance < 128) return false;
      targets.push({ id: nextId++, kind, x: bestPoint.x, y: bestPoint.y,
        born: elapsed, lifetime: kind === 'bad' ? (elapsed < 8 ? 11 : 8.8) : 6.3,
        phase: random() * Math.PI * 2, radius: 52 });
      return true;
    }
    function damage(text, point) {
      health--; hurtTimer = .7;
      api.feedback(text, 'bad'); api.sound('miss');
      api.effect(point.x, point.y, '#9b7d9e', 14);
      if (health <= 0) {
        finished = true;
        api.fail('森林生机暂时不足。只点紫色「感染」孢子，保护绿叶精灵。');
      }
    }
    function update(dt) {
      if (finished) return;
      elapsed += dt; hurtTimer = Math.max(0, hurtTimer - dt);
      displayProgress += (removed / GOAL - displayProgress) * Math.min(1, dt * 2.7);
      bursts = bursts.filter(b => (b.age += dt) < .7);
      for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i];
        if (elapsed - target.born >= target.lifetime) {
          targets.splice(i, 1);
          if (target.kind === 'bad') {
            damage('孢子逸散 · 生机 −1', position(target));
            if (finished) return;
          }
        }
      }
      if (elapsed >= nextBad) {
        nextBad = elapsed + (spawn('bad') ? 3.3 : .45);
      }
      if (elapsed >= nextGood) {
        nextGood = elapsed + (spawn('good') ? 5.1 : .65);
      }
    }

    function drawEnvironment(ctx, time) {
      const p = displayProgress;
      const sky = ctx.createLinearGradient(0, BOX.y, 0, BOX.y + BOX.h);
      sky.addColorStop(0, rgb(mix([207, 209, 199], [218, 235, 208], p)));
      sky.addColorStop(.58, rgb(mix([176, 189, 177], [173, 215, 180], p)));
      sky.addColorStop(1, rgb(mix([152, 173, 149], [112, 176, 136], p)));
      ctx.fillStyle = sky; ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);

      // The forest is made of soft concentric canopies, roots and rolling moss.
      for (let depth = 0; depth < 3; depth++) {
        const n = depth === 0 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const x = 55 + i * (680 / n) + Math.sin(i * 3) * 20;
          const y = 520 + depth * 54 + Math.sin(i * 2.2) * 42;
          const color = rgb(mix([139 + depth * 7, 159 + depth * 6, 143 + depth * 6],
            [105 + depth * 17, 163 + depth * 15, 133 + depth * 12], p));
          ctx.globalAlpha = .37 + depth * .05;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.moveTo(x - 53, 853); ctx.quadraticCurveTo(x - 17, y + 55, x - 18, y);
          ctx.lineTo(x + 18, y); ctx.quadraticCurveTo(x + 11, y + 150, x + 60, 853); ctx.closePath(); ctx.fill();
          ellipse(ctx, x, y, 87 - depth * 8, 104 - depth * 9, color);
          ellipse(ctx, x - 41, y + 22, 53, 71, color, -.35);
          ellipse(ctx, x + 37, y + 13, 61, 73, color, .4);
        }
      }
      ctx.globalAlpha = 1;
      const glow = ctx.createRadialGradient(366, 537, 10, 366, 537, 390);
      glow.addColorStop(0, `rgba(255,251,207,${.15 + p * .44})`); glow.addColorStop(1, 'rgba(255,249,218,0)');
      ctx.fillStyle = glow; ctx.fillRect(36, 340, 648, 620);

      // A ribbon of light guides the eye into the meadow.
      ctx.fillStyle = `rgba(243,243,211,${.17 + p * .16})`;
      ctx.beginPath(); ctx.moveTo(312, 621); ctx.bezierCurveTo(431, 726, 177, 766, 399, 960);
      ctx.lineTo(614, 960); ctx.bezierCurveTo(281, 755, 455, 718, 348, 621); ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = rgb(mix([132 - i * 5, 161 - i * 4, 136 - i * 5], [120 - i * 10, 180 - i * 5, 130 - i * 4], p));
        ctx.beginPath(); ctx.moveTo(36, 837 + i * 26);
        ctx.bezierCurveTo(195, 755 + i * 31, 420, 943 - i * 25, 684, 811 + i * 33);
        ctx.lineTo(684, 960); ctx.lineTo(36, 960); ctx.fill();
      }

      flowers.forEach(f => {
        const growth = clamp((p - f.at) * 6, 0, 1);
        if (growth <= 0) return;
        const sway = Math.sin(time * 1.3 + f.phase) * 4;
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(growth, growth);
        ctx.strokeStyle = '#527d58'; ctx.lineWidth = 2.1;
        ctx.beginPath(); ctx.moveTo(0, 15); ctx.quadraticCurveTo(-2, 0, sway, -13); ctx.stroke();
        ellipse(ctx, -5, 5, 7, 3, '#8cb273', -.4); ellipse(ctx, 5, 0, 6, 3, '#719e69', .5);
        for (let k = 0; k < 5; k++) {
          const a = k * Math.PI * 2 / 5;
          ellipse(ctx, sway + Math.cos(a) * f.size * .58, -13 + Math.sin(a) * f.size * .58,
            f.size * .6, f.size * .4, ['#f5e6ba', '#e4bdba', '#f6f2d7'][f.tint], a);
        }
        ellipse(ctx, sway, -13, 2.9, 2.9, '#c1a66b'); ctx.restore();
      });
      motes.forEach((m, i) => {
        const x = 36 + (m.x + Math.sin(time * .25 + m.p) * 18 + 648) % 648;
        const y = 405 + (m.y - time * (2 + i % 4) + 5000) % 455;
        ctx.globalAlpha = (.25 + Math.sin(time + m.p) * .13) * (.3 + p * .7);
        ellipse(ctx, x, y, i % 3 === 0 ? 2.7 : 1.6, i % 3 === 0 ? 2.7 : 1.6, '#fff8cd');
      });
      ctx.globalAlpha = 1;

      // Two foreground saplings frame the play field without hiding its targets.
      for (const side of [0, 1]) {
        ctx.save(); ctx.translate(side ? 680 : 40, 906); ctx.scale(side ? -1 : 1, 1);
        ctx.strokeStyle = '#5c8263'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, 20); ctx.quadraticCurveTo(30, -42, 16, -131); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const y = -i * 19, sx = i % 2 ? 1 : -1;
          ellipse(ctx, 18 + sx * 10, y - 10, 19, 7, p > .4 ? '#91b47c' : '#8b9e80', sx * -.7);
        }
        ctx.restore();
      }
    }

    function drawBad(ctx, target, time) {
      const alive = elapsed - target.born;
      const p = position(target);
      const appear = Math.min(1, alive / .3);
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(appear, appear);
      ellipse(ctx, 0, 51, 38, 8, 'rgba(55,77,57,.13)');
      const aura = ctx.createRadialGradient(0, 0, 14, 0, 0, 63);
      aura.addColorStop(0, 'rgba(162,132,179,.3)'); aura.addColorStop(1, 'rgba(162,132,179,0)');
      ctx.fillStyle = aura; ctx.fillRect(-65, -65, 130, 130);
      ctx.strokeStyle = '#82708f'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + Math.sin(time + target.phase) * .08;
        const x = Math.cos(a), y = Math.sin(a);
        ctx.beginPath(); ctx.moveTo(x * 31, y * 31); ctx.lineTo(x * 44, y * 44); ctx.stroke();
        ellipse(ctx, x * 45, y * 45, 4.2, 4.2, '#9a87a7');
      }
      const body = ctx.createRadialGradient(-11, -15, 3, 0, 0, 38);
      body.addColorStop(0, '#b9a6c6'); body.addColorStop(1, '#8c789a');
      ellipse(ctx, 0, 0, 35, 35, body);
      ctx.strokeStyle = '#776686'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 35, 0, Math.PI * 2); ctx.stroke();
      ellipse(ctx, -14, -16, 8, 5, 'rgba(255,248,255,.27)', -.6);
      ellipse(ctx, -11, -2, 3, 4, '#574d64'); ellipse(ctx, 11, -2, 3, 4, '#574d64');
      ctx.strokeStyle = '#695b75'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, 10); ctx.lineTo(0, 7); ctx.lineTo(5, 10); ctx.stroke();
      roundRect(ctx, -29, 24, 58, 26, 13); ctx.fillStyle = '#f5eff7'; ctx.fill();
      label(ctx, '感染', 0, 37, 16, '#796386', '700');
      const remain = target.lifetime - alive;
      if (remain < 2.5) {
        ctx.strokeStyle = '#ba7c77'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(0, 0, 56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain / 2.5); ctx.stroke();
      }
      ctx.restore();
    }

    function drawGood(ctx, target, time) {
      const p = position(target), appear = Math.min(1, (elapsed - target.born) / .35);
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(appear, appear);
      ellipse(ctx, 0, 52, 36, 7, 'rgba(55,77,57,.11)');
      const flap = Math.sin(time * 5 + target.phase) * .15;
      ellipse(ctx, -26, -3, 21, 12, 'rgba(248,251,219,.72)', -.5 + flap);
      ellipse(ctx, 26, -3, 21, 12, 'rgba(248,251,219,.72)', .5 - flap);
      const body = ctx.createLinearGradient(-24, -32, 26, 38);
      body.addColorStop(0, '#d5e9b5'); body.addColorStop(1, '#79ad83');
      ellipse(ctx, 0, 4, 29, 33, body);
      ctx.strokeStyle = '#6b9973'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 4, 29, 33, 0, 0, 6.29); ctx.stroke();
      ellipse(ctx, -10, -34, 19, 9, '#79a66f', .5); ellipse(ctx, 9, -39, 20, 9, '#9abd7e', -.7);
      ctx.strokeStyle = '#4c7854'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(19, -46); ctx.stroke();
      ellipse(ctx, -10, 0, 2.8, 3.5, '#3f7056'); ellipse(ctx, 10, 0, 2.8, 3.5, '#3f7056');
      ctx.strokeStyle = '#4f7f58'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 7, 5.5, .15, Math.PI - .15); ctx.stroke();
      ellipse(ctx, -18, 8, 4.5, 2.5, '#e4c6a7'); ellipse(ctx, 18, 8, 4.5, 2.5, '#e4c6a7');
      roundRect(ctx, -29, 28, 58, 26, 13); ctx.fillStyle = '#f5f6df'; ctx.fill();
      label(ctx, '守护', 0, 41, 16, COLORS.green, '700'); ctx.restore();
    }

    function draw(ctx, time) {
      ctx.save(); roundRect(ctx, BOX.x, BOX.y, BOX.w, BOX.h, 30); ctx.clip();
      drawEnvironment(ctx, time);
      // Scene status is readable while the main HUD handles time and total score.
      roundRect(ctx, 58, 357, 604, 63, 20); ctx.fillStyle = 'rgba(249,248,232,.87)'; ctx.fill();
      label(ctx, '森林生机', 122, 380, 17, COLORS.green, '600');
      for (let i = 0; i < 5; i++) heart(ctx, 212 + i * 31, 391, i < health);
      label(ctx, `${removed} / ${GOAL}`, 581, 382, 26, COLORS.green, '700');
      label(ctx, '孢子已净化', 580, 405, 12, '#6b8572');

      targets.slice().sort((a, b) => a.y - b.y).forEach(t => t.kind === 'bad' ? drawBad(ctx, t, time) : drawGood(ctx, t, time));
      bursts.forEach(b => {
        ctx.globalAlpha = 1 - b.age / .7;
        ctx.strokeStyle = b.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, 27 + b.age * 72, 0, Math.PI * 2); ctx.stroke();
        label(ctx, b.text, b.x, b.y - b.age * 55, 22, b.color, '700');
      });
      ctx.globalAlpha = 1;
      roundRect(ctx, 92, 903, 536, 38, 19); ctx.fillStyle = 'rgba(248,247,229,.88)'; ctx.fill();
      ellipse(ctx, 120, 922, 8, 8, COLORS.bad); label(ctx, '紫色感染 · 点击净化', 236, 922, 17, '#766581', '600');
      ellipse(ctx, 393, 922, 10, 5, '#76a478', -.5); label(ctx, '绿叶精灵 · 请保护', 507, 922, 17, COLORS.green, '600');
      if (elapsed < 5.8 && removed === 0) {
        roundRect(ctx, 165, 844, 390, 42, 21); ctx.fillStyle = 'rgba(248,247,229,.95)'; ctx.fill();
        label(ctx, '轻点紫色孢子，唤醒这片森林', 360, 865, 19, COLORS.green, '600');
      }
      if (hurtTimer > 0) {
        ctx.fillStyle = `rgba(162,104,121,${hurtTimer * .13})`; ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
      }
      ctx.restore();
      ctx.save(); roundRect(ctx, BOX.x, BOX.y, BOX.w, BOX.h, 30);
      ctx.strokeStyle = 'rgba(79,120,95,.2)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }

    function pointerDown(point) {
      if (finished) return false;
      const hit = targets.filter(t => {
        const p = position(t); return Math.hypot(point.x - p.x, point.y - p.y) <= t.radius;
      }).sort((a, b) => {
        const pa = position(a), pb = position(b);
        return Math.hypot(point.x - pa.x, point.y - pa.y) - Math.hypot(point.x - pb.x, point.y - pb.y);
      })[0];
      if (!hit) return false;
      targets = targets.filter(t => t !== hit);
      const p = position(hit);
      if (hit.kind === 'good') {
        bursts.push({ x: p.x, y: p.y, age: 0, color: '#9f777e', text: '生机 −1' });
        damage('这是守护精灵 · 生机 −1', p);
      } else {
        removed++;
        api.progress(removed / GOAL); api.sound('hit'); api.effect(p.x, p.y, '#e8cf89', 15);
        bursts.push({ x: p.x, y: p.y, age: 0, color: '#f5f2c9', text: '+1 净化' });
        if (removed === 1) api.feedback('做得好！记得保护绿叶精灵', 'good');
        else if (removed % 5 === 0) api.feedback('花朵正重新绽放', 'good');
        if (removed >= GOAL) { finished = true; api.success(); }
      }
      return true;
    }
    return {
      update, draw, pointerDown,
      pointerMove() { return false; }, pointerUp() { return false; },
      getDebugState() {
        return { elapsed, removed, goal: GOAL, health, finished,
          targets: targets.map(t => ({ id: t.id, kind: t.kind, ...position(t), radius: t.radius,
            remaining: t.lifetime - (elapsed - t.born) })) };
      }
    };
  };
})();
