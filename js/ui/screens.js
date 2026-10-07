// 屏幕路由：显示/隐藏各 .screen；data-go 按钮统一走 onGo 回调
const SCREENS = ['screen-menu', 'screen-diff', 'screen-talent', 'screen-tutorial',
  'screen-settings', 'screen-records', 'screen-result', 'screen-pause'];

let current = 'menu';
let onGo = null;

export function showScreen(name) {
  current = name;
  for (const id of SCREENS) {
    const node = document.getElementById(id);
    if (!node) continue;
    const match = id === 'screen-' + name;
    node.classList.toggle('hidden', !match);
    if (match) {
      // 重放入场动画
      node.style.animation = 'none';
      void node.offsetWidth;
      node.style.animation = '';
    }
  }
}

export function currentScreen() { return current; }

export function initNavigation(callback) {
  onGo = callback;
  document.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (onGo) onGo(btn.dataset.go);
    });
  });
}
