# 站点 SEO 头与首页 hero 口径（docs/seo.spec.md）

> 状态：**已定口径、待实现（Kong 同期在途）**（**2026-10-11 Zang 制度员裁定 / Kevin 当面拍定**）。**本册只落口径，不写任何实现现状读数**（行号 / md5 / 计数一律不预填）。
> **追记（2026-10-11 · Zang 制度员）**：本批实现**已由 Kong 落盘**、**尚未独立质检** ⇒ 现行状态词 = **「已实现（Kong）、待独立质检（Neng）」**（**本册与 `docs/PENDING_DEPLOY.md` §65 统一此词**；详见 §14）。原「已定口径、待实现（Kong 同期在途）」**已被取代 · 原文保留**（承 `AGENTS.md` §0-4）。
> **本册管**：**H5 站点头部 SEO 元信息**（`title` / `meta description` / `meta keywords` / `og` 组 / `html lang`）与**首页 hero 两行文案**。
> **本册不管**：`pages.json` 导航栏标题（`navigationBarTitleText`）/ `tabBar` / **小程序面** / 路由形态（归 `docs/uri-aliases.spec.md`）/ 其它页面正文文案。
> **⚠️ 此条已被部分取代 · 原文保留（2026-10-11）**：`pages.json` 导航栏标题**已按新规则改**（主页面三处，逐字见 §2 D）⇒ 本册**不再是「不管」**；`tabBar` / 小程序面 / 路由形态 / 其它页面正文文案**仍不管**。
> **关联**：`docs/uri-aliases.spec.md`（H5 hash → history、首页裸域；本册「首页 = 裸域斜杠」承该册 §10）· `docs/PENDING_DEPLOY.md` **§65**（上云动作与判据）。

---

## 0. 本册边界与字面纪律

| 项 | 口径 |
|---|---|
| **本册管** | 首页标题 / 内页标题规则 · 站点描述 · 关键词（首页全站词 + 内页 G2–G5 五组分配）· og 组 · `lang` · 实现形态与单点要求 · 首页 hero 两行文案 · 已知限制 · 验收判据 · **主页面导航栏标题（§2 D）** · **`manifest.json` 的 `h5.title`（§7 G）** · **favicon 落点与 head 三条 `link`（§7 H）** |
| **本册不管** | `pages.json` 导航栏标题（**不改** —— 本册只**读取**其 `navigationBarTitleText` 作为内页页面名，**不回写**）（**⚠️ 已被取代 · 原文保留（2026-10-11）**：主页面三处导航栏标题**已改**，逐字见 §2 D —— 本项**不再不管**）· `tabBar`（**不动**）· **小程序面 SEO**（小程序无本站 SEO 头概念；本册不改小程序侧任何 head）· 路由路径形态（`docs/uri-aliases.spec.md`）· **逐 URL 独立 SEO**（需预渲染 / SSR，见 §10）—— **上列后四项仍不管** |
| **数值 / 字面纪律** | 标题 / 描述 / 关键词 / og 值 / hero 两行**一律逐字取自 Kevin 拍定**（2026-10-11）—— **不得增删字、不得改用半角竖线 `|`、不得补造词**（承 `AGENTS.md` §0-3） |

---

## 1. 范围与对象（SEO-1）

- **对象 = H5 站点头部**：构建产物 `index.html` 的**静态 head** + **运行期** `document.title` / `meta[name=keywords]`；**并**首页 hero 两行文案。
- **平台面 = 仅 H5**：SEO 头**只在 H5 面生效**；小程序面**无此概念、不改**。
- **首页地址 = 裸域斜杠**（`https://jiapu100.com/`）—— 承 `docs/uri-aliases.spec.md` §10（H5 = history 路由、首页裸域）。
- **内页 = 其余所有路由**（含 `/pages/**` 形态与 `/z/`、`/<tree_id>` 别名形态）。

---

## 2. 标题规则（SEO-2）

**A. 标题逐字**

| 页面 | `title` 逐字值 |
|---|---|
| **首页**（页面路由 `pages/index/index`，地址 = **裸域斜杠** `/`） | **家谱 100｜家族历史数字馆，多姓氏家谱数字化珍藏平台** |
| **内页** | **<页面名>｜家谱 100**（**全角竖线 `｜`** 拼接） |

**B. 内页页面名取值链**

