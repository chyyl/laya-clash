// 技能池回归：池完整性 / 装配归一 / 六技能效果 / 槽位拒绝 / AI 选槽 / 快照贯通。
// 与 keystone_test 共用 harness；断言全部从 SKILLS 参数与 derive 公式直推。
import { ok, near, done } from './harness.mjs';

const ROOT = new URL('../js/', import.meta.url).href;
const {
  SKILLS, SKILL_IDS, DEFAULT_LOADOUT, SKILL_KEYS,
  normalizeLoadout, slotReady, pickSlot,
} = await import(ROOT + 'data/skills.js');
const { derive, emptyBuild } = await import(ROOT + 'data/talents.js');
const { Fighter } = await import(ROOT + 'game/fighter.js');
const { BASE } = await import(ROOT + 'game/constants.js');
const { AIBrain } = await import(ROOT + 'game/ai.js');

// ---- 构造 ----
function build(stats = {}, ks = []) {
  const b = emptyBuild();
  Object.assign(b.stats, stats);
  b.ks = ks.slice();
  return b;
}
function mkWith(skills, stats = {}, ks = []) {
  const mods = derive(build(stats, ks));
  if (skills) mods.skills = skills.slice();
  return new Fighter({ name: 't', color: '#fff', mods, isPlayer: true });
}
const mk = () => mkWith(null);
const opp = () => mkWith(null);
const HIT = (attacker, dmg, extra = {}) => ({
  dmg, guard: 0, kb: 100, knockdown: false,
  attacker, kind: 'light', unblockable: false, source: attacker, ...extra,
});

// ---- 1) 池完整性 ----
ok('池：6 个技能', SKILL_IDS.length === 6, String(SKILL_IDS.length));
ok('池：每项有名称/描述/定位/费/CD',
  SKILL_IDS.every(id => SKILLS[id].name && SKILLS[id].desc && SKILLS[id].cls
    && SKILLS[id].cost > 0 && SKILLS[id].cd > 0));
ok('池：ID 与键名一致且无重复', SKILL_IDS.every(id => SKILLS[id].id === id)
  && new Set(SKILL_IDS).size === 6);
ok('槽位键位 Q/E', SKILL_KEYS.join() === 'Q,E');
ok('默认装配两项合法且不同',
  DEFAULT_LOADOUT.length === 2 && new Set(DEFAULT_LOADOUT).size === 2
  && DEFAULT_LOADOUT.every(id => SKILLS[id]));

// ---- 2) 装配归一 ----
ok('normalize：null → 默认', normalizeLoadout(null).join() === 'gale,jam');
ok('normalize：非数组 → 默认', normalizeLoadout('x').join() === 'gale,jam');
ok('normalize：去重保留前者并补位', normalizeLoadout(['upper', 'upper']).join() === 'upper,gale');
ok('normalize：剔除非池项（先到先得再补默认）', normalizeLoadout(['zzz', 'bulwark']).join() === 'bulwark,gale');
ok('normalize：合法装配原样', normalizeLoadout(['shadow', 'siphon']).join() === 'shadow,siphon');

// ---- 3) derive 默认装配 ----
ok('derive → 默认装配 gale/jam', derive(emptyBuild()).skills.join() === 'gale,jam');

// ---- 4) 快照贯通 ----
{
  const s = mkWith(['shadow', 'bulwark']).snapshot();
  ok('snapshot：携带 skills 与槽位 CD',
    s.skills.join() === 'shadow,bulwark' && typeof s.s1 === 'number'
    && typeof s.s2 === 'number' && s.s2Max > 0);
}

// ---- 5) 疾风：攻速 + 增伤 + 不再穿格挡 ----
{
  const f = mk();
  const o = opp();
  f.x = 400; o.x = 500;
  f.energy = 100;
  f._trySkill(0, o);
  ok('疾风：galeT=3 / 扣40 / s1 进 CD',
    near(f.galeT, SKILLS.gale.dur) && near(f.energy, 100 - SKILLS.gale.cost)
    && near(f.cd.s1, SKILLS.gale.cd), 'galeT ' + f.galeT);
  const plain = mk();
  plain._tryLight();
  const w0 = plain.attack.data.windup;
  f._tryLight();
  ok('疾风：起手 ×(1/1.33)', near(f.attack.data.windup, w0 / SKILLS.gale.spdBonus, 1e-3),
    f.attack.data.windup + ' vs ' + w0);
}
{
  // 格挡核心回归：疾风中攻击可被格挡（v2 移除 unblockable）
  const a = mk();
  const d = opp();
  a.galeT = 3;
  a.x = 400; d.x = 460;
  d.state = 'block'; d.parryT = 0; d.guard = d.guardMax;
  a._startAttack(0);
  a.attack.phase = 'active';
  const g0 = d.guard;
  const connected = a._checkHit(d);
  ok('疾风：攻击可被格挡（打耐久不穿透）',
    connected === true && d.guard < g0,
    'guard ' + g0 + '→' + d.guard);
}

