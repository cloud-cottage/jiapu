# URI 口径：世本 `/z/` · 祖谱 `/z/<tree_id>` · 普通家族树 `/<tree_id>` — 规格（docs/uri-aliases.spec.md）

> 状态：**实施完成（2026-09-18）· 真机质检已通过 · 待部署上云**（部署项见 `docs/PENDING_DEPLOY.md` §17，**含数据项** §17-3）。
> 本册管**地址栏路径形态**、旧路径弃用与重定向、以及 `config/tree-meta.json` 的 `path_alias` 数据口径；**不管**节点字段 / 编号 / 权限 / 计费。
> 关联：`docs/clan-tree.spec.md`（世本 / 祖谱 / 普通家族树三类树）、`docs/tree-id.spec.md`（tree_id 生成口径与 3 棵树改名的不留别名口径）、`docs/chain-batch-append.spec.md`（同批扩展）、`docs/permission-tier.spec.md`。
> 代码锚点：`frontend/src/App.vue`（`CLAN_PATH_RE` 第 12 行、`MASTER_PATH` 第 18 行、`/z/zhonghua` 判定顺序第 35 行）、
> `frontend/src/business/cross-tree.ts`（`MASTER_PATH` 第 15 行）、`config/tree-meta.json`（`trees.zhonghua.path_alias` = `/z/`，第 66 行）。
> 证据：`docs/chain-batch-append.qa.md` **§9（T1 与真源体检）**。

---

## 0. 本册边界

| 项 | 口径 |
|---|---|
| **本册管** | 三种树的路径形态（含尾斜杠归一）、世本 `/z/` 的接受形态、`/zhonghua` 弃用与客户端重定向、`tree-meta.path_alias` 数据口径（含本次真源手术与备份）、跨树跳转的路径输出、子域现状（已知边界） |
| **本册不管** | 树的种类语义与数据模型 → `docs/clan-tree.spec.md`；`tree_id` 如何生成（注音 / 无兜底 / `surname_pinyin`）→ `docs/tree-id.spec.md`；批量续编行为 → `docs/chain-batch-append.spec.md`；权限档位 → `docs/permission-tier.spec.md`；部署动作 → `docs/PENDING_DEPLOY.md` §17 / §20 |
| **数值/字面纪律** | 路径串（`/z/`、`/zhonghua`）、正则、判定顺序、备份路径**逐字取自拍板与实测**；不得自行改口径、不得编数字 |

---

## 1. 三种路径形态（写死）

| 树类 | 判据 | 路径形态 | 示例 |
|---|---|---|---|
| **世本（中华世本总谱）** | `tree_id === 'zhonghua'`（`is_master`） | **`/z/`** | `/z/` |
| **祖谱** | 该树 `kind === 'clan'` | **`/z/` + tree_id** | `/z/ji_23395` |
| **普通家族树** | 其余（`kind === 'family'`） | **`/` + tree_id** | `/ji_23395_01` |

- 世本**不再占** `/<tree_id>` 形态；`/z/` 是世本的**唯一规范地址**。
- 祖谱沿用 `/z/` 前缀 → 祖谱与世本共享前缀，靠**段数 / 正则**区分（见 §2 的顺序约束）。

---

## 2. 世本 `/z/` 的接受形态与归一（含判定顺序约束）

| 输入 | 行为 |
|---|---|
| `/z` | 进入世本；**地址栏归一并保持 `/z/`** |
| `/z/` | 进入世本（规范形态） |
| `#/z/` | 进入世本（hash 路由） |
| `/z/zhonghua` | 进入世本（**兼容形态**）；地址栏保持 `/z/` |

⚠️ **`/z/zhonghua` 的判定必须先于 `CLAN_PATH_RE`**：`CLAN_PATH_RE = /^\/z\/([a-z0-9_]+)$/`（`App.vue` 第 12 行）会把 `zhonghua` 当成 `tree_id='zhonghua'` 的**祖谱**。代码注释（第 35 行）已登记该顺序约束；**任何后续改动都必须保持该判定先于祖谱正则**。

---

## 3. `/zhonghua` 弃用与重定向

