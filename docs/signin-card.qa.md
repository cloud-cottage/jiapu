# 每日签到卡游戏化 UI —— 独立质检报告（Neng · 单轮）

- **质检对象**：`frontend/src/components/signin-card/signin-card.vue`（新建 · 452 行）、`frontend/src/pages/mine/index.vue`（内联签到卡 → 组件引用）、`frontend/src/business/asset-text.ts`（纯追加三个展示字面/函数）
- **质检方**：Neng（独立质检 —— 不接受源码扫描当结论；渲染判据一律由自建 oracle 在 headless Chrome `file://` 下真渲染取证）
- **本册性质**：独立质检报告（`AGENTS.md` §0-5：**只追加、不回改**）。全部读数在 **/tmp 冻结快照**（`/tmp/jiapu-signin-qa`）取得，**真源零写入**；仓内他单在飞（tree-rank 域）文件一律「在途不在面」。Oracle 与夹具为 **Neng 自建**（`/tmp/signin-qa-oracle`，未照搬实现方脚本）。

---

## ① 快照自证（开工现证 · 2026-10-21 11:2x CST）

- 冻结手法：`cp -a /Users/kevin/bistro/jiapu /tmp/jiapu-signin-qa`（全量 944M，含 node_modules 与 .git）。
- 快照 HEAD = `b50ce9699a9096cdbc44f52f964228ba24b6af40`（`git rev-parse HEAD` 实测）。
- 快照 `git status --porcelain=v1` 实测 14 行：`M` = cloudfunctions/compat-api/{index.js, lib/friend-ops.test.js, lib/geo-stats.js, lib/task-center.test.js}、frontend/src/business/{api.ts, asset-text.ts, index.ts}、frontend/src/pages/index/index.vue、frontend/src/pages/mine/index.vue、package.json；`??` = cloudfunctions/compat-api/lib/{tree-rank-index.js, tree-rank-index.test.js, tree-rank.js}、frontend/src/components/signin-card/。
  - 其中**本批对象** = `?? frontend/src/components/signin-card/` ＋ `M frontend/src/pages/mine/index.vue` ＋ `M frontend/src/business/asset-text.ts`；其余 11 项为**他单在飞**（tree-rank 域），不在本册质检面。
- `config/tree-meta.json` md5：开工 = **`4728046764516172d8e6d584c2b3d7cc`**，收工复测 = **同值**（判据 7 详证见下）。

## ② 判据 1~9 逐条读数（每条真读数）

**判据 1（快照自证）**：见 ①。✅

**判据 2（独立复跑四件套，均在 /tmp/jiapu-signin-qa）**：✅
- `cd frontend && npm run type-check`（vue-tsc --noEmit）⇒ **EXIT 0**。
- 仓根 `npm test` ⇒ TAP 汇总逐字：`1..842` / `# tests 842` / `# pass 842` / `# fail 0` / `# cancelled 0` / `# skipped 0` / `# todo 0`（duration_ms 6080）⇒ **EXIT 0**。与派单方声明的在飞基线「842/0」**一致** ⇒ 本批**无基线漂移、例数未减少**（沙箱自证条 `# ok 842 附 沙箱自证：测试根在 /tmp 副本…` 在列）。
- `npm run build:h5` ⇒ **EXIT 0**（DONE Build complete）。
- `npm run build:mp-weixin` ⇒ **EXIT 0**（照录：main-package-slim 减重合计 572,213 B）。
- `python3 scripts/mainpkg_bytes.py dist/build/mp-weixin` ⇒ **`main_package_bytes` = 2,023,045 ≤ 2,097,152**（1.929 MiB；主包 242 文件；对 2 MiB 线余量 74,107 B）。✅ S-9 主包判据过。

