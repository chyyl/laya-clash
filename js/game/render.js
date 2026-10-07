import { ARENA } from './constants.js';

// 程序化火柴人：按状态生成关节位姿，两段式肢体（肩→肘→手 / 髋→膝→脚）
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function limb(ctx, ax, ay, bx, by, bend, w) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bend;
  const cy = my + (dx / len) * bend;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(cx, cy, bx, by);
  ctx.stroke();
}

// 生成局部坐标位姿（脚底中心为原点，y 向上为负）
function pose(f, t) {
  const st = f.state;
  const p = { hip: [0, -54], chest: [0, -84], head: [0, -100], headR: 11,
    handF: [24, -68], handB: [4, -76], elbowF: [16, -74], elbowB: [-2, -70],
    footF: [20, 0], footB: [-18, 0], kneeF: [14, -26], kneeB: [-12, -26],
    rot: 0, tone: 1 };

  const breathe = Math.sin(t * 2.4) * 2;
  const moving = Math.abs(f.vx) > 30 && st === 'idle';
  const cycle = moving ? t * 11 : 0;

  if (st === 'idle') {
    p.hip[1] += breathe * 0.5;
    p.chest[1] += breathe;
    p.head[1] += breathe * 1.2;
    if (moving) {
      p.footF[0] += Math.sin(cycle) * 16; p.footF[1] = -Math.max(0, Math.sin(cycle)) * 12;
      p.footB[0] += Math.sin(cycle + Math.PI) * 16; p.footB[1] = -Math.max(0, Math.sin(cycle + Math.PI)) * 12;
      p.kneeF[0] = p.footF[0] * 0.5 + 6; p.kneeB[0] = p.footB[0] * 0.5 - 4;
      p.handF[0] += Math.sin(cycle + Math.PI) * 6;
      p.handB[0] += Math.sin(cycle) * 6;
    }
  } else if (st === 'block') {
    p.hip[1] += 6; p.chest[1] += 8; p.head[1] += 8;
    p.handF = [20, -78]; p.elbowF = [16, -66];
    p.handB = [24, -66]; p.elbowB = [10, -60];
    p.footF = [24, 0]; p.footB = [-22, 0];
  } else if (st === 'attack') {
    const a = f.attack;
    const d = a.data;
    let ext = 0;
    if (a.phase === 'windup') ext = -clamp01(a.t / d.windup) * 0.45;
    else if (a.phase === 'active') ext = clamp01((a.t - d.windup) / Math.max(0.01, d.active * 0.5));
    else ext = 1 - clamp01((a.t - d.windup - d.active) / Math.max(0.01, d.rec));
    const heavy = d.heavy;
    const reach = (heavy ? 74 : 62) * Math.max(0, ext);
    const y = heavy ? -74 : -66;
    if (heavy) {
      // 大摆拳：从后上方抡出去
      p.handF = [lerp(-30, reach, clamp01(ext + 0.45)), y - lerp(24, 0, clamp01(ext + 0.3))];
      p.elbowF = [lerp(-24, reach * 0.55, clamp01(ext + 0.45)), y - 22];
      p.chest[0] = lerp(-8, 8, clamp01(ext + 0.3));
      p.hip[0] = lerp(-6, 6, clamp01(ext + 0.3));
      if (a.phase === 'active') { p.hip[1] += 4; p.chest[1] += 4; }
    } else {
      p.handF = [lerp(6, reach + 14, clamp01(ext + 0.4)), y];
      p.elbowF = [lerp(10, (reach + 14) * 0.55, clamp01(ext + 0.4)), y - 4];
      p.chest[0] = lerp(-4, 6, clamp01(ext + 0.3));
      p.handB = [0, -78];
    }
    p.footF[0] += ext * 8; p.footB[0] -= ext * 4;
  } else if (st === 'dash') {
    p.hip[0] += 8; p.chest[0] += 14; p.head[0] += 18;
    p.chest[1] += 6; p.head[1] += 8;
    p.handF = [34, -60]; p.elbowF = [22, -66];
    p.handB = [-24, -84]; p.elbowB = [-14, -78];
    p.footF = [34, 0]; p.footB = [-30, -6];
    p.kneeF = [24, -24]; p.kneeB = [-20, -30];
    p.rot = 0.12;
  } else if (st === 'hitstun' || st === 'stagger') {
    const k = st === 'stagger' ? Math.sin(t * 26) * 0.14 : 0;
    p.rot = -0.16 + k;
    p.chest[0] -= 8; p.head[0] -= 12;
    p.handF = [-6, -92]; p.elbowF = [4, -86];
    p.handB = [-22, -76]; p.elbowB = [-14, -70];
    p.footF = [26, 0]; p.footB = [-24, -4];
    p.tone = st === 'stagger' ? 0.7 : 1;
  } else if (st === 'down') {
    p.rot = -1.42 * clamp01(f.t / 0.14);
    p.hip[1] = -18; p.chest = [-30, -18]; p.head = [-46, -14];
    p.handF = [-56, -26]; p.elbowF = [-46, -26];
    p.handB = [-52, -8]; p.elbowB = [-42, -10];
    p.footF = [22, -4]; p.footB = [30, -10];
    p.kneeF = [16, -14]; p.kneeB = [24, -16];
  } else if (st === 'getup') {
    const k = clamp01(f.t / 0.35);
    p.rot = lerp(-1.2, 0, k);
    p.hip[1] = lerp(-20, -50, k);
    p.chest = [lerp(-24, 0, k), lerp(-24, -82, k)];
    p.head = [lerp(-34, 0, k), lerp(-22, -100, k)];
    p.handF = [lerp(-40, 22, k), lerp(-30, -70, k)];
    p.elbowF = [lerp(-30, 14, k), lerp(-30, -76, k)];
    p.handB = [lerp(-36, 4, k), lerp(-14, -76, k)];
    p.elbowB = [lerp(-26, -2, k), lerp(-16, -70, k)];
  } else if (st === 'dead') {
    const k = clamp01(f.t / 0.3);
    p.rot = -1.5 * k;
    p.hip[1] = lerp(-54, -14, k);
    p.chest = [lerp(0, -34, k), lerp(-84, -14, k)];
    p.head = [lerp(0, -54, k), lerp(-100, -10, k)];
    p.handF = [lerp(24, -66, k), lerp(-68, -24, k)];
    p.elbowF = [lerp(16, -52, k), lerp(-74, -22, k)];
    p.handB = [lerp(4, -60, k), lerp(-76, -6, k)];
    p.elbowB = [-2, -60];
    p.footF = [24, -4]; p.footB = [32, -8];
    p.kneeF = [18, -14]; p.kneeB = [26, -16];
  }
  return p;
}