1. 取该路由在 `frontend/src/pages.json` 的 `navigationBarTitleText` ⇒ 拼接格式 = **`<navigationBarTitleText>｜家谱 100`**。
   - **⚠️ 就地加注（2026-10-11）**：自本批起，主页面三处的 `navigationBarTitleText` **已含「｜家谱 100」后缀**（逐字见 §2 D）⇒ 本条须按「**基础页面名 + 后缀**」理解 —— **照字面双重拼接会得到双后缀**（**实测结论：现行实现不出现双后缀**，可按事实登记；**双处重复的同步风险见 §14 D**）。
2. **取不到**（路由非 `pages.json` 登记项 / 无 `navigationBarTitleText`）⇒ **回退 `家谱 100`**。

**C. 页面名对照（逐字取自 `pages.json`；取值以现场为准）**

| 路由 | 页面名（`navigationBarTitleText`） | 内页 `title` |
|---|---|---|
| `pages/person/detail` | 人物详情 | **人物详情｜家谱 100** |
| `pages/hall/index` | 数字馆 | 数字馆｜家谱 100 |
| `pages/family/index` | 我的家族 | 我的家族｜家谱 100 |
| `pages/pedigree/index` | 世系图谱 | 世系图谱｜家谱 100 |
| `pages/special/migration-map/index` | 迁徙地图 | 迁徙地图｜家谱 100 |
| `pages/special/generation-poem/index` | 字辈检索 | 字辈检索｜家谱 100 |
| `pages/special/pdf-export/index` | 族谱PDF导出 | 族谱PDF导出｜家谱 100 |
| `pages/about/about` | 关于本站 | 关于本站｜家谱 100 |
| （其余登记项） | 按 `pages.json` | `<页面名>｜家谱 100` |

> ⚠️ **全角竖线**：标题分隔符 = **`｜`（U+FF5C 全角竖线）**，**不是** ASCII `|`。**逐字，不得替换**。

> **⚠️ 就地加注（2026-10-11）**：上表「页面名（`navigationBarTitleText`）」列**以拼接基准（基础页面名）为准**；自本批起 `pages/family/index` / `pages/mine/index` 的 `navigationBarTitleText` **已含「｜家谱 100」后缀**（逐字见 **§2 D**），**但内页 `title` 结果不变**（**不出现双后缀**）。**上表其余行经核不改**（理由见 §14 F）。
> **⚠️ 追加加注（2026-10-11）**：上表 `pages/hall/index` 行的「数字馆｜家谱 100」= **mixin 按路由的文档标题**；**该页运行时会被组件覆盖为「树名｜家谱 100」**（见 **§2 E**）。**该行字面原文保留、不回改**（承 `AGENTS.md` §0-4）。

**D. 主页面导航栏标题（2026-10-11 改；逐字）**

> **就地加注**：本册 §0 / §9 / §11 中「`pages.json` 导航栏标题**一律不改 / 只读取**」的旧表述**已被取代 · 原文保留**（承 `AGENTS.md` §0-4）—— 自本批起**主页面三处导航栏标题已按新规则改**。

| 路由 | 导航栏标题（`navigationBarTitleText`，逐字） |
|---|---|
| `pages/index/index` | **家谱 100｜家族历史数字馆，多姓氏家谱数字化珍藏平台**（= §2 A 首页标题全称） |
| `pages/family/index` | **我的家族｜家谱 100** |
| `pages/mine/index` | **我的｜家谱 100** |

- **其余页与 `globalStyle` 一律不变**。
- **家族树页（`pages/hall/index`）导航栏仍由 `tree-hall` 动态置为树名**（**不改**）。
- **与 §2 C 表的关系**：C 表的「页面名」列**仍作拼接基准（基础页面名）用** ⇒ `pages/family/index` / `pages/mine/index` 的内页 `title` 结果**不变**（**我的家族｜家谱 100** / **我的｜家谱 100**，与 A 的导航栏标题一致）。
- **双处重复的维护风险**（`pages.json` ↔ `seo.ts`）见 **§14 D**。

**E. 家族树页 / 祖谱页的文档标题（2026-10-11 登记；口径）**

