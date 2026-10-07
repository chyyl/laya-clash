import { ARENA } from './constants.js';

// 程序化霓虹竞技场背景：天空/城市剪影/铁丝网/地面/顶光
const WINDOWS = [];
let seeded = false;

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
}

export function drawArena(ctx, t) {
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
  ctx.beginPath(); ctx.arc(1030, 130, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(20,18,51,0.85)';
  ctx.beginPath(); ctx.arc(1016, 120, 30, 0, Math.PI * 2); ctx.fill();

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
