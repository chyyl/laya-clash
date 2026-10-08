import { ARENA } from './constants.js';
import { SKILLS } from '../data/skills.js';

// 水墨夜约战（武侠/秘籍风）：远山淡墨、雾带留白、月下青松、武馆山门、
// 悬轴秘籍招式图、灯笼横索、看客火把、竹篱、白灰圈、双火盆。
// 背景只用墨色与暖灯，青/红留给选手剪影，保证战斗可读性。
// 静态分 BACK/FRONT 两层离屏缓存一次成图；每帧只演雾、火、人潮与卷轴轮播。
const TAU = Math.PI * 2;
let seeded = false;
const STARS = [], TWINK = [], RFAR = [], RNEAR = [], CROWDB = [], CROWDF = [];
const CRACKS = [], WASHES = [], MIST1 = [], MIST2 = [], EMBERS = [];
let BACK = null, FRONT = null, GRAIN = null, GRAIN_P = null;

function seed() {
  if (seeded) return;
  seeded = true;
  let s = 42;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 36; i++) {
    const st = { x: rnd() * 1280, y: 16 + rnd() * 212, r: 0.6 + rnd() * 1.1, a: 0.2 + rnd() * 0.5 };
    STARS.push(st);
    if (i % 9 === 3) TWINK.push({ x: st.x, y: st.y, r: st.r, ph: rnd() * 7 });
  }
  let x = -48;
  while (x < 1340) { RFAR.push([x, 258 + rnd() * 58 - (rnd() < 0.26 ? 46 + rnd() * 28 : 0)]); x += 58 + rnd() * 74; }
  RFAR.push([1340, 276]);
  x = -48;
  while (x < 1340) { RNEAR.push([x, 322 + rnd() * 66 - (rnd() < 0.26 ? 38 + rnd() * 24 : 0)]); x += 70 + rnd() * 86; }
  RNEAR.push([1340, 348]);
  for (let i = 0; i < 32; i++) {
    const row = i % 2;
    const p = { x: 10 + ((i / 2) | 0) * 82 + rnd() * 40 + row * 34, h: (row ? 52 : 44) + rnd() * 12, row, ph: rnd() * TAU, torch: rnd() < 0.5, fl: rnd() * 7 };
    (row ? CROWDB : CROWDF).push(p);
  }
  for (let i = 0; i < 6; i++) {
    const x0 = 80 + rnd() * 1120, y0 = ARENA.GROUND + 18 + rnd() * 70;
    const pts = [[x0, y0]]; let px = x0, py = y0;
    for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * 90; py += 8 + rnd() * 14; pts.push([px, py]); }
    CRACKS.push(pts);
  }
  for (let i = 0; i < 7; i++) WASHES.push({ x: 90 + rnd() * 1100, y: ARENA.GROUND + 14 + rnd() * 86, rx: 60 + rnd() * 130, ry: 12 + rnd() * 20, a: 0.05 + rnd() * 0.05, dark: rnd() < 0.7 });
  for (let i = 0; i < 5; i++) MIST1.push({ x0: rnd() * 1600, y: 406 + rnd() * 56, rx: 210 + rnd() * 140, ry: 44 + rnd() * 22, sp: 6 + rnd() * 9, a: 0.05 + rnd() * 0.04 });
  for (let i = 0; i < 4; i++) MIST2.push({ x0: rnd() * 1600, y: 558 + rnd() * 32, rx: 250 + rnd() * 130, ry: 26 + rnd() * 14, sp: 4 + rnd() * 6, a: 0.04 + rnd() * 0.03 });
  for (let i = 0; i < 18; i++) EMBERS.push({ x0: 40 + rnd() * 1200, ph: rnd(), sp: 20 + rnd() * 26, r: 1.2 + rnd() * 1.6, sw: 10 + rnd() * 16 });
}

// 字体就绪后重建缓存（首帧可能先于 webfont）
try {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { BACK = null; FRONT = null; });
  }
} catch (e) { /* 忽略 */ }

function offscreen() {
  const c = document.createElement('canvas');
  c.width = ARENA.W; c.height = ARENA.H;
  return c;
}

