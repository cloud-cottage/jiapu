# 系统深色模式 token 锁定（喰色唯一主题）— 规格（theme-light-pin.spec.md）

> **本册性质**：**前端主题类制度条目**（新立分册 · 2026-10-17）。登记「**本站只做喰色主题 ⇒ 在系统深色偏好下把 TDesign token 钉回喰色值**」这一**制度判决**，以及其**唯一的落点、唯一的拐点、可判负判据、已知偏差与未测面**。
> **唯一真源声明**：`--td-*` token 锁定口径**只在本册**。`docs/home-sort-search.spec.md` §17-3 只**指向**本册（**不复写判据** —— 两处各写一套必然判负口径分叉）。
> **行号口径**：本册行号 = **落笔时 `awk 'NR==n'` / `grep -n` 的实取输出**（`@tdesign/uniapp@0.10.3`）。依赖升级或文件变动会使行号漂移 ⇒ **判负前按符号名重新定位**（`--td-text-color-placeholder` / `jp-theme-pin` / `td-light-pin`），**不得**以「行号对不上」判负。
> **上线事实**：代码 = `5045add`（已推 `main` · Vercel 已部署 · 生产 `www.jiapu100.com` 已验）。

---

## 1. 一句话

**TDesign 的 `theme.css` 自带一个 `@media (prefers-color-scheme: dark)` 块，会把组件语义色（含 `--td-text-color-primary` / `-placeholder`）翻成白色；而本站页面底色是硬编码暖米 `rgb(255,253,248)` ⇒ 系统深色模式下「白字压米白底」，输入内容与 placeholder 双双不可见。制度判决 = 不做真深色主题，只在 dark 偏好下把 136 条 `--td-*` 钉回 light 值。**

---

## 2. 为什么不能做「真深色主题」（**制度判决 · 硬**）

**裁定：本站不提供深色主题；在系统深色偏好下表现为「与喰色完全一致」。**

**（一）本站是单主题（喰色）站点，没有第二套色板。**
- 页面 / 组件色值**全部是硬编码喰色**，例：首页输入框 `background:#FFFDF8; border:1px solid #E0D5C8`（`frontend/src/pages/index/index.vue:880`–`:881`）；搜索按钮 `#8B4513`（同文件 `:893`）；地区胶囊 `#FFFDF8` / `#8B4513`（`frontend/src/components/region-filter/region-filter.vue:129`–`:137`）；下拉底 `#FFFDF8`（同文件 `:173`）。
- 全站**不存在**「深色」色板、`data-theme` 切换、`themeVars` 双套映射，也**没有**用户可见的主题开关 ⇒ 「深色主题」不是一个**已实现但坏了**的东西，而是**从未设计**的东西。

**（二）TDesign 那个 dark 块不是「本站深色主题」，只是组件库语义色的翻转。**
- 证据：`frontend/node_modules/@tdesign/uniapp/dist/theme.css`（467 行）的 dark 主块在 `:167` 起，选择器 `:169` `:root` / `:171` `page` / `:172` `.page`，其中 `--td-text-color-primary`（`:298` ← `var(--td-font-white-1)`）、`--td-text-color-secondary`（`:299`）、`--td-text-color-placeholder`（`:300` ← `var(--td-font-white-3)`）。
- 它翻的是**组件 token**，**不知道本站页面底色**。本站页面底色不随它翻 ⇒ 必然产生**混合态**。

