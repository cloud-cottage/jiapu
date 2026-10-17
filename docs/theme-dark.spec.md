# 日夜模式（喰色对偶暖调暗色板）— 规格（theme-dark.spec.md）

> **本册性质**：**前端主题类制度条目**（**新立分册 · 2026-10-17**）。登记「**本站自 2026-10-17 起提供用户可见的两态主题（日 / 夜）**」的**色板、机制、生成物、关键坑、判据、已知偏差与未测面**。
> **唯一真源声明**：**夜间色板值 / token 表 / 主题机制 / 开关落点**只在本册。`docs/theme-light-pin.spec.md` **只**承载「系统深色偏好下把 token 钉回喰色」那一层（该册 §3 / §4 继续有效），**不**复写本册判据。
> **取代关系（硬 · 与旧册）**：本册**取代** `docs/theme-light-pin.spec.md` **§2 的制度判决**（原文「**裁定：本站不提供深色主题**」）—— **Kevin 2026-10-17 直接下令做日夜模式**，属**需求级变更**（不是「原判负了」）。该册 **§2 旧行原文一律保留、一字未改**，只在其文末**追加追记**（该册 **§8**）指回本册；该册 **§3-2（`uni-page-body` 拐点）/ §4（T1–T3 判据）继续有效**，并作为本册的对偶基准（夜间块**同样**必须覆盖 `uni-page-body`，见 §5）。
> **行号口径**：本册行号 = **落笔时 `grep -n` / `sed -n` 的实取输出**（`HEAD = 84c31a4`，`main`，工作区干净，`origin/main = 1709773`）。依赖升级 / 文件变动会使行号漂移 ⇒ **判负前按符号名重新定位**（`applyTheme` / `themeRef` / `uni-page-body:not(#jp-theme-pin)` / `--jiapu-column`），**不得**以「行号对不上」判负。
> **状态词（硬）**：**已实现（Kong）· 已本地提交（`84c31a4`）· 未上线（等 Kevin 放行推 `main`）· 小程序夜间模式未做**。**不得写「已上线 / 已验收 / 已通过」**。

---

## 1. 一句话

**夜间态 = 「喰色的对偶暖调暗色板」：`<html data-theme="dark">` 一个标记驱动两件事 —— ① 136 条 `--td-*` 组件 token 由生成物 `frontend/src/styles/td-dark-warm.css` 逐条翻成暖调夜间值（含 `uni-page-body` 落点）；② 各页 / 各组件自己 `<style>` 里的 `html[data-theme='dark']` 颜色段翻硬编码色。默认 `light`、只认用户显式选择、不跟随系统；纸类本体（文谱纸页 / 迁徙地图图版 / 打印页）保持浅色；canvas 绘制面（树图 / 世本时间轴）走 `themeRef` 重建 option。H5-only，小程序零改动。**

---

## 2. 本批伴随件：首页古风 banner 与 H5 窄栏（**同批下令 · 不属本册判据面**）

