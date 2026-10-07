// localStorage 封装：统一命名空间 + 容错（隐私模式下也可能抛异常）
const NS = 'layaclash.';
const mem = {}; // 内存兜底

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return key in mem ? mem[key] : fallback;
  }
}

export function save(key, value) {
  mem[key] = value;
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch (e) { /* 只存内存，不打断游戏 */ }
}

export function clearAll() {
  for (const k of Object.keys(mem)) delete mem[k];
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch (e) { /* ignore */ }
}

export const DEFAULT_SETTINGS = {
  music: 60, sfx: 80,
  shake: 'on', particles: 'high',
  touch: 'auto', hints: 'on',
};

export const DEFAULT_RECORDS = {
  matches: 0, wins: 0, losses: 0,
  streak: 0, bestStreak: 0, bestCombo: 0,
  perDiff: {
    rookie: { w: 0, l: 0 },
    adept:  { w: 0, l: 0 },
    master: { w: 0, l: 0 },
  },
};