| 项 | 口径 |
|---|---|
| 弃用对象 | 旧世本路径 **`/zhonghua`**（含 **path** 与 **hash** 两种写法） |
| 行为 | **客户端重定向**到 **`/z/`**（重定向后地址栏为 `/z/`） |
| 实现层 | **仅前端**（`App.vue`）：真源里**不再有** `/zhonghua` 这类 `path_alias` |
| 是否服务端 301/302 | **未做**（无 hosting 重写规则改动）—— 属**已拍板事实**，不是缺陷 |
| 语义边界 | `/z/ji_23395` 一类祖谱路径**不受影响**（仍为祖谱） |

---

## 4. 数据口径：`config/tree-meta.json` 的 `path_alias`

| 树类 | `path_alias` |
|---|---|
| 世本 | **`/z/`**（`trees.zhonghua.path_alias`，第 66 行） |
| 祖谱 | `/z/<tree_id>`（例 `/z/ji_23395`；支系祖谱按其自身条目） |
| 普通家族树 | `/<tree_id>`（例 `/ji_23395_01`） |
| 其它展示字段（`surname_char` / `surname_pinyin` / `display_title` / `hall_name` / `origin` / `description` / `founder_*` / `kind` …） | **不变**（`surname_pinyin` = 该树实际采用的姓氏拼音，tree-meta 新字段；口径见 `docs/tree-id.spec.md` §4） |

**本批真源手术（2026-09-18）**

- 变更：`trees.zhonghua.path_alias` **由 `/zhonghua` 改为 `/z/`**。
- 备份：**`~/jiazu-backups/20260918-144857-tree-meta-alias/`**。
- ⚠️ `config/tree-meta.json` 是**云端数据的一部分** → 上云时**必须随云端数据同步**（`docs/PENDING_DEPLOY.md` §17-3）；**重打包云函数不覆盖该项**。

**本批真源手术（2026-09-19）：3 棵树原地改名（`path_alias` 随之改，旧值不留别名）**

| 旧 tree_id | 新 tree_id | 姓氏 | `path_alias` 旧 → 新 |
|---|---|---|---|
| `shi_32426_01` | `ji_32426_01` | 纪 | `/shi_32426_01` → `/ji_32426_01` |
| `shi_23481_01` | `rong_23481_01` | 容 | `/shi_23481_01` → `/rong_23481_01` |
| `shi_24658_01` | `heng_24658_01` | 恒 | `/shi_24658_01` → `/heng_24658_01` |

- 成因：旧注音实现的静默兜底把未收录姓氏写成 `shi_*`（根因与修复口径见 `docs/tree-id.spec.md` §2 / §5）。
- **与 §3 的 `/zhonghua` 弃用不同**：本批**不留**旧 `path_alias`、**不做**客户端/服务端重定向 → 改名前发出的链接一律 **404**（属预期，不是缺陷）。
- 载荷：tree-meta 键 + `tree_id` + `path_alias`；树 JSON 文件名 + 内部 `tree_id`；详情文档文件名前缀 + 内部 `tree_id`；业务集合 `ref.tree_id`（实测无引用）。上云清单见 `docs/PENDING_DEPLOY.md` §20-2。

---

## 5. 子域现状（已知边界）

- `shiben.*` 子域的地址栏**仍为子域根**，**未改写**为 `/z/`。
- 归类：**已知边界**（不是缺陷）——本册只规定主域路径口径；子域改写如需，另立批次。

---

## 6. 跨树跳转的路径输出

- `frontend/src/business/cross-tree.ts` 对 **`is_master` / `zhonghua`** 统一输出 **`MASTER_PATH`（= `/z/`）**（第 15 行），**不再输出 `/zhonghua`**。
- 祖谱跳转输出 `/z/<tree_id>`，普通树输出 `/<tree_id>` —— 与 §1 表一致。

---

## 7. 验收与证据指针

| # | 验收点 | 证据指针 |
|---|---|---|
| 1 | `/z/` 进入世本（90 世 / 112 人），**地址栏保持 `/z/`** | `docs/chain-batch-append.qa.md` §9（T1） |
| 2 | `/zhonghua` → 重定向到 **`/z/`** | 同上（T1） |
| 3 | `/z/ji_23395` 仍为**祖谱**（未被 `/z/` 世本判定吞掉） | 同上（T1） |
| 4 | `tree-meta` 的 `zhonghua.path_alias` = `/z/`（真源体检） | 同上（§9 真源体检） |

---

## 8. 已知边界与信息缺口

