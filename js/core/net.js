// P2P 联机：WebRTC DataChannel，手动 offer/answer 房间码交换（零信令服务器）。
// 两层结构：
//   1) 编解码（纯函数，Node 可测）——房间码 base64、状态打包/解包、意图缓冲、HUD 透视翻转。
//      host 权威：只有房主跑完整模拟，访客收状态渲染；逻辑层 Math.random 只在房主侧求值。
//   2) 传输（浏览器 RTCPeerConnection，方法内惰性取用，Node 导入不触碰）。

// ---------------- 房间码 ----------------
function b64e(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64d(code) {
  const bin = atob(String(code).trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// SDP 描述 <-> 可复制文本（JSON 全 ASCII，base64 兜底换行/引号）
export function encDesc(desc) {
  return b64e(JSON.stringify({ type: desc.type, sdp: desc.sdp }));
}

export function decDesc(code) {
  const o = JSON.parse(b64d(code));
  if (!o || typeof o.sdp !== 'string' || (o.type !== 'offer' && o.type !== 'answer')) {
    throw new Error('bad code');
  }
  return { type: o.type, sdp: o.sdp };
}

// ---------------- 状态编解码 ----------------
// 事件里指向 Fighter 的引用键；序列化成 'p'(房主选手)/'f'(访客选手) 令牌
const REF_KEYS = ['attacker', 'target', 'defender', 'loser', 'winner', 'owner'];

// Fighter -> 可 JSON 化的平面快照：原始字段照抄；cd/attack 浅拷贝；对象/函数（mods/events/方法）跳过
export function serFighter(f) {
  const o = {};
  for (const k in f) {
    const v = f[k];
    const t = typeof v;
    if (v !== null && (t === 'object' || t === 'function')) {
      if (k === 'cd' || k === 'attack') o[k] = { ...v };
    } else {
      o[k] = v;
    }
  }
  return o;
}

// 事件 -> 纯数据（引用键换令牌，src=事件归属方令牌；函数不入线）
export function serEv(e, src) {
  const o = { o: src };
  for (const k in e) {
    const v = e[k];
    const t = typeof v;
    if (v === null || (t !== 'object' && t !== 'function')) o[k] = v;
    else if (REF_KEYS.indexOf(k) >= 0) o[k] = v.isPlayer ? 'p' : 'f';
  }
  return o;
}

// 令牌还原为真实对象；owner 由事件归属方令牌决定（对应原 _drain(f) 的 owner 参数）
export function deserEvList(list, player, foe) {
  const out = [];
  for (const raw of list || []) {
    const e = {};
    for (const k in raw) {
      if (k === 'o') continue;
      const v = raw[k];
      e[k] = v === 'p' ? player : (v === 'f' ? foe : v);
    }
    out.push({ e, owner: raw.o === 'f' ? foe : player });
  }
  return out;
}

// host 每帧打包：先取本帧事件（netEvBuf 由 battle._drain 攒），再取双方状态与 HUD 快照
export function packState(b) {
  const ev = [];
  for (const g of b.netEvBuf) for (const e of g.evs) ev.push(serEv(e, g.src));
  b.netEvBuf.length = 0;
  return {
    t: 's',
    ev,
    p: serFighter(b.player),
    f: serFighter(b.foe),
    b: {
      phase: b.phase, pt: b.pt, scale: b.scale, crowdHeat: b.crowdHeat,
      dmgDealt: b.dmgDealt, fDmgDealt: b.fDmgDealt, inputOn: b.inputOn,
      koLoser: b.koLoser ? (b.koLoser.isPlayer ? 'p' : 'f') : null,
      combo: { ...b.combo }, fCombo: { ...b.fCombo },
      ann: b.ann, matchT: b.matchT,
    },
    snap: b.snapshot(),
  };
}

// 访客解包：事件引用就地还原，koLoser 令牌解析成真实引用
export function unpackState(b, msg) {
  return {
    ev: deserEvList(msg.ev, b.player, b.foe),
    p: msg.p, f: msg.f, b: msg.b, snap: msg.snap,
    koLoser: msg.b.koLoser === 'p' ? b.player : (msg.b.koLoser === 'f' ? b.foe : null),
  };
}

// 访客 HUD 视角翻转：房主选手在访客侧是“对手”，访客自己的连击读 fCombo
export function swapSnap(s) {
  if (!s) return s;
  const out = { ...s, p: s.f, f: s.p };
  if (s.fCombo !== undefined) {
    out.combo = s.fCombo;
    out.comboOn = s.fComboOn;
  }
  return out;
}

// 访客输入缓冲：多条消息合并成一份意图，动作队列只被消费一次（防丢帧丢招）
export class IntentBuf {
  constructor() {
    this.axis = 0;
    this.block = false;
    this.actions = [];
    this.last = -1e9;
  }

  push(msg, now) {
    this.axis = msg.a | 0;
    this.block = !!msg.b;
    if (Array.isArray(msg.v)) {
      for (let i = 0; i < msg.v.length && this.actions.length < 16; i++) this.actions.push(msg.v[i]);
    }
    this.last = now;
  }

  // 过期判定：访客断流（切后台/掉线）超过 staleMs 时回落中立输入，防“卡住一直跑/挡”
  take(now, staleMs = 400) {
    if (now - this.last > staleMs) {
      this.actions.length = 0;
      return { axis: 0, actions: [], block: false };
    }
    return { axis: this.axis, block: this.block, actions: this.actions.splice(0) };
  }
}

// ---------------- 传输 ----------------
const RTC = () =>
  (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : window.webkitRTCPeerConnection);

function newPc() {
  return new (RTC())({
    // STUN 只在公网打洞用；不可达时本地候选照常工作（局域网/同机可玩）
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
  });
}

// 等 ICE 收集完再出码（trickle-off：一次给全候选）；2.5s 兜底防 STUN 不可达卡死
function waitIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    const on = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', on);
        res();
      }
    };
    pc.addEventListener('icegatheringstatechange', on);
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', on);
      res();
    }, 2500);
  });
}