- **Banner**：新组件 `frontend/src/components/home-banner/home-banner.vue`（**371 行**）。三层古风横幅 —— 左线装书 / 中宣纸 / 右石榴树；左右两层 `max-width: 44%`（`:176` / `:188`）+ `filter: blur(6px)`（`:179` / `:191`）向内 mask 渐隐，纸面层 `blur(8px)`（`:98`）；高度真源 `--banner-h: min(520px, 48vh)`（`:67`）、`--banner-min-h: 300px`（`:68`）、纸面向下延展 `--extend-h: 260px`（`:69`，盖住搜索框 / 排序条 / 首卡上半部，末端渐隐进页面底色 `#F6F0E4`）。**整段在 `#ifdef H5` 内**（模板 `:17` 起、样式 `:60` 起）⇒ **小程序版式零改动**。
- **素材三张**：`frontend/src/static/images/home/banner-{book,paper,tree}.jpg` = **129,121 + 65,132 + 214,108 = 408,361 B（≈ 399 KiB）**，**只在 `#ifdef H5` 分支被引用** ⇒ 小程序编译时整段移除、产物内零引用 ⇒ 由 `frontend/vite.config.ts` 的主包瘦身插件 `deadStatic` 清单**显式剔除**（该清单本批 5 → **8** 项；**不剔则主包直接超 2 MiB**）。
- **H5 窄栏**：**唯一宽度真源 = `--jiapu-column: 480px`**（`frontend/src/App.vue:264`，整段 `#ifdef H5` `:263`–`:285`）。落点三处：① 页面主体列 `uni-page-body { max-width: var(--jiapu-column); margin-left/right: auto }`（`:268`–`:271`）；② 底部 tabBar 打在**内层** `.uni-tabbar`（`:280`–`:283`，**不得**用 `transform: translateX(-50%)` 居中外层 —— transform 会让外层成为内层 `fixed` 的包含块，实测整条 tabBar 落到视口底之外）；③ 页内 `fixed` 浮层按同一变量回收进列内（`tree-hall.vue:1044` · `clan-hall.vue:624` · `pages/index/index.vue:1099`）。**改列宽只改这一处变量**。
- **与夜间态的交界（两件不得混谈）**：窄栏两侧露出的是**页面底色**（浅色 `#F6F0E4` / 夜间 `#211A14`），由 §6-1 的双边属性钉子保证；**banner 三层是装饰层，夜间按 `brightness(0.42)` / `brightness(0.5)` 压暗**（`home-banner.vue:313`–`:349`，模糊值原样保留）—— **不属于 §8「纸类本体保持浅色」的范围**。

---

## 3. 色板（**逐字** · 夜间态）

| 角色 | 色值 | 主要落点（现证） |
|---|---|---|
| 页面底 | **`#211A14`** | `App.vue:351`–`:354`（`html` / `body` / `page` / `uni-page-body`，带 `!important`） |
| 卡面 | **`#2A2219`** | 卡片 / 面板 / 工具条底（如 `wenpu-book.vue:540`–`:543`、`spirit/index.vue:740`） |
| 次容器（页头 / tabBar / 纸面层底） | **`#241D16`** | `App.vue:361`（页头）、`:366`（tabBar）、`home-banner.vue:320`（纸面层底，图片未加载时不露白） |
| 格位 / chip | **`#332A20`** | 输入框 / 翻页钮 / 选择格（如 `spirit/index.vue:748`、`wenpu-book.vue:556`–`:559`） |
| 主字 | **`#EDE3D6`** | `App.vue:358`（`page` / `uni-page-body`，`!important`）、页头标题、卡内主文字 |
| 次字 | **`#B8A894`** | 次要说明、tabBar 未选中项（`App.vue:368`） |
| 更淡（页脚 / 提示 / 占位） | **`#8A7A66`** | 页脚、`book-tip`（`wenpu-book.vue:554`）、`tree-id`（`pdf-export/index.vue:32`） |
| 边框 | **`#3A3027`** | 卡 / 工具条 / tabBar 描边（`App.vue:367`） |
| 分割线 | **`#4A3D31`** | 格位内分割、翻页钮描边（`wenpu-book.vue:558`） |
| **暖棕强调** | **`#C98850`** | 主色 / 选中态 / 链接（`App.vue:370`、`wenpu-book.vue:545`–`:547`、`spirit/index.vue:747`）；**压字用 `#211A14`**（如 `wenpu-print/index.vue:76`–`:77`：暖棕钮 + 深底字） |
| error | **`#E0675F`** | `wenpu-book.vue:555` 等 |
| success | **`#7FC08A`** | 成功态文字 |
| warning | **`#D9973F`** | 警示态文字 |

- **色值来源纪律**：本表是**角色表**（人工裁定的 13 个角色），**不是** token 表的真源 —— 136 条 `--td-*` 的取值一律由生成器从角色表推导（§5），**不得**据本表手抄 token 值。
- **对偶纪律**：夜间值一律**暖调**（与喰色同族），**不得**取 TDesign 的蓝调语义色（那是另一套色族，与本站冲突 —— 承 `theme-light-pin.spec.md` §2（三）② 的同一理由）。