**判据 3（独立渲染验证 · 自建 oracle）**：oracle = `/tmp/signin-qa-oracle`（vite 5.2.8 + @vitejs/plugin-vue 打包被检 SFC，JS/CSS 内联成单文件 `qa.html`，headless Chrome `--headless=new --dump-dom file:///…qa.html` 取证；断言回写 `<pre id="qa-report">` JSON）。夹具对齐派单口径：d1 已签 / d2 已签＋已补（madeupDate=2026-10-16）/ d3 漏签可补 / d4 今日 / d5·d6 未来（d5 基础竹片 ×10、random）/ d7 未来＋bonus 碎片 ×10；streak=3、signedToday=false；`baseItems`/`bonusItem` 经 asset-text 单点函数推导（与页面 `normalizeCalendar` 同构）。
- **base 变体：16/16 PASS**，要点读数：
  - A01 R-3 五列等宽：五列实测各 **92.00px，极差 0.00px**（≤1px）；
  - A02 S-4 r1c1 空艺术位：`.scene-art` **textContent 空串、无子元素**，位于最左上槽位；
  - A03 S-4 日格阅读序：**7/7 全对**（d1@r1c2 → d3@r1c4、d4@r2c1 → d7@r2c4，按几何 (row,col) 实测）；
  - A04 R-1 今日格唯一呼吸动画：持动画日格 **恰 1 枚 = 今日格**（computed animation-name 现证 `cell-breathe-5e012666`，scoped 重命名；环境 `prefers-reduced-motion=false`）＋橙页签类；
  - A05 漏签格：`border-style: dashed`、**无动画（animation: none）**、无 today 类、含「补签」字、可点类在；
  - A06 R-2 第 7 格页签：实测文本恰 **「第 7 天」**，无「大奖」；
  - A07 S-5/R-4 大奖列：旗标 **「连签 7 天」** ＋ **×10** 角标 ＋ 缎面 `repeating-linear-gradient` ＋ 鎏金描边 **3px** ＋ 几何实测**纵跨 2 行**；
  - A08 S-5 防双显：第 7 日格内 **0 个 ×10 角标、0 个 prize-* 元素**（bonus 只在大奖列）；
  - A09 R-5 徽章：**「已连签 3 天」**；
  - A10 随机 chip：恰 1 枚、在 d5、字面「随机」（§15-7 逐字）；
  - A11 S-7 四态类名：d1 `cell-signed`+✓+opacity<1 ／ d2 `cell-madeup`+`cell-signed`+「已补签」+✓ ／ d4 `cell-today`+橙页签 ／ d5·d6 `cell-future` 置灰；
  - A12 R-7 数量角标：d5 **「×10」**（qty>1 渲染）；
  - A13 R-6 卡底留白：padding-bottom 实测 **16px ≥ 12px**；
  - A14 S-2 emit 接线：点漏签格 / CTA / 奖励行 ⇒ emit 实录 `cell:3`、`signin`、`reward`；
  - A15 卡头字面：**「每日签到」／「轻触印章 · 领 1 片石榴籽碎片」／CTA「签」**；
  - A16 连签读数行：**「已连签 3 天 · 今日还未签到」**（三段互斥口径由页面拼装、组件透传）。
- **streak-null 变体（streak=null，即 prop 默认值/页面缺键路径）：15/16 —— A09 FAIL：徽章实测渲染「已连签 0 天」，预期不渲染 ⇒ 缺陷①（见 ③）**。
- **streak-zero 变体（streak=0）：16/16** —— 徽章渲染 **「已连签 0 天」**，符合 R-5 该半句。✅（除缺陷①外全部通过）

**判据 4（判负 · 自写变异，内存 DOM，仓外）**：三条全数翻红 ⇒ oracle 有牙。✅
- ① mut=width（第 2 列强制 min-width:260px）⇒ **A01 红**（五列实测 50/260/50/50/50，极差 210.00px；A03 阅读序连带红 = 同族几何扰动，预期联动）；
- ② mut=anim（漏签格追加 `cell-today` 类）⇒ **A04 红**（持动画日格 2 枚）＋ **A05 红**（漏签格实测 animation=`cell-breathe-5e012666`）；
- ③ mut=tab（第 7 格页签文本改「第 7 天 · 大奖」）⇒ **A06 红**（页签含「大奖」）。