- **口径**：**家族树页（`pages/hall/index`）与祖谱页**的**浏览器标签页标题（`document.title`）** = **树名 + `｜家谱 100`**（后缀取自 `frontend/src/business/seo.ts` 的 **`TITLE_SUFFIX`**）；**顶部导航栏标题仍为树名（不变）**。
- **落点**：`frontend/src/components/tree-hall/tree-hall.vue` 与 `frontend/src/components/clan-hall/clan-hall.vue` —— 在 `uni.setNavigationBarTitle({ title: <树名> })` **之后**各补一行 **`document.title = <同一名字> + TITLE_SUFFIX`**（**仅 H5 · `// #ifdef H5` 条件编译**）。
- **原因（口径）**：`uni-app` H5 的 `uni.setNavigationBarTitle` 会**同时改写导航栏与 `document.title`** ⇒ 组件会**覆盖** mixin（`business/seo.ts` + `main.ts` 全局 mixin）按路由设的文档标题（**实测：修前家族树页 `document.title` = 纯树名、无品牌后缀**）。
- **边界（硬）**：**不改导航栏标题字面**（导航栏仍 = 树名）；**不动 `syncNavTitle` 判据与取值逻辑**（`sync-nav-title=false` 时仍不写）；**小程序无 `document` ⇒ 条件编译**（小程序侧零改动）。
- **与 §2 C 的关系**：§2 C 表中 `pages/hall/index` 行的「数字馆｜家谱 100」= **mixin 按路由的文档标题**；该页运行时**被上述组件覆盖为「树名｜家谱 100」**（**该行字面原文保留、不回改**）。
- **状态**：**已实现（Kong）、待独立质检（Neng）**（与 §12 / §14 E 统一之词）。

---

## 3. 站点描述（SEO-3）

- **所有页面同一份**（首页与内页**一致**），逐字（落 `meta name="description"`）：

> **家谱 100（https://jiapu100.com）家族历史数字馆，多姓氏、多支派家谱数字化珍藏平台。汇聚百家家乘，典藏宗族史料；千秋祖脉绵世泽，万卷家乘振宗风，助族人寻根溯源，永续家族文脉。**

- **不分路由**（内页与首页同值）。

---

## 4. 关键词（SEO-4）

**A. 首页关键词（全站词，逗号分隔 —— 半角逗号 `,`）**：

> **家谱,族谱,宗谱,家乘,家谱数字化,家族历史,家族数字馆,多姓氏家谱,寻根溯源,修谱,家族史料,家谱珍藏,支派世系,宗族文化,祖脉传承,家谱100,jiapu100**

**B. 内页关键词（按路由分五组；本表列 G2–G5；G1 = 首页，见上 A）**

| 组 | 适用路由 | 关键词（逐字，半角逗号分隔） |
|---|---|---|
| **G2 谱系 / 家族类** | `pages/hall/index` · `pages/family/index` · `pages/person/detail` · `pages/pedigree/index` · `pages/special/migration-map/index` | **家族世系查询,各姓氏家谱查阅,家族族谱数字化归档,宗族支派源流考证** |
| **G3 修谱工具类** | `pages/special/generation-poem/index` · `pages/special/pdf-export/index` | **修谱平台,线上家谱制作,家谱线上保存** |
| **G4 史料 / 介绍类** | `pages/about/about` | **家族历史档案馆,修谱平台** |
| **G5 默认（其余所有路由）** | 账号 / 资产 / 钱包 / 市集 / 登录 / 注册 / 时流 / 任务 / 文献地址 / 好友 / 邀请 / 管理 | **线上家谱制作,家谱线上保存** |

- **词源自证（硬）**：G2–G5 **八条内页词**全部取自 Kevin 给的「内页 keywords」清单 —— **线上家谱制作** / **家谱线上保存** / **家族世系查询** / **各姓氏家谱查阅** / **家族族谱数字化归档** / **宗族支派源流考证** / **修谱平台** / **家族历史档案馆** —— **无一新增、无一遗漏**（共 **8** 条唯一词；**修谱平台**在 G3 与 G4 **重复出现**，**逐字保留**）。

---

## 5. og 组（SEO-5）

**静态首页值**（写在 `index.html` 静态 head）：

| 属性 | 逐字值 |
|---|---|
| `og:type` | **website** |
| `og:title` | **家谱 100｜家族历史数字馆，多姓氏家谱数字化珍藏平台**（= §2 A 首页标题） |
| `og:description` | **（= §3 站点描述逐字全句）** |
| `og:url` | **https://jiapu100.com/** |
| `og:site_name` | **家谱 100** |

---

## 6. lang（SEO-6）

- `html` 标签 `lang` = **`zh-CN`**。

---

## 7. 实现形态与单点要求（SEO-7）

**F. 实现形态（口径）**

