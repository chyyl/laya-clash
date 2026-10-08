// 极简断言 harness（与 pytest 无关；通过数自读最后的 passed/failed 行）
let pass = 0, fail = 0;

export function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '  | ' + extra : '')); }
}

export function near(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

export function done() {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
