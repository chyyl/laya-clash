// 键盘 + 鼠标 + 触控统一为同一套“意图”：
// axis（水平移动）+ 动作队列（边沿触发）+ block（按住态）
const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyJ: 'light', KeyZ: 'light',
  KeyK: 'heavy', KeyX: 'heavy',
  Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyL: 'block', KeyS: 'block',
  KeyQ: 'gale', KeyE: 'jam',
};

const keys = new Set();          // 按住的逻辑键
const queue = [];                // 本帧边沿动作
let touchBlock = false;          // 触屏防键按住
let joyX = 0;                    // 摇杆轴
let enabled = true;              // 战斗中才收动作

function press(action) {
  if (!enabled && action !== 'pause') return;
  if (queue.length < 8 && !queue.includes(action)) queue.push(action);
}

export const Input = {
  init() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;  // 设置面板里别抢按键
      const act = KEYMAP[e.code];
      if (!act) return;
      e.preventDefault();
      if (e.repeat) return;
      if (act === 'left' || act === 'right') keys.add(act);
      else press(act);
    });
    window.addEventListener('keyup', (e) => {
      const act = KEYMAP[e.code];
      if (act === 'left' || act === 'right') keys.delete(act);
    });
    window.addEventListener('blur', () => { keys.clear(); joyX = 0; touchBlock = false; });

    // 鼠标点击 = 轻击（桌面端便利键）
    document.getElementById('game').addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) press('light');
    });

    this._initTouch();
  },

  _initTouch() {
    const zone = document.getElementById('stick-zone');
    const base = document.getElementById('stick-base');
    const nub = document.getElementById('stick-nub');
    const defPos = { x: 120, y: 120 };
    let activeId = null, ox = 0, oy = 0;
    const R = 76;

    zone.addEventListener('pointerdown', (e) => {
      activeId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      zone.classList.add('grabbed');
      // 动态原点：按下处即摇杆中心
      const zr = zone.getBoundingClientRect();
      base.style.left = (e.clientX - zr.left - 95) + 'px';
      base.style.bottom = (zr.bottom - e.clientY - 95) + 'px';
      ox = e.clientX; oy = e.clientY;
      nub.style.transform = 'translate(0,0)';
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activeId) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const len = Math.hypot(dx, dy) || 1;
      if (len > R) { dx = dx / len * R; dy = dy / len * R; }
      nub.style.transform = `translate(${dx}px,${dy}px)`;
      joyX = Math.max(-1, Math.min(1, dx / (R * 0.6)));
      if (Math.abs(dx) < 8) joyX = 0;
    });
    const release = (e) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      zone.classList.remove('grabbed');
      nub.style.transform = 'translate(0,0)';
      joyX = 0;
      base.style.left = defPos.x + 'px';
      base.style.bottom = defPos.y + 'px';
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);

    // 动作按钮
    document.querySelectorAll('.tbtn').forEach((btn) => {
      const act = btn.dataset.act;
      const down = (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('held');
        if (act === 'block') touchBlock = true;
        else press(act);
      };
      const up = () => {
        btn.classList.remove('held');
        if (act === 'block') touchBlock = false;
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  },

  setEnabled(v) { enabled = v; if (!v) queue.length = 0; },
  consume() { const q = queue.slice(); queue.length = 0; return q; },
  axisX() {
    let x = joyX;
    if (keys.has('left')) x -= 1;
    if (keys.has('right')) x += 1;
    return Math.max(-1, Math.min(1, x));
  },
  blockHeld() { return touchBlock || keys.has('block'); },
  reset() { keys.clear(); queue.length = 0; joyX = 0; touchBlock = false; },
};
