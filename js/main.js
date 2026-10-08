import { createLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { AudioFX } from './core/audio.js';
import { load, save, DEFAULT_SETTINGS, DEFAULT_RECORDS } from './core/storage.js';
import { Battle } from './game/battle.js';
import { DIFFICULTIES, rotateBuild } from './data/aiBuilds.js';
import { PRESETS } from './data/talents.js';
import { SKILLS, normalizeLoadout } from './data/skills.js';
import { showScreen, currentScreen, initNavigation } from './ui/screens.js';
import { HUD } from './ui/hud.js';
import { initTalent, currentBuild, currentLoadout } from './ui/talentUi.js';
import { initSettings, initTutorial, openTutorial, renderRecords } from './ui/panels.js';

const $ = (id) => document.getElementById(id);
const app = $('app');

let settings = { ...DEFAULT_SETTINGS, ...load('settings', {}) };
let records = load('records', null) || JSON.parse(JSON.stringify(DEFAULT_RECORDS));
let battle = null;
let battleActive = false;
let paused = false;
let lastConfig = null;
let touchShown = false;

// ---------------- 信箱式缩放 ----------------
function resize() {
  const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  app.style.transform = `translate(-50%,-50%) scale(${s})`;
}
window.addEventListener('resize', resize);
resize();

// ---------------- 设置应用 ----------------
function isTouchDevice() {
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}
function touchEnabled() {
  return settings.touch === 'on' || (settings.touch === 'auto' && isTouchDevice());
}
function applySettings(s) {
  settings = s;
  AudioFX.setSfx(s.sfx / 100);
  AudioFX.setMusic(s.music / 100);
  document.body.classList.toggle('no-hints', s.hints === 'off');
  document.body.classList.toggle('touch-mode', touchEnabled());
  if (battle) {
    battle.fxQuality = s.particles;
    battle.fx.quality = s.particles;
    battle.fx.noShake = s.shake === 'off';
  }
  syncTouchVisibility();
}
function syncTouchVisibility() {
  const show = battleActive && touchEnabled();
  if (show !== touchShown) {
    touchShown = show;
    $('touch').classList.toggle('hidden', !show);
  }
}

// ---------------- 天赋展示名 ----------------
function buildLabel(build) {
  for (const p of PRESETS) {
    const sameStats = Object.keys(p.stats).every(k => (build.stats[k] || 0) === p.stats[k]);
    const sameKs = p.ks.slice().sort().join() === (build.ks || []).slice().sort().join();
    if (sameStats && sameKs) return p.name + '流';
  }
  return '自定义';
}

// ---------------- 对战生命周期 ----------------
function startMatch(config) {
  lastConfig = config;
  const diff = DIFFICULTIES[config.diff];
  const ai = rotateBuild(config.diff, records.matches + records.wins + records.losses);
  const pb = currentBuild();
  const lo = normalizeLoadout(currentLoadout());

  $('vs-pbuild').textContent = buildLabel(pb);
  $('vs-aname').textContent = diff.name;
  $('vs-abuild').textContent = ai.name;
  $('vs-layer').classList.remove('hidden');

  setTimeout(() => {
    $('vs-layer').classList.add('hidden');
    battle.reset({
      playerBuild: pb, playerSkills: lo, aiName: diff.name, aiBuild: ai,
      diffParams: diff, diff: config.diff,
    });
    battle.fxQuality = settings.particles;
    battle.fx.quality = settings.particles;
    battle.fx.noShake = settings.shake === 'off';
    HUD.setMatch({ pBuild: buildLabel(pb), aName: diff.name, aBuild: ai.name });
    HUD.setStreak(records.streak);
    HUD.show(true);
    battleActive = true;
    paused = false;
    showScreen('none');
    syncTouchVisibility();
    Input.reset();
    Input.setSkillLabels(lo.map(id => SKILLS[id].name));
    Input.setEnabled(false);          // intro 结束后由循环打开
  }, 1500);
}

function finishMatch(res) {
  battleActive = false;
  Input.setEnabled(false);
  HUD.show(false);
  syncTouchVisibility();

  // 记账
  records.matches++;
  if (res.win) { records.wins++; records.streak++; records.bestStreak = Math.max(records.bestStreak, records.streak); }
  else { records.losses++; records.streak = 0; }
  records.bestCombo = Math.max(records.bestCombo, res.peakCombo);
  const pd = records.perDiff[res.diff] || (records.perDiff[res.diff] = { w: 0, l: 0 });
  res.win ? pd.w++ : pd.l++;
  save('records', records);

  // 结算面板
  const stamp = $('result-stamp');
  stamp.textContent = res.win ? '胜利' : '败北';
  stamp.classList.toggle('lose', !res.win);
  $('result-sub').textContent = (res.win ? '击败 ' : '惜败于 ') + res.aiName + ' · ' + res.aiBuild;
  const mm = Math.floor(res.time / 60), ss = Math.floor(res.time % 60);
  $('rs-time').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
  $('rs-combo').textContent = res.peakCombo;
  $('rs-dmg').textContent = res.dmg;
  $('rs-streak').textContent = records.streak;
  showScreen('result');
}

function quitToMenu() {
  battleActive = false;
  paused = false;
  Input.setEnabled(false);
  HUD.show(false);
  syncTouchVisibility();
  showScreen('menu');
}

function togglePause(force) {
  if (!battleActive || !battle) return;
  const to = typeof force === 'boolean' ? force : !paused;
  if (to === paused) return;
  paused = to;
  if (paused) {
    showScreen('pause');
    Input.setEnabled(false);
    $('pause-mute').checked = AudioFX.muted;
  } else {
    showScreen('none');
    Input.setEnabled(battle.inputOn);
    $('pause-mute').checked = AudioFX.muted;
  }
}

// ---------------- 导航 ----------------
function navigate(dest) {
  AudioFX.play('click');
  if (dest === 'menu') { showScreen('menu'); return; }
  if (dest === 'diff') { showScreen('diff'); return; }
  if (dest === 'talent') { showScreen('talent'); return; }
  if (dest === 'tutorial') { showScreen('tutorial'); openTutorial(); return; }
  if (dest === 'settings') { showScreen('settings'); return; }
  if (dest === 'records') { showScreen('records'); renderRecords(); return; }
}

initNavigation((dest) => {
  if (currentScreen() === 'diff' && dest === 'menu') { navigate('menu'); return; }
  navigate(dest);
});

// 难度卡 → 开打
document.querySelectorAll('.diff-card').forEach(card => {
  card.addEventListener('click', () => {
    AudioFX.play('click');
    startMatch({ diff: card.dataset.diff });
  });
});

// 结算按钮
$('res-rematch').addEventListener('click', () => { AudioFX.play('click'); startMatch(lastConfig); });
$('res-diff').addEventListener('click', () => { AudioFX.play('click'); showScreen('diff'); });
$('res-talent').addEventListener('click', () => { AudioFX.play('click'); showScreen('talent'); });
$('res-menu').addEventListener('click', () => { AudioFX.play('click'); showScreen('menu'); });

// 暂停按钮
$('btn-pause').addEventListener('click', () => togglePause(true));
$('pause-resume').addEventListener('click', () => togglePause(false));
$('pause-restart').addEventListener('click', () => {
  paused = false;
  startMatch(lastConfig);
});
$('pause-quit').addEventListener('click', quitToMenu);
$('pause-mute').addEventListener('change', (e) => AudioFX.setMuted(e.target.checked));

// 键盘全局
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    e.preventDefault();
    if (battleActive) togglePause();
    else if (currentScreen() !== 'menu') navigate('menu');
  } else if (e.code === 'Enter') {
    const ae = document.activeElement;
    if (ae && ae.tagName === 'BUTTON') return;   // 让按钮自己响应，避免双触发
    e.preventDefault();
    if (battleActive) return;
    if (currentScreen() === 'menu') navigate('diff');
    else if (currentScreen() === 'result') startMatch(lastConfig);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && battleActive) togglePause(true);
});