**（三）混合态（组件翻 / 页面不翻）比「完全不翻」更糟 —— 这才是「不能做」的核心。**
- **首页 / 搜索类页面**：底 = 暖米 `rgb(255,253,248)`（`index.vue:880`），字 = 白 ⇒ 打的字与 placeholder **均不可见**；实测对比度 **1.01:1**（**等于全不可读**，不是「略淡」）。
- **登录 / 注册 / 后台**：TDesign 容器（`t-cell` / `t-form` 一系）**整块翻 `#242424`** ⇒ 页面里出现一块**孤岛深色**，周围仍是暖米；视觉上是缺陷，不是主题。
- **要修成「真深色」，代价与范围**：① 需要一整套喰色**对偶深色板**（页面硬编码色值逐处双写或改走变量：本仓 `frontend/src/**` 内 `#FFFDF8` / `#8B4513` / `#E0D5C8` / `#A1887F` 等散落在多页）；② 需要组件 token 的**逐条映射**（不能直接吃 TDesign dark 值，那是蓝调语义色，与喰色不同族）；③ 需要**逐页重验几何 + 对比度**（本仓已有 §15 / §16 的几何基线，全部要重跑两档）。
- ⇒ **在无需求、且混合态是净损害的前提下，制度上是「不做」，不是「待做」**。**任何人以「dark 下字看不见」为由来提「做深色主题」，本册的答复是：先锁成喰色（本册），深色主题须另立需求单并逐页验收 —— 不得把「锁成喰色」当临时补丁，它是本站的最终形态。**

---

## 3. 修法与**唯一拐点 `uni-page-body`**（**本节是全册最重要的技术事实**）

### 3-1 落点

**新文件 `frontend/src/styles/td-light-pin.css`（164 行 · 自动生成，勿手改）**
- 头注释 `:1`–`:20`（生成方式 / 理由 / 选择器说明 / 引入位置）。
- `@media (prefers-color-scheme: dark) {` `:22`。
- 选择器组 `:23`–`:26`：
  - `:23` `:root:root` → H5 的 `<html>`（theme.css 写 `:root`）；
  - `:24` `page:not(#jp-theme-pin)` → 小程序 / 编译前的 `page`；
  - `:25` **`uni-page-body:not(#jp-theme-pin)` → H5 的真实落点（见 §3-2，缺这条必不生效）**；
  - `:26` `.page.page` → 页面根节点自带 `class="page"` 的页面（如 `pages/person/detail`）。
- 声明体 `:27`–`:162`，**共 136 条 `--td-*`**（现证：`grep -c '^    --td-' frontend/src/styles/td-light-pin.css` ⇒ **136**）。关键三条：`--td-text-color-primary: var(--td-font-gray-1)` `:137` · `--td-text-color-secondary: var(--td-font-gray-2)` `:138` · `--td-text-color-placeholder: var(--td-font-gray-3)` `:139`。
- 闭合 `:163` / `:164`。

**引入位置 `frontend/src/main.ts`**
- `:5` `import '@tdesign/uniapp/theme.css';`
- `:6`–`:8` 注释（**顺序不可反**）
- `:9` `import '@/styles/td-light-pin.css';` ⇒ **必须晚于 `:5`**，否则被 theme.css 覆盖。
- 说明：`main.ts:7` 的注释仍写「用 `:root:root` 钉回」—— **该注释只是不完整**（未提 `uni-page-body` 拐点），**实际生效的主选择器是 `:25`**；本册以 CSS 落点为准，**注释不得作为判据依据**。

### 3-2 **拐点：token 翻转发生在 `<uni-page-body>`，不在 `<html>`**（现证 · 双向）

1. **源码侧**：`theme.css:171` 的 dark 块选择器是 **`page`**（不是 `:root` 单独）。
2. **构建侧（铁证）**：uni-app 的 H5 编译会把 **`page` 选择器改写为 `uni-page-body`**。构建产物 `frontend/dist/build/h5/assets/index-DeIYpIfZ.css` 中：
   - theme.css 的 dark 主块被编译成 `@media (prefers-color-scheme: dark){:root,uni-page-body,.page{…`（该串起始偏移 **17564**）⇒ **token 的实际翻转点是 `uni-page-body`**；
   - 本仓的锁定块被编译成 `@media (prefers-color-scheme: dark){:root:root,uni-page-body:not(#jp-theme-pin),.page.page{…`（偏移 **28489**）—— 注意源码 `:24` 的 `page:not(#jp-theme-pin)` 与 `:25` 的同名规则在产物里**合并成同一条 `uni-page-body:not(#jp-theme-pin)`**（`page` → `uni-page-body` 后重复，构建去重）。