---

## 4. 机制（`frontend/src/business/theme.ts` · **76 行** · 单一落点）

| 符号 | 现证行 | 行为 |
|---|---|---|
| `STORAGE_KEY` | `:27` | **`'jiapu_theme'`**（`uni.setStorageSync` / `uni.getStorageSync` 的 key） |
| `DEFAULT_MODE` | `:30` | **`'light'`** |
| `ThemeMode` | `:24` | `'light' \| 'dark'` |
| `getTheme()` | `:33` | 读 storage；**非 `'dark'` 一律回 `'light'`**（非法 / 未设置 / 抛错同此） |
| `themeRef` | `:51` | `ref<ThemeMode>(getTheme())` —— **响应式主题信号**，canvas 类绘制面靠它；**唯一写入口 = `setTheme()`** |
| `applyTheme(mode?)` | `:58` | **只在 H5**（函数体内 `#ifdef H5`）：`document.documentElement.setAttribute('data-theme', mode)` + `style.colorScheme = mode`（后者的作用：浏览器自带滚动条 / 表单控件跟随，避免深色页里一条亮白滚动槽）。**只打标记，不写任何语义值** |
| `setTheme(mode)` | `:67` | 先 `setStorageSync`（失败 catch 不阻断）→ `applyTheme(mode)` → `themeRef.value = mode` |

- **首屏时序**：`frontend/src/App.vue` 的 `onLaunch`（`:228`）内调用 `applyTheme()`（`:232`）—— `onLaunch` 先于任何页面 `mount`，故首屏渲染前标记已在。**（现证口径）**：`onLaunch` 的**第一条既有语句**是 `console.log('家族历史数字馆 App Launch')`（`:229`，未删），`applyTheme()` 是其后的**第一条主题动作**；「首行」在判负时按「**页面 mount 之前**」读，不按字面第一行读。
- **为什么不跟随系统（硬 · 制度）**：`theme-light-pin.spec.md` 已在 `@media (prefers-color-scheme: dark)` 下把 136 条 token 钉回喰色 ⇒ 系统深色偏好下的既有观感必须保持「与浅色完全一致」。若本册改成跟随系统，**系统深色用户会突然落到另一套未验收的色板**，属未经批准的观感变更 ⇒ **夜间态只由用户显式开关驱动**（`theme.ts:4`–`:12` 头注释逐字同此）。
- **小程序面**：`applyTheme` 的 DOM 写全在 `#ifdef H5` 内 ⇒ mp 分支**只剩 storage 读写**；`themeRef` 不依赖 `document`，两端可读（§10）。

---

## 5. token 生成物（**`--td-*` 夜间表为生成物 · 不得手改 / 手抄**）

**文件 `frontend/src/styles/td-dark-warm.css`（167 行）**

- 头注释 `:1`–`:25`（生成方式 / 与 light-pin 的关系 / 特异性对照 / 引入位置 / 「只写颜色、无布局属性」）。
- **选择器组 `:27`–`:30`（四落点 · 每条都带 `html[data-theme='dark']` 前缀）**：
  - `:27` `html[data-theme='dark']:root` → `<html>`
  - `:28` `html[data-theme='dark'] page:not(#jp-theme-pin)` → 编译前的 `page`
  - `:29` **`html[data-theme='dark'] uni-page-body:not(#jp-theme-pin)` → H5 的真实落点（缺这条夜间必不生效 —— 与 `theme-light-pin` §3-2 同一拐点）**
  - `:30` `html[data-theme='dark'] .page.page` → 页面根自带 `class="page"` 的页面
- 声明体 `:31`–`:166`；**`grep -c '^    --td-'` 现证 = 136**（= 与 `td-light-pin.css` **同键集**：light-pin 钉住哪些，夜间就逐条翻回哪些）。
- **特异性对照（必须逐条压过 light-pin，否则夜间不生效）**：`:root:root` (0,2,0) ↔ `html[data-theme='dark']:root` (0,2,1) ✓ · `uni-page-body:not(#jp-theme-pin)` (1,0,1) ↔ `html[data-theme='dark'] uni-page-body:not(#jp-theme-pin)` (1,1,2) ✓ · `.page.page` (0,2,0) ↔ `html[data-theme='dark'] .page.page` (0,3,1) ✓。`#jp-theme-pin` 是恒不存在的 id，只用于抬特异性，不匹配任何元素。

