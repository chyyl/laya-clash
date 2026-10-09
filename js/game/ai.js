import { BASE } from './constants.js';
import { pickSlot } from '../data/skills.js';

// 分层 AI：计划（approach/attack/defend/retreat）+ 反应延迟（看到起手后才决策）
// 难度参数见 data/aiBuilds.js。AI 与玩家共用 Fighter API，作弊仅限“读帧”（已知起手阶段）。
export class AIBrain {
  constructor(me, foe, params) {
    this.me = me;
    this.foe = foe;
    this.p = params;
    this.plan = { type: 'wait', t: 0.3 };
    this.reactT = 0;
    this.reacted = false;      // 对当前这一起手是否已反应
    this.blockHold = false;
    this.jitter = (Math.random() - 0.5) * 0.1;
    this._lastFoe = foe;       // 记录上一帧目标，用于检测目标切换
  }

  reset() {
    this.plan = { type: 'wait', t: 0.3 };
    this.reactT = 0; this.reacted = false; this.blockHold = false;
    this._lastFoe = this.foe;
  }

  update(dt) {
    const me = this.me, foe = this.foe, p = this.p;
    const intent = { axis: 0, actions: [], block: false };
    if (!me.alive || !foe.alive) return intent;

    // 目标切换：重置反应状态，避免沿用旧目标的 reacted 导致不再防御
    if (foe !== this._lastFoe) {
      this.reacted = false;
      this.reactT = 0;
      this._lastFoe = foe;
    }

    const dist = Math.abs(foe.x - me.x);
    const dirToFoe = foe.x > me.x ? 1 : -1;
    const reach = 96;

    // ---- 起手反应管道（决定防御/惩罚） ----
    const foeAttacking = foe.state === 'attack';
    if (foeAttacking && !this.reacted) {
      if (this.reactT <= 0) this.reactT = p.reaction + this.jitter * 0.4;
      this.reactT -= dt;
      if (this.reactT <= 0) {
        this.reacted = true;
        this._react(dist, dirToFoe, reach);
      }
    }
    if (!foeAttacking) { this.reacted = false; this.reactT = 0; }

    // ---- 计划推进 ----
    this.plan.t -= dt;
    if (this.plan.t <= 0) this._think(dist, dirToFoe, reach);

    // ---- 执行计划 ----
    const pl = this.plan;
    if (this.blockHold) intent.block = true;

    if (pl.type === 'approach') {
      intent.axis = dirToFoe;
      if (dist <= reach * 0.8) { this.plan = { type: 'attack', t: 0.5 + Math.random() * 0.5 }; }
    } else if (pl.type === 'attack') {
      if (dist > reach + 18) intent.axis = dirToFoe;      // 贴上去继续打
      else if (dist < 46) intent.axis = -dirToFoe * 0.5;  // 防重叠
      if (dist < reach + 12 && !this.blockHold && foe.y <= BASE.jump.dodgeH) {   // 贴地跳照样打，跳过头顶才收手
        const chainChance = p.combo;
        if (Math.random() < chainChance) {
          intent.actions.push(Math.random() < 0.22 ? 'heavy' : 'light');
        } else if (Math.random() < 0.35) {
          this.plan = { type: 'backoff', t: 0.35 + Math.random() * 0.4 };
        }
      }
    } else if (pl.type === 'hop') {
      intent.actions.push('jump');                        // 起跳跨过对手的重击
      this.plan = { type: 'backoff', t: 0.35 };
    } else if (pl.type === 'defend') {
      intent.block = true;
      if (!foeAttacking && foe.state !== 'stagger') {
        this.blockHold = false;
        this.plan = { type: pl.next || 'wait', t: 0.25 };
      }
    } else if (pl.type === 'retreat') {
      intent.axis = -dirToFoe;
      if (dist > 320) this.plan = { type: 'wait', t: 0.3 };
    } else if (pl.type === 'backoff') {
      intent.axis = -dirToFoe;
    } else if (pl.type === 'cast') {
      intent.actions.push(pl.skill);
      this.plan = { type: 'attack', t: 0.6 };
    } else if (pl.type === 'punish') {
      if (dist < reach + 14 && foe.y <= BASE.jump.dodgeH) intent.actions.push('heavy');
      else if (foe.y > BASE.jump.dodgeH) { /* 跳过头顶：等他落地 */ }
      else intent.axis = dirToFoe;
    } else if (pl.type === 'dashIn') {
      intent.axis = dirToFoe;
      intent.actions.push('dash');
      this.plan = { type: 'attack', t: 0.5 };
    } else {
      // wait：小幅踱步
      if (Math.random() < 0.5) intent.axis = dirToFoe * (dist > 260 ? 1 : 0.3);
    }

    // 残血/低格挡的保命倾向
    if (!this.blockHold && me.guard < me.guardMax * 0.22 && dist < 140 && Math.random() < 0.02) {
      this.plan = { type: 'retreat', t: 0.6 };
    }

    return intent;
  }