3. **推论（制度原文）**：**只在 `:root` / `html` 上压，压不到 `uni-page-body`。** 因为 CSS 变量在**元素自身**的就近作用域求值：`uni-page-body` 上被 dark 块重新赋值后，`<html>` 上的值再对也无济于事。⇒ **锁定选择器必须含 `uni-page-body:not(#jp-theme-pin)`；`#jp-theme-pin` 只是一个恒不存在的 id，用来把特异性抬到 `(0,1,1)` 压过 `(0,0,1)` 的 `uni-page-body`，它不匹配任何元素。**
4. **同一拐点在小程序端不成立**（mp 无 `prefers-color-scheme`，且无 `uni-page-body` 元素）—— **未验，见 §6**。

### 3-3 生成方式（**不得手抄**）

- 一次性脚本逐行解析 `theme.css` 的 **light 块**（`@media (prefers-color-scheme: light)` 起 `:2`；与组件块 light `:439`–`:447`），把 `--td-*` 声明**原样搬运**进锁定块 —— **只搬 light 已定义的值，不发明值、不改值**。
- 判据 T6 据此可机器自查（条数 + 逐条可比）。
- **升级 `@tdesign/uniapp` 后必须重跑生成器**（新增 token 若只出现在 dark 块 ⇒ 见 §5-③）。

---

## 4. 判据（**可判负**）

| # | 判据 | 通过条件 | 判负条件 |
|---|---|---|---|
| **T1** | **token 逐字相等** | 强制 `prefers-color-scheme: dark` 与 `light` 两档下，`getComputedStyle(<目标元素>).getPropertyValue('--td-text-color-primary')` 与 `…-placeholder` 的**值字符串逐字相等**（现测两档均为 `rgba(0,0,0,0.9)` / `rgba(0,0,0,0.4)`） | 任一档取到 `var(--td-font-white-*)` 或其解析结果 ⇒ **判负**（= 锁定未覆盖到该元素的作用域，多半缺 `uni-page-body` 那条） |
| **T2** | **渲染色与对比度** | 输入框内**实际文字**与 **placeholder** 的 `color` 计算值两档相等；对比度 dark 档 = light 档（现测 primary **17.24:1**、placeholder **2.84:1**） | dark 档对比度 **< 2.0**（≈ 不可读，现盘坏态 = **1.01**）⇒ 判负；或两档读数不等 ⇒ 判负 |
| **T3** | **几何不变** | 四页（首页 / 登录 / 注册 / 后台）**全部目标元素 rect 逐值相等**（`x,y,w,h` 两档差 ≤ **0.5px**） | 任一 rect 差 > 0.5px ⇒ **判负**（锁定块只许动颜色：`td-light-pin.css` 内**不得出现任何非 `--td-*` 声明的布局属性**） |
| **T4** | **选择器落点** | `grep -c 'uni-page-body:not(#jp-theme-pin)' frontend/src/styles/td-light-pin.css` **≥ 1**；且构建产物里 theme.css 的 dark 块选择器含 `uni-page-body`（本例 `:root,uni-page-body,.page`） | 锁定块选择器只有 `:root` / `html` ⇒ **必不生效，判负**（**这是本册唯一「看起来对、实际全错」的形态**） |
| **T5** | **引入顺序** | `main.ts` 中 `td-light-pin.css` 的 import **行号 > theme.css 的 import 行号**（现 `9 > 5`） | 顺序反 ⇒ 构建后 pin 在前、被 theme.css 覆盖 ⇒ **判负**（类型检查 / 构建**都能过**，见 T 类通病 §16-2 同族） |
| **T6** | **搬运完整性（机器自查）** | 锁定块 `--td-*` 条数 = **136**，且与生成器从 light 块提取的集合**逐条同名同值**（`grep -c '^    --td-'` 现证 **136**） | 条数 ≠ 136 且**未在本册登记原因**（依赖升级新增 / 删除 token）⇒ 判负 |
| **T7** | **dark-only 残留集合** | 仍取 dark 值的 token **恰为 §5-③ 列的 6 项**（theme.css `:452` / `:454` / `:456` / `:457` / `:458` / `:465`） | 新增第 7 项 ⇒ **须同批回改 §5-③**，否则判负（**只放宽判据、不回改本册 = 判负**） |