**生成器 `frontend/scripts/gen-td-dark-warm.py`（359 行）**

- `--write` 落盘，**默认 dry-run**。
- 键集 = `td-light-pin.css` 的 **136 条**；其中 **131 条**在 `@tdesign/uniapp/dist/theme.css` 的 dark 块里也有，另 **5 条**只在 light 块。
- 值**不取** TDesign 蓝调：全部由生成器的**暖调角色表**（§3）推导 —— brand = `#C98850` 起算的 **1–10 阶单调 ramp**，**第 7 阶 = 主色**（现证 `:31`–`:40`）。
- **纪律（硬）**：① 本文件**不得手改**（头注释 `:2` 逐字「自动生成，勿手改」）；② **不得手抄**（判负口径见 §11 D5）；③ 升级 `@tdesign/uniapp` 后**必须重跑生成器**并核对条数与键集。

**引入位置 `frontend/src/main.ts`（H5-only · 顺序不可反）**

- `:5` `import '@tdesign/uniapp/theme.css';`（**无条件**，两端都进）
- `:16` `// #ifdef H5` → `:20` `import '@/styles/td-light-pin.css';` → `:25` `import '@/styles/td-dark-warm.css';` → `:26` `// #endif`
- 顺序语义：light-pin 先（钉喰色、特异性低），dark-warm 后（夜间、特异性高）⇒ **双保险**（特异性 + 后置）。

---

## 6. 三个关键坑（**本册最有价值的三条 · 都已踩过一次**）

### 6-1 **postcss 会把含 `page` 选择器的 `background-*` 克隆成裸 `body{}`，并丢掉全部前缀**

- **源码**：`@dcloudio/uni-cli-shared/dist/postcss/plugins/uniapp.js` 的 **`createBodyBackgroundRule()`** —— 它把**任何含 `page` 选择器**的规则里的 `background-*` 声明**克隆成一条裸 `body { … }`**，**克隆时丢掉原选择器的全部前缀**。
- **后果（实测 bug · 2026-10-17）**：暗色块的 `html[data-theme='dark'] page { background-color: #211A14 !important }` 被克隆成**无条件** `body{background-color:#211a14}`，在产物里排在浅色 `body{#f6f0e4}` **之后** ⇒ **与 `data-theme` 无关，`body` 恒为夜间底色**；日间模式下窄栏两侧 / 底部露黑块（`html` 与 `uni-page-body` 都还是 `#F6F0E4`，**只有 `body` 错**）。
- **对策（不改依赖 · 双边属性钉子）**：浅色侧**也**写成带前缀 + `!important` 的属性钉：`html[data-theme='light'], html[data-theme='light'] body, html[data-theme='light'] page, html[data-theme='light'] uni-page-body { background-color: #F6F0E4 !important; color: #333 !important; }`（`App.vue:394`–`:401`）；暗色侧同法带 `!important`（`App.vue:351`–`:359`）。两侧**前缀选择器特异性 (0,1,2) 都高于克隆出来的裸 `body` (0,0,1)**，两态各自压得住那条泄漏规则。
- **首屏无 `data-theme` 的窗口**：light 块写在暗色块**之后**，其克隆出的裸 `body` 同样带 `!important` 且更晚 ⇒ 落在暖纸色，与 `getTheme()` 的默认 `light` 一致。
- **判负形态**：日间档 `getComputedStyle(document.body).backgroundColor` ≠ `rgb(246, 240, 228)`（`#F6F0E4`）⇒ 克隆泄漏未收口。

### 6-2 **`scoped` 样式里的 `:global()` —— 前缀必须写在括号内**

