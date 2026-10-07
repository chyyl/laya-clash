// 天赋系统：15 固定点数分入四系 + 2 个关键大点；局前随时改，全部本机保存
export const POOL = 15;
export const KS_MAX = 2;

export const BRANCHES = [
  {
    id: 'atk', name: '攻击', color: '#ff5f6d',
    stats: [
      { id: 'dmg',      name: '伤害',   per: 0.04, max: 3, fmt: n => `+${n * 4}% 伤害` },
      { id: 'atkspd',   name: '攻速',   per: 0.06, max: 3, fmt: n => `+${n * 6}% 出招速度` },
      { id: 'crit',     name: '暴击',   per: 0.05, max: 3, fmt: n => `${5 + n * 5}% 暴击率` },
    ],
  },
  {
    id: 'def', name: '生存', color: '#59f2a5',
    stats: [
      { id: 'hp',        name: '生命',   per: 0.08, max: 3, fmt: n => `+${n * 8}% 生命上限` },
      { id: 'guard',     name: '格挡',   per: 0.15, max: 3, fmt: n => `+${n * 15}% 格挡值` },
      { id: 'lifesteal', name: '吸血',   per: 0.02, max: 3, fmt: n => `造成伤害的 ${n * 2}% 回血` },
    ],
  },
  {
    id: 'mob', name: '机动', color: '#3df2ff',
    stats: [
      { id: 'move',    name: '移速',   per: 0.05, max: 3, fmt: n => `+${n * 5}% 移动速度` },
      { id: 'dash',    name: '冲刺',   per: 0.15, max: 3, fmt: n => `-${n * 15}% 冲刺冷却` },
      { id: 'iframe',  name: '闪避',   per: 0.04, max: 3, fmt: n => `冲刺无敌帧 +${(n * 0.04).toFixed(2)}s` },
    ],
  },
  {
    id: 'nrg', name: '能量', color: '#ffd23f',
    stats: [
      { id: 'energyMax',   name: '能量上限', per: 8,   max: 3, fmt: n => `+${n * 8} 能量上限` },
      { id: 'energyRegen', name: '能量回复', per: 0.12, max: 3, fmt: n => `+${n * 12}% 回能速度` },
      { id: 'skillcd',     name: '技能冷却', per: 0.08, max: 3, fmt: n => `-${n * 8}% 技能冷却` },
    ],
  },
];

export const KEYSTONES = [
  { id: 'chase',        name: '追击',     desc: '暴击后 2 秒内移速与攻速 +25%' },
  { id: 'parrymaster',  name: '弹反大师', desc: '完美格挡后 2 秒内下一击必定暴击且伤害 +50%' },
  { id: 'galeecho',     name: '疾风余威', desc: '疾风结束时爆发冲击波：10 伤害并击退' },
  { id: 'jamoverload',  name: '干扰过载', desc: '干扰命中后 3 秒内你的伤害 +30%' },
  { id: 'iron',         name: '铁血',     desc: '生命低于 30% 时，受到的伤害 -20%' },
  { id: 'exec',         name: '抢攻',     desc: '对硬直、倒地或被击退中的敌人伤害 +40%' },
];

export const PRESETS = [
  { id: 'balanced', name: '均衡',     stats: { dmg: 3, atkspd: 1, crit: 2, hp: 2, guard: 1, lifesteal: 0, move: 2, dash: 1, iframe: 0, energyMax: 1, energyRegen: 1, skillcd: 1 }, ks: ['chase', 'iron'] },
  { id: 'glass',    name: '玻璃大炮', stats: { dmg: 3, atkspd: 3, crit: 3, hp: 0, guard: 0, lifesteal: 1, move: 2, dash: 1, iframe: 0, energyMax: 0, energyRegen: 1, skillcd: 1 }, ks: ['chase', 'exec'] },
  { id: 'tank',     name: '铁壁',     stats: { dmg: 2, atkspd: 0, crit: 0, hp: 3, guard: 3, lifesteal: 2, move: 1, dash: 0, iframe: 0, energyMax: 1, energyRegen: 1, skillcd: 2 }, ks: ['iron', 'parrymaster'] },
  { id: 'skirm',    name: '灵动',     stats: { dmg: 2, atkspd: 1, crit: 2, hp: 0, guard: 0, lifesteal: 0, move: 3, dash: 3, iframe: 2, energyMax: 0, energyRegen: 2, skillcd: 2 }, ks: ['chase', 'galeecho'] },
];

export function emptyBuild() {
  const stats = {};
  BRANCHES.forEach(b => b.stats.forEach(s => { stats[s.id] = 0; }));
  return { stats, ks: [] };
}

export function usedPoints(build) {
  return Object.values(build.stats).reduce((a, b) => a + (b | 0), 0);
}

// build → 战斗修正系数（引擎只认这个结果，不认识天赋）
export function derive(build) {
  const s = build.stats;
  return {
    dmgMul: 1 + 0.04 * s.dmg,
    atkSpdMul: 1 + 0.06 * s.atkspd,
    critChance: 0.05 + 0.05 * s.crit,
    hpMul: 1 + 0.08 * s.hp,
    guardMul: 1 + 0.15 * s.guard,
    lifesteal: 0.02 * s.lifesteal,
    moveMul: 1 + 0.05 * s.move,
    dashCdMul: Math.max(0.3, 1 - 0.15 * s.dash),
    iframeAdd: 0.04 * s.iframe,
    energyMaxAdd: 8 * s.energyMax,
    energyRegenMul: 1 + 0.12 * s.energyRegen,
    skillCdMul: Math.max(0.3, 1 - 0.08 * s.skillcd),
    ks: new Set(build.ks),
  };
}

export function presetBuild(id) {
  const p = PRESETS.find(x => x.id === id) || PRESETS[0];
  const b = emptyBuild();
  Object.assign(b.stats, p.stats);
  b.ks = p.ks.slice();
  return b;
}