export function drawFighter(ctx, f, t, fx) {
  const { GROUND } = ARENA;
  const p = pose(f, t);
  const dir = f.facing;
  const hitWhite = (f.state === 'hitstun' && f.t < 0.1) || (f.state === 'dead' && f.t < 0.15);
  const baseColor = hitWhite ? '#ffffff' : f.color;

  ctx.save();
  ctx.translate(f.x, GROUND);

  // 影子
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 4, f.state === 'down' || f.state === 'dead' ? 52 : 34, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.scale(dir, 1);       // 局部 +x 永远朝向对手
  if (p.rot) {
    ctx.translate(0, -40);
    ctx.rotate(p.rot);
    ctx.translate(0, 40);
  }

  // 疾风光环
  if (f.galeT > 0) {
    ctx.save();
    const pulse = 0.6 + Math.sin(t * 22) * 0.4;
    ctx.strokeStyle = `rgba(255,210,63,${0.5 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 22;
    for (let i = 0; i < 3; i++) {
      const r = 44 + i * 13 + Math.sin(t * 9 + i) * 5;
      ctx.beginPath();
      ctx.arc(0, -56, r, -0.6 + Math.sin(t * 6 + i) * 0.3, 2.2 + Math.cos(t * 5 + i) * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 干扰沉默标记
  if (f.silenceT > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,79,216,0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 12;
    const r = 16 + Math.sin(t * 18) * 4;
    ctx.beginPath(); ctx.arc(0, -118, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.6, -118 + r * 0.6); ctx.lineTo(r * 0.6, -118 - r * 0.6); ctx.stroke();
    ctx.restore();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = baseColor;
  ctx.shadowColor = f.color; ctx.shadowBlur = 12;

  // 腿
  limb(ctx, p.hip[0], p.hip[1], p.kneeB[0], p.kneeB[1], -8, 7);
  limb(ctx, p.kneeB[0], p.kneeB[1], p.footB[0], p.footB[1], -7, 7);
  // 后臂
  limb(ctx, p.chest[0], p.chest[1] + 4, p.elbowB[0], p.elbowB[1], -9, 6);
  limb(ctx, p.elbowB[0], p.elbowB[1], p.handB[0], p.handB[1], -8, 6);
  // 躯干
  limb(ctx, p.hip[0], p.hip[1], p.chest[0], p.chest[1], 0, 8);
  // 头
  ctx.beginPath();
  ctx.arc(p.head[0], p.head[1], p.headR, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0e18';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.stroke();
  // 眼（朝向对手的方向）
  ctx.shadowBlur = 0;
  ctx.fillStyle = baseColor;
  ctx.fillRect(p.head[0] + 2, p.head[1] - 3, 6, 3);
  // 前腿
  ctx.strokeStyle = baseColor;
  ctx.shadowColor = f.color; ctx.shadowBlur = 12;
  limb(ctx, p.hip[0], p.hip[1], p.kneeF[0], p.kneeF[1], 8, 7);
  limb(ctx, p.kneeF[0], p.kneeF[1], p.footF[0], p.footF[1], 7, 7);
  // 前臂（攻击手）
  limb(ctx, p.chest[0], p.chest[1] + 4, p.elbowF[0], p.elbowF[1], 9, 6);
  limb(ctx, p.elbowF[0], p.elbowF[1], p.handF[0], p.handF[1], 8, 6);
  // 拳套高光
  ctx.beginPath();
  ctx.arc(p.handF[0], p.handF[1], 5.5, 0, Math.PI * 2);
  ctx.fillStyle = f.galeT > 0 ? '#ffd23f' : '#fff';
  ctx.shadowColor = f.galeT > 0 ? '#ffd23f' : f.color;
  ctx.shadowBlur = 14;
  ctx.fill();

  // 格挡护盾
  if (f.state === 'block') {
    ctx.shadowBlur = 0;
    const a = f.parryT > 0 ? 0.95 : 0.5;
    ctx.strokeStyle = f.parryT > 0 ? `rgba(255,255,255,${a})` : `rgba(138,107,255,${a})`;
    ctx.lineWidth = f.parryT > 0 ? 5 : 3;
    ctx.beginPath();
    ctx.arc(16, -62, 40, -1.5, 1.5);
    ctx.stroke();
    if (f.parryT > 0) {
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 16;
      ctx.stroke();
    }
  }

  ctx.restore();

  // 冲刺残影（在 ghost 事件里补）
  if (f.state === 'dash') {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 3;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(f.x - dir * i * 18, GROUND - 56, 26 - i * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
