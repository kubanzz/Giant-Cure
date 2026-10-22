// Paper, layered figures and a tiny field medic connect the clinic to the body.
(() => {
  'use strict';
  const paper = '#f7f6ed', ink = '#537e68';
  const ease = p => { p = Math.max(0, Math.min(1, p)); return p * p * (3 - 2 * p); };
  function shape(c, draw, fill, stroke = null, width = 1) {
    c.beginPath(); draw(c); if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }
  function oval(c, x, y, rx, ry, fill, angle = 0, stroke = null) {
    shape(c, p => p.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2), fill, stroke);
  }
  function line(c, points, stroke, width = 1) {
    shape(c, p => { p.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) p.lineTo(points[i], points[i + 1]); }, null, stroke, width);
  }
  function leaf(c, x, y, size, angle, color) {
    c.save(); c.translate(x, y); c.rotate(angle);
    shape(c, p => { p.moveTo(0, 0); p.bezierCurveTo(-size * .8, -size * .3, -size * .5, -size, 0, -size); p.bezierCurveTo(size * .5, -size * .9, size * .6, -size * .3, 0, 0); }, color);
    line(c, [0, -2, 0, -size * .82], '#f1efd14d', .8); c.restore();
  }
  function limb(c, x, y, angle, length, width, color, boot) {
    c.save(); c.translate(x, y); c.rotate(angle);
    shape(c, p => { p.moveTo(-width / 2, 0); p.quadraticCurveTo(-width * .65, length * .6, -width * .38, length); p.lineTo(width * .55, length); p.quadraticCurveTo(width * .65, length * .45, width / 2, 0); p.closePath(); }, color, '#7c917355', .8);
    if (boot) shape(c, p => { p.moveTo(-width * .45, length - 14); p.lineTo(width * .5, length - 14); p.quadraticCurveTo(width * 1.2, length - 7, width * 1.05, length + 2); p.quadraticCurveTo(0, length + 7, -width * .65, length + 2); p.closePath(); }, boot, '#758b7355');
    c.restore();
  }
  function head(c, doctor, tired, time) {
    c.save(); c.translate(0, -260); c.rotate(tired ? -.1 : -.035);
    const skin = c.createLinearGradient(-35, -36, 39, 42); skin.addColorStop(0, '#f0e3c3'); skin.addColorStop(1, '#d6bd91');
    oval(c, 0, 1, 35, 44, skin, 0, '#a1916c66'); oval(c, -34, 5, 7, 11, '#e5d2aa'); oval(c, 34, 5, 7, 11, '#e5d2aa');
    for (let i = 0; i < 10; i++) oval(c, -31 + i * 6.6, -30 - Math.sin(i * .4) * 16, 15, 17, doctor ? '#829c7c' : '#799879', i * .1);
    shape(c, p => { p.moveTo(-34, -24); p.quadraticCurveTo(-47, 4, -28, 19); p.lineTo(-22, -15); p.quadraticCurveTo(8, -8, 29, -27); p.lineTo(34, 4); p.quadraticCurveTo(45, -27, 26, -37); }, doctor ? '#819a7a' : '#76977b');
    oval(c, 18, 15, 10, 5, '#bf8e6a24'); oval(c, -19, 15, 9, 5, '#bf8e6a20');
    shape(c, p => { p.moveTo(-24, 1); p.quadraticCurveTo(-17, tired ? 9 : 5, -10, 1); p.moveTo(10, 1); p.quadraticCurveTo(17, tired ? 9 : 5, 24, 1); }, null, '#54715d', 1.6);
    shape(c, p => { p.moveTo(-2, 4); p.lineTo(-5, 16); p.lineTo(2, 17); p.moveTo(-8, 28); p.quadraticCurveTo(2, tired ? 23 : 33, 12, 27); }, null, '#a6946f', 1.1);
    if (doctor) {
      oval(c, -17, 2, 12, 11, '#eff1da1c', 0, '#af9a65'); oval(c, 17, 2, 12, 11, '#eff1da1c', 0, '#af9a65'); line(c, [-5, 0, 5, 0], '#af9a65', 1.1);
      shape(c, p => { p.moveTo(-28, -31); p.quadraticCurveTo(0, -57, 29, -32); p.lineTo(28, -19); p.quadraticCurveTo(0, -29, -28, -18); p.closePath(); }, '#f1eee0', '#abb99a', 1.1);
      line(c, [-5, -40, -5, -26, 6, -26, 6, -40], '#87a48b', 2); line(c, [-11, -33, 12, -33], '#87a48b', 3);
    } else {
      leaf(c, -27, -40, 25, -.8, '#a6b58b'); leaf(c, -19, -44, 20, -.25, '#90ab88');
      // A tired breath stays tied to the animation's active time.
      if (Math.sin(time * 2) > .2) shape(c, p => { p.moveTo(17, 28); p.quadraticCurveTo(29, 28, 33, 22); }, null, '#a9b49b77', .8);
    }
    c.restore();
  }
  function giant(c, x, floor, scale, doctor, walking, examining, time) {
    c.save(); c.translate(x, floor); c.scale(scale, scale);
    const step = walking ? Math.sin(time * 6) : 0, breath = Math.sin(time * 1.7) * 1.1;
    oval(c, 1, 4, 60, 11, '#58785914');
    limb(c, -22, -102, step * .2, 99, 29, doctor ? '#a3b49b' : '#c5b58e', '#6d8973');
    limb(c, 23, -102, -step * .2, 99, 29, doctor ? '#a3b49b' : '#c5b58e', '#6d8973');
    c.translate(0, breath + (walking ? Math.abs(step) * -3 : 0));
    c.rotate(doctor ? -.025 : .055);
    const cloth = c.createLinearGradient(-52, -230, 49, -90); cloth.addColorStop(0, doctor ? '#f4f1df' : '#b2c19c'); cloth.addColorStop(1, doctor ? '#d7dfc6' : '#7fa087');
    limb(c, doctor ? 46 : -45, -218, doctor ? -.08 : .06 + step * .08, 102, 23, doctor ? '#e6e9d5' : '#c2c8a3');
    oval(c, doctor ? 56 : -51, -113, 11, 15, '#dfcca6', -.1);
    shape(c, p => { p.moveTo(-24, -239); p.lineTo(24, -239); p.quadraticCurveTo(43, -231, 51, -212); p.lineTo(53, -112); p.quadraticCurveTo(4, -91, -52, -111); p.lineTo(-49, -212); p.quadraticCurveTo(-41, -233, -24, -239); p.closePath(); }, cloth, '#81947888', 1.1);
    if (doctor) {
      shape(c, p => { p.moveTo(-20, -239); p.lineTo(0, -198); p.lineTo(20, -239); p.lineTo(28, -224); p.lineTo(17, -209); p.lineTo(26, -199); p.lineTo(0, -174); p.lineTo(-26, -199); p.lineTo(-17, -209); p.lineTo(-28, -224); p.closePath(); }, '#f6f2e3', '#9eaf91', .8);
      line(c, [0, -192, 0, -108], '#a6b496', 1); [ -173, -150, -128 ].forEach(y => oval(c, 7, y, 1.7, 1.7, '#adad85'));
      shape(c, p => { p.moveTo(19, -169); p.lineTo(43, -169); p.lineTo(41, -147); p.quadraticCurveTo(30, -142, 20, -149); p.closePath(); }, '#d4dec7', '#a7b495');
      line(c, [31, -165, 31, -152, 31, -165], '#769779', 2); line(c, [25, -159, 37, -159], '#769779', 2);
      // The shoulder, elbow and hand are separate from the torso.
      const reach = ease(examining), handX = -63 - reach * 94, handY = -143 - reach * 56;
      shape(c, p => { p.moveTo(-43, -222); p.quadraticCurveTo(-73, -222, -82, -188); p.lineTo(handX + 9, handY - 9); p.lineTo(handX - 7, handY + 10); p.lineTo(-67, -165); p.quadraticCurveTo(-42, -175, -29, -210); }, '#e6e9d5', '#9aac93', 1);
      oval(c, handX, handY, 12, 8, '#e2cfab', -.4);
      shape(c, p => { p.moveTo(-18, -235); p.bezierCurveTo(-33, -212, -19, -182, 3, -190); p.bezierCurveTo(41, -202, 26, -243, 19, -235); p.moveTo(0, -191); p.bezierCurveTo(-25, -157, handX + 37, handY + 32, handX, handY); }, null, '#6c8b76', 2.5);
      oval(c, handX - 2, handY - 2, 9, 7, '#b6aa79', 0, '#e7e6ce'); oval(c, handX - 2, handY - 2, 5, 4, '#779788');
    } else {
      shape(c, p => { p.moveTo(-39, -215); p.quadraticCurveTo(-63, -201, -55, -167); p.quadraticCurveTo(-33, -168, -10, -202); p.lineTo(1, -190); p.quadraticCurveTo(-27, -142, -61, -147); p.quadraticCurveTo(-82, -175, -60, -216); }, '#acc09e', '#819b7c', 1);
      oval(c, -5, -198, 15, 9, '#e6d4b0', -.5);
      for (let i = 0; i < 5; i++) leaf(c, -40 + i * 18, -213 + Math.sin(i) * 8, 25 + i % 2 * 7, (i - 2) * .35, i % 2 ? '#8ca67e' : '#a9ba8f');
      shape(c, p => { p.moveTo(-33, -129); p.quadraticCurveTo(0, -144, 42, -130); p.moveTo(-38, -123); p.quadraticCurveTo(-4, -137, 36, -124); }, null, '#e0e6c64d', 1.1);
      const glow = c.createRadialGradient(16, -203, 1, 16, -203, 32); glow.addColorStop(0, '#cbaa6b44'); glow.addColorStop(1, '#cbaa6b00'); oval(c, 16, -203, 32, 32, glow);
    }
    head(c, doctor, !doctor, time); c.restore();
  }
  function fallback(c) {
    const sky = c.createLinearGradient(0, 0, 0, 570); sky.addColorStop(0, '#e8eddf'); sky.addColorStop(.7, '#f4f1e1'); sky.addColorStop(1, '#dfe6cd'); c.fillStyle = sky; c.fillRect(0, 0, 624, 570);
    for (let i = 0; i < 6; i++) { oval(c, i * 140 - 40, 113 + i % 2 * 35, 106, 125, '#97b29a12'); line(c, [i * 140 - 38, 0, i * 140 - 30, 400], '#8ca78d18', 15); }
    shape(c, p => { p.moveTo(330, 405); p.lineTo(330, 164); p.lineTo(422, 107); p.lineTo(578, 165); p.lineTo(578, 402); p.closePath(); }, '#e4e8d1', '#b6c2a0', 1);
    shape(c, p => { p.moveTo(307, 169); p.lineTo(421, 87); p.lineTo(598, 164); p.lineTo(578, 180); p.lineTo(421, 121); p.lineTo(329, 186); p.closePath(); }, '#8da78a', '#7b9a7d', 1.4);
    shape(c, p => { p.moveTo(376, 395); p.lineTo(376, 246); p.bezierCurveTo(376, 184, 454, 184, 454, 246); p.lineTo(454, 395); p.closePath(); }, '#72917d55', '#aab99a');
    shape(c, p => { p.rect(492, 227, 52, 71); }, '#c3d2b7', '#9cb08d'); line(c, [518, 227, 518, 298, 492, 262, 544, 262], '#e9ecd7', 2);
    oval(c, 421, 163, 18, 18, '#f0ecd8', 0, '#bec6a4'); line(c, [421, 152, 421, 174, 421, 163, 411, 163, 431, 163], '#94aa85', 4);
    for (let i = 0; i < 10; i++) leaf(c, 332 + i * 26, 184 + Math.sin(i) * 9, 19, -.9 + i % 3 * .6, '#94ad844d');
  }
  function draw(c, clinic, time, assets) {
    c.setTransform(c.canvas.width / 624, 0, 0, c.canvas.height / 570, 0, 0); c.clearRect(0, 0, 624, 570); c.lineCap = 'round'; c.lineJoin = 'round';
    if (assets.clinic) {
      const image = assets.clinic, scale = Math.max(624 / image.width, 570 / image.height); c.drawImage(image, (624 - image.width * scale) / 2, (570 - image.height * scale) / 2, image.width * scale, image.height * scale);
      c.fillStyle = '#f5f3df20'; c.fillRect(0, 0, 624, 570);
    } else fallback(c);
    const reduced = clinic.reducedMotion, arrival = reduced ? 1 : ease(time / 4), examining = clinic.phase === 'arriving' ? 0 : reduced ? 1 : ease((time - 4) / 1.4), walk = !reduced && clinic.phase === 'arriving' && arrival < .98;
    oval(c, 305, 471, 260, 50, '#d9ddc377');
    // Low distant vegetation makes the actors feel grounded without obscuring feet.
    for (let i = 0; i < 16; i++) leaf(c, 28 + i * 39, 487 + Math.sin(i) * 8, 11 + i % 3 * 5, Math.sin(i) * .7, '#91ab8038');
    giant(c, 55 + arrival * 193, 455, 1.08, false, walk, 0, reduced ? 0 : time);
    giant(c, 456 - arrival * 31, 455, .95, true, walk && arrival > .5, examining, reduced ? 0 : time);
    c.fillStyle = '#6d8867'; c.font = '12px "Microsoft YaHei",sans-serif'; c.textAlign = 'center'; c.fillText('森林诊所 · 第一位病人', 312, 530);
    c.strokeStyle = '#a5b39366'; c.lineWidth = .7; line(c, [91, 525, 179, 525], '#a5b39366'); line(c, [446, 525, 534, 525], '#a5b39366');
    const wash = c.createLinearGradient(0, 0, 0, 85); wash.addColorStop(0, '#f0f1e275'); wash.addColorStop(1, '#f0f1e200'); c.fillStyle = wash; c.fillRect(0, 0, 624, 85);
  }
  function medic(c, x, y, scale, p) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    const walk = p > .35 && p < .8 ? Math.sin(p * 44) * .2 : 0;
    oval(c, 0, 2, 21, 5, '#78947c25');
    limb(c, -8, -20, walk, 20, 9, '#728e7c', '#577362'); limb(c, 8, -20, -walk, 20, 9, '#728e7c', '#577362');
    shape(c, q => { q.roundRect(-24, -54, 15, 31, 4); }, '#90a38b', '#6a8b76', 1.1); line(c, [-21, -40, -13, -40, -17, -40, -17, -48, -17, -32], '#f2ebd5', 2.2);
    shape(c, q => { q.moveTo(-13, -53); q.quadraticCurveTo(0, -62, 14, -53); q.lineTo(17, -23); q.quadraticCurveTo(0, -16, -16, -23); q.closePath(); }, '#f0ecd9', '#8caa91', 1);
    line(c, [0, -51, 0, -26], '#91aa8d', .9); line(c, [-8, -30, 9, -30], '#b7a36b', 2);
    oval(c, 0, -71, 15, 16, '#e2c9a1');
    shape(c, q => { q.moveTo(-18, -71); q.bezierCurveTo(-20, -101, 21, -101, 19, -71); q.lineTo(13, -67); q.lineTo(12, -80); q.lineTo(-12, -80); q.lineTo(-13, -67); q.closePath(); }, '#dce7d5', '#839d86', 1.1);
    oval(c, 0, -89, 7, 6, '#78977b'); line(c, [0, -93, 0, -85, -4, -89, 4, -89], '#faf5e0', 1.7);
    oval(c, -5, -73, 1.1, 1.5, ink); oval(c, 6, -73, 1.1, 1.5, ink); shape(c, q => { q.moveTo(-3, -65); q.quadraticCurveTo(1, -62, 5, -65); }, null, '#ad9370', .8);
    line(c, [12, -50, 24, -38, 35, -45], '#e7e4cd', 8); oval(c, 36, -45, 5, 4, '#e2c9a1');
    c.save(); c.translate(42, -47); c.rotate(-.5); shape(c, q => q.roundRect(-4, -14, 8, 25, 2), '#bdcfb1', '#779780', 1); line(c, [-7, -12, 7, -12, 0, -12, 0, -21, -4, -21, 4, -21], '#8ba58b', 1.4); c.restore();
    c.restore();
  }
  function drawPreparation(c, p) {
    c.setTransform(c.canvas.width / 720, 0, 0, c.canvas.height / 1280, 0, 0); c.clearRect(0, 0, 720, 1280); c.fillStyle = paper; c.fillRect(0, 0, 720, 1280); c.lineCap = 'round'; c.lineJoin = 'round';
    const glow = c.createRadialGradient(370, 610, 15, 370, 610, 300); glow.addColorStop(0, '#d1dfc944'); glow.addColorStop(1, '#f7f6ed00'); c.fillStyle = glow; c.fillRect(40, 330, 640, 600);
    c.textAlign = 'center'; c.fillStyle = '#b19a62'; c.font = '13px "Microsoft YaHei",sans-serif'; c.fillText('FIELD MEDIC / 001', 360, 255);
    c.fillStyle = '#527c66'; c.font = '28px SimSun,serif'; c.fillText('把微小的关怀，带进身体里。', 360, 305);
    oval(c, 365, 815, 192, 33, '#9db19219');
    shape(c, q => { q.moveTo(268, 800); q.lineTo(293, 734); q.lineTo(437, 734); q.lineTo(462, 800); q.quadraticCurveTo(364, 833, 268, 800); }, '#dce3ce', '#a7b897', 1.5);
    oval(c, 365, 744, 74, 19, '#bbcdb4', 0, '#8fa88e'); oval(c, 365, 741, 59, 12, '#e4ead7');
    const lens = c.createLinearGradient(280, 450, 440, 720); lens.addColorStop(0, '#f7f7e300'); lens.addColorStop(.5, '#a8ccbb33'); lens.addColorStop(1, '#dae9cc55');
    shape(c, q => { q.moveTo(291, 742); q.lineTo(291, 477); q.bezierCurveTo(290, 407, 439, 407, 439, 477); q.lineTo(439, 742); q.quadraticCurveTo(367, 763, 291, 742); }, lens, '#9cb7a0', 1.5);
    oval(c, 365, 478, 74, 24, '#edf1dc44', 0, '#a8b999');
    for (let i = 0; i < 6; i++) { const y = 515 + i * 35; line(c, [296, y, 305, y], '#a8ba9b', 1); line(c, [425, y, 435, y], '#a8ba9b', 1); }
    const travel = ease((p - .35) / .45), shrink = 1 - ease((p - .8) / .2) * .7;
    c.save(); c.globalAlpha = 1 - ease((p - .92) / .08); medic(c, 208 + travel * 154, 785 - travel * 42, 1.42 * shrink, p); c.restore();
    if (p > .68) { c.strokeStyle = '#c2ae78'; c.lineWidth = 1; oval(c, 365, 627, 45 + p * 14, 45 + p * 14, null, 0, '#c2ae7855'); }
    leaf(c, 189, 814, 43, -.45, '#adbf9b'); leaf(c, 194, 816, 34, .5, '#90aa89'); leaf(c, 531, 810, 43, .4, '#a8bc96');
    line(c, [110, 900, 610, 900], '#dce3d0', .8); c.fillStyle = '#9aa58d'; c.font = '13px "Microsoft YaHei",sans-serif'; c.fillText('药剂检查  /  医疗背包  /  微缩出发', 360, 933);
  }
  window.GiantCureClinicArt = Object.freeze({ draw, drawPreparation });
})();