1. **静态 head**（`frontend/index.html`）：**爬虫不跑 JS 也看得到** —— 含 `title`（首页全称）、`meta description`、`meta keywords`、og 组、`html lang`。
2. **运行期按路由改写**（**仅 H5**）：`document.title` 与 `meta[name=keywords]` 随当前路由变化 —— 落点 = `frontend/src/business/seo.ts`（**新增**）+ `frontend/src/main.ts` 全局 mixin（路由变化时套用 §2 / §4 规则）。

**G. `manifest.json` 的 `h5.title`（2026-10-11 登记；口径）**

- **`frontend/src/manifest.json` 的 `h5` 段必须设 `title` = 首页标题**（同 §2 A 逐字）：**家谱 100｜家族历史数字馆，多姓氏家谱数字化珍藏平台**。
- **原因（口径）**：`uni-app` H5 构建（`transformIndexHtml`）会把模板里的 `title` **整体替换**为 `h5.title`（**无 `h5` 段 / 无 `title` 时取 `manifest.name`**）⇒ **不设 `h5.title` 时产物静态 `title` 会被写成 `name`（已复现）**，与 §2 A / §5 `og:title` 不一致。
- **边界**：`h5` 段的 **`router`（history 模式）/ `base` 口径不变**（承 `docs/uri-aliases.spec.md` §10）—— 本批**只增 `title`**。
- **与 §7 F 第 1 项的关系**：静态 head 的 `title` **同时受构建期（`manifest.json`）与模板（`frontend/index.html`）影响** ⇒ 两处**必须同值**（正文另新增 favicon 三条 `link`，见 §7 H）。

**H. favicon（2026-10-11 登记；落点与 head 三条 `link`）**

- **资源落点** = `frontend/src/static/icons/favicon.svg`（另同目录 **`favicon-32.png`** / **`favicon-180.png`**，**透明底**）。
- **head 三条 `link`（逐字）**：
  1. `rel="icon" type="image/svg+xml" href="/static/icons/favicon.svg"`
  2. `rel="icon" type="image/png" sizes="32x32" href="/static/icons/favicon-32.png"`
  3. `rel="apple-touch-icon" sizes="180x180" href="/static/icons/favicon-180.png"`
- **本批不出 `favicon.ico`**（已知边界：Vercel catch-all rewrite 下 `/favicon.ico` 仍返 **200 + HTML**，但**显式 `link` 优先**，不会被当图标；见 §10）。
- **`favicon.svg` 为过渡版**：其形态含 `<text>` + 私有字体 ⇒ **本轮图为过渡版**（**Kevin 将另给一版**）；换版**只换文件**，**head 三条 `link` 与落点一律不变**。
- **⚠️ 已被取代 · 原文保留（2026-10-11 · Zang 制度员）**：上条「`favicon.svg` 为过渡版（含 `<text>` + 私有字体）／**Kevin 将另给一版**」**已不成立** —— **Kevin 已另给一版（v2）并已落地**，**落点文件即 v2**：字形**全部转为矢量 `path`**、**自包含、无字体依赖**（`viewBox 0 0 128 128`、底仍 **`#644a18`** 圆角矩形、字形为白色 `path`）⇒ **不再有 `<text>` / 字体依赖**；**换版只换文件**，**head 三条 `link` 与落点一律不变**。
- **v2 已知事实（只登口径 / 事实 · **不判责**）**：`favicon.svg` 的**可见字形为繁体「家譜」** —— v1 源码里写的是简体「家谱」，但设计字体是**汉仪文润宋韵繁体**，会把简体码位渲染成**言旁的繁体字形** ⇒ **可见字形为繁体**。**待 Kevin 确认是否有意**（站点品牌文案为简体「家谱 100」）。**核验方法（供后人复现）**：用该字体渲染简体码位「谱」，其左偏旁即完整「言」；字形已转 `path` 故字体依赖已消失，但字形本身仍是繁体面貌。 **⚠️ 已裁定向 · 原文保留（2026-10-11 · Zang 制度员）**：上句「**待 Kevin 确认是否有意**」措辞**逐字留存、不回改、不上移**，其语义**自本加注起被覆盖** —— **Kevin 2026-10-11 已裁定：图标保持繁体「家譜」现状（有意，与古籍气质一致），不换字体重描**（当面裁定 · 承 `AGENTS.md` §0-4）；**状态词不变 = 「已实现（Kong）、待独立质检（Neng）」**。

**单点要求（硬）**