// ---------------- 启动 ----------------
Input.init();
HUD.init();
initTalent({ saved: (b) => save('talent', b) });
initSettings({ apply: applySettings });
initTutorial({ onDone: () => navigate('menu') });
applySettings(settings);

battle = new Battle({
  ctx: $('game').getContext('2d'),
  onFinish: finishMatch,
});
battle.fxQuality = settings.particles;
battle.fx.noShake = settings.shake === 'off';

// 首次手势解锁音频
const unlock = () => {
  AudioFX.unlock();
  AudioFX.setSfx(settings.sfx / 100);
  AudioFX.setMusic(settings.music / 100);
  if (settings.music > 0) AudioFX.startMusic();
};
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

// 主循环
const inputAdapter = {
  pIntent: () => ({
    axis: Input.axisX(),
    actions: Input.consume(),
    block: Input.blockHeld(),
  }),
};

const loop = createLoop((dt) => {
  if (battleActive && battle && !paused) {
    battle.update(dt, inputAdapter);
    if (battle.inputOn) Input.setEnabled(true);
    battle.render();
    HUD.update(battle.snapshot(), records.streak);
  }
});
loop.start();
showScreen('menu');

// 调试句柄：控制台可读取对局内部状态（console/__lc）
window.__lc = { battle: () => battle, Input, settings: () => settings };
