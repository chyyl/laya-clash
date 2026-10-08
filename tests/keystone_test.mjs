// 天赋 / 大点 / 跳跃 / 拒绝反馈 / AI 回归（原 Temp 版被清理，按现行 API 重建于仓库内）
// 断言口径：derive 公式与 constants 数值的直接推导；技能栈已迁移至槽位制（s1/s2）。
import { ok, near, done } from './harness.mjs';

const ROOT = new URL('../js/', import.meta.url).href;
const { derive, emptyBuild, presetBuild, usedPoints } = await import(ROOT + 'data/talents.js');
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
const mk = (stats = {}, ks = []) => mkWith(null, stats, ks);
const opp = () => mkWith(null, {}, []);
const INT = { axis: 0, actions: [], block: false };
const HIT = (attacker, dmg, extra = {}) => ({
  dmg, guard: 0, kb: 100, knockdown: false,
  attacker, kind: 'light', unblockable: false, source: attacker, ...extra,
});

// ---- 点数 → 系数 ----
ok('hp 点数→血上限 124', mk({ hp: 3 }).hpMax === 124);
ok('guard 点数→格挡 145', mk({ guard: 3 }).guardMax === 145);
ok('energyMax 点数→能量 124', mk({ energyMax: 3 }).energyMax === 124);
ok('energyRegen 点数→回能 ×1.36', near(mk({ energyRegen: 3 }).mods.energyRegenMul, 1.36));
ok('dmg 点数→effDmg ×1.12', near(mk({ dmg: 3 }).effDmg(10), 11.2));
ok('atkspd 点数→攻速 ×1.18', near(mk({ atkspd: 3 }).mods.atkSpdMul, 1.18));
ok('crit 点数→暴击率 0.20', near(mk({ crit: 3 }).mods.critChance, 0.2));
ok('move 点数→移速 ×1.15', near(mk({ move: 3 }).mods.moveMul, 1.15));
ok('dash 点数→冲刺CD ×0.55', near(mk({ dash: 3 }).mods.dashCdMul, 0.55));
ok('iframe 点数→无敌帧 +0.12', near(mk({ iframe: 3 }).mods.iframeAdd, 0.12));
ok('lifesteal 点数→系数 0.06', near(mk({ lifesteal: 3 }).mods.lifesteal, 0.06));
ok('skillcd 点数→技能CD ×0.76（s1Max 4.56）', near(mk({ skillcd: 3 }).snapshot().s1Max, 4.56));

