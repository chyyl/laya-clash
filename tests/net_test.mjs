// 联机编解码回归：房间码往返 / Fighter·事件序列化与还原 / 状态打包解包 /
// HUD 视角翻转 / 访客意图缓冲。全部为纯函数，不触碰 RTCPeerConnection。
import { ok, done } from './harness.mjs';

const ROOT = new URL('../js/', import.meta.url).href;
const {
  encDesc, decDesc, serFighter, serEv, deserEvList,
  packState, unpackState, swapSnap, IntentBuf,
} = await import(ROOT + 'core/net.js');

// ---- 房间码 ----
const sdp = 'v=0\r\no=- 4611686018427387904 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n';
const offerCode = encDesc({ type: 'offer', sdp });
const answerCode = encDesc({ type: 'answer', sdp: 'v=0\r\na=ice-options:trickle\r\n' });

ok('房间码 offer 往返', decDesc(offerCode).type === 'offer' && decDesc(offerCode).sdp === sdp);
ok('房间码 answer 往返', decDesc(answerCode).type === 'answer' && decDesc(answerCode).sdp.indexOf('trickle') >= 0);

let threw = 0;
try { decDesc('!!! not base64 !!!'); } catch (e) { threw++; }
ok('房间码 非法 base64 拒绝', threw === 1);

threw = 0;
try { decDesc(btoa(JSON.stringify({ type: 'offer' }))); } catch (e) { threw++; }
ok('房间码 缺 sdp 拒绝', threw === 1);

threw = 0;
try { decDesc(btoa(JSON.stringify({ type: 'prank', sdp: 'x' }))); } catch (e) { threw++; }
ok('房间码 类型必须 offer/answer', threw === 1);

// ---- Fighter 序列化 ----
const fighter = {
  name: '挑战者', color: '#3df2ff', isPlayer: true,
  x: 470.5, y: 0, vx: -120, vy: 0, facing: 1,
  state: 'attack', t: 0.12, dead: false, dashDir: 1, pending: 'light',
  cd: { s1: 2.5, s2: 0, dash: 1, jump: 0 },
  attack: { step: 1, data: { windup: 0.1, active: 0.08, rec: 0.2, dmg: 9 }, t: 0.05, phase: 'windup', hitDone: false, lungeDone: true },
  mods: { dmgMul: 1.1 },
  events: [{ type: 'land', x: 470 }],
  update() {},
};
const ser = serFighter(fighter);

ok('serFighter 平面字段照抄',
  ser.x === 470.5 && ser.state === 'attack' && ser.dashDir === 1
  && ser.pending === 'light' && ser.dead === false && ser.facing === 1 && ser.color === '#3df2ff');
ok('serFighter 跳过对象与函数',
  !('mods' in ser) && !('events' in ser) && !('update' in ser));
ok('serFighter cd/attack 克隆且值一致',
  ser.cd !== fighter.cd && ser.cd.s1 === 2.5
  && ser.attack !== fighter.attack && ser.attack.data.windup === 0.1 && ser.attack.phase === 'windup');
const round = JSON.parse(JSON.stringify(ser));
ok('serFighter JSON 往返稳定',
  round.x === 470.5 && round.attack.t === 0.05 && round.cd.jump === 0);

// ---- 事件令牌化 / 还原 ----
const P = { isPlayer: true };
const F = { isPlayer: false };
const ev = {
  type: 'hit', dmg: 5.5, crit: false, blocked: true, x: 610,
  attacker: P, target: F, comboStep: 2,
};
const evTok = serEv(ev, 'f');
ok('serEv 引用键换令牌', evTok.attacker === 'p' && evTok.target === 'f');
ok('serEv 原语与归属保留', evTok.dmg === 5.5 && evTok.x === 610 && evTok.o === 'f');

const list = deserEvList([evTok], P, F);
ok('deserEvList 引用还原', list[0].e.attacker === P && list[0].e.target === F && list[0].e.dmg === 5.5);
ok('deserEvList owner 按归属令牌', list[0].owner === F);
ok('deserEvList 归属令牌不进事件体', !('o' in list[0].e));

const ownerP = deserEvList([serEv({ type: 'gale' }, 'p')], P, F);
ok('deserEvList owner p', ownerP[0].owner === P);

