// 输入层回归：键盘格挡按住（历史上 block 从未进按住集合 → 键盘格挡全废）、
// repeat 语义、焦点防抢键、失焦清理。Node 内 DOM 垫片驱动，零依赖。
import { ok, done } from './harness.mjs';

// ---- DOM / window 垫片（必须在 import input.js 之前）----
const listeners = {};
const mkEl = () => ({
  addEventListener: () => {}, removeEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false },
  style: {}, dataset: {},
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  setPointerCapture: () => {}, appendChild: () => {},
});
globalThis.window = {
  addEventListener: (t, f) => { listeners[t] = f; },
  removeEventListener: () => {}, dispatchEvent: () => {},
};
globalThis.document = {
  getElementById: () => mkEl(),
  querySelectorAll: () => [], querySelector: () => null,
  addEventListener: () => {}, activeElement: null,
  hidden: false, visibilityState: 'visible',
};

const ROOT = new URL('../js/', import.meta.url).href;
const { Input } = await import(ROOT + 'core/input.js');
Input.init();

const key = (code, repeat = false) =>
  listeners.keydown({ code, repeat, preventDefault() {}, target: { tagName: 'BODY' } });
const keyUp = (code) => listeners.keyup({ code, preventDefault() {} });

// 1) L 键格挡按住（本次修复主体）
key('KeyL');
ok('L 按下 → blockHeld', Input.blockHeld() === true);
key('KeyL', true);   // 系统 repeat 洪水
ok('L repeat 洪水 → 仍按住', Input.blockHeld() === true);
keyUp('KeyL');
ok('L 松开 → blockHeld false', Input.blockHeld() === false);

// 2) S 键同为格挡键
key('KeyS');
ok('S 按下 → blockHeld', Input.blockHeld() === true);
keyUp('KeyS');
ok('S 松开 → blockHeld false', Input.blockHeld() === false);

// 3) 移动轴按住语义
key('KeyD');
ok('D 按住 → 轴 +1', Input.axisX() === 1);
key('KeyD', true);
keyUp('KeyD');
ok('D 松开 → 轴回 0', Input.axisX() === 0);

// 4) 点按型动作：repeat 不重复入队
Input.consume();
key('KeyJ');
key('KeyJ', true);
ok('轻击入队且 repeat 不叠', Input.consume().join() === 'light');
key('KeyW');
ok('跳跃入队', Input.consume().join() === 'jump');
key('KeyQ');
ok('Q → 技能槽1（s1）', Input.consume().join() === 's1');
key('KeyE');
ok('E → 技能槽2（s2）', Input.consume().join() === 's2');

// 5) 输入框焦点时不抢键
key('KeyL'); keyUp('KeyL');
listeners.keydown({ code: 'KeyL', repeat: false, preventDefault() {}, target: { tagName: 'INPUT' } });
ok('INPUT 焦点 → 忽略按键', Input.blockHeld() === false);

// 6) 失焦清理按住态（防卡键）
key('KeyL'); key('KeyD');
listeners.blur();
ok('窗口失焦 → 清空按住/轴', Input.blockHeld() === false && Input.axisX() === 0);

// 7) 禁用时点按不入队、按住仍可记录（enabled 由战斗循环控制）
Input.setEnabled(false);
key('KeyJ');
ok('禁用 → 动作不入队', Input.consume().length === 0);
Input.setEnabled(true);

done();
