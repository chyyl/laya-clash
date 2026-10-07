// 战斗数值单一来源：改平衡只动这里
export const ARENA = { W: 1280, H: 720, GROUND: 606, LEFT: 100, RIGHT: 1180 };

export const BASE = {
  hp: 100,
  moveSpeed: 255,
  bodyR: 30,

  energyMax: 100,
  energyRegen: 12,          // /秒
  guardMax: 100,
  guardRegen: 34,           // /秒（停止格挡 delay 后）
  guardDelay: 0.9,

  // 三段轻击连招
  light: [
    { windup: 0.08, active: 0.06, rec: 0.14, dmg: 6, reach: 76,  lunge: 120, guard: 14 },
    { windup: 0.08, active: 0.06, rec: 0.14, dmg: 6, reach: 78,  lunge: 120, guard: 14 },
    { windup: 0.10, active: 0.08, rec: 0.30, dmg: 10, reach: 86, lunge: 150, guard: 18, kb: 260 },
  ],
  comboWindow: 0.55,        // 连招衔接窗口（收招后）
  comboReset: 1.2,          // HUD 连击数重置

  heavy: { windup: 0.30, active: 0.10, rec: 0.42, dmg: 16, reach: 98, lunge: 90, guard: 55, knockdown: true },

  blockReduce: 0.78,        // 格挡减伤
  parryWindow: 0.15,        // 按下格挡后的完美格挡窗口
  blockSpeed: 0.45,         // 格挡中移速系数

  dash: { dur: 0.18, speed: 820, iframe: 0.13, cost: 12, cd: 0.55 },

  hitstunL: 0.22,
  hitstunH: 0.45,
  knockdown: { down: 0.75, getup: 0.35, invuln: 0.25 },
  stagger: 1.05,            // 破防硬直
  parriedStagger: 0.80,     // 被弹反硬直

  gale: { cost: 40, cd: 6, dur: 3.0, dmgMul: 1.25 },   // 疾风：攻击无视格挡+增伤
  jam:  { cost: 35, cd: 8, range: 250, dmg: 9, kb: 430, guard: 45, silence: 1.5 }, // 干扰：击退+技能封锁

  crit: { mult: 1.6, baseChance: 0.05 },

  introTime: 1.9,           // READY/FIGHT 播报时长
  koSlowmo: 0.25,           // KO 时的时间倍率
  koHold: 1.6,              // KO 慢镜头持续
};

// 天赋修正的默认值（未加点时）
export const DEFAULT_MODS = {
  dmgMul: 1, atkSpdMul: 1, critChance: BASE.crit.baseChance,
  hpMul: 1, guardMul: 1, lifesteal: 0,
  moveMul: 1, dashCdMul: 1, iframeAdd: 0,
  energyMaxAdd: 0, energyRegenMul: 1, skillCdMul: 1,
};