export class Peer {
  constructor() {
    this.role = null;        // 'host' | 'guest' | null
    this.pc = null;
    this.dc = null;
    this.onOpen = null;      // DataChannel 建立
    this.onClose = null;     // (reason) 对方断开或链路失败
    this.onMessage = null;   // (obj) 收到 JSON 消息
    this._closeFired = false;
  }

  get connected() {
    return !!(this.dc && this.dc.readyState === 'open');
  }

  send(obj) {
    if (this.connected) this.dc.send(JSON.stringify(obj));
  }

  // 房主：生成 offer 房间码
  async host() {
    this.role = 'host';
    this._closeFired = false;
    this.pc = newPc();
    this.dc = this.pc.createDataChannel('laya');
    this._wireDc();
    this._wirePc();
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitIce(this.pc);
    return encDesc(this.pc.localDescription);
  }

  // 房主：应用访客回传的应答码后进入连接
  async acceptAnswer(code) {
    const desc = decDesc(code);
    if (desc.type !== 'answer') throw new Error('need answer');
    if (!this.pc) throw new Error('no host');
    await this.pc.setRemoteDescription(desc);
  }

  // 访客：粘贴 offer 码，产出应答码
  async join(offerCode) {
    this.role = 'guest';
    this._closeFired = false;
    const desc = decDesc(offerCode);
    if (desc.type !== 'offer') throw new Error('need offer');
    this.pc = newPc();
    this.pc.ondatachannel = (ev) => {
      this.dc = ev.channel;
      this._wireDc();
    };
    this._wirePc();
    await this.pc.setRemoteDescription(desc);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitIce(this.pc);
    return encDesc(this.pc.localDescription);
  }

  _wireDc() {
    const dc = this.dc;
    dc.onopen = () => { if (this.onOpen) this.onOpen(); };
    dc.onclose = () => this._fireClose('closed');
    dc.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (this.onMessage) this.onMessage(m);
    };
  }

  _wirePc() {
    this.pc.onconnectionstatechange = () => {
      if (this.pc && this.pc.connectionState === 'failed') this._fireClose('failed');
    };
  }

  _fireClose(reason) {
    if (this._closeFired) return;
    this._closeFired = true;
    if (this.onClose) this.onClose(reason);
  }

  close() {
    this._closeFired = true;   // 主动关闭不触发 onClose
    try { if (this.dc) this.dc.close(); } catch (e) { /* ignore */ }
    try { if (this.pc) this.pc.close(); } catch (e) { /* ignore */ }
    this.dc = null;
    this.pc = null;
    this.role = null;
  }
}
