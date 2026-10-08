# AGENTS.md

零依赖零构建的纯静态格斗游戏：原生 ES Modules + Canvas2D，无 package.json / 打包器 / 框架 / CI。**别引入任何构建步骤或依赖**——netlify.toml 直接发布根目录，"离线可玩"是产品承诺。

## 命令

```bash
# 本地服务（ES Modules 必须走 HTTP，file:// 打不开；实践端口 8091，README 示例 8090）
python -m http.server 8091

# 回归四件（tests/harness.mjs 自写断言，非 pytest；无单测过滤，只能整文件跑；失败退出码非 0）
node tests/input_test.mjs      # 14 项：输入层（键盘格挡按住、repeat 防叠、焦点防抢）
node tests/keystone_test.mjs   # 52 项：天赋系数、大点门控、跳跃耗能、AI 行为
node tests/skill_test.mjs      # 49 项：技能池、装配归一、槽位拒绝、AI 选槽
node tests/net_test.mjs        # 34 项：房间码往返、状态打包解包、视角翻转、意图缓冲   合计 149
node tests/input_test.mjs && node tests/keystone_test.mjs && node tests/skill_test.mjs && node tests/net_test.mjs   # 一键全跑 = 回归门

# 语法门（Node 24 对 ESM .js 可直接 --check；单次只查一个文件，必须循环）
for f in js/main.js js/core/*.js js/data/*.js js/game/*.js js/ui/*.js; do node --check "$f" || exit 1; done
```

- 测试用 `await import(ROOT + '...')` 直接加载真实游戏模块（非副本）——**js/data、js/core/input·net、game/fighter·constants·ai 有覆盖；battle.js 编排、js/ui、css、index.html 没有**，只能浏览器验证。
- 改完代码的顺序：语法门 → 四件回归 → 浏览器 E2E（无热更新，见下）。

## 浏览器验证（坑都踩过）

- 改 js/css 后需手动 reload 标签页；**CSS 易被启发式缓存**（http.server 只回 Last-Modified）→ 强刷，或给 link 加 `?v=`（http.server 会剥查询串，该 URL 仍有效）。
- 后台/隐藏标签页 **rAF 停转，战斗循环冻结**；调试钩子在 `main.js` 尾部：`window.__lc = { battle(), Input, settings(), peer(), role(), hi() }`。手动步进：
  `const lc = window.__lc; lc.battle().update(1/60, {pIntent: () => ({axis: lc.Input.axisX(), actions: lc.Input.consume(), block: lc.Input.blockHeld()})})`，
  且要补一句 `if (lc.battle().inputOn) lc.Input.setEnabled(true)`——开场 intro 期间 input 被 main.js 关闭，只靠主循环重开，否则按键被 `press()` 静默丢弃。
- **联机 E2E 必须用 playwright 浏览器**：OpenCode 自带 Electron 壳里 WebRTC 零候选（`onicecandidate` 只回 null、SDP 无 `a=candidate`，握手必死，别查代码）。playwright 侧 `browser_tabs({action:'new'/'select'})` 多标签、`browser_evaluate` 无 tab 参数按当前选中标签跑；其截图需带 `scale` 参数；字符串结果可能带引号包裹（`JSON.parse` 前先剥）。
- 截图前先 `browser.tabs.focus`（需要可见标签页）。
- 控制台里 fonts.googleapis.com 拉取失败是**预期内**（代理/离线环境字体回退正常），不是回归，别去修。
- 验证用浏览器持久化 localStorage（`layaclash.*` 负载与设置，如触控"常显"会跨会话留存）→ 要干净状态用 设置→清空全部数据。
- 页面 502/000 时查端口双监听：`netstat -ano | findstr :8091`，重复 PID 全部 `taskkill //F` 后单实例重启（本机发生过两次）。

## 架构（文件名看不出来的）

