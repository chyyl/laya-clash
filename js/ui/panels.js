import { DEFAULT_SETTINGS, load, save, clearAll } from '../core/storage.js';
import { DIFFICULTIES, DIFF_ORDER } from '../data/aiBuilds.js';

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULT_SETTINGS, ...load('settings', {}) };
let onApply = null;

// ---------------- 设置 ----------------
export function getSettings() { return settings; }

export function initSettings({ apply }) {
  onApply = apply;
  const bindSlider = (key, labelId) => {
    const input = $('set-' + key);
    const label = $(labelId);
    input.value = settings[key];
    label.textContent = settings[key];
    input.style.setProperty('--fill', settings[key] + '%');
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      label.textContent = settings[key];
      input.style.setProperty('--fill', settings[key] + '%');
      persist();
    });
  };
  bindSlider('music', 'set-music-v');
  bindSlider('sfx', 'set-sfx-v');

  for (const group of ['shake', 'particles', 'touch', 'hints']) {
    const seg = $('set-' + group);
    const paint = () => seg.querySelectorAll('button').forEach(b =>
      b.classList.toggle('on', b.dataset.v === settings[group]));
    paint();
    seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      settings[group] = b.dataset.v;
      paint();
      persist();
    }));
  }

  $('set-reset').addEventListener('click', () => {
    if (confirm('确定清空全部战绩、天赋与设置吗？此操作不可恢复。')) {
      clearAll();
      location.reload();
    }
  });
}

function persist() {
  save('settings', settings);
  if (onApply) onApply(settings);
}

// ---------------- 战绩 ----------------
export function renderRecords() {
  const base = load('records', null) || {
    matches: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, bestCombo: 0,
    perDiff: { rookie: { w: 0, l: 0 }, adept: { w: 0, l: 0 }, master: { w: 0, l: 0 } },
  };
  const r = base;
  const per = r.perDiff || {};
  const touched = DIFF_ORDER.filter(id => {
    const p = per[id] || { w: 0, l: 0 };
    return p.w + p.l > 0;
  }).length;

  const winRate = r.matches ? Math.round(r.wins / r.matches * 100) : 0;
  const cells = [
    ['总场次', r.matches, ''],
    ['胜场', r.wins, ''],
    ['负场', r.losses, ''],
    ['胜率', winRate + '%', ''],
    ['当前连胜', r.streak, 'gold'],
    ['最高连胜', r.bestStreak, 'gold'],
    ['最高连击', r.bestCombo, ''],
    ['交手难度', `${touched}/3`, ''],
  ];

  const rows = DIFF_ORDER.map(id => {
    const d = DIFFICULTIES[id];
    const p = per[id] || { w: 0, l: 0 };
    const t = p.w + p.l;
    const wr = t ? Math.round(p.w / t * 100) : 0;
    return `<tr><td>${d.tier} · ${d.name}</td><td>${t}</td><td class="win">${p.w}</td><td>${p.l}</td><td>${wr}%</td></tr>`;
  }).join('');

  $('records-body').innerHTML = `
    <div class="rec-grid">
      ${cells.map(([k, v, c]) => `<div class="rec-cell ${c}"><b>${v}</b><span>${k}</span></div>`).join('')}
    </div>
    <table class="rec-table">
      <thead><tr><th>难度</th><th>场次</th><th>胜</th><th>负</th><th>胜率</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="rec-note">战绩保存在本机浏览器，清除浏览器数据会一并清空</div>`;
}

