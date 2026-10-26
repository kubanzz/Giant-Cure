// Landscape illustrated patient, diagnostic overlays and the capsule journey.
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


  const WIDTH = 1232, HEIGHT = 552;
  const scene = Object.freeze({ width: WIDTH, height: HEIGHT });
  const timing = Object.freeze({ arrival: .6, examination: 1.8, report: .6, reducedStage: .16, total: 3, reducedTotal: .48, preparation: 1.4, departure: .3, arrivalWorld: .3 });
  const heart = Object.freeze({ x: 418, y: 250 });
  const injectionStart = Object.freeze({ x: 608, y: 422 });
  const stand = Object.freeze({ x: 572, y: 472 });
  const boardingFraction = .5 / timing.preparation;
  function getFrame(clinic = {}, time = clinic.elapsed || 0, images = window.GiantCureAssets?.images || {}) {
    const t = Math.max(0, Number(time) || 0), reduced = !!clinic.reducedMotion;
    const arrival = reduced ? timing.reducedStage : timing.arrival;
    const examination = reduced ? timing.reducedStage : timing.examination;
    const scanProgress = clamp((t - arrival) / examination);
    return Object.freeze({
      scene, heart, injectionStart, scanProgress,
      shot: t < arrival ? 'arrival' : t < arrival + examination ? 'exam' : 'chest',
      camera: Object.freeze({ x: WIDTH / 2, y: HEIGHT / 2, scale: 1, width: WIDTH, height: HEIGHT, zoom: 1 }),
      time: t, fallback: !images.scanGiant
    });
  }
  function begin(c) {
    c.setTransform(c.canvas.width / WIDTH, 0, 0, c.canvas.height / HEIGHT, 0, 0);
    c.clearRect(0, 0, WIDTH, HEIGHT); c.fillStyle = paper; c.fillRect(0, 0, WIDTH, HEIGHT);
    c.lineCap = 'round'; c.lineJoin = 'round';
  }
  function patient(c, frame, arrivalOpacity = 1, images = window.GiantCureAssets?.images || {}) {
    c.save(); c.globalAlpha = arrivalOpacity;
    if (images.scanGiant) c.drawImage(images.scanGiant, 0, 0, WIDTH, HEIGHT);
    if (images.scanGiant) anatomy(c);
    c.restore();
  }
  function anatomy(c) {
    // A quiet translucent projection fits inside the illustrated torso.
    c.save();
    c.beginPath(); c.roundRect(306, 193, 318, 166, 69); c.clip();
    const wash = c.createRadialGradient(426, 260, 30, 426, 260, 193);
    wash.addColorStop(0, '#b7d6b345'); wash.addColorStop(.7, '#c7dcc126'); wash.addColorStop(1, '#dce5c400');
    c.fillStyle = wash; c.fillRect(240, 115, 410, 300);
    for (const side of [-1, 1]) {
      c.save(); c.translate(361, 260); c.scale(.9, side * .7);
      shape(c, p => { p.moveTo(-50, -6); p.bezierCurveTo(-65,-17,-45,-75,-13,-91); p.bezierCurveTo(22,-107,67,-73,72,-37); p.bezierCurveTo(78,-4,32,0,-5,-3); p.quadraticCurveTo(-32,-2,-50,-6); }, '#acc4a240', '#f6edc9b0', 1.5);
      shape(c,p=>{p.moveTo(-54,-7);p.bezierCurveTo(-30,-16,10,-26,57,-46);},null,'#f4edcbb5',2);
      for(let i=0;i<7;i++) {
        const x=-32+i*13, y=-16-i*3;
        shape(c,p=>{p.moveTo(x,y);p.quadraticCurveTo(x-9,y-15,x-4,y-40+(i%3)*7);p.moveTo(x+7,y-2);p.quadraticCurveTo(x+16,y-10,x+21,y-27);},null,'#f4edcba0',.9);
      }
      c.restore();
    }
    shape(c,p=>{p.moveTo(275,260);p.bezierCurveTo(310,260,327,250,343,245);p.moveTo(301,260);p.bezierCurveTo(318,267,329,274,346,278);},null,'#f9f1d7bf',3);
    const h=heart;
    shape(c,p=>{p.moveTo(h.x-16,h.y-24);p.bezierCurveTo(h.x-38,h.y-23,h.x-35,h.y+2,h.x-20,h.y+19);p.bezierCurveTo(h.x-3,h.y+37,h.x+25,h.y+29,h.x+26,h.y+5);p.bezierCurveTo(h.x+29,h.y-15,h.x+11,h.y-28,h.x-1,h.y-20);p.quadraticCurveTo(h.x-8,h.y-32,h.x-16,h.y-24);},'#e7ac7099','#fff1c5',1.6);
    shape(c,p=>{p.moveTo(h.x-10,h.y-21);p.bezierCurveTo(h.x-17,h.y-36,h.x-8,h.y-42,h.x-7,h.y-49);p.moveTo(h.x+1,h.y-23);p.quadraticCurveTo(h.x-2,h.y-39,h.x+11,h.y-44);p.moveTo(h.x+16,h.y-12);p.quadraticCurveTo(h.x+29,h.y-37,h.x+37,h.y-31);p.moveTo(h.x-8,h.y-12);p.quadraticCurveTo(h.x+11,h.y-3,h.x+15,h.y+23);},null,'#fff0bfdd',1.7);
    shape(c,p=>{p.moveTo(493,212);p.bezierCurveTo(465,210,468,248,496,256);p.bezierCurveTo(513,262,536,247,531,229);p.quadraticCurveTo(523,208,513,219);p.quadraticCurveTo(503,235,493,212);},'#ccd1a84d','#f8edc6a6',1.5);
    shape(c,p=>{p.moveTo(528,253);p.bezierCurveTo(507,249,495,266,501,285);p.bezierCurveTo(486,307,508,326,532,322);p.bezierCurveTo(551,339,587,326,583,303);p.bezierCurveTo(604,280,585,252,560,256);p.quadraticCurveTo(540,244,528,253);},'#cbd0a85c','#f8edc6c2',1.5);
    shape(c,p=>{p.moveTo(514,266);p.bezierCurveTo(550,260,513,284,548,280);p.bezierCurveTo(586,270,565,303,540,294);p.bezierCurveTo(507,282,504,312,536,310);p.bezierCurveTo(565,310,579,320,566,325);p.moveTo(525,258);p.bezierCurveTo(520,278,574,261,574,285);},null,'#f9edc8b5',3);
    c.restore();
  }
  function route(heart) {
    return [injectionStart, { x: 596, y: 345 }, { x: heart.x + 30, y: heart.y + 85 }, heart];
  }
  function tube(c, heart, visible = 1) {
    const points = route(heart);
    c.save(); c.globalAlpha = visible;
    const trace = p => { p.moveTo(points[0].x, points[0].y); p.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y); };
    shape(c, trace, null, '#8fa48d', 9); shape(c, trace, null, '#e9efd8aa', 6);
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
    shape(c, p => { p.moveTo(injectionStart.x - 34, injectionStart.y + 43); p.quadraticCurveTo(injectionStart.x, injectionStart.y + 52, injectionStart.x + 34, injectionStart.y + 43); }, null, '#bbc7a8', 2);
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

  function reticle(c, x, y, radius = 13) {
    oval(c, x, y, radius + 3, radius + 3, '#f7f5db55', 0, '#f9f6df', 2.5);
    oval(c, x, y, radius, radius, null, 0, '#386e5d', 1.6);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; line(c, [x + Math.cos(a) * (radius - 3), y + Math.sin(a) * (radius - 3), x + Math.cos(a) * (radius + 6), y + Math.sin(a) * (radius + 6)], '#386e5d', 1.7); }
  }
  function heartSignal(c, frame, opacity = 1) {
    const h = frame.heart;
    c.save(); c.globalAlpha = opacity;
    const glow = c.createRadialGradient(h.x, h.y, 5, h.x, h.y, 65);
    glow.addColorStop(0, '#efad6b88'); glow.addColorStop(.48, '#f1c28b33'); glow.addColorStop(1, '#f1c28b00');
    c.fillStyle = glow; c.fillRect(h.x - 65, h.y - 65, 130, 130);
    oval(c, h.x, h.y, 38, 42, null, -.25, '#fff3ccaa');
    c.restore();
  }
  function magnifier(c, frame, opacity) {
    c.save(); c.globalAlpha = opacity;
    line(c, [frame.heart.x + 14, frame.heart.y - 8, 492, 160], '#657e69', 1.5);
    line(c, [720, 147, 886, 234], '#657e69', 1.5);
    oval(c, 1002, 237, 111, 111, '#f8f5df', 0, '#637e67', 1.6);
    c.save(); c.beginPath(); c.arc(1002, 237, 105, 0, Math.PI * 2); c.clip();
    const shade = c.createLinearGradient(900, 150, 1100, 330); shade.addColorStop(0, '#dfc1a5'); shade.addColorStop(1, '#b99d83'); c.fillStyle = shade; c.fillRect(890, 125, 225, 225);
    const vessels = [
      [890, 160, 962, 200, 1030, 296, 1114, 318], [900, 282, 963, 257, 1015, 204, 1109, 198],
      [950, 124, 947, 194, 965, 236, 1108, 275], [999, 123, 1016, 159, 1043, 184, 1113, 150],
      [898, 217, 929, 239, 948, 271, 976, 349]
    ];
    vessels.forEach(v => { const trace = p => { p.moveTo(v[0], v[1]); p.bezierCurveTo(...v.slice(2)); }; shape(c, trace, null, '#f4e6c3', 16); shape(c, trace, null, '#c8967c', 9); });
    [[954, 194, -.5], [986, 253, .5], [1051, 299, -.1], [1049, 202, -.35], [938, 271, 1], [1023, 157, .7], [1085, 158, -.3]].forEach(([x,y,a]) => { oval(c,x,y,8,4,'#c88266',a,'#b7785e'); oval(c,x,y,4,2,'#e4a486',a); });
    c.restore(); oval(c,1002,237,105,105,null,0,'#f7f3da',2.5); c.restore();
  }
  function draw(c, clinic = {}, time, images = window.GiantCureAssets?.images || {}) {
    const frame = getFrame(clinic, time, images); begin(c);
    if (!images.scanGiant) return frame;
    const arrival = clinic.reducedMotion ? 1 : .75 + .25 * ease(frame.time / timing.arrival);
    patient(c, frame, arrival, images);
    c.save(); c.globalAlpha = arrival;
    heartSignal(c, frame, frame.scanProgress > .25 ? 1 : .25);
    if (frame.shot === 'exam') {
      const x = clinic.reducedMotion ? frame.heart.x : 100 + frame.scanProgress * (WIDTH - 200);
      const beam = c.createLinearGradient(x - 70, 0, x + 70, 0);
      beam.addColorStop(0, '#b8edd400'); beam.addColorStop(.22, '#c5f2ce44'); beam.addColorStop(.5, '#c6f6d788'); beam.addColorStop(.78, '#bce9bc55'); beam.addColorStop(1, '#b8edd400');
      shape(c, p => { p.moveTo(x - 20, 0); p.lineTo(x + 95, 0); p.lineTo(x + 20, HEIGHT); p.lineTo(x - 95, HEIGHT); p.closePath(); }, beam);
      line(c,[x - 20,0,x - 95,HEIGHT],'#e4ffe7aa',1.6); line(c,[x + 95,0,x + 20,HEIGHT],'#e4ffe7aa',1.6);
      reticle(c, x, frame.heart.y);
      c.save(); c.setLineDash([4,3]); line(c,[x,frame.heart.y + 17,stand.x,stand.y - 65],'#416e5a',1.2); c.restore();
    } else if (frame.shot === 'chest') {
      reticle(c,frame.heart.x,frame.heart.y,15);
      const reveal = clinic.reducedMotion ? 1 : ease((frame.time - timing.arrival - timing.examination) / timing.report);
      magnifier(c,frame,reveal);
    }
    medic(c, stand.x, stand.y, .64, 0);
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
    begin(c); patient(c, frame); heartSignal(c, frame); tube(c, frame.heart); station(c);
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