- **场景**：scoped 选择器够不着页组件根之外的节点（`uni-modal` / `uni-page-head` 等由 uni-h5 或组件库在**页组件之外**渲染）。
- **正确写法**：**整条选择器（含 `html[data-theme='dark']` 前缀）一起塞进 `:global(...)`** —— 现证 `frontend/src/pages/spirit/index.vue:740`–`:748`（`:736`–`:739` 注释逐字记了踩坑）。
- **错误写法**：把前缀留在 `:global()` **之外**（如 `html[data-theme='dark'] :global(.uni-modal)`）—— **前缀会被编译丢弃**，产物退化成**裸 `.uni-modal`**（实测发生），⇒ 夜间规则变成无条件、污染浅色档。
- **同类落点**：`pages/special/wenpu-print/index.vue:95`–`:96`（隐藏 `uni-page-head`，`:94` 注释说明「在页组件根之外」）。

### 6-3 **暗色规则写在组件实现处，不用 `:deep()` 穿透覆写**

- **口径**：某页面 / 某组件的硬编码色，由**该组件自己的 scoped `<style>`** 里的 `html[data-theme='dark']` 段来翻。全局面（页面底 / 页头 / tabBar / 滚动条 / token）已由 `App.vue:344`–`:376` 与 `td-dark-warm.css` 承担，**页面级不要再写第二份**。
- **为什么不用 `:deep()`**：① `:deep()` 会把**父组件**的 `data-v` 作用域属性带进产物，命中面随父子结构与分包层级变化 —— 同一子组件被另一页复用时那条覆写**不在**，出现「这页深了、那页没深」的半翻态；② `:deep()` **不改特异性顺序** ⇒ 压不住子组件自身声明的同属性。
- **唯一例外（登记 · 非违规）**：`components/wenpu-book/wenpu-book.vue:568`–`:569` 用 `:deep(.sheet-window)` / `:deep(.book-page)` 把**纸页内的继承字色**钉回 `#333333` —— 因为纸类本体必须保持浅色（§8），而 `wenpu-sheet` 自身不设字色、靠继承；不钉就会从 `App.vue:358` 的全局 `#EDE3D6` 继承成**米色纸上淡字**。**除这一处外，全仓 `data-theme` + `:deep` 组合 = 0。**

---

## 7. 开关（**唯一入口**）

- **位置**：「我的」页菜单**末尾一行** —— `frontend/src/pages/mine/index.vue:221`：`<t-cell title="🌙 夜间模式" class="theme-cell" @click="toggleTheme">`；右侧胶囊回显当前状态（`:224` `{{ isDark ? '已开启' : '已关闭' }}`）；整行可点、胶囊只回显状态（`:986`–`:998` 样式）。
- **逻辑**：`:304`–`:311`（`themeMode = ref(getTheme())` → `isDark` computed → `toggleTheme()` 调 `setTheme()`，**无需刷新**）。
- **文案仅此一行**；**无第二入口**（不设首页 / 后台 / 设置页开关）。
- **默认 / 持久化**：默认 `light`；持久化在 `uni` storage 的 `jiapu_theme`；写失败（隐私模式 / 配额满）**不阻断**（`theme.ts:68`–`:72` catch，应用照做、只是不持久）。

---

## 8. 纸类本体保持浅色（**硬 · 反色就不是仿真古籍了**）

| 面 | 落点 | 夜间处置 |
|---|---|---|
| **文谱纸页**（纸面 / 书口 / 版心 / 纸内文字） | `components/wenpu-book/wenpu-book.vue:532`–`:560` | **一律不碰**（该段只收纸外控件：工具条 / 小菜单 / 纸外提示 / 翻页钮 / 页指示） |
| 纸内**继承链**字色 | 同文件 `:562`–`:569` | 钉回 **`#333333`**（= 浅色态继承值）；纸内**显式**设定的字色 / 书口色照旧优先 ⇒ 观感 = 夜间纸页与浅色态**逐像素同款** |
| **迁徙地图图版** | `pages/special/migration-map/index.vue:46`–`:51` | 只翻页面底（`#211A14`）与页内提示字；**图版本体不动** |
| **打印页** | `pages/special/wenpu-print/index.vue:75`–`:78` | 外壳转深、打印钮暖棕；**`@media print` 下钉白底 `#fff`**（`:80`） |
| 首页 banner 三层 | `components/home-banner/home-banner.vue:313`–`:349` | **不属纸类**：装饰层按 `brightness(0.42)`（纸面）/ `brightness(0.5)`（两侧）**压暗**，模糊值原样保留（§2） |

