import { BASE, ARENA } from './constants.js';
import { SKILLS } from '../data/skills.js';

// 战斗实体：状态机 + 资源（生命/能量/格挡）+ buff 计时
// 所有对外反馈走 events 队列，由 battle 统一消费（音效/演出/HUD），保持实体无 IO。
export class Fighter {
  constructor({ name, color, mods, isPlayer, team = isPlayer ? 1 : 2 }) {
    this.name = name;
    this.color = color;
    this.mods = mods;                 // derive(build) 的结果
    this.isPlayer = isPlayer;
    this.team = team;                 // 阵营：1=玩家方（含 AI 队友），2=敌方；2v2 团灭判定用
    this.events = [];
    this.reset(0, 1);
  }

  reset(x, facing) {
    const m = this.mods;
    this.x = x; this.vx = 0;
    this.y = 0; this.vy = 0;               // 跳跃：离地高度与竖直速度
    this.facing = facing;
    this.hpMax = Math.round(BASE.hp * m.hpMul);
    this.hp = this.hpMax;
    this.energyMax = BASE.energyMax + m.energyMaxAdd;
    this.energy = this.energyMax;
    this.guardMax = BASE.guardMax * m.guardMul;
    this.guard = this.guardMax;

    this.state = 'idle';
    this.t = 0;
    this.attack = null;                // {step,data,t,hitDone,lungeDone}
    this.comboIdx = -1;                // 下一次轻击用第几段
    this.comboTimer = 0;               // 连招窗口
    this.pending = null;               // 缓冲的动作
    this.blocking = false;
    this.parryT = 0;                   // 完美格挡剩余窗口
    this.guardIdleT = 0;               // 停止格挡后的回复延迟
    this.iframeT = 0;                  // 无敌帧
    this.invulnT = 0;                  // 起身无敌
    this.silenceT = 0;                 // 被干扰
    this.galeT = 0;
    this.chaseT = 0;
    this.overloadT = 0;
    this.parryBuffT = 0;               // 弹反大师：下一击强化
    this.galeEcho = false;             // 疾风余威：疾风结束时爆发冲击波
    this.denyT = 0;                    // 动作被拒反馈的节流
    this.cd = { s1: 0, s2: 0, dash: 0, jump: 0 };
    this.bulwarkT = 0;                   // 壁垒：减伤 + 格挡不耗
    this.siphonT = 0;                    // 吸噬：命中回血
    this.shadowBuff = false;             // 影袭：下一击强化（落地命中才消耗）
    this.dead = false;
  }

  get alive() { return !this.dead; }
  get vulnerable() {                                   // 可被“抢攻”针对的状态
    return this.state === 'stagger' || this.state === 'down' || this.state === 'getup'
        || this.state === 'hitstun' || this.state === 'dead';
  }
  get chaseMul() { return this.chaseT > 0 ? 1.25 : 1; }   // 追击大点：2 秒内移速/攻速 +25%

  canAct() { return (this.state === 'idle' || this.state === 'block') && this.y === 0; }

  effDmg(base, { gale = false, exec = false } = {}) {
    let d = base * this.mods.dmgMul;
    if (gale) d *= SKILLS.gale.dmgMul;
    if (this.shadowBuff) d *= SKILLS.shadow.buff;
    if (exec && this.targetVulnerable && this.mods.ks.has('exec')) d *= 1.4;   // 抢攻大点：仅持有者受益
    if (this.mods.ks.has('opening') && this.targetFull) d *= 1.25;             // 开局压制大点：对满血敌人
    if (this.overloadT > 0) d *= 1.3;
    if (this.parryBuffT > 0) d *= 1.5;
    return d;
  }