function ridgeFill(g, pts, base, color) {
  g.beginPath();
  g.moveTo(pts[0][0], base);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.lineTo(pts[pts.length - 1][0], base);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

function fadeBand(g, y0, y1, rgb, a) {
  const fg = g.createLinearGradient(0, y0, 0, y1);
  fg.addColorStop(0, `rgba(${rgb},0)`);
  fg.addColorStop(1, `rgba(${rgb},${a})`);
  g.fillStyle = fg;
  g.fillRect(0, y0, ARENA.W, y1 - y0);
}

function drawGate(g) {
  // 屋顶（飞檐，瓦面受月微亮）
  g.fillStyle = '#1a2133';
  g.beginPath();
  g.moveTo(912, 398);
  g.quadraticCurveTo(952, 362, 1018, 350);
  g.lineTo(1144, 350);
  g.quadraticCurveTo(1210, 362, 1250, 398);
  g.lineTo(1243, 406);
  g.quadraticCurveTo(1206, 375, 1144, 364);
  g.lineTo(1018, 364);
  g.quadraticCurveTo(956, 375, 919, 406);
  g.closePath();
  g.fill();
  g.beginPath(); g.arc(1032, 344, 6, Math.PI, 0); g.arc(1128, 344, 6, Math.PI, 0); g.fill();
  // 檐口受月
  g.strokeStyle = 'rgba(206,214,236,0.16)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(912, 398); g.quadraticCurveTo(952, 362, 1018, 350);
  g.lineTo(1144, 350); g.quadraticCurveTo(1210, 362, 1250, 398);
  g.stroke();
  // 额枋与墙体
  g.fillStyle = '#151b2a';
  g.fillRect(958, 396, 260, 24);
  g.fillStyle = '#0c101a';
  g.fillRect(958, 420, 260, 186);
  // 匾：演武场
  g.fillStyle = '#121009';
  g.fillRect(1023, 424, 116, 40);
  g.strokeStyle = 'rgba(168,144,90,0.85)';
  g.lineWidth = 2;
  g.strokeRect(1023, 424, 116, 40);
  g.fillStyle = '#e2cc93';
  g.font = '700 22px "Noto Sans SC",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('演武场', 1081, 445);
  g.textBaseline = 'alphabetic';
  // 门洞与内里灯暖
  g.fillStyle = '#070910';
  g.fillRect(986, 464, 206, 142);
  const ig = g.createRadialGradient(1089, 570, 10, 1089, 570, 130);
  ig.addColorStop(0, 'rgba(255,170,90,0.12)');
  ig.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = ig;
  g.fillRect(986, 464, 206, 142);
  // 柱
  g.fillStyle = '#111726';
  g.fillRect(970, 420, 16, 186);
  g.fillRect(1192, 420, 16, 186);
  g.fillStyle = 'rgba(190,205,235,0.12)';
  g.fillRect(971, 420, 2, 186);
  g.fillRect(1193, 420, 2, 186);
}

function drawPine(g) {
  g.fillStyle = '#0a0d13';
  g.strokeStyle = '#0a0d13';
  g.lineCap = 'round';
  g.lineWidth = 13;
  g.beginPath(); g.moveTo(186, 568); g.quadraticCurveTo(152, 474, 146, 378); g.stroke();
  g.lineWidth = 8;
  g.beginPath(); g.moveTo(146, 378); g.quadraticCurveTo(140, 318, 122, 258); g.stroke();
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(131, 300); g.lineTo(126, 232); g.stroke();
  g.lineWidth = 4;
  const BR = [
    [146, 376, 214, 370, 274, 346],
    [142, 338, 96, 330, 46, 318],
    [132, 306, 186, 292, 240, 270],
    [126, 276, 92, 268, 56, 252],
  ];
  for (const b of BR) {
    g.beginPath(); g.moveTo(b[0], b[1]); g.quadraticCurveTo(b[2], b[3], b[4], b[5]); g.stroke();
  }
  const CL = [
    [210, 356, 40, 13], [258, 344, 34, 11], [278, 344, 26, 9],
    [96, 326, 36, 12], [56, 316, 32, 11], [42, 316, 22, 8],
    [184, 286, 36, 12], [228, 272, 32, 11], [246, 268, 24, 9],
    [92, 262, 30, 10], [58, 250, 26, 9],
    [124, 224, 32, 11], [146, 232, 24, 9], [110, 212, 22, 8],
  ];
  for (const cl of CL) {
    const [cx, cy, rx, ry] = cl;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
    g.lineWidth = 1.6;
    for (let k = 0; k < 4; k++) {
      const a = (k - 1.5) * 0.42;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * rx * 0.7, cy + Math.sin(a) * ry * 0.7);
      g.lineTo(cx + Math.cos(a) * rx * 1.35, cy + Math.sin(a) * ry * 1.7);
      g.stroke();
    }
  }
  // 月光侧微亮边
  g.strokeStyle = 'rgba(200,212,238,0.13)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(181, 560); g.quadraticCurveTo(148, 472, 142, 380); g.stroke();
}