- **判负形态**：夜间档文谱纸页 `.book-page` 的计算底色被翻成深色，或纸内继承字色 ≠ `rgb(51, 51, 51)` ⇒ 判负（违反本节）。

---

## 9. canvas 口径（树图 / 世本时间轴）

- **事实**：ECharts 的颜色写在 **JS option / series data** 里，**canvas 读不到 CSS 变量** —— 这正是 `themeRef` 存在的理由（`theme.ts:18`–`:23`）。
- **落点**：`components/tree-pedigree/tree-pedigree.vue` —— `palette = computed(() => buildPalette(themeRef.value === 'dark'))`（`:680`）；`watch(themeRef, () => { … renderChart() })`（`:1173`–`:1177`）⇒ **主题一变就地重建 option 并 `setOption`**，**不整页刷新、不重挂容器**。`components/shiben-timeline/shiben-timeline.vue:306`–`:309` 记明：节点卡底 / 字 / 边框 / 世代连线 / 「第 N 世」代际文字由 canvas 绘制 ⇒ 同走 `themeRef`。
- **几何红线（硬）**：色板**只含颜色**；卡宽 / 卡高 / 行距 / `symbolSize` / 盒子尺寸 / 布局参数**两态同值**（`tree-pedigree.vue:1170`–`:1171` 逐字）。⇒ **节点数与坐标逐值不变**（读数见 §11 D3）。
- **制度推论**：任何**新增** canvas / ECharts 绘制面 **必须** `watch(themeRef)` 重建 option；**不得**试图从 CSS 变量取色（取不到），**不得**为此改几何。

---

## 10. H5-only 边界（**小程序不做主题**）

- **机制面**：mp 无 `<html>`、无 `data-theme` 标记；`applyTheme` 的 DOM 写全在 `#ifdef H5`（`theme.ts:59`–`:64`）⇒ **mp 分支只剩 storage 读写**。
- **引入面**：`td-light-pin.css` 与 `td-dark-warm.css` **均按 `#ifdef H5` 引入**（`main.ts:16`–`:26`）。
- **产物现证（本单只读复核）**：`frontend/dist/build/mp-weixin/app.wxss` —— **`data-theme` = 0 次**（改造前 4 次）、**`jp-theme-pin` = 0 次**、体积 **11,695 B**（改造前 **17,148 B**）。
- **但（如实登记）**：mp `app.wxss` 内**仍有 1 处 `prefers-color-scheme`** = `@tdesign/uniapp/theme.css` 的 dark 块（`main.ts:5` **无条件**引入，本批**未移除**）。该块在 mp 是否可达、是否有观感影响 = **未验**（承 `theme-light-pin.spec.md` §6 ①）。
- **窄栏**同理 H5-only（`App.vue:263`–`:285` 整段条件编译）⇒ mp 版式**一字不动**。
- **状态词纪律**：mp 侧**不是「夜间模式未验」，而是「未做」** —— 两个词不得混写。

---

## 11. 判据（**可判负**）

