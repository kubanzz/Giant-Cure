'use strict';
// Authoring source: hand-drawn Canvas illustration matched to the supplied reference.
// The game bundles the rendered PNG; no drawing runtime or network is needed to play.
const fs = require('node:fs');
const path = require('node:path');
let canvasApi;
try { canvasApi = require('@napi-rs/canvas'); }
catch { canvasApi = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas')); }
const { createCanvas, Path2D } = canvasApi;
const { drawFoliage, drawBodySprigs } = require('./scan-giant-foliage.cjs');
const WIDTH = 1232, HEIGHT = 552, SCALE = 2;
const COLORS = { paper: '#edddbd', skin: '#eddbb5', line: '#8d886b', shadow: '#938b6c', leaf: '#96a178' };

function rng(seed = 1217) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function shape(c, d, fill, stroke = COLORS.line, width = 1.35) {
  const p = new Path2D(d);
  if (fill) { c.fillStyle = fill; c.fill(p); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(p); }
  return p;
}
function line(c, d, color = '#9b9273', width = 1) { return shape(c, d, null, color, width); }
function oval(c, x, y, rx, ry, fill, angle = 0) {
  c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
}
function leaf(c, x, y, length, breadth, angle, color, vein = true) {
  c.save(); c.translate(x, y); c.rotate(angle);
  shape(c, `M0 0 Q${length * .36} ${-breadth} ${length} 0 Q${length * .48} ${breadth} 0 0Z`, color, '#778362', 1.05);
  if (vein) {
    line(c, `M5 0 Q${length * .5} 2 ${length - 5} 0`, '#c2c7a080', .85);
    for (let i = 1; i < 4; i++) { const x0 = length * i / 5; line(c, `M${x0} 0 l${length * .15} ${-breadth * .28} M${x0} 0 l${length * .14} ${breadth * .28}`, '#b6bf9970', .65); }
  }
  c.restore();
}
function flower(c, x, y, size = 4) {
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * .4; oval(c, x + Math.cos(a) * size, y + Math.sin(a) * size, size * .73, size * .46, '#f3e8c7', a); }
  oval(c, x, y, size * .30, size * .30, '#baac76');
}
function ground(c) {
  c.fillStyle = COLORS.paper; c.fillRect(0, 0, WIDTH, HEIGHT);
  const random = rng(3281);
  for (let i = 0; i < 600; i++) {
    const x = random() * WIDTH, y = random() * HEIGHT, r = 7 + random() * 39;
    c.fillStyle = i % 3 === 0 ? '#bcb18d0a' : '#fff5da16';
    c.beginPath();
    for (let j = 0; j < 9; j++) { const a = j * Math.PI * 2 / 9, radius = r * (.55 + random() * .45); const xx = x + Math.cos(a) * radius, yy = y + Math.sin(a) * radius; if (j) c.lineTo(xx, yy); else c.moveTo(xx, yy); }
    c.closePath(); c.fill();
  }
  // Small ochre flecks are paper/soil, rather than a dense forest carpet.
  for (let i = 0; i < 1800; i++) { const x = random() * WIDTH, y = random() * HEIGHT; oval(c,x,y,.35+random()*.8,.25+random()*.5,'#b7a47c22'); }
}
const upperArm = 'M330 210 C372 167 442 144 508 151 C555 156 614 166 662 168 L760 170 C778 170 797 176 809 181 C823 184 839 190 840 196 Q841 203 833 199 L805 191 C815 201 832 205 832 212 Q831 219 824 214 L802 203 C811 215 826 220 825 227 Q822 233 815 227 L796 214 C803 226 814 232 810 238 Q805 242 799 234 L780 217 C768 216 761 207 751 206 L653 204 C596 202 557 196 509 195 C455 195 404 212 372 235 L334 240Z';
const lowerArm = 'M332 331 C373 349 442 378 506 389 C564 399 619 401 668 404 L763 407 C783 407 795 411 805 417 C821 420 837 425 836 432 Q834 437 827 433 L803 426 C816 434 829 439 827 445 Q824 450 816 445 L795 436 C806 446 819 450 814 456 Q810 461 803 454 L786 442 C793 452 800 459 795 464 Q789 468 783 459 L766 443 C752 441 747 435 738 434 L661 434 C602 433 554 431 498 423 C430 413 377 389 339 371 Q324 362 321 350Z';
const upperLeg = 'M666 234 C736 222 807 231 869 245 C905 253 936 261 967 265 C1021 270 1088 270 1133 265 C1146 263 1154 252 1167 249 C1177 247 1186 250 1186 257 L1186 262 C1199 260 1207 266 1204 272 Q1203 278 1195 278 C1206 278 1208 285 1203 289 Q1201 292 1193 291 C1204 294 1201 302 1194 303 L1188 303 C1198 306 1192 314 1184 312 C1176 315 1166 309 1155 308 C1124 312 1100 314 1067 314 C1023 314 993 307 960 305 C912 301 874 299 827 295 C773 292 718 292 670 284Z';
const lowerLeg = 'M676 302 C749 294 823 308 879 327 C910 337 937 344 971 347 C1034 353 1092 364 1135 368 C1148 369 1157 359 1169 357 C1181 355 1189 360 1187 367 L1186 372 C1197 371 1206 378 1203 384 Q1201 389 1193 388 C1205 391 1204 398 1197 402 L1190 402 C1201 407 1196 414 1187 413 C1195 420 1186 425 1179 420 C1172 420 1161 412 1153 411 C1115 410 1086 408 1054 402 C1016 395 985 389 955 385 C905 379 870 375 823 367 C772 359 717 359 673 354Z';
const torso = 'M275 229 C296 229 299 211 319 201 C349 187 391 183 432 190 C480 197 527 215 574 224 C612 232 652 224 684 237 C708 256 712 315 683 341 C654 359 615 353 578 349 C530 344 482 363 431 366 C387 369 346 359 322 345 C301 333 296 300 275 295Z';