- **`frontend/src/business/seo.ts` 为唯一真源**：标题拼接串 / 描述 / 关键词两组与五组分配表 / og 值 / `lang` **一律只在该文件维护**；**禁止**在多处硬编码同一串。
- `frontend/index.html` 的静态值须与 `seo.ts` **逐字一致**（首页标题与站点描述 **两处落点、同一口径**，不是两套值）。
- 运行期改写**只在 H5 编入**（承 uni-app **`// #ifdef H5`** 条件编译口径）⇒ **小程序产物零 SEO 代码**。

---

## 8. 首页 hero（SEO-8）

**G. 首页 hero 两行文案（Kevin 拍定，替换旧值）**

| 行 | 新值（逐字） | 旧值（**已被取代**） |
|---|---|---|
| **主标题** | **千秋祖脉绵世泽，万卷家乘振宗风** | 家族历史数字馆 |
| **副标题** | **家谱 100 · 多姓氏家谱数字化珍藏平台** | 多姓氏、多支派家谱数字化展示平台 |

- 落点 = `frontend/src/pages/index/index.vue`（首页 hero 两行 `text`）。
- 旧值**原文保留、不回改**（承 `AGENTS.md` §0-4）；语义自本行起被取代。
- ⚠️ 该 `.vue` 为 **H5 / 小程序共享文件** ⇒ hero 文案变更**同时进入两产物**（见 §9 / §10 / `docs/PENDING_DEPLOY.md` §65）。

---

## 9. 与既有分册的关系（SEO-9）

- **只改 H5 头部与首页 hero**；**不动** `pages.json` 导航栏标题（`navigationBarTitleText` 一律不改 —— 只**读取**）· **不动** `tabBar` · **不动**小程序面 · **不动**路由形态（`docs/uri-aliases.spec.md` §1 / §10 **继续有效**）。
  - **⚠️ 已被取代 · 原文保留（2026-10-11）**：其中「**不动** `pages.json` 导航栏标题（一律不改 —— 只读取）」**已不成立** —— 主页面三处导航栏标题**已改**（逐字见 §2 D）；本批另**新增**两处落点（`frontend/src/manifest.json` 的 `h5.title`、favicon 三条 `link`，见 §7 G / §7 H）。**仍成立** = 不动 `tabBar` · 不动小程序面 · 不动路由形态（§1 / §10 继续有效）· 不触碰 `docs/*.qa.md`。
- 本批**不触碰** `docs/*.qa.md`（`AGENTS.md` §0-5）。
- 部署面 = `docs/PENDING_DEPLOY.md` **§65**。

---

## 10. 已知限制（SEO-10）

| # | 限制 | 口径 |
|---|---|---|
| 1 | **本批为 CSR**（客户端渲染） | 爬虫**不跑 JS** 时，**内页深链只看得到首页静态头**（`title` / `description` / `keywords` / `og` 均为**首页值**）；运行期按路由改写**只对跑 JS 的客户端生效**。 |
| 2 | **每 URL 独立 SEO** | 若要**每个 URL 独立 SEO**（内页深链有独立 `title` / `description`），需**预渲染 / SSR** —— 属**另批**（本册不管）。 |
| 3 | **全站无真 404（既有）** | 未知路径返 **200 + 空白 SPA shell**（`docs/uri-aliases.spec.md` §10 追记边界 ①）⇒ SEO / 监控口径需知悉。 |
| 4 | **og 为静态首页值** | 内页分享仍取**首页** og（CSR 限制）；如需内页独立 og，归「另批 · 预渲染 / SSR」。 |
| 5 | **小程序面** | 小程序**无**本站 SEO 头概念；hero 变更随共享 `.vue` 进小程序产物，但**不产生 SEO 语义**。 |
| 6 | **`seo.ts` ↔ `pages.json` 页面名双处重复（已知维护风险）** | 同一份页面名清单**两处各存一份**（`seo.ts` 的 `ROUTE_TITLE` ↔ `pages.json` 的 `navigationBarTitleText`）⇒ **改一处必须同步另一处**（漏改 ⇒ 标题与导航栏不一致，或出现双后缀）。**实测结论 = 现行结果一致、不出现双后缀**（详见 §14 D）。 |
| 7 | **`favicon.ico` 本批不出（已知边界）** | 本批**不出** `favicon.ico`；Vercel catch-all rewrite 下 `/favicon.ico` 仍返 **200 + HTML**（非真 404），但 head 的**显式 `link` 优先**，不会被当图标（详见 §7 H）。 |
| 8 | **图标为过渡版** | 本批 `favicon.svg` 为**过渡版**（含 `<text>` + 私有字体）；**Kevin 将另给一版** ⇒ 换版**只换文件**，head 三条 `link` 与落点不变（详见 §7 H）。 **⚠️ 已被取代 · 原文保留（2026-10-11）**：`favicon.svg` **已是 Kevin 另给的 v2 并已落地** —— 字形**全部转为矢量 `path`**、**自包含、无字体依赖**；**不再有 `<text>` / 字体依赖**；另登一条事实：**可见字形为繁体「家譜」（待 Kevin 确认是否有意 · 站点品牌文案为简体「家谱 100」）**（详见 §7 H）。 **⚠️ 已裁定向 · 原文保留（2026-10-11 · Zang 制度员）**：上句括注内「**待 Kevin 确认是否有意**」措辞**逐字留存、不回改、不上移**，其语义**自本加注起被覆盖** —— **Kevin 2026-10-11 已裁定：图标保持繁体「家譜」现状（有意，与古籍气质一致），不换字体重描**（当面裁定 · 承 `AGENTS.md` §0-4）；**状态词不变 = 「已实现（Kong）、待独立质检（Neng）」**。 |