function buildBack() {
  const { W, H, GROUND } = ARENA;
  const c = offscreen();
  const g = c.getContext('2d');
  // 夜空
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#06070c');
  sky.addColorStop(0.55, '#0a0d15');
  sky.addColorStop(1, '#11141d');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GROUND);
  // 星
  g.fillStyle = '#cdd6ea';
  for (const st of STARS) {
    g.globalAlpha = st.a;
    g.beginPath(); g.arc(st.x, st.y, st.r, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  // 残月与枯笔圈
  g.fillStyle = '#efe7d0';
  g.beginPath(); g.arc(168, 106, 33, 0, TAU); g.fill();
  g.fillStyle = 'rgba(7,8,13,0.92)';
  g.beginPath(); g.arc(152, 96, 30, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(232,222,192,0.30)';
  g.lineWidth = 2;
  g.setLineDash([16, 6, 28, 9]);
  g.beginPath(); g.arc(168, 106, 45, 0.4, 5.9); g.stroke();
  g.setLineDash([]);
  // 淡墨流云（一缕横过月面）
  const CLOUDS = [[430, 84, 250, 26, 0.10], [880, 152, 300, 24, 0.08], [170, 124, 210, 20, 0.13], [640, 58, 340, 22, 0.07]];
  for (const cl of CLOUDS) {
    const cg = g.createRadialGradient(cl[0], cl[1], 4, cl[0], cl[1], cl[2]);
    cg.addColorStop(0, `rgba(156,166,192,${cl[4]})`);
    cg.addColorStop(1, 'rgba(156,166,192,0)');
    g.save();
    g.translate(cl[0], cl[1]); g.scale(1, cl[3] / cl[2]); g.translate(-cl[0], -cl[1]);
    g.fillStyle = cg;
    g.fillRect(cl[0] - cl[2], cl[1] - cl[2], cl[2] * 2, cl[2] * 2);
    g.restore();
  }
  // 远山（淡墨，随雾渐散）
  ridgeFill(g, RFAR, 540, '#171d2b');
  fadeBand(g, 316, 474, '15,18,28', 0.96);
  // 近山（浓墨）
  ridgeFill(g, RNEAR, 560, '#090b12');
  fadeBand(g, 356, 516, '13,15,24', 0.93);
  // 山门（右侧演武场）
  drawGate(g);
  // 月下青松（左侧）
  drawPine(g);
  // 地面（青石灰土）
  const gnd = g.createLinearGradient(0, GROUND, 0, H);
  gnd.addColorStop(0, '#14131c');
  gnd.addColorStop(0.3, '#0b0a11');
  gnd.addColorStop(1, '#07070c');
  g.fillStyle = gnd;
  g.fillRect(0, GROUND, W, H - GROUND);
  // 地面墨渍
  for (const w of WASHES) {
    const col = w.dark ? '4,5,9' : '30,30,42';
    const wg = g.createRadialGradient(w.x, w.y, 4, w.x, w.y, w.rx);
    wg.addColorStop(0, `rgba(${col},${w.a})`);
    wg.addColorStop(1, `rgba(${col},0)`);
    g.save();
    g.translate(w.x, w.y); g.scale(1, w.ry / w.rx); g.translate(-w.x, -w.y);
    g.fillStyle = wg;
    g.fillRect(w.x - w.rx, w.y - w.rx, w.rx * 2, w.rx * 2);
    g.restore();
  }
  // 白灰画圈（约战的演武场）
  g.save();
  g.setLineDash([30, 20]);
  g.strokeStyle = 'rgba(232,236,244,0.13)';
  g.lineWidth = 3;
  g.beginPath(); g.ellipse(640, GROUND + 56, 480, 44, 0, 0, TAU); g.stroke();
  g.restore();
  // 裂缝
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 2;
  for (const pts of CRACKS) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  }
  // 台沿冷光（月色）
  g.strokeStyle = 'rgba(198,214,238,0.30)';
  g.lineWidth = 3;
  g.shadowColor = 'rgba(150,180,225,0.6)';
  g.shadowBlur = 10;
  g.beginPath(); g.moveTo(0, GROUND + 1); g.lineTo(W, GROUND + 1); g.stroke();
  g.shadowBlur = 0;
  // 两侧墨色压边
  let eg = g.createLinearGradient(0, 0, 74, 0);
  eg.addColorStop(0, 'rgba(3,4,8,0.55)');
  eg.addColorStop(1, 'rgba(3,4,8,0)');
  g.fillStyle = eg;
  g.fillRect(0, 0, 74, H);
  eg = g.createLinearGradient(W, 0, W - 74, 0);
  eg.addColorStop(0, 'rgba(3,4,8,0.55)');
  eg.addColorStop(1, 'rgba(3,4,8,0)');
  g.fillStyle = eg;
  g.fillRect(W - 74, 0, 74, H);
  return c;
}

function blade(g, x, y, dx, len) {
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + dx * len * 0.5, y - 10, x + dx * len, y - 4);
  g.quadraticCurveTo(x + dx * len * 0.5, y - 2, x, y + 3);
  g.closePath();
  g.fill();
}