// ---- 6) 干扰：命中沉默 + 超距/滞空静默不消耗 ----
{
  const f = mk();
  const o = opp();
  f.x = 400; o.x = 520;
  f.energy = 100;
  f._trySkill(1, o);
  ok('干扰：命中 + 沉默 + 扣费 + s2 进 CD',
    o.silenceT > 0 && near(f.energy, 100 - SKILLS.jam.cost)
    && near(f.cd.s2, SKILLS.jam.cd), 'silence ' + o.silenceT);
  ok('干扰：9 伤', near(o.hp, 100 - SKILLS.jam.dmg), 'hp ' + o.hp);
}
{
  const f = mk();
  const o = opp();
  f.x = 400; o.x = 400 + SKILLS.jam.range + 50;
  f.energy = 100;
  f._trySkill(1, o);
  ok('干扰：超距 → 静默不消耗',
    near(f.energy, 100) && f.cd.s2 === 0 && !f.events.some(e => e.type === 'jam'));
}
{
  const f = mk();
  const o = opp();
  f.x = 400; o.x = 500; o.y = BASE.jump.dodgeH + 1;
  f.energy = 100;
  f._trySkill(1, o);
  ok('干扰：目标滞空 → 静默不消耗（跳跃可躲）',
    f.cd.s2 === 0 && near(f.energy, 100));
}

// ---- 7) 破空：贴地 12 / 滞空翻倍 + 击倒 ----
{
  const f = mkWith(['upper', 'jam']);
  const o = opp();
  f.x = 400; o.x = 460;
  f.energy = 100;
  f._trySkill(0, o);
  ok('破空：贴地 12 伤 + 进 CD',
    near(o.hp, 100 - SKILLS.upper.dmg) && near(f.cd.s1, SKILLS.upper.cd),
    'hp ' + o.hp);
  ok('破空：命中击倒', o.state === 'down' || o.state === 'hitstun', o.state);
}
{
  const f = mkWith(['upper', 'jam']);
  const o = opp();
  f.x = 400; o.x = 460; o.y = 40;
  f._trySkill(0, o);
  ok('破空：滞空翻倍（24 伤）',
    near(o.hp, 100 - SKILLS.upper.dmg * 2), 'hp ' + o.hp);
  const ev = f.events.find(e => e.type === 'upper');
  ok('破空：事件带 airborne 标记', ev && ev.airborne === true);
}

// ---- 8) 壁垒：减伤 40% + 格挡不耗耐久 ----
{
  const f = mkWith(['bulwark', 'jam']);
  const a = opp();
  f.energy = 100;
  f._trySkill(0, a);
  ok('壁垒：施放进状态', near(f.bulwarkT, SKILLS.bulwark.dur) && near(f.energy, 100 - SKILLS.bulwark.cost));
  const r = f.takeHit(HIT(a, 10));
  ok('壁垒：受伤 -40%（10 变 6）', near(r.dealt, 6), 'dealt ' + r.dealt);
}
{
  const f = mkWith(['bulwark', 'jam']);
  const a = opp();
  f.energy = 100;
  f._trySkill(0, a);
  f.state = 'block'; f.parryT = 0; f.guard = f.guardMax;
  const r = f.takeHit(HIT(a, 10, { guard: 50 }));
  ok('壁垒：格挡不耗耐久且仍免伤',
    near(f.guard, f.guardMax) && r.blocked === true, 'guard ' + f.guard);
}
{
  // 未施放时照常耗耐久
  const f = mkWith(['bulwark', 'jam']);
  f.state = 'block'; f.parryT = 0; f.guard = f.guardMax;
  f.takeHit(HIT(opp(), 10, { guard: 50 }));
  ok('壁垒未施放：格挡照常扣耐久', f.guard < f.guardMax, 'guard ' + f.guard);
}

// ---- 9) 吸噬：命中回 60% ----
{
  const f = mkWith(['siphon', 'jam']);
  const o = opp();
  f.x = 400; o.x = 460;
  f.hp = 50;
  f.mods.critChance = 0;             // 消除非确定性暴击
  f.energy = 100;
  f._trySkill(0, o);
  ok('吸噬：施放进状态', near(f.siphonT, SKILLS.siphon.dur));
  f._startAttack(0);
  f.attack.phase = 'active';
  f._checkHit(o);
  const dealt = 100 - o.hp;
  const expect = 50 + dealt * SKILLS.siphon.heal;
  ok('吸噬：命中回血 60%', dealt > 0 && near(f.hp, expect),
    'hp ' + f.hp + ' expect ' + expect);
}

