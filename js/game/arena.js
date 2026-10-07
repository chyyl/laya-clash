import { ARENA } from './constants.js';

// 程序化霓虹竞技场：天空/城市/围观人潮/弹幕大屏/铁丝网/街头地面/顶光
// 艺术取材：生活（街巷约战、围观举手机拍照的路人）与网络（弹幕大屏、热梗轮播）
const WINDOWS = [];
const CROWD = [];
const CRACKS = [];
const PUDDLES = [];
let seeded = false;

// 大屏轮播文案（网络热梗，克制选取）
const NET_LINES = ['666', '打得好!', '关注了 +1', '前方高能', '双击666', '点个赞再走', '这波在大气层', '已三连', '主播威武'];
const TAU = Math.PI * 2;

function seed() {
  if (seeded) return;
  seeded = true;
  let s = 42;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let b = 0; b < 14; b++) {
    const x = 40 + b * 95 + rnd() * 30;
    const w = 52 + rnd() * 46;
    const h = 130 + rnd() * 200;
    const wins = [];
    for (let i = 0; i < 14; i++) wins.push(rnd() < 0.42 ? (rnd() < 0.25 ? '#ff4fd8' : '#3df2ff') : null);
    WINDOWS.push({ x, w, h, wins });
  }
  // 围观人潮：两排剪影，多数举着手机（生活：围观必拍摄）
  for (let i = 0; i < 32; i++) {
    const row = i % 2;
    const x = 10 + ((i / 2) | 0) * 82 + rnd() * 40 + row * 34;
    const h = (row ? 52 : 44) + rnd() * 12;
    CROWD.push({ x, h, row, ph: rnd() * TAU, phone: rnd() < 0.65, fl: rnd() * 7 });
  }
  // 地面裂缝与积水
  for (let i = 0; i < 6; i++) {
    const x0 = 80 + rnd() * 1120;
    const y0 = ARENA.GROUND + 18 + rnd() * 70;
    const pts = [[x0, y0]];
    let x = x0, y = y0;
    for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 90; y += 8 + rnd() * 14; pts.push([x, y]); }
    CRACKS.push(pts);
  }
  PUDDLES.push({ x: 290, rx: 130, ry: 15, c: '#3df2ff' });
  PUDDLES.push({ x: 940, rx: 150, ry: 17, c: '#ff4fd8' });
}

