(function () {
  'use strict';

  var PAPER = '#f7f6ed';
  var INK = '#346e60';

  function path(ctx, commands, fill, stroke, width) {
    ctx.beginPath();
    commands(ctx);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
  }

  function ellipse(ctx, x, y, rx, ry, color, angle) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle || 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function leaf(ctx, x, y, length, angle, color, vein) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    path(ctx, function (p) {
      p.moveTo(0, 0);
      p.bezierCurveTo(-length * 0.54, -length * 0.22, -length * 0.48, -length * 0.8, 0, -length);
      p.bezierCurveTo(length * 0.48, -length * 0.81, length * 0.5, -length * 0.25, 0, 0);
    }, color);
    if (vein) {
      path(ctx, function (p) { p.moveTo(0, -length * 0.12); p.quadraticCurveTo(-1.2, -length * 0.5, 0, -length * 0.9); }, null, 'rgba(247,246,237,.5)', 0.9);
    }
    ctx.restore();
  }

  function tree(ctx, x, y, size, tint, sway, type) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    var stem = size * 0.77;
    path(ctx, function (p) {
      p.moveTo(0, 1);
      p.bezierCurveTo(-size * 0.04, -stem * 0.3, size * 0.04, -stem * 0.8, 0, -stem);
    }, null, '#739981', Math.max(1.1, size * 0.027));
    if (type === 1) {
      for (var i = 0; i < 5; i += 1) {
        var ly = -stem * (0.18 + i * 0.15);
        var len = size * (0.43 - i * 0.048);
        leaf(ctx, 0, ly, len, -0.81, tint, true);
        leaf(ctx, 0, ly - 3, len * 0.9, 0.81, tint, true);
      }
      leaf(ctx, 0, -stem + size * 0.07, size * 0.3, 0, tint, true);
    } else {
      var clusters = [[-0.2, -0.65, 0.22], [0.18, -0.72, 0.2], [-0.14, -0.88, 0.2], [0.12, -0.95, 0.18], [0, -1.08, 0.16]];
      clusters.forEach(function (c, index) {
        leaf(ctx, c[0] * size, (c[1] + c[2]) * size, c[2] * size * 2.4, index % 2 ? 0.42 : -0.46, tint, false);
      });
      path(ctx, function (p) {
        p.moveTo(0, -size * 0.32); p.lineTo(-size * 0.15, -size * 0.57);
        p.moveTo(0, -size * 0.57); p.lineTo(size * 0.16, -size * 0.81);
      }, null, 'rgba(247,246,237,.4)', 1);
    }
    ctx.restore();
  }

  function sprig(ctx, x, y, size, seed, time) {
    var sway = Math.sin(time * 0.55 + seed) * 0.07;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    path(ctx, function (p) { p.moveTo(0, 0); p.quadraticCurveTo(-3, -size * 0.42, 2, -size); }, null, '#739c7f', 1.2);
    leaf(ctx, 0, -size * 0.3, size * 0.48, -0.96, '#a7c29e', false);
    leaf(ctx, 0, -size * 0.54, size * 0.38, 0.9, '#7fa98a', false);
    var blossomY = -size;
    for (var i = 0; i < 5; i += 1) {
      var a = i * Math.PI * 2 / 5;
      ellipse(ctx, 2 + Math.sin(a) * 3.1, blossomY + Math.cos(a) * 3.1, 2.2, 3.7, seed % 3 === 0 ? '#d9a495' : '#f4e8bd', -a);
    }
    ellipse(ctx, 2, blossomY, 1.8, 1.8, '#b99c61');
    ctx.restore();
  }

  function star(ctx, x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    path(ctx, function (p) {
      p.moveTo(x, y - size);
      p.quadraticCurveTo(x + size * 0.18, y - size * 0.15, x + size, y);
      p.quadraticCurveTo(x + size * 0.15, y + size * 0.2, x, y + size);
      p.quadraticCurveTo(x - size * 0.15, y + size * 0.2, x - size, y);
      p.quadraticCurveTo(x - size * 0.2, y - size * 0.18, x, y - size);
    }, '#b99c61');
    ctx.restore();
  }

  function building(ctx, x, y, width, height, style, lit) {
    var top = y - height;
    var wall = ctx.createLinearGradient(x, top, x + width, y);
    wall.addColorStop(0, '#f6eed5');
    wall.addColorStop(1, '#d5dfbd');
    path(ctx, function (p) {
      p.moveTo(x, y); p.lineTo(x + 1.6, top + 9);
      p.quadraticCurveTo(x + width * 0.5, top - 3, x + width - 1.4, top + 9);
      p.lineTo(x + width, y); p.closePath();
    }, wall, 'rgba(82,125,97,.42)', 1);
    path(ctx, function (p) {
      p.moveTo(x - 4, top + 11);
      p.bezierCurveTo(x + width * 0.2, top + 3, x + width * 0.4, top - (style ? 24 : 16), x + width * 0.49, top - (style ? 29 : 19));
      p.bezierCurveTo(x + width * 0.55, top - 11, x + width * 0.77, top + 3, x + width + 4, top + 11);
      p.quadraticCurveTo(x + width * 0.45, top + 18, x - 4, top + 11);
    }, style ? '#578a70' : '#81a582', 'rgba(52,110,96,.32)', 1);
    var rows = Math.max(1, Math.floor((height - 17) / 18));
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < (width > 25 ? 2 : 1); c += 1) {
        var wx = x + (width > 25 ? 8 + c * (width - 16) : width * 0.5);
        path(ctx, function (p) {
          p.moveTo(wx - 2.2, top + 23 + r * 18);
          p.lineTo(wx - 2.2, top + 18 + r * 18);
          p.quadraticCurveTo(wx, top + 12 + r * 18, wx + 2.2, top + 18 + r * 18);
          p.lineTo(wx + 2.2, top + 23 + r * 18); p.closePath();
        }, lit ? '#ecd289' : '#b4c69d');
      }
    }
    path(ctx, function (p) {
      p.moveTo(x + width * 0.36, y); p.lineTo(x + width * 0.36, y - 10);
      p.quadraticCurveTo(x + width * 0.5, y - 19, x + width * 0.65, y - 10);
      p.lineTo(x + width * 0.65, y);
    }, '#719b79');
    if (style) {
      path(ctx, function (p) { p.moveTo(x + width * 0.49, top - 29); p.lineTo(x + width * 0.49, top - 39); }, null, '#b99c61', 1);
      leaf(ctx, x + width * 0.49, top - 32, 10, 0.8, '#c4b374', false);
    }
  }

  function drawSky(ctx, time) {
    // A fine orbital arc frames the sleeping world without enclosing it in a card.
    ctx.save();
    ctx.setLineDash([1, 9]);
    ctx.lineCap = 'round';
    path(ctx, function (p) {
      p.moveTo(127, 601); p.bezierCurveTo(209, 492, 459, 472, 579, 560);
    }, null, 'rgba(185,156,97,.42)', 1.1);
    ctx.restore();
    star(ctx, 254, 526, 5, 0.62);
    star(ctx, 461, 522, 7, 0.78);
    star(ctx, 660, 639, 6, 0.5);
    star(ctx, 105, 635, 4.5, 0.52);
    star(ctx, 516, 579, 3, 0.55);
    ellipse(ctx, 322, 506, 1.6, 1.6, '#cfbf88');
    ellipse(ctx, 528, 539, 1.3, 1.3, '#cfbf88');
    ellipse(ctx, 184, 569, 1.9, 1.9, '#cfbf88');
    ctx.save();
    ctx.translate(597, 556 + Math.sin(time * 0.28) * 2.8);
    ctx.rotate(-0.28);
    path(ctx, function (p) {
      p.moveTo(9, -27);
      p.bezierCurveTo(-24, -17, -26, 23, 7, 30);
      p.bezierCurveTo(31, 31, 40, 12, 33, -3);
      p.bezierCurveTo(30, 18, 6, 20, -1, 5);
      p.bezierCurveTo(-9, -9, -2, -19, 9, -27);
    }, '#ddc994');
    ctx.restore();
    star(ctx, 635, 543, 4.5, 0.7);
  }

  function drawIsland(ctx, time) {
    // The underside follows uneven, sedimentary curves rather than a geometric cone.
    var rock = ctx.createLinearGradient(0, 777, 0, 925);
    rock.addColorStop(0, '#d6d7b8');
    rock.addColorStop(0.4, '#d7cba7');
    rock.addColorStop(1, '#b9b394');
    path(ctx, function (p) {
      p.moveTo(61, 782); p.bezierCurveTo(122, 764, 210, 780, 288, 788);
      p.bezierCurveTo(361, 785, 445, 782, 520, 796);
      p.bezierCurveTo(508, 814, 480, 832, 466, 847);
      p.bezierCurveTo(434, 849, 427, 873, 405, 881);
      p.bezierCurveTo(383, 886, 386, 909, 363, 906);
      p.bezierCurveTo(346, 903, 334, 925, 311, 918);
      p.bezierCurveTo(285, 913, 281, 932, 254, 913);
      p.bezierCurveTo(225, 915, 225, 895, 194, 889);
      p.bezierCurveTo(158, 885, 145, 867, 127, 850);
      p.bezierCurveTo(95, 841, 81, 814, 61, 782); p.closePath();
    }, rock);

    var layers = [
      [79, 806, 130, 828, 233, 815, 305, 827, 403, 838, 479, 814],
      [100, 828, 162, 844, 236, 832, 319, 847, 395, 859, 450, 845],
      [142, 855, 203, 873, 244, 856, 303, 870, 347, 885, 412, 872],
      [203, 886, 239, 902, 279, 882, 309, 893, 335, 906, 367, 901]
    ];
    layers.forEach(function (l, i) {
      path(ctx, function (p) {
        p.moveTo(l[0], l[1]); p.bezierCurveTo(l[2], l[3], l[4], l[5], l[6], l[7]);
        p.quadraticCurveTo(l[8], l[9], l[10], l[11]);
      }, null, i % 2 ? 'rgba(247,246,237,.52)' : 'rgba(151,149,112,.29)', i === 0 ? 4.4 : 2.3);
    });
    for (var i = 0; i < 33; i += 1) {
      var sx = 105 + (i * 79) % 361;
      var sy = 814 + (i * 31) % 64;
      if (Math.abs(sx - 292) > 190 - (sy - 810) * 1.2) continue;
      ellipse(ctx, sx, sy, 1 + (i % 3) * 0.5, 0.65, 'rgba(135,132,103,.28)', i * 0.2);
    }
    // A tiny shell fossil is a quiet reward for looking closely.
    ctx.strokeStyle = 'rgba(142,139,103,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var s = 0; s < 37; s += 1) {
      var angle = s * 0.35;
      var radius = s * 0.13;
      var fx = 218 + Math.cos(angle) * radius;
      var fy = 851 + Math.sin(angle) * radius * 0.7;
      if (s === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
    }
    ctx.stroke();

    var roots = [[191, 886, -19, 34], [228, 903, 7, 35], [266, 914, -11, 36], [332, 914, 13, 30], [374, 900, 19, 29], [411, 879, 21, 30]];
    roots.forEach(function (r, index) {
      var sway = Math.sin(time * 0.5 + index) * 1.4;
      path(ctx, function (p) {
        p.moveTo(r[0], r[1]);
        p.bezierCurveTo(r[0] - 4, r[1] + 12, r[0] + r[2] + sway, r[1] + r[3] - 8, r[0] + r[2] * 0.7 + sway, r[1] + r[3]);
        p.moveTo(r[0] - 1, r[1] + 13);
        p.quadraticCurveTo(r[0] - 10, r[1] + 17, r[0] - 10, r[1] + 25);
      }, null, 'rgba(130,146,112,.6)', 1.1);
    });
  }

  function drawGiant(ctx, time) {
    var skin = ctx.createLinearGradient(0, 680, 0, 815);
    skin.addColorStop(0, '#eee4c4');
    skin.addColorStop(1, '#dfcfaa');

    // Reclining torso and bent arm form the low foreground of the green hillside.
    path(ctx, function (p) {
      p.moveTo(98, 757); p.bezierCurveTo(122, 720, 171, 690, 221, 680);
      p.bezierCurveTo(303, 662, 402, 689, 463, 727);
      p.bezierCurveTo(484, 740, 505, 759, 531, 774);
      p.bezierCurveTo(538, 783, 538, 792, 519, 797);
      p.bezierCurveTo(470, 813, 390, 814, 324, 803);
      p.bezierCurveTo(261, 801, 187, 797, 143, 782);
      p.bezierCurveTo(125, 786, 103, 777, 98, 757); p.closePath();
    }, skin);

    var grass = ctx.createLinearGradient(0, 613, 0, 795);
    grass.addColorStop(0, '#b5c9a6');
    grass.addColorStop(0.52, '#96b69a');
    grass.addColorStop(1, '#749f85');
    path(ctx, function (p) {
      p.moveTo(90, 756); p.bezierCurveTo(124, 710, 151, 673, 201, 659);
      p.bezierCurveTo(223, 650, 247, 656, 270, 642);
      p.bezierCurveTo(305, 615, 338, 617, 361, 623);
      p.bezierCurveTo(408, 623, 431, 653, 458, 686);
      p.bezierCurveTo(477, 706, 491, 718, 501, 747);
      p.bezierCurveTo(447, 744, 438, 770, 386, 762);
      p.bezierCurveTo(337, 747, 313, 783, 265, 766);
      p.bezierCurveTo(222, 750, 184, 776, 149, 763);
      p.bezierCurveTo(126, 771, 104, 763, 90, 756); p.closePath();
    }, grass);
    path(ctx, function (p) {
      p.moveTo(100, 755); p.bezierCurveTo(150, 710, 181, 717, 229, 708);
      p.bezierCurveTo(294, 696, 302, 663, 365, 668);
      p.bezierCurveTo(424, 673, 446, 706, 482, 729);
    }, null, 'rgba(233,239,207,.45)', 2);
    path(ctx, function (p) {
      p.moveTo(134, 755); p.bezierCurveTo(204, 734, 230, 752, 279, 736);
      p.moveTo(385, 725); p.quadraticCurveTo(432, 731, 455, 745);
    }, null, 'rgba(53,110,87,.18)', 1.1);

    // A soft side profile: closed eyelid, lifted nose, calm mouth and round cheek.
    var face = ctx.createLinearGradient(502, 693, 609, 789);
    face.addColorStop(0, '#f2e9cf');
    face.addColorStop(0.7, '#efe2c5');
    face.addColorStop(1, '#e5d6b5');
    path(ctx, function (p) {
      p.moveTo(499, 720); p.bezierCurveTo(497, 696, 525, 680, 553, 692);
      p.bezierCurveTo(580, 696, 593, 714, 599, 732);
      p.quadraticCurveTo(604, 742, 627, 746);
      p.bezierCurveTo(638, 749, 632, 758, 616, 760);
      p.quadraticCurveTo(615, 767, 608, 768);
      p.quadraticCurveTo(616, 775, 608, 781);
      p.bezierCurveTo(593, 797, 562, 798, 535, 783);
      p.bezierCurveTo(513, 775, 493, 754, 499, 720); p.closePath();
    }, face, 'rgba(153,142,105,.16)', 1);
    ellipse(ctx, 568, 759, 14, 7.5, 'rgba(212,155,128,.15)', 0.26);
    path(ctx, function (p) {
      p.moveTo(560, 735); p.quadraticCurveTo(574, 747, 589, 740);
      p.moveTo(582, 742); p.lineTo(585, 746);
      p.moveTo(587, 741); p.lineTo(591, 744);
    }, null, '#648474', 1.9);
    path(ctx, function (p) { p.moveTo(560, 727); p.quadraticCurveTo(572, 723, 581, 729); }, null, 'rgba(100,132,116,.45)', 1.2);
    path(ctx, function (p) {
      p.moveTo(599, 732); p.quadraticCurveTo(604, 742, 610, 744);
      p.moveTo(617, 755); p.quadraticCurveTo(620, 751, 624, 753);
      p.moveTo(601, 772); p.quadraticCurveTo(607, 774, 612, 771);
    }, null, '#bba985', 1.1);

    path(ctx, function (p) {
      p.moveTo(504, 752); p.bezierCurveTo(479, 740, 471, 721, 481, 694);
      p.bezierCurveTo(485, 668, 517, 657, 540, 671);
      p.bezierCurveTo(567, 671, 587, 685, 592, 708);
      p.bezierCurveTo(580, 696, 569, 699, 557, 702);
      p.bezierCurveTo(541, 700, 531, 709, 529, 725);
      p.quadraticCurveTo(513, 724, 504, 752); p.closePath();
    }, '#709c81');
    for (var curl = 0; curl < 7; curl += 1) {
      var cx = 487 + curl * 10;
      var cy = 704 - Math.sin(curl * 0.34) * 20;
      path(ctx, function (p) {
        p.moveTo(cx, cy + 14); p.bezierCurveTo(cx - 6, cy + 6, cx + 3, cy - 3, cx + 7, cy + 2);
      }, null, 'rgba(225,235,202,.28)', 1);
    }
    ellipse(ctx, 524, 739, 9.5, 13, '#ecdfbf', -0.32);
    path(ctx, function (p) { p.moveTo(526, 731); p.quadraticCurveTo(516, 733, 523, 745); }, null, '#bcae89', 1);

    // His hand rests under his cheek. The curved seams are deliberately light.
    path(ctx, function (p) {
      p.moveTo(390, 781); p.bezierCurveTo(430, 771, 460, 774, 487, 781);
      p.bezierCurveTo(512, 778, 534, 779, 549, 786);
      p.quadraticCurveTo(557, 794, 544, 797);
      p.bezierCurveTo(513, 801, 494, 796, 472, 795);
      p.quadraticCurveTo(433, 806, 402, 798);
    }, '#ecdfbd', 'rgba(164,151,112,.22)', 1);
    for (var finger = 0; finger < 3; finger += 1) {
      path(ctx, function (p) {
        p.moveTo(518 + finger * 8, 784 + finger * 1.5); p.quadraticCurveTo(525 + finger * 6, 791, 526 + finger * 7, 797);
      }, null, 'rgba(163,150,110,.27)', 0.9);
    }

    // A low moss rim stitches the giant into the island without hiding his silhouette.
    path(ctx, function (p) {
      p.moveTo(57, 779); p.quadraticCurveTo(75, 767, 95, 777);
      p.quadraticCurveTo(109, 768, 125, 780); p.quadraticCurveTo(143, 777, 157, 787);
      p.quadraticCurveTo(181, 782, 200, 791); p.quadraticCurveTo(222, 783, 242, 794);
      p.quadraticCurveTo(268, 787, 290, 800); p.quadraticCurveTo(318, 789, 339, 799);
      p.quadraticCurveTo(370, 790, 397, 803); p.quadraticCurveTo(424, 796, 446, 805);
      p.quadraticCurveTo(479, 796, 515, 797); p.quadraticCurveTo(495, 815, 458, 816);
      p.bezierCurveTo(324, 822, 173, 809, 68, 795); p.closePath();
    }, '#93ae86');
    path(ctx, function (p) {
      p.moveTo(67, 792); p.bezierCurveTo(189, 803, 365, 817, 495, 808);
    }, null, 'rgba(234,235,198,.55)', 2);
  }

  function drawCity(ctx, time, restored) {
    // Hair becomes a layered woodland, with pale trunks visible through the canopy.
    for (var back = 0; back < 10; back += 1) {
      var bx = 150 + back * 20;
      var by = 684 - Math.sin(back / 10 * Math.PI) * 42;
      tree(ctx, bx, by, 39 + (back * 17) % 43, back % 2 ? '#9ebd9a' : '#88ad91', Math.sin(time * 0.4 + back) * 0.014, back % 2);
    }
    // The main city climbs the gentle shoulder; little footbridges link its towers.
    path(ctx, function (p) {
      p.moveTo(267, 654); p.quadraticCurveTo(292, 631, 315, 647);
      p.moveTo(329, 646); p.quadraticCurveTo(352, 621, 377, 636);
      p.moveTo(386, 650); p.quadraticCurveTo(415, 639, 435, 660);
    }, null, '#d8dcb8', 7);
    path(ctx, function (p) {
      p.moveTo(269, 647); p.quadraticCurveTo(292, 624, 315, 640);
      p.moveTo(330, 639); p.quadraticCurveTo(352, 614, 376, 629);
      p.moveTo(387, 644); p.quadraticCurveTo(416, 632, 433, 654);
    }, null, 'rgba(93,139,108,.45)', 1);
    building(ctx, 274, 651, 24, 54, 0, true);
    building(ctx, 309, 647, 30, 75, 1, true);
    building(ctx, 388, 653, 29, 67, 1, true);
    building(ctx, 429, 669, 24, 49, 0, true);
    building(ctx, 249, 667, 19, 38, 0, false);
    building(ctx, 351, 661, 25, 47, 0, true);

    // A luminous, bell-like heart in the living tree is the city's quiet centre.
    var halo = ctx.createRadialGradient(362, 567, 5, 362, 567, 73);
    halo.addColorStop(0, 'rgba(233,215,150,' + (0.23 + restored * 0.12) + ')');
    halo.addColorStop(1, 'rgba(233,215,150,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(286, 490, 152, 160);
    path(ctx, function (p) {
      p.moveTo(360, 643); p.bezierCurveTo(346, 605, 369, 569, 361, 532);
      p.moveTo(359, 586); p.quadraticCurveTo(337, 564, 326, 559);
      p.moveTo(362, 571); p.quadraticCurveTo(386, 549, 399, 545);
    }, null, '#789368', 6);
    leaf(ctx, 352, 570, 58, -0.7, '#a6c293', true);
    leaf(ctx, 369, 563, 55, 0.68, '#80ac87', true);
    leaf(ctx, 362, 543, 51, 0.06, '#bbce9e', true);
    leaf(ctx, 328, 565, 34, -0.96, '#87b18e', true);
    leaf(ctx, 398, 553, 35, 0.85, '#a6c293', true);
    ellipse(ctx, 361, 588, 11, 14, '#ecd38f');
    path(ctx, function (p) {
      p.moveTo(355, 588); p.lineTo(358, 588); p.lineTo(360, 584);
      p.lineTo(363, 592); p.lineTo(365, 588); p.lineTo(368, 588);
    }, null, '#fcf5d7', 1.3);
    ellipse(ctx, 361, 605, 2.1, 2.1, '#c6b272');
    path(ctx, function (p) { p.moveTo(361, 602); p.lineTo(361, 610); }, null, '#bca66a', 1);

    // The hairline on the head continues the forest at a smaller scale.
    for (var h = 0; h < 7; h += 1) {
      tree(ctx, 478 + h * 12, 701 - Math.sin(h * 0.4) * 17, 25 + (h * 13) % 25, h % 2 ? '#759f80' : '#96b68c', Math.sin(time * 0.5 + h) * 0.02, h % 2);
    }
  }

  function drawRiver(ctx, time) {
    var riverPath = function (p) {
      p.moveTo(387, 665); p.bezierCurveTo(374, 677, 354, 676, 351, 691);
      p.bezierCurveTo(347, 713, 303, 710, 307, 728);
      p.bezierCurveTo(312, 748, 347, 747, 326, 769);
      p.bezierCurveTo(319, 778, 294, 788, 296, 805);
    };
    path(ctx, riverPath, null, '#b8d5c0', 20);
    path(ctx, riverPath, null, '#6faea1', 12.5);
    path(ctx, riverPath, null, 'rgba(221,239,214,.72)', 3.2);
    path(ctx, function (p) {
      p.moveTo(295, 803); p.bezierCurveTo(296, 825, 311, 835, 309, 857);
      p.bezierCurveTo(306, 877, 320, 879, 317, 896);
    }, null, 'rgba(133,187,170,.73)', 11);
    path(ctx, function (p) {
      p.moveTo(295, 803); p.bezierCurveTo(294, 824, 309, 835, 307, 856);
      p.bezierCurveTo(304, 874, 316, 884, 314, 895);
    }, null, 'rgba(243,247,224,.82)', 3.1);
    path(ctx, function (p) {
      p.moveTo(302, 807); p.bezierCurveTo(304, 828, 317, 840, 316, 855);
    }, null, 'rgba(235,245,220,.46)', 1.3);
    for (var i = 0; i < 5; i += 1) {
      var fall = (time * 0.22 + i * 0.22) % 1;
      ellipse(ctx, 316 + Math.sin(i + time * 0.3) * 3, 895 + fall * 30, 1.4 - fall * 0.8, 2.7 - fall, 'rgba(119,178,162,' + (0.4 * (1 - fall)) + ')');
    }
    for (var wave = 0; wave < 5; wave += 1) {
      var wy = 687 + wave * 23;
      var wx = [360, 332, 317, 329, 301][wave];
      path(ctx, function (p) { p.moveTo(wx - 3, wy); p.quadraticCurveTo(wx + 1, wy + Math.sin(time * 1.2 + wave) * 1.5, wx + 5, wy - 1); }, null, 'rgba(244,247,218,.65)', 1.1);
    }
    // A little root bridge keeps the river part of an inhabited world.
    path(ctx, function (p) {
      p.moveTo(315, 748); p.quadraticCurveTo(330, 733, 346, 745);
    }, null, '#c8b78c', 5);
    path(ctx, function (p) { p.moveTo(315, 744); p.quadraticCurveTo(330, 729, 346, 741); }, null, '#8a9b75', 1.2);
    for (var post = 0; post < 5; post += 1) {
      var px = 317 + post * 6.7;
      var py = 744 - Math.sin(post / 4 * Math.PI) * 6;
      path(ctx, function (p) { p.moveTo(px, py); p.lineTo(px, py - 5); }, null, '#8a9b75', 1);
    }
  }

  window.GiantCureCover = {
    draw: function (ctx, time, restored) {
      time = Number.isFinite(time) ? time : 0;
      restored = Math.max(0, Math.min(1, Number(restored) || 0));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 430, 720, 548);
      ctx.clip();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // All washes are translucent, so the drawing can sit directly on the page's paper.
      var atmosphere = ctx.createRadialGradient(346, 706, 36, 346, 706, 306);
      atmosphere.addColorStop(0, 'rgba(199,216,184,.3)');
      atmosphere.addColorStop(0.8, 'rgba(220,228,202,.12)');
      atmosphere.addColorStop(1, 'rgba(247,246,237,0)');
      ctx.fillStyle = atmosphere;
      ctx.fillRect(33, 448, 652, 477);
      drawSky(ctx, time);

      // Almost-transparent far ridges lend the island depth without a solid backdrop.
      path(ctx, function (p) {
        p.moveTo(76, 739); p.bezierCurveTo(120, 708, 147, 635, 186, 650);
        p.bezierCurveTo(220, 662, 226, 592, 259, 613);
        p.bezierCurveTo(303, 633, 307, 576, 344, 598);
        p.bezierCurveTo(389, 622, 413, 600, 449, 650);
        p.bezierCurveTo(489, 667, 505, 641, 542, 698);
        p.lineTo(554, 764); p.closePath();
      }, 'rgba(173,197,168,.2)');
      path(ctx, function (p) {
        p.moveTo(94, 719); p.bezierCurveTo(161, 702, 197, 680, 224, 692);
        p.moveTo(410, 666); p.quadraticCurveTo(448, 670, 474, 696);
      }, null, 'rgba(140,171,145,.16)', 1.2);

      drawIsland(ctx, time);
      drawGiant(ctx, time);
      drawCity(ctx, time, restored);
      drawRiver(ctx, time);

      var foliage = [[104, 770, 33, 0], [133, 781, 23, 1], [175, 786, 20, 2], [213, 791, 31, 3], [245, 795, 20, 4], [271, 795, 25, 5], [359, 802, 21, 6], [383, 804, 27, 7], [418, 806, 21, 8], [461, 807, 23, 9], [485, 804, 17, 10]];
      foliage.forEach(function (f) { sprig(ctx, f[0], f[1], f[2], f[3], time); });
      tree(ctx, 82, 775, 43, '#729b7d', Math.sin(time * 0.6) * 0.02, 1);
      tree(ctx, 181, 709, 41, '#6e9c80', Math.sin(time * 0.6 + 1) * 0.018, 0);
      tree(ctx, 231, 714, 30, '#89af8c', Math.sin(time * 0.5 + 4) * 0.02, 1);
      leaf(ctx, 457, 812, 25, 0.52, '#7a9d77', true);
      leaf(ctx, 451, 813, 20, -0.55, '#aec29a', true);
      leaf(ctx, 156, 796, 24, -0.3, '#a7c092', true);

      // Three birds, only a few ink strokes, echo the closed eye of the giant.
      path(ctx, function (p) {
        p.moveTo(446, 583); p.quadraticCurveTo(451, 578, 456, 583); p.quadraticCurveTo(461, 577, 467, 582);
        p.moveTo(475, 605); p.quadraticCurveTo(479, 601, 483, 605); p.quadraticCurveTo(487, 601, 491, 605);
        p.moveTo(131, 616); p.quadraticCurveTo(135, 612, 139, 615); p.quadraticCurveTo(144, 611, 148, 614);
      }, null, 'rgba(78,121,97,.5)', 1.2);

      // Fireflies drift above plants. The lower-right caption area remains open.
      for (var i = 0; i < 21; i += 1) {
        var fx = 102 + ((i * 83) % 493) + Math.sin(time * 0.3 + i * 1.7) * 5;
        var fy = 600 + ((i * 47) % 164) + Math.sin(time * 0.43 + i) * 7;
        var shimmer = 0.25 + (Math.sin(time * 1.1 + i * 2.1) + 1) * 0.2;
        ellipse(ctx, fx, fy, 1.15 + (i % 3) * 0.35, 1.15 + (i % 3) * 0.35, 'rgba(185,156,97,' + shimmer + ')');
        if (i % 7 === 0) star(ctx, fx, fy, 3.4, shimmer * 0.8);
      }
      // Sparse pencil-like accents keep the tiny forest floor lively.
      path(ctx, function (p) {
        p.moveTo(119, 774); p.lineTo(116, 768); p.moveTo(119, 774); p.lineTo(124, 769);
        p.moveTo(193, 774); p.lineTo(190, 769); p.moveTo(193, 774); p.lineTo(198, 767);
        p.moveTo(403, 786); p.lineTo(401, 781); p.moveTo(403, 786); p.lineTo(408, 782);
      }, null, 'rgba(64,114,84,.44)', 1);

      ctx.restore();
    }
  };
}());
