'use strict';

// Quiet picture-book plants. Coordinates are authored for the same 1232x552
// composition as the patient; no pixel noise or imported imagery is used here.
const PALETTE = Object.freeze({
  olive: '#8e9b73', sage: '#a6ad83', dark: '#727f62',
  light: '#bac09b', outline: '#717b60', stem: '#859071',
  flower: '#f0e8c9', flowerShade: '#e0d6b5', pollen: '#b8a277'
});

function randomSource(value = 0x53a7c9) {
  let seed = Number(value);
  if (!Number.isFinite(seed)) {
    seed = 2166136261;
    for (const character of String(value)) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  }
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function line(c, points, color, width = 1) {
  c.beginPath(); c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

// A single broad, softly lobed oak-like leaf, rather than a frond or a cluster
// of tiny procedural circles. The same line language is used for all plants.
function lobedLeaf(c, x, y, length, angle, fill, opacity = 1) {
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(length / 61, length / 61);
  c.globalAlpha *= opacity;
  c.beginPath(); c.moveTo(0, 0);
  c.bezierCurveTo(-4, -7, -18, -4, -15, -14);
  c.bezierCurveTo(-28, -11, -30, -21, -21, -25);
  c.bezierCurveTo(-31, -31, -25, -42, -15, -36);
  c.bezierCurveTo(-21, -47, -11, -53, -6, -45);
  c.bezierCurveTo(-8, -56, -1, -61, 2, -59);
  c.bezierCurveTo(9, -56, 9, -49, 6, -44);
  c.bezierCurveTo(17, -49, 22, -42, 15, -35);
  c.bezierCurveTo(29, -39, 31, -29, 21, -23);
  c.bezierCurveTo(30, -21, 25, -10, 15, -13);
  c.bezierCurveTo(18, -4, 5, -6, 0, 0); c.closePath();
  c.fillStyle = fill; c.fill(); c.strokeStyle = PALETTE.outline;
  c.lineWidth = 1.15; c.stroke();
  c.globalAlpha *= .42;
  c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(-2, -29, 2, -51);
  c.moveTo(0, -17); c.quadraticCurveTo(-9, -20, -16, -20);
  c.moveTo(0, -29); c.quadraticCurveTo(8, -31, 15, -31);
  c.strokeStyle = '#eef0d7'; c.lineWidth = .9; c.stroke();
  c.restore();
}

function smallLeaf(c, x, y, length, angle, fill, opacity = 1) {
  c.save(); c.translate(x, y); c.rotate(angle); c.globalAlpha *= opacity;
  c.beginPath(); c.moveTo(0, 0);
  c.bezierCurveTo(-length * .4, -length * .16, -length * .4, -length * .7, 0, -length);
  c.bezierCurveTo(length * .38, -length * .72, length * .45, -length * .18, 0, 0);
  c.fillStyle = fill; c.fill(); c.strokeStyle = PALETTE.outline;
  c.lineWidth = .7; c.stroke();
  c.globalAlpha *= .35; line(c, [0, -2, 0, -length * .74], '#eef0d7', .65);
  c.restore();
}

function flower(c, x, y, size = 4, angle = 0) {
  c.save(); c.translate(x, y); c.rotate(angle);
  for (let petal = 0; petal < 5; petal++) {
    c.save(); c.rotate(petal * Math.PI * 2 / 5);
    c.beginPath(); c.ellipse(0, -size * .8, size * .49, size * .82, 0, 0, Math.PI * 2);
    c.fillStyle = petal % 2 ? PALETTE.flowerShade : PALETTE.flower; c.fill(); c.restore();
  }
  c.beginPath(); c.ellipse(0, 0, size * .36, size * .36, 0, 0, Math.PI * 2);
  c.fillStyle = PALETTE.pollen; c.fill(); c.restore();
}

function shrub(c, x, y, radius, random, leaves = 5) {
  c.save();
  c.globalAlpha *= .88;
  for (let i = 0; i < leaves; i++) {
    const angle = i / leaves * Math.PI * 2 + random() * .24;
    const distance = radius * (.09 + random() * .2);
    const colors = [PALETTE.olive, PALETTE.sage, PALETTE.light, PALETTE.dark];
    lobedLeaf(c, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance,
      radius * (.61 + random() * .3), angle + Math.PI / 2,
      colors[i % colors.length], .85 + random() * .12);
  }
  c.restore();
}

function sprig(c, x, y, length, angle, random, withFlower = false) {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-length * .07, -length * .5, 0, -length);
  c.strokeStyle = PALETTE.stem; c.lineWidth = .85; c.stroke();
  for (let i = 0; i < 3; i++) {
    const yy = -length * (.2 + i * .23), size = length * (.29 - i * .035);
    smallLeaf(c, 0, yy, size, -.85, i % 2 ? PALETTE.sage : PALETTE.olive, .9);
    smallLeaf(c, 0, yy - length * .07, size * .84, .91, PALETTE.sage, .88);
  }
  if (withFlower) flower(c, 0, -length, 2.6 + random(), .2);
  c.restore();
}

function withScene(c, options, draw) {
  const { width = 1232, height = 552, seed = 0x53a7c9 } = options || {};
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return;
  c.save(); c.scale(width / 1232, height / 552);
  c.lineCap = 'round'; c.lineJoin = 'round';
  draw(randomSource(seed)); c.restore();
}

function drawFoliage(c, options = {}) {
  withScene(c, options, random => {
    // The outer clusters are deliberately irregular and separated by quiet
    // ground. Nothing covers the face, the organ window, hands or feet.
    const clusters = [
      [-9, 40, 64, 7], [71, -5, 54, 6], [277, -14, 41, 5],
      [447, 23, 37, 5], [790, -16, 43, 5], [1014, -8, 59, 6],
      [1202, 32, 66, 7], [1250, 139, 48, 5], [1256, 468, 57, 6],
      [1153, 551, 52, 6], [932, 567, 49, 5], [698, 551, 31, 4],
      [411, 558, 43, 5], [124, 548, 49, 6], [-8, 477, 62, 6],
      [-18, 339, 43, 5], [-19, 184, 38, 5]
    ];
    clusters.forEach(([x, y, size, count]) => shrub(c, x, y, size, random, count));
    // These complete shrubs sit inside the frame, rather than reading only
    // as clipped border decoration. The broad empty area around the figure
    // stays quiet, while the corners feel like a real woodland clearing.
    const middleGround = [
      [87, 83, 37, 5], [338, 59, 26, 4], [1108, 86, 39, 5],
      [1128, 473, 35, 5], [924, 491, 27, 4], [100, 456, 37, 5]
    ];
    middleGround.forEach(([x, y, size, count]) => {
      c.save(); c.globalAlpha *= .87; shrub(c, x, y, size, random, count); c.restore();
    });
    const accents = [
      [135, 48, 21, -.2], [337, 51, 19, -.4], [579, 48, 23, .5],
      [873, 43, 19, -.5], [1103, 83, 22, .2], [1183, 153, 16, -.5],
      [1213, 436, 20, .5], [1056, 502, 24, -.5], [782, 510, 18, .6],
      [519, 505, 19, -.4], [275, 499, 22, .4], [54, 414, 20, .3],
      [47, 111, 17, -.3]
    ];
    accents.forEach(([x, y, length, angle], i) => sprig(c, x, y, length, angle, random, i % 4 === 0));
    [[62, 47, 3.4], [1191, 41, 3.3], [1118, 531, 3.1], [95, 519, 3.4]].forEach(([x, y, size]) => flower(c, x, y, size, random()));
  });
}

function drawBodySprigs(c, options = {}) {
  withScene(c, { ...options, seed: options.seed ?? 0x98c2a1 }, random => {
    // Isolated little plants connect skin to the woodland while leaving the
    // large cream silhouette legible. Coordinates avoid the central heart.
    const patches = [
      [339, 184, 18, -.8], [416, 192, 14, .5], [514, 162, 13, -.5],
      [357, 337, 18, -.6], [466, 367, 14, .3], [591, 402, 13, -.7],
      [795, 245, 16, -.2], [955, 260, 14, .4], [1082, 252, 12, -.4],
      [783, 348, 16, -.6], [940, 367, 14, .4], [1094, 383, 12, -.3]
    ];
    patches.forEach(([x, y, length, angle], i) => {
      c.save(); c.globalAlpha *= .74;
      sprig(c, x, y, length * 1.8, angle, random, i === 0 || i === 6); c.restore();
    });
    // Visible grouped lobed masses, in the reference's simple rounded leaf
    // language. All chest clusters hug the outer shoulders and leave the
    // central organ window and face free for the diagnosis illustration.
    const bodyClusters = [
      [337, 189, 23, 4], [333, 333, 23, 4], [584, 400, 20, 4],
      [807, 246, 21, 4], [1047, 267, 17, 4],
      [792, 349, 22, 4], [1035, 375, 18, 4]
    ];
    bodyClusters.forEach(([x, y, size, count]) => {
      c.save(); c.globalAlpha *= .74; shrub(c, x, y, size, random, count); c.restore();
    });
    [[322, 323, 31, -.6], [734, 343, 29, 1.2], [866, 251, 26, .5]].forEach(([x, y, length, angle]) => lobedLeaf(c, x, y, length, angle, PALETTE.olive, .62));
  });
}

module.exports = { drawFoliage, drawBodySprigs, PALETTE };