// ---- 大点 gating ----
{
  const f = mk({}, ['exec']);
  f.targetVulnerable = true;
  ok('exec 大点→对硬直 ×1.4', near(f.effDmg(10, { exec: true }), 14));
  const g = mk({}, []);
  g.targetVulnerable = true;
  ok('exec 未持有→不 ×1.4', near(g.effDmg(10, { exec: true }), 10));
}
{
  const f = mk({}, ['iron']);
  f.hp = 20;
  const r = f.takeHit(HIT(opp(), 20));
  ok('iron 大点→低血减伤 20 变 16', near(r.dealt, 16), 'dealt ' + r.dealt);
  const g = mk({}, []);
  g.hp = 20;
  const r2 = g.takeHit(HIT(opp(), 20));
  ok('iron 未持有→20 原样', near(r2.dealt, 20));
}
{
  const f = mk({}, ['chase']);
  f.chaseT = 2;
  ok('chase 大点→移速 ×1.25', near(f.chaseMul, 1.25));
  const base = mk({ atkspd: 0 });
  base._tryLight();
  const w0 = base.attack.data.windup;
  f._tryLight();
  ok('chase 大点→攻速 +25%（起手 0.064）', near(f.attack.data.windup, w0 / 1.25, 1e-3));
  const g = mk({}, []);
  const og = opp();
  g.x = 400; og.x = 460; g.parryBuffT = 1; g.mods.critChance = 0;   // 弹反强化强制暴击
  g._startAttack(0); g.attack.phase = 'active';
  g._checkHit(og);
  const h = mk({}, ['chase']);
  const oh = opp();
  h.x = 400; oh.x = 460; h.parryBuffT = 1; h.mods.critChance = 0;
  h._startAttack(0); h.attack.phase = 'active';
  h._checkHit(oh);
  ok('chase：持有者暴击→追击挂上', h.chaseT > 0, 'chaseT ' + h.chaseT);
  ok('chase：未持有→暴击不挂追击', g.chaseT === 0, 'chaseT ' + g.chaseT);
}
{
  // 疾风余威：施放挂标记 → 结束冲击波 → 消费复位
  const f = mk({}, ['galeecho']);
  const o = opp();
  f.x = 400; o.x = 500;
  f._trySkill(0, o);
  ok('galeecho→施放时挂标记', f.galeT > 0 && f.galeEcho === true);
  f.update(3.1, o, INT);
  ok('galeecho→疾风结束冲击波', f.events.some(e => e.type === 'shock') && f.galeEcho === false);
  ok('galeecho→冲击波 10 伤', near(o.hp, 90), 'hp ' + o.hp);
  const ev = f.events.find(e => e.type === 'shock');
  ok('galeecho→波内判定 connected', ev && ev.connected === true);
  const n = mk({}, []);
  const o2 = opp();
  n.x = 400; o2.x = 500;
  n._trySkill(0, o2);
  n.update(3.1, o2, INT);
  ok('未持有 galeecho→无冲击波', !n.events.some(e => e.type === 'shock') && near(o2.hp, 100));
}
{
  const f = mk({}, ['jamoverload']);
  const o = opp();
  f.x = 400; o.x = 520;
  f._trySkill(1, o);
  ok('jamoverload→干扰命中挂增伤', f.overloadT > 0);
  ok('jamoverload→effDmg ×1.3', near(f.effDmg(10), 13));
}
{
  const f = mk({}, ['parrymaster']);
  const a = opp();
  f.state = 'block'; f.parryT = 0.1;
  f.takeHit(HIT(a, 10, { guard: 10 }));
  ok('parrymaster→弹反后下一击强化', f.parryBuffT > 0 && near(f.effDmg(10), 15));
  const g = mk({}, []);
  const a2 = opp();
  g.state = 'block'; g.parryT = 0.1;
  g.takeHit(HIT(a2, 10, { guard: 10 }));
  ok('未持有 parrymaster→不强化', g.parryBuffT === 0 && near(g.effDmg(10), 10));
}

// ---- 疾风增伤（v2 池：1.35）----
ok('疾风 gale→effDmg ×1.35', near(mk().effDmg(10, { gale: true }), 13.5));

// ---- 反制跳跃无赖：跳跃耗能 ----
{
  const f = mk();
  f.energy = 10;
  f._tryJump();
  ok('jump 能量不足→拒跳且不进CD', f.y === 0 && f.cd.jump === 0, 'y ' + f.y);
  ok('jump 拒绝→deny 事件带原因', f.events.some(e => e.type === 'deny' && e.msg === '能量不足'));
  const g = mk();
  g.energy = 100;
  g._tryJump();
  ok('jump 能量足够→起跳并扣 15', g.y > 0 && near(g.energy, 85), 'e ' + g.energy);
}

// ---- 动作拒绝反馈 ----
{
  const f = mk();
  f._trySkill(0, opp());
  const cd0 = f.cd.s1, e0 = f.energy;
  f._trySkill(0, opp());
  ok('槽0 冷却中→拒绝且状态不变', f.cd.s1 === cd0 && f.energy === e0
    && f.events.some(e => e.type === 'deny' && e.msg === '冷却中'));
  ok('deny 0.6s 节流（连续两次只报一次）', f.events.filter(e => e.type === 'deny').length === 1);
  f.denyT = 0;
  f.silenceT = 1;
  f._trySkill(0, opp());
  ok('槽0 被沉默→拒绝+原因', f.events.some(e => e.type === 'deny' && e.msg === '被沉默'));
}
{
  const aiF = mkWith(null, {}, []);
  aiF.isPlayer = false;
  aiF.cd.s1 = 3;
  aiF._trySkill(0, opp());
  ok('AI 动作被拒→静默', !aiF.events.some(e => e.type === 'deny'));
}