| # | 判据 | 通过条件 | 判负条件 |
|---|---|---|---|
| **D1** | **落点覆盖（前置）** | `grep -c 'uni-page-body:not(#jp-theme-pin)' frontend/src/styles/td-dark-warm.css` **≥ 1**，且 `:27`–`:30` 四条选择器**每条**都带 `html[data-theme='dark']` 前缀；H5 产物内 `data-theme` 命中 ≥ 1（本单现取 `frontend/dist/build/h5/assets/*.css` = **780 处**） | 只有 `:root` / `html` 而没有 `uni-page-body` ⇒ **夜间必不生效，判负**；或某条选择器缺前缀 ⇒ 夜间规则变无条件、污染日间档 ⇒ **判负** |
| **D7** | **H5-only（前置）** | mp `app.wxss` 内 `data-theme` = **0**、`jp-theme-pin` = **0**；`theme.ts` 的 DOM 写全在 `#ifdef H5` | mp 产物出现 `data-theme` 规则 ⇒ 白占主包字节且永不生效 ⇒ **判负** |
| **D6** | **默认态** | 清 storage 后 `getTheme()` = `'light'` 且 `<html data-theme>` = `'light'`；**`prefers-color-scheme` 不参与主题判定**（两种系统偏好下默认观感一致 —— 承 light-pin §2（一）的喰色锁定） | 默认落 `dark`，或跟随系统（`matchMedia` / `prefers-color-scheme` 参与）⇒ **判负** |
| **D2** | **夜间对比度** | 夜间档主字 **`#EDE3D6` / `#211A14` = 13.55:1** · 次字 **`#B8A894` = 7.42:1** · 副标 **8.23:1** | 主字 **< 7:1** ⇒ 判负；或两档读数**相等** ⇒ 夜间根本没生效 ⇒ 判负 |
| **D4** | **纸类浅色** | 夜间档文谱纸页 `.book-page` 计算底色 = 浅纸色、纸内继承字色 = `rgb(51, 51, 51)`；`@media print` 下打印页底 = `#fff` | 纸页被翻深 / 纸内字变浅（米色纸上淡字）⇒ **判负** |
| **D3** | **几何不变** | 首页 **11 个目标元素** rect 两档逐值相等（阈值同 light-pin T3 **≤ 0.5px**，实测差 **全 0**）；树图 canvas **painted = 3213 两态一致**、**bbox 相同**、**16×16 密度网格逐格全等** | 任一 rect 差 > 0.5px，或 painted 数 / bbox / 密度网格有一项不等 ⇒ **判负**（= 色板里混进了几何参数） |
| **D5** | **生成物纪律** | `grep -c '^    --td-'` = **136** 且与 `td-light-pin.css` **逐条同名**；文件头 `:2` 仍标「自动生成，勿手改」；改动一律经生成器角色表 + `--write` 重跑 | 条数 ≠ 136 且**未在本册登记原因**（依赖升级增删 token）⇒ 判负；**手改**痕迹（`git diff` 出现非生成物格式的改动）⇒ **判负** |

- **判据效力层级（硬）**：**D1 / D7 是 D2 / D3 / D4 的前置** —— 作用域或平台面不对时，「读数相等」可能是**假相等**（两档都取到了错误作用域）。⇒ **报告顺序必须是 D1 → D7 → D6 → D2 → D4 → D3 → D5**。
- **不得用「截图看着顺眼」代替 D2 / D3**：截图读不出 13.55 与 13.6 的差，更读不出 rect 的 0.5px 与 painted 3213。
- **D2 / D3 的读数来源（如实标注）**：均为**执行侧（Kong）实测**；本单（制度登记）**未复跑浏览器探针**。本单只读复跑的两项 = 主包体积（`frontend/scripts/mainpkg_bytes.py`）与 mp `app.wxss` 的字节 / 计数，**均同值**。

---

## 12. 已知偏差（**三项 · 如实登记 · 不得读成「已修」**）

| # | 面 | 读数 | 说明 |
|---|---|---|---|
| ① | **placeholder（夜间）** | **3.77:1** | 低于 3:1 门槛之上但远低于 AA 4.5:1；成因 = 占位字取「更淡」色阶（`#8A7A66` 族）压 `#211A14`。**本批未改**（改色阶会同时改 120+ 处组件占位观感，属主题级改动，须另立单） |
| ② | **页脚（夜间）** | **4.14:1** | 页脚字用「更淡」色阶；**未达 AA 4.5:1**。本批未改 |
| ③ | **disabled（夜间）** | **2.54:1** | 禁用态（`t-button` 一系）本就低对比；夜间沿用同族低阶值。本批未改 |