function body(c) {
  const parts = [upperArm, lowerArm, upperLeg, lowerLeg, torso];
  // A small translucent offset establishes contact with the ground.
  c.save(); c.translate(3.5, 6); c.globalAlpha = .16;
  parts.forEach(d => shape(c, d, '#8d896b', null)); c.restore();
  parts.forEach(d => shape(c, d, COLORS.skin, '#91876bb8', 1.5));
  // Broad transparent washes keep the character flat and softly painted.
  c.save(); c.clip(new Path2D(torso));
  shape(c,'M278 286 C366 314 433 340 521 319 C596 302 652 312 705 296 L705 380 L277 380Z','#d5c49c2b',null);
  shape(c,'M293 231 C405 208 468 239 570 249 C610 254 633 249 669 253 L667 276 C578 270 528 280 450 258 C383 240 325 260 293 252Z','#fff2d321',null);
  c.restore();
  line(c,'M359 218 C388 212 410 213 435 219 M349 338 C380 347 401 345 420 342','#b5a78366',1.1);
  line(c,'M815 267 C848 274 873 279 898 280 M823 340 C847 347 872 352 888 352','#c2b08b45',1);
  // Fingertips, knees and toes use the same sparse contour language as the face.
  line(c,'M781 191 Q794 188 805 191 M779 214 Q788 207 795 211 M766 422 Q788 420 803 426 M765 441 Q778 434 786 442','#a294737d',.9);
  line(c,'M1172 257 Q1179 257 1186 262 M1175 270 L1193 273 M1174 283 L1192 286 M1173 295 L1186 299 M1170 366 Q1178 369 1186 372 M1172 381 L1191 385 M1169 393 L1186 399 M1168 405 L1179 412','#a5977488',.85);
  line(c,'M938 276 Q946 270 955 277 M930 358 Q941 353 949 361','#b7a88255',1);
  oval(c,914,273,18,7,'#f9e9c74b',.1); oval(c,912,356,17,7,'#f9e9c73b',.2);
}
function skirt(c) {
  // Broad overlapping leaves form the original short waist garment.
  const leaves = [
    [606,230,101,36,-.49,'#a2ad83'],[613,247,116,37,-.24,'#a7b088'],
    [614,268,128,39,.01,'#85956d'],[614,287,126,39,.20,'#9eaa80'],
    [610,308,119,38,.39,'#a8b38b'],[603,325,104,35,.58,'#92a078'],
    [632,228,83,30,.10,'#8d9b70'],[636,249,100,31,.24,'#b2b98f'],
    [640,274,104,34,.40,'#9ca77b'],[632,299,99,32,.60,'#8a996e'],
    [619,319,87,30,.84,'#aab48a']
  ];
  leaves.forEach(([x,y,length,breadth,angle,color]) => {
    c.save(); c.translate(x,y);c.rotate(angle);
    shape(c,`M0 0 Q${length*.1} ${-breadth*.35} ${length*.24} ${-breadth*.52} Q${length*.21} ${-breadth*.91} ${length*.4} ${-breadth*.74} Q${length*.56} ${-breadth*1.08} ${length*.68} ${-breadth*.55} Q${length*.85} ${-breadth*.55} ${length} 0 Q${length*.85} ${breadth*.55} ${length*.68} ${breadth*.55} Q${length*.56} ${breadth*1.08} ${length*.4} ${breadth*.74} Q${length*.21} ${breadth*.91} ${length*.24} ${breadth*.52} Q${length*.1} ${breadth*.35} 0 0Z`,color,'#788360',1.1);
    line(c,`M5 0 Q${length*.5} 2 ${length-7} 0`,'#d0d2aa80',.9);
    for(let i=1;i<4;i++){const xx=length*i/5;line(c,`M${xx} 0 l${length*.17} ${-breadth*.45} M${xx} 0 l${length*.17} ${breadth*.45}`,'#bdc49b66',.7);}
    c.restore();
  });
  line(c,'M612 225 Q633 278 606 335','#788c657d',2);
  [237,257,281,309].forEach((y,i)=>leaf(c,605,y,47,17,.3+i*.16,['#a4b185','#879970','#aab68b','#8c9e74'][i]));
}
function head(c) {
  const hair = 'M157 169 C146 151 126 160 119 170 C101 158 88 175 91 188 C71 184 64 203 75 216 C53 226 59 247 72 255 C57 270 63 290 79 293 C70 313 84 329 101 325 C105 347 124 353 139 342 C153 362 177 348 179 331 C201 326 208 305 193 291 C211 274 202 255 194 246 C209 227 194 207 182 205 C188 186 176 173 157 169Z';
  shape(c,hair,'#8e9c72','#76815f',1.4);
  // Ears flank the head; the face points along the body's left-to-right axis.
  c.save(); c.translate(208,260); c.rotate(-Math.PI/2);
  shape(c,'M-57 -1 C-78 -14 -83 3 -76 22 C-71 36 -61 32 -55 24Z','#e6d0a5','#a09472',1);
  shape(c,'M57 -1 C78 -14 83 3 76 22 C71 36 61 32 55 24Z','#e6d0a5','#a09472',1);
  line(c,'M-66 4 Q-76 4 -67 20 M66 4 Q76 4 67 20','#b4a07a',1);
  shape(c,'M-57 -50 C-48 -77 -24 -87 0 -87 C27 -87 53 -69 60 -45 C66 -24 67 10 62 39 C58 61 34 82 4 85 C-25 87 -51 67 -58 43 C-65 16 -65 -23 -57 -50Z','#efddb6','#8e866b99',1.3);
  // One very light cheek wash; no modeled skin or realistic facial detail.
  oval(c,-40,24,12,7,'#d7aa8c21'); oval(c,40,24,12,7,'#d7aa8c21');
  line(c,'M-46 -21 Q-33 -25 -20 -21 M20 -21 Q33 -25 46 -21','#8b8e66',2.1);
  line(c,'M-46 -3 Q-34 1 -22 -3 M22 -3 Q34 1 46 -3','#81785f',2.7);
  line(c,'M-1 11 Q-4 21 1 24 M-5 25 Q1 28 6 24','#b5a17c77',1.1);
  line(c,'M-9 49 Q0 52 9 49','#9d8869',1.35);
  oval(c,1,18,2.1,1.2,'#fff1d066');
  c.restore();
  // Broad leafy fringe, matching the reference's large, readable leaf shapes.
  const leaves = [
    [135,188,45,17,-2.6,'#9eaa7d'],[131,211,49,20,-2.9,'#a6af82'],
    [127,239,52,20,3.1,'#85976b'],[129,266,49,20,2.9,'#a1ad7e'],
    [134,294,45,18,2.6,'#87976e'],[146,320,39,16,2.3,'#a9b387'],
    [162,186,42,17,-1.8,'#8d9e72'],[177,192,34,16,-1.65,'#a5af82'],
    [168,326,42,17,1.8,'#8fa075'],[187,323,33,15,1.55,'#a9b68a'],
    [148,213,36,15,-.75,'#a4b180'],[142,248,34,16,-.3,'#8c9e72'],
    [149,280,31,15,.5,'#a1af80'],[160,301,34,16,.8,'#879a6e']
  ];
  leaves.forEach(args => leaf(c,...args));
  [[120,201,4],[92,236,3.4],[109,285,4],[144,324,3.4],[167,180,3.4]].forEach(args=>flower(c,...args));
}
function paperGrain(c, seed = 1943) {
  c.save(); c.setTransform(1,0,0,1,0,0);
  const image = c.getImageData(0,0,c.canvas.width,c.canvas.height), pixels = image.data, random = rng(seed);
  // Uniform fine grain, restrained enough that flat color areas remain quiet.
  for(let i=0;i<pixels.length;i+=4) { const noise=(random()-.5)*7; pixels[i]+=noise;pixels[i+1]+=noise;pixels[i+2]+=noise; }
  c.putImageData(image,0,0);
  c.restore();
}
function render() {
  const canvas = createCanvas(WIDTH*SCALE,HEIGHT*SCALE), c = canvas.getContext('2d');
  c.scale(SCALE,SCALE); c.lineCap='round'; c.lineJoin='round';
  ground(c); drawFoliage(c,{width:WIDTH,height:HEIGHT,seed:6309});
  body(c); skirt(c); head(c); drawBodySprigs(c,{width:WIDTH,height:HEIGHT,seed:1309});
  paperGrain(c);
  return canvas;
}
if(require.main===module) {
  const output = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname,'../assets/heart-journey/scanGiant.png');
  fs.writeFileSync(output,render().toBuffer('image/png'));
  console.log(JSON.stringify({output,width:WIDTH*SCALE,height:HEIGHT*SCALE,heart:{x:418,y:250}}));
}
module.exports={render,WIDTH,HEIGHT};
