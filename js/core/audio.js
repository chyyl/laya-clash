// WebAudio 全合成：音效与音乐都由振荡器/噪声现场生成，零资源文件
let ctx = null, master, musicBus, sfxBus, noiseBuf;
let musicTimer = null, step = 0, nextTime = 0;
let muted = false;

function makeNoise() {
  const len = ctx.sampleRate * 1;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master); sfxBus.connect(master); master.connect(ctx.destination);
    noiseBuf = makeNoise();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

function env(node, t, a, d, peak = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  node.connect(g);
  return g;
}

function tone(type, f0, f1, t, dur, dest, peak = 0.5) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = env(o, t, 0.005, dur, peak);
  g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

function noise(t, dur, filterType, f0, f1, dest, peak = 0.5) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = filterType;
  fl.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
  s.connect(fl);
  const g = env(fl, t, 0.005, dur, peak);
  g.connect(dest);
  s.start(t); s.stop(t + dur + 0.05);
}

const RECIPES = {
  click() { tone('square', 880, 660, ctx.currentTime, 0.06, sfxBus, 0.18); },
  whoosh() { noise(ctx.currentTime, 0.16, 'bandpass', 900, 2600, sfxBus, 0.3); },
  dash() { noise(ctx.currentTime, 0.22, 'bandpass', 500, 3200, sfxBus, 0.42); },
  hitL() {
    const t = ctx.currentTime;
    tone('sine', 170, 55, t, 0.12, sfxBus, 0.9);
    noise(t, 0.07, 'highpass', 1400, 900, sfxBus, 0.5);
  },
  hitH() {
    const t = ctx.currentTime;
    tone('sine', 120, 36, t, 0.3, sfxBus, 1.1);
    tone('square', 90, 40, t, 0.16, sfxBus, 0.35);
    noise(t, 0.16, 'lowpass', 2400, 500, sfxBus, 0.7);
  },
  block() {
    const t = ctx.currentTime;
    noise(t, 0.1, 'bandpass', 2600, 1800, sfxBus, 0.55);
    tone('square', 1500, 1200, t, 0.08, sfxBus, 0.22);
  },
  parry() {
    const t = ctx.currentTime;
    tone('sine', 1180, 1180, t, 0.3, sfxBus, 0.5);
    tone('sine', 1770, 1770, t + 0.02, 0.34, sfxBus, 0.4);
    noise(t, 0.14, 'highpass', 3200, 4200, sfxBus, 0.4);
  },
  guardBreak() {
    const t = ctx.currentTime;
    noise(t, 0.3, 'lowpass', 3000, 300, sfxBus, 0.8);
    tone('sawtooth', 300, 70, t, 0.3, sfxBus, 0.5);
  },
  jump() {
    const t = ctx.currentTime;
    noise(t, 0.16, 'bandpass', 600, 2100, sfxBus, 0.3);
    tone('sine', 260, 620, t, 0.13, sfxBus, 0.16);
  },
  cheer() {
    const t = ctx.currentTime;
    noise(t, 0.5, 'bandpass', 900, 500, sfxBus, 0.26);
    noise(t + 0.06, 0.4, 'lowpass', 1600, 700, sfxBus, 0.2);
  },
  land() { tone('sine', 110, 50, ctx.currentTime, 0.1, sfxBus, 0.5); },
  gale() {
    const t = ctx.currentTime;
    tone('sawtooth', 240, 1400, t, 0.4, sfxBus, 0.34);
    noise(t, 0.36, 'bandpass', 800, 3600, sfxBus, 0.3);
  },
  jam() {
    const t = ctx.currentTime;
    tone('square', 900, 130, t, 0.3, sfxBus, 0.4);
    tone('sawtooth', 620, 90, t + 0.03, 0.26, sfxBus, 0.3);
  },
  hitConfirm() { tone('triangle', 1300, 900, ctx.currentTime, 0.05, sfxBus, 0.22); },
  ko() {
    const t = ctx.currentTime;
    tone('sine', 150, 30, t, 1.1, sfxBus, 1.2);
    noise(t, 0.7, 'lowpass', 2200, 200, sfxBus, 0.7);
    tone('sawtooth', 420, 60, t + 0.1, 0.8, sfxBus, 0.3);
  },
  win() {
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, t + i * 0.11, 0.24, sfxBus, 0.22));
  },
  lose() {
    const t = ctx.currentTime;
    [392, 330, 262, 196].forEach((f, i) => tone('sawtooth', f, f, t + i * 0.16, 0.34, sfxBus, 0.2));
  },
};

// ---- 音乐：140BPM 的暗色电子循环（kick/hat/bass 合成） ----
const STEP_DUR = 60 / 140 / 4;               // 16 分音符
const BASS = [55, 0, 55, 65.4, 0, 55, 0, 73.4, 55, 0, 65.4, 0, 49, 0, 55, 0];
let barFlip = false;

function scheduleStep(s, t) {
  const i = s % 16;
  if (i % 4 === 0) {                          // kick
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const g = env(o, t, 0.003, 0.13, 0.9); g.connect(musicBus);
    o.start(t); o.stop(t + 0.2);
  }
  if (i % 2 === 1) noise(t, 0.03, 'highpass', 7000, 7000, musicBus, 0.12);   // hat
  let f = BASS[i];
  if (f && barFlip) f *= 1.122;               // 隔小节微调，避免完全重复
  if (f) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 460;
    const g = env(o, t, 0.008, STEP_DUR * 1.7, 0.34);
    o.connect(fl); fl.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + STEP_DUR * 2);
  }
}

function scheduler() {
  if (!ctx) return;
  while (nextTime < ctx.currentTime + 0.18) {
    scheduleStep(step, nextTime);
    if (step % 16 === 15) barFlip = !barFlip;
    step = (step + 1) % 64;
    nextTime += STEP_DUR;
  }
}

export const AudioFX = {
  unlock() { if (ensure() && !musicTimer && this.musicOn) this.startMusic(); },
  setSfx(v) { if (ensure()) sfxBus.gain.value = v; },
  setMusic(v) { if (ensure()) musicBus.gain.value = v; },
  setMuted(m) {
    muted = m;
    if (ensure()) master.gain.value = m ? 0 : 1;
  },
  get muted() { return muted; },
  play(name) {
    if (muted || !ensure()) return;
    const fn = RECIPES[name];
    if (fn) fn();
  },
  musicOn: true,
  startMusic() {
    if (!ensure() || musicTimer) return;
    this.musicOn = true;
    step = 0; nextTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduler, 40);
  },
  stopMusic() {
    this.musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  },
};