**判据 5（数据流零改动核验）**：✅
- `git diff --numstat HEAD`：`asset-text.ts` = **22 增 / 0 删（纯追加）**；`mine/index.vue` = 34 增 / 165 删。
- `asset-text.ts` 追加块逐行核对 = 注释 ＋ `SIGNIN_BONUS_FLAG='连签 7 天'` ＋ `SIGNIN_CELL_MADEUP='已补签'` ＋ `signinStreakBadgeText()`（恒「已连签 N 天」，非法 ⇒ `—`）；**既有行零删改**（diff 上下文证明）。
- `mine/index.vue` 逐 hunk 归类（6 hunk）：① 模板 hunk（内联签到卡整体删除 → `<signin-card>` 八 props／三 emit 接线）；② import hunk（迁出 8 个纯展示字面/函数：assetKindIconSrc、SIGNIN_TITLE、SIGNIN_HINT_PENDING、SIGNIN_REWARD_LINK、SIGNIN_CELL_CHECK、SIGNIN_RANDOM_CHIP、signinQtyBadge、signinDayLabel；保留业务动作侧 import；新增组件 import）；③ 新增 `madeupDate` ref（纯展示态）；④ loadInventory 登出分支 +1 行清 madeupDate；⑤ doMakeup 成功回调 +2 行置 madeupDate（**showToast / loadInventory / applySigninPayloadReadings 请求流原样**）；⑥ 样式 hunk ×2（`.sign-*`/`.cal-*` 与夜间覆写删除＋注记）。**归入「请求与判据」类的 hunk = 0**：请求函数（fetchAssetsSummary/postSignin/postSigninMakeup）、已签判据（服务端 signin_date / UTC+8）、补签二次确认、409 处理、`normalizeCalendar`、`streakText` 三段拼装 **全部不在 diff 中**。
- 状态词与 §15-7 逐字比对：随机 chip =「随机」✓；漏签可点补签词 =「补签」（复用既有 `SIGNIN_MAKEUP_TITLE`）✓；连签读数 =「已连签 N 天」/「今日还未签到」✓；第 7 格金边 = 3px `#F2CE7B` ✓；已签打勾 ✓＋置淡（opacity 0.62）✓；当前日高亮 = `#FF8C1A` 橙页签 ✓。新字面「连签 7 天」「已补签」为 §15-7 未有的版式新增，已按「单点 asset-text.ts」纪律登记（纯追加，无冲突）。
- 他单在飞文件交叉核验：`git diff HEAD -- api.ts index.ts types.ts` 中 **「signin」命中 = 0** ⇒ 该三文件在飞改动与本批无关（S-3 的「零 API·类型改动」对本批成立）。

**判据 6（mp 产物含新口径字面）**：✅
- `dist/build/mp-weixin/components/signin-card/` 四件产物（wxml/wxss/js/json）**存在**；`pages/mine/index.json` 实测 `usingComponents` 引用 `signin-card/signin-card`。
- 新字面抽查：「连签 7 天」「已补签」均实测命中 `dist/build/mp-weixin/business/asset-text.js`（文案单点随包）；组件 wxml 实测含 `scene-prize`/`prize-flag`/`scene-art`/`cell-tab-today` 类。
- 「挂于」等家谱图字面：实测仅命中 `business/pedigree.js`（家谱图域），签到卡页不适用——与预期一致。

**判据 7（真源零写入）**：✅ `config/tree-meta.json` md5 开工 = 收工 = **`4728046764516172d8e6d584c2b3d7cc`**；收工 `git status --porcelain` 与开工**逐行一致**；全程仅读取，构建/测试/oracle 全部发生在 /tmp。本册落盘为派单指定的唯一例外：**新建 `docs/signin-card.qa.md`**（不回改其它任何文件）。