---

## 11. 验收判据（SEO-11）

> 状态 = **已定口径、待实现（Kong 同期在途）**。下表为**判据**（实现落地后据此验收），**非现状读数**。

| # | 判据 | 期望 |
|---|---|---|
| 1 | 构建产物 `index.html` 静态 head | 含 `title`（首页全称）/ `meta description` / `meta keywords` / og 组 / `html lang="zh-CN"` |
| 2 | 首页（裸域 `/`）`document.title` | **家谱 100｜家族历史数字馆，多姓氏家谱数字化珍藏平台** |
| 3 | 人物详情页（`pages/person/detail`）`document.title` | **人物详情｜家谱 100** |
| 4 | 首页 `meta[name=keywords]` | = §4 A 全站词**逐字** |
| 5 | 内页 `meta[name=keywords]` | **按 §4 B 五组分配**（对应路由命中对应组，逐字） |
| 6 | `html` `lang` | **zh-CN** |
| 7 | 首页 hero 两行 | **千秋祖脉绵世泽，万卷家乘振宗风** / **家谱 100 · 多姓氏家谱数字化珍藏平台**（逐字） |
| 8 | 小程序面 | **不受 SEO 头影响**（无 SEO 代码）；`pages.json` 导航栏标题 / `tabBar` **一律未改** —— **⚠️ 已被取代 · 原文保留（2026-10-11）**：其中「`pages.json` 导航栏标题**一律未改**」**已不成立**（主页面三处**已改**，见 §2 D）；**改为**「`tabBar` **一律未改**；`pages.json` 导航栏标题**仅主页面三处已改、其余页未改**」 |
| 9 | 主页面导航栏标题（`pages/index/index` / `pages/family/index` / `pages/mine/index`） | = **§2 D 逐字**；其余页与 `globalStyle` **未改**；`pages/hall/index` 仍由 `tree-hall` 动态置为树名 |
| 10 | 构建产物 `index.html` 静态 `title` | = §2 A 首页全称（即 `frontend/src/manifest.json` 的 `h5.title`；**不设 `h5.title` 时会被写成 `manifest.name`**，见 §7 G） |
| 11 | head 三条 favicon `link` | = **§7 H 逐字**三条（`rel` / `type` / `sizes` / `href` 全对；资源落点 = `frontend/src/static/icons/` 三个文件） |
| 12 | 主页面 `document.title` 与导航栏标题 | **结果一致、不出现双后缀**（§14 D） |
| 13 | 家族树页 / 祖谱页 `document.title` | = **树名｜家谱 100**（后缀取自 `seo.ts` 的 `TITLE_SUFFIX`）；**导航栏标题仍 = 树名**（§2 E）；**修前** `document.title` = 纯树名、无品牌后缀 |

---

## 12. 状态词与边界（SEO-12）

- **状态 = 「已定口径、待实现（Kong 同期在途）」**（**2026-10-11 Zang 制度员裁定 / Kevin 当面拍定**）。**不得写「已实现 / 已通过 / 已质检」**。
  - **⚠️ 追记（2026-10-11 · Zang 制度员）**：本批实现**已由 Kong 落盘**、**尚未独立质检（Neng）** ⇒ **现行状态词 = 「已实现（Kong）、待独立质检（Neng）」**（**本册与 `docs/PENDING_DEPLOY.md` §65 / §65-7 统一此词**）。原「已定口径、待实现（Kong 同期在途）」**已被取代 · 原文保留**；**仍禁止**写「**已通过 / 已质检 / 已上线**」。
