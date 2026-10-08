// 战斗 HUD：血条/能量/格挡/技能冷却/连击/播报（全部 DOM，按快照每帧刷新）
import { SKILLS } from '../data/skills.js';

const $ = (id) => document.getElementById(id);

let el = {};
const skLastIds = [null, null];         // 装配缓存：槽位技能变了才写 DOM

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
      sk: [$('sk-1'), $('sk-2')],
      skCd: [$('sk-1').querySelector('.skill-cd'), $('sk-2').querySelector('.skill-cd')],
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

    // 技能架（槽位制：名字/能耗随装配，冷却环按槽位）
    const ids = snap.p.skills || ['gale', 'jam'];
    for (let i = 0; i < 2; i++) {
      const sk = SKILLS[ids[i]];
      const node = el.sk[i];
      if (skLastIds[i] !== ids[i]) {
        skLastIds[i] = ids[i];
        node.querySelector('.skill-name').textContent = sk.name;
        node.querySelector('.skill-cost').textContent = sk.cost;
      }
      const cd = snap.p['s' + (i + 1)];
      const max = snap.p['s' + (i + 1) + 'Max'];
      el.skCd[i].style.setProperty('--p', max ? cd / max : 0);
      node.classList.toggle('ready', cd <= 0 && snap.p.energy >= sk.cost && !snap.p.silence);
      node.classList.toggle('no-energy', snap.p.energy < sk.cost || snap.p.silence);
    }

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