**判据 8（残留抽查）**：✅ 三被检文件 `console.log`/`debugger` = **0 命中**；仓内 src 无 QA 探针字串（`signin-qa-oracle`/`QAJSON`/`out-mut` = 0 命中）；判负探针全部活在 /tmp 的 oracle 页（内存 DOM 变异，未落仓）；未用 import：迁出后 mine 页保留 import 均 in-use（`SIGNIN_HINT_DONE` 在用 ×2；type-check EXIT 0 旁证）；死样式：`.cell-hover`（hover-class 在用）、`.scene-bg`/`.scene-glow`/`.scene-vignette`（占位层在用）、`.scene-cta-press`（hover-class 在用）均非死码。

**判据 9（未测面）**：见 ⑤，如实登记。

## ③ 缺陷分级（阻塞 / 非阻塞 / 观察项）

**阻塞：无。**

**非阻塞 1 条 —— 缺陷①（R-5 streak=null 变体不过：徽章臆渲「已连签 0 天」）**
- 现象：`streak` 传 `null` 时卡头徽章**仍渲染**「已连签 0 天」；冻结口径 R-5 与组件自注释均为「缺失 ⇒ 整枚不渲染、不臆造」（signin-card.vue L183「null = 缺失 ⇒ 徽章不渲染，R-8，不臆造」、L219「streak 缺失 ⇒ 整枚不渲染（不臆造天数）」）——**实现与自身文档/口径相悖**。
- 根因：`hasStreak`（signin-card.vue L220-223）= `Number.isFinite(Math.floor(Number(props.streak))) && n >= 0` —— **`Number(null) === 0` ⇒ 判真**；徽章文字 `signinStreakBadgeText(null)`（asset-text.ts L637-640）同理得「已连签 0 天」。
- 触发面（真实可达）：① 登录后 `GET /assets/summary` 未回包的首帧（页面 `signinStreak` 初值 null）；② 旧后端/出参缺 `signin_streak` 时恒显臆造「0 天」——mine/index.vue L415-416 实证缺键即置 null 并传入组件；同窗内连签读数行正确地不渲染（streakText 为空串），两处行为不一致使徽章更显眼。
- 复现步骤：Neng oracle `file:///tmp/signin-qa-oracle/qa.html?variant=streak-null`（props `streak=null`）→ A09 断言红：`.streak-badge` 实测存在、文本「已连签 0 天」（base/zero 变体同断言绿）。
- 建议修法（**一行守卫**，修后复跑 streak-null 变体应 16/16）：`hasStreak` 增加 `props.streak !== null &&` 前置（或将「缺失判别」与徽章文字共源）；**不动请求与判据**。
- 定级理由：纯展示面错误、无数据流危害，故非阻塞；但属冻结判据 R-5 的硬条款未过，**构成结绿拦截项**。

**观察项（4 条，均非缺陷）**
1. scoped 动画名编译期重命名（实测 `cell-breathe-5e012666`）：uni/插件机制使然，非缺陷；本册 oracle 断言采用「包含匹配」并留痕，供后人复用。
2. 组件内 `/* #ifdef H5 */` 动效降级块（`prefers-reduced-motion`）依赖 uni 条件编译管线；本册独立 vite 打包下该注释不剔除、桌面 Chrome 默认 no-preference 未触发降级——真机/uni 管线行为未单测（进 ⑤）。
3. CTA 字形「签」直接写在组件（L215，注明「原印章字形迁入，非文案句、无新增字面」）：与「字面单点」纪律的边界个案，建议保持现状并留此登记。
4. mut=width 变异令 A03（阅读序）连带翻红：同族几何扰动的预期联动，非组件缺陷（记录 oracle 行为，防误读）。

## ④ 口径 S/R 逐条符合表

