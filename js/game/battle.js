import { BASE, ARENA } from './constants.js';
import { Fighter } from './fighter.js';
import { AIBrain } from './ai.js';
import { FX } from './fx.js';
import { drawArena } from './arena.js';
import { drawFighter } from './render.js';
import { derive } from '../data/talents.js';
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
  reset({ playerBuild, aiName, aiBuild, diffParams, diff }) {
    this.playerBuild = playerBuild;
    this.aiName = aiName;
    this.aiBuildData = aiBuild;
    this.diff = diff;
    this.diffParams = diffParams;

    const pMods = derive(playerBuild);
    const fMods = derive(aiBuild.build);
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
      f.vx *= (1 - 4 * dt);
      f.x += f.vx * dt;
      this._clamp(f);
    }
  }

  _separate() {
    const a = this.player, b = this.foe;
    const min = BASE.bodyR * 2 - 6;
    const d = b.x - a.x;
    if (Math.abs(d) < min && a.alive && b.alive) {
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
        if (e.attacker.isPlayer && !e.blocked) {
          this.combo.n++;
          this.combo.t = BASE.comboReset;
          this.combo.peak = Math.max(this.combo.peak, this.combo.n);
          this.dmgDealt += e.dmg;
          AudioFX.play('hitConfirm');
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
        fx.addHitstop(0.12);
        fx.addShake(10);
        fx.ring(e.x, 520, 90, '#ffffff', 0.4);
        fx.spark(e.x, 520, 0, '#ffffff', 16, 460);
        fx.text(e.x, 470, '弹反!', '#ffffff', 30);
        break;
      case 'guardbreak':
        AudioFX.play('guardBreak');
        fx.addHitstop(0.1);
        fx.addShake(11);
        fx.ring(e.x, 520, 80, '#ffd23f', 0.4);
        fx.text(e.x, 466, '破防!', '#ffd23f', 30);
        break;
      case 'evade':
        fx.text(e.x, 480, '闪避', '#8b93ad', 20);
        break;
      case 'gale':
        AudioFX.play('gale');
        fx.ring(owner.x, 540, 110, '#ffd23f', 0.45);
        fx.spark(owner.x, 520, -Math.PI / 2, '#ffd23f', 12, 300);
        break;
      case 'jam':
        AudioFX.play('jam');
        fx.ring(e.x, 530, BASE.jam.range, '#ff4fd8', 0.5);
        fx.spark(e.x, 520, owner.facing * 0.4, '#ff4fd8', 14, 420);
        if (e.connected) fx.text(owner.facing * 0.5 + e.x, 452, '干扰!', '#ff4fd8', 28);
        break;
      case 'ko': {
        AudioFX.play('ko');
        this.phase = 'ko';
        this.pt = 0;
        this.scale = BASE.koSlowmo;
        fx.addShake(16);
        fx.addHitstop(0.14);
        fx.spark(e.x, 520, 0, '#ffd23f', 26, 560);
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
    drawArena(ctx, this.clock);
    // 角色（倒地/死亡的先画在下层）
    const order = this.player.state === 'down' || this.player.state === 'dead' ? [this.player, this.foe] : [this.foe, this.player];
    for (const f of order) drawFighter(ctx, f, this.clock, this.fx);
    this.fx.render(ctx);
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
