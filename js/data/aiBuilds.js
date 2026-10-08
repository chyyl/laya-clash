import { presetBuild } from './talents.js';

// AI 预设流派（复用玩家的天赋体系，保证公平感）
const BUILD_NAMES = {
  balanced: '均衡流', glass: '猛攻流', tank: '铁壁流', skirm: '灵动流',
  drain: '蚀骨流', berserk: '狂战流',
};

export function aiBuild(presetId) {
  return { id: presetId, name: BUILD_NAMES[presetId], build: presetBuild(presetId) };
}

// 按场次轮换流派：同一个难度也会换装配
export function rotateBuild(diffId, rotation) {
  const list = DIFFICULTIES[diffId].builds;
  return aiBuild(list[rotation % list.length]);
}

export const DIFFICULTIES = {
  rookie: {
    id: 'rookie', tier: 'T1', name: '新手挑战者',
    desc: '反应迟缓、常露破绽，用来熟悉连招与弹反。',
    builds: ['balanced', 'tank', 'drain'],
    ai: { reaction: 0.45, block: 0.25, parry: 0.00, aggro: 0.40, skill: 0.30, mistake: 0.30, combo: 0.35, dashAway: 0.20, punish: 0.30, hop: 0.00 },
  },
  adept: {
    id: 'adept', tier: 'T2', name: '老手斗士',
    desc: '会格挡、会反击，抓得住你贪刀的空隙。',
    builds: ['glass', 'skirm', 'berserk', 'drain'],
    ai: { reaction: 0.25, block: 0.55, parry: 0.08, aggro: 0.60, skill: 0.60, mistake: 0.12, combo: 0.65, dashAway: 0.50, punish: 0.65, hop: 0.18 },
  },
  master: {
    id: 'master', tier: 'T3', name: '宗师魔王',
    desc: '弹反精准、技能掐点，硬碰硬很难占便宜。',
    builds: ['glass', 'skirm', 'berserk', 'drain', 'balanced'],
    ai: { reaction: 0.12, block: 0.75, parry: 0.22, aggro: 0.78, skill: 0.90, mistake: 0.03, combo: 0.90, dashAway: 0.75, punish: 0.90, hop: 0.35 },
  },
};

export const DIFF_ORDER = ['rookie', 'adept', 'master'];