- **本册只落口径**：**未改任何代码 / `cloudfunctions/` / `migrate-output/` / `config/`**；**未碰任何 `docs/*.qa.md`**（`AGENTS.md` §0-5）。
- **不写任何现状读数**（行号 / md5 / 计数一律不预填）；**判据一律以命令实际输出为准**。
- 上云动作与判据 = `docs/PENDING_DEPLOY.md` **§65**。

---

## 13. 交叉引用

| 文件 | 关系 |
|---|---|
| `docs/uri-aliases.spec.md` | §10 H5 hash → history、首页裸域（本册「首页 = 裸域斜杠」承此）· §10 追记边界 ①（全站无真 404） |
| `docs/PENDING_DEPLOY.md` | §65（本批上云动作与判据）· **§65-7**（追记：三条后续口径 + 双处重复风险 + 状态词） |
| `AGENTS.md` | §0-3 数值 / 字面纪律 · §0-4 历史行不机械改写 · §0-5 `docs/*.qa.md` 不回改 |

---

## 14. 追记（2026-10-11 · Zang 制度员）：三条后续口径 + 双处重复风险 + 状态词

> **⚠️ 追加加注（2026-10-11）**：本节另含 **G. 家族树页 / 祖谱页的文档标题**（**第 4 条后续口径**）—— 上列标题的「三条」**字面原文保留、不回改**（承 `AGENTS.md` §0-4）。

> **体例（只追加）**：本节为**追记**；§0–§13 既有行**原文一律保留**，被取代处**就地加注「已被取代 · 原文保留」**（承 `AGENTS.md` §0-4）。**不写任何实现现状读数**（行号 / md5 / 计数一律不预填）。**上云动作面 = `docs/PENDING_DEPLOY.md` §65 / §65-7**。

**A. 主页面导航栏标题已改（逐字；口径与落点见 §2 D）**

| 路由 | `frontend/src/pages.json` 的 `navigationBarTitleText`（逐字） |
|---|---|
| `pages/index/index` | **家谱 100｜家族历史数字馆，多姓氏家谱数字化珍藏平台** |
| `pages/family/index` | **我的家族｜家谱 100** |
| `pages/mine/index` | **我的｜家谱 100** |

- **其余页与 `globalStyle` 不变**；**家族树页（`pages/hall/index`）导航栏仍由 `tree-hall` 动态置为树名**（**不改**）。

**B. `manifest.json` 口径（`h5` 段必须设 `title` = 首页标题；口径与原因见 §7 G）**

- **值（逐字）** = **家谱 100｜家族历史数字馆，多姓氏家谱数字化珍藏平台**（同 §2 A）。
- **原因**：`uni-app` H5 构建（`transformIndexHtml`）会把模板里的 `title` **整体替换**为 `h5.title`（**无则取 `manifest.name`**）⇒ **不设 `h5.title` 时产物静态 `title` 会被写成 `name` = 家族历史数字馆（已复现）**。
- 同日另增：`frontend/index.html` **favicon 三条 `link`**（见 C）。

**C. favicon 口径（落点 + head 三条 `link`；逐字见 §7 H）**

- 落点 = `frontend/src/static/icons/favicon.svg`（另同目录 `favicon-32.png` / `favicon-180.png`，**透明底**）；head 三条 `link`（SVG / PNG 32 / apple-touch 180）。
- **本批不出 `favicon.ico`**（已知边界：统一 catch-all rewrite 下 `/favicon.ico` 仍返 **200 + HTML**，但**显式 `link` 优先**）。
- **`favicon.svg` 为过渡版**（含 `<text>` + 私有字体）—— **Kevin 将另给一版**。
- **⚠️ 已被取代 · 原文保留（2026-10-11）**：上条「`favicon.svg` 为过渡版（含 `<text>` + 私有字体）／Kevin 将另给一版」**已不成立** —— **Kevin 已另给一版（v2）并已落地**（字形**全部转为矢量 `path`**、**自包含、无字体依赖**；`viewBox 0 0 128 128`、底仍 `#644a18` 圆角矩形、字形为白色 `path`）；**换版只换文件**，**head 三条 `link` 与落点一律不变**（逐字见 **§7 H**）。
- **v2 已知事实（只登口径 / 事实 · 不判责）**：**可见字形为繁体「家譜」** —— v1 源码里写的是简体「家谱」，但设计字体是**汉仪文润宋韵繁体**，会把简体码位渲染成**言旁的繁体字形** ⇒ **可见字形为繁体**；**待 Kevin 确认是否有意**（站点品牌文案为简体「家谱 100」）。**核验方法**（用该字体渲染简体码位「谱」，其左偏旁即完整「言」）见 **§7 H**。 **⚠️ 已裁定向 · 原文保留（2026-10-11 · Zang 制度员）**：上句「**待 Kevin 确认是否有意**」措辞**逐字留存、不回改、不上移**，其语义**自本加注起被覆盖** —— **Kevin 2026-10-11 已裁定：图标保持繁体「家譜」现状（有意，与古籍气质一致），不换字体重描**（当面裁定 · 承 `AGENTS.md` §0-4）；**状态词不变 = 「已实现（Kong）、待独立质检（Neng）」**。