// ---- 状态打包 / 解包 ----
function mkBattle() {
  const player = { isPlayer: true, x: 400, facing: 1 };
  const foe = { isPlayer: false, x: 800, facing: -1 };
  return {
    player, foe,
    netEvBuf: [{ src: 'p', evs: [{ type: 'hit', dmg: 4, attacker: player }] }],
    phase: 'fight', pt: 0.31, scale: 1, crowdHeat: 0.42,
    dmgDealt: 120, fDmgDealt: 80, inputOn: true,
    koLoser: null,
    combo: { n: 3, t: 1.2, peak: 5 },
    fCombo: { n: 1, t: 0.4, peak: 2 },
    ann: { text: 'FIGHT', cls: '', until: 2.5 },
    matchT: 12.34,
    snapshot: () => ({ phase: 'fight', combo: 3, fCombo: 1 }),
  };
}

const b1 = mkBattle();
const msg = packState(b1);
ok('packState 消息结构', msg.t === 's' && msg.ev.length === 1 && msg.p && msg.f && msg.snap);
ok('packState 事件令牌化', msg.ev[0].attacker === 'p' && msg.ev[0].type === 'hit');
ok('packState 取走后事件缓冲清空', b1.netEvBuf.length === 0);
ok('packState 战斗标量齐全',
  msg.b.phase === 'fight' && msg.b.combo.n === 3 && msg.b.fCombo.peak === 2
  && msg.b.koLoser === null && msg.b.ann.text === 'FIGHT' && msg.b.matchT === 12.34);
ok('packState 快照透传', msg.snap.combo === 3);

b1.koLoser = b1.player;
ok('packState koLoser 令牌 p', packState(b1).b.koLoser === 'p');
b1.koLoser = b1.foe;
ok('packState koLoser 令牌 f', packState(b1).b.koLoser === 'f');

const b2 = mkBattle();
const m2 = JSON.parse(JSON.stringify(packState(b2)));
const unit = unpackState(b2, m2);
ok('unpackState 事件还原到真实对象',
  unit.ev.length === 1 && unit.ev[0].e.attacker === b2.player && unit.ev[0].owner === b2.player);
ok('unpackState koLoser null 直通', unit.koLoser === null);
m2.b.koLoser = 'f';
ok('unpackState koLoser 解析为引用', unpackState(b2, m2).koLoser === b2.foe);
ok('unpackState 状态透传', unit.p.x === b2.player.x && unit.b.matchT === 12.34 && unit.snap === m2.snap);

// ---- HUD 视角翻转（访客把房主侧当对手） ----
const snap = {
  phase: 'fight', p: { hp: 100 }, f: { hp: 37 },
  combo: 4, comboOn: true, fCombo: 9, fComboOn: true, announce: null,
};
const sw = swapSnap(snap);
ok('swapSnap 血条翻转', sw.p.hp === 37 && sw.f.hp === 100);
ok('swapSnap 连击指向自己的账', sw.combo === 9 && sw.comboOn === true);
ok('swapSnap 其余字段保留', sw.phase === 'fight' && sw.announce === null && sw !== snap);
ok('swapSnap null 直通', swapSnap(null) === null);

// ---- 访客意图缓冲 ----
const buf = new IntentBuf();
buf.push({ a: 1, v: ['light', 'heavy'], b: true }, 1000);
buf.push({ a: -1, v: ['jump'], b: false }, 1001);
const it = buf.take(1002);
ok('IntentBuf 多帧合并、动作不丢',
  it.axis === -1 && it.block === false && it.actions.length === 3 && it.actions[2] === 'jump');
ok('IntentBuf 取走即清空', buf.take(1003).actions.length === 0);

buf.push({ a: 0, v: null, b: 0 }, 2000);
const stale = buf.take(9999);
ok('IntentBuf 过期回落中立且清积压', stale.axis === 0 && stale.block === false && stale.actions.length === 0);

const flood = new IntentBuf();
flood.push({ a: 0, v: new Array(30).fill('light'), b: false }, 100);
ok('IntentBuf 动作队列上限 16', flood.take(101).actions.length === 16);

done();