- **判据效力层级（硬）**：**T4 / T5 是 T1 / T2 的前置条件** —— T4/T5 不过时 T1/T2 的「读数相等」可能是**假相等**（例如两档都取到了错误作用域的值）。⇒ **报告顺序必须是 T4 → T5 → T1 → T2 → T3 → T6 → T7**。
- **不得用「页面截图看着一样」代替 T1 / T2**：截图无法区分 `0.4` 与 `0.45` 的 placeholder，也读不出版本号级差异。

---

## 5. 已知偏差（**三项 · 如实登记 · 不得读成「已修」**）

### ① placeholder 对比度 **2.84:1**（低于 3:1，也远低于 AA 4.5:1）

- 成因：TDesign 默认 `--td-text-color-placeholder = var(--td-font-gray-3) = rgba(0,0,0,0.4)`；**light / dark 两档同值**（锁定后同值，锁定前 dark 档是白的更糟）。
- **本单独立复算**（合成到页面底 `rgb(255,253,248)`）：alpha 0.4 ⇒ 合成色 `#999895` ⇒ **2.84:1**（与执行侧读数一致）；要到 **3:1** 需 alpha ≳ **0.45**（复算 0.45 ⇒ `#8C8B88` ⇒ **3.35:1**）。
- **本批未改**（未动 token 值 —— 改 alpha 会同时改变 120+ 处组件的 placeholder 观感，属**主题级改动**，须另立单）。
- **判据（可判负）**：现役读数恒 **2.84 ± 0.05**；若哪天读 > 2.9 ⇒ 说明 token 被改而**本册未回改** ⇒ 判负（**读数变化须回改本节，不得只放宽判据**）。

### ② **320px 宽下 placeholder 被截断**（未缩写 · 待裁）

- 预算（执行侧实测）：同排后 375 下输入区可用 **156px**；**320 下可用 101px**，而 `人物 / 家族 / 堂号`（14 字符含空格）需 **133px** ⇒ **截断**（尾字不全）。
- **本批未缩写、未缩字号**（改字面会与 §17-1 的 L4 逐字判据冲突，须 Kevin 裁）。
- **候选（未裁 · 本册不预填选择）**：缩字面 / 降字号 / 允许截断。
- **判据（可判负）**：320 档 `input.scrollWidth <= input.clientWidth` **当前不成立** ⇒ 登记为**已知偏差，不构成 L4 判负**；**但**若后续有人宣称「320 下 placeholder 完整可见」⇒ **必须**给出 320 档子判据与实测，否则判负。375 档必须**不截断**（`scrollWidth <= clientWidth` 为真）。
- **真源归属（硬）**：本项属**搜索行口径面** ⇒ **明细真源 = `docs/home-sort-search.spec.md` §17-5 ②**；**本节只摘要**（数字 / 判据以该处为准，**两处不得各写一套预算**）。

### ③ theme.css 里 **6 条只在 dark 块出现、light 块无对应值**的 token（锁定后仍取 dark 值）

- 现证（`theme.css`，light 块 `:439`–`:447` 只覆盖了 `--td-picker-transparent-color` / `--td-switch-dot-disabled-color` / `--td-switch-loading-color` 三条，其余 6 条无 light 对偶）：

| # | token | theme.css | dark 取值 | 影响面 |
|---|---|---|---|---|
| 1 | `--td-button-primary-disabled-color` | `:452` | `var(--td-font-white-4)` | `t-button` 禁用态（主色按钮） |
| 2 | `--td-skeleton-animation-gradient` | `:454` | `rgba(255, 255, 255, 6%)` | 骨架屏扫光 |
| 3 | `--td-slider-dot-bg-color` | `:456` | `var(--td-gray-color-4)` | 滑块圆点 |
| 4 | `--td-slider-dot-disabled-bg-color` | `:457` | `var(--td-gray-color-11)` | 滑块圆点（禁用） |
| 5 | `--td-slider-dot-disabled-border-color` | `:458` | `var(--td-gray-color-12)` | 滑块圆点（禁用描边） |
| 6 | `--td-progress-circle-inner-bg-color` | `:465` | `var(--bg-color-page)` | 环形进度内底 |