**D. `seo.ts` ↔ `pages.json` 页面名双处重复（已知维护风险）**

- `seo.ts` 的 `ROUTE_TITLE` 表**存的就是 `pages.json` 的页面名** ⇒ **同一份页面名清单两处各存一份**。
- **本期起主页面导航栏标题已含后缀「｜家谱 100」**（A / §2 D），而 `seo.ts` 的 `document.title = 页面名 + ｜家谱 100` ⇒ **两者结果一致（实测结论：不出现双后缀，可按事实登记）**。
- **风险 = 改一处必须同步另一处**：同步项 = `pages.json` 的 `navigationBarTitleText` ↔ `seo.ts` 的 `ROUTE_TITLE`；任一处漏改 ⇒ 标题与导航栏**不一致**，或**出现双后缀**。**新增 / 改名页面时两处同改**（已登 §10 第 6 条 / §11 第 12 条）。

**E. 状态词（本册与 `docs/PENDING_DEPLOY.md` §65 统一）**

- **现行 = 「已实现（Kong）、待独立质检（Neng）」**；**不得写「已通过 / 已质检 / 已上线」**（原「已定口径、待实现」**已被取代 · 原文保留**，见 §12）。

**F. 本轮经核不改（清单与理由）**

- §2 A 首页标题 / §3 站点描述 / §4 关键词（含 G2–G5 五组分配与「8 条唯一词」自证）/ §5 og 组 / §6 `lang` / §8 hero 两行 —— **本轮零改动**（新口径只涉三件：主页面导航栏标题 · `manifest.json` 的 `h5.title` · favicon）。
- §2 C 表的**第三列（内页 `title`）** —— **经核不改**：`pages/family/index` / `pages/mine/index` 的内页 `title` 结果（**我的家族｜家谱 100** / **我的｜家谱 100**）与 A 的导航栏标题**本就同值**，**无冲突、无需改写**。
- §11 第 1–7 条判据 —— **经核不改**（本批不涉 §2 A / §3 / §4 / §5 / §6 / §8 与 hero）。
- **`AGENTS.md` 为受保护文件** ⇒ 本册涉及其登记的拟稿（逐字）**只在交付报告里给出**，**未落盘**（承 `AGENTS.md` 受保护文件纪律）。
- 本追记轮 **零代码改动 · 零真源写入 · 零打包 · 零部署 · 未跑测试**；**未碰任何 `docs/*.qa.md`**（`AGENTS.md` §0-5）。

**G. 家族树页 / 祖谱页的文档标题（新口径；逐字见 §2 E）**

- **口径**：这两类页的**浏览器标签页标题（`document.title`）** = **树名 + `｜家谱 100`**（后缀取自 `business/seo.ts` 的 `TITLE_SUFFIX`）；**顶部导航栏标题仍为树名（不变）**。
- **落点** = `frontend/src/components/tree-hall/tree-hall.vue` 与 `frontend/src/components/clan-hall/clan-hall.vue`：在 `uni.setNavigationBarTitle({ title: <树名> })` **之后**各补一行 `document.title = <同一名字> + TITLE_SUFFIX`（**仅 H5 · `// #ifdef H5` 条件编译**）。
- **原因**：`uni-app` H5 的 `uni.setNavigationBarTitle` **同时改写导航栏与 `document.title`** ⇒ 组件会覆盖 mixin 的按路由标题（**实测：修前家族树页 `document.title` = 纯树名、无品牌后缀**）。
- **边界（硬）**：不改导航栏标题字面 · 不动 `syncNavTitle` 判据与取值逻辑 · **小程序无 `document` ⇒ 条件编译**（小程序侧零改动）。
- **状态** = **「已实现（Kong）、待独立质检（Neng）」**（与 §12 / §14 E 统一之词）。