function buildFront() {
  const c = offscreen();
  const g = c.getContext('2d');
  // 竹篱：立竹 + 两道横杆
  for (let x = 76; x <= 1208; x += 34) {
    g.fillStyle = '#0f120b';
    g.fillRect(x - 2.5, 358, 5, 254);
    g.fillStyle = 'rgba(150,162,116,0.16)';
    g.fillRect(x - 2.5, 358, 1.4, 254);
    for (let ny = 376; ny < 606; ny += 52) {
      g.fillStyle = 'rgba(126,138,96,0.28)';
      g.fillRect(x - 2.5, ny, 5, 1.6);
    }
  }
  for (const ry of [404, 500]) {
    g.fillStyle = '#12160d';
    g.fillRect(70, ry, 1142, 7);
    g.fillStyle = 'rgba(150,162,116,0.14)';
    g.fillRect(70, ry, 1142, 1.6);
    for (let nx = 84; nx < 1210; nx += 48) {
      g.fillStyle = 'rgba(126,138,96,0.22)';
      g.fillRect(nx, ry, 1.6, 7);
    }
  }
  // 绳结
  let k = 0;
  for (let x = 76; x <= 1208; x += 34, k++) {
    if (k % 3) continue;
    for (const ry of [404, 500]) {
      g.fillStyle = '#2a2113';
      g.fillRect(x - 5, ry - 2, 10, 11);
      g.strokeStyle = 'rgba(74,58,34,0.9)';
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x - 5, ry); g.lineTo(x + 5, ry + 8); g.stroke();
      g.beginPath(); g.moveTo(x + 5, ry); g.lineTo(x - 5, ry + 8); g.stroke();
    }
  }
  // 边缘竹丛
  const clusters = [
    { xs: [14, 30, 46, 60], top: [300, 344, 318, 362], w: [8, 6, 7, 5] },
    { xs: [1266, 1250, 1234, 1220], top: [306, 340, 322, 358], w: [8, 6, 7, 5] },
  ];
  for (const cl of clusters) {
    for (let i = 0; i < cl.xs.length; i++) {
      const x = cl.xs[i], tp = cl.top[i], w = cl.w[i];
      const inward = x < 640 ? 1 : -1;
      g.fillStyle = '#0b0e08';
      g.fillRect(x - w / 2, tp, w, 616 - tp);
      g.fillStyle = 'rgba(150,162,116,0.13)';
      g.fillRect(x - w / 2, tp, 1.4, 616 - tp);
      for (let ny = tp + 24; ny < 606; ny += 56) {
        g.fillStyle = 'rgba(126,138,96,0.22)';
        g.fillRect(x - w / 2, ny, w, 1.8);
      }
      g.fillStyle = '#0c0f09';
      blade(g, x, tp + 4, inward, 30 + i * 4);
      blade(g, x, tp + 14, inward * 0.7, 22);
    }
  }
  // 木人桩（台边）
  g.fillStyle = '#16130c';
  g.fillRect(83, 524, 16, 82);
  g.beginPath(); g.arc(91, 516, 9, 0, TAU); g.fill();
  g.strokeStyle = '#16130c';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(86, 542); g.quadraticCurveTo(70, 536, 58, 540); g.stroke();
  g.beginPath(); g.moveTo(96, 548); g.quadraticCurveTo(112, 554, 124, 550); g.stroke();
  g.strokeStyle = 'rgba(255,168,84,0.3)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(99, 528); g.lineTo(99, 602); g.stroke();
  g.beginPath(); g.arc(91, 516, 9, -0.9, 0.9); g.stroke();
  return c;
}

function buildGrain() {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const g = c.getContext('2d');
  const img = g.createImageData(96, 96);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 96 * 96; i++) {
    const j = i * 4;
    if (rnd() < 0.42) {
      const v = 170 + rnd() * 80;
      img.data[j] = v; img.data[j + 1] = v; img.data[j + 2] = v;
      img.data[j + 3] = rnd() * 60;
    } else {
      img.data[j + 3] = 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function drawArena(ctx, t, heat = 0) {
  seed();
  heat = Math.max(0, Math.min(1, heat || 0));
  if (!BACK) BACK = buildBack();
  if (!FRONT) FRONT = buildFront();
  ctx.drawImage(BACK, 0, 0);
  drawSkyDyn(ctx, t);
  drawMist(ctx, MIST1, t, heat);
  drawScroll(ctx, t);
  drawLanterns(ctx, t, heat);
  drawBanner(ctx, 66, ['武', '道'], t, 0);
  drawBanner(ctx, 1214, ['演', '武'], t, 1.7);
  drawCrowd(ctx, t, heat);
  drawMist(ctx, MIST2, t, heat * 0.6);
  ctx.drawImage(FRONT, 0, 0);
  drawStageLight(ctx, t, heat);
  drawBraziers(ctx, t, heat);
  drawEmbers(ctx, t, heat);
  if (!GRAIN) GRAIN = buildGrain();
  if (!GRAIN_P) GRAIN_P = ctx.createPattern(GRAIN, 'repeat');
  if (GRAIN_P) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = GRAIN_P;
    ctx.fillRect(0, 0, ARENA.W, ARENA.H);
    ctx.restore();
  }
  const vg = ctx.createRadialGradient(640, 360, 250, 640, 360, 790);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, ARENA.W, ARENA.H);
}