- **与浅色册的关系（不得互推）**：`theme-light-pin.spec.md` §5 ① 的 **2.84:1** 是**浅底**（`rgb(255,253,248)`）读数，本节的 **3.77 / 4.14 / 2.54** 是**夜间档**读数 —— **底不同、不得互相引用、不得据一方判另一方负**。
- **判据（可判负）**：三读数恒为 **3.77 ± 0.05 / 4.14 ± 0.05 / 2.54 ± 0.05**；若某天读数变化 ⇒ **须回改本节**，**不得只放宽判据**（承 light-pin §5 ① 的同款纪律）。
- **派单口径差异（如实登记）**：派单记「**两处**低对比已登记」，本册按现证登记**三读数**（placeholder / 页脚 / disabled）；以本节为准。

---

## 13. 未测面（**如实登记 · 不得读成「已验」**）

| # | 未测面 | 现状 / 后果 |
|---|---|---|
| **①** | **小程序夜间模式未做（不是未测）** | mp 侧本批**只保证「零改动」**（§10）；**不得**声称「小程序也支持夜间模式」，也**不得**把本项写成「未测」 |
| **②** | **TDesign 弹层 / 选择器未逐一验** | `t-picker` / `t-popup` / `t-dialog` / `t-toast` 的 token 已翻（136 条覆盖），但**组件级观感未逐页取读数**；已知 `uni-modal` 一路由 `:global()` 单独补（§6-2），**其余未扫** |
| **③** | **登录后页面未像素验收** | 覆盖清单内多数页面（家族树 / 祖谱 / 世本 / 文谱 / 人物档案 / 资产 / 后台…）**要登录态才有内容**；本批证据均在**无登录态或既有 dev 登录态**下取得 ⇒ **未做逐像素验收** |
| **④** | **真机未测** | iOS / Android 系统深色、微信内置浏览器 WebView 的 `color-scheme` 与滚动条表现**未在真机看过一次**。注意：本站**不跟随系统** ⇒ 真机要验的是「**用户手动切夜**」这一路（占位 / 对比 / 纸页墨色） |
| **⑤** | **首页 banner 夜间观感未逐像素验** | 三层压暗（`brightness 0.42 / 0.5`）与文案转亮的组合**只做过目视**，未取逐像素读数 |
| **⑥** | **三处低对比未修** | §12 三项（3.77 / 4.14 / 2.54） |
| **⑦** | **「夜间开着直接打印」未真跑** | 打印页已按 `@media print` 钉白底（§8），但**夜间态下真跑打印对话框 → 出纸**未验 |

---

## 14. 状态词与边界（**硬**）

- **状态 = 已实现（Kong）· 已本地提交（`84c31a4`）· 未上线（等 Kevin 放行推 `main`；现证 `origin/main = 1709773`，本地 `ahead 1`）· 小程序夜间模式未做**。**任何处不得写「已上线 / 已验收 / 已通过」。**
- **本册 = 纯文档**：**未改任何代码 / `frontend/**` / `cloudfunctions/**` / `scripts/**` / `config/**` / `migrate-output/**`**；**未跑构建 / 未跑测试 / 未打包 / 未部署**；**未 `git add` / `commit` / `push`**；**未碰任何 `docs/*.qa.md`**（承 `AGENTS.md` §0-5）。唯一执行的命令 = **只读**（`grep` / `sed` / `wc` / `git show` / `git rev-parse` / `python3 frontend/scripts/mainpkg_bytes.py`）。
- **同批兄弟登记**：`docs/PENDING_DEPLOY.md` **§85**（本批上云动作 + 执行回写 + 判据 + 未测面）· `AGENTS.md` **勘误 25**（取代 / 新增关系清单 + 三条关键坑 + 读数 + 覆盖清单）。
- **与既有册的关系**：本册**不**改 `theme-light-pin.spec.md` 任何旧行（只在其 §8 追记里指路）；**不**改 `docs/seo.spec.md` §7 H（favicon 落点，本批未动）与 `docs/wenpu.spec.md` §39（封面 / 封底口径，本批未动）。