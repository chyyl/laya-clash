import { BASE, ARENA } from './constants.js';
import { Fighter } from './fighter.js';
import { AIBrain } from './ai.js';
import { FX } from './fx.js';
import { drawArena } from './arena.js';
import { drawFighter } from './render.js';
import { derive } from '../data/talents.js';
import { SKILLS, normalizeLoadout } from '../data/skills.js';
import { AudioFX } from '../core/audio.js';

// 单场对战编排：阶段机（intro/fight/ko/over）、事件消费、胜负结算
export class Battle {
  constructor({ ctx, onFinish }) {
    this.ctx = ctx;
    this.onFinish = onFinish;
    this.fx = new FX();
    this.ann = null;
    this.clock = 0;
    this.player = null;
  }

  // 每局开打前调用（也用于再战重开）
  reset({ playerBuild, playerSkills, aiName, aiBuild, diffParams, diff }) {
    this.playerBuild = playerBuild;
    this.aiName = aiName;
    this.aiBuildData = aiBuild;
    this.diff = diff;
    this.diffParams = diffParams;

    const pMods = derive(playerBuild);
    const fMods = derive(aiBuild.build);
    pMods.skills = normalizeLoadout(playerSkills);       // 玩家装配（天赋页保存）
    fMods.skills = normalizeLoadout(aiBuild.skills);     // AI 按预设流派配技能
    this.player = new Fighter({ name: '挑战者', color: '#3df2ff', mods: pMods, isPlayer: true });
    this.foe = new Fighter({ name: aiName, color: '#ff3c5f', mods: fMods, isPlayer: false });
    this.ai = new AIBrain(this.foe, this.player, diffParams.ai);
    this.fx.clear();
    this.fx.quality = this.fxQuality || 'high';

    this.player.reset(ARENA.W / 2 - 170, 1);
    this.foe.reset(ARENA.W / 2 + 170, -1);

    this.phase = 'intro';
    this.pt = 0;
    this.matchT = 0;
    this.scale = 1;
    this.combo = { n: 0, t: 0, peak: 0 };
    this.dmgDealt = 0;
    this.crowdHeat = 0;                  // 观众热度 0..1：重击/弹反点燃，随时间消退
    this.clock = 0;
    this.ann = { text: 'READY', cls: '', until: 1.0 };
    this.result = null;
    this.inputOn = false;
    this.koLoser = null;
  }

  setAnnounce(text, cls, dur) {
    this.ann = { text, cls: cls || '', until: this.clock + dur };
  }

  update(dt, input) {
    this.clock += dt;
    this.crowdHeat = Math.max(0, this.crowdHeat - 0.14 * dt);
    if (this.ann && this.clock > this.ann.until) this.ann = null;

    // 顿帧：世界冻结，特效（震屏）照走
    if (this.fx.hitstop > 0) {
      this.fx.update(dt);
      return;
    }

    if (this.phase === 'over') return;

    if (this.phase === 'ko') {
      this.pt += dt;
      this.fx.update(dt);
      const wdt = dt * this.scale;
      this._moveDead(this.player, wdt);
      this._moveDead(this.foe, wdt);
      if (this.pt >= BASE.koHold) this._finish();
      return;
    }

    const wdt = dt * this.scale;
    this.fx.update(dt);

    if (this.phase === 'intro') {
      this.pt += dt;
      if (this.pt >= 1.0 && this.pt - dt < 1.0) this.setAnnounce('FIGHT', '', 0.8);
      if (this.pt >= BASE.introTime) {
        this.phase = 'fight';
        this.inputOn = true;
        this.ann = null;
      }
      // intro 期间双方不动（仅渲染）
      return;
    }

    // ---- 战斗帧 ----
    this.matchT += wdt;
    this.combo.t -= wdt;
    if (this.combo.t <= 0) this.combo.n = 0;

    const pIntent = this.inputOn ? input.pIntent() : { axis: 0, actions: [], block: false };
    const fIntent = this.ai.update(wdt);

    this.player.update(wdt, this.foe, pIntent);
    this.foe.update(wdt, this.player, fIntent);
    this._separate();
    this._drain(this.player);
    this._drain(this.foe);
  }