| 口径 | 判定 | 读数锚点 |
|---|---|---|
| S-1 只动签到卡三文件 | ✅ | diff 面 = signin-card/（新）＋mine/index.vue＋asset-text.ts；api.ts/index.ts/types.ts 在飞 diff 0 处 signin |
| S-2 组件纯展示（props 进/emit 出，请求留页） | ✅ | A14 emit 实录；判据 5 hunk 归类「请求与判据」= 0 |
| S-3 零新增请求/零 API·类型改动/判据一字未改/文案零改动 | ✅ | asset-text 22/0 纯追加；normalizeCalendar/streakText/409/二次确认不在 diff；§15-7 逐字比对过 |
| S-4 网格 2 行×5 列、第 5 列纵跨、r1c1 空艺术位、阅读序 | ✅ | A01（五列）/A02（艺术位空·最左上）/A03（7/7 序） |
| S-5 大奖列 = 第 7 格 bonus ＋旗标；第 7 格页签无重复渲染 | ✅ | A07（旗标/×10/缎面/鎏金/纵跨）＋A08（日格 0 重复） |
| S-6 拟物三件套 | ✅ | 渐变/描边/投影全 CSS 现证（.scene-card/.prize-frame/.scene-cta 读数）；A13 硬投影卡底 16px |
| S-7 状态三重编码＋随机 chip | ✅ | A11 四态类名＋A05 漏签虚线＋A10 chip「随机」 |
| S-8 零图片＋具名占位类 | ✅ | scene-bg/glow/vignette/art 全 CSS 拟物；道具图标走既有 icons.ts 单点（非本批新增图） |
| S-9 双端通用＋mp 降级＋配色固定＋主包 ≤2MiB | ✅ | build:mp EXIT 0；`background-clip` 0 使用（仅 L287 注释）；组件无夜间覆写（mine 页旧覆写已删）；main_package_bytes = 2,023,045 |
| S-10 CSS-only 动效 | ✅ | breathe/float 纯 CSS（A04/A07）；按压 = hover-class；无 JS 动画 |
| R-1 今日唯一强高亮；漏签弱提示不抢橙 | ✅ | A04（唯一呼吸）＋A05（无动画无 today 类） |
| R-2 第 7 格页签无「大奖」 | ✅ | A06 恰「第 7 天」（判负③可红） |
| R-3 五列等宽 ≤1px | ✅ | A01 极差 0.00px（判负①可红） |
| R-4 大奖列缎面/鎏金/旗标 | ✅ | A07 |
| R-5 徽章令牌形；streak 缺失不渲染；streak=0 渲「已连签 0 天」 | **✗（null 变体）／✅（0 变体）** | streak-null A09 FAIL＝缺陷①；streak-zero A09 PASS |
| R-6 底部留白 ≥12px | ✅ | A13 = 16px |
| R-7 数量角标 qty>1 渲染 | ✅ | A12 d5「×10」 |
| R-8 网格重排如 S-4＋徽章移卡头 | ✅ | A02/A03＋A09（徽章在卡头，网格内无徽格） |

## ⑤ 未测面（如实登记，不得当已验）

1. **真机触屏 / iOS 长按**：oracle 用合成 click（`MouseEvent`），hover-class 按压位移、触屏滚动、iOS 长按行为未实机验。
2. **guest（未登录）目视**：页面 `v-if="isAuthenticated()"` 守卫分支未做渲染层验证（组件无登录判据，属页面职责）。
3. **微信开发者工具真机预览 / 上传**：本册仅对 `dist/build/mp-weixin` 做静态抽查（产物存在性＋字面＋体积），未进开发者工具实跑。
4. **真实登录态数据渲染**：`GET /assets/summary` 真出参 → `normalizeCalendar` → 组件全链路未用真实后端数据跑通（oracle 用等构夹具）。
5. **夜间模式整页目视**：组件配色固定（S-9）已由「无覆写」静态核验，但整页「他卡反转、签到卡不反转」的观感未目视。
6. **`prefers-reduced-motion` 降级实跑**：读数取自桌面 Chrome 默认 no-preference；reduce 开启时的降级未实测。
7. **uni 条件编译差异**：`/* #ifdef H5 */` 块在小程序端的实际剔除行为以 uni 编译器为准，未单测。