export function drawArena(ctx, t, heat = 0) {
  seed();
  const { W, H, GROUND } = ARENA;

  // 天空
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#0a0d1d');
  sky.addColorStop(0.55, '#141233');
  sky.addColorStop(1, '#26143a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND);

  // 月晕
  const mg = ctx.createRadialGradient(1030, 130, 10, 1030, 130, 190);
  mg.addColorStop(0, 'rgba(255,210,63,0.5)');
  mg.addColorStop(0.25, 'rgba(255,210,63,0.13)');
  mg.addColorStop(1, 'transparent');
  ctx.fillStyle = mg;
  ctx.fillRect(830, -60, 400, 400);
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath(); ctx.arc(1030, 130, 34, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(20,18,51,0.85)';
  ctx.beginPath(); ctx.arc(1016, 120, 30, 0, TAU); ctx.fill();

  // 城市剪影
  for (const b of WINDOWS) {
    ctx.fillStyle = '#0b0e1e';
    ctx.fillRect(b.x, GROUND - 60 - b.h, b.w, b.h + 60);
    let wi = 0;
    for (let ry = GROUND - 74 - b.h; ry < GROUND - 76; ry += 22) {
      for (let rx = b.x + 7; rx < b.x + b.w - 8; rx += 15) {
        const c = b.wins[wi++ % b.wins.length];
        if (!c) continue;
        const flick = Math.sin(t * 3 + wi * 1.7) > -0.92 ? 1 : 0.2;
        ctx.globalAlpha = 0.55 * flick;
        ctx.fillStyle = c;
        ctx.fillRect(rx, ry, 7, 10);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 霓虹招牌
  drawNeonSign(ctx, 150, 250, '斗技场', '#ff4fd8', t, 0.5);
  drawNeonSign(ctx, 1090, 330, 'CLASH', '#3df2ff', t, 1.3);

  // 弹幕大屏：吊装在场地上空，轮播网络热梗（每次进场都是新的应援）
  drawBillboard(ctx, 640, 150, t);

  // 路灯暖光带：把人潮从楼群剪影里托出来
  const lamp = ctx.createLinearGradient(0, GROUND - 96, 0, GROUND - 30);
  lamp.addColorStop(0, 'rgba(255,190,90,0)');
  lamp.addColorStop(1, `rgba(255,190,90,${0.05 + heat * 0.05})`);
  ctx.fillStyle = lamp;
  ctx.fillRect(0, GROUND - 96, W, 66);

  // 围观人潮（画在铁丝网之前：人在网后）
  drawCrowd(ctx, t, heat);

  // 铁丝网
  ctx.save();
  ctx.strokeStyle = 'rgba(120,150,220,0.14)';
  ctx.lineWidth = 1.5;
  const fy = GROUND - 40, fh = 330;
  for (let x = -fh; x < W + fh; x += 34) {
    ctx.beginPath(); ctx.moveTo(x, fy - fh); ctx.lineTo(x + fh, fy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x + fh, fy - fh); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(10,13,26,0.35)';
  ctx.fillRect(0, fy - fh, W, fh);
  // 网柱
  ctx.fillStyle = '#181d33';
  for (let x = 60; x < W; x += 240) ctx.fillRect(x - 5, fy - fh, 10, fh + 40);
  ctx.restore();

  // 地面
  const gnd = ctx.createLinearGradient(0, GROUND, 0, H);
  gnd.addColorStop(0, '#171c30');
  gnd.addColorStop(0.25, '#0e1220');
  gnd.addColorStop(1, '#07090f');
  ctx.fillStyle = gnd;
  ctx.fillRect(0, GROUND, W, H - GROUND);

  // 街头细节：粉笔画圈（约战的场地感）+ 裂缝 + 霓虹积水
  drawGroundDetails(ctx, t);

  // 地面透视网格
  ctx.strokeStyle = 'rgba(61,242,255,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const y = GROUND + 8 + Math.pow(i / 8, 1.7) * (H - GROUND - 8);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let x = 0; x <= W; x += 96) {
    ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo((x - 640) * 1.35 + 640, H); ctx.stroke();
  }

  // 场地边线（霓虹）
  ctx.strokeStyle = 'rgba(61,242,255,0.85)';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#3df2ff'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.moveTo(0, GROUND + 1); ctx.lineTo(W, GROUND + 1); ctx.stroke();
  ctx.shadowBlur = 0;

  // 两侧墙体
  for (const wx of [0, W - 26]) {
    const wg = ctx.createLinearGradient(wx, 0, wx + 26, 0);
    wg.addColorStop(0, 'rgba(255,60,95,0.32)');
    wg.addColorStop(1, 'transparent');
    ctx.fillStyle = wg;
    ctx.fillRect(wx, 120, 26, GROUND - 120 + 40);
  }

  // 顶部扫光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [ax, ph] of [[300, 0], [980, 2.1]]) {
    const sway = Math.sin(t * 0.7 + ph) * 140;
    const lg = ctx.createLinearGradient(ax, 0, ax + sway, GROUND);
    lg.addColorStop(0, 'rgba(255,255,255,0.10)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(ax - 26, 0); ctx.lineTo(ax + 26, 0);
    ctx.lineTo(ax + sway + 190, GROUND); ctx.lineTo(ax + sway - 190, GROUND);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // 暗角
  const vg = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 760);
  vg.addColorStop(0, 'transparent');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// ---- 围观人潮：剪影 + 举手机 + 随机拍照闪光；heat 高时欢呼躁动 ----
function drawCrowd(ctx, t, heat) {
  const { GROUND } = ARENA;
  for (const c of CROWD) {
    const gy = GROUND - 46 + c.row * 8;
    const amp = 1.5 + heat * 5;
    const bob = Math.sin(t * (2.2 + heat * 4) + c.ph) * amp * (c.row ? 1 : 0.8);
    const y0 = gy - bob;
    const hipY = y0 - c.h * 0.48;
    const shY = y0 - c.h * 0.8;
    const headR = c.h * 0.13;

    ctx.strokeStyle = 'rgba(26,33,56,0.96)';
    ctx.fillStyle = 'rgba(26,33,56,0.96)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    const armUp = heat > 0.3 || Math.sin(t * 5 + c.ph * 3) > 0.75;
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

    if (c.phone) {
      const px = c.x + (armUp ? 9 : 14);
      const py = armUp ? shY - 17 : shY + 2;
      // 手机屏光
      ctx.fillStyle = 'rgba(159,216,255,0.95)';
      ctx.fillRect(px - 2, py - 6, 4, 6);
      // 拍照闪光（围观必拍摄）
      const win = 0.10 + heat * 0.16;
      const ph = (t * (0.55 + heat * 1.1) + c.fl) % 5;
      if (ph < win) {
        const fa = 1 - ph / win;
        const g = ctx.createRadialGradient(px, py, 0, px, py, 24);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * fa})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - 24, py - 24, 48, 48);
      }
    }
  }
}

// ---- 弹幕大屏：吊装 jumbotron，网络热梗轮播 ----
function drawBillboard(ctx, x, y, t) {
  const idx = Math.floor(t / 3.6) % NET_LINES.length;
  const flip = t % 3.6;
  const flick = flip < 0.12 ? 0.45 : 1;
  ctx.save();
  // 吊索
  ctx.strokeStyle = '#141a2e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 78, y - 34); ctx.lineTo(x - 170, -10);
  ctx.moveTo(x + 78, y - 34); ctx.lineTo(x + 170, -10);
  ctx.stroke();
  ctx.globalAlpha = flick;
  // 屏体
  ctx.fillStyle = 'rgba(6,8,16,0.93)';
  ctx.strokeStyle = 'rgba(255,210,63,0.8)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 16;
  ctx.fillRect(x - 108, y - 34, 216, 68);
  ctx.strokeRect(x - 108, y - 34, 216, 68);
  ctx.shadowBlur = 0;
  // 扫描线
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let ly = y - 32; ly < y + 34; ly += 4) ctx.fillRect(x - 106, ly, 212, 1);
  // 轮播文案
  ctx.font = '700 27px "Noto Sans SC",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd23f';
  ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 14;
  ctx.fillText(NET_LINES[idx], x, y + 1);
  ctx.restore();
}

// ---- 街头地面：粉笔圈、裂缝、霓虹积水 ----
function drawGroundDetails(ctx, t) {
  const { W, GROUND, H } = ARENA;
  // 粉笔画圈：街头约战的场地线
  ctx.save();
  ctx.setLineDash([30, 20]);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(W / 2, GROUND + 56, 480, 44, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // 裂缝
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (const pts of CRACKS) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  // 积水反光：霓虹倒影随时间轻晃
  for (const p of PUDDLES) {
    const wig = Math.sin(t * 1.3 + p.x) * 4;
    const g = ctx.createRadialGradient(p.x + wig, GROUND + 52, 4, p.x + wig, GROUND + 52, p.rx);
    g.addColorStop(0, p.c + '26');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x + wig, GROUND + 52, p.rx, p.ry, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawNeonSign(ctx, x, y, text, color, t, ph) {
  const flick = Math.sin(t * 9 + ph * 7) > -0.96 ? 1 : 0.35;
  ctx.save();
  ctx.globalAlpha = 0.85 * flick;
  ctx.font = '700 30px "Noto Sans SC",sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = color; ctx.shadowBlur = 22;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);
  ctx.restore();
}