function drawSkyDyn(ctx, t) {
  const hg = ctx.createRadialGradient(168, 106, 36, 168, 106, 212);
  hg.addColorStop(0, 'rgba(242,232,200,0.17)');
  hg.addColorStop(0.3, 'rgba(242,232,200,0.055)');
  hg.addColorStop(1, 'rgba(242,232,200,0)');
  ctx.save();
  ctx.globalAlpha = 0.85 + Math.sin(t * 1.1) * 0.15;
  ctx.fillStyle = hg;
  ctx.fillRect(168 - 212, 106 - 212, 424, 424);
  ctx.restore();
  ctx.fillStyle = '#dde5f5';
  for (const s of TWINK) {
    ctx.globalAlpha = 0.28 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.4 + s.ph));
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 0.5, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMist(ctx, set, t, heat) {
  const { W } = ARENA;
  for (const m of set) {
    const span = W + m.rx * 4;
    let x = (m.x0 + t * m.sp) % span;
    if (x < 0) x += span;
    x -= m.rx * 2;
    const a = m.a + heat * 0.025;
    const g = ctx.createRadialGradient(x, m.y, 6, x, m.y, m.rx);
    g.addColorStop(0, `rgba(176,186,208,${a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(176,186,208,0)');
    ctx.save();
    ctx.translate(x, m.y);
    ctx.scale(1, m.ry / m.rx);
    ctx.translate(-x, -m.y);
    ctx.fillStyle = g;
    ctx.fillRect(x - m.rx, m.y - m.rx, m.rx * 2, m.rx * 2);
    ctx.restore();
  }
}

// 秘籍图谱：六式火柴小人 + 金色动作辅助线（盒内 100x90）
const POSES = {
  gale: { head: [64, 16, 7], fig: [[60, 26, 48, 50], [48, 50, 70, 82], [48, 50, 24, 74], [57, 32, 78, 38], [57, 32, 38, 22]], acc: 'dash' },
  jam: { head: [52, 20, 7], fig: [[52, 30, 52, 54], [52, 54, 34, 82], [52, 54, 70, 82], [52, 34, 76, 28], [52, 34, 62, 16]], acc: 'swirl' },
  upper: { head: [46, 24, 7], fig: [[48, 34, 54, 56], [54, 56, 40, 84], [54, 56, 70, 80], [51, 38, 70, 14], [51, 38, 36, 48]], acc: 'upper' },
  bulwark: { head: [56, 22, 7], fig: [[54, 32, 50, 56], [50, 56, 38, 84], [50, 56, 68, 84], [54, 36, 74, 42], [54, 44, 72, 36]], acc: 'shield' },
  siphon: { head: [50, 20, 7], fig: [[50, 30, 50, 54], [50, 54, 34, 82], [50, 54, 66, 82], [50, 34, 24, 42], [50, 34, 76, 42]], acc: 'pull' },
  shadow: { head: [72, 36, 7], fig: [[66, 46, 46, 58], [46, 58, 64, 84], [46, 58, 18, 78], [64, 50, 88, 54], [64, 50, 50, 40]], acc: 'streak' },
};

function arrowHead(ctx, x, y, dx, dy, s) {
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const ax = x - s * dx, ay = y - s * dy;
  const px = -dy, py = dx;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ax + px * s * 0.5, ay + py * s * 0.5);
  ctx.moveTo(x, y);
  ctx.lineTo(ax - px * s * 0.5, ay - py * s * 0.5);
  ctx.stroke();
}

function drawAcc(ctx, kind) {
  if (kind === 'dash') {
    ctx.strokeStyle = 'rgba(207,198,166,0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(6, 34); ctx.lineTo(26, 34);
    ctx.moveTo(2, 48); ctx.lineTo(22, 48);
    ctx.moveTo(8, 62); ctx.lineTo(24, 62);
    ctx.stroke();
  } else if (kind === 'swirl') {
    ctx.strokeStyle = 'rgba(207,163,92,0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(52, 7, 4, -0.5, 4.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(52, 7, 9.5, 0.7, 5.9); ctx.stroke();
  } else if (kind === 'upper') {
    ctx.strokeStyle = 'rgba(207,163,92,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(16, 78); ctx.quadraticCurveTo(28, 34, 64, 12); ctx.stroke();
    arrowHead(ctx, 64, 12, 36, -22, 8);
  } else if (kind === 'shield') {
    ctx.strokeStyle = 'rgba(207,163,92,0.85)';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(78, 46, 22, -1.15, 1.15); ctx.stroke();
  } else if (kind === 'pull') {
    ctx.strokeStyle = 'rgba(207,163,92,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(12, 70); ctx.quadraticCurveTo(26, 54, 42, 50); ctx.stroke();
    arrowHead(ctx, 42, 50, 16, -4, 7);
    ctx.beginPath(); ctx.moveTo(88, 70); ctx.quadraticCurveTo(74, 54, 58, 50); ctx.stroke();
    arrowHead(ctx, 58, 50, -16, -4, 7);
  } else if (kind === 'streak') {
    ctx.strokeStyle = 'rgba(207,198,166,0.5)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(6, 44); ctx.lineTo(32, 44); ctx.stroke();
    ctx.strokeStyle = 'rgba(207,198,166,0.32)';
    ctx.beginPath(); ctx.moveTo(58, 30); ctx.lineTo(42, 46); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawScroll(ctx, t) {
  const moves = Object.values(SKILLS);
  const period = 4.6;
  const idx = Math.floor(t / period) % moves.length;
  const ph = t % period;
  const flick = ph < 0.14 ? 0.55 : 1;
  ctx.save();
  ctx.translate(640, 8);
  ctx.rotate(Math.sin(t * 0.9) * 0.013);
  ctx.translate(-640, -8);
  // 吊绳与轴杆
  ctx.strokeStyle = '#241d12';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(568, -8); ctx.lineTo(566, 22); ctx.moveTo(712, -8); ctx.lineTo(714, 22); ctx.stroke();
  ctx.fillStyle = '#2c2416';
  ctx.fillRect(540, 18, 200, 10);
  ctx.fillStyle = '#8a7a4e';
  ctx.beginPath(); ctx.arc(542, 23, 6, 0, TAU); ctx.arc(738, 23, 6, 0, TAU); ctx.fill();
  ctx.fillRect(552, 254, 176, 7);
  // 拓片纸面（黑底金字）
  ctx.globalAlpha = flick;
  ctx.fillStyle = '#151109';
  ctx.fillRect(556, 28, 168, 230);
  ctx.fillStyle = 'rgba(214,196,150,0.05)';
  for (const fy of [64, 116, 176, 226]) ctx.fillRect(560, fy, 160, 1);
  ctx.strokeStyle = 'rgba(168,144,90,0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(559, 31, 162, 224);
  ctx.strokeStyle = 'rgba(168,144,90,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(565, 37, 150, 212);
  const m = moves[idx];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // 侧栏「武功秘籍」
  ctx.font = '11px "Noto Sans SC",sans-serif';
  ctx.fillStyle = 'rgba(203,184,119,0.5)';
  const side = '武功秘籍';
  for (let i = 0; i < 4; i++) ctx.fillText(side[i], 574, 96 + i * 21);
  // 招式名与类别
  ctx.font = '700 30px "Noto Sans SC",sans-serif';
  ctx.fillStyle = '#dccb92';
  ctx.shadowColor = 'rgba(201,164,92,0.85)';
  ctx.shadowBlur = 8;
  ctx.fillText(m.name, 648, 76);
  ctx.shadowBlur = 0;
  ctx.font = '12px "Noto Sans SC",sans-serif';
  ctx.fillStyle = 'rgba(160,148,110,0.9)';
  ctx.fillText(m.cls + ' · 招式图谱', 648, 98);
  // 图谱
  const pose = POSES[m.id] || POSES.gale;
  ctx.save();
  ctx.translate(600, 112);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawAcc(ctx, pose.acc);
  ctx.strokeStyle = '#cfc6a6';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(pose.head[0], pose.head[1], pose.head[2], 0, TAU); ctx.stroke();
  ctx.beginPath();
  for (const sg of pose.fig) { ctx.moveTo(sg[0], sg[1]); ctx.lineTo(sg[2], sg[3]); }
  ctx.stroke();
  ctx.restore();
  // 朱印
  ctx.save();
  ctx.translate(694, 236);
  ctx.rotate(-0.07);
  ctx.fillStyle = 'rgba(172,54,40,0.92)';
  ctx.fillRect(-11, -11, 22, 22);
  ctx.font = '700 13px "Noto Sans SC",sans-serif';
  ctx.fillStyle = '#f2e2c8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('秘', 0, 1);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function lanY(u) {
  const v = 1 - u;
  return v * v * 214 + 2 * v * u * 344 + u * u * 222;
}

function drawLantern(ctx, x, y, sway, ph, sc, heat) {
  const pulse = 0.92 + 0.08 * Math.sin(ph * 5);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 36);
  glow.addColorStop(0, `rgba(255,168,84,${((0.30 + heat * 0.08) * pulse).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(255,168,84,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-36, -36, 72, 72);
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(-4, -15, 8, 5);
  ctx.fillStyle = '#7c2f23';
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 13, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,190,120,0.22)';
  ctx.beginPath(); ctx.ellipse(-3, -2, 4, 8, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(48,16,10,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -13); ctx.lineTo(0, 13);
  ctx.moveTo(-7, -8); ctx.lineTo(-7, 8);
  ctx.moveTo(7, -8); ctx.lineTo(7, 8);
  ctx.stroke();
  ctx.strokeStyle = '#5a1f16';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(sway * 0.3, 24); ctx.stroke();
  ctx.fillStyle = '#5a1f16';
  ctx.beginPath(); ctx.arc(sway * 0.3, 26, 2.2, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawLanterns(ctx, t, heat) {
  const LTX = [0.07, 0.2, 0.33, 0.47, 0.61, 0.75, 0.9];
  ctx.strokeStyle = 'rgba(36,31,22,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    if (i === 0) ctx.moveTo(1280 * u, lanY(u));
    else ctx.lineTo(1280 * u, lanY(u));
  }
  ctx.stroke();
  for (let i = 0; i < LTX.length; i++) {
    const u = LTX[i];
    const sway = Math.sin(t * 1.5 + i * 1.3) * 5;
    drawLantern(ctx, 1280 * u + sway * 0.5, lanY(u) + 14, sway, t + i, 1, heat);
  }
  // 山门下一盏
  ctx.strokeStyle = 'rgba(36,31,22,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(1176, 420); ctx.lineTo(1176, 432); ctx.stroke();
  drawLantern(ctx, 1176 + Math.sin(t * 1.4 + 3) * 3, 444, 0, t + 5, 1.15, heat);
}

function drawBanner(ctx, ax, chars, t, ph) {
  ctx.save();
  ctx.translate(ax, -8);
  ctx.rotate(Math.sin(t * 1.05 + ph) * 0.04);
  ctx.fillStyle = '#2c2416';
  ctx.fillRect(-32, 0, 64, 7);
  ctx.beginPath();
  ctx.moveTo(-26, 7); ctx.lineTo(26, 7); ctx.lineTo(26, 320); ctx.lineTo(0, 300); ctx.lineTo(-26, 320);
  ctx.closePath();
  ctx.fillStyle = '#16130c';
  ctx.fill();
  ctx.strokeStyle = 'rgba(168,144,90,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 34px "Noto Sans SC",sans-serif';
  for (let i = 0; i < 2; i++) {
    const by = 140 + i * 72;
    ctx.fillStyle = 'rgba(203,184,119,0.55)';
    ctx.fillText(chars[i], 1, by + 1);
    ctx.fillStyle = '#cbb877';
    ctx.fillText(chars[i], 0, by);
  }
  ctx.strokeStyle = '#8a6a3c';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 320); ctx.lineTo(0, 352); ctx.stroke();
  ctx.fillStyle = '#a8905a';
  ctx.beginPath(); ctx.arc(0, 355, 3, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawFigure(ctx, c, t, heat, col) {
  const { GROUND } = ARENA;
  const gy = GROUND - 46 + c.row * 8;
  const amp = 1.5 + heat * 5;
  const bob = Math.sin(t * (2.2 + heat * 4) + c.ph) * amp * (c.row ? 1 : 0.8);
  const y0 = gy - bob;
  const hipY = y0 - c.h * 0.48, shY = y0 - c.h * 0.8, headR = c.h * 0.13;
  const armUp = heat > 0.3 || Math.sin(t * 5 + c.ph * 3) > 0.75;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c.x - 7, y0); ctx.lineTo(c.x, hipY);
  ctx.moveTo(c.x + 7, y0); ctx.lineTo(c.x, hipY);
  ctx.moveTo(c.x, hipY); ctx.lineTo(c.x, shY);
  ctx.moveTo(c.x, shY + 3); ctx.lineTo(c.x + (armUp ? 9 : 13), armUp ? shY - 15 : shY + 4);
  ctx.moveTo(c.x, shY + 3); ctx.lineTo(c.x - 10, armUp ? shY - 14 : shY + 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c.x, shY - headR - 1, headR, 0, TAU);
  ctx.fill();
  if (!c.torch) return;
  const px = c.x + (armUp ? 9 : 13);
  const py = armUp ? shY - 15 : shY + 4;
  const tx = px + 1, ty = py - 13;
  // 火把杆与火苗
  ctx.strokeStyle = 'rgba(26,20,12,0.95)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(px, py + 2); ctx.lineTo(tx, ty + 3); ctx.stroke();
  const fl = Math.sin(t * 16 + c.ph * 7) * 1.5;
  ctx.fillStyle = 'rgba(255,140,60,0.6)';
  ctx.beginPath(); ctx.ellipse(tx + fl * 0.4, ty - 2, 4, 7 + fl, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,228,158,0.9)';
  ctx.beginPath(); ctx.ellipse(tx + fl * 0.3, ty - 1, 2.2, 4 + fl * 0.6, 0, 0, TAU); ctx.fill();
  const gg = ctx.createRadialGradient(tx, ty - 2, 2, tx, ty - 2, 30);
  gg.addColorStop(0, `rgba(255,168,84,${(0.20 + heat * 0.1).toFixed(3)})`);
  gg.addColorStop(1, 'rgba(255,168,84,0)');
  ctx.fillStyle = gg;
  ctx.fillRect(tx - 30, ty - 32, 60, 60);
  // 溅火星（偶发爆亮）
  const win = 0.10 + heat * 0.16;
  const ph2 = (t * (0.55 + heat * 1.1) + c.fl) % 5;
  if (ph2 < win) {
    const fa = 1 - ph2 / win;
    const fg = ctx.createRadialGradient(tx, ty - 2, 0, tx, ty - 2, 40);
    fg.addColorStop(0, `rgba(255,236,190,${(0.75 * fa).toFixed(3)})`);
    fg.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(tx - 40, ty - 42, 80, 80);
  }
}

function drawCrowd(ctx, t, heat) {
  const { W, GROUND } = ARENA;
  // 人潮背后的暖光带（把剪影托出来）
  const band = ctx.createLinearGradient(0, GROUND - 110, 0, GROUND - 30);
  band.addColorStop(0, 'rgba(255,172,92,0)');
  band.addColorStop(0.62, `rgba(255,172,92,${(0.13 + heat * 0.06).toFixed(3)})`);
  band.addColorStop(1, 'rgba(255,172,92,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, GROUND - 110, W, 80);
  for (const c of CROWDB) drawFigure(ctx, c, t, heat, 'rgba(26,29,39,0.88)');
  for (const c of CROWDF) drawFigure(ctx, c, t, heat, 'rgba(6,7,11,0.98)');
}

function drawStageLight(ctx, t, heat) {
  const { GROUND } = ARENA;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 台心光池
  const pool = ctx.createRadialGradient(640, GROUND + 14, 30, 640, GROUND + 14, 320);
  pool.addColorStop(0, `rgba(255,208,150,${(0.10 + heat * 0.05).toFixed(3)})`);
  pool.addColorStop(1, 'rgba(255,208,150,0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(640, GROUND + 14, 320, 56, 0, 0, TAU);
  ctx.fill();
  // 积水映灯
  const PUD = [[380, 118, '255,184,92'], [950, 142, '159,184,216']];
  for (const pd of PUD) {
    const wig = Math.sin(t * 1.3 + pd[0]) * 5;
    const pg = ctx.createRadialGradient(pd[0] + wig, GROUND + 52, 4, pd[0] + wig, GROUND + 52, pd[1]);
    pg.addColorStop(0, `rgba(${pd[2]},0.20)`);
    pg.addColorStop(1, `rgba(${pd[2]},0)`);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.ellipse(pd[0] + wig, GROUND + 52, pd[1], 15, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function flame(ctx, bx, by, h, w, a, cc, t) {
  const tipx = bx + Math.sin(t * 13) * 4;
  ctx.fillStyle = `rgba(${cc},${a})`;
  ctx.beginPath();
  ctx.moveTo(bx - w, by);
  ctx.quadraticCurveTo(bx - w * 0.7, by - h * 0.55, tipx, by - h);
  ctx.quadraticCurveTo(bx + w * 0.7, by - h * 0.55, bx + w, by);
  ctx.closePath();
  ctx.fill();
}

function drawBraziers(ctx, t, heat) {
  for (const bx of [170, 1110]) {
    const fl = Math.sin(t * 17 + bx) * 0.5 + Math.sin(t * 29 + bx * 1.7) * 0.5;
    const h = 30 + fl * 5 + heat * 12;
    const glow = ctx.createRadialGradient(bx, 566, 8, bx, 566, 100);
    glow.addColorStop(0, `rgba(255,150,60,${(0.17 + heat * 0.1).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(bx - 100, 466, 200, 200);
    ctx.fillStyle = '#1b1c22';
    ctx.beginPath();
    ctx.moveTo(bx - 27, 564); ctx.lineTo(bx + 27, 564);
    ctx.lineTo(bx + 15, 586); ctx.lineTo(bx - 15, 586);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#282a33';
    ctx.beginPath(); ctx.ellipse(bx, 564, 27, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#14151b';
    ctx.fillRect(bx - 5, 586, 10, 20);
    ctx.beginPath(); ctx.ellipse(bx, 606, 16, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,118,48,0.85)';
    ctx.beginPath(); ctx.ellipse(bx, 562, 19, 4.5, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    flame(ctx, bx, 564, h, 10, 0.30, '255,130,50', t);
    flame(ctx, bx, 564, h * 0.62, 6.5, 0.5, '255,190,90', t + 1);
    flame(ctx, bx, 564, h * 0.34, 3.6, 0.85, '255,242,186', t + 2);
    ctx.restore();
  }
}

function drawEmbers(ctx, t, heat) {
  const n = Math.round(10 + heat * 8);
  for (let i = 0; i < n && i < EMBERS.length; i++) {
    const e = EMBERS[i];
    const cyc = ((t * e.sp) / 540 + e.ph) % 1;
    const y = 596 - cyc * 540;
    const x = e.x0 + Math.sin(t * 1.2 + e.ph * 9) * e.sw;
    const a = Math.sin(cyc * Math.PI) * (0.55 + heat * 0.35);
    if (a <= 0.02) continue;
    ctx.fillStyle = `rgba(255,196,110,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, e.r, 0, TAU); ctx.fill();
  }
}