## ⑥ 落盘文件与节号（现证）

- 本册 = `docs/signin-card.qa.md`（新建 · 全册 · 本行所在文件即落点）。
- 过程证据（**不入仓**，均在 /tmp）：冻结快照 `/tmp/jiapu-signin-qa`；diff 存档 `/tmp/qa-diffs/mine.diff`、`/tmp/qa-diffs/asset-text.diff`；oracle 及六次 dump 原始输出 `/tmp/signin-qa-oracle/{index.html, main.js, build.mjs, qa.html, out-base.html, out-streak-null.html, out-streak-zero.html, out-mut-width.html, out-mut-anim.html, out-mut-tab.html}`。
- 本册只新增上述一个仓内文件；**未回改**其它任何文件；未 `git add`/`commit`/`push`；未部署；未起服务、未占端口（headless Chrome 为 `--dump-dom` 短进程取证）。

## ⑦ 一句话结论

**暂不结绿**——四件套（type-check EXIT 0 / 842 tests 全过 / build:h5 EXIT 0 / build:mp EXIT 0 且主包 2,023,045 B ≤ 2 MiB）与自建 oracle 渲染判据 15/16 全绿、数据流零改动、真源零写入，唯一拦截 = 非阻塞缺陷①（R-5 streak=null 徽章臆渲「已连签 0 天」，一行守卫可修）；修复并复跑 streak-null 变体后即可结绿。

## ⑧ 复检（A09 关账 · 窄复检 · 2026-10-21 12:00~12:01 CST）

- **范围**：复检缺陷①（A09 / R-5：streak=null 时卡头徽章臆渲「已连签 0 天」）的关账结论；oracle 全部 16 条断言（A01~A16）于 base / streak-null / streak-zero 三变体全数复跑，另加 1 条负控；build:h5 / build:mp 未重跑。
- **真源零写入**：`config/tree-meta.json` md5 开工（11:59）= 收工（12:01）= **`4728046764516172d8e6d584c2b3d7cc`**；HEAD 仍 `b50ce9699a9096cdbc44f52f964228ba24b6af40`；`git status --porcelain` 15 行（他单在飞 11 + 本批 3 + 本册 1）与开工一致；**未** `git add`/`commit`/`push`；未起服务、未占端口。

**8.1 oracle 重建（不沿用旧 bundle）**

- 新构建目录 `/tmp/signin-qa-oracle-recheck`（旧 `/tmp/signin-qa-oracle` 原样封存仅作对照）；`node build.mjs` 完成于 **2026-10-21 12:00:23 CST**。
- 打包源 = **当前工作区** `frontend/src/components/signin-card/signin-card.vue`（**453 行**；sha256 `ced792469124293c62c7929b60df362de8634861aa87efdced4800d5aed2e8ff`），alias `@` 亦指向当前工作区 `frontend/src`——**非** `/tmp/jiapu-signin-qa` 冻结快照。产物 `qa.html` = **79,309 B**（console：js=index-DypF0rJb.js、css=index-JXK4JEpN.css；bundle 内旧快照路径串 `jiapu-signin-qa` 命中 = **0**）。
- 取证：headless Chrome `--headless=new --dump-dom --virtual-time-budget=3000 file:///tmp/signin-qa-oracle-recheck/qa.html?variant=…`，断言 JSON 回写 `<pre id="qa-report">`；原始 dump = `/tmp/signin-qa-oracle-recheck/out-{base,streak-null,streak-zero,mut-width}.html`。

**8.2 A09 修复前 → 修复后**