- **装配根 = `js/main.js`**：启动、屏幕路由、全局热键、rAF 主循环（`core/loop.js` 造，dt 钳 33ms）、`window.__lc` 钩子。
- 分层：`js/data` 纯参数与推导（**改技能/天赋数值只动 skills.js / talents.js**，公式与默认装配都在这）；`js/game` 模拟（fighter 单实体、battle 编排+事件、ai 决策、render·arena·fx 画布）；`js/core` 平台（input 意图、storage、audio 合成）；`js/ui` DOM 渲染。
- **背景 = `js/game/arena.js` 水墨武侠夜景，静态/动态两层离屏缓存**：天空、远近山、山门、青松、地面、竹篱、木人桩首帧惰性画进 BACK/FRONT 缓存（`document.fonts.ready` 后自动重建）；雾带、灯笼、火盆、人潮火把、卷轴秘籍图谱每帧现画。改背景先分清动哪层；`drawArena(ctx, t, heat)` 签名与 heat（0-1 人潮热度）语义不可改；**背景只用墨色与暖灯，青/红留给选手剪影**（可读性来源），别把霓虹色加回来。
- **输入是意图制**：keydown 入边沿队列 + 按住集合，主循环经 `pIntent` 回调每帧消费；`enabled` 门控战斗外为 false。
- **联机 = host 权威 P2P（`js/core/net.js` + main.js 接线）**：两层结构——编解码纯函数（encDesc/serFighter/serEv/packState/unpackState/swapSnap/IntentBuf，net_test 可测）+ `Peer` 传输（RTCPeerConnection 惰性构造，Node 导入安全）。房主跑完整模拟每帧 `packState` 外发；访客不模拟，状态入队 `battle.netApply`，`netTick` **先演事件后覆状态**（里程碑连击口径与房主一致，落后 >6 帧只留最近几帧）。消息：`hi`(访客装配)/`start`/`s`/`i`/`end`/`p`(暂停双向)/`q`/`rematch`；`battle.net` 标志在 reset({net:true}) 置位，双连击 `combo/fCombo`、双伤害 `dmgDealt/fDmgDealt` 分账，HUD 视角翻转走 `swapSnap`。**改事件结算要同步 pack/deser 的引用键表（REF_KEYS）**。
- **2v2 改造切入点 = battle.js**（README 路线图）：Battle 硬编码 player/foe 两实体（reset 里构造），渲染与 HUD 同样假设 2 实体——2v2 第一步是多实体化（fighters 数组 + 分队 + 目标选择），**目前没有 mode 标志**（联机走 `battle.net` 布尔，别混淆）。
- 持久化统一走 `js/core/storage.js`，命名空间 `layaclash.`——**改键名等于丢玩家数据**。

## HTML/CSS 与 JS 的契约（改名前先查这里）

- JS 动态类名：`hidden / on / active / ready / no-energy / pop / held / grabbed / lose / touch-mode / no-hints`；播报类 `announce(cls)` 用 `''`、`ko`（`.small` 样式备用）。
- JS 写入的 CSS 变量：`--p`（冷却环 conic）、`--fill`（滑杆进度）、`--bc`（天赋分支色来自 talents.js 的 data.color）。
- `Input.setSkillLabels` 直接写 `textContent` → `.tbtn-skill` 按钮必须保持纯文本子节点（不能塞内层 span）。
- index.html 契约：id 被 JS 按名取用（`$('sk-1')`、`getElementById('game')` 等），**改 id 必同步 js**；新增屏幕除加 section 外还须在 `screens.js` 顶部 `SCREENS` 数组登记 id，否则 `showScreen` 永远不显示它，`[data-go]` 按钮则由 initNavigation 自动接线。
- CSS 令牌与 Canvas 配色是**两套**：画布 hex 硬编码在 JS——选手色 battle.js:34-35（`#3df2ff`/`#ff3c5f`，必须与 `--acc`/`--foe` 一致）、特效金散布 render·fx·battle、分支色在 talents.js `data.color`（注入 `--bc`）；**换主题强调色要 JS/CSS 两头同步**。
- 设计系统（css/base.css 头注）：中性石墨底 + **单强调青 `--acc`**；语义色各表一意——红=对手/危险、金=成就/传奇、紫=干扰、钢=中性资源。别加新色相或彩虹按钮；触控钮统一中性、仅攻击组带青边。
- 战斗结算若改：events/actions 类双轨在 layaok 侧的约定不适用这里，本作 UI 只消费 `snapshot` 与 DOM 类名。

## git 与文档

- 本目录是**嵌入仓库**（origin: `github.com/chyyl/laya-clash`，`main` 直推，无 CI/PR 流程）；父级 kimi 仓库不得 `git add` 本目录（见 kimi/AGENTS.md）。
- 提交信息英文祈使句（`Add ...` / `Refine ...`，与 git log 一致）。
- 输出与代码注释**禁 emoji/生僻符号**（工作区规则，终端 GBK）。
- README 是用户面文档：玩法、操作表、测试项数都写在里面，改了要同步。