// ---------------- 教程 ----------------
const PAGES = [
  {
    title: '目标与操作（键盘）',
    html: `
      <p>把对手的生命打到 0 即可获胜。你与对手会自动面对面，专注距离与时机的博弈。</p>
      <div class="tut-grid">
        <div class="tut-cell"><b>移动</b><span><kbd>A</kbd><kbd>D</kbd> 走位，<kbd>W</kbd> 起跳躲招（耗 15 能量，空中跳过地面攻击）</span></div>
        <div class="tut-cell"><b>轻击</b><span><kbd>J</kbd>（或鼠标左键），快速三段连招</span></div>
        <div class="tut-cell"><b>重击</b><span><kbd>K</kbd>，高伤害、破防、击倒，但起手慢</span></div>
        <div class="tut-cell"><b>格挡</b><span>按住 <kbd>L</kbd> 减伤；按下瞬间 0.15 秒内是完美弹反</span></div>
        <div class="tut-cell"><b>冲刺</b><span><kbd>Space</kbd>，短暂无敌帧，耗 12 能量，可取消收招</span></div>
        <div class="tut-cell"><b>技能</b><span><kbd>Q</kbd>/<kbd>E</kbd> 两个装配槽，耗能量且有冷却</span></div>
      </div>`,
  },
  {
    title: '触屏操作（手机 / 平板）',
    html: `
      <ul>
        <li>屏幕左半区按住拖动：动态摇杆控制走位，松手即停。</li>
        <li>右下按钮组：<b>拳</b> 轻击连招 · <b>重</b> 重击 · <b>防</b> 按住格挡、点按弹反 · <b>跳</b> 起跳躲招。</li>
        <li><b>冲</b> 冲刺带无敌帧；两枚技能按钮带冷却与能耗显示。</li>
        <li>横屏体验更佳；可在设置里调整触屏按钮的显示方式。</li>
      </ul>
      <p>提示：角色自动面向对手，触屏无需瞄准，专注走位与出招时机。</p>`,
  },
  {
    title: '战斗机制',
    html: `
      <div class="tut-grid">
        <div class="tut-cell"><b>连招</b><span>轻击命中后 0.55 秒内再按，进入下一段；第三段带击退</span></div>
        <div class="tut-cell"><b>弹反</b><span>攻击贴身的瞬间按下格挡：对手硬直 0.8 秒，免费连一套</span></div>
        <div class="tut-cell"><b>破防</b><span>格挡消耗格挡值，重击削减极快；归零后硬直 1 秒</span></div>
        <div class="tut-cell"><b>闪避</b><span>冲刺前 0.13 秒无敌；<kbd>W</kbd> 起跳可整段跨过地面攻击</span></div>
        <div class="tut-cell"><b>倒地</b><span>被重击会击倒，起身自带 0.25 秒无敌，别急着压起身</span></div>
        <div class="tut-cell"><b>贪刀惩罚</b><span>收招硬直是最危险的空隙，命中就走或准备接弹反</span></div>
      </div>`,
  },
  {
    title: '技能与天赋',
    html: `
      <ul>
        <li><b>技能池 6 选 2</b>：在天赋页装配到 Q/E —— 疾风(输出)、干扰(控场)、破空(对空)、壁垒(防御)、吸噬(续航)、影袭(位移)。</li>
        <li>槽位即键位（Q=槽一、E=槽二）；对手 AI 按预设流派携带各自技能。</li>
        <li><b>天赋</b>：15 点数分入攻击 / 生存 / 机动 / 能量四系，再选 2 个关键大点。</li>
        <li>局前随时可改，打不过就换一套；四个快速方案可一键装配。</li>
        <li>对手也在轮换不同的流派装配——同屏力拼，输赢全看操作。</li>
      </ul>`,
  },
];

let page = 0;

export function openTutorial() {
  page = 0;
  paintTutorial();
}

function paintTutorial() {
  const p = PAGES[page];
  $('tut-body').innerHTML = `<h3>${p.title}</h3>${p.html}`;
  $('tut-page-label').textContent = `${page + 1}/${PAGES.length}`;
  $('tut-dots').innerHTML = PAGES.map((_, i) => `<span class="tut-dot${i === page ? ' on' : ''}"></span>`).join('');
  $('tut-prev').disabled = page === 0;
  $('tut-next').textContent = page === PAGES.length - 1 ? '完成' : '下一页 →';
}

export function initTutorial({ onDone }) {
  $('tut-prev').addEventListener('click', () => { if (page > 0) { page--; paintTutorial(); } });
  $('tut-next').addEventListener('click', () => {
    if (page < PAGES.length - 1) { page++; paintTutorial(); }
    else if (onDone) onDone();
  });
}
