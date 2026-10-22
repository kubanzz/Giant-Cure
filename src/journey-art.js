// World-space illustration and readable interaction layers. No simulation is mutated here.
(function () {
  'use strict';
  const PAPER = '#f5f0df', INK = '#2f675a', GOLD = '#c6a15b', TAU = Math.PI * 2;
  const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // All recovery layers share this normalized illustration frame. Local mesh
  // anchors deliberately exclude the distant valley, so only the giant moves.
  const RECOVERY_ART = {
    chest: { x: .51, y: .44, rx: .20, ry: .23 },
    shoulder: { x: .24, y: .53, rx: .18, ry: .18 },
    hand: { x: .82, y: .76, rx: .19, ry: .23 },
    fingers: [
      { x: .735, y: .860, rx: .040, ry: .115, spread: -1 },
      { x: .795, y: .910, rx: .032, ry: .105, spread: -.4 },
      { x: .855, y: .910, rx: .030, ry: .105, spread: .3 },
      { x: .902, y: .860, rx: .029, ry: .110, spread: .9 }
    ],
    trees: [ { x:.245,y:.364,rx:.07,ry:.055 }, { x:.47,y:.50,rx:.08,ry:.055 }, { x:.675,y:.65,rx:.08,ry:.06 } ],
    windows: [ [.148,.117], [.095,.274], [.173,.426], [.222,.435], [.484,.301], [.536,.30], [.650,.822], [.633,.835] ],
    eyes: [ {x:452/1860,y:155/846,rx:65/1860,ry:38/846}, {x:530/1860,y:125/846,rx:32/1860,ry:20/846} ],
    birdOrigin: { x: .47, y: .44 }
  };
  const recoveryMeshes = new WeakMap();
  const recoveryEyePatches = new WeakMap();
  function smooth(a, b, value) { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function shape(c, draw, fill, stroke, width) {
    c.beginPath(); draw(c);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 1; c.stroke(); }
  }
  function oval(c, x, y, rx, ry, fill, rotation, stroke, width) {
    shape(c, p => p.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rotation || 0, 0, TAU), fill, stroke, width);
  }
  function round(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function label(c, value, x, y, size, color, weight) {
    c.font = (weight || 500) + ' ' + size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = color || INK; c.fillText(String(value), x, y);
  }
  function glow(c, x, y, r, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(248,223,158,0)');
    oval(c, x, y, r, r, g);
  }
  function badge(c, value, x, y, color, size) {
    size = size || 14; c.font = '600 ' + size + 'px ' + FONT;
    const w = Math.max(38, c.measureText(value).width + 22), h = size + 14;
    round(c, x - w / 2, y - h / 2, w, h, 7); c.fillStyle = 'rgba(250,247,232,.96)'; c.fill();
    c.strokeStyle = 'rgba(133,151,112,.22)'; c.lineWidth = 1; c.stroke();
    label(c, value, x, y + .5, size, color || INK, 600);
  }
  // Labels are laid out after the world transform so camera zoom never makes
  // interaction text tiny or clips the words on the edge of the viewport.
  function worldBadge(labels, value, x, y, dx, dy, color, size) {
    labels.push({ value, x, y, dx: dx || 0, dy: dy || 0, color: color || INK, size: size || 14 });
  }
  function drawWorldLabels(c, labels, view) {
    const p = view.viewport, cam = view.camera;
    labels.forEach(item => {
      const ax = p.x + p.w / 2 + (item.x - cam.x) * cam.zoom;
      const ay = p.y + p.h / 2 + (item.y - cam.y) * cam.zoom;
      if (ax < p.x - 10 || ax > p.x + p.w + 10 || ay < p.y - 10 || ay > p.y + p.h + 10) return;
      c.font = '600 ' + item.size + 'px ' + FONT;
      const half = Math.max(19, c.measureText(item.value).width / 2 + 11), hh = (item.size + 14) / 2;
      const x = clamp(ax + item.dx, p.x + half + 8, p.x + p.w - half - 8);
      const y = clamp(ay + item.dy, p.y + hh + 8, p.y + p.h - hh - 8);
      badge(c, item.value, x, y, item.color, item.size);
    });
  }
  function line(c, points, color, width) {
    if (!points || points.length < 2) return;
    shape(c, p => { p.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) p.lineTo(points[i].x, points[i].y); }, null, color, width);
  }
  function leaf(c, x, y, s, a, color) {
    c.save(); c.translate(x, y); c.rotate(a);
    shape(c, p => { p.moveTo(0, 0); p.bezierCurveTo(-s * .7, -s * .4, -s * .4, -s, 0, -s); p.bezierCurveTo(s * .4, -s, s * .7, -s * .4, 0, 0); }, color);
    line(c, [{ x: 0, y: -2 }, { x: 0, y: -s * .8 }], 'rgba(255,248,217,.45)', 1); c.restore();
  }
  function plant(c, x, y, s, seed, alive, time) {
    c.save(); c.translate(x, y); c.rotate(alive ? Math.sin(time * .65 + seed) * .045 : Math.sin(seed) * .025);
    shape(c, p => { p.moveTo(0, 0); p.quadraticCurveTo(-s * .15, -s * .6, 0, -s); }, null, alive ? '#6b9c80' : '#9eab96', 2);
    leaf(c, 0, -s * .2, s * .55, -.9, alive ? '#87ad87' : '#a8b29a');
    leaf(c, -1, -s * .52, s * .42, .9, alive ? '#9fbd8d' : '#b4b99e');
    if (alive) {
      for (let i = 0; i < 5; i++) oval(c, Math.cos(i * TAU / 5) * 4, -s + Math.sin(i * TAU / 5) * 4, 3, 5, seed % 2 ? '#f1cf9b' : '#e4af9c', i * TAU / 5);
      oval(c, 0, -s, 2, 2, '#ac8d4f');
    }
    c.restore();
  }
  function fallbackPaths(s) {
    const n = id => s.nodes.find(v => v.id === id);
    if (s.room === 'main') return [
      { id: 'main', width: 142, points: [{ x: 800, y: 1000 }, { x: 800, y: 0 }], active: s.flowRestored },
      { id: 'A', width: 68, points: [{ x: 800, y: 870 }, { x: 300, y: 870 }, n('A1'), n('A2'), { x: 300, y: 160 }, { x: 800, y: 160 }], active: s.bypassA },
      { id: 'B', width: 68, points: [{ x: 800, y: 870 }, { x: 1300, y: 870 }, n('B1'), n('B2'), { x: 1300, y: 160 }, { x: 800, y: 160 }], active: s.bypassB }
    ];
    if (s.room === 'heart') return [{ id: 'main', width: 110, points: [{ x: 900, y: 1200 }, { x: 900, y: 900 }, { x: 950, y: 650 }, { x: 900, y: 380 }, { x: 1300, y: 180 }], active: s.flowRestored }];
    return [
      { id: 'healthy', width: 90, points: [{ x: 800, y: 1000 }, { x: 800, y: 790 }, { x: 400, y: 790 }, { x: 400, y: 600 }], active: true },
      { id: 'abnormal', width: 132, points: [{ x: 800, y: 790 }, { x: 1130, y: 790 }, { x: 1130, y: 0 }], active: s.flowRestored }
    ];
  }
  function curvedPath(points) {
    // Round the original waypoints without changing the simulation's route.
    // Every visual layer samples this single centre line, including blood cells.
    const pts = points.filter(Boolean), samples = [], add = p => {
      const last = samples[samples.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > .01) samples.push({ x: p.x, y: p.y });
    };
    if (pts.length < 2) return { samples, total: 0 };
    add(pts[0]);
    const straight = end => {
      const start = samples[samples.length - 1], count = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 16));
      for (let i = 1; i <= count; i++) add({ x: start.x + (end.x - start.x) * i / count, y: start.y + (end.y - start.y) * i / count });
    };
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1], at = pts[i], next = pts[i + 1];
      const before = Math.hypot(at.x - prev.x, at.y - prev.y), after = Math.hypot(next.x - at.x, next.y - at.y);
      const r = Math.min(110, before * .25, after * .25);
      if (r < 1) { straight(at); continue; }
      const a = { x: at.x + (prev.x - at.x) * r / before, y: at.y + (prev.y - at.y) * r / before };
      const b = { x: at.x + (next.x - at.x) * r / after, y: at.y + (next.y - at.y) * r / after };
      straight(a);
      const count = Math.max(8, Math.ceil(r / 8));
      for (let k = 1; k <= count; k++) { const t = k / count, u = 1 - t; add({ x: u * u * a.x + 2 * u * t * at.x + t * t * b.x, y: u * u * a.y + 2 * u * t * at.y + t * t * b.y }); }
    }
    straight(pts[pts.length - 1]);
    let total = 0;
    samples.forEach((p, i) => {
      if (i) total += Math.hypot(p.x - samples[i - 1].x, p.y - samples[i - 1].y);
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
      p.distance = total; p.angle = Math.atan2(b.y - a.y, b.x - a.x);
    });
    return { samples, total };
  }
  function alongPath(curve, distance) {
    const pts = curve.samples;
    if (!pts.length) return { x: 0, y: 0, angle: 0, distance: 0 };
    distance = clamp(distance, 0, curve.total);
    let i = 1; while (i < pts.length - 1 && pts[i].distance < distance) i++;
    const a = pts[i - 1] || pts[0], b = pts[i] || a, t = (distance - a.distance) / Math.max(.01, b.distance - a.distance);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x), distance };
  }
  function channelWidth(base, distance) { return base * (.93 + Math.sin(distance * .013) * .045 + Math.sin(distance * .031 + .7) * .025); }
  function ribbon(c, curve, base, color, spread) {
    const side = sign => curve.samples.map(p => {
      const w = channelWidth(base, p.distance) * (spread || 1) / 2;
      return { x: p.x - Math.sin(p.angle) * w * sign, y: p.y + Math.cos(p.angle) * w * sign };
    });
    const a = side(1), b = side(-1).reverse();
    if (!a.length) return;
    shape(c, p => { p.moveTo(a[0].x, a[0].y); a.slice(1).concat(b).forEach(v => p.lineTo(v.x, v.y)); p.closePath(); }, color);
  }
  function stream(c, path, s) {
    const curve = curvedPath(path.points || []); if (curve.total < 1) return;
    const flow = clamp(Number(path.flow === undefined ? path.active ? 1 : .05 : path.flow), 0, 1);
    const open = flow > .4, w = path.width || 85;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    // The banks sit flush in the ground. Only solid tissue uses a raised rim.
    ribbon(c, curve, w + 8, 'rgba(139,143,109,.13)');
    ribbon(c, curve, w, open ? 'rgba(198,163,129,.32)' : 'rgba(158,162,128,.26)');
    ribbon(c, curve, w, open ? 'rgba(232,192,151,.32)' : 'rgba(213,208,165,.26)', .84);
    ribbon(c, curve, w, open ? 'rgba(253,229,180,.31)' : 'rgba(242,228,184,.20)', .56);
    for (let distance = 13, i = 0; distance < curve.total; distance += 31, i++) {
      const p = alongPath(curve, distance), offset = Math.sin(i * 2.7) * w * .42, nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
      const x = p.x + nx * offset, y = p.y + ny * offset;
      line(c, [{ x, y }, { x: x + Math.cos(p.angle) * (8 + i % 5 * 2), y: y + Math.sin(p.angle) * (8 + i % 5 * 2) }], 'rgba(122,133,105,.10)', 1);
    }
    const phase = s.elapsed * (4 + flow * 44);
    for (let k = 0; k < Math.ceil(curve.total / 62); k++) {
      const p = alongPath(curve, (k * 62 + phase) % curve.total), offset = Math.sin(k * 4.2) * channelWidth(w, p.distance) * .24;
      const x = p.x - Math.sin(p.angle) * offset, y = p.y + Math.cos(p.angle) * offset;
      oval(c, x, y, 9, 4.6, open ? 'rgba(173,103,88,.64)' : 'rgba(137,133,111,.36)', p.angle);
      oval(c, x, y, 4.8, 1.5, 'rgba(255,230,189,.48)', p.angle);
    }
    if (s.scanner) {
      c.setLineDash([8, 14]); c.lineDashOffset = -phase;
      line(c, curve.samples, open ? 'rgba(65,136,114,.55)' : 'rgba(158,107,78,.55)', 1.8); c.setLineDash([]);
    }
    c.restore();
  }
  function tissue(c, o, alive) {
    if (o.kind !== 'tissue') return;
    const x = o.x, y = o.y, w = o.w, h = o.h;
    // The complete rectangular base is visible: there are no painted slopes
    // outside the collision footprint that could be mistaken for walking space.
    c.save();
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, alive ? '#cbd4ac' : '#c6c7a7'); g.addColorStop(.7, alive ? '#a2b78d' : '#a5ad8e'); g.addColorStop(1, '#7c9276');
    round(c, x, y, w, h, 4); c.fillStyle = g; c.fill(); c.strokeStyle = '#70896e'; c.lineWidth = 3; c.stroke();
    round(c, x + 1.5, y + 1.5, w - 3, h - 3, 3); c.clip();
    line(c, [{ x: x + 3, y: y + 6 }, { x: x + w - 3, y: y + 6 }], 'rgba(246,239,203,.70)', 3);
    line(c, [{ x: x + 2, y: y + h - 5 }, { x: x + w - 2, y: y + h - 5 }], 'rgba(71,101,73,.38)', 7);
    for (let i = 0; i < Math.ceil(w / 26); i++) {
      const px = x + 12 + i * 26;
      shape(c, p => { p.moveTo(px - 8, y + h - 9); p.bezierCurveTo(px + 4, y + h * .7, px - 10, y + h * .35, px + 5, y + 13); }, null, 'rgba(244,237,204,.22)', 2);
      oval(c, px, y + h * (.34 + Math.sin(i * 2) * .08), 6 + i % 3 * 2, 5, 'rgba(125,150,112,.14)', i);
    }
    c.restore();
  }
  function perimeter(c, b, size) {
    const outside = '#a7b294', extent = 2200;
    c.save();
    c.fillStyle = outside;
    c.fillRect(-extent, -extent, size.width + extent * 2, b.top + extent);
    c.fillRect(-extent, b.bottom, size.width + extent * 2, size.height + extent - b.bottom);
    c.fillRect(-extent, b.top, b.left + extent, b.bottom - b.top);
    c.fillRect(b.right, b.top, size.width + extent - b.right, b.bottom - b.top);
    const rim = c.createLinearGradient(0, b.top - 36, 0, b.top + 3);
    rim.addColorStop(0, '#bec4a5'); rim.addColorStop(1, '#7a9176');
    c.fillStyle = rim; c.fillRect(b.left - 30, b.top - 36, b.right - b.left + 60, 36);
    c.fillStyle = '#9aaa89'; c.fillRect(b.left - 30, b.bottom, b.right - b.left + 60, 35);
    c.fillRect(b.left - 35, b.top, 35, b.bottom - b.top);
    c.fillRect(b.right, b.top, 35, b.bottom - b.top);
    shape(c, p => { p.moveTo(b.left, b.top); p.lineTo(b.right, b.top); p.lineTo(b.right, b.bottom); p.lineTo(b.left, b.bottom); p.closePath(); }, null, '#718a70', 3);
    for (let i = 0; i < Math.ceil((b.right - b.left) / 58); i++) {
      const x = b.left + 16 + i * 58;
      oval(c, x, b.top - 17, 15, 5, 'rgba(232,232,196,.26)', -.1);
      oval(c, x + 8, b.bottom + 17, 15, 5, 'rgba(232,232,196,.22)', .1);
    }
    c.restore();
  }
  function recoveryFraction(s) {
    return s.stage === 'recovery' ? clamp((s.recovery - 1.1) / Math.max(1, (s.recoveryDuration || 6) - 1.1), 0, 1) : s.heartConnected ? 1 : 0;
  }
  function heartNeighborhoods(c, s) {
    const recovering = recoveryFraction(s), pulse = s.beat.pulse;
    ['C1', 'C2', 'C3'].forEach((id, index) => {
      const n = (s.nodes || []).find(p => p.id === id); if (!n) return;
      const bloom = clamp((recovering - index * .20) / .42, 0, 1), alive = bloom > .55;
      // These small inhabited gardens remain near the player during connection.
      const x = n.x - 108, y = n.y - 80;
      oval(c, x + 25, y + 21, 43, 12, 'rgba(92,112,79,.10)');
      if (bloom > 0) glow(c, x + 22, y - 10, 54 + pulse * 11, 'rgba(250,215,133,' + (.24 * bloom) + ')');
      for (let k = 0; k < 3; k++) {
        const wx = x + k * 20, wy = y - (k === 1 ? 13 : 0);
        round(c, wx - 7, wy - 13, 15, 26, 5); c.fillStyle = '#a4b491'; c.fill(); c.strokeStyle = '#7b9679'; c.lineWidth = 1.4; c.stroke();
        round(c, wx - 4, wy - 8, 9, 15, 3); c.fillStyle = alive ? '#f3d38f' : '#7e9480'; c.fill();
        if (alive) { c.globalAlpha = .35 + pulse * .35; line(c, [{ x: wx - 2, y: wy - 7 }, { x: wx - 2, y: wy + 3 }], '#fff1c0', 1.5); c.globalAlpha = 1; }
      }
      c.save(); c.translate(n.x + 73, n.y + 20);
      const unfurl = .60 + bloom * .4; c.scale(unfurl, unfurl);
      plant(c, 0, 0, 34, index, alive, alive ? s.elapsed : 0);
      plant(c, 28, 10, 24, index + 1, alive, alive ? s.elapsed : 0);
      c.restore();
    });
  }
  function drawBackground(c, s, time) {
    const size = s.worldSize || { width: s.room === 'heart' ? 1800 : 1600, height: s.room === 'heart' ? 1200 : 1000 };
    c.fillStyle = '#e9e5cc'; c.fillRect(-2000, -2000, size.width + 4000, size.height + 4000);
    const recovering = recoveryFraction(s);
    const art = window.GiantCureAssets && window.GiantCureAssets.images[s.room];
    if (art) {
      c.save();
      if (s.room === 'heart') c.filter = 'saturate(' + (.45 + recovering * .65) + ') brightness(' + (.86 + recovering * .18) + ')';
      c.drawImage(art, 0, 0, size.width, size.height); c.restore();
    }
    if (recovering > 0) { c.fillStyle = 'rgba(250,209,141,' + (recovering * .10) + ')'; c.fillRect(0, 0, size.width, size.height); }
    const paths = s.paths && s.paths.length ? s.paths : fallbackPaths(s);
    paths.forEach(p => stream(c, p, s));
    (s.obstacles || []).forEach(o => tissue(c, o, s.room === 'heart' ? recovering > .4 : s.flowRestored));
    const b = s.bounds;
    perimeter(c, b, size);
    for (let i = 0; i < 38; i++) {
      const left = i % 2 === 0, x = left ? b.left - 14 + (i % 3) * 12 : b.right + 10 - (i % 3) * 12;
      const y = b.top + 30 + ((i * 137) % Math.max(80, b.bottom - b.top - 60));
      const alive = s.room === 'heart' ? recovering > Math.abs(y - 700) / 1100 : s.flowRestored;
      plant(c, x, y, 25 + i % 5 * 7, i, alive, time);
    }
    if (s.room === 'heart') {
      heartNeighborhoods(c, s);
      const spots = [[250,230],[470,200],[680,170],[1110,180],[1430,280],[1540,540],[260,550],[330,770],[1480,960],[720,1050]];
      spots.forEach((p, i) => {
        const light = recovering > Math.hypot(p[0] - 900, p[1] - 650) / 1500;
        if (light) { glow(c, p[0], p[1], 75 + s.beat.pulse * 14, 'rgba(250,207,114,.24)'); oval(c, p[0], p[1], 4, 8, '#f7d28b'); }
      });
    }
  }
  function node(c, n, s, hideLabels, labels) {
    const near = s.nearestId === n.id, show = s.scanner || near || n.selected || n.complete;
    const color = n.complete ? '#a68542' : n.selected ? '#b68b44' : '#4f8a75';
    if (show) glow(c, n.x, n.y, near ? 58 : 40, n.complete ? 'rgba(245,205,112,.35)' : 'rgba(199,232,187,.43)');
    oval(c, n.x, n.y + 9, 26, 9, 'rgba(60,91,72,.20)');
    oval(c, n.x, n.y, near ? 25 : 22, near ? 25 : 22, '#f6f0d8', 0, color, near ? 3 : 1.8);
    oval(c, n.x, n.y, 15, 15, n.complete ? '#ead59a' : '#c6d9b6');
    if (n.complete) line(c, [{ x:n.x-6,y:n.y },{ x:n.x-1,y:n.y+5 },{ x:n.x+7,y:n.y-6 }], color, 2.5);
    else if (show && !hideLabels) label(c, (String(n.label).match(/[ABC]\s*$/) || [''])[0].trim() || (n.kind === 'release' ? '◎' : '≈'), n.x, n.y, 16, color, 700);
    if (!hideLabels && show) worldBadge(labels, n.label, n.x, n.y, 0, 38, color);
    if (!hideLabels && s.scanner && n.scanned && n.symptom) worldBadge(labels, n.symptom, n.x, n.y, 0, 69, '#657b58', 13);
    if (!hideLabels && near) worldBadge(labels, 'E', n.x, n.y, 35, -27, INK, 13);
    if (s.scanner && !n.complete) { c.save(); c.setLineDash([3, 7]); oval(c, n.x, n.y, 33, 33, null, 0, '#659c83', 1.3); c.restore(); }
  }
  function portal(c, p, s, hideLabels, labels) {
    const near = s.nearestId === p.id, open = !p.locked;
    if (open) glow(c, p.x, p.y, 58, 'rgba(231,208,130,.32)');
    oval(c, p.x, p.y + 10, 37, 13, '#b8c9a4', 0, '#769575', 2);
    shape(c, a => { a.moveTo(p.x-31,p.y+5); a.bezierCurveTo(p.x-33,p.y-45,p.x+33,p.y-45,p.x+31,p.y+5); }, null, open ? '#759c7d' : '#a2a88c', 6);
    label(c, open ? '↗' : '·', p.x, p.y - 8, 26, open ? INK : '#939b80');
    if (!hideLabels && (near || s.scanner || open)) worldBadge(labels, p.label, p.x, p.y, 0, 38, open ? INK : '#84917b');
    if (!hideLabels && near && open) worldBadge(labels, 'E', p.x, p.y, 43, -25, INK, 13);
  }
  function valve(c, v, s, hideLabels, labels) {
    const open = v.open !== undefined ? v.open : s.beat.safe;
    const x = v.x, y = v.y, w = v.w, h = v.h;
    c.save();
    glow(c, x + w/2, y + h/2, w * .65, open ? 'rgba(126,204,170,.18)' : 'rgba(197,143,106,.16)');
    [-1,1].forEach(side => {
      const root = side < 0 ? x : x+w;
      shape(c, p => { p.moveTo(root,y-15); p.bezierCurveTo(root-side*w*.13,y-30,root-side*w*(open?.13:.46),y-8,root-side*w*(open?.13:.50),y+h/2); p.bezierCurveTo(root-side*w*(open?.10:.38),y+h+24,root-side*w*.08,y+h+20,root,y+h+10); p.closePath(); }, open?'#b0cdb2':'#c8b196', open?'#5c967c':'#9a8063', 2.5);
    });
    if (!hideLabels && (s.scanner || Math.hypot(s.player.x-x-w/2,s.player.y-y-h/2)<220)) worldBadge(labels,open?'舒张 · 可通行':'收缩 · 等待舒张',x+w/2,y+h/2,0,-42,open?'#3e846b':'#926b4d');
    c.restore();
  }
  function links(c, s) {
    (s.links || []).forEach(l => {
      const a=l.from,b=l.to;if(!a||!b)return;
      c.save(); c.shadowColor='#f2ce76'; c.shadowBlur=14;
      shape(c,p=>{p.moveTo(a.x,a.y);p.quadraticCurveTo((a.x+b.x)/2+25,(a.y+b.y)/2-28,b.x,b.y);},null,l.complete?'#d6ae55':'#8eb694',5);
      c.shadowBlur=0;
      line(c,[a,b],'rgba(255,235,164,.8)',1.8); c.restore();
    });
    const source = s.guidance && s.guidance.source;
    if (source) {
      const phase = (s.elapsed * .75) % 1;
      oval(c, source.x, source.y, 29 + phase * 34, 29 + phase * 34, null, 0, 'rgba(177,148,76,' + (.60 * (1 - phase)) + ')', 2);
      glow(c, source.x, source.y, 47, 'rgba(239,208,125,.26)');
    }
  }
  function clot(c, s, hideLabels, labels) {
    const a=s.clot;if(s.room!=='main'||!a||a.removed)return;
    const r=a.radius||125,weakpoints=s.weakpoints||[],soft=weakpoints.reduce((v,p)=>v+p.progress,0)/Math.max(1,weakpoints.length);
    const burst=s.stage==='burst'?clamp(s.burst/4,0,1):0;
    c.save();c.translate(a.x,a.y);
    if(burst>.45)c.globalAlpha=1-clamp((burst-.45)/.55,0,1);
    const g=c.createRadialGradient(-30,-35,8,0,0,r);g.addColorStop(0,'#b2a080');g.addColorStop(1,'#676f5d');
    oval(c,5,36,r*1.04,r*.76,'rgba(71,74,54,.25)');
    const parts=burst>.12?7:1;
    for(let k=0;k<parts;k++) {
      c.save();const angle=k*TAU/7;
      if(parts>1){c.translate(Math.cos(angle)*burst*65,-burst*burst*520+Math.sin(angle)*burst*45);c.rotate(burst*(k%2?1:-1));}
      if(parts===1) shape(c,p=>{for(let i=0;i<=32;i++){const t=i/32*TAU,rr=r*(1+Math.sin(t*5)*.07);const x=Math.cos(t)*rr,y=Math.sin(t)*rr*.85;if(i===0)p.moveTo(x,y);else p.lineTo(x,y);}p.closePath();},g,'#747a61',2);
      else oval(c,Math.cos(angle)*r*.42,Math.sin(angle)*r*.40,r*.43,r*.34,g,angle,'#7c8064',1.5);
      c.restore();
    }
    for(let i=0;i<7;i++) {
      const angle=i*2.4,rr=r*.5;
      oval(c,Math.cos(angle)*rr,Math.sin(angle)*rr*.75,18,11,'rgba(228,207,161,.13)',angle);
    }
    if(parts===1) {
      for(let i=0;i<32;i++) {
        const angle=i*TAU/32,wp=weakpoints[i%Math.max(1,weakpoints.length)],loose=wp?wp.progress:0;
        const inner=r*(.14+Math.sin(i*2.8)*.06),outer=r*(.83+Math.sin(i*3.9)*.035);
        const sx=Math.cos(angle)*inner,sy=Math.sin(angle)*inner*.8,ex=Math.cos(angle)*outer,ey=Math.sin(angle)*outer*.8;
        const slack=Math.sin(i*1.8)*9+loose*20,alpha=.13+(1-loose)*.17;
        shape(c,p=>{p.moveTo(sx,sy);p.bezierCurveTo(sx-slack,sy+20+loose*9,ex+slack,ey-18-loose*5,ex,ey);},null,'rgba(224,208,166,'+alpha+')',1.1+loose*.5);
      }
      weakpoints.forEach((wp,i)=>{
        const progress=clamp(wp.progress,0,1);if(progress<=0)return;
        const px=wp.x-a.x,py=wp.y-a.y;
        for(let k=0;k<5;k++) {
          const angle=k*2.3+i,spread=8+progress*21,dx=Math.cos(angle)*spread,dy=Math.sin(angle)*spread*.7;
          shape(c,p=>{p.moveTo(px+dx-3,py+dy);p.quadraticCurveTo(px+dx+4,py+dy-8-progress*5,px+dx+9,py+dy-2);p.lineTo(px+dx+4,py+dy+3);p.closePath();},'rgba(210,193,145,'+(.13+progress*.44)+')');
          shape(c,p=>{p.moveTo(px,py);p.quadraticCurveTo(px+dx*.45+6,py+dy*.45-4,px+dx,py+dy);},null,'rgba(244,222,171,'+progress*.6+')',1+progress*2);
        }
      });
    }
    const crack=2+soft*6;
    shape(c,p=>{p.moveTo(-35,-r*.75);p.lineTo(-15,-20);p.lineTo(12,0);p.lineTo(-16,27);p.lineTo(-5,r*.7);p.moveTo(12,0);p.lineTo(r*.65,-25);},null,soft>.3?'#ead4a0':'#626e5a',crack);
    c.restore();
    if(!burst)(s.weakpoints||[]).forEach((p,i)=>{
      if(!p.scanned&&!p.complete)return;
      glow(c,p.x,p.y,30,p.complete?'rgba(247,218,124,.65)':'rgba(237,155,113,.45)');
      oval(c,p.x,p.y,12,12,p.complete?'#e7ce8b':'#db9a77',0,p.complete?'#a18540':'#8f5a47',2);
      if(!hideLabels)label(c,p.complete?'✓':String(i+1),p.x,p.y,13,p.complete?'#796734':'#733f34',700);
      if(p.progress>0&&!p.complete)shape(c,a=>a.arc(p.x,p.y,18,-Math.PI/2,-Math.PI/2+TAU*p.progress),null,'#ffe4a0',4);
    });
    if(!hideLabels&&s.scanner)worldBadge(labels,'纤维性血栓 · '+Math.round(soft*100)+'% 已软化',a.x,a.y,0,r*.65+30,'#735f43');
  }
  function hunter(c,e,s,hideLabels,labels) {
    if(e.hp<=0)return;
    const purify=clamp(e.purifyProgress||0,0,1);
    c.save();c.globalAlpha=1-purify*.90;
    if(purify>0){
      glow(c,e.x,e.y,48+purify*45,'rgba(255,223,148,'+(.40*purify)+')');
      for(let i=0;i<8;i++){
        const a=i*TAU/8,dist=25+purify*44;
        oval(c,e.x+Math.cos(a)*dist,e.y+Math.sin(a)*dist,2.6*(1-purify)+.8,4*(1-purify)+1,'rgba(240,205,125,.85)',a);
      }
    }
    if(!purify&&e.target&&(e.state==='telegraph'||e.state==='lunge')) {
      c.save();c.setLineDash([7,7]);line(c,[e,e.target],e.state==='lunge'?'rgba(178,80,72,.75)':'rgba(175,101,81,.65)',3);c.setLineDash([]);
      oval(c,e.target.x,e.target.y,34,34,'rgba(180,87,72,.11)',0,'#ae715c',2);c.restore();
    }
    const squeeze=e.state==='telegraph'?1-e.telegraph*.20:1;
    oval(c,e.x,e.y+17,28,10,'rgba(77,65,76,.19)');
    glow(c,e.x,e.y,44,e.hitFlash?'rgba(248,221,154,.6)':'rgba(158,123,161,.20)');
    oval(c,e.x,e.y,25*squeeze,25/squeeze,e.hitFlash?'#e7c29e':'#b2a0b1',0,'#817188',2);
    for(let i=0;i<7;i++){const a=i*TAU/7;oval(c,e.x+Math.cos(a)*23,e.y+Math.sin(a)*23,4,7,'#9f8ca2',a);}
    oval(c,e.x+5,e.y-3,8,10,'#806b8c');
    if(s.scanner&&e.weakpoint){const w=e.weakpoint;glow(c,w.x,w.y,20,'rgba(255,209,113,.6)');oval(c,w.x,w.y,w.radius||11,w.radius||11,'#f0cb7e',0,'#fff0b5',1.8);}
    if(!hideLabels&&!purify&&e.state==='telegraph')worldBadge(labels,'扑击预警',e.x,e.y,0,-38,'#a16450');
    c.restore();
  }
  function spawnTelegraphs(c,s,hideLabels,labels,reduced) {
    (s.spawnTelegraphs||[]).forEach(w=>{
      const progress=clamp(w.progress||0,0,1),r=w.radius||34;
      c.save();
      glow(c,w.x,w.y,r*1.8,'rgba(178,105,89,.18)');
      oval(c,w.x,w.y,r,r,'rgba(172,104,88,.13)',0,'#ab755c',1.5);
      c.setLineDash([4,5]);oval(c,w.x,w.y,r+8,r+8,null,0,'rgba(151,91,77,.55)',1.3);c.setLineDash([]);
      shape(c,p=>p.arc(w.x,w.y,r+3,-Math.PI/2,-Math.PI/2+TAU*progress),null,'#ba7d51',3);
      const pinch=reduced?0:(1-progress)*9;
      for(let i=0;i<3;i++){
        const angle=i*TAU/3-Math.PI/2,x=w.x+Math.cos(angle)*(12+pinch),y=w.y+Math.sin(angle)*(12+pinch);
        oval(c,x,y,3,7,'#b28b8d',angle);
      }
      label(c,'!',w.x,w.y,18,'#92634e',700);
      if(!hideLabels)worldBadge(labels,'异常信号 · 即将出现',w.x,w.y,0,-55,'#94664f',12);
      c.restore();
    });
  }
  function medicalCross(c,x,y,size,color) {
    c.fillStyle=color;c.fillRect(x-size*.16,y-size*.5,size*.32,size);c.fillRect(x-size*.5,y-size*.16,size,size*.32);
  }
  function medicLimb(c,points,color,width) {
    c.save();c.lineCap='round';c.lineJoin='round';
    line(c,points,'#396a5d',width+2.3);line(c,points,color,width);c.restore();
  }
  function player(c,s,time,reduced,hideLabels,labels) {
    const p=s.player,a=Math.atan2(s.aim.y-p.y,s.aim.x-p.x),rotation=a+Math.PI/2;
    const velocity=p.velocity||{x:0,y:0},moving=!!p.moving&&Math.hypot(velocity.x,velocity.y)>.01;
    const stride=reduced?0:Math.sin((p.walkDistance||0)*.115)*(moving?1:0);
    const breath=reduced?0:Math.sin(time*2.8)*.50;
    const firing=!!s.shot&&s.shot.age<.16,shotKick=firing&&!reduced?(1-clamp(s.shot.age/.16,0,1))*2.6:0;
    const reloading=s.reloadRemaining>0,reloadProgress=reloading?clamp(s.reloadProgress===undefined?1-s.reloadRemaining/1.7:s.reloadProgress,0,1):0;
    const stage=reloading?(s.reloadStage||(reloadProgress<.45/1.7?'eject':reloadProgress<1.25/1.7?'insert':'lock')):'idle';
    const ammo=s.ammo===undefined?24:s.ammo,toolLight=reloading?stage==='lock'?'#f4d582':'#dfae78':ammo===0?'#c16e59':ammo<=6?'#d4a04d':'#a9dcc2';
    const motionAngle=moving?Math.atan2(velocity.y,velocity.x)+Math.PI/2:rotation;
    c.save();
    if(s.scanner){const r=90+s.beat.phase*50;oval(c,p.x,p.y,r,r,null,0,'rgba(66,137,111,'+(.28-s.beat.phase*.16)+')',1.5);}
    if(p.dashing&&!reduced)for(let i=1;i<=5;i++)oval(c,p.x-Math.cos(a)*i*12,p.y-Math.sin(a)*i*12,16-i*2,11-i,'rgba(240,201,112,'+(.35-i*.05)+')',a);
    glow(c,p.x,p.y,43,'rgba(255,242,183,.48)');oval(c,p.x,p.y+16,25,11,'rgba(48,80,64,.24)');
    c.translate(p.x,p.y);if(p.invulnerable)c.globalAlpha=reduced?.78:Math.floor(time*12)%2?.58:1;
    // Legs follow the actual movement vector; the independent upper body aims
    // down the simulation's unchanged centre ray, including while strafing.
    c.save();c.rotate(motionAngle);
    [-1,1].forEach(side=>{
      const step=stride*side,kneeY=18+step*3,footY=27+step*6;
      medicLimb(c,[{x:side*6,y:8},{x:side*8,y:kneeY},{x:side*8,y:footY}],'#c2d1b5',7.5);
      oval(c,side*8,footY+1,5.5,8,'#365f53',-.12*side,'#244e44',1.2);
      line(c,[{x:side*8-3,y:footY-1},{x:side*8+3,y:footY-1}],'#d6dabc',1.5);
    });c.restore();
    c.save();c.rotate(rotation);c.translate(0,breath+Math.abs(stride)*.5);
    // A separate medicine pack, straps, helmet, skin and gloves make the small
    // silhouette read as a person even at the widest camera zoom.
    round(c,-13,4,26,20,6);c.fillStyle='#7e9f83';c.fill();c.strokeStyle='#3c6c5b';c.lineWidth=2;c.stroke();
    round(c,-10,11,20,11,3);c.fillStyle='#d8dfbc';c.fill();
    medicalCross(c,0,16.5,7,'#b7755c');
    [-1,1].forEach(side=>{round(c,side*15-3,7,6,12,2);c.fillStyle='#d8c493';c.fill();c.strokeStyle='#708a6a';c.lineWidth=1;c.stroke();});
    shape(c,q=>{q.moveTo(-10,-4);q.quadraticCurveTo(0,-8,10,-4);q.lineTo(13,12);q.quadraticCurveTo(0,19,-13,12);q.closePath();},'#f5edcf','#477765',1.8);
    [-1,1].forEach(side=>line(c,[{x:side*8,y:-3},{x:side*7,y:12}],'#91a888',2.7));
    // The treatment nozzle remains on x=0 in aim space: visual recoil never
    // introduces a second, offset targeting line.
    let left={x:-5,y:-22+shotKick},right={x:5,y:-17+shotKick},cartridge=null;
    const reloadTime=reloadProgress*1.7;
    if(stage==='eject'){
      const t=clamp(reloadTime/.45,0,1);left={x:-5-t*13,y:-14+t*14};cartridge={x:left.x,y:left.y-1,angle:-t*.65};
    }else if(stage==='insert'){
      const t=clamp((reloadTime-.45)/.8,0,1),ease=t*t*(3-2*t);left={x:-20+ease*15,y:13-ease*27};cartridge={x:left.x,y:left.y-1,angle:-.55*(1-ease)};
    }else if(stage==='lock'){
      const t=clamp((reloadTime-1.25)/.45,0,1);left={x:-5,y:-14-Math.sin(t*Math.PI)*7};right={x:5,y:-16};
    }
    medicLimb(c,[{x:-12,y:0},{x:-17,y:-8},{x:left.x,y:left.y}],'#e8e4c7',6);
    medicLimb(c,[{x:12,y:0},{x:16,y:-9},{x:right.x,y:right.y}],'#e8e4c7',6);
    c.save();c.translate(0,shotKick);
    round(c,-5,-30,10,18,3);c.fillStyle='#d9e4ce';c.fill();c.strokeStyle='#3d7462';c.lineWidth=1.7;c.stroke();
    round(c,-3.3,-35,6.6,8,2);c.fillStyle='#558b76';c.fill();
    line(c,[{x:-2,y:-33},{x:2,y:-33}],'#e4e8c5',1.7);
    round(c,-2.5,-27,5,9,1.5);c.fillStyle=toolLight;c.fill();
    if(!reloading||stage==='lock'){round(c,-7,-18,6,7,1.5);c.fillStyle=ammo===0?'#b4b69e':'#d9b96e';c.fill();}
    if(stage==='lock')glow(c,0,-24,15,'rgba(246,211,123,.45)');
    if(firing){glow(c,0,-35,16,'rgba(255,225,147,.75)');oval(c,0,-35,4,5,'#fff0b9');}
    c.restore();
    if(cartridge){c.save();c.translate(cartridge.x,cartridge.y);c.rotate(cartridge.angle);round(c,-3,-5,6,10,1.5);c.fillStyle='#ecd18e';c.fill();c.strokeStyle='#aa8b4e';c.lineWidth=1;c.stroke();line(c,[{x:-2,y:-1},{x:2,y:-1}],'#fff0b8',1.3);c.restore();}
    [left,right].forEach(hand=>{oval(c,hand.x,hand.y,4,4.5,'#b4d2bd',-.15,'#4f806b',1.3);});
    // The warm face sits beneath a curved medical helmet and a narrow visor.
    oval(c,0,-8,10,10,'#d9b58c',0,'#447565',1.5);
    oval(c,0,-4,12,11,'#eee7c9',0,'#3d7360',1.8);
    shape(c,q=>{q.moveTo(-11,-9);q.quadraticCurveTo(0,-18,11,-9);q.lineTo(10,-4);q.quadraticCurveTo(0,-8,-10,-4);q.closePath();},'#f8f0d5','#638d75',1.2);
    oval(c,0,-9,8.5,5.5,'#dfba91');
    round(c,-8.5,-14,17,6,2.5);c.fillStyle='#386b60';c.fill();
    line(c,[{x:-6,y:-12},{x:-1,y:-13}],'#b0ddd0',1.5);line(c,[{x:2,y:-12},{x:5,y:-12}],'#8fc8b8',1.2);
    round(c,-5.5,-7.5,11,4.2,1.5);c.fillStyle='#cce0cd';c.fill();
    medicalCross(c,0,0,7,'#b97458');
    c.restore();
    c.restore();
    if(reloading){
      const x=p.x,y=p.y-54,r=13;
      oval(c,x,y,r+4,r+4,'rgba(249,244,223,.96)',0,'rgba(71,116,94,.32)',1);
      oval(c,x,y,r,r,null,0,'#c8d1b0',3);
      shape(c,q=>q.arc(x,y,r,-Math.PI/2,-Math.PI/2+TAU*reloadProgress),null,stage==='lock'?'#bf9a4c':'#4c8b70',3.5);
      [0,.45/1.7,1.25/1.7].forEach(t=>{const a=-Math.PI/2+t*TAU;line(c,[{x:x+Math.cos(a)*10,y:y+Math.sin(a)*10},{x:x+Math.cos(a)*16,y:y+Math.sin(a)*16}],'#f9f4df',1.5);});
      medicalCross(c,x,y,8,stage==='lock'?'#af8a42':'#5f9278');
      if(!hideLabels)worldBadge(labels,stage==='eject'?'取出药匣':stage==='insert'?'插入新匣':'加压就绪',x,y,0,-29,'#617e60',12);
    }else if(ammo<=6){
      if(reduced||ammo===0||Math.sin(time*5)>.1)oval(c,p.x,p.y,35,35,null,0,ammo===0?'rgba(173,96,70,.72)':'rgba(188,143,65,.56)',1.7);
      if(!hideLabels)worldBadge(labels,ammo===0?'药匣已空 · R 装填':'药剂余量 '+ammo+' · R 装填',p.x,p.y,0,-56,ammo===0?'#a26950':'#9a7b42',12);
    }
    const aim=s.aim;
    oval(c,aim.x,aim.y,s.precision?8:12,s.precision?8:12,null,0,s.precision?'#a57e38':'#3d7b67',1.6);
    [-1,1].forEach(k=>{line(c,[{x:aim.x+k*17,y:aim.y},{x:aim.x+k*8,y:aim.y}],'#457b66',1.4);line(c,[{x:aim.x,y:aim.y+k*17},{x:aim.x,y:aim.y+k*8}],'#457b66',1.4);});
  }
  function barrier(c,o,s,hideLabels,labels) {
    const unlocked=s.dashUnlocked;
    c.save();c.setLineDash(unlocked?[9,9]:[]);
    round(c,o.x,o.y,o.w,o.h,14);c.fillStyle=unlocked?'rgba(220,199,128,.16)':'rgba(119,151,112,.45)';c.fill();c.strokeStyle=unlocked?'#b39650':'#79966e';c.lineWidth=2;c.stroke();c.setLineDash([]);
    for(let i=0;i<o.w/58;i++){const x=o.x+25+i*58;if(unlocked)line(c,[{x:x-5,y:o.y+o.h/2+5},{x,y:o.y+o.h/2-5},{x:x+5,y:o.y+o.h/2+5}],'#a58a47',2);else leaf(c,x,o.y+o.h,42,-.15,'#98b08a');}
    if(!hideLabels)worldBadge(labels,unlocked?'Space · 循环冲刺':'尚未苏醒的循环屏障',o.x+o.w/2,o.y+o.h/2,0,-29,unlocked?'#987a39':INK);c.restore();
  }
  function growth(c,g,s,hideLabels,labels) {
    if(!g)return;
    const state=g.state||'dormant',suppressed=state==='suppressed',regrowing=state==='regrowing';
    const r=(g.radius||24)*(suppressed?.35:regrowing?.75+.25*s.beat.pulse:1),x=g.x,y=g.y;
    glow(c,x,y,68,suppressed?'rgba(183,209,152,.25)':'rgba(174,124,165,.24)');
    for(let i=0;i<6;i++){const a=i*TAU/6;oval(c,x+Math.cos(a)*r*.6,y+Math.sin(a)*r*.6,r*.6,r*.5,suppressed?'#a7b498':'#a28ca1',a,'#89788c',1.3);}
    oval(c,x,y,r*.52,r*.52,suppressed?'#c9c6a2':'#816a8c');
    if(g.progress>0&&!suppressed&&!regrowing)shape(c,p=>p.arc(x,y,r+9,-Math.PI/2,-Math.PI/2+TAU*g.progress),null,'#edce81',4);
    if(!hideLabels&&(s.scanner||g.scanned||s.stage==='ending'))worldBadge(labels,regrowing?'同一组织 · 再次生长':suppressed?'已暂时压制':g.scanned?'异常组织 · 特征未知':'未知生物信号',x,y,0,44,regrowing?'#8b5f83':INK);
  }
  function toolPalette(result) {
    if(result.weakpoint)return { color:'#b88a32',light:'#fff0b2',shape:'weakpoint' };
    if(result.hitType==='treatment'||result.kind==='treatment')return { color:'#428c77',light:'#dff0c2',shape:'treatment' };
    if(result.blocked||result.hitType==='wall'||result.hitType==='clot'||result.kind==='blocked')return { color:'#968568',light:'#ead8ac',shape:'wall' };
    if(result.hitType==='hunter')return { color:'#b4745a',light:'#f8d7ab',shape:'hunter' };
    if(result.hitType==='undiagnosed'||result.kind==='warning')return { color:'#9b7b57',light:'#f1ddb1',shape:'unknown' };
    return { color:'#72917f',light:'#e5eac7',shape:'none' };
  }
  function toolRay(c,result,preview) {
    if(!result||!result.from||!result.to)return;
    const palette=toolPalette(result),p=result.to,a=Math.atan2(p.y-result.from.y,p.x-result.from.x);
    const distance=Math.hypot(p.x-result.from.x,p.y-result.from.y),nozzle=Math.min(35,distance);
    // Keep the rendered beam collinear with the shared query. The hidden
    // centre-to-nozzle section cannot imply a second muzzle collision query.
    const from={x:result.from.x+Math.cos(a)*nozzle,y:result.from.y+Math.sin(a)*nozzle};
    c.save();c.lineCap='round';
    if(preview)c.setLineDash([4,7]);
    line(c,[from,p],palette.color,preview?1.8:4.5);
    c.setLineDash([]);
    if(!preview)line(c,[from,p],palette.light,1.4);
    if(palette.shape==='weakpoint') {
      const r=preview?10:14;
      shape(c,q=>{q.moveTo(p.x,p.y-r);q.lineTo(p.x+r,p.y);q.lineTo(p.x,p.y+r);q.lineTo(p.x-r,p.y);q.closePath();},null,palette.color,2);
      oval(c,p.x,p.y,3.5,3.5,palette.light,0,palette.color,1);
    } else if(palette.shape==='treatment') {
      oval(c,p.x,p.y,preview?9:13,preview?9:13,null,0,palette.color,2);
      line(c,[{x:p.x-5,y:p.y},{x:p.x+5,y:p.y}],palette.color,2);
      line(c,[{x:p.x,y:p.y-5},{x:p.x,y:p.y+5}],palette.color,2);
    } else if(palette.shape==='wall') {
      const dx=-Math.sin(a)*9,dy=Math.cos(a)*9;
      line(c,[{x:p.x-dx,y:p.y-dy},{x:p.x+dx,y:p.y+dy}],palette.color,3);
      if(!preview)oval(c,p.x,p.y,11,11,null,0,palette.light,2);
    } else if(palette.shape==='hunter') {
      [-1,1].forEach(k=>line(c,[{x:p.x-6,y:p.y-6*k},{x:p.x+6,y:p.y+6*k}],palette.color,2));
      if(!preview)oval(c,p.x,p.y,13,13,null,0,palette.light,1.8);
    } else if(palette.shape==='unknown') {
      shape(c,q=>{q.moveTo(p.x,p.y-10);q.lineTo(p.x+9,p.y+7);q.lineTo(p.x-9,p.y+7);q.closePath();},null,palette.color,1.8);
    } else oval(c,p.x,p.y,preview?5:7,preview?5:7,null,0,palette.color,1.5);
    c.restore();
  }
  function preview(c,s,hideLabels,labels) {
    const result=s.precision&&s.toolPreview;if(!result)return;
    toolRay(c,result,true);
    if(!hideLabels&&result.label)worldBadge(labels,result.label,result.to.x,result.to.y,0,-29,toolPalette(result).color,13);
  }
  function edgeGuidance(c,s,v) {
    const guidance=s.guidance;if(!guidance||!guidance.target)return;
    const p=v.viewport,cam=v.camera,t=guidance.target,cx=p.x+p.w/2,cy=p.y+p.h/2;
    const tx=cx+(t.x-cam.x)*cam.zoom,ty=cy+(t.y-cam.y)*cam.zoom;
    if(tx>=p.x+12&&tx<=p.x+p.w-12&&ty>=p.y+12&&ty<=p.y+p.h-12)return;
    const dx=tx-cx,dy=ty-cy;
    const scale=Math.min((p.w/2-32)/Math.max(1,Math.abs(dx)),(p.h/2-32)/Math.max(1,Math.abs(dy)));
    const x=cx+dx*scale,y=cy+dy*scale,angle=Math.atan2(dy,dx),color=guidance.waiting?'#9c7e49':'#6c9478';
    c.save();
    glow(c,x,y,37,'rgba(241,229,174,.50)');
    oval(c,x,y,20,20,'rgba(250,246,226,.93)',0,'rgba(126,150,112,.45)',1);
    c.translate(x,y);c.rotate(angle);
    shape(c,q=>{q.moveTo(8,0);q.lineTo(-5,-6);q.lineTo(-2,0);q.lineTo(-5,6);q.closePath();},color);
    c.restore();
    const text=t.label||guidance.label||'下一连接端',size=14;
    c.font='600 '+size+'px '+FONT;
    const half=Math.max(19,c.measureText(text).width/2+11);
    let bx=x-Math.cos(angle)*(half+30),by=y-Math.sin(angle)*34;
    bx=clamp(bx,p.x+half+8,p.x+p.w-half-8);by=clamp(by,p.y+24,p.y+p.h-24);
    badge(c,text,bx,by,color,size);
  }
  function worldEffects(c,s,time) {
    if(s.shot&&s.shot.age<.2){c.save();c.globalAlpha=1-s.shot.age/.2;toolRay(c,s.shot,false);c.restore();}
    if(s.stage==='burst')for(let i=0;i<35;i++){const x=800+Math.sin(i*2.7)*90,y=1000-((i*43+s.burst*520)%1050);line(c,[{x,y:y+40},{x:x+4,y:y-25}],'rgba(255,231,166,.77)',i%3?3:6);}
    if(s.stage==='recovery') {const t=s.recovery;if(t>.65){const r=(t-.65)*240;oval(c,900,700,r,r*.65,null,0,'rgba(255,221,139,'+Math.max(0,.6-t*.07)+')',5);glow(c,900,700,220+s.beat.pulse*70,'rgba(255,221,133,.20)');}}
    if(s.heartConnected)for(let i=0;i<22;i++){const x=180+(i*137)%1450,y=1080-((i*97+time*17)%980);oval(c,x,y,i%3?1.8:3,i%3?1.8:3,'rgba(231,180,78,.55)');}
  }
  function recoveryWeight(x,y,anchor) {
    const distance=Math.pow((x-anchor.x)/anchor.rx,2)+Math.pow((y-anchor.y)/anchor.ry,2);
    return distance<1?Math.pow(1-distance,2):0;
  }
  function recoveryPose(time,reduced) {
    const awakening=smooth(1.85,3.85,time),ecology=smooth(3.85,6,time);
    // The first deep breath resolves into a slow, regular resting breath.
    // Reduced motion is a single soft change of posture, with no oscillation.
    const first=Math.sin(clamp(time/2.6,0,1)*Math.PI),rest=Math.sin(Math.max(0,time-2.6)*TAU/4.4);
    return { time,reduced,awakening,ecology,breath:reduced?smooth(0,3,time)*.22:first*.95+rest*smooth(2.6,4.3,time)*.25 };
  }
  function recoveryPoint(x,y,pose) {
    const chest=RECOVERY_ART.chest,shoulder=RECOVERY_ART.shoulder,hand=RECOVERY_ART.hand;
    const breathing=recoveryWeight(x,y,chest)*pose.breath;
    let dx=(x-chest.x)*breathing*.045,dy=-breathing*.019;
    dy-=recoveryWeight(x,y,shoulder)*pose.breath*.007;
    const relax=recoveryWeight(x,y,hand)*pose.awakening;
    dx+=relax*.008;dy+=relax*.006;
    RECOVERY_ART.fingers.forEach(finger=>{
      const spread=recoveryWeight(x,y,finger)*pose.awakening;
      dx+=spread*.009*finger.spread;dy+=spread*.012;
    });
    if(!pose.reduced)RECOVERY_ART.trees.forEach((tree,index)=>{
      const sway=recoveryWeight(x,y,tree)*pose.ecology;
      dx+=sway*Math.sin(pose.time*1.1+index*1.9)*.0017;
    });
    return {x:x+dx,y:y+dy};
  }
  function recoveryMesh(image) {
    let mesh=recoveryMeshes.get(image);if(mesh)return mesh;
    const columns=34,rows=24;
    mesh={columns,rows,vertices:[]};
    for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++)mesh.vertices.push({x:col/columns,y:row/rows});
    recoveryMeshes.set(image,mesh);return mesh;
  }
  function recoveryTriangle(c,img,a,b,d,aa,bb,dd) {
    // Affine texture mapping in small triangles, with subpixel overlap to close
    // Canvas clipping seams. The cropped source keeps each draw inexpensive.
    const determinant=(b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x);if(Math.abs(determinant)<.00001)return;
    const m11=((bb.x-aa.x)*(d.y-a.y)-(dd.x-aa.x)*(b.y-a.y))/determinant;
    const m12=((bb.y-aa.y)*(d.y-a.y)-(dd.y-aa.y)*(b.y-a.y))/determinant;
    const m21=((dd.x-aa.x)*(b.x-a.x)-(bb.x-aa.x)*(d.x-a.x))/determinant;
    const m22=((dd.y-aa.y)*(b.x-a.x)-(bb.y-aa.y)*(d.x-a.x))/determinant;
    const cx=(aa.x+bb.x+dd.x)/3,cy=(aa.y+bb.y+dd.y)/3;
    const expanded=[aa,bb,dd].map(vertex=>{const distance=Math.hypot(vertex.x-cx,vertex.y-cy)||1;return {x:vertex.x+(vertex.x-cx)/distance*.42,y:vertex.y+(vertex.y-cy)/distance*.42};});
    c.save();c.beginPath();c.moveTo(expanded[0].x,expanded[0].y);c.lineTo(expanded[1].x,expanded[1].y);c.lineTo(expanded[2].x,expanded[2].y);c.closePath();c.clip();
    c.transform(m11,m12,m21,m22,aa.x-m11*a.x-m21*a.y,aa.y-m12*a.x-m22*a.y);
    const sx=Math.max(0,Math.min(a.x,b.x,d.x)-1),sy=Math.max(0,Math.min(a.y,b.y,d.y)-1);
    const sw=Math.min(img.width-sx,Math.max(a.x,b.x,d.x)-sx+1),sh=Math.min(img.height-sy,Math.max(a.y,b.y,d.y)-sy+1);
    c.drawImage(img,sx,sy,sw,sh,sx,sy,sw,sh);c.restore();
  }
  function recoveryGiant(c,img,pose) {
    const mesh=recoveryMesh(img),columns=mesh.columns,rows=mesh.rows;
    const points=mesh.vertices.map(p=>{const at=recoveryPoint(p.x,p.y,pose);return {x:at.x*img.width,y:at.y*img.height};});
    const source=index=>({x:mesh.vertices[index].x*img.width,y:mesh.vertices[index].y*img.height});
    const moved=index=>Math.abs(points[index].x-mesh.vertices[index].x*img.width)+Math.abs(points[index].y-mesh.vertices[index].y*img.height)>.015;
    // Unchanged cells share one draw per run. The local mesh never deforms the
    // valley and avoids spending hundreds of texture draws on empty pixels.
    for(let row=0;row<rows;row++){
      let staticStart=-1;
      const flush=end=>{if(staticStart<0)return;const sx=staticStart*img.width/columns,sy=row*img.height/rows,sw=(end-staticStart)*img.width/columns,sh=img.height/rows;c.drawImage(img,sx,sy,sw,sh,sx,sy,sw,sh);staticStart=-1;};
      for(let col=0;col<columns;col++){
        const a=row*(columns+1)+col,b=a+1,d=a+columns+1,e=d+1;
        if(!moved(a)&&!moved(b)&&!moved(d)&&!moved(e)){if(staticStart<0)staticStart=col;continue;}
        flush(col);recoveryTriangle(c,img,source(a),source(b),source(e),points[a],points[b],points[e]);recoveryTriangle(c,img,source(a),source(e),source(d),points[a],points[e],points[d]);
      }
      flush(columns);
    }
  }
  function recoveryEyePatch(image) {
    let patch=recoveryEyePatches.get(image);if(patch)return patch;
    const eyes=RECOVERY_ART.eyes,x=Math.floor(Math.min(...eyes.map(eye=>(eye.x-eye.rx)*image.width)));
    const y=Math.floor(Math.min(...eyes.map(eye=>(eye.y-eye.ry)*image.height)));
    const width=Math.ceil(Math.max(...eyes.map(eye=>(eye.x+eye.rx)*image.width)))-x;
    const height=Math.ceil(Math.max(...eyes.map(eye=>(eye.y+eye.ry)*image.height)))-y;
    const canvas=document.createElement('canvas'),mask=document.createElement('canvas');
    canvas.width=mask.width=width;canvas.height=mask.height=height;
    const context=canvas.getContext('2d'),maskContext=mask.getContext('2d');
    context.drawImage(image,x,y,width,height,0,0,width,height);
    eyes.forEach(eye=>{
      maskContext.save();maskContext.translate(eye.x*image.width-x,eye.y*image.height-y);maskContext.scale(eye.rx*image.width,eye.ry*image.height);
      const feather=maskContext.createRadialGradient(0,0,0,0,0,1);feather.addColorStop(0,'#fff');feather.addColorStop(.63,'#fff');feather.addColorStop(1,'rgba(255,255,255,0)');
      maskContext.fillStyle=feather;maskContext.fillRect(-1,-1,2,2);maskContext.restore();
    });
    context.globalCompositeOperation='destination-in';context.drawImage(mask,0,0);
    patch={canvas,x:x/image.width,y:y/image.height,w:width/image.width,h:height/image.height};
    recoveryEyePatches.set(image,patch);return patch;
  }
  function recoveryEcology(c,pose,width,height,pulse) {
    RECOVERY_ART.windows.forEach((window,index)=>{
      const light=smooth(3.8+index*.16,5.15+index*.10,pose.time);if(!light)return;
      const at=recoveryPoint(window[0],window[1],pose),x=at.x*width,y=at.y*height;
      c.save();c.globalAlpha=light;glow(c,x,y,width*.012,'rgba(255,212,126,.31)');
      oval(c,x,y,width*.0013,height*.0031,'rgba(255,230,161,'+(.70+(pose.reduced?0:pulse*.15))+')');c.restore();
    });
    if(pose.reduced)return;
    const start=RECOVERY_ART.birdOrigin;
    for(let index=0;index<4;index++){
      const flight=clamp((pose.time-4.12-index*.20)/3.2,0,1);if(flight<=0||flight>=1)continue;
      const x=(start.x+flight*.28+index*.016)*width,y=(start.y-flight*.22+Math.sin(flight*Math.PI)*-.025+index*.014)*height;
      const flap=Math.sin(pose.time*7+index*1.6),wing=width*(.0032+index*.0003),alpha=smooth(0,.12,flight)*(1-smooth(.78,1,flight));
      c.save();c.globalAlpha=alpha*.72;c.lineWidth=Math.max(.8,width*.00085);c.strokeStyle='#526e5d';c.lineCap='round';
      c.beginPath();c.moveTo(x-wing,y-flap*wing*.55);c.quadraticCurveTo(x-wing*.35,y-wing*.30,x,y);c.quadraticCurveTo(x+wing*.35,y-wing*.30,x+wing,y-flap*wing*.55);c.stroke();c.restore();
    }
  }
  function recoveryCaptions(c,p,time) {
    const first=time<2?'山谷间，传来一次深长的呼吸':time<4?'他缓缓睁开眼，手指也舒展开来':time<6?'林梢轻动，沉睡的村落重新亮起灯火':'心脏已稳定 · 肺部仍在等待巡诊';
    const size=p.w<650?14:18;
    badge(c,first,p.x+p.w/2,p.y+p.h-59,INK,size);
    badge(c,'巨人初步苏醒 · 下一程，呼吸系统',p.x+p.w/2,p.y+p.h-26,'#8c7350',p.w<650?11:12);
  }
  function exterior(c,s,v) {
    const p=v.viewport,assets=window.GiantCureAssets&&window.GiantCureAssets.images||{};
    const layered=!!(assets.recoveryValley&&assets.recoveryGiant&&assets.recoveryEyes);
    const img=layered?assets.recoveryValley:assets.exterior;
    const recovery=s.exteriorRecovery||{},time=clamp(Number(recovery.elapsed)||0,0,Number(recovery.duration)||8);
    const reduced=!!(v.reducedMotion||s.reducedMotion),pose=recoveryPose(time,reduced),pulse=clamp(s.beat&&s.beat.pulse||0,0,1);
    c.save();round(c,p.x,p.y,p.w,p.h,16);c.clip();c.fillStyle=PAPER;c.fillRect(p.x,p.y,p.w,p.h);
    if(img){
      const cover=Math.max(p.w/img.width,p.h/img.height),cw=img.width*cover,ch=img.height*cover;
      c.save();c.filter='blur(20px)';c.globalAlpha=.35;c.drawImage(img,p.x+(p.w-cw)/2,p.y+(p.h-ch)/2,cw,ch);c.restore();
      // Contain every layer as one frame: face, chest and near hand remain in
      // view on narrow displays as well as the landscape game viewport.
      const pullback=reduced?1:1-smooth(6,8,time)*.035;
      const scale=Math.min(p.w/img.width,p.h/img.height)*pullback,w=img.width*scale,h=img.height*scale,x=p.x+(p.w-w)/2,y=p.y+(p.h-h)/2;
      c.save();c.translate(x,y);c.scale(scale,scale);c.drawImage(img,0,0);
      if(layered){
        c.save();c.scale(img.width/assets.recoveryGiant.width,img.height/assets.recoveryGiant.height);recoveryGiant(c,assets.recoveryGiant,pose);c.restore();
        if(pose.awakening>0){
          const eyes=recoveryEyePatch(assets.recoveryEyes);
          c.save();c.globalAlpha=pose.awakening;c.drawImage(eyes.canvas,eyes.x*img.width,eyes.y*img.height,eyes.w*img.width,eyes.h*img.height);c.restore();
        }
        recoveryEcology(c,pose,img.width,img.height,pulse);
      }
      const chest=layered?recoveryPoint(RECOVERY_ART.chest.x,RECOVERY_ART.chest.y,pose):{x:.52,y:.52},light=reduced?.24+smooth(0,5,time)*.12:.20+pulse*.18;
      glow(c,chest.x*img.width,chest.y*img.height,img.width*(.045+(reduced?0:pulse*.012)),'rgba(255,214,137,'+light+')');
      c.restore();
    }
    // The short ending fade is driven by the same paused simulation clock.
    const fade=smooth(7.65,8,time);if(fade){c.fillStyle='rgba(245,240,223,'+(fade*.48)+')';c.fillRect(p.x,p.y,p.w,p.h);}
    if(!v.hideLabels)recoveryCaptions(c,p,time);
    c.restore();
  }
  function draw(c,s,time,view) {
    if(!s||!s.player)return;
    const size=s.worldSize||{width:s.room==='heart'?1800:1600,height:s.room==='heart'?1200:1000};
    const v=view||{viewport:{x:24,y:84,w:1232,h:552},camera:{x:size.width/2,y:size.height/2,zoom:.65}};
    const p=v.viewport,cam=v.camera,hide=!!v.hideLabels,labels=[];
    const reduced=!!(s.reducedMotion||v.reducedMotion),simulationTime=Number.isFinite(s.elapsed)?s.elapsed:time;
    if(s.endingScene==='exterior'){exterior(c,s,v);return;}
    c.save();round(c,p.x,p.y,p.w,p.h,16);c.clip();
    c.translate(p.x+p.w/2,p.y+p.h/2);c.scale(cam.zoom,cam.zoom);c.translate(-cam.x,-cam.y);
    drawBackground(c,s,reduced?0:simulationTime);links(c,s);
    (s.portals||[]).forEach(a=>portal(c,a,s,hide,labels));(s.nodes||[]).forEach(a=>node(c,a,s,hide,labels));
    (s.valves||[]).forEach(a=>valve(c,a,s,hide,labels));clot(c,s,hide,labels);
    (s.obstacles||[]).filter(a=>a.kind==='dashBarrier').forEach(a=>barrier(c,a,s,hide,labels));
    if(s.room==='heart'&&(s.dashUnlocked||s.stage==='ending'))growth(c,s.growth,s,hide,labels);
    spawnTelegraphs(c,s,hide,labels,reduced);
    (s.enemies||[]).forEach(a=>hunter(c,a,s,hide,labels));preview(c,s,hide,labels);player(c,s,simulationTime,reduced,hide,labels);worldEffects(c,s,reduced?0:simulationTime);
    // Soft perimeter foreground establishes depth without hiding interactive objects.
    c.save();c.globalAlpha=.65;
    [0,1].forEach(side=>{for(let i=0;i<9;i++)leaf(c,side?size.width+10:-10,100+i*130,100+i%3*35,side?-.6:.6,'#7b997a');});c.restore();
    c.restore();
    c.save();round(c,p.x,p.y,p.w,p.h,16);c.strokeStyle='#b7c9ad';c.lineWidth=1;c.stroke();
    if(!hide) {drawWorldLabels(c,labels,v);edgeGuidance(c,s,v);}
    if(s.damageFlash>0){round(c,p.x,p.y,p.w,p.h,16);c.fillStyle='rgba(173,77,62,'+Math.min(.18,s.damageFlash*.3)+')';c.fill();}
    if(!hide&&s.stage==='burst')badge(c,'主血流重新奔涌',p.x+p.w/2,p.y+40,'#8f713e',20);
    if(!hide&&s.stage==='recovery'&&s.recovery>.65)badge(c,'一颗心，重新有了光',p.x+p.w/2,p.y+40,INK,20);
    c.restore();
  }
  window.GiantCureJourneyArt={draw};
})();
