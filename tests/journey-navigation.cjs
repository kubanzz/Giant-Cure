'use strict';
// Read-only geometry guides public input; snapshots are never modified.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function crosses(a, b, rect, padding = 0) {
  let enter = 0, leave = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, rect.x - padding, rect.x + rect.w + padding], [a.y, b.y - a.y, rect.y - padding, rect.y + rect.h + padding]]) {
    if (Math.abs(delta) < 1e-9) { if (origin < min || origin > max) return false; }
    else { const t1 = (min - origin) / delta, t2 = (max - origin) / delta; enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2)); if (enter > leave) return false; }
  }
  return leave >= 0 && enter <= 1;
}
function overlaps(point, rect, radius = 14) {
  return Math.hypot(point.x - Math.max(rect.x, Math.min(rect.x + rect.w, point.x)), point.y - Math.max(rect.y, Math.min(rect.y + rect.h, point.y))) < radius;
}
function nextWaypoint(s, target) {
  const walls = s.obstacles.filter(r => r.blocking !== false), padding = (s.player.radius || 14) + 6;
  const paddingFor = r => {
    const gap = Math.hypot(target.x - Math.max(r.x, Math.min(r.x + r.w, target.x)), target.y - Math.max(r.y, Math.min(r.y + r.h, target.y)));
    return gap >= (s.player.radius || 14) && gap < padding ? gap - .5 : padding;
  };
  const blocked = (a, b) => walls.some(r => crosses(a, b, r, paddingFor(r)));
  // Discrete WASD movement can stop inside the planner's conservative square
  // margin while the real circular body is still clear. Step away from that
  // margin before building the next visibility graph.
  for (const r of walls) {
    const p = paddingFor(r), a = s.player;
    if (a.x > r.x - p && a.x < r.x + r.w + p && a.y > r.y - p && a.y < r.y + r.h + p && !overlaps(a, r, s.player.radius || 14)) {
      const exits = [{ x: r.x - p - 10, y: a.y }, { x: r.x + r.w + p + 10, y: a.y }, { x: a.x, y: r.y - p - 10 }, { x: a.x, y: r.y + r.h + p + 10 }]
        .filter(b => !walls.some(w => crosses(b, b, w, paddingFor(w))))
        .sort((b, c) => distance(a, b) + distance(b, target) * .1 - distance(a, c) - distance(c, target) * .1);
      if (exits[0]) return exits[0];
    }
  }
  if (!blocked(s.player, target)) return target;
  const bounds = s.bounds || s.worldBounds || { left: 80, right: s.room === 'heart' ? 1720 : 1520, top: 80, bottom: s.room === 'heart' ? 1120 : 920 };
  const points = [s.player, target];
  for (const r of walls) for (const x of [r.x - padding - 10, r.x + r.w + padding + 10]) for (const y of [r.y - padding - 10, r.y + r.h + padding + 10]) {
    const p = { x, y }; if (x >= bounds.left + padding && x <= bounds.right - padding && y >= bounds.top + padding && y <= bounds.bottom - padding && !walls.some(w => overlaps(p, w, paddingFor(w)))) points.push(p);
  }
  const costs = points.map(() => Infinity), parents = [], used = new Set(); costs[0] = 0;
  for (let n = 0; n < points.length; n++) {
    let current = -1; for (let i = 0; i < points.length; i++) if (!used.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break; used.add(current);
    for (let i = 0; i < points.length; i++) { if (used.has(i) || blocked(points[current], points[i])) continue; const cost = costs[current] + distance(points[current], points[i]); if (cost < costs[i]) { costs[i] = cost; parents[i] = current; } }
  }
  if (!Number.isFinite(costs[1])) return null; let index = 1; while (parents[index] !== undefined && parents[index] !== 0) index = parents[index]; return points[index];
}
module.exports = { distance, crosses, overlaps, nextWaypoint };
