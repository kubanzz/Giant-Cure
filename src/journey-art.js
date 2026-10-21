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
    size = size || 13; const w = Math.max(60, value.length * size + 20);
    round(c, x - w / 2, y - 12, w, 25, 7); c.fillStyle = 'rgba(250,247,232,.94)'; c.fill();
    label(c, value, x, y + .5, size, color || INK, 600);
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
    c.save(); c.translate(x, y); c.rotate(Math.sin(time * .65 + seed) * .045);
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
  function stream(c, path, s) {
    const pts = (path.points || []).filter(Boolean); if (pts.length < 2) return;
    const flow = clamp(Number(path.flow === undefined ? path.active ? 1 : .05 : path.flow), 0, 1);
    const open = flow > .4;
    const w = path.width || 85;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    line(c, pts, 'rgba(112,105,83,.16)', w + 26);
    line(c, pts, open ? 'rgba(183,132,112,.67)' : 'rgba(148,144,122,.66)', w + 10);
    line(c, pts, open ? 'rgba(232,174,142,.72)' : 'rgba(190,182,151,.68)', w);
    line(c, pts, open ? 'rgba(252,218,167,.40)' : 'rgba(239,224,185,.30)', w * .55);
    let total = 0; const segs = [];
    for (let i = 1; i < pts.length; i++) { const length = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push({ a: pts[i - 1], b: pts[i], length }); total += length; }
    const phase = s.elapsed * (4 + flow * 44);
    for (let k = 0; k < Math.ceil(total / 62); k++) {
      let travel = (k * 62 + phase) % total, seg = segs[0];
      for (const v of segs) { seg = v; if (travel <= v.length) break; travel -= v.length; }
      const f = clamp(travel / Math.max(1, seg.length), 0, 1), a = Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x);
      const offset = Math.sin(k * 4.2) * w * .24, x = seg.a.x + (seg.b.x - seg.a.x) * f - Math.sin(a) * offset, y = seg.a.y + (seg.b.y - seg.a.y) * f + Math.cos(a) * offset;
      oval(c, x, y, 10, 5, open ? 'rgba(169,94,83,.70)' : 'rgba(132,128,110,.38)', a);
      oval(c, x, y - 1, 5, 1.5, 'rgba(255,230,189,.52)', a);
    }
    if (s.scanner) {
      c.setLineDash([9, 12]); line(c, pts, open ? 'rgba(62,139,116,.66)' : 'rgba(160,100,73,.65)', 2); c.setLineDash([]);
    }
    c.restore();
  }
  function tissue(c, o, alive) {
    if (o.kind !== 'tissue') return;
    const x = o.x, y = o.y, w = o.w, h = o.h;
    oval(c, x + w / 2, y + h * .92, w * .58, Math.min(25, h * .2), 'rgba(67,87,68,.20)');
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, alive ? '#c3d1a5' : '#c1c3a3'); g.addColorStop(1, alive ? '#7fa98a' : '#8e9a81');
    shape(c, p => { p.moveTo(x, y + h); p.bezierCurveTo(x - 10, y + h * .35, x + w * .18, y - 12, x + w * .5, y); p.bezierCurveTo(x + w * .86, y - 10, x + w + 10, y + h * .4, x + w, y + h); p.closePath(); }, g, '#768d75', 2);
    for (let i = 0; i < Math.max(3, Math.floor(w / 40)); i++) oval(c, x + 15 + i * Math.max(25, w / Math.max(3, Math.floor(w / 40))), y + h * (.4 + Math.sin(i * 2) * .13), Math.min(13, w * .12), Math.min(10, h * .1), 'rgba(239,236,201,.23)', i);
  }
  function drawBackground(c, s, time) {
    const size = s.worldSize || { width: s.room === 'heart' ? 1800 : 1600, height: s.room === 'heart' ? 1200 : 1000 };
    c.fillStyle = '#e9e5cc'; c.fillRect(-2000, -2000, size.width + 4000, size.height + 4000);
    const recovering = s.stage === 'recovery' ? clamp((s.recovery - .7) / 4.5, 0, 1) : s.heartConnected ? 1 : 0;
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
    for (let i = 0; i < 38; i++) {
      const left = i % 2 === 0, x = left ? b.left - 14 + (i % 3) * 12 : b.right + 10 - (i % 3) * 12;
      const y = b.top + 30 + ((i * 137) % Math.max(80, b.bottom - b.top - 60));
      const alive = s.room === 'heart' ? recovering > Math.abs(y - 700) / 1100 : s.flowRestored;
      plant(c, x, y, 25 + i % 5 * 7, i, alive, time);
    }
    if (s.room === 'heart') {
      const spots = [[250,230],[470,200],[680,170],[1110,180],[1430,280],[1540,540],[260,550],[330,770],[1480,960],[720,1050]];
      spots.forEach((p, i) => {
        const light = recovering > Math.hypot(p[0] - 900, p[1] - 650) / 1500;
        if (light) { glow(c, p[0], p[1], 75 + s.beat.pulse * 14, 'rgba(250,207,114,.24)'); oval(c, p[0], p[1], 4, 8, '#f7d28b'); }
      });
    }
  }
  function node(c, n, s, hideLabels) {
    const near = s.nearestId === n.id, show = s.scanner || near || n.selected || n.complete;
    const color = n.complete ? '#a68542' : n.selected ? '#b68b44' : '#4f8a75';
    if (show) glow(c, n.x, n.y, near ? 58 : 40, n.complete ? 'rgba(245,205,112,.35)' : 'rgba(199,232,187,.43)');
    oval(c, n.x, n.y + 9, 26, 9, 'rgba(60,91,72,.20)');
    oval(c, n.x, n.y, near ? 25 : 22, near ? 25 : 22, '#f6f0d8', 0, color, near ? 3 : 1.8);
    oval(c, n.x, n.y, 15, 15, n.complete ? '#ead59a' : '#c6d9b6');
    if (n.complete) line(c, [{ x:n.x-6,y:n.y },{ x:n.x-1,y:n.y+5 },{ x:n.x+7,y:n.y-6 }], color, 2.5);
    else if (show) label(c, (String(n.label).match(/[ABC]\s*$/) || [''])[0].trim() || (n.kind === 'release' ? '◎' : '≈'), n.x, n.y, 16, color, 700);
    if (!hideLabels && show) badge(c, n.label, n.x, n.y + 43, color, 12);
    if (!hideLabels && s.scanner && n.scanned && n.symptom) badge(c, n.symptom, n.x, n.y + 73, '#657b58', 11);
    if (!hideLabels && near) badge(c, 'E', n.x + 34, n.y - 26, INK, 12);
    if (s.scanner && !n.complete) { c.save(); c.setLineDash([3, 7]); oval(c, n.x, n.y, 33, 33, null, 0, '#659c83', 1.3); c.restore(); }
  }
  function portal(c, p, s, hideLabels) {
    const near = s.nearestId === p.id, open = !p.locked;
    if (open) glow(c, p.x, p.y, 58, 'rgba(231,208,130,.32)');
    oval(c, p.x, p.y + 10, 37, 13, '#b8c9a4', 0, '#769575', 2);
    shape(c, a => { a.moveTo(p.x-31,p.y+5); a.bezierCurveTo(p.x-33,p.y-45,p.x+33,p.y-45,p.x+31,p.y+5); }, null, open ? '#759c7d' : '#a2a88c', 6);
    label(c, open ? '↗' : '·', p.x, p.y - 8, 26, open ? INK : '#939b80');
    if (!hideLabels && (near || s.scanner || open)) badge(c, p.label, p.x, p.y + 39, open ? INK : '#84917b', 12);
    if (!hideLabels && near && open) badge(c, 'E', p.x + 44, p.y - 22, INK, 12);
  }
  function valve(c, v, s, hideLabels) {
    const open = v.open !== undefined ? v.open : s.beat.safe;
    const x = v.x, y = v.y, w = v.w, h = v.h;
    c.save();
    glow(c, x + w/2, y + h/2, w * .65, open ? 'rgba(126,204,170,.18)' : 'rgba(197,143,106,.16)');
    [-1,1].forEach(side => {
      const root = side < 0 ? x : x+w;
      shape(c, p => { p.moveTo(root,y-15); p.bezierCurveTo(root-side*w*.13,y-30,root-side*w*(open?.13:.46),y-8,root-side*w*(open?.13:.50),y+h/2); p.bezierCurveTo(root-side*w*(open?.10:.38),y+h+24,root-side*w*.08,y+h+20,root,y+h+10); p.closePath(); }, open?'#b0cdb2':'#c8b196', open?'#5c967c':'#9a8063', 2.5);
    });
    if (!hideLabels && (s.scanner || Math.hypot(s.player.x-x-w/2,s.player.y-y-h/2)<220)) badge(c, open?'舒张 · 可通行':'收缩 · 等待舒张',x+w/2,y-42,open?'#3e846b':'#926b4d',13);
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
  }
  function clot(c, s, hideLabels) {
    const a=s.clot;if(s.room!=='main'||!a||a.removed)return;
    const r=a.radius||125,soft=(s.weakpoints||[]).reduce((v,p)=>v+p.progress,0)/3;
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
    if(!hideLabels&&s.scanner)badge(c,'纤维性血栓 · '+Math.round(soft*100)+'% 已软化',a.x,a.y+r+28,'#735f43',13);
  }
  function hunter(c,e,s,hideLabels) {
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
    if(!hideLabels&&e.state==='telegraph')badge(c,'扑击预警',e.x,e.y-44,'#a16450',12);
  }
  function player(c,s,time) {
    const p=s.player,a=Math.atan2(s.aim.y-p.y,s.aim.x-p.x);
    c.save();
    if(s.scanner){const r=90+s.beat.phase*50;oval(c,p.x,p.y,r,r,null,0,'rgba(66,137,111,'+(.28-s.beat.phase*.16)+')',1.5);}
    if(s.scanner||s.precision){c.setLineDash([3,7]);line(c,[p,s.aim],s.precision?'rgba(140,111,54,.7)':'rgba(65,121,102,.35)',1.4);c.setLineDash([]);}
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
  function barrier(c,o,s,hideLabels) {
    const unlocked=s.dashUnlocked;
    c.save();c.setLineDash(unlocked?[9,9]:[]);
    round(c,o.x,o.y,o.w,o.h,14);c.fillStyle=unlocked?'rgba(220,199,128,.16)':'rgba(119,151,112,.45)';c.fill();c.strokeStyle=unlocked?'#b39650':'#79966e';c.lineWidth=2;c.stroke();c.setLineDash([]);
    for(let i=0;i<o.w/58;i++){const x=o.x+25+i*58;if(unlocked)line(c,[{x:x-5,y:o.y+o.h/2+5},{x,y:o.y+o.h/2-5},{x:x+5,y:o.y+o.h/2+5}],'#a58a47',2);else leaf(c,x,o.y+o.h,42,-.15,'#98b08a');}
    if(!hideLabels)badge(c,unlocked?'Space · 循环冲刺':'尚未苏醒的循环屏障',o.x+o.w/2,o.y-26,unlocked?'#987a39':INK,13);c.restore();
  }
  function growth(c,g,s,hideLabels) {
    if(!g)return;
    const state=g.state||'dormant',suppressed=state==='suppressed',regrowing=state==='regrowing';
    const r=(g.radius||24)*(suppressed?.35:regrowing?.75+.25*s.beat.pulse:1),x=g.x,y=g.y;
    glow(c,x,y,68,suppressed?'rgba(183,209,152,.25)':'rgba(174,124,165,.24)');
    for(let i=0;i<6;i++){const a=i*TAU/6;oval(c,x+Math.cos(a)*r*.6,y+Math.sin(a)*r*.6,r*.6,r*.5,suppressed?'#a7b498':'#a28ca1',a,'#89788c',1.3);}
    oval(c,x,y,r*.52,r*.52,suppressed?'#c9c6a2':'#816a8c');
    if(g.progress>0&&!suppressed&&!regrowing)shape(c,p=>p.arc(x,y,r+9,-Math.PI/2,-Math.PI/2+TAU*g.progress),null,'#edce81',4);
    if(!hideLabels&&(s.scanner||g.scanned||s.stage==='ending'))badge(c,regrowing?'同一组织 · 再次生长':suppressed?'已暂时压制':g.scanned?'异常组织 · 特征未知':'未知生物信号',x,y+50,regrowing?'#8b5f83':INK,13);
  }
  function worldEffects(c,s,time) {
    if(s.shot&&s.shot.age<.2){c.save();c.globalAlpha=1-s.shot.age/.2;line(c,[s.shot.from,s.shot.to],s.shot.kind==='blocked'?'#c9ac79':'#f0cd7a',5);line(c,[s.shot.from,s.shot.to],'#fff2bd',1.7);c.restore();}
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
    const p=v.viewport,cam=v.camera,hide=!!v.hideLabels;
    if(s.endingScene==='exterior'){exterior(c,s,v);return;}
    c.save();round(c,p.x,p.y,p.w,p.h,16);c.clip();
    c.translate(p.x+p.w/2,p.y+p.h/2);c.scale(cam.zoom,cam.zoom);c.translate(-cam.x,-cam.y);
    drawBackground(c,s,time);links(c,s);
    (s.portals||[]).forEach(a=>portal(c,a,s,hide));(s.nodes||[]).forEach(a=>node(c,a,s,hide));
    (s.valves||[]).forEach(a=>valve(c,a,s,hide));clot(c,s,hide);
    (s.obstacles||[]).filter(a=>a.kind==='dashBarrier').forEach(a=>barrier(c,a,s,hide));
    if(s.room==='heart'&&(s.dashUnlocked||s.stage==='ending'))growth(c,s.growth,s,hide);
    (s.enemies||[]).forEach(a=>hunter(c,a,s,hide));player(c,s,time);worldEffects(c,s,time);
    // Soft perimeter foreground establishes depth without hiding interactive objects.
    c.save();c.globalAlpha=.65;
    [0,1].forEach(side=>{for(let i=0;i<9;i++)leaf(c,side?size.width+10:-10,100+i*130,100+i%3*35,side?-.6:.6,'#7b997a');});c.restore();
    c.restore();
    c.save();round(c,p.x,p.y,p.w,p.h,16);c.strokeStyle='#b7c9ad';c.lineWidth=1;c.stroke();
    if(s.damageFlash>0){round(c,p.x,p.y,p.w,p.h,16);c.fillStyle='rgba(173,77,62,'+Math.min(.18,s.damageFlash*.3)+')';c.fill();}
    if(!hide&&s.stage==='burst')badge(c,'主血流重新奔涌',p.x+p.w/2,p.y+40,'#8f713e',20);
    if(!hide&&s.stage==='recovery'&&s.recovery>.65)badge(c,'一颗心，重新有了光',p.x+p.w/2,p.y+40,INK,20);
    c.restore();
  }
  window.GiantCureJourneyArt={draw};
})();