| 时点 | bundle 源 | streak-null 变体 | A09 读数 |
|---|---|---|---|
| 首轮 11:42（修复前） | /tmp 冻结快照 | 15/16 | **FAIL**：`.streak-badge` 在 DOM、文本「已连签 0 天」 |
| 本轮 12:00（修复后） | 当前工作区 | **16/16** | **PASS**：`absent`；DOM 内 `class="streak-badge` 节点数 = **0**（base / streak-zero 各 1，对照成立） |

- 修复码现证：`signin-card.vue` L220-226 `hasStreak` 首行 `if (props.streak === null || props.streak === undefined) return false;`；其后 `Number.isFinite(Math.floor(Number(props.streak))) && n >= 0` **原样未动**。
- **行为面零扩散（sanity）**：
  - streak=3（base）：**16/16**，A09 PASS 文本「已连签 3 天」，A16「已连签 3 天 · 今日还未签到」；
  - streak=0：**16/16**，A09 PASS 文本「已连签 0 天」（0 仍渲染，未被守卫误伤），A16「今日还未签到」；
  - 负控 mut=width：**15/16**、A01 **FAIL**（五列 114.00 / 260.00 / 114.00 / 114.00 / 114.00，极差 146.00px）⇒ 重建 oracle 仍有牙，非「恒绿」空转。
- 读数环境：本轮 headless 默认视口 800×600，五列各 **143.19~143.20px、极差 0.02px**（首轮 92.00px 系视口宽度不同；R-3「等宽 ≤1px」仍过，A09/A16 不受影响）。

**8.3 独立回读（当前工作区 · 12:00~12:01）**

- `cd frontend && npm run type-check` ⇒ **EXIT 0**（输出仅 npm 横幅，无诊断行）。
- 仓根 `npm test` ⇒ **EXIT 0**；TAP 逐字：`1..842` / `# tests 842` / `# pass 842` / `# fail 0` / `# cancelled 0` / `# skipped 0` / `# duration_ms 5819.667625`。（注：test 清单已含他单新增 `tree-rank-index.test.js`，例数仍 842/0，与本批基线一致。）
- `cd frontend && python3 scripts/mainpkg_bytes.py dist/build/mp-weixin` ⇒ **EXIT 0**；`main_package_bytes` = **2,023,092 ≤ 2,097,152**（1.929371 MiB；242 文件；`over_2MiB_by` = -74,060）。
- 未重跑 `build:h5` / `build:mp-weixin`（本窄复检未要求；mp 主包读数取现存 `dist/build` 产物）。

**8.4 落盘**

- 本节为 `docs/signin-card.qa.md` **追加的第 ⑧ 节**（首轮 ①~⑦ 原文未改一字；本节之前 131 行）。除追加本节外，**未新增/修改任何仓内文件**。

**8.5 未测面（不变，见 ⑤）**

- ⑤ 七条全部未复测：真机触屏 / iOS 长按、guest 目视、微信开发者工具真机预览、真实登录态数据全链路、夜间模式整页目视、`prefers-reduced-motion` 实跑、uni 条件编译差异。
- 本节新增边界备注：A09 复跑基于 **vite 独立打包 + 桌面 Chrome `file://`** 的重建 bundle，与 uni / 小程序真机管线仍有差异（同首轮口径）。

**8.6 结论**

- **A09 关账**：✅ 修复前红（15/16，臆渲「已连签 0 天」）→ 修复后绿（16/16，徽章不渲染）；streak=3 与 streak=0 两路 sanity 均 16/16，行为零扩散；负控仍可翻红。
- **结绿：可以结绿（一锤定音）**。首轮唯一结绿拦截项（缺陷① / R-5）已消；本轮三项独立回读全 EXIT 0（type-check 0；842/842 全过；主包 2,023,092 B ≤ 2 MiB）。无新增阻塞、无新增非阻塞缺陷；⑤ 未测面照旧登记。
