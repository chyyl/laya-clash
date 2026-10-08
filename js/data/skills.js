// 技能池：6 技能，赛前在天赋页装配 2 个到 Q/E 槽位（槽位定键位，不随技能变）。
// 定位：输出(疾风) / 控场(干扰) / 对空(破空) / 防御(壁垒) / 续航(吸噬) / 位移(影袭)。
// 所有技能参数集中在此（单一调参口径）；引擎只认参数，不认识"技能设计"。
export const SKILLS = {
  gale: {
    id: 'gale', name: '疾风', cls: '输出',
    desc: '3 秒内攻速 +33%、伤害 +35%',
    cost: 40, cd: 6, dur: 3,
    dmgMul: 1.35, spdBonus: 1.33,
    echo: { dmg: 10, range: 300, kb: 260, guard: 40 },   // 疾风余威大点参数
  },
  jam: {
    id: 'jam', name: '干扰', cls: '控场',
    desc: '中距冲击波：伤害 + 沉默 1.5 秒 + 击退（可格挡）',
    cost: 35, cd: 7, range: 250, dmg: 9, kb: 430, guard: 45, silence: 1.5,
  },
  upper: {
    id: 'upper', name: '破空', cls: '对空',
    desc: '上挑 12 伤害并击倒；命中滞空目标伤害翻倍',
    cost: 30, cd: 5, range: 96, dmg: 12, kb: 300,
  },
  bulwark: {
    id: 'bulwark', name: '壁垒', cls: '防御',
    desc: '5 秒内受伤 -40%，格挡不耗格挡值',
    cost: 25, cd: 8, dur: 5, reduce: 0.4,
  },
  siphon: {
    id: 'siphon', name: '吸噬', cls: '续航',
    desc: '5 秒内攻击命中回复造成伤害 60% 的生命',
    cost: 30, cd: 9, dur: 5, heal: 0.6,
  },
  shadow: {
    id: 'shadow', name: '影袭', cls: '位移',
    desc: '向前瞬移 160px + 0.25 秒无敌，下一击伤害 +50%',
    cost: 25, cd: 6, dist: 160, iframe: 0.25, buff: 1.5,
  },
};

export const SKILL_IDS = Object.keys(SKILLS);
export const DEFAULT_LOADOUT = ['gale', 'jam'];
export const SKILL_KEYS = ['Q', 'E'];

// 装配校验：两项不同且都在池内；违规项回退默认
export function normalizeLoadout(l) {
  const out = [];
  for (const id of Array.isArray(l) ? l : []) {
    if (SKILLS[id] && !out.includes(id)) out.push(id);
    if (out.length === 2) break;
  }
  while (out.length < 2) {
    out.push(DEFAULT_LOADOUT.find(id => !out.includes(id)));
  }
  return out;
}

// 槽位是否可放（冷却 / 能量 / 沉默 / 目标距离自检）——AI 与手动同口径
export function slotReady(me, dist, slot) {
  const id = (me.mods.skills || DEFAULT_LOADOUT)[slot];
  if (!id) return false;
  const sk = SKILLS[id];
  if (me.cd['s' + (slot + 1)] > 0 || me.silenceT > 0) return false;
  if (me.energy < sk.cost) return false;
  if ((id === 'jam' || id === 'upper') && dist > sk.range) return false;
  return true;
}

// AI 选槽：残血优先防御/续航，其余优先 Q 槽；无可放返回 -1
export function pickSlot(me, dist) {
  const ids = me.mods.skills || DEFAULT_LOADOUT;
  const ready = [0, 1].filter(s => slotReady(me, dist, s));
  if (!ready.length) return -1;
  if (me.hp < me.hpMax * 0.4) {
    const def = ready.find(s => ids[s] === 'bulwark' || ids[s] === 'siphon');
    if (def !== undefined) return def;
  }
  return ready[0];
}
