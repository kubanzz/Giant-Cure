// World-space illustration and readable interaction layers. No simulation is mutated here.
(function () {
  'use strict';
  const PAPER = '#f5f0df', INK = '#2f675a', GOLD = '#c6a15b', TAU = Math.PI * 2;
  const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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
    if(e.target&&(e.state==='telegraph'||e.state==='lunge')) {
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
    if(!hideLabels&&e.state==='telegraph')worldBadge(labels,'扑击预警',e.x,e.y,0,-38,'#a16450');
  }
  function player(c,s,time) {
    const p=s.player,a=Math.atan2(s.aim.y-p.y,s.aim.x-p.x);
    c.save();
    if(s.scanner){const r=90+s.beat.phase*50;oval(c,p.x,p.y,r,r,null,0,'rgba(66,137,111,'+(.28-s.beat.phase*.16)+')',1.5);}
    if(p.dashing)for(let i=1;i<=5;i++)oval(c,p.x-Math.cos(a)*i*12,p.y-Math.sin(a)*i*12,16-i*2,11-i,'rgba(240,201,112,'+(.35-i*.05)+')',a);
    glow(c,p.x,p.y,43,'rgba(255,242,183,.60)');oval(c,p.x,p.y+12,22,9,'rgba(48,80,64,.28)');
    c.translate(p.x,p.y);c.rotate(a+Math.PI/2);if(p.invulnerable&&Math.floor(time*12)%2)c.globalAlpha=.6;
    round(c,-13,-18,26,36,10);c.fillStyle='#fff3d5';c.fill();c.strokeStyle='#356f60';c.lineWidth=2;c.stroke();
    round(c,-9,-13,18,14,5);c.fillStyle='#80b3a4';c.fill();
    round(c,-17,-6,5,17,2);c.fillStyle='#91b08e';c.fill();round(c,12,-6,5,17,2);c.fill();
    round(c,6,-27,5,18,2);c.fillStyle='#5b8b77';c.fill();
    line(c,[{x:-4,y:8},{x:4,y:8}],'#b7735d',2.5);line(c,[{x:0,y:4},{x:0,y:12}],'#b7735d',2.5);
    c.restore();
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
    c.save();c.lineCap='round';
    if(preview)c.setLineDash([4,7]);
    line(c,[result.from,p],palette.color,preview?1.8:4.5);
    c.setLineDash([]);
    if(!preview)line(c,[result.from,p],palette.light,1.4);
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
  function exterior(c,s,v) {
    const p=v.viewport,img=window.GiantCureAssets&&window.GiantCureAssets.images.exterior;
    c.save();round(c,p.x,p.y,p.w,p.h,16);c.clip();c.fillStyle=PAPER;c.fillRect(p.x,p.y,p.w,p.h);
    let chest={x:p.x+p.w*.52,y:p.y+p.h*.52};
    if(img){
      const cover=Math.max(p.w/img.width,p.h/img.height),cw=img.width*cover,ch=img.height*cover;
      c.save();c.filter='blur(20px)';c.globalAlpha=.40;c.drawImage(img,p.x+(p.w-cw)/2,p.y+(p.h-ch)/2,cw,ch);c.restore();
      // Contain the story illustration so the giant's face is never cropped off.
      const scale=Math.min(p.w/img.width,p.h/img.height),w=img.width*scale,h=img.height*scale,x=p.x+(p.w-w)/2,y=p.y+(p.h-h)/2;
      c.drawImage(img,x,y,w,h);chest={x:x+w*.52,y:y+h*.52};
    }
    glow(c,chest.x,chest.y,70+s.beat.pulse*35,'rgba(255,212,125,.45)');
    if(!v.hideLabels){badge(c,'巨人的胸口，重新有了生命的回响',p.x+p.w/2,p.y+p.h-68,INK,19);badge(c,'下一封求救信号：呼吸系统',p.x+p.w/2,p.y+p.h-29,'#8c7350',13);}c.restore();
  }
  function draw(c,s,time,view) {
    if(!s||!s.player)return;
    const size=s.worldSize||{width:s.room==='heart'?1800:1600,height:s.room==='heart'?1200:1000};
    const v=view||{viewport:{x:24,y:84,w:1232,h:552},camera:{x:size.width/2,y:size.height/2,zoom:.65}};
    const p=v.viewport,cam=v.camera,hide=!!v.hideLabels,labels=[];
    if(s.endingScene==='exterior'){exterior(c,s,v);return;}
    c.save();round(c,p.x,p.y,p.w,p.h,16);c.clip();
    c.translate(p.x+p.w/2,p.y+p.h/2);c.scale(cam.zoom,cam.zoom);c.translate(-cam.x,-cam.y);
    drawBackground(c,s,time);links(c,s);
    (s.portals||[]).forEach(a=>portal(c,a,s,hide,labels));(s.nodes||[]).forEach(a=>node(c,a,s,hide,labels));
    (s.valves||[]).forEach(a=>valve(c,a,s,hide,labels));clot(c,s,hide,labels);
    (s.obstacles||[]).filter(a=>a.kind==='dashBarrier').forEach(a=>barrier(c,a,s,hide,labels));
    if(s.room==='heart'&&(s.dashUnlocked||s.stage==='ending'))growth(c,s.growth,s,hide,labels);
    (s.enemies||[]).forEach(a=>hunter(c,a,s,hide,labels));preview(c,s,hide,labels);player(c,s,time);worldEffects(c,s,time);
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
