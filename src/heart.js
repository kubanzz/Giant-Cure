(function () {
  'use strict';

  var games = window.GiantCureGames = window.GiantCureGames || {};

  games.heart = function (api) {
    var SCENE = { x: 36, y: 340, w: 648, h: 620 };
    var TRACK = { left: 92, right: 628, y: 825, height: 58 };
    var REQUIRED_HITS = 17;
    var ROUND_SECONDS = 3.8;
    var WARMUP_SECONDS = 3;
    var MAX_MISTAKES = 6;
    var TARGET_HALF_WIDTH = 69;
    var phase = 'warmup';
    var elapsed = 0;
    var warmupElapsed = 0;
    var roundElapsed = 0;
    var roundIndex = 0;
    var roundResolved = false;
    var roundResult = '';
    var hits = 0;
    var mistakes = 0;
    var targetX = 397;
    var hitPulse = 0;
    var errorPulse = 0;
    var announcement = '光点进入金色区域时，轻点一下';
    var announcementTime = 0;
    var motes = Array.from({ length: 27 }, function (_, i) {
      return { x: 73 + ((i * 109) % 574), y: 426 + ((i * 67) % 293), seed: i * 1.71 };
    });

    function call(name) {
      if (typeof api[name] === 'function') {
        api[name].apply(api, Array.prototype.slice.call(arguments, 1));
      }
    }

    function setTask() {
      call('setTask', '在金色安定区按拍 · 已安定 ' + hits + ' / ' + REQUIRED_HITS + ' 次');
    }

    function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

    function mixColor(a, b, t) {
      var aa = parseInt(a.slice(1), 16);
      var bb = parseInt(b.slice(1), 16);
      var red = Math.round((aa >> 16) + ((bb >> 16) - (aa >> 16)) * t);
      var green = Math.round(((aa >> 8) & 255) + (((bb >> 8) & 255) - ((aa >> 8) & 255)) * t);
      var blue = Math.round((aa & 255) + ((bb & 255) - (aa & 255)) * t);
      return 'rgb(' + red + ',' + green + ',' + blue + ')';
    }

    function roundedPath(ctx, x, y, width, height, radius) {
      var r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    }

    function text(ctx, words, x, y, size, color, align, weight) {
      ctx.font = (weight || '500') + ' ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(words, x, y);
    }

    function indicatorX() {
      var position = phase === 'warmup' ? warmupElapsed / WARMUP_SECONDS : roundElapsed / ROUND_SECONDS;
      return TRACK.left + clamp(position, 0, 1) * (TRACK.right - TRACK.left);
    }

    function targetContains(x) { return Math.abs(x - targetX) <= TARGET_HALF_WIDTH; }

    function startNextRound() {
      roundElapsed = 0;
      roundResolved = false;
      roundResult = '';
      // A gentle variation keeps the same rhythm readable without becoming a fixed-position tap.
      targetX = 397 + Math.sin(roundIndex * 1.34) * 44;
    }

    function resolveMistake(message) {
      if (roundResolved || phase !== 'playing') return;
      roundResolved = true;
      roundResult = 'miss';
      mistakes += 1;
      errorPulse = 1;
      announcement = message;
      announcementTime = 1.9;
      call('feedback', message, 'bad');
      call('sound', 'miss');
      if (mistakes >= MAX_MISTAKES) {
        phase = 'failed';
        call('fail', '生命之城有些疲惫了。跟着光点，慢慢再来一次。');
      }
    }

    function update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      elapsed += dt;
      hitPulse = Math.max(0, hitPulse - dt * 1.45);
      errorPulse = Math.max(0, errorPulse - dt * 2.3);
      announcementTime = Math.max(0, announcementTime - dt);
      if (phase === 'success' || phase === 'failed') return;

      var remaining = dt;
      if (phase === 'warmup') {
        var warmupStep = Math.min(remaining, WARMUP_SECONDS - warmupElapsed);
        warmupElapsed += warmupStep;
        remaining -= warmupStep;
        if (warmupElapsed >= WARMUP_SECONDS) {
          phase = 'playing';
          startNextRound();
          call('feedback', '开始了，等光点进入金色区域', 'info');
        }
      }

      while (phase === 'playing' && remaining > 0) {
        var step = Math.min(remaining, ROUND_SECONDS - roundElapsed);
        roundElapsed += step;
        remaining -= step;
        var targetEndTime = ((targetX + TARGET_HALF_WIDTH - TRACK.left) / (TRACK.right - TRACK.left)) * ROUND_SECONDS;
        if (!roundResolved && roundElapsed > targetEndTime) {
          resolveMistake('错过这一拍了，等下一个光点');
        }
        if (roundElapsed >= ROUND_SECONDS - 0.000001 && phase === 'playing') {
          roundIndex += 1;
          startNextRound();
        }
      }
    }

    function pointerDown() {
      if (phase === 'warmup') return;
      if (phase !== 'playing' || roundResolved) return;
      var x = indicatorX();
      if (targetContains(x)) {
        roundResolved = true;
        roundResult = 'hit';
        hits += 1;
        hitPulse = 1;
        announcement = hits >= REQUIRED_HITS ? '心跳归于和谐，生命之城苏醒了' : '稳稳一拍 · 生命正在复苏';
        announcementTime = 2;
        call('progress', hits / REQUIRED_HITS);
        call('feedback', '安定 +' + 1 + ' · ' + hits + ' / ' + REQUIRED_HITS, 'good');
        call('effect', 360, 568, '#c1a66b', 20);
        call('sound', 'hit');
        setTask();
        if (hits >= REQUIRED_HITS) {
          phase = 'success';
          call('effect', 360, 640, '#79b99b', 36);
          call('success');
        }
      } else {
        resolveMistake(x < targetX ? '稍早了一点，下一拍等光点进区' : '稍晚了一点，下一拍再试');
      }
    }

    function drawLeaf(ctx, x, y, length, angle, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-length * 0.72, -length * 0.3, -length * 0.46, -length, 0, -length);
      ctx.bezierCurveTo(length * 0.49, -length * 0.65, length * 0.59, -length * 0.17, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(246,244,232,.45)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(0, -length * 0.84);
      ctx.stroke();
      ctx.restore();
    }

    function flower(ctx, x, y, size, sway, bloom) {
      if (bloom <= 0) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(bloom, bloom);
      ctx.strokeStyle = '#6b9d83';
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(sway * 6, -size * 0.65, sway * 9, -size);
      ctx.stroke();
      drawLeaf(ctx, sway * 3, -size * 0.35, size * 0.4, -0.75, '#88b89b');
      ctx.translate(sway * 9, -size);
      for (var petal = 0; petal < 5; petal += 1) {
        var angle = petal * Math.PI * 2 / 5;
        ctx.fillStyle = petal % 2 ? '#e5aa98' : '#f4c7b2';
        ctx.beginPath();
        ctx.ellipse(Math.sin(angle) * size * 0.17, Math.cos(angle) * size * 0.17, size * 0.15, size * 0.22, -angle, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#c1a66b';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawTower(ctx, x, y, width, height, recovery, tall) {
      var wall = ctx.createLinearGradient(x, y - height, x + width, y);
      wall.addColorStop(0, mixColor('#bbc3be', '#efe9d0', recovery));
      wall.addColorStop(1, mixColor('#9caeaa', '#cbdcb8', recovery));
      ctx.fillStyle = wall;
      roundedPath(ctx, x, y - height, width, height, 10);
      ctx.fill();
      ctx.strokeStyle = mixColor('#8ba09c', '#83a88b', recovery);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = mixColor('#849f9c', '#5b9c80', recovery);
      ctx.beginPath();
      ctx.moveTo(x - 7, y - height + 7);
      ctx.quadraticCurveTo(x + width / 2, y - height - (tall ? 47 : 26), x + width + 7, y - height + 7);
      ctx.quadraticCurveTo(x + width / 2, y - height + 21, x - 7, y - height + 7);
      ctx.fill();
      var windows = Math.max(1, Math.floor((height - 25) / 33));
      for (var row = 0; row < windows; row += 1) {
        var wy = y - height + 28 + row * 32;
        ctx.fillStyle = mixColor('#a7b5ad', '#f5df98', recovery * 0.85 + hitPulse * 0.15);
        for (var col = 0; col < 2; col += 1) {
          roundedPath(ctx, x + 10 + col * (width - 27), wy, 7, 13, 3.5);
          ctx.fill();
        }
      }
      ctx.fillStyle = mixColor('#839c91', '#719c78', recovery);
      roundedPath(ctx, x + width / 2 - 8, y - 21, 16, 21, 7);
      ctx.fill();
    }

    function drawCity(ctx, time, recovery) {
      var breath = Math.sin(time * (1.8 + recovery * 0.65)) * (1.8 + recovery * 1.8);
      var glow = ctx.createRadialGradient(360, 558, 10, 360, 558, 230);
      glow.addColorStop(0, 'rgba(244,218,147,' + (0.14 + recovery * 0.3 + hitPulse * 0.22) + ')');
      glow.addColorStop(1, 'rgba(244,218,147,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(118, 388, 484, 351);

      // This island has the two lobes and tapered tip of a heart, with leaf veins.
      ctx.save();
      ctx.translate(360, 643 + breath);
      ctx.scale(1 + hitPulse * 0.018, 1 + hitPulse * 0.018);
      ctx.fillStyle = 'rgba(48,90,77,.10)';
      ctx.beginPath();
      ctx.ellipse(0, 84, 183, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      var island = ctx.createLinearGradient(0, -40, 0, 104);
      island.addColorStop(0, mixColor('#a5b6ad', '#a4cda3', recovery));
      island.addColorStop(1, mixColor('#789a91', '#4d9578', recovery));
      ctx.fillStyle = island;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.bezierCurveTo(-66, -105, -211, -60, -190, 8);
      ctx.bezierCurveTo(-178, 53, -74, 88, 0, 112);
      ctx.bezierCurveTo(73, 88, 178, 53, 190, 8);
      ctx.bezierCurveTo(211, -60, 66, -105, 0, -14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(236,240,204,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 105);
      ctx.quadraticCurveTo(8, 41, 0, -13);
      for (var vein = 0; vein < 3; vein += 1) {
        ctx.moveTo(0, 75 - vein * 25);
        ctx.quadraticCurveTo(-75, 43 - vein * 20, -152 + vein * 16, 2 - vein * 14);
        ctx.moveTo(0, 75 - vein * 25);
        ctx.quadraticCurveTo(75, 43 - vein * 20, 152 - vein * 16, 2 - vein * 14);
      }
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(0, breath);
      ctx.fillStyle = mixColor('#a8b9b0', '#cfdbac', recovery);
      ctx.beginPath();
      ctx.ellipse(360, 641, 176, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(246,244,232,.72)';
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(211, 640);
      ctx.bezierCurveTo(289, 610, 375, 681, 509, 628);
      ctx.stroke();

      drawTower(ctx, 220, 628, 49, 86, recovery, false);
      drawTower(ctx, 278, 639, 54, 130, recovery, true);
      drawTower(ctx, 397, 639, 55, 117, recovery, true);
      drawTower(ctx, 466, 629, 43, 75, recovery, false);

      // The city's life tree doubles as an organic bell tower.
      ctx.strokeStyle = mixColor('#80988d', '#698e66', recovery);
      ctx.lineCap = 'round';
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(360, 639);
      ctx.bezierCurveTo(342, 577, 374, 523, 358, 467);
      ctx.stroke();
      ctx.lineWidth = 6;
      var branches = [[360, 551, 319, 517], [357, 526, 402, 489], [360, 492, 333, 461]];
      branches.forEach(function (branch) {
        ctx.beginPath();
        ctx.moveTo(branch[0], branch[1]);
        ctx.quadraticCurveTo(branch[0] - 5, branch[3] + 20, branch[2], branch[3]);
        ctx.stroke();
      });
      var leafColor = mixColor('#a5b8ad', '#78b48a', recovery);
      drawLeaf(ctx, 320, 522, 44 + recovery * 14, -0.9, leafColor);
      drawLeaf(ctx, 401, 496, 43 + recovery * 15, 0.91, leafColor);
      drawLeaf(ctx, 355, 475, 47 + recovery * 19, -0.06, mixColor('#b1bdb0', '#a4ca8f', recovery));
      drawLeaf(ctx, 339, 470, 28 + recovery * 11, -1.05, leafColor);
      drawLeaf(ctx, 363, 574, 28 + recovery * 12, 0.85, leafColor);

      ctx.shadowColor = '#f5d78a';
      ctx.shadowBlur = 12 + recovery * 15 + hitPulse * 18;
      ctx.fillStyle = mixColor('#b7bda4', '#efd58c', recovery * 0.8 + hitPulse * 0.2);
      ctx.beginPath();
      ctx.arc(360, 562, 16 + hitPulse * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#f6f4e8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(350, 562);
      ctx.lineTo(355, 562);
      ctx.lineTo(359, 555);
      ctx.lineTo(363, 570);
      ctx.lineTo(367, 562);
      ctx.lineTo(371, 562);
      ctx.stroke();

      for (var f = 0; f < 13; f += 1) {
        var bloom = clamp(recovery * 1.65 - f * 0.055, 0, 1);
        flower(ctx, 202 + f * 26, 648 + Math.sin(f * 1.9) * 14, 19 + (f % 3) * 5, Math.sin(time * 1.5 + f), bloom);
      }
      ctx.restore();
    }

    function drawTrack(ctx, time) {
      var x = indicatorX();
      var inTarget = targetContains(x);
      var active = phase === 'playing' && !roundResolved;
      text(ctx, '安 定 区', targetX, 777, 17, '#927444', 'center', '600');
      roundedPath(ctx, 73, TRACK.y - TRACK.height / 2 - 9, 574, TRACK.height + 18, 35);
      ctx.fillStyle = '#e9eadd';
      ctx.fill();
      roundedPath(ctx, TRACK.left - 18, TRACK.y - TRACK.height / 2, TRACK.right - TRACK.left + 36, TRACK.height, 29);
      ctx.fillStyle = '#426c60';
      ctx.fill();
      ctx.strokeStyle = 'rgba(246,244,232,.15)';
      ctx.lineWidth = 1;
      for (var i = 0; i <= 12; i += 1) {
        var tickX = TRACK.left + i * (TRACK.right - TRACK.left) / 12;
        ctx.beginPath();
        ctx.moveTo(tickX, TRACK.y - 7);
        ctx.lineTo(tickX, TRACK.y + 7);
        ctx.stroke();
      }
      roundedPath(ctx, targetX - TARGET_HALF_WIDTH, TRACK.y - TRACK.height / 2 - 5, TARGET_HALF_WIDTH * 2, TRACK.height + 10, 21);
      ctx.fillStyle = roundResult === 'hit' ? 'rgba(191,221,157,.87)' : 'rgba(220,194,126,.83)';
      ctx.fill();
      ctx.strokeStyle = '#fff2c2';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = '#fff8da';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(targetX, TRACK.y - 10);
      ctx.lineTo(targetX, TRACK.y + 10);
      ctx.stroke();

      ctx.shadowColor = inTarget && active ? '#ffdf95' : '#c7e6d8';
      ctx.shadowBlur = inTarget && active ? 24 : 9;
      ctx.fillStyle = roundResult === 'miss' ? '#e4a594' : '#f9f4df';
      ctx.beginPath();
      ctx.arc(x, TRACK.y, 19 + (inTarget && active ? Math.sin(time * 10) * 2 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = roundResult === 'miss' ? '#ce8174' : '#c1a66b';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = roundResult === 'hit' ? '#6e9f79' : '#c1a66b';
      ctx.beginPath();
      ctx.arc(x, TRACK.y, 5, 0, Math.PI * 2);
      ctx.fill();

      if (phase === 'warmup') {
        text(ctx, Math.max(1, Math.ceil(WARMUP_SECONDS - warmupElapsed)) + ' · 准备按拍', 360, 888, 23, '#346e60', 'center', '700');
      } else if (roundResolved) {
        text(ctx, roundResult === 'hit' ? '这次很稳，等待下一拍' : '深呼吸，等待下一拍', 360, 888, 21, roundResult === 'hit' ? '#477f61' : '#aa6e60', 'center', '600');
      } else {
        text(ctx, inTarget ? '就是现在 · 轻点！' : '等待光点进入金色区域', 360, 888, 22, inTarget ? '#8b713f' : '#59796a', 'center', inTarget ? '700' : '500');
      }
      text(ctx, '轻点画面或按拍按钮 · 每轮轻点一次', 360, 927, 17, '#829386');
    }

    function draw(ctx, time) {
      time = Number.isFinite(time) ? time : elapsed;
      var recovery = hits / REQUIRED_HITS;
      ctx.save();
      roundedPath(ctx, SCENE.x, SCENE.y, SCENE.w, SCENE.h, 32);
      ctx.clip();
      var background = ctx.createLinearGradient(0, SCENE.y, 0, SCENE.y + SCENE.h);
      background.addColorStop(0, mixColor('#e0e8e4', '#e9efd9', recovery));
      background.addColorStop(0.6, mixColor('#edf0e7', '#f4f2dc', recovery));
      background.addColorStop(1, '#f6f4e8');
      ctx.fillStyle = background;
      ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);

      ctx.fillStyle = 'rgba(125,157,137,.075)';
      ctx.beginPath();
      ctx.ellipse(76, 497, 107, 166, -0.4, 0, Math.PI * 2);
      ctx.ellipse(656, 579, 88, 158, 0.5, 0, Math.PI * 2);
      ctx.fill();
      drawLeaf(ctx, 47, 674, 102, 0.3, 'rgba(127,165,141,.15)');
      drawLeaf(ctx, 677, 650, 108, -0.6, 'rgba(127,165,141,.14)');

      text(ctx, '让生命之城，重新安稳呼吸', 71, 376, 22, '#346e60', 'left', '600');
      text(ctx, '容错', 487, 411, 15, '#7e9385', 'right');
      for (var life = 0; life < MAX_MISTAKES; life += 1) {
        var lifeX = 507 + life * 22;
        drawLeaf(ctx, lifeX, 418, 17, 0.25, life < MAX_MISTAKES - mistakes ? '#83aa8b' : '#d4dbcf');
      }

      drawCity(ctx, time, recovery);
      motes.forEach(function (mote) {
        var alpha = (0.15 + recovery * 0.65) * (0.45 + Math.sin(time * 1.3 + mote.seed) * 0.3);
        ctx.fillStyle = 'rgba(190,166,103,' + alpha + ')';
        ctx.beginPath();
        ctx.arc(mote.x + Math.sin(time * 0.6 + mote.seed) * 9, mote.y - ((time * (4 + recovery * 9) + mote.seed * 13) % 80), 1.7 + recovery, 0, Math.PI * 2);
        ctx.fill();
      });

      var message = announcementTime > 0 ? announcement : (phase === 'warmup' ? announcement : '每一次合拍，都为城市点亮一盏灯');
      text(ctx, message, 360, 746, 20, errorPulse > 0 ? '#ac7061' : '#597b65', 'center', '500');
      drawTrack(ctx, time);
      if (errorPulse > 0) {
        ctx.strokeStyle = 'rgba(206,129,116,' + errorPulse * 0.65 + ')';
        ctx.lineWidth = 6;
        roundedPath(ctx, SCENE.x + 3, SCENE.y + 3, SCENE.w - 6, SCENE.h - 6, 29);
        ctx.stroke();
      }
      ctx.restore();
    }

    call('progress', 0);
    setTask();

    return {
      update: update,
      draw: draw,
      pointerDown: pointerDown,
      pointerMove: function () {},
      pointerUp: function () {},
      pointerCancel: function () {},
      getDebugState: function () {
        return {
          phase: phase,
          hits: hits,
          requiredHits: REQUIRED_HITS,
          mistakes: mistakes,
          health: MAX_MISTAKES - mistakes,
          roundIndex: roundIndex,
          roundElapsed: roundElapsed,
          roundDuration: ROUND_SECONDS,
          roundResolved: roundResolved,
          roundResult: roundResult,
          indicatorX: indicatorX(),
          indicatorY: TRACK.y,
          targetX: targetX,
          targetLeft: targetX - TARGET_HALF_WIDTH,
          targetRight: targetX + TARGET_HALF_WIDTH,
          warmupRemaining: Math.max(0, WARMUP_SECONDS - warmupElapsed)
        };
      }
    };
  };
}());
