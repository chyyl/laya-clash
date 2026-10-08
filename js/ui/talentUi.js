import {
  BRANCHES, KEYSTONES, PRESETS, POOL, KS_MAX,
  emptyBuild, usedPoints, derive, presetBuild,
} from '../data/talents.js';
import { SKILLS, SKILL_IDS, SKILL_KEYS, normalizeLoadout } from '../data/skills.js';
import { load, save } from '../core/storage.js';

let draft = null;
let loadout = null;                    // 技能装配：[槽0(Q), 槽1(E)]
let activeSlot = 0;                    // 装配面板当前选中的槽
let onSaved = null;
const $ = (id) => document.getElementById(id);

export function currentBuild() {
  if (!draft) draft = load('talent', null) || presetBuild('balanced');
  return draft;
}

export function currentLoadout() {
  if (!loadout) loadout = normalizeLoadout(load('loadout', null));
  return loadout;
}

export function initTalent({ saved }) {
  onSaved = saved;
  draft = load('talent', null) || presetBuild('balanced');
  loadout = normalizeLoadout(load('loadout', null));
  $('talent-save').addEventListener('click', () => {
    save('talent', draft);
    if (onSaved) onSaved(draft);
    const btn = $('talent-save');
    btn.textContent = '已保存';
    setTimeout(() => { btn.textContent = '保存装配'; }, 900);
  });
  $('talent-reset').addEventListener('click', () => {
    draft = emptyBuild();
    render();
  });
  render();
}

function addStat(id, delta) {
  const stat = BRANCHES.flatMap(b => b.stats).find(s => s.id === id);
  const cur = draft.stats[id] || 0;
  if (delta > 0 && (usedPoints(draft) >= POOL || cur >= stat.max)) return;
  if (delta < 0 && cur <= 0) return;
  draft.stats[id] = cur + delta;
  render();
}

function toggleKs(id) {
  const i = draft.ks.indexOf(id);
  if (i >= 0) draft.ks.splice(i, 1);
  else if (draft.ks.length < KS_MAX) draft.ks.push(id);
  render();
}

function render() {
  const used = usedPoints(draft);
  $('talent-pool').textContent = POOL - used;
  $('keystone-count').textContent = `${draft.ks.length}/${KS_MAX}`;

  // 四系
  const wrap = $('talent-branches');
  wrap.innerHTML = '';
  for (const b of BRANCHES) {
    const pts = b.stats.reduce((a, s) => a + (draft.stats[s.id] || 0), 0);
    const div = document.createElement('div');
    div.className = 'branch';
    div.style.setProperty('--bc', b.color);
    div.innerHTML = `<h3>${b.name}<span class="branch-pts">${pts}/${b.stats.reduce((a, s) => a + s.max, 0)}</span></h3>`;
    for (const s of b.stats) {
      const n = draft.stats[s.id] || 0;
      const line = document.createElement('div');
      line.className = 'stat-line';
      const pips = Array.from({ length: s.max }, (_, i) =>
        `<span class="pip${i < n ? ' on' : ''}"></span>`).join('');
      line.innerHTML = `
        <div class="stat-info">
          <div class="stat-name">${s.name}</div>
          <div class="stat-desc">${n > 0 ? s.fmt(n) : '未投入 · 每点 ' + s.fmt(1)}</div>
        </div>
        <div class="stepper">
          <button class="step-btn" data-stat="${s.id}" data-d="-1" ${n <= 0 ? 'disabled' : ''}>&minus;</button>
          <div class="pips">${pips}</div>
          <button class="step-btn" data-stat="${s.id}" data-d="1" ${n >= s.max || used >= POOL ? 'disabled' : ''}>+</button>
        </div>`;
      div.appendChild(line);
    }
    wrap.appendChild(div);
  }
  wrap.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => addStat(btn.dataset.stat, Number(btn.dataset.d)));
  });

  // 关键大点
  const ksWrap = $('keystone-list');
  ksWrap.innerHTML = '';
  for (const k of KEYSTONES) {
    const on = draft.ks.includes(k.id);
    const locked = !on && draft.ks.length >= KS_MAX;
    const btn = document.createElement('button');
    btn.className = 'keystone' + (on ? ' on' : '') + (locked ? ' locked' : '');
    btn.innerHTML = `<div class="ks-name">${k.name}</div><div class="ks-desc">${k.desc}</div>`;
    btn.addEventListener('click', () => toggleKs(k.id));
    ksWrap.appendChild(btn);
  }

  // 快速方案
  const pWrap = $('talent-presets');
  pWrap.innerHTML = '';
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = p.name;
    btn.addEventListener('click', () => { draft = presetBuild(p.id); render(); });
    pWrap.appendChild(btn);
  }

  // 技能装配：槽位（点击选中）+ 技能池（点击装备到选中槽，自动跳下一槽）
  const slotWrap = $('skill-slots');
  slotWrap.innerHTML = '';
  loadout.forEach((id, i) => {
    const sk = SKILLS[id];
    const btn = document.createElement('button');
    btn.className = 'skill-slot' + (activeSlot === i ? ' active' : '');
    btn.innerHTML = `<span class="slot-key">${SKILL_KEYS[i]}</span><b>${sk.name}</b><i>${sk.cls} · ${sk.cost} 能量 / ${sk.cd}s 冷却</i>`;
    btn.addEventListener('click', () => { activeSlot = i; render(); });
    slotWrap.appendChild(btn);
  });
  const poolWrap = $('skill-pool');
  poolWrap.innerHTML = '';
  for (const id of SKILL_IDS) {
    const sk = SKILLS[id];
    const btn = document.createElement('button');
    btn.className = 'skill-chip' + (loadout.includes(id) ? ' on' : '');
    btn.innerHTML = `<b>${sk.name}</b><span>${sk.desc}</span>`;
    btn.addEventListener('click', () => {
      const at = loadout.indexOf(id);
      if (at >= 0) { activeSlot = at; render(); return; }   // 已装备 → 选中对应槽
      loadout[activeSlot] = id;
      loadout = normalizeLoadout(loadout);                  // 去重，保证始终两项
      save('loadout', loadout);
      activeSlot = activeSlot === 0 ? 1 : 0;
      render();
    });
    poolWrap.appendChild(btn);
  }

  // 最终属性
  const m = derive(draft);
  const rows = [
    ['伤害', `+${Math.round((m.dmgMul - 1) * 100)}%`],
    ['攻速', `+${Math.round((m.atkSpdMul - 1) * 100)}%`],
    ['暴击率', `${Math.round(m.critChance * 100)}%`],
    ['生命', `+${Math.round((m.hpMul - 1) * 100)}%`],
    ['格挡值', `+${Math.round((m.guardMul - 1) * 100)}%`],
    ['吸血', `${Math.round(m.lifesteal * 100)}%`],
    ['移速', `+${Math.round((m.moveMul - 1) * 100)}%`],
    ['冲刺CD', `-${Math.round((1 - m.dashCdMul) * 100)}%`],
    ['无敌帧', `+${m.iframeAdd.toFixed(2)}s`],
    ['能量上限', `+${m.energyMaxAdd}`],
    ['回能', `+${Math.round((m.energyRegenMul - 1) * 100)}%`],
    ['技能CD', `-${Math.round((1 - m.skillCdMul) * 100)}%`],
  ];
  $('stat-preview').innerHTML = rows.map(([k, v]) =>
    `<div class="pv"><span>${k}</span><b>${v}</b></div>`).join('');
}
