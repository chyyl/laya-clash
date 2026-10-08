import { createLoop } from './core/loop.js';
import { Input } from './core/input.js';
import { AudioFX } from './core/audio.js';
import { load, save, DEFAULT_SETTINGS, DEFAULT_RECORDS } from './core/storage.js';
import { Peer, IntentBuf, packState, unpackState, swapSnap } from './core/net.js';
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

// ---------------- 联机状态 ----------------
const peer = new Peer();
let netIntent = new IntentBuf();   // 访客输入缓冲（房主每帧取用）
let netHi = null;                  // 访客发来的装配（房主开局建角色用）
let netOwnLabel = '';              // 本机装配标签（结算文案）
let netStarting = false;           // VS 过场中：防双开局、断线兜底

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

  $('vs-pname').textContent = '挑战者';
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
    $('pause-restart').classList.remove('hidden');
    $('pause-quit').textContent = '退出到菜单';
  }, 1500);
}

function finishMatch(res) {
  battleActive = false;
  Input.setEnabled(false);
  HUD.show(false);
  syncTouchVisibility();

  const isNet = !!peer.role;
  // 联机局：房主把“对方视角”的结算推给访客（胜负翻转，连击/伤害记对方的账）
  if (peer.role === 'host') {
    peer.send({
      t: 'end',
      res: {
        win: !res.win, time: res.time,
        peakCombo: battle.fCombo.peak, dmg: Math.round(battle.fDmgDealt),
        diff: 'net', aiName: '房主', aiBuild: netOwnLabel,
      },
    });
  }

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
  // 联机局：只留“再战/大厅”，换对手与天赋入口无意义
  $('res-diff').classList.toggle('hidden', isNet);
  $('res-talent').classList.toggle('hidden', isNet);
  $('res-menu').textContent = isNet ? '联机大厅' : '主菜单';
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

// ---------------- 联机：屏幕与连接 ----------------
function setNetStatus(text) { $('net-status').textContent = text; }

function setPeerState(text, cls) {
  const el = $('net-peer');
  el.textContent = text;
  el.className = 'net-peer' + (cls ? ' ' + cls : '');
}

function refreshNetUI() {
  const role = peer.role;
  const ok = peer.connected;
  $('net-host').disabled = !!role;
  $('net-join').disabled = !!role;
  $('net-apply').disabled = role !== 'host';
  $('net-start').classList.toggle('hidden', role !== 'host');
  $('net-start').disabled = !(role === 'host' && ok && netHi);
  $('net-wait').classList.toggle('hidden', !(role === 'guest' && ok));
  $('net-leave').classList.toggle('hidden', !role);
  if (!role) setPeerState('等待连接…', '');
  else if (ok) setPeerState(role === 'host' ? '已连接：访客在场' : '已连接：房主在场', 'ok');
  else setPeerState(role === 'host' ? '等待访客应答…（回传码贴到下方）' : '等待房主确认…', '');
}

// 中局退回联机大厅（连接保持；断线场景由 onClose 先 close 再调）
function netToLobby() {
  battleActive = false;
  paused = false;
  Input.setEnabled(false);
  HUD.show(false);
  syncTouchVisibility();
  $('vs-layer').classList.add('hidden');
  showScreen('net');
  refreshNetUI();
}

function netRematch() {
  if (peer.role === 'host') netStartMatch();
  else if (peer.role === 'guest' && peer.connected) peer.send({ t: 'rematch' });
}

// 访客按暂停 = 向房主请示；房主按暂停 = 应用并广播（回包驱动访客侧 UI）
function applyRemotePause(v) {
  if (peer.role === 'host') { togglePause(v); return; }
  if (!battleActive || paused === v) return;
  paused = v;
  if (v) {
    showScreen('pause');
    Input.setEnabled(false);
    $('pause-mute').checked = AudioFX.muted;
  } else {
    showScreen('none');
    Input.setEnabled(battle.inputOn);
    $('pause-mute').checked = AudioFX.muted;
  }
}

// ---------------- 联机：开局 ----------------
// 房主：用 netHi（访客装配）给对方建角色，本机角色用当前装配
function netStartMatch() {
  if (!peer.connected || !netHi || netStarting || battleActive) return;
  netStarting = true;
  const pb = currentBuild();
  const lo = normalizeLoadout(currentLoadout());
  const ownLabel = buildLabel(pb);
  const foeLabel = buildLabel(netHi.b);
  netOwnLabel = ownLabel;

  $('vs-pname').textContent = '挑战者';
  $('vs-pbuild').textContent = ownLabel;
  $('vs-aname').textContent = '访客';
  $('vs-abuild').textContent = foeLabel;
  $('vs-layer').classList.remove('hidden');
  peer.send({ t: 'start', b: pb, s: lo });

  setTimeout(() => {
    netStarting = false;
    if (!peer.connected) return;          // VS 期间断线：已回大厅，不开局
    $('vs-layer').classList.add('hidden');
    battle.reset({
      playerBuild: pb, playerSkills: lo,
      aiName: '访客', aiBuild: { name: foeLabel, build: netHi.b, skills: netHi.s },
      diffParams: DIFFICULTIES.rookie, diff: 'net', net: true,
    });
    battle.fxQuality = settings.particles;
    battle.fx.quality = settings.particles;
    battle.fx.noShake = settings.shake === 'off';
    netIntent = new IntentBuf();
    HUD.setMatch({ pBuild: ownLabel, aName: '访客', aBuild: foeLabel });
    HUD.setStreak(records.streak);
    HUD.show(true);
    battleActive = true;
    paused = false;
    showScreen('none');
    syncTouchVisibility();
    Input.reset();
    Input.setSkillLabels(lo.map(id => SKILLS[id].name));
    Input.setEnabled(false);
    $('pause-restart').classList.add('hidden');
    $('pause-quit').textContent = '退出到联机大厅';
  }, 1500);
}

// 访客：房主发来 start → 本机角色用当前装配，房主角色用消息里的装配
function netStartGuest(msg) {
  if (netStarting) return;
  netStarting = true;
  const pb = currentBuild();
  const lo = normalizeLoadout(currentLoadout());
  const ownLabel = buildLabel(pb);
  const hostLabel = buildLabel(msg.b);
  netOwnLabel = ownLabel;

  $('vs-pname').textContent = '房主';
  $('vs-pbuild').textContent = hostLabel;
  $('vs-aname').textContent = '你';
  $('vs-abuild').textContent = ownLabel;
  $('vs-layer').classList.remove('hidden');

  setTimeout(() => {
    netStarting = false;
    if (!peer.connected) return;
    $('vs-layer').classList.add('hidden');
    battle.reset({
      playerBuild: msg.b, playerSkills: msg.s,
      aiName: '你', aiBuild: { name: ownLabel, build: pb, skills: lo },
      diffParams: DIFFICULTIES.rookie, diff: 'net', net: true,
    });
    battle.fxQuality = settings.particles;
    battle.fx.quality = settings.particles;
    battle.fx.noShake = settings.shake === 'off';
    HUD.setMatch({ pBuild: ownLabel, aName: '房主', aBuild: hostLabel });
    HUD.setStreak(records.streak);
    HUD.show(true);
    battleActive = true;
    paused = false;
    showScreen('none');
    syncTouchVisibility();
    Input.reset();
    Input.setSkillLabels(lo.map(id => SKILLS[id].name));
    Input.setEnabled(false);
    $('pause-restart').classList.add('hidden');
    $('pause-quit').textContent = '退出到联机大厅';
  }, 1500);
}

// ---------------- 联机：消息分发 ----------------
function hostMsg(m) {
  if (m.t === 'hi') {
    netHi = m;
    setNetStatus('访客已加入 · 点击下方“开始对战”开打');
    refreshNetUI();
  } else if (m.t === 'i') {
    if (battleActive && battle.net) netIntent.push(m, performance.now());
  } else if (m.t === 'p') {
    applyRemotePause(!!m.v);
  } else if (m.t === 'rematch') {
    if (currentScreen() === 'result' || currentScreen() === 'net') netStartMatch();
  } else if (m.t === 'q') {
    if (battleActive || currentScreen() === 'pause') netToLobby();
    setNetStatus('访客已退出对局 · 随时可以再开');
    refreshNetUI();
  }
}

function guestMsg(m) {
  if (m.t === 'start') {
    netStartGuest(m);
  } else if (m.t === 's') {
    if (battleActive && battle.net && battle.player) battle.netApply(unpackState(battle, m));
  } else if (m.t === 'end') {
    if (battleActive && battle.net) finishMatch(m.res);
  } else if (m.t === 'p') {
    applyRemotePause(!!m.v);
  } else if (m.t === 'q') {
    netToLobby();
    setNetStatus('房主已退出对局 · 连接仍在，等它再开局');
    refreshNetUI();
  }
}

peer.onOpen = () => {
  if (peer.role === 'guest') {
    setNetStatus('已连接 · 等待房主开局');
    peer.send({ t: 'hi', b: currentBuild(), s: normalizeLoadout(currentLoadout()) });
  } else {
    setNetStatus('已连接 · 等待访客信息…');
  }
  refreshNetUI();
};

peer.onClose = () => {
  peer.close();                 // role 置空；主动 close 不会再触发本回调
  netHi = null;
  const inFlow = battleActive || netStarting || ['net', 'pause', 'result'].includes(currentScreen());
  if (inFlow) netToLobby(); else refreshNetUI();
  setNetStatus('连接已断开 · 可重新生成房间码重试');
  setPeerState('连接已断开', 'bad');
};

peer.onMessage = (m) => {
  try {
    if (peer.role === 'host') hostMsg(m);
    else if (peer.role === 'guest') guestMsg(m);
  } catch (err) {
    console.warn('net message ignored:', err);
  }
};

// ---------------- 联机：屏幕按钮 ----------------
$('net-host').addEventListener('click', async () => {
  AudioFX.play('click');
  $('net-offer').value = '';
  $('net-answer').value = '';
  setNetStatus('生成房间码中…（收集网络路径，最多几秒）');
  try {
    const code = await peer.host();
    $('net-offer').value = code;
    setNetStatus('房间码已生成 · 整段复制发给好友，再贴回它发的应答码');
    refreshNetUI();
  } catch (e) {
    peer.close();
    setNetStatus('生成失败：当前环境不支持 WebRTC');
    refreshNetUI();
  }
});

$('net-apply').addEventListener('click', async () => {
  AudioFX.play('click');
  const code = $('net-answer').value;
  if (!code.trim()) { setNetStatus('请先粘贴好友发回的应答码'); return; }
  setNetStatus('应用应答码中…');
  try {
    await peer.acceptAnswer(code);
    setNetStatus('应答码已应用 · 正在建立连接…');
  } catch (e) {
    setNetStatus('应答码无效 · 请粘贴好友回传的完整码');
  }
});

$('net-join').addEventListener('click', async () => {
  AudioFX.play('click');
  const code = $('net-offer-in').value;
  if (!code.trim()) { setNetStatus('请先粘贴房主发来的房间码'); return; }
  $('net-answer-out').value = '';
  setNetStatus('解析房间码中…');
  try {
    const ans = await peer.join(code);
    $('net-answer-out').value = ans;
    setNetStatus('应答码已生成 · 整段复制发回房主，等它点“完成连接”');
    refreshNetUI();
  } catch (e) {
    peer.close();
    setNetStatus('房间码无效 · 请粘贴房主发来的完整码');
    refreshNetUI();
  }
});

$('net-start').addEventListener('click', () => { AudioFX.play('click'); netStartMatch(); });

$('net-leave').addEventListener('click', () => {
  AudioFX.play('click');
  peer.close();
  netHi = null;
  $('net-offer').value = '';
  $('net-answer').value = '';
  $('net-offer-in').value = '';
  $('net-answer-out').value = '';
  setNetStatus('已断开 · 与好友互发房间码即可开打');
  refreshNetUI();
});

function togglePause(force) {
  if (!battleActive || !battle) return;
  const to = typeof force === 'boolean' ? force : !paused;
  if (peer.role === 'guest') {
    // 访客不本地定暂停：向房主请示，UI 由回包驱动
    if (peer.connected) peer.send({ t: 'p', v: to });
    return;
  }
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
  if (peer.role === 'host') peer.send({ t: 'p', v: paused });
}

// ---------------- 导航 ----------------
function navigate(dest) {
  AudioFX.play('click');
  if (dest === 'menu') { showScreen('menu'); return; }
  if (dest === 'diff') { showScreen('diff'); return; }
  if (dest === 'talent') { showScreen('talent'); return; }
  if (dest === 'tutorial') { showScreen('tutorial'); openTutorial(); return; }
  if (dest === 'net') { showScreen('net'); refreshNetUI(); return; }
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
$('res-rematch').addEventListener('click', () => {
  AudioFX.play('click');
  if (peer.role) netRematch(); else startMatch(lastConfig);
});
$('res-diff').addEventListener('click', () => { AudioFX.play('click'); showScreen('diff'); });
$('res-talent').addEventListener('click', () => { AudioFX.play('click'); showScreen('talent'); });
$('res-menu').addEventListener('click', () => {
  AudioFX.play('click');
  if (peer.role) { showScreen('net'); refreshNetUI(); }
  else showScreen('menu');
});

// 暂停按钮
$('btn-pause').addEventListener('click', () => togglePause(true));
$('pause-resume').addEventListener('click', () => togglePause(false));
$('pause-restart').addEventListener('click', () => {
  paused = false;
  startMatch(lastConfig);              // 联机局该按钮隐藏（netStart* 里处理）
});
$('pause-quit').addEventListener('click', () => {
  if (peer.role) {
    if (peer.connected) peer.send({ t: 'q' });
    netToLobby();
    setNetStatus('已退出对局 · 连接保持中');
  } else {
    quitToMenu();
  }
});
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
    else if (currentScreen() === 'result') { if (peer.role) netRematch(); else startMatch(lastConfig); }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && battleActive) togglePause(true);
});