// ---- 大点：落地震 ----
{
  const f = mk({}, ['quake']);
  const o = opp();
  f.x = 0; o.x = 100;
  f.y = 5; f.vy = -400;
  f.update(1 / 60, o, INT);
  ok('quake→落地触发事件', f.events.some(e => e.type === 'quake'));
  ok('quake→范围内 6 伤', near(o.hp, 94), 'hp ' + o.hp);
}
{
  const f = mk({}, []);
  const o = opp();
  f.x = 0; o.x = 100;
  f.y = 5; f.vy = -400;
  f.update(1 / 60, o, INT);
  ok('未持有 quake→无震击', near(o.hp, 100), 'hp ' + o.hp);
}

// ---- 大点：开局压制 ----
{
  const f = mk({}, ['opening']);
  f.targetFull = true;
  ok('opening→满血敌 ×1.25', near(f.effDmg(10), 12.5), 'got ' + f.effDmg(10));
  f.targetFull = false;
  ok('opening→非满血不加成', near(f.effDmg(10), 10));
  const n = mk({}, []);
  n.targetFull = true;
  ok('未持有 opening→满血也不加成', near(n.effDmg(10), 10));
}

// ---- 预设合法性 ----
for (const id of ['balanced', 'glass', 'tank', 'skirm', 'drain', 'berserk']) {
  const b = presetBuild(id);
  const used = usedPoints(b);
  const m = derive(b);
  ok('预设 ' + id + ' 合法(15点/2大点/有限系数)',
    used === 15 && b.ks.length === 2 && Number.isFinite(m.dmgMul) && Number.isFinite(m.skillCdMul),
    'used ' + used);
}

// ---- AI：独立掷骰后会施法（槽位制 's1'）----
const ROOKIE = { reaction: 0.45, block: 0.25, parry: 0, aggro: 0.4, skill: 0.3, mistake: 0.3, combo: 0.35, dashAway: 0.2, punish: 0.3, hop: 0 };
{
  const brain = new AIBrain(mk(), opp(), ROOKIE);
  const orig = Math.random;
  const vals = [0.5, 0.1];               // 失误掷骰 0.5（过）；pickSlot 内无随机
  Math.random = () => (vals.length ? vals.shift() : 0.9);
  try { brain._think(200, 1, 96); } finally { Math.random = orig; }
  ok('rookie AI 施法→cast 且技能名 s1', brain.plan.type === 'cast' && brain.plan.skill === 's1',
    JSON.stringify(brain.plan));
}

// ---- AI 反制贴地跳 ----
{
  const foe = opp(), me = mk();
  const brain = new AIBrain(me, foe, { ...ROOKIE, combo: 0.9 });
  me.x = 0; foe.x = 80; foe.y = 50;
  brain.plan = { type: 'attack', t: 0.5 };
  const orig = Math.random;
  Math.random = () => 0.01;
  let intent;
  try { intent = brain.update(1 / 60); } finally { Math.random = orig; }
  ok('AI 对贴地跳出手', intent.actions.includes('light') || intent.actions.includes('heavy'),
    JSON.stringify(intent.actions));
}
{
  const foe = opp(), me = mk();
  const brain = new AIBrain(me, foe, { ...ROOKIE, combo: 0.9 });
  me.x = 0; foe.x = 80; foe.y = 70;
  brain.plan = { type: 'attack', t: 0.5 };
  const orig = Math.random;
  Math.random = () => 0.01;
  let intent;
  try { intent = brain.update(1 / 60); } finally { Math.random = orig; }
  ok('AI 对跳过头顶的收手', intent.actions.length === 0, JSON.stringify(intent.actions));
}

done();
