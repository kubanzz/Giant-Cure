// A paper-cut patient and a visible capsule journey connect diagnosis to the heart.
(() => {
  'use strict';
  const paper = '#f7f6ed', ink = '#537e68';
  const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
  const ease = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
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


  const WIDTH = 624, HEIGHT = 570;
  const timing = Object.freeze({ arrival: .6, examination: 1.8, report: .6, reducedStage: .16, total: 3, reducedTotal: .48, preparation: 1.4, departure: .3, arrivalWorld: .3 });
  const bounds = Object.freeze({ x: 0, y: 6, w: 624, h: 475 });
  const injectionStart = Object.freeze({ x: 519, y: 436 });
  const stand = Object.freeze({ x: 443, y: 476 });
  const boardingFraction = .5 / timing.preparation;
  function sceneOptions() { return { bounds, time: 0, restored: 0, reducedMotion: true, heartVisible: true, recovering: false }; }
  function getFrame(clinic = {}, time = clinic.elapsed || 0, images = {}) {
    const t = clinic.reducedMotion ? clinic.phase === 'arriving' ? .3 : clinic.phase === 'examining' ? 1.5 : 3 : Math.max(0, Math.min(timing.total, Number(time) || 0));
    const patient = window.GiantCureGiantArt.getFrame(sceneOptions());
    const scanProgress = ease((t - timing.arrival) / timing.examination);
    return Object.freeze({
      heart: patient.heart, injectionStart, scanProgress,
      shot: t < timing.arrival ? 'arrival' : t < timing.arrival + timing.examination ? 'exam' : 'chest',
      camera: Object.freeze({ x: patient.x, y: patient.y, scale: patient.scale, width: patient.width, height: patient.height, zoom: 1 }),
      time: t, fallback: false
    });
  }
  function begin(c) {
    c.setTransform(c.canvas.width / WIDTH, 0, 0, c.canvas.height / HEIGHT, 0, 0);
    c.clearRect(0, 0, WIDTH, HEIGHT); c.fillStyle = paper; c.fillRect(0, 0, WIDTH, HEIGHT);
    c.lineCap = 'round'; c.lineJoin = 'round';
  }
  function patient(c, frame, arrivalOpacity = 1) {
    c.save(); c.globalAlpha = arrivalOpacity;
    const options = sceneOptions(); options.heartVisible = frame.scanProgress > .6;
    window.GiantCureGiantArt.draw(c, options); c.restore();
  }
  function route(heart) {
    return [injectionStart, { x: 552, y: 349 }, { x: heart.x + 37, y: heart.y + 86 }, heart];
  }
  function tube(c, heart, visible = 1) {
    const points = route(heart);
    c.save(); c.globalAlpha = visible;
    const trace = p => { p.moveTo(points[0].x, points[0].y); p.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y); };
    shape(c, trace, null, '#afbea6', 9); shape(c, trace, null, '#f9f5e3', 6);
    shape(c, trace, null, '#d2ddc5', 1);
    oval(c, heart.x, heart.y, 13, 13, '#f2e3b929', 0, '#bba46e');
    c.restore();
  }
  function capsule(c, at, size = 1, occupied = false, angle = 0) {
    c.save(); c.translate(at.x, at.y); c.rotate(angle); c.scale(size, size);
    const glass = c.createLinearGradient(-22, -35, 22, 35);
    glass.addColorStop(0, '#fdfbea77'); glass.addColorStop(.5, '#c7ddcc3b'); glass.addColorStop(1, '#f4efd28c');
    shape(c, p => p.roundRect(-22, -39, 44, 78, 20), glass, '#7e9d83', 1.5);
    if (occupied) medic(c, 0, 30, .51, 0);
    // A clear front reflection keeps the helmet and backpack readable through glass.
    shape(c, p => { p.moveTo(-15, 16); p.lineTo(-15, -18); p.quadraticCurveTo(-15, -29, -7, -31); }, null, '#fffff0cc', 2);
    shape(c, p => { p.moveTo(-19, 28); p.quadraticCurveTo(0, 36, 19, 28); }, null, '#a2b596', 2.2);
    shape(c, p => { p.moveTo(-12, -34); p.quadraticCurveTo(0, -40, 12, -34); }, null, '#b59e68', 3);
    c.restore();
  }
  function station(c) {
    oval(c, injectionStart.x, injectionStart.y + 42, 39, 7, '#9ab18a23');
    shape(c, p => { p.moveTo(486, 480); p.quadraticCurveTo(519, 489, 551, 480); }, null, '#bbc7a8', 2);
    leaf(c, 566, 487, 29, .4, '#a6bf99'); leaf(c, 560, 488, 21, -.45, '#c2d0ac');
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

  function draw(c, clinic = {}, time, images = {}) {
    const frame = getFrame(clinic, time, images); begin(c);
    const arrival = clinic.reducedMotion ? 1 : ease(frame.time / timing.arrival);
    patient(c, frame, arrival);
    c.save(); c.globalAlpha = arrival;
    tube(c, frame.heart, .62); station(c); capsule(c, injectionStart);
    medic(c, stand.x, stand.y, .56, 0);
    if (frame.shot === 'exam' && !clinic.reducedMotion) {
      const progress = frame.scanProgress, radius = 15 + progress * 47;
      c.save(); c.globalAlpha = Math.sin(progress * Math.PI) * .48;
      oval(c, frame.heart.x, frame.heart.y, radius, radius * .8, null, 0, '#b6a375');
      oval(c, frame.heart.x, frame.heart.y, radius * .73, radius * .58, null, 0, '#bbcca7'); c.restore();
    }
    c.restore();
    return frame;
  }
  function capsulePoint(heart, progress) {
    const q = 1 - progress, points = route(heart);
    return Object.freeze({
      x: q * q * q * points[0].x + 3 * q * q * progress * points[1].x + 3 * q * progress * progress * points[2].x + progress * progress * progress * points[3].x,
      y: q * q * q * points[0].y + 3 * q * q * progress * points[1].y + 3 * q * progress * progress * points[2].y + progress * progress * progress * points[3].y
    });
  }
  function drawPreparation(c, progress, reduced = false) {
    const p = clamp(progress), frame = getFrame({ phase: 'ready', reducedMotion: reduced }, timing.total);
    begin(c); patient(c, frame); tube(c, frame.heart); station(c);
    const boarding = ease(p / boardingFraction);
    // The occupied capsule visibly miniaturises at the dock before entering
    // the narrow tube. Its 8.8-unit width then fits the 9-unit conduit.
    const shrinking = ease((p - boardingFraction) / (.2 / timing.preparation));
    const travel = ease((p - boardingFraction - .2 / timing.preparation) / (.7 / timing.preparation));
    const at = capsulePoint(frame.heart, travel), size = 1 - shrinking * .80;
    const tangent = capsulePoint(frame.heart, Math.min(1, travel + .001));
    const previous = capsulePoint(frame.heart, Math.max(0, travel - .001));
    const angle = Math.atan2(tangent.x - previous.x, previous.y - tangent.y) * ease(travel * 10);
    if (p < boardingFraction) {
      capsule(c, injectionStart);
      medic(c, stand.x + (injectionStart.x - stand.x) * boarding, stand.y - boarding * 10, .56 - boarding * .05, .35 + boarding * .4);
    } else {
      if (travel > 0) {
        const glow = c.createRadialGradient(at.x, at.y, 1, at.x, at.y, 15);
        glow.addColorStop(0, '#dfbb6555'); glow.addColorStop(1, '#dfbb6500');
        c.fillStyle = glow; c.fillRect(at.x - 15, at.y - 15, 30, 30);
      }
      capsule(c, at, size, true, angle);
    }
    if (travel > .8) {
      c.save(); c.globalAlpha = ease((travel - .8) / .2) * .55;
      oval(c, frame.heart.x, frame.heart.y, 18, 18, null, 0, '#c5a971'); c.restore();
    }
    return Object.freeze({ heart: frame.heart, capsule: at, delivered: p === 1, progress: p });
  }
  window.GiantCureClinicArt = Object.freeze({ draw, getFrame, drawPreparation, timing });
})();