  // opp 可以是单个敌人（1v1/测试直调）或敌人列表（2v2，battle 按就近排序传入）
  update(dt, opp, intent) {
    const foes = Array.isArray(opp) ? opp : [opp];
    const tgt = foes.find(o => o.alive) || foes[0];
    this.targetVulnerable = tgt.vulnerable;
    this.targetFull = tgt.hp >= tgt.hpMax;            // 开局压制大点

    // --- 计时器 ---
    const m = this.mods;
    this.energy = Math.min(this.energyMax, this.energy + BASE.energyRegen * m.energyRegenMul * dt);
    this.cd.s1 = Math.max(0, this.cd.s1 - dt);
    this.cd.s2 = Math.max(0, this.cd.s2 - dt);
    this.cd.dash = Math.max(0, this.cd.dash - dt);
    this.cd.jump = Math.max(0, this.cd.jump - dt);
    this.iframeT = Math.max(0, this.iframeT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.silenceT = Math.max(0, this.silenceT - dt);
    const galeWas = this.galeT > 0;
    this.galeT = Math.max(0, this.galeT - dt);
    if (galeWas && this.galeT === 0 && this.galeEcho && !this.dead) this._echo(foes);   // 疾风余威：结束时爆发
    this.chaseT = Math.max(0, this.chaseT - dt);
    this.overloadT = Math.max(0, this.overloadT - dt);
    this.bulwarkT = Math.max(0, this.bulwarkT - dt);
    this.siphonT = Math.max(0, this.siphonT - dt);
    this.parryBuffT = Math.max(0, this.parryBuffT - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.denyT = Math.max(0, this.denyT - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.comboIdx = -1;
    if (this.guardIdleT > 0) this.guardIdleT -= dt;
    else if (!this.blocking && this.state !== 'stagger') {
      this.guard = Math.min(this.guardMax, this.guard + BASE.guardRegen * dt);
    }

    // --- 跳跃：重力积分与落地（全状态通用） ---
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= BASE.jump.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0;
        this.events.push({ type: 'land', x: this.x });
        if (this.state === 'idle') this._setState('land');   // 落地硬直（受控状态不受影响）
        if (!this.dead && this.mods.ks.has('quake')) this._quake(foes);   // 落地震大点
      }
    }
    if (this.dead) { this.t += dt; return; }

    // 面向最近的活敌（冲刺中也保持）
    if (tgt.x !== this.x) this.facing = tgt.x > this.x ? 1 : -1;

    // --- 无敌/倒地等受控状态 ---
    if (this.state === 'hitstun' || this.state === 'stagger' || this.state === 'down' || this.state === 'getup'
        || this.state === 'land') {
      this.t += dt;
      this.vx *= (1 - 6 * dt);
      this.x += this.vx * dt;
      if (this.state === 'hitstun' && this.t >= this.hitstunDur) this._setState('idle');
      else if (this.state === 'stagger' && this.t >= (this.staggerDur || BASE.stagger)) this._setState('idle');
      else if (this.state === 'land' && this.t >= BASE.jump.land) this._setState('idle');
      else if (this.state === 'down' && this.t >= BASE.knockdown.down) {
        this._setState('getup');
        this.invulnT = BASE.knockdown.invuln;
      } else if (this.state === 'getup' && this.t >= BASE.knockdown.getup) this._setState('idle');
      return;
    }

    if (this.state === 'dash') { this._updateDash(dt); return; }
    if (this.state === 'attack') { this._updateAttack(dt, foes); this._bufferAndMove(dt, intent); return; }

    // --- 空中：受限水平操控，不可出招/格挡 ---
    if (this.y > 0) {
      const sp = BASE.moveSpeed * m.moveMul * this.chaseMul * BASE.jump.airCtrl;
      this.vx = (intent.axis || 0) * sp;
      this.x += this.vx * dt;
      return;
    }

    // --- idle / block：可自由行动 ---
    this.blocking = this.state === 'block';
    if (this.blocking) { this.guardIdleT = BASE.guardDelay; }

    // 移动
    const sp = BASE.moveSpeed * m.moveMul * this.chaseMul * (this.state === 'block' ? BASE.blockSpeed : 1);
    const mv = (intent.axis || 0) * sp;
    this.vx = mv;
    this.x += this.vx * dt;

    // 动作分发（后进先出的单槽缓冲）
    const act = intent.actions.length ? intent.actions[intent.actions.length - 1] : null;
    if (act) {
      if (act === 'light') this._tryLight();
      else if (act === 'heavy') this._tryHeavy();
      else if (act === 'dash') this._tryDash(intent);
      else if (act === 'jump') this._tryJump();
      else if (act === 's1') this._trySkill(0, foes, intent);
      else if (act === 's2') this._trySkill(1, foes, intent);
    }

    // 格挡按住
    if (intent.block) {
      if (this.state === 'idle') {
        this._setState('block');
        this.blocking = true;
        this.parryT = BASE.parryWindow;
      }
    } else if (this.state === 'block') {
      this._setState('idle');
      this.blocking = false;
    }
  }

  _bufferAndMove(dt, intent) {
    // 攻击中允许小幅惯性滑动 + 缓冲下一动作
    this.vx *= (1 - 8 * dt);
    this.x += this.vx * dt;
    const a = intent.actions[intent.actions.length - 1];
    if (a && !this.pending) this.pending = a;
    if (intent.block && !this.pending) this.pending = 'block';
    if (this.pending === 'dash' && this.attack && this.attack.phase === 'recovery') this._tryDash(intent);
  }

  _tryLight() {
    if (!this.canAct()) return;
    if (this.state === 'block') this._setState('idle');
    let step = 0;
    if (this.comboTimer > 0 && this.comboIdx >= 0) step = (this.comboIdx + 1) % 3;
    this._startAttack(step);
  }

  _tryHeavy() {
    if (!this.canAct()) return;
    if (this.state === 'block') this._setState('idle');
    this._startAttack(-1);
    this.comboIdx = -1;
  }

  _startAttack(step) {
    const m = this.mods;
    const src = step < 0 ? BASE.heavy : BASE.light[step];
    const spd = m.atkSpdMul * this.chaseMul * (this.galeT > 0 ? SKILLS.gale.spdBonus : 1);
    const data = {
      ...src,
      windup: src.windup / spd, active: src.active / spd, rec: src.rec / spd,
      heavy: step < 0,
      step,
    };
    this.attack = { step, data, t: 0, phase: 'windup', hitDone: false, lungeDone: false };
    this.comboIdx = step;
    this.vx = 0;
    this._setState('attack');
    this.pending = null;
    this.events.push({ type: 'swing', heavy: data.heavy });
  }

  _updateAttack(dt, opp) {
    const foes = Array.isArray(opp) ? opp : [opp];
    const a = this.attack;
    a.t += dt;
    const d = a.data;
    if (a.phase === 'windup' && a.t >= d.windup) {
      a.phase = 'active';
      if (!a.lungeDone) { this.vx = this.facing * (d.lunge || 0); a.lungeDone = true; }
      this.events.push({ type: 'whiff', heavy: d.heavy });
    } else if (a.phase === 'active') {
      this.x += this.vx * dt;
      this.vx *= (1 - 6 * dt);
      if (!a.hitDone) {                       // 接触帧横扫：范围内敌人全部吃这一击（2v2 可一扫双）
        let hitAny = false;
        for (const o of foes) if (this._checkHit(o)) hitAny = true;
        if (hitAny) a.hitDone = true;
      }
      if (a.t >= d.windup + d.active) a.phase = 'recovery';
    } else if (a.phase === 'recovery') {
      this.vx *= (1 - 9 * dt);
      this.x += this.vx * dt;
      if (a.t >= d.windup + d.active + d.rec) {
        this.attack = null;
        this.comboTimer = BASE.comboWindow;
        this._setState('idle');
        if (this.pending) {
          const p = this.pending; this.pending = null;
          if (p === 'light') this._tryLight();
          else if (p === 'heavy') this._tryHeavy();
          else if (p === 's1') this._trySkill(0, opp);
          else if (p === 's2') this._trySkill(1, opp);
          else if (p === 'jump') this._tryJump();
          else if (p === 'block') { /* 保持 idle，下帧由 intent.block 接手 */ }
        }
      }
    }
  }

  _checkHit(opp) {
    const d = this.attack.data;
    const dist = (opp.x - this.x) * this.facing;
    if (dist < -30 || dist > d.reach + BASE.bodyR) return false;
    if (Math.abs(opp.x - this.x) > d.reach + 18) return false;
    if (!opp.alive) return false;
    if (opp.y > BASE.jump.dodgeH) {                       // 跳过去了：地面攻击够不着
      opp.events.push({ type: 'evade', x: opp.x, y: 520 - opp.y, jump: true });
      return false;
    }

    const galeOn = this.galeT > 0;
    let dmg = this.effDmg(d.dmg, { gale: galeOn, exec: true });

    // 暴击
    let crit = Math.random() < this.mods.critChance;
    if (this.parryBuffT > 0) crit = true;
    if (crit) dmg *= BASE.crit.mult;

    const res = opp.takeHit({
      dmg, guard: d.guard, kb: d.kb || (d.heavy ? 320 : 130),
      knockdown: !!d.knockdown, attacker: this, kind: d.heavy ? 'heavy' : 'light',
      unblockable: false, source: this,     // 疾风不再穿格挡（格挡是核心防御，必须有反击空间）
    });
    if (!res.applied) return false;

    this._onHit(res);                                       // 吸血 / 吸噬回血 / 影袭强化消耗
    if (crit && this.mods.ks.has('chase')) this.chaseT = 2; // 追击大点门控：未持有者暴击不挂
    if (this.parryBuffT > 0) this.parryBuffT = 0;

    this.events.push({
      type: 'hit', attacker: this, target: opp, kind: d.heavy ? 'heavy' : 'light',
      dmg: res.dealt, crit, blocked: res.blocked, x: res.x, y: res.y, comboStep: d.step,
    });
    return true;
  }

  takeHit(hit) {
    const px = this.x - (hit.source ? hit.source.facing : 1) * 10;
    const py = 520;
    if (!this.alive) return { applied: false, dealt: 0, x: px, y: py };
    if (this.iframeT > 0 || this.invulnT > 0) {
      this.events.push({ type: 'evade', x: px, y: py });
      return { applied: false, dealt: 0, evaded: true, x: px, y: py };
    }

    let dmg = hit.dmg;
    let blocked = false;

    // 铁血：低血量减伤（仅持有大点者）
    if (this.mods.ks.has('iron') && this.hp < this.hpMax * 0.3) dmg *= 0.8;
    if (this.bulwarkT > 0) dmg *= (1 - SKILLS.bulwark.reduce);   // 壁垒：技能减伤

    if (this.state === 'block') {
      if (this.parryT > 0 && !hit.unblockable) {
        // 完美格挡：弹反
        this.parryT = 0;
        this.guard = Math.min(this.guardMax, this.guard + 10);
        hit.attacker.getStaggered(BASE.parriedStagger);
        if (this.mods.ks.has('parrymaster')) this.parryBuffT = 2;   // 门控在弹反者本人
        this.events.push({ type: 'parry', x: px, y: py, defender: this, attacker: hit.attacker });
        return { applied: true, dealt: 0, blocked: true, parried: true, x: px, y: py };
      }
      if (!hit.unblockable) {
        blocked = true;
        const chip = dmg * (1 - BASE.blockReduce);
        dmg = chip;
        if (this.bulwarkT <= 0) this.guard -= hit.guard;         // 壁垒期间格挡不耗耐久
        this.guardIdleT = BASE.guardDelay;
        if (this.guard <= 0) {
          this.guard = 0;
          this.state = 'stagger'; this.t = 0; this.staggerDur = BASE.stagger;
          this.blocking = false;
          this.vx = (hit.source ? hit.source.facing : -1) * 90;
          this.events.push({ type: 'guardbreak', x: px, y: py, target: this });
        } else {
          this.events.push({ type: 'blocked', x: px, y: py, target: this });
          this.vx = (hit.source ? hit.source.facing : 1) * (hit.kb || 100) * 0.35;
        }
      }
    }

    this.hp -= dmg;
    const dealt = dmg;

    if (!blocked) {
      if (hit.knockdown) {
        this.state = 'down'; this.t = 0;
        this.vx = (hit.source ? hit.source.facing : 1) * (hit.kb || 300);
      } else {
        this.state = 'hitstun'; this.t = 0;
        this.hitstunDur = hit.kind === 'heavy' ? BASE.hitstunH : BASE.hitstunL;
        this.vx = (hit.source ? hit.source.facing : 1) * (hit.kb || 150);
      }
      this.blocking = false;
      this.attack = null;
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.state = 'dead'; this.t = 0;
      this.vx = (hit.source ? hit.source.facing : 1) * 260;
      this.events.push({ type: 'ko', loser: this, winner: hit.attacker, x: px, y: py });
    }
    return { applied: true, dealt, blocked, x: px, y: py };
  }

  getStaggered(dur) {
    if (!this.alive) return;
    this.state = 'stagger'; this.t = 0;
    this.staggerDur = dur;
    this.attack = null;
    this.blocking = false;
    this.vx = -this.facing * 120;
  }

  _tryJump() {
    if (!this.canAct()) return;
    if (this.cd.jump > 0) { this._deny('冷却中'); return; }
    if (this.energy < BASE.jump.cost) { this._deny('能量不足'); return; }
    if (this.state === 'block') this._setState('idle');
    this.energy -= BASE.jump.cost;
    this.cd.jump = BASE.jump.cd;
    this.pending = null;
    this.vy = BASE.jump.v0;
    this.y = Math.max(this.y, 0.01);           // 离地（0 表示贴地）
    this.events.push({ type: 'jump', x: this.x });
  }

  _tryDash(intent) {
    if (this.y > 0 || this.cd.dash > 0 || this.state === 'dash') return;
    if (this.energy < BASE.dash.cost) return;
    if (this.state === 'block') this._setState('idle');
    if (this.state === 'attack') {
      const a = this.attack;
      if (!(a.phase === 'recovery')) return;       // 只允许收招取消
    }
    this.energy -= BASE.dash.cost;
    this.cd.dash = BASE.dash.cd * this.mods.dashCdMul;
    this.iframeT = BASE.dash.iframe + this.mods.iframeAdd;
    const dir = (intent.axis || 0) >= 0 ? (intent.axis > 0 ? 1 : -1) : -this.facing;
    this.dashDir = intent.axis ? dir : -this.facing;   // 无输入时后撤步
    this.state = 'dash'; this.t = 0;
    this.attack = null;
    this.pending = null;
    this.blocking = false;
    this.events.push({ type: 'dash', x: this.x });
  }

  _updateDash(dt) {
    this.t += dt;
    this.x += this.dashDir * BASE.dash.speed * dt;
    if (this.dense !== false && Math.random() < 0.6) this.events.push({ type: 'ghost', x: this.x });
    if (this.t >= BASE.dash.dur) this._setState('idle');
  }

  // 技能分发：按装配槽位（Q=槽0，E=槽1）。拒绝给玩家原因；目标不满足则静默不消耗。
  // opp 可为单敌或敌列表（就近排序），需要目标的技能取首个满足条件者。
  _trySkill(slot, opp, intent) {
    if (!this.canAct()) return;
    const foes = Array.isArray(opp) ? opp : [opp];
    const id = (this.mods.skills || [])[slot];
    if (!id) return;
    const sk = SKILLS[id];
    if (this.silenceT > 0) { this._deny('被沉默'); return; }
    if (this.cd['s' + (slot + 1)] > 0) { this._deny('冷却中'); return; }
    if (this.energy < sk.cost) { this._deny('能量不足'); return; }
    let tgt = null;
    if (id === 'jam' || id === 'upper') {                  // 需要目标的技能：前置判定
      tgt = foes.find(o => o.alive
        && Math.abs(o.x - this.x) <= sk.range
        && (o.x - this.x) * this.facing > -40
        && !(id === 'jam' && o.y > BASE.jump.dodgeH));      // 跳过头顶躲冲击波
      if (!tgt) return;
    }
    this.energy -= sk.cost;
    this.cd['s' + (slot + 1)] = sk.cd * this.mods.skillCdMul;
    this.pending = null;
    if (id === 'gale') this._doGale();
    else if (id === 'jam') this._doJam(tgt);
    else if (id === 'upper') this._doUpper(tgt);
    else if (id === 'bulwark') this._doBulwark();
    else if (id === 'siphon') this._doSiphon();
    else if (id === 'shadow') this._doShadow(intent);
  }

  _doGale() {
    this.galeT = SKILLS.gale.dur;
    if (this.mods.ks.has('galeecho')) this.galeEcho = true;
    this.events.push({ type: 'gale', owner: this });
  }

  // 疾风余威大点：疾风结束时爆发地面冲击波（可跳跃越过；2v2 范围内多人同时吃）
  _echo(opp) {
    this.galeEcho = false;
    const foes = Array.isArray(opp) ? opp : [opp];
    const e = SKILLS.gale.echo;
    let connected = false, dealt = 0;
    for (const o of foes) {
      if (o.alive && Math.abs(o.x - this.x) <= e.range && o.y <= BASE.jump.dodgeH) {
        const res = o.takeHit({
          dmg: e.dmg, guard: e.guard, kb: e.kb, knockdown: false,
          attacker: this, kind: 'jam', unblockable: false, source: this,
        });
        if (res.applied) {
          connected = true;
          dealt += res.dealt;
          if (this.mods.lifesteal > 0 && res.dealt > 0) this.hp = Math.min(this.hpMax, this.hp + res.dealt * this.mods.lifesteal);
        }
      }
    }
    this.events.push({ type: 'shock', owner: this, connected, dmg: dealt, x: this.x });
  }

  // 落地震大点：落地瞬间震击近身敌人（2v2 范围内多人同时吃）
  _quake(opp) {
    const foes = Array.isArray(opp) ? opp : [opp];
    const q = BASE.quake;
    let connected = false, dealt = 0;
    for (const o of foes) {
      if (o.alive && Math.abs(o.x - this.x) <= q.range && o.y <= BASE.jump.dodgeH) {
        const res = o.takeHit({
          dmg: q.dmg, guard: 0, kb: q.kb, knockdown: false,
          attacker: this, kind: 'jam', unblockable: false, source: this,
        });
        if (res.applied) {
          connected = true;
          dealt += res.dealt;
          if (this.mods.lifesteal > 0 && res.dealt > 0) this.hp = Math.min(this.hpMax, this.hp + res.dealt * this.mods.lifesteal);
        }
      }
    }
    this.events.push({ type: 'quake', owner: this, connected, dmg: dealt, x: this.x });
  }

  // 动作被拒时给玩家看得见的原因（0.6s 节流；AI 静默）
  _deny(msg) {
    if (this.denyT > 0 || !this.isPlayer) return;
    this.denyT = 0.6;
    this.events.push({ type: 'deny', x: this.x, msg });
  }

  _doJam(opp) {
    const sk = SKILLS.jam;
    let connected = false;
    const res = opp.takeHit({
      dmg: this.effDmg(sk.dmg, { exec: true }),
      guard: sk.guard, kb: sk.kb, knockdown: false,
      attacker: this, kind: 'jam', unblockable: false, source: this,
    });
    if (res.applied) {
      connected = true;
      opp.silenceT = sk.silence;
      if (this.mods.ks.has('jamoverload')) this.overloadT = 3;
      this._onHit(res);
    }
    this.events.push({ type: 'jam', owner: this, connected, x: this.x + this.facing * 60 });
  }

  // 破空：上挑击倒；命中滞空目标翻倍（制裁跳跃的专属武器）
  _doUpper(opp) {
    const sk = SKILLS.upper;
    const airborne = opp.y > 0;
    let connected = false, dealt = 0;
    const res = opp.takeHit({
      dmg: this.effDmg(sk.dmg * (airborne ? 2 : 1), { exec: true }),
      guard: 0, kb: sk.kb, knockdown: true,
      attacker: this, kind: 'heavy', unblockable: false, source: this,
    });
    if (res.applied) {
      connected = true; dealt = res.dealt;
      this._onHit(res);
    }
    this.events.push({ type: 'upper', owner: this, connected, dmg: dealt, airborne, x: this.x });
  }

  _doBulwark() {
    this.bulwarkT = SKILLS.bulwark.dur;
    this.events.push({ type: 'bulwark', owner: this, x: this.x });
  }

  _doSiphon() {
    this.siphonT = SKILLS.siphon.dur;
    this.events.push({ type: 'siphon', owner: this, x: this.x });
  }

  _doShadow(intent) {
    const sk = SKILLS.shadow;
    const dir = (intent && intent.axis) ? Math.sign(intent.axis) : this.facing;
    this.x += dir * sk.dist;
    this.iframeT = Math.max(this.iframeT, sk.iframe);
    this.shadowBuff = true;
    this.events.push({ type: 'shadow', owner: this, x: this.x, dir });
  }

  // 攻击落地后的攻方结算：吸血 / 吸噬回血 / 影袭强化消耗
  _onHit(res) {
    if (!res.applied || res.dealt <= 0) return;
    let heal = 0;
    if (this.mods.lifesteal > 0) heal += res.dealt * this.mods.lifesteal;
    if (this.siphonT > 0) heal += res.dealt * SKILLS.siphon.heal;
    if (heal > 0) this.hp = Math.min(this.hpMax, this.hp + heal);
    if (this.shadowBuff) this.shadowBuff = false;
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.t = 0;
    if (s === 'idle' || s === 'getup') this.blocking = false;
  }

  // HUD 快照
  snapshot() {
    const ids = this.mods.skills || ['gale', 'jam'];
    return {
      hp: this.hp, hpMax: this.hpMax,
      energy: this.energy, energyMax: this.energyMax,
      guard: this.guard, guardMax: this.guardMax,
      s1: this.cd.s1, s2: this.cd.s2, dash: this.cd.dash,
      skills: ids.slice(),
      s1Max: SKILLS[ids[0]].cd * this.mods.skillCdMul,
      s2Max: SKILLS[ids[1]].cd * this.mods.skillCdMul,
      galeActive: this.galeT > 0, silence: this.silenceT > 0,
      silenceT: this.silenceT, alive: this.alive,
      state: this.state,
    };
  }
}