// ---- 10) 影袭：位移 + 无敌 + 下一击 ×1.5 + 命中消耗 ----
{
  const f = mkWith(['shadow', 'jam']);
  f.x = 600; f.facing = 1;
  f.energy = 100;
  f._trySkill(0, opp(), { axis: 1 });
  ok('影袭：向轴方向位移 160 + 无敌帧',
    near(f.x, 600 + SKILLS.shadow.dist) && f.iframeT >= SKILLS.shadow.iframe,
    'x ' + f.x + ' iframe ' + f.iframeT);
  ok('影袭：强化挂上', f.shadowBuff === true && near(f.effDmg(10), 10 * SKILLS.shadow.buff));
  const o = opp();
  f.x = 400; o.x = 460;
  f.mods.critChance = 0;
  f._startAttack(0);
  f.attack.phase = 'active';
  f._checkHit(o);
  ok('影袭：落地命中后强化消耗', f.shadowBuff === false && near(f.effDmg(10), 10));
}
{
  // 轴为 0 → 朝面向方向
  const f = mkWith(['shadow', 'jam']);
  f.x = 600; f.facing = -1;
  f._trySkill(0, opp(), { axis: 0 });
  ok('影袭：无轴时朝面向方向', near(f.x, 600 - SKILLS.shadow.dist), 'x ' + f.x);
}

// ---- 11) 槽位拒绝：CD / 能量 / 沉默 ----
{
  const f = mk();
  f.energy = 100;
  f._trySkill(0, opp());
  f._trySkill(0, opp());
  ok('槽0 冷却中 → deny 冷却中',
    f.events.some(e => e.type === 'deny' && e.msg === '冷却中'));
  ok('deny 0.6s 节流', f.events.filter(e => e.type === 'deny').length === 1);
}
{
  const f = mk();
  f.energy = SKILLS.gale.cost - 1;
  f._trySkill(0, opp());
  ok('槽0 能量不足 → deny 且不进 CD',
    f.events.some(e => e.type === 'deny' && e.msg === '能量不足') && f.cd.s1 === 0);
}
{
  const f = mk();
  f.silenceT = 1;
  f._trySkill(0, opp());
  ok('沉默 → deny 被沉默', f.events.some(e => e.type === 'deny' && e.msg === '被沉默'));
}

// ---- 12) slotReady / pickSlot ----
{
  const f = mk();
  f.energy = 100;
  ok('slotReady：默认槽0 就绪', slotReady(f, 100, 0) === true);
  f.cd.s1 = 3;
  ok('slotReady：CD 中 false', slotReady(f, 100, 0) === false);
  const fu = mkWith(['upper', 'gale']);
  fu.energy = 100;
  ok('slotReady：破空超距 false', slotReady(fu, SKILLS.upper.range + 10, 0) === false);
  ok('slotReady：破空近距离 true', slotReady(fu, 50, 0) === true);
}
{
  const f = mk();
  f.energy = 100;
  ok('pickSlot：默认返回 0', pickSlot(f, 100) === 0);
  f.cd.s1 = 3;
  ok('pickSlot：槽0 冷却 → 槽1', pickSlot(f, 100) === 1);
  f.cd.s2 = 3;
  ok('pickSlot：全冷却 → -1', pickSlot(f, 100) === -1);
  const t = mkWith(['gale', 'bulwark']);
  t.energy = 100;
  t.hp = Math.floor(t.hpMax * 0.4) - 1;
  ok('pickSlot：残血优先防御槽', pickSlot(t, 100) === 1);
  const s = mk();
  s.silenceT = 1;
  ok('pickSlot：沉默 → -1', pickSlot(s, 100) === -1);
}

// ---- 13) AI 按装配施法（独立掷骰 → 's1'）----
{
  const ROOKIE = { reaction: 0.45, block: 0.25, parry: 0, aggro: 0.4, skill: 0.3, mistake: 0.3, combo: 0.35, dashAway: 0.2, punish: 0.3, hop: 0 };
  const me = mk();
  const foe = opp();
  me.energy = 100;
  const brain = new AIBrain(me, foe, ROOKIE);
  const orig = Math.random;
  const vals = [0.5, 0.1];           // 失误骰过；pickSlot 内无随机
  Math.random = () => (vals.length ? vals.shift() : 0.9);
  try { brain._think(200, 1, 96); } finally { Math.random = orig; }
  ok('AI 施法 → cast + skill=s1',
    brain.plan && brain.plan.type === 'cast' && brain.plan.skill === 's1',
    JSON.stringify(brain.plan));
}
{
  // 残血 AI 走防御槽
  const ROOKIE = { reaction: 0.45, block: 0.25, parry: 0, aggro: 0.4, skill: 0.9, mistake: 0.3, combo: 0.35, dashAway: 0.2, punish: 0.3, hop: 0 };
  const me = mkWith(['gale', 'bulwark']);
  me.energy = 100;
  me.hp = Math.floor(me.hpMax * 0.4) - 1;
  const brain = new AIBrain(me, opp(), ROOKIE);
  const orig = Math.random;
  const vals = [0.5, 0.1];
  Math.random = () => (vals.length ? vals.shift() : 0.9);
  try { brain._think(200, 1, 96); } finally { Math.random = orig; }
  ok('残血 AI 施法 → 防御槽 s2',
    brain.plan && brain.plan.type === 'cast' && brain.plan.skill === 's2',
    JSON.stringify(brain.plan));
}

// ---- 14) 输入层键位（s1/s2 队列语义在 input_test，这里只核 KEYMAP 语义）----
ok('技能均为自费型（有 cost 字段）', SKILL_IDS.every(id => typeof SKILLS[id].cost === 'number'));

done();