| # | 项 | 口径 |
|---|---|---|
| 1 | `shiben.*` 子域地址栏未改写为 `/z/` | **已知边界**（§5） |
| 2 | 服务端未做 `/zhonghua` → `/z/` 的 301/302 | **客户端重定向**即口径（§3）；如需 SEO/深链保真，另立批次 |
| 3 | `/z/zhonghua` 判定的顺序约束 | 属**脆弱点**（正则会误吞）：改动 `App.vue` 时必须保持判定先于 `CLAN_PATH_RE`（§2）；本轮**未加独立单测**断言该顺序（前端无对应单测文件）→ **信息缺口** |
| 4 | `path_alias` 其它树条目的形态 | 本册只写死三类**形态规则**；逐树逐条的字面值以 `config/tree-meta.json` 现场为准（不复制全量） |
| 5 | 3 棵树改名（`shi_* → ji_/rong_/heng_*`）**不留旧别名、不做重定向** | **已拍板口径**（§4）：旧链接 404 属预期。不属缺口 —— 需要保真深链时另立批次 |

---

## 9. 交叉引用

| 文件 | 关系 |
|---|---|
| `docs/clan-tree.spec.md` | 世本 / 祖谱 / 普通家族树三类树的数据语义（§6 tree_id 口径指向 `docs/tree-id.spec.md`） |
| `docs/tree-id.spec.md` | tree_id 生成口径（pinyin-pro 姓氏模式 / 无兜底 / `surname_pinyin`）与 3 棵树改名的不留别名口径 |
| `docs/chain-batch-append.spec.md` | 同批「批量添加子孙」扩展到祖谱（§3-5 祖谱档） |
| `docs/chain-batch-append.qa.md` | §9 扩展轮质检（T1 URI 证据、真源体检） |
| `docs/PENDING_DEPLOY.md` | 部署项 = §17（云函数重打包 + **§17-3 数据项 `path_alias`** + 前端 H5）、§20（tree_id 注音修复 + **§20-2 数据项 3 棵树改名**） |

---

## 10. H5 路由模式：hash → history（首页裸域）· SPA rewrite · 别名兜底（2026-10-10 本批，追加）

> **本节的定位（硬）**：本节**只追加**、**不改动 §0–§9 任何历史行**（承 `AGENTS.md` §0-4）。**首页裸域**为**新增**口径，**不取代** §1 的三种路径形态（`/z/`、`/z/<tree_id>`、`/<tree_id>` 三形态**一律继续有效**）。§2 的 `#/z/` **接受形态继续有效**（作为**旧链兼容**保留，本批实测已验），见下表第 4 行。
> **本批性质**：**纯前端 + 宿主配置**（`frontend/src/manifest.json` / `frontend/vercel.json` / `frontend/src/App.vue` / `frontend/src/business/cross-tree.ts` / `frontend/src/pages/person/detail.vue`）；**无云端数据 / 集合动作**。上云动作见 `docs/PENDING_DEPLOY.md` **§58**。

| # | 项 | 口径 / 取值（逐字） |
|---|---|---|
| 1 | 路由模式开关（构建期） | `frontend/src/manifest.json` **新增顶层 `h5`** = **`{"router":{"mode":"history","base":"/"}}`**；取值判定在 `@dcloudio/uni-cli-shared/dist/vite/features.js` **约 140-145 行** —— 判 `webManifest.router.mode === 'history'`。 |
| 2 | 运行期选路 | `@dcloudio/uni-h5/dist/uni-h5.es.js` 的 `initHistory()` **约 16552-16562 行** 按 `__UNI_FEATURE_ROUTER_MODE__` 选 **`createWebHistory`** / `createWebHashHistory`。 |
| 3 | 入口页 `path` 与别名（判定事实） | uni-app H5 **入口页路由 `path` 恰为 `'/'`**；**`/pages/index/index` 只是它的 alias**（证据：`frontend/node_modules/@dcloudio/uni-h5-vite/dist/plugins/pagesJson.js` 的 `generatePageRoute`，**约 197-210 行**）。 |
| 4 | §2 的 `#/z/` 接受形态 | **继续有效**（**旧链兼容保留**）；本批三轮真机质检已验：旧链 **`/#/pages/hall/index?tree_id=ji_23395_01`** 与 **`/#/z/`** 均被转成**等价 path 形态**。 |
| 5 | 宿主层 SPA rewrite | `frontend/vercel.json` **保留原有 5 键** + **新增** `rewrites` = **`[{"source":"/(.*)","destination":"/index.html"}]`**。 |
| 6 | Vercel 路由优先级（结论） | **先做文件系统检查、再评估 `rewrites`** ⇒ 静态资源不受影响；SPA fallback 的规范写法就是 `source` 为 **`/(.*)`**（**不应**用 negative lookahead 过度排除，属**反模式**）。 |