  _moveDead(f, dt) {
    if (!f.alive) {
      f.t += dt;
      if (f.y > 0 || f.vy !== 0) {                    // KO 在空中也要摔下来
        f.vy -= BASE.jump.gravity * dt;
        f.y += f.vy * dt;
        if (f.y <= 0) { f.y = 0; f.vy = 0; }
      }
      f.vx *= (1 - 4 * dt);
      f.x += f.vx * dt;
      this._clamp(f);
    }
  }

  _separate() {
    const a = this.player, b = this.foe;
    const min = BASE.bodyR * 2 - 6;
    const d = b.x - a.x;
    // 一方跳高时允许直接跨过对手（空越换位）
    if (Math.abs(d) < min && a.alive && b.alive && a.y < 60 && b.y < 60) {
      const push = (min - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1);
      a.x -= push; b.x += push;
    }
    this._clamp(a); this._clamp(b);
  }

  _clamp(f) {
    f.x = Math.max(ARENA.LEFT + BASE.bodyR, Math.min(ARENA.RIGHT - BASE.bodyR, f.x));
  }

  _drain(f) {
    if (!f.events.length) return;
    const evs = f.events.slice();
    f.events.length = 0;
    for (const e of evs) this._handle(e, f);
  }

  _handle(e, owner) {
    const fx = this.fx;
    switch (e.type) {
      case 'whiff':
        AudioFX.play('whoosh');
        break;
      case 'dash':
        AudioFX.play('dash');
        fx.dust(e.x, ARENA.GROUND, 6);
        break;
      case 'jump':
        AudioFX.play('jump');
        fx.dust(e.x, ARENA.GROUND, 5);
        break;
      case 'land':
        AudioFX.play('land');
        fx.dust(e.x, ARENA.GROUND, 8);
        break;
      case 'ghost':
        fx.trail(e.x, owner.color);
        break;
      case 'hit': {
        AudioFX.play(e.kind === 'heavy' ? 'hitH' : 'hitL');
        fx.addHitstop(e.kind === 'heavy' ? 0.09 : 0.05);
        fx.addShake(e.kind === 'heavy' ? 9 : 4.5);
        fx.spark(e.x, 520, e.attacker.facing * (e.crit ? 1.2 : 0.8), e.crit ? '#ffd23f' : '#ffffff', e.kind === 'heavy' ? 14 : 8);
        if (e.blocked) fx.ring(e.x, 520, 46, '#b99cff', 0.3);
        const col = e.crit ? '#ffd23f' : (e.dmg >= 14 ? '#ff5f6d' : '#eef2ff');
        fx.text(e.x, 486, (e.crit ? '' : '') + Math.round(e.dmg) + (e.crit ? '!' : ''), col, e.crit ? 34 : 26);
        if (!e.blocked) this.crowdHeat = Math.min(1, this.crowdHeat + (e.kind === 'heavy' ? 0.5 : 0.26) + (e.crit ? 0.12 : 0));
        if (e.kind === 'heavy' && !e.blocked) {
          fx.comic(e.x + e.attacker.facing * 40, 452, ['哐!', '嘭!', '砰!'][(Math.random() * 3) | 0], '#ff5f6d', 32);
        }
        if (e.attacker.isPlayer && !e.blocked) {
          this.combo.n++;
          this.combo.t = BASE.comboReset;
          this.combo.peak = Math.max(this.combo.peak, this.combo.n);
          this.dmgDealt += e.dmg;
          AudioFX.play('hitConfirm');
          // 连击里程碑：网络热梗弹幕
          const milestone = { 5: '666!', 9: '起飞!', 13: '天花板!', 17: '不是人!' };
          if (milestone[this.combo.n]) fx.comic(e.x, 430, milestone[this.combo.n], '#ffd23f', 34);
        }
        break;
      }
      case 'blocked':
        AudioFX.play('block');
        fx.addShake(2.5);
        fx.spark(e.x, 520, owner.facing * -0.6, '#b99cff', 6, 260);
        break;
      case 'parry':
        AudioFX.play('parry');
        AudioFX.play('cheer');
        fx.addHitstop(0.12);
        fx.addShake(10);
        fx.ring(e.x, 520, 90, '#ffffff', 0.4);
        fx.spark(e.x, 520, 0, '#ffffff', 16, 460);
        fx.comic(e.x, 466, '弹反!!', '#ffffff', 36);
        this.crowdHeat = Math.min(1, this.crowdHeat + 0.55);
        break;
      case 'guardbreak':
        AudioFX.play('guardBreak');
        AudioFX.play('cheer');
        fx.addHitstop(0.1);
        fx.addShake(11);
        fx.ring(e.x, 520, 80, '#ffd23f', 0.4);
        fx.comic(e.x, 462, '破防!', '#ffd23f', 34);
        this.crowdHeat = Math.min(1, this.crowdHeat + 0.55);
        break;
      case 'evade':
        if (e.jump) fx.text(e.x, Math.max(420, e.y - 26), '跳开了!', '#3df2ff', 21);
        else fx.text(e.x, 480, '闪避', '#8b93ad', 20);
        break;
      case 'gale':
        AudioFX.play('gale');
        fx.ring(owner.x, 540, 110, '#ffd23f', 0.45);
        fx.spark(owner.x, 520, -Math.PI / 2, '#ffd23f', 12, 300);
        break;
      case 'jam':
        AudioFX.play('jam');
        fx.ring(e.x, 530, SKILLS.jam.range, '#ff4fd8', 0.5);
        fx.spark(e.x, 520, owner.facing * 0.4, '#ff4fd8', 14, 420);
        if (e.connected) fx.text(owner.facing * 0.5 + e.x, 452, '干扰!', '#ff4fd8', 28);
        break;
      case 'shock':                                        // 疾风余威：疾风结束的冲击波
        AudioFX.play('jam');
        fx.ring(e.x + owner.facing * 30, 530, SKILLS.gale.echo.range * 0.6, '#ffd23f', 0.5);
        fx.spark(e.x, 520, 0, '#ffd23f', 12, 380);
        if (e.connected) {
          fx.text(e.x + owner.facing * 70, 448, '余威!', '#ffd23f', 26);
          this.crowdHeat = Math.min(1, this.crowdHeat + 0.3);
          if (owner.isPlayer) this.dmgDealt += e.dmg;
        }
        break;
      case 'upper':                                         // 破空：上挑
        AudioFX.play('whoosh');
        if (e.connected) {
          AudioFX.play('hitH');
          fx.spark(e.x, 500, -Math.PI / 2, '#9be7ff', 14, 420);
          fx.text(e.x, e.airborne ? 424 : 452, e.airborne ? '升天!' : '挑空!', '#9be7ff', 26);
          this.crowdHeat = Math.min(1, this.crowdHeat + 0.2);
          if (owner.isPlayer) this.dmgDealt += e.dmg;
        } else {
          fx.ring(e.x + owner.facing * 40, 540, 70, '#9be7ff', 0.3);
        }
        break;
      case 'bulwark':                                       // 壁垒：展开减伤
        AudioFX.play('block');
        fx.ring(e.x, 520, 92, '#7dffb0', 0.6);
        fx.text(e.x, 452, '壁垒!', '#7dffb0', 24);
        break;
      case 'siphon':                                        // 吸噬：展开回血
        AudioFX.play('gale');
        fx.ring(e.x, 520, 82, '#b48cff', 0.6);
        fx.text(e.x, 452, '吸噬!', '#b48cff', 24);
        break;
      case 'shadow':                                        // 影袭：瞬移残影
        AudioFX.play('dash');
        fx.spark(e.x, 510, e.dir > 0 ? 0 : Math.PI, '#c9a2ff', 10, 320);
        fx.text(e.x, 452, '影袭!', '#c9a2ff', 24);
        break;
      case 'quake':                                         // 落地震大点
        AudioFX.play('land');
        fx.ring(e.x, 545, BASE.quake.range * 0.8, '#ffd23f', 0.45);
        fx.spark(e.x, 540, -Math.PI / 2, '#c9a2ff', 12, 320);
        if (e.connected) {
          fx.text(e.x + owner.facing * 50, 452, '震地!', '#ffd23f', 26);
          this.crowdHeat = Math.min(1, this.crowdHeat + 0.25);
          if (owner.isPlayer) this.dmgDealt += e.dmg;
        }
        break;
      case 'deny':                                          // 动作被拒的原因提示
        AudioFX.play('click');
        fx.text(e.x, 466, e.msg, '#8b93ad', 19);
        break;
      case 'ko': {
        AudioFX.play('ko');
        AudioFX.play('cheer');
        this.phase = 'ko';
        this.pt = 0;
        this.scale = BASE.koSlowmo;
        fx.addShake(16);
        fx.addHitstop(0.14);
        fx.spark(e.x, 520, 0, '#ffd23f', 26, 560);
        fx.comic(e.x, 440, 'KO!!', '#ffd23f', 44);
        this.crowdHeat = 1;
        this.setAnnounce('K.O.', 'ko', 9);
        this.koLoser = e.loser;
        break;
      }
    }
  }