  _react(dist, dirToFoe, reach) {
    const p = this.p, me = this.me, foe = this.foe;
    const r = Math.random();
    if (r < p.mistake) return;                                  // 没反应过来

    const foeHeavy = foe.attack && foe.attack.data.heavy;

    // 起跳闪避：重击抡过来时跨过去（难度参数 hop 控制频率，独立掷骰）
    if (foeHeavy && me.y === 0 && me.cd.jump <= 0 && Math.random() < (p.hop || 0)) {
      this.plan = { type: 'hop', t: 0.05 };
      return;
    }

    // 先看能不能反打（对方收招中且够得着）
    if (foe.attack && foe.attack.phase === 'recovery' && dist < reach && r < p.punish) {
      this.plan = { type: 'punish', t: 0.3 };
      return;
    }
    // 闪避（后撤步无敌帧）
    if (!foeHeavy && dist < reach + 30 && r < p.dashAway * 0.4) {
      this.plan = { type: 'backoff', t: 0.3 };
      return;
    }
    // 格挡 / 弹反
    if (r < p.block + p.parry) {
      const wantParry = r < p.parry;
      if (wantParry && foeHeavy) {
        // 重击起手长：晚一点按格挡才能踩进完美窗口
        const remain = (foe.attack.data.windup - foe.attack.t);
        if (remain > 0.13) { this.blockHold = true; this.plan = { type: 'defend', t: 1.0, next: 'attack' }; return; }
      }
      this.blockHold = true;
      this.plan = { type: 'defend', t: 1.0, next: Math.random() < p.punish ? 'attack' : 'backoff' };
      return;
    }
    // 后撤
    this.plan = { type: 'backoff', t: 0.4 };
  }

  _think(dist, dirToFoe, reach) {
    const p = this.p, me = this.me, foe = this.foe;
    const r = Math.random();

    // 失误：该动手时发呆
    if (r < p.mistake) { this.plan = { type: 'wait', t: 0.3 + Math.random() * 0.4 }; return; }

    // 技能决策（独立掷骰；按装配选槽，残血优先防御类）
    if (me.silenceT <= 0 && Math.random() < p.skill) {
      const slot = pickSlot(me, dist);
      if (slot >= 0) { this.plan = { type: 'cast', t: 0.1, skill: 's' + (slot + 1) }; return; }
    }

    // 敌方处于可惩罚状态
    if (foe.vulnerable && dist < reach + 20 && r < p.punish) {
      this.plan = { type: 'punish', t: 0.35 };
      return;
    }

    // 距离管理
    if (dist > reach + 60) {
      if (dist > 380 && me.cd.dash <= 0 && me.energy >= 12 && r < 0.5) {
        this.plan = { type: 'dashIn', t: 0.3 };
      } else {
        this.plan = { type: 'approach', t: 0.5 };
      }
      return;
    }
    if (r < p.aggro) { this.plan = { type: 'attack', t: 0.5 + Math.random() * 0.6 }; return; }

    // 保守：保持距离拉扯
    this.plan = { type: r < 0.5 ? 'backoff' : 'wait', t: 0.3 + Math.random() * 0.3 };
  }
}