**首页裸域口径（新增）**

- 本批后**首页地址即裸域**（`pathname === '/'` 且 `hash === ''`）；**这是新增口径，不取代 §1 的三种路径形态** —— §1 的 `/z/` / `/z/<tree_id>` / `/<tree_id>` 三形态**一律继续有效**（承本节定位行）。

**§3 那行的语义自本行起收窄（旧行原文保留）**

- §3 现有行「**是否服务端 301/302：未做（无 hosting 重写规则改动）—— 属已拍板事实，不是缺陷**」**原文一律保留**；**该行的语义自本行起收窄**：宿主层**现已有 SPA fallback `rewrite`（不是 301/302 重定向）**，使 `/z/` 、`/<tree_id>` 等**可读路径可作为首屏地址直达**。

**两个机制（各一句）**

- **首页地址归一**（`frontend/src/App.vue`）：包装 `history.pushState` / `history.replaceState`，`pathname === '/pages/index/index'` 时**收敛为裸 `'/'`**，并传 `history.state` 以**保留 vue-router 状态**。
- **popstate 别名兜底**（`frontend/src/App.vue` 的 `onPopStateAlias`）：地址**既非 `'/'` 也非 `/pages/...`** 时，`setTimeout 0ms` 后**复用 `resolveTreeAlias` 重派**，带 `aliasRepopPending` **防重入**、模块作用域**只注册一次**，在 **`#ifdef H5`** 内。

**本批修掉的两条真缺陷**

- **缺陷 ①（别名收敛处 `replaceState` 首参传 `null`）**：`replaceState` 首参传 `null` 会**清空 vue-router 的 `history.state`**；已改为传 **`history.state`**。**共 4 处**替换：`frontend/src/App.vue` 的 `keepMasterUrl` / `keepAliasUrl`、`frontend/src/business/cross-tree.ts` 的 `openTreeHome`、`frontend/src/pages/person/detail.vue` 的 `convergeUrlTo`。
- **缺陷 ②（更关键的阻塞缺陷 —— 别名地址作为历史条目时前进 / 后退会白屏）**：**可读别名地址（`/ji_23395_01` 、`/z/`）作为历史条目时，浏览器前进 / 后退回到它会白屏**。根因 = **打包出的 vue-router 的 popstate 处理从 URL 解析路由、不用 `state.current`**，而**别名不是路由**；且**前进 / 后退不触发 `onPageNotFound`**。修法 = `frontend/src/App.vue` **新增 popstate 别名兜底**。**实测**：修前 forward 回 `/ji_23395_01` 得 **`bodyLen` 3372 空白且 9s 不恢复**；修后稳定 **9545**、hero / canvas / lineage 节点齐备。

**已知边界（已接受差异 · 不得美化）**

- 在**别名页**上用 `uni.navigateTo` 跳到内部页后，浏览器的 **back 会落在内部路由形态** `/pages/hall/index?tree_id=...`（**不再是 `/ji_23395_01` 别名形态**）；**内容正确、无白屏、无报错**。根因 = **vue-router 的 `push` 在 `pushState` 前先 `replaceState(a.current)`（内部路由 URL）覆盖了当前条目的别名 URL**。**若要保别名需在宿主页 `onShow` 重放 `keepAliasUrl`（本轮未做）**。**此行为非本批引入**（**别名层固有**；**hash 模式下同样丢别名**）。

**三轮真机质检（headless Chrome + CDP，自建 SPA fallback 服务器）关键读数（逐字）**

- 首页 **`pathname='/'` 且 `hash=''`（`bodyLen` 29171）**，且切 tab 回首页仍为 `'/'`；家族页 / 世本页地址**无 `#`**；`/z/` 与 `/ji_23395_01` 首屏直达 + `Page.reload` 均正常、**地址不回退**；旧链 **`/#/pages/hall/index?tree_id=ji_23395_01`** 与 **`/#/z/`** 均被转成**等价 path 形态**；`/z/zhonghua` 与 `/zhonghua` **均收敛为 `/z/`**；产物里 **`createWebHashHistory` 与 `hashchange` 命中数均为 0**、**`popstate` >= 1**；全程**无未捕获异常 / console error**。
- ⚠️ **尚未在 Vercel 上验证**：上列读数均为**自建 SPA fallback 服务器**下的实测；**`rewrites` 在 Vercel 上生效属上云后冒烟项**（见 `docs/PENDING_DEPLOY.md` **§58-5**）。

