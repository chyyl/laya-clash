// 视觉反馈层：粒子、飘字、冲击环、屏幕震动、命中顿帧
export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.shake = 0;
    this.hitstop = 0;
    this.quality = 'high';
  }

  get dense() { return this.quality === 'high'; }

  addShake(v) { if (this.noShake) return; this.shake = Math.min(18, this.shake + v); }
  addHitstop(v) { this.hitstop = Math.max(this.hitstop, v); }

  spark(x, y, dir, color, n = 8, speed = 380) {
    if (!this.dense) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = (dir || 0) + (Math.random() - 0.5) * 1.7;
      const s = speed * (0.45 + Math.random() * 0.75);
      this.parts.push({
        kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: 0.22 + Math.random() * 0.2, max: 0.42, size: 2 + Math.random() * 3, color, grav: 700,
      });
    }
    // 中心亮斑
    this.parts.push({ kind: 'flash', x, y, vx: 0, vy: 0, life: 0.1, max: 0.1, size: 16, color, grav: 0 });
  }

  dust(x, y, n = 5) {
    if (!this.dense) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      this.parts.push({
        kind: 'dust', x: x + (Math.random() - 0.5) * 30, y,
        vx: (Math.random() - 0.5) * 130, vy: -30 - Math.random() * 70,
        life: 0.4 + Math.random() * 0.3, max: 0.7, size: 6 + Math.random() * 8,
        color: 'rgba(150,170,220,0.5)', grav: 120,
      });
    }
  }

  trail(x, y, color) {
    this.parts.push({ kind: 'ghost', x, y, vx: 0, vy: 0, life: 0.22, max: 0.22, size: 22, color, grav: 0 });
  }

  text(x, y, str, color = '#ffd23f', size = 26) {
    this.texts.push({ x, y, str, color, size, life: 0.8, max: 0.8, vy: -70 });
  }

  ring(x, y, maxR, color, life = 0.35) {
    this.rings.push({ x, y, r: 14, maxR, color, life, max: life });
  }

  update(dt) {
    if (this.hitstop > 0) this.hitstop -= dt;
    this.shake = Math.max(0, this.shake - dt * 42);

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= (1 - 2.4 * dt);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y += t.vy * dt; t.vy *= (1 - 2.2 * dt);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      r.r += (r.maxR - r.r) * Math.min(1, 12 * dt);
    }
  }

  shakeOffset() {
    if (this.noShake || this.shake <= 0.05) return [0, 0];
    const s = this.shake;
    return [(Math.random() - 0.5) * s, (Math.random() - 0.5) * s];
  }

  render(ctx) {
    for (const r of this.rings) {
      const a = r.life / r.max;
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 + 5 * a;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const p of this.parts) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;   // 防御：坏粒子直接跳过
      const a = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.globalAlpha = a;
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.kind === 'flash') {
        const rad = p.size * (1.4 - a * 0.6);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        g.addColorStop(0, '#fff'); g.addColorStop(0.4, p.color); g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'ghost') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.globalAlpha = a * 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y - 40, p.size, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    for (const t of this.texts) {
      const a = Math.min(1, t.life / t.max * 2);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `700 ${t.size}px "Chakra Petch","Noto Sans SC",sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(4,6,11,0.9)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
  }

  clear() { this.parts.length = 0; this.texts.length = 0; this.rings.length = 0; this.shake = 0; this.hitstop = 0; }
}