  _finish() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.scale = 1;
    const win = this.koLoser !== this.player;
    this.result = {
      win,
      time: this.matchT,
      peakCombo: this.combo.peak,
      dmg: Math.round(this.dmgDealt),
      diff: this.diff,
      aiName: this.aiName,
      aiBuild: this.aiBuildData.name,
    };
    AudioFX.play(win ? 'win' : 'lose');
    this.onFinish(this.result);
  }

  skipIntro() {
    if (this.phase === 'intro') {
      this.phase = 'fight';
      this.pt = BASE.introTime;
      this.ann = null;
      this.inputOn = true;
    }
  }

  render() {
    const ctx = this.ctx;
    const [sx, sy] = this.fx.shakeOffset();
    ctx.save();
    ctx.translate(sx, sy);
    drawArena(ctx, this.clock, this.crowdHeat);
    // 角色（倒地/死亡的先画在下层）
    const order = this.player.state === 'down' || this.player.state === 'dead' ? [this.player, this.foe] : [this.foe, this.player];
    for (const f of order) drawFighter(ctx, f, this.clock, this.fx);
    this.fx.render(ctx);
    if (this.phase === 'ko') drawKOLines(ctx, this.pt);
    ctx.restore();
  }

  snapshot() {
    return {
      phase: this.phase,
      p: this.player.snapshot(),
      f: this.foe.snapshot(),
      combo: this.combo.n,
      comboOn: this.combo.t > 0 && this.combo.n >= 2,
      announce: this.ann,
      aiName: this.aiName,
      aiBuild: this.aiBuildData.name,
      matchT: this.matchT,
    };
  }
}

// KO 慢镜头的漫画放射速度线（固定种子，闪烁呼吸）
const KO_LINES = (() => {
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const arr = [];
  for (let i = 0; i < 46; i++) {
    arr.push({ a: r() * Math.PI * 2, w: 1.5 + r() * 3.5, inner: 250 + r() * 150, ph: r() * 6.28 });
  }
  return arr;
})();

function drawKOLines(ctx, pt) {
  const alpha = Math.min(0.5, pt * 1.6);
  ctx.save();
  ctx.translate(ARENA.W / 2, 420);
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  for (const l of KO_LINES) {
    const flick = 0.5 + 0.5 * Math.sin(pt * 30 + l.ph);
    ctx.globalAlpha = alpha * (0.3 + flick * 0.45);
    ctx.lineWidth = l.w;
    const c = Math.cos(l.a), sn = Math.sin(l.a);
    ctx.beginPath();
    ctx.moveTo(c * l.inner, sn * l.inner);
    ctx.lineTo(c * 1150, sn * 1150);
    ctx.stroke();
  }
  ctx.restore();
}