**另一处发现（不属本批 · 不得写成已修）**

- `frontend/src/App.vue` / `frontend/src/business/cross-tree.ts` 的别名解析用**相对** `fetch('/api/tree-meta')`，而线上 `www.jiapu100.com` **并无 `/api` 映射**（API 在云函数域名上）⇒ 该异步分支**在生产本就不通**（**非本批引入**）。

---

**§10 追记（2026-10-10 上云已执行 · 两处口径纠正 + 三条边界 · 只追加 · 不改本节以上任何行）**

> **本节地位**：本追记**只追加**、**不改 §0–§9 与本 §10 以上任何历史行**（承 `AGENTS.md` §0-4）。**上云动作与部署后冒烟实测的逐条回填**见 `docs/PENDING_DEPLOY.md` **§58-5 回写**；本批**上云动作 / Vercel env `VITE_API_BASE` 变更 / 真源零写入**登记见 `AGENTS.md` **§7 本批追加行**。

**上云现状（Zang 实测）**

- 本批**已由 Zang 统一收口并上线** —— `main` 已推 **`68b38ec..ae62646`**；Vercel 生产部署 **`jiapu-4rlrew632-kevins-projects-f98df261.vercel.app`** = **Ready（1m）**、**`www.jiapu100.com` 已跟随**。
- **P0 env 已关账**（Zang 实测）：Production env `VITE_API_BASE` 由**旧值（缺 `/api`）**改为 **`https://liwu-d8gek6jjdab1d087c.service.tcloudbase.com/api`** 并**重新构建** —— 线上首页 `bodyLen` **108 → 29171**、`.t-cell` **0 → 14**；线上入口 chunk baked 串含 `tcloudbase.com/api` **× 1**。

**两处口径纠正（Neng 实测 · 第二轮外部复核 · 必登）**

- **纠正 ①（「仅改 hash 不桥接」的边界收窄 —— 只对根路径 `/` 与 `/pages/**` 成立）**：本批语境中「**已加载页面仅改 hash 不桥接**」这一边界**须收窄** —— **只对根路径 `/` 与 `/pages/**` 成立**；**别名页（`/z/`、`/ji_23395_01`）上仅改 hash，会被本批新增的 `frontend/src/App.vue` popstate 兜底桥接**（**Neng 实测**）⇒ **不得**再把该边界概括为「已加载页面」。
- **纠正 ②（线上 `/api/tree-meta` 由 404 变 200 HTML · 结论不变）**：本节末尾「另一处发现（不属本批 · 不得写成已修）」的读数**已被 catch-all rewrite 改变** —— 线上 `/api/tree-meta` 现返 **200 `text/html`**（= `index.html`）；失败点由 **404** 变为 **`r.json()` 解析异常且被 `.catch` 吞** ⇒ **结论不变**（`frontend/src/business/cross-tree.ts` 的 `openTreeHome()` 可读别名改写、`frontend/src/App.vue` 的 `resolveHostTree()` 子域定位，在线上**静默失效**；**直载别名因正则短路仍正常**）；**属既有事项、非本批引入**。

**三条边界（如实登 · 不得美化 · Neng 实测）**

- **边界 ①（全站无真 404）**：catch-all `rewrite` ⇒ **全站无真 404**；未知路径（实测：`/pages/nonexistent/page`、`/foo_bar`、`/xyz`）返 **200 + 空白 SPA shell** ⇒ **SEO / 监控口径需知悉**。
- **边界 ②（邀请短链仍为 `#` 形）**：邀请短链**仍以 `#/pages/invite/landing?c=` 形态生成**（`frontend/src/business/api.ts` 未改）；**打开被桥接、地址栏最终无 `#`**。
- **边界 ③（首页 `🌐` 为原位视图切换）**：首页 `🌐` 为**原位视图切换**（**切世博后地址仍 `/`**，**既有设计**）。

（**并登**：本批**真源零写入** —— 未触碰 `migrate-output/**` 与 `config/tree-meta.json`；**双会话冲突与 Kevin 仲裁（A 为准 · owner = Zang · B 已撤回存档）**登记见 `AGENTS.md` **§7 本批追加行**。）
