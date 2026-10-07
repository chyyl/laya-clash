// 固定用途的主循环：dt 钳制在 33ms 内，页面切后台自动暂停推进
export function createLoop(tick) {
  let raf = 0, last = 0, running = false;

  function frame(now) {
    if (!running) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.033) dt = 0.033;   // 切回前台/卡顿时不跳跃
    if (dt < 0) dt = 0;
    tick(dt);
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get running() { return running; },
  };
}