// ---------------- 启动 ----------------
Input.init();
HUD.init();
initTalent({
  saved: (b) => {
    save('talent', b);
    // 访客改装配后实时同步给房主（房主开句时给“你的角色”建数据）
    if (peer.connected && peer.role === 'guest') {
      peer.send({ t: 'hi', b: currentBuild(), s: normalizeLoadout(currentLoadout()) });
    }
  },
});
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
// 联机房主：本机出招走 pIntent，访客出招从 netIntent 缓冲取（过期自动回落中立）
const hostAdapter = {
  pIntent: inputAdapter.pIntent,
  fIntent: () => netIntent.take(performance.now()),
};

const loop = createLoop((dt) => {
  if (battleActive && battle && !paused) {
    if (battle.net && peer.role === 'host') {
      battle.update(dt, hostAdapter);
      peer.send(packState(battle));           // 权威状态 + 本帧事件推给访客
    } else if (battle.net && peer.role === 'guest') {
      battle.netTick(dt);                     // 消费到达的状态帧（事件先演、状态后覆）
      // 只在开战帧送输入；phase 由房主状态驱动
      if (battle.lastSnap && battle.lastSnap.phase === 'fight') {
        peer.send({ t: 'i', a: Input.axisX(), v: Input.consume(), b: Input.blockHeld() });
      }
    } else {
      battle.update(dt, inputAdapter);
    }
    if (battle.inputOn) Input.setEnabled(true);
    battle.render();
    const snap = (battle.net && peer.role === 'guest' && battle.lastSnap)
      ? swapSnap(battle.lastSnap)
      : battle.snapshot();
    HUD.update(snap, records.streak);
  }
});
loop.start();
showScreen('menu');

// 调试句柄：控制台可读取对局内部状态（console/__lc）
window.__lc = {
  battle: () => battle, Input, settings: () => settings,
  peer: () => peer, role: () => peer.role, hi: () => netHi,
};
