// 战斗 HUD：血条/能量/格挡/技能冷却/连击/播报（全部 DOM，按快照每帧刷新）
const $ = (id) => document.getElementById(id);

let el = {};

export const HUD = {
  init() {
    el = {
      hud: $('hud'),
      php: $('php-fill'), phpFlash: $('php-flash'),
      ehp: $('ehp-fill'), ehpFlash: $('ehp-flash'),
      pen: $('pen-fill'), een: $('een-fill'),
      pgd: $('pgd-fill'), egd: $('egd-fill'),
      pbuild: $('hud-pbuild'), aname: $('hud-aname'), abuild: $('hud-abuild'),
      streak: $('hud-streak'),
      combo: $('combo'), comboX: $('combo-x'),
      ann: $('announce'), annText: $('announce-text'),
      silence: $('silence-tag'),
      gale: $('sk-gale'), jam: $('sk-jam'),
      galeCd: $('sk-gale').querySelector('.skill-cd'),
      jamCd: $('sk-jam').querySelector('.skill-cd'),
    };
  },

  show(v) { el.hud.classList.toggle('hidden', !v); if (!v) this._announce(null); },

  setMatch({ pBuild, aName, aBuild }) {
    el.pbuild.textContent = pBuild;
    el.aname.textContent = aName;
    el.abuild.textContent = aBuild;
  },

  setStreak(n) {
    el.streak.classList.toggle('hidden', n < 2);
    el.streak.textContent = `连胜 ${n}`;
  },

  _bar(node, v, max) {
    const pct = Math.max(0, Math.min(100, v / max * 100));
    node.style.width = pct + '%';
  },

  _announce(ann) {
    if (!ann) { el.ann.classList.add('hidden'); return; }
    if (el.annText.textContent !== ann.text || el.ann.classList.contains('hidden')) {
      el.annText.textContent = ann.text;
      el.annText.className = ann.cls || '';
      // 重新触发入场动画
      el.annText.style.animation = 'none';
      void el.annText.offsetWidth;
      el.annText.style.animation = '';
    }
    el.ann.classList.remove('hidden');
  },

  update(snap, streak) {
    this._bar(el.php, snap.p.hp, snap.p.hpMax);
    this._bar(el.phpFlash, snap.p.hp, snap.p.hpMax);
    this._bar(el.ehp, snap.f.hp, snap.f.hpMax);
    this._bar(el.ehpFlash, snap.f.hp, snap.f.hpMax);
    this._bar(el.pen, snap.p.energy, snap.p.energyMax);
    this._bar(el.een, snap.f.energy, snap.f.energyMax);
    this._bar(el.pgd, snap.p.guard, snap.p.guardMax);
    this._bar(el.egd, snap.f.guard, snap.f.guardMax);

    // 技能架
    const gP = snap.p.galeMax ? snap.p.gale / snap.p.galeMax : 0;
    const jP = snap.p.jamMax ? snap.p.jam / snap.p.jamMax : 0;
    el.galeCd.style.setProperty('--p', gP);
    el.jamCd.style.setProperty('--p', jP);
    el.gale.classList.toggle('ready', snap.p.gale <= 0 && snap.p.energy >= 40 && !snap.p.silence);
    el.gale.classList.toggle('no-energy', snap.p.energy < 40 || snap.p.silence);
    el.jam.classList.toggle('ready', snap.p.jam <= 0 && snap.p.energy >= 35 && !snap.p.silence);
    el.jam.classList.toggle('no-energy', snap.p.energy < 35 || snap.p.silence);

    // 连击
    if (snap.comboOn) {
      if (el.combo.classList.contains('hidden') || el.comboX.textContent !== String(snap.combo)) {
        el.comboX.textContent = snap.combo;
        el.combo.classList.remove('hidden');
        el.combo.style.animation = 'none';
        void el.combo.offsetWidth;
        el.combo.style.animation = '';
      }
    } else {
      el.combo.classList.add('hidden');
    }

    // 沉默
    el.silence.classList.toggle('hidden', !snap.p.silence);

    // 播报
    this._announce(snap.announce);
  },
};