- **为什么不补**：light 块**没有**它们的值 ⇒ 「补」等于**发明值**（违反 §3-3「不发明值」）；且上述组件在本站页面矩阵中**未全部出现**（滑块 / 环形进度**未扫**，见 §6）。
- **判据（可判负）**：即 T7（集合恰为 6 项）。若某页**确实**因这 6 条中的某条出现「深色控件压在喰色底上」的可见缺陷 ⇒ **不得**在本册外私补值，须**另立需求**（补值 = 主题级改动）。

---

## 6. 未测面（**如实登记 · 不得读成「已验」**）

| # | 未测面 | 现状 / 后果 |
|---|---|---|
| **①** | **小程序端深色 token 未测** | mp **无 `prefers-color-scheme`**；`td-light-pin.css` 的 `@media` 在 mp 编译后是否被整体丢弃、`page:not(#jp-theme-pin)` 是否命中 `page` 元素 —— **均未验**。⇒ **小程序不得声称「深色已锁」** |
| **②** | **真机深色模式未验**（日 / 夜切换、低电量省电模式） | 现有证据全部来自 **Chrome DevTools 的 `prefers-color-scheme` 强制模拟**；iOS / Android 系统级深色（含「跟随日落自动切换」）**未在真机上看过一次** |
| **③** | **浏览器强制深色未测** | Chrome `force-dark` / Edge 强制深色 / Samsung 浏览器「深色模式增强」等**页面级滤镜**会重绘颜色，**与 `prefers-color-scheme` 无关**，本册的锁定**对它无效或半有效** —— **未测、未判** |
| **④** | **弹窗 / 骨架屏 / picker / calendar 等组件未逐一扫** | 只验了**四页主体**（首页 / 登录 / 注册 / 后台）的输入框与文字；`t-popup` / `t-skeleton` / `t-picker` / `t-calendar` / `t-slider` / 环形进度**未逐页扫过**（对应 §5-③ 的 6 条残留） |
| **⑤** | **`td-light-pin.css` 与 `unocss` / 全局样式的特异性冲突未系统排查** | 现只覆盖 `:root` / `uni-page-body` / `.page`；**若某页用内联 `style` 或更高特异性类覆盖了同一 token**，锁定会被绕过 —— **未逐页 grep** |
| **⑥** | **T6 的「生成器」未入仓** | 生成脚本是**一次性执行**、**未提交**（`td-light-pin.css:2` 注明「自动生成，勿手改」）⇒ 升级依赖后**无法一键重跑**，须重写脚本（**已知缺口**） |

---

## 7. 边界与登记

- **本册性质**：**纯文档**。落笔时**未改** `frontend/src/styles/td-light-pin.css` / `main.ts` / 任何代码 / 真源；**未跑**构建 / 测试 / 部署；**本单作者未执行** `git add` / `commit` / `push`。
- **版本状态（如实登记 · 重要）**：落笔期间**并发进程推动了 HEAD** ⇒ 本册已被 **`6a055d4`** 收录（同批 `docs/home-sort-search.spec.md` §17）；**本单作者未发起该提交、未 `push`**。复核请以 `git log -1 -- docs/theme-light-pin.spec.md` 为准。
- **同批兄弟节**：`docs/home-sort-search.spec.md` **§17**（搜索行同排 · 地区索引空闲预取 · placeholder 文案）—— 其中 **§17-3** 只**指向**本册。
- **与既有册的关系**：本册**不**改 `docs/home-sort-search.spec.md` §15（传输预算 / 页脚）与 §16（搜索行 / 地区筛选）任何旧行；不引 `docs/economy.spec.md` 任何口径。
- **索引未加**：`AGENTS.md` 的文档索引区**未追加本册行**（本单范围为「只回写规范册」，索引登记留待下一单；**不构成口径冲突**）。
