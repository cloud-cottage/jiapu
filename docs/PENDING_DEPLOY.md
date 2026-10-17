# 待部署清单（本地已完成 · 云端未部署）

> 约定：当前阶段**只做本地**。所有"已本地验证、需要上云"的动作按顺序累积在本文件里，
> 日后一次性执行；每项都注明**为什么需要**与**本地验证证据**，避免部署时靠回忆。
> 最后更新：**P4 批次（运营侧）** —— 云函数 `compat-api` 新增 `GET /messages` / `POST /messages/read`（**需登录**）/
> `POST /admin/assets/grant` / `GET /admin/assets/logs` / `GET /admin/assets/user`（**限 `chief_editor`**）/
> `POST /account/delete`（**需登录**）**六条路由**（模块 `lib/economy-ops.js` + 集合 `jiazu_messages` / `jiazu_ops_logs`
> —— 两集合**已并入上传脚本 `COLLECTIONS`，现 12 项**），前端落点为资产页「消息提醒」区 + 后台「资产运维」区 +
> 「我的」页消息中心 / 注销入口（**`build:h5` 与 `build:mp-weixin` 都必须重跑**）。
> ⚠️ **本批必须一次性重跑 esbuild 重打包**：`cloudfunctions/deploy/compat-api/index.js` **仍是旧产物**，
> 已落后 **P0–P4 全部改动**（P0 三条 / P2 五条 / P3 七条 / P4 六条 = **21 条新路由**，含 `lib/store.js` 缓存顺序修复）。
> 详见 P0 → §7、P2 → §8、P3 → §9、**P4 → §11**；跨批次已知限制与已修复项见 §10。
> **2026-09-18 追加（本批 → §17）**：总谱【**批量添加子孙**】+ 移除【同世并列】弹窗 + **缺陷 A（no-op 编辑不扣费）** + **缺陷 B（单树写一致性）** ——
> 云函数 `compat-api` **新增 1 条路由** `POST /admin/chain-append-batch`，并变更 `lib/economy-fee.js` / `lib/store.js` / `lib/tree-write.js` / `index.js`
> （**必须重打包，否则云端新路由 404**）；前端 H5 批量面板 / 删弹窗 / dirty 比对 / 首页 tab·人数 / 窄屏样式（**必须重打包**）；
> **CloudBase 集合与云端数据：无变化**。规格见 `docs/chain-batch-append.spec.md`，质检汇编见 `docs/chain-batch-append.qa.md`。
> **2026-09-19 追加（本批 → §18）**：镜像节点**口径 A**「树内保持可见 · 点开即真身」（规格 `docs/marriage.spec.md` **§9-7** 九条 + **§9-3 / §9-4** 修订 + **§10** 前端落点）——
> **纯前端改动**（`frontend/src/business/cross-tree.ts` / `components/tree-pedigree/tree-pedigree.vue` / `components/person-archive/person-archive.vue`）：
> `build:h5` + hosting 部署、小程序同批重打；**云函数路由 / CloudBase 集合 / 云端数据三项均为「本轮无」**（见 §18-0）。
> 本轮实施已完成：**已实施 + 真机质检通过（2026-09-19）**（证据见 §18-1「本地验证证据」），本清单只登记上云动作。
> **2026-09-19 追加（本批 → §19）**：**跨树嫁娶配偶发现通道**（口径 A+B；规格 `docs/marriage.spec.md` **§9-8** 八条 + **§10** 后端 / 前端落点；
> 权限登记 `docs/permission-tier.spec.md` **§11**「定点例外」）——
> 云函数 `compat-api` **新增 1 条路由** `GET /search/marriage-candidates`（**必须重打包，否则云端 404**）；前端娶入 / 嫁出弹窗改调该通道 + 新增「按全局编号指定」输入框（**必须重打包**）；
> **CloudBase 集合与云端数据：无变化**（§19-0 第 2–3 行均为「无」）。本轮实施已完成：**已实施 + 冒烟 / 单测通过（2026-09-19）**（证据见 §19-1 / §19-4「本地验证证据」），本清单只登记上云动作。
> **2026-09-19 追加（本批 → §21）**：**首页卡片人数单列镜像**（规格 `docs/marriage.spec.md` **§9-4 修订** + **§11-4**）——
> 云函数 `compat-api` 的 `GET /tree/rank` **新增出参字段 `mirror_count`**（全树 `external_mirror === 'true'` 节点数；**必须重打包**，否则云端无该字段）；
> 首页家族 / 祖谱卡片文案改「N 人（含外树 M）」（**必须重打包**）；**CloudBase 集合与云端数据：无变化**（§21-2 / §21-3 均为「无」）；
> **`mirror_count` 只用于展示，排序归一化仍用 `person_count`**。
> **2026-09-19 追加（本批 → §22）**：**家族树共享选择器（展示层）+ uni-app H5 遮罩关闭修复**（规格 `docs/marriage.spec.md` **§9-9** / **§9-10**）——
> 新增共享组件 `frontend/src/components/tree-picker/tree-picker.vue`（折叠态恒一行 44px + 展开态独立覆盖层 z-index 1200）并接入 `person-archive.vue` 三处（嫁出 / 娶入、认祖、挂载祖谱）；
> 同批把全仓 **11 处**「点遮罩关闭」由 `@click.self` 改为「遮罩 `@click` + 内层面板 `@click.stop`」**成对写法**（`grep '@click.self'` = **0**）。
> **云函数 compat-api：无新增路由 / 无改动；CloudBase 集合：无；云端数据：无**（§22-0）；**前端 H5 必须重打包**（hosting 部署）、小程序同批重打包上传。
> **2026-09-19 追加（本批 → §23）**：**家族人数口径修订**（规格 `docs/home-sort-search.spec.md` **§10-6** 七条全文 + 本册 §23；权限侧补注 `docs/permission-tier.spec.md` **§5 末条**）——
> 云函数 `compat-api` 的 `GET /tree/rank` **`person_count` 语义变更**（**字段名 / 形状 / 类型不变** ⇒ **必须重打包**，否则云端**不报错、只静默返旧口径数值**）；首页家族 / 祖谱卡片文案改「**N 人**」+ 家族页（`hall`）树图统计栏改为同一口径（**H5 必须重打包 + hosting 部署**）；**CloudBase 集合与云端数据：无变化**（§23-2 / §23-3 均为「无」）。
> **取代 §21 的卡片显示口径**（旧「N 人（含外树 M）」单列镜像显示已作废；**§21 正文不改写**，其 `mirror_count` 降级为**保留字段、不再参与展示**）。
> 本批状态：**已实施（本地已验证，2026-09-19（Zang 汇总））** —— 实施与本地验证已完成（证据见 §23-1）；上云动作仍未执行；本节只登记上云动作，**不表示已实现 / 已通过 / 已部署**。
> **2026-09-20 追加（本批 → §24）**：**家族树「发源地」结构化（三级行政区划 + 台湾省补全 + 海外单列）**（规格 `docs/geo-origin.spec.md`；口径来源 = Kevin 四问裁定 + Zang 契约 v1）——
> 云函数 `compat-api` **新增结构化字段 `origin_code`**（`PUT /tree-meta` 白名单 + 建树 / 建祖谱落库 + 立支复制 / 拆树置空共 5 处，**必须重打包**，否则云端不认 `origin_code` 且不会做「未知码 → 400」）；
> **云端数据：有变更**（**纯数据批次**：`config/tree-meta.json` 存量 `origin` → `origin_code` + 展示串重算，§8 逐树映射 17 行，含 md5 前后登记位）；**CloudBase 集合：无变化**（§24-2「无」）；
> 前端 H5 / 小程序**必须重打包**（建树弹窗 + 家族树编辑 + 祖谱编辑三处自由文本 → 三级级联菜单；数据集随包发布、**零请求**）。
> **2026-09-23 追加（本批 → §31）**：**子女标签可拖曳排序（排行）**（规格 `docs/sibling-order.spec.md`；计费口径 = `docs/economy-fee.spec.md` §3-1 #36 / **§15**）——
> 云函数 `compat-api` **新增 1 条写路由** `POST /admin/sibling-reorder`（**必须重打包，否则云端 404**）；前端 H5 / 小程序**必须重打包**（人物档案子女区新增「调整排行」入口 + 新建次级模态框 `components/sibling-order-modal/`）；
> **CloudBase 集合与云端数据：本轮无**（不新建集合、`COLLECTIONS` 保持 **12 项**；`migrate-output/**` 与 `config/tree-meta.json` 本批未被触碰）。
> 本批状态：**实现已落盘（Kong 实测 · 工作区在途未提交）· 待 Neng 终校**；`npm test` 当前 **478 / 476 / 2（红）**（2 红 = 预存在的 `mirror-count` 真源漂移，见 §31-5）⇒ **本清单只登记上云动作，不表示已通过 / 已部署**。
> **2026-10-04 追加（本批 → §4-2）**：**树图节点卡片配偶行按性别分叉**（男「娶 X」/ 女「嫁 X」/ 性别未知仍「配X」，空格只在娶·嫁后；行数·卡宽·卡高·布局与 hover 提示零改动）——**纯前端**（`frontend/src/components/tree-pedigree/tree-pedigree.vue` 一处代码 + 两处注释；`frontend/src/business/pedigree.ts` 仅注释）；
> **云函数 `compat-api`：无新增路由 / 无改动；CloudBase 集合：无；云端数据：无**；**前端 H5 / 小程序必须重打包**（不重打则线上仍是旧「配X」）。
> 本批状态：**已提交并 push（`d41136f`）· 真机渲染质检通过（2026-10-04）· 本清单只登记上云动作，不表示已部署**（证据见 §4-2）。

---

## 当前状态与待办（**2026-10-12 结构清理后的唯一现行节**）

> **现行部署模型**（取代本册旧「一次性集中上云」前提 · Kevin 2026-10-12 拍定结构清理）：**H5 前端 = 随 `main` push 自动构建上线（Vercel Git-connected）**；**云函数 `compat-api` = 手工重打包 + 部署**；**CloudBase 集合 / 云存储 / 数据修正 = 手工**。
> **清理登记**：历史批次 **§1–§65（61 节）已于 2026-10-12 按 Kevin 指令 B 移出本册** —— 全文归档 = `git show 7622aa6:docs/PENDING_DEPLOY.md`（提交 `7622aa6`）。**各批次的规格真源仍在各自 `docs/*.spec.md`**，本册只承载「部署动作面」。

### ✅ 待办 1（已完成）：compat-api 重打包 + 部署（**2026-10-12 09:48 · Zang 执行**）
- 重打包产物三查全过：`admin/revision/save` ≥1 / `revision_locked_edit` ≥1 / `admin/revision/abort` =0 / SDK 保持 `require("@cloudbase/node-sdk")` external
- `yes | tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c` ⇒ **部署成功**（函数修改时间 **2026-10-12 09:48:07**）
- **二级判据全过（生产 HTTP）**：`GET /revisions?tree_id=ji_23395_01` **200**（新出参 `fee_start_bamboos` 等）· `POST /admin/revision/save` 未授权 **401** · 旧 `POST /admin/revision/abort` **404 未知路径** · 回归 `tree-meta` / `tree/rank` / `search/global` / `invite/code/resolve` 全 **200**
- 连带：云端集合 `jiapu_revisions`（Kevin 已建）由此进入可用态；H5 已随 push 自动构建（Vercel）

### ⬜ 待办 2：小程序产物重打（按需 · 未执行）
- 一次 `build:mp-weixin` + 上传即覆盖全部积压的纯前端批（§18/22/30/36/37/41/54/63/65 + 修谱域前端）
- 状态 = **待 Kevin 发话**

### ⬜ 待办 3：昭範正圖图片链路真机验收（上线后）
- base64 → 云存储 `revisions/<tree_id>/<seq>/cover.<ext>` → 文谱卷首大图（**本项目唯一未实测硬缺口**）

### ⬜ 待办 4：季氏树测试痕迹处置（Kevin 已授权「不必清理」· 原样保留）
- `ji_23395_01` 修谱档 `seq=1`（测试「譜序」文本 · `effective_at` 回填 **2026-09-11** ⇒ 已处锁定态）· 账号 `16601061656` 竹片余 **1737** 片

## 0. 总览

| # | 目标 | 动作 | 阻塞 |
|---|---|---|---|
| 1 | 云函数 `compat-api` | 重打包 + `tcb fn deploy`：**必须重打**（`cloudfunctions/deploy/compat-api/index.js` 目前仍是旧产物、已落后 P0–P4 全部改动 —— 见 §7-1 / §8-1 / §9-1 / **§11-1**） | 无 |
| 2 | CloudBase 集合 | 新建 `jiazu_join_requests`、`jiazu_marriage_requests`、`jiazu_founder_requests`、`jiazu_clan_requests`（+ `jiazu_person_details.tree_id` 索引） | 需 CB_ENV/CB_KEY |
| 3 | 云端数据 | 重跑迁移上传（树 JSON / 详情 / tree-meta） | 需 CB_ENV/CB_KEY |
| 4 | 前端 H5 / 小程序 | `build:h5`（带 `VITE_API_BASE`）+ hosting 部署；`build:mp-weixin` + 开发者工具上传 | 需确认 hosting 目标与域名 |

> ⚠️ 本批前端产物**必须重打包**（`frontend/dist/` 现存的是上一版产物）：不重打包会缺
> 「世本关键节点标注 / 祖谱删除入口收紧 / 跨树改父·删除节点前端调用」等本批改动。见 §4 末尾。
> ⚠️ **2026-09-18 追加**：首页**家族 / 祖谱列表 tab** + 卡片**人数标签** + 排序行**窄屏样式**（见 **§4-1**）
> 同属**纯前端**改动，**随同一次前端重打包发布**，不需要任何后端 / 集合 / 云端数据动作。

> ⚠️ **§0 总览行状态标注（2026-10-09 · Jing · 只追加 · 承 `AGENTS.md` §0-4）**：上表 **第 1 行（云函数 `compat-api`）** 与 **第 2 行（CloudBase 集合）** 的「云端未部署」状态**已由本批上云动作覆盖**（**两行原文一律保留、不回改**）：**① 云函数 `compat-api` = 已重打包 + 已部署**（重打包产物 `cloudfunctions/deploy/compat-api/index.js` = **1,404,179 B** / md5 **`afedfee56e95c6c0a7040a3e83553095`**；`tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c` **成功**；函数修改时间 **2026-10-09 20:27:30**；**实况 = 本册 §56-6 二 / §57-7 二**）。**② CloudBase 集合 = 云端迁移已完成**（`jiazu_*` → `jiapu_*` **20/20**（新建 **19 created + 1 exists**；二次跑全 exists 幂等）· 导入 **358 档** · **双轨对账 20/20 全绿**（文档数 + `_id` 全集 + 全量字段深比 0 差异）· **旧集合保留未删**；**实况 = 本册 §57-7 一**）。**第 2 行阻塞点「需 CB_ENV/CB_KEY」本次已由 tcb 登录态 STS 消解**。**第 3 行（云端数据）/ 第 4 行（前端 H5 / 小程序）**：前端两产物已重出（**§56-6 五**），**遗留 = 小程序上传 + H5 托管（Vercel R4）待 Kevin**。

---

## 5. 部署后冒烟验证（按序做）

1. `curl -s -X POST <fn>/admin/reparent -H 'Authorization: Bearer <chief>' ...` → 400/403（说明路由已上线）；
2. 云端读：`GET /people/?profile=all`（`X-Tree-Id: zhonghua`）→ 105 人、含 `风华胥`（`external_chain_gen=0`）；
3. 云端写：网页上给某人加配偶 / 改父 → 云上读回一致（验证云存储 + 集合双写）；
4. 前端：`/zhonghua` 时间轴根卡显示「风华胥｜原始」；树图根卡「风华胥／原始」→「风伏羲／第1世」；
5. 权限：普通用户对总谱改父 → 403；未登录 → 401。

---

## 6. 明确**不需要**上云的东西

- `auth-server/`（本地遗留链路 → Gramps-Web，本地端口 `5197` → `5198`）：**不进云**，云上由 `compat-api` 承担；
- `scripts/*` 里的一次性修复脚本（`fix-zhonghua-gender.mjs`、`fix-person-names.mjs`、`audit-person-names.mjs`）与 E2E 脚本：离线工具，只在需要时本地跑；
- `/tmp/jiazu-*`（E2E 数据副本、备份）：临时产物。

---

## 10. 已知限制 / 阻塞（跨批次登记）

> 本节只登记**跨批次**的已知限制与修复，避免 P2 / P3 章节重复；「已修复 · 非阻塞」项无部署动作。

### 10-1 `lib/store.js` 集合写路径：已修为「先落盘成功再更新缓存」（**已修复 · 非阻塞**）

- **原实现（问题）**：`cloudfunctions/compat-api/lib/store.js` 的 `colSet` / `colDelete` 是**先写进程内缓存（`colCache.set`）再落盘**。
  落盘失败（`EACCES` / `ENOSPC` 等）时缓存已被改脏 → 同进程后续 `colGet` 会读回一条**磁盘上并不存在的「幻影文档」**
  （**落盘失败后的进程内脏读**：对调用方表现为写入成功，磁盘仍是旧值）。
- **本轮修复**：改为**先落盘成功、再更新缓存** —— 新增内部函数 `persistColMap(col, map)`（只接收待落盘的**新**集合内容、不读 `colCache`）；
  `colSet` / `colDelete` 先构造 `pending` 副本 → `await persistColMap(...)` → **成功后才** `colCache.set(col, pending)`；
  落盘抛错则**缓存保持旧值并向外抛错**，绝不留幻影文档。云端分支维持「SDK 写入成功后才更新内存映射」。
- **影响面**：本地模式（`COMPAT_SOURCE=local`）与云端模式共用该写路径；本批 P2 / P3 的全部集合写（`jiazu_spirit` / `jiazu_market` / `jiazu_assets`）一并受益。
- **状态**：**已修复（非阻塞）**，随本文件任一批次重打包自动生效，**无独立部署动作**。

### 10-2 §7-7 旧阻塞项未变（交叉引用）

- `jiazu_assets` 单文档并发模型重构（**每手机号一文档 + `version` 乐观锁 CAS 重试**）**仍是 §7-7 登记的部署阻塞项**；本轮（P2 / P3）**未改存储形态** ——
  `jiazu_spirit` / `jiazu_market` 同为**单文档 `_id='global'` + 进程内锁**，上云前按 §7-7 的口径一并评估（跨实例并发兜底口径见 `docs/economy-market.spec.md` §5.2）。

---

## §50 上云 · 共用环境纪律 + 路 B 前置（**共用 CloudBase 环境 `liwu` · 三撞车面 · §4 hosting 命令定点纠正 · 云端 `compat-api` 现状读数 · 旧 `global` 文档待删清单**）（Jing 制度员 · 2026-10-03 · **只追加 · 不改 §0–§49 任何行**（**唯一例外 = §4 原行之后紧接一行取代标注，原行原文保留、未删行**））

> **本节 = 上云共用环境纪律 + 路 B（写一致性 v2）前置读数的登记落点**。**本阶段不上云、只登记**（承 §3 现证 `NR==122` 头部「约定」）。**行号 / md5 / 数值一律现取、不推算、不预填**；**状态类口径 = 三段式**（本批 = **已实现（Kong）、待独立质检（Neng）**；**不写「已通过」、不预写下段**）。口径真源 = Zang 裁定 R（2026-10-03 · 路 B）；规格落点 = `docs/data-model.md` **§7.2**（现证 `NR==336`）；本手册侧对照 = `AGENTS.md` §7 追加行。

### §50-0 共用环境事实（现取）

- **env 名 = `liwu`**；**envId = `liwu-d8gek6jjdab1d087c`**；**套餐 = 标准版**；**创建 = 2026-08-05 10:43:58**。
- **Kevin 已当面确认：「是 liwu 的环境，jiazu 有意共用」**。
- **静态域名 = `https://liwu-d8gek6jjdab1d087c-1463728495.tcloudbaseapp.com`（已上线）**。
- 现取命令与读数（2026-10-03 CST，**均 exit 0**）：`tcb env:list` ⇒ `liwu` | `liwu-d8gek6jjdab1d087c` | 标准版 | 云开发 | `2026-08-05 10:43:58` | 正常；`tcb hosting detail -e liwu-d8gek6jjdab1d087c` ⇒ 静态网站域名（上行）+ 状态【已上线】；`curl -sI <域名>` ⇒ **HTTP/1.1 200 OK**（`server: tcbgw`）。
- 另：`cloudbaserc.json` 现证 `envId` = `liwu-d8gek6jjdab1d087c`（同值）。

### §50-1 三撞车面（硬）

ⅰ. **静态托管根是 liwu 的线上站点**：`tcb hosting list -e liwu-d8gek6jjdab1d087c`（现证 exit 0）根目录含 liwu 线上站点的 **`assets/*`**（例 `assets/api.Cf_tPrur.js` / `assets/button-C_nx03YK.css`）与 **`__auth/*`**（例 `__auth/index.html` / `__auth/env/login.config.json`）⇒ **jiazu 前端一律部署到子路径 `/jiazu/`（Kevin 已裁定），绝不得铺根**。

> ⚠️ **已修正（2026-10-04）**：**托管根 = `jiazu` 自己的旧版 H5**（现网 `GET /` 返 `<title>家族历史数字馆</title>`，847 B、主机 `script src="/assets/index-BBQOnYiU.js"`），**不是** liwu 站点；**子路径 `/jiazu` 的裁定继续有效**（避免覆盖旧版 / 保留回滚参照）。**上列 ⅰ 行原文保留、不回改**（§0-4；事实修正与现网顶层键读数见 **§52-1**）。
ⅱ. **环境里另有 liwu（`meditation-*`）与玺爱/印源（`xiai-*-token`）的函数** ⇒ **只部署 `compat-api` 一个函数，不得碰其它**（现证函数清单见下）。
ⅲ. **HTTP 访问服务是 `/api/` → `compat-api`**。

现证函数清单（`tcb fn list -e liwu-d8gek6jjdab1d087c` · exit 0）：

| 函数 Id | 名称 | 运行时 | 创建时间 | 修改时间 | 归属 |
|---|---|---|---|---|---|
| `lam-q949cajz` | `xiai-user-token` | Nodejs18.15 | 2026-09-30 22:42:24 | 2026-10-01 08:52:34 | 玺爱/印源（**不得碰**） |
| `lam-lda5f0ud` | `xiai-admin-token` | Nodejs18.15 | 2026-09-30 21:29:54 | 2026-10-01 08:52:26 | 玺爱/印源（**不得碰**） |
| `lam-l454cdfz` | `meditation-transcoder` | Nodejs18.15 | 2026-09-29 10:04:38 | 2026-10-03 15:52:27 | liwu（**不得碰**） |
| `lam-ksuqnan5` | `meditation-read` | Nodejs18.15 | 2026-09-29 10:03:57 | 2026-09-29 10:03:57 | liwu（**不得碰**） |
| `lam-hj5axttv` | `compat-api` | Nodejs16.13 | 2026-08-15 15:53:57 | 2026-09-29 09:31:10 | **jiazu（本册 · 唯一可动）** |

### §50-2 定点纠正：本册 §4 的 hosting 部署命令（**原行保留 + 紧接取代标注**）

> 体例同 `AGENTS.md` **§0-4**：**原行原文保留 + 紧接一行加「⚠️ 已取代」标注**（**不删行、不上移、不回改**）。

- **被取代行** = 本册 **§4**（节标题现证 `NR==142`）内、现证 **`NR==147`**（`awk 'NR==147'`）：`# 产物 frontend/dist/build/h5 → 按现有 hosting 流程部署（tcb hosting deploy <dir> -e liwu-d8gek6jjdab1d087c）`。
- **问题** = **缺路径参数**（未给 `cloudPath`）⇒ 按字面执行会把 `frontend/dist/build/h5` 铺到**静态托管根**，即 **覆盖 liwu 线上站点**（`assets/*` / `__auth/*`，见 §50-1 ⅰ）。
- **现证落点** = **§4 内、原行 `NR==147` 之后紧接一行**（现证 **`NR==148`**，逐字以 **`# ⚠️ 已取代（2026-10-03）：…`** 起、以「**详见本册 §50-2（原行原文保留、不回改 —— `AGENTS.md` §0-4）。**」结）。
- **正确形态** = `tcb hosting deploy <dir> /jiazu -e <envId>`（**子路径必填**）；**执行时以 `tcb hosting deploy -h` 实测语法为准** —— 现证 `tcb hosting deploy -h`（exit 0）= **`Usage: tcb hosting deploy [options] [filePath] [cloudPath]`**（**第二个位置参数 = `cloudPath`**）。
- **同类缺路径行（只登记、本批不动）**：本册另一处**逐字相同**的 `<dir>` 写法在 **§7-4**（节标题现证 `NR==287`；该行现证 **`NR==292`**）；另多处 full-path 写法（如 §11-4 / §25-4 / §32-2 / §36-1 的 `tcb hosting deploy frontend/dist/build/h5 -e …`）**同样缺 `cloudPath`** —— **本批只对 §4 那一行加标注**，**其余同串行一律原文保留、不回改**；**不得据本行推定它们已改写**。

### §50-3 云端 `compat-api` 现状读数（实取）

现取 = `tcb fn detail compat-api -e liwu-d8gek6jjdab1d087c`（exit 0）+ `tcb fn list`（exit 0），读数（2026-10-03 CST）：

| 项 | 读数 |
|---|---|
| 函数 Id / 名称 | **`lam-hj5axttv`** / `compat-api` |
| 运行时 | **Nodejs16.13** |
| 创建 | **2026-08-15 15:53:57** |
| **最后修改** | **2026-09-29 09:31:10** |
| 代码大小 | **5903651 B** |
| 环境变量 | **`MASTER_TREE_ID=zhonghua; COMPAT_SOURCE=cloud`** |
| 触发器 | **无** |
| 状态 | 部署完成 |

- **Kevin 口径 = 「按云端可能是旧版处理」** ⇒ **部署前必重打包 + 用行为探针验「新路由真的在线」**；**不得只看 pid / 修改时间**（修改时间只证「某次部署发生过」，不证「含本批路由」；判据形态同 **§42-1**，现证 `NR==4962`）。
- 跨批次背景 = **§46-②**（现证 `NR==5114`）；**唯一硬阻塞（写一致性 v2）= §46-①**（现证 `NR==5111`）→ 规格落点 = `docs/data-model.md` **§7.2**。

### §50-4 tcb 登录态位置

- 位置 = **`~/.config/.cloudbase/auth.json`**（**用户级全局**）。
- **现取**：`mtime` = **2026-10-03 21:57:03**（现盘实测）；`expired` 字段（ms 时间戳 `1793160257024`）换算 = **2026-10-28 12:04:17 CST**；`tcb env:list` 现证 **exit 0** ⇒ **无需单独登录**。
- **凭据值一律不写进文档**（只登记路径 / 时点 / `expired` 换算值；**不打印、不粘贴任何密钥值**）。

### §50-5 云端旧 `global` 文档待删清单（路 B 上云时执行）

- 云端 **5 个集合各一条**旧单文档 `_id='global'` 待删：**`jiazu_assets`** / **`jiazu_spirit`** / **`jiazu_messages`** / **`jiazu_ops_logs`** / **`jiazu_market`**。
- **顺序（硬）** = **先上传新形态 → 再手工删旧键**（口径同「**先传新键 → 再删旧键**」，承 **§12-2**（现证 `NR==741`）/ **§46-③**（现证 `NR==5117`））。
- 本地对应真源文件（**现取 · 5 个顶层键现证均 = `["global"]`**）：

| 集合 | 本地文件 | size(B) | md5（前值 · 待迁） |
|---|---|---|---|
| `jiazu_assets` | `migrate-output/collections/jiazu_assets.json` | 127437 | `4b2b60538ceb6c76005f4b94a8f429bf` |
| `jiazu_spirit` | `migrate-output/collections/jiazu_spirit.json` | 3351 | `922767bba12674671b7b4b9d83489abe` |
| `jiazu_messages` | `migrate-output/collections/jiazu_messages.json` | 1017 | `f8bd7ae19f97947f4a97ebb3463e37f1` |
| `jiazu_ops_logs` | `migrate-output/collections/jiazu_ops_logs.json` | 2357 | `52948ab8fc6d0ff5e9ed298450a6d254` |
| `jiazu_market` | `migrate-output/collections/jiazu_market.json` | 244 | `8243cd377f630ea518f6c261b7a3e50f` |

- **判据**：迁后**本地与云端**该 5 集合的 `global` 键**均必须消失**（新形态 = `docs/data-model.md` **§7.2** R1 / R4）。
- **云端不留独立迁移脚本** —— 上云时由**既有上传脚本按新形态覆盖写入**（`docs/data-model.md` §7.2 R4）。

### §50-6 状态词与边界

- **本批状态 = 已实现（Kong）、待独立质检（Neng）**（三段式；**不得写「已通过」、不得预写下段**）。
- **规格落点 = `docs/data-model.md` §7.2**（现证 `NR==336`）。
- 边界（硬）：本节**不新建独立文档**（承 `AGENTS.md` §2.3）；**未打包 / 未部署 / 未上传 / 未重传 / 未删云端键**（**本阶段不上云、只登记**）；**未 `export` 任何环境变量**；**未改代码 / `cloudfunctions/deploy/**`**；**行号 / md5 / 数值一律现取**；**未改 §0–§49 任何历史行**（**纯追加**；**唯一例外 = §4 原行之后紧接一行取代标注 —— 原行原文保留、未删行**）。
- 上云动作项清单 = **§46**（现证 `NR==5107`；其中 ①=5111 / ②=5114 / ③=5117 / ⑤=5123）；**本节只补「共用环境纪律 + 路 B 前置读数」**，**不重复 §46 的动作项**。

---

## §66 修谱域批次（**全新业务域** · **仓内此前零实现** · **代码批次 + 新集合批次** · **云函数 `compat-api` 重打包 + 云存储新前缀 `revisions/` + H5 / 小程序两产物重打** · **本阶段不上云 · 只登记** · 2026-10-12 · **只追加 · 不改 §0–§65 任何行**）（Zang 制度员）

> **性质（只追加）**：本节为本批（**修谱域**）的**上云动作面登记**。**§0–§65 既有行原文一律保留、一字不改、一行不删**（承 `AGENTS.md` §0-4）。
> **口径权威** = `docs/revision.spec.md`（**本批新立分册 · 首次落盘 2026-10-12**）。
> **纪律（硬）**：本节**不写任何实现现状读数**（行号 / md5 / 字节 / 计数 / 路由条数**一律不预填**）；**判据一律以命令实际输出为准**。
> **⚠️ 本批性质（硬）**：修谱 = **全新业务域**；落笔前实测 **`frontend/src/business/revision.ts` 与 `cloudfunctions/compat-api/lib/revision.js` 均不存在** ⇒ **本批新增后端路由 + 新增集合 + 新增前端落点**（**非既有域的改口径**）。

### §66-0 口径摘要（详见 `docs/revision.spec.md`）

- **修谱** = 家族管理员对**单套家谱**执行「内容新增 + 整体规整」的专属业务；权限专属、按次执行、有固定冷却周期与编辑时效。
- **权限**：**家族管理员 = 本树 `tree_steward`**（档位阶梯 `lib/auth.js`：`guest`0 < `user`1 < `branch_curator`2 < `tree_steward`3 < `chief_editor`4）；**上级管理员 = `chief_editor`**；**普通用户无任何修谱写权限**；**读全档可读（含 guest）、写仅上述两档**；前端单点 = `business/revision.ts` 的 **`canManageRevision(role, treeId)`**、后端同构守卫 = `cloudfunctions/compat-api/lib/revision.js`（**两端逐条同构**，对齐 `lib/badge-guard.js` 先例）。
- **周期与冷却**：间隔表 `revision_interval_years` 默认 **[1,2,3,5,10]**、**全站统一**（落 `jiapu_wallets.config`）；**迭代语义按未作废修谱计数 M 查表**（M=1→1、2→2、3→3、4→5、M≥5→10 年）；第 M+1 次最早开始 = 最后一次未作废修谱 `effective_at` + intervalFor(M) 年（自然年相加）；**第 1 次无等待门槛**；**作废不吃冷却、不计入 M**，但 `seq` 占号不重用。
- **四类可写内容**：**昭範正圖**（单张大图 · 编辑期内可反复替换 · 仅 jpg/png/webp · ≤2 MiB）· **族務紀文**（三固定字段 `title` / `body` / `signature` · **全繁体** · 禁逗号句号 ⇒ 自动换空格）· **譜司襄事**（多条 `{person_handle, duty}` · **点选绑定** · 繁体 duty）· **樂捐名錄**（多条 `{person_handle, amount}` · **点选绑定** · **amount = 正整数 / 元** · 出参 `amount_text` = 繁体汉字大写）；名录**存储只存 `person_handle`**、出参后端解析 `name`（解析不到 ⇒ **「（節點已刪除）」**）；**前端不做人物深链**。
- **编辑期与固化**：开始即生效（`effective_at` = 开始时刻）+ **30 天编辑期**（常量 **`REVISION_EDIT_DAYS = 30`**，**写死不可配**）；届满**自动固化锁定**、**判定走惰性**（读时算 `now > effective_at + 30d`、写时二次校验 · **不建定时任务**）；**固化后家族管理员无权限（403）、仅 `chief_editor` 终审修改**（**写 `jiapu_ops_logs` 留痕**，**op = `revision_override`** · **不改锁态、不重启 30 天期**）；历次记录**全留存**、在线文谱**按 `seq` 升序并列展示（不分组）**。
- **数据模型**：新集合 **`jiapu_revisions`**（每树一档 · `_id = <tree_id>` · 档内 `version` CAS）；档体 = `{_id, version, seq, revisions:[{seq, started_at, effective_at, locked_at(ISO|null), aborted, aborted_at, cover{fileID,ext,width,height,updated_at}|null, article{title,body,signature,updated_at}|null, helpers[{person_handle,duty}], donations[{person_handle,amount}], content_updated_at(ISO|null)}]}`；**「是否有内容」判据 = cover/article/helpers/donations 四者全空才允许作废**。
- **接口（compat-api）**：`GET /revisions?tree_id=<id>`（公开只读 · 出参冻结）· `POST /admin/revision/start`（预扣 `revision_fee_bamboos` 默认 **999** 片 · 不足 **409 `ASSET_INSUFFICIENT`** 带 need/current/unit/how_to_get 且整单不扣不落 · 冷却未到 **409 `REVISION_COOLDOWN`** + `next_start_at` · 已有进行中 **409 `REVISION_ACTIVE`** · 成功 **200**）· `POST /admin/revision/abort`（仅「进行中且四类全空」⇒ `aborted:true` + **原路全额返还 999 片**，复用 `fee_refund` + 幂等重放检查；有内容 ⇒ **400**）· `POST /admin/revision/content`（编辑期内仅家族管理员 / 固化后仅 `chief_editor` 留痕；helpers/donations 全量替换）· `POST /admin/revision/image`（≤2 MiB + 扩展名白名单 · `uploadFile` cloudPath **`revisions/<tree_id>/<seq>/cover.<ext>`** · 替换删旧 · **base64 JSON，不用 multipart**）；扣费流水类型 = **既有 `edit_fee`**（**不新增枚举**）。
- **在线文谱编排**（`frontend/src/business/wenpu.ts` 冻结契约扩展）：**卷首插入修谱页、与谱文同一套连号（从 `葉一` 起连续顺延）**；`WenpuPage` 增 **`kind: 'genealogy'|'cover'|'article'|'roster'|'donation'`**、**`kind` 缺省 = `'genealogy'`**（向后兼容、普通树零变化）；`cover` 页 = 整幅大图占满纸页（960×720）保留左右书口；`article`/`roster`/`donation` 沿用书页竖排栏格规格（30 栏 × 10 字）；**修谱卷内容存储即繁体、不再经 `toTraditional` 渲染派生**（避 s2t 表非幂等 quirk「苎→苧→薴」字形漂移）；无修谱记录 ⇒ 文谱与现状**完全一致**。
- **配置键**（载体 `jiapu_wallets.config` · 写入口扩既有 `PUT /admin/wallet-fee` · 仅 `chief_editor`）：`revision_fee_bamboos` 默认 **999**（非法/缺省 → 999）· `revision_interval_years` 默认 **[1,2,3,5,10]**（正整数数组 · 非法/缺省 → 默认 · 全站统一）。

### §66-1 为什么需要

- **现状（事实陈述 · 落笔前实测）**：仓内**无修谱域**任何实现 —— `frontend/src/business/revision.ts` 与 `cloudfunctions/compat-api/lib/revision.js` **均不存在**；`revision_fee_bamboos` / `revision_interval_years` / `REVISION_EDIT_DAYS` / 集合 `jiapu_revisions` **全仓零命中**；既有后端只有树 JSON 专用的 `uploadFile` / `downloadFile` / `deleteFile`，前端 `api.ts` **零上传封装**。
- **本批** = 新增修谱域**全栈**：新集合 `jiapu_revisions` + 云函数 5 条路由 + 新前端落点（`business/revision.ts` 单点可见性 + 编辑态弹窗）+ **在线文谱卷首插入修谱页**。
- **本批附带** = **全站第一个用户上传图片通道**（base64 JSON，≤2 MiB）。

### §66-2 具体命令（**代码批次 + 新集合批次** · 未实施 · 只登记）

1. **云端创建集合 `jiapu_revisions`**（**漏登 ⇒ 首写报 `DATABASE_COLLECTION_NOT_EXIST`**）。
2. **云函数重打包 + 部署 `compat-api`**（承既有口径；命令以现行为准）。
3. **云存储新前缀 `revisions/`**（`revisions/<tree_id>/<seq>/cover.<ext>`）。
4. **H5 重打**（`frontend/dist/build/h5`）：

   ```
   VITE_API_BASE=https://<云函数 HTTP 域名> npm run build:h5
   ```

   构建前须确认 `VITE_API_BASE` 为当前线上值（承 §57 / §58 的 Vercel env 口径；**逐字以现场 env 为准**）。
5. **小程序重打**（`npm run build:mp-weixin` + 开发者工具上传；**修谱编辑态弹窗 / 在线文谱卷首修谱页随共享 `.vue` 进两产物**）。

### §66-3 本地验证证据

- **本批为规格登记单** ⇒ **未跑测试 / 未构建 / 未部署**；**真源零写入**；**未改任何代码 / `cloudfunctions/` / `migrate-output/` / `config/`**。
- **本地验证证据 = 留空 · 不预填**（待实现落地后按 `docs/revision.spec.md` 口径补登；提交 / 质检读数由执行方与质检方收口后回填）。

### §66-4 部署后冒烟验证（判据 + 期望；结论由执行 / 质检收口后回写，**本清单不预填**）

1. **`GET /revisions?tree_id=<id>`（guest 亦可读）** ⇒ **期望**：出参形状 = `docs/revision.spec.md` §7-1 逐字；cover 带可访问 `url` + `fileID`；名录条目带 `name`、捐款条目带 `amount_text`。
2. **`POST /admin/revision/start`（家族管理员）· 竹简不足** ⇒ **期望**：**409 `ASSET_INSUFFICIENT`** 带 need/current/unit/how_to_get，**整单不扣不落记录**。
3. **`POST /admin/revision/start` · 冷却未到 / 已有进行中** ⇒ **期望**：**409 `REVISION_COOLDOWN` + `next_start_at`** / **409 `REVISION_ACTIVE`**。
4. **`POST /admin/revision/start` · 成功** ⇒ **期望**：**200 `{seq, effective_at, lock_at, fee:{pieces, tx_id}}`**，流水类型 = **`edit_fee`**。
5. **`POST /admin/revision/abort`** ⇒ **期望**：进行中且四类全空 ⇒ `aborted:true` + 原路全额返还 999 片；有内容 ⇒ **400「本次修谱已有内容，不可作废」**。
6. **`POST /admin/revision/content`（族務紀文含简体）** ⇒ **期望**：**400「族務紀文須以繁體字錄入」**并在文案指出首个简体字；含逗号句号 ⇒ 自动换空格、连续空格折叠为一。
7. **`POST /admin/revision/image`** ⇒ **期望**：≤2 MiB + 白名单通过则写 fileID 至 cover、替换时删旧；超限 / 扩展名非法 ⇒ **拒绝**。
8. **编辑期届满（惰性）** ⇒ **期望**：家族管理员改 / 删 ⇒ **403**；`chief_editor` 可改且写 `jiapu_ops_logs`（**op = `revision_override`**）、**不改锁态、不重启 30 天期**。
9. **在线文谱（有修谱记录）** ⇒ **期望**：卷首出现 `cover`/`article`/`roster`/`donation` 页，与谱文**同一套连号（从 `葉一` 起连续顺延）**；`kind` 缺省行为对普通树**零变化**（无修谱记录 ⇒ 文谱与现状完全一致）。
10. **两个非目标面（硬）** ⇒ **期望**：`tree-hall.vue` 的 `view-toggle` **未加第四档**、hero **未加修谱块**；**祖谱页 / 世本未动**；**未新增页面 / 路由**。

### §66-5 阻塞点 / 边界

- **真源零写入**（`migrate-output/` 与 `config/` **未改 / 未移 / 未删**）。
- **已知边界（如实登 · 不得美化）**：**云函数 HTTP 体上限** ⇒ 图限 **≤2 MiB**；**小程序端压缩实现与真机渲染未实测**。
- **本批不接 PDF 导出**（**修谱卷不进 PDF**），**登记为后续批次**。
- **无新增阻塞**；既有部署阻塞项（§7-7）**既不影响、也不解除**。

### §66-6 状态词与边界

- **状态 = 「定稿、待实现」**（**不得写「已实现 / 已上线 / 已质检」**）。
- 本节**只追加、不改 §0–§65 任何历史行**（承 `AGENTS.md` §0-4）；**未碰 `docs/*.qa.md`**（§0-5）；**本轮零真源写入 · 零打包 · 零部署**。
- **口径权威** = `docs/revision.spec.md`。

## §66-7 口径变更追记（**计费模型 / 路由收敛 / 配置键删除** · 2026-10-12 · **只追加 · 不改 §66-0–§66-6 任何行**）（Zang 制度员）

> **性质（只追加）**：本条为 §66 批次的**口径变更追记**（Kevin **2026-10-12 重新拍定计费与编辑期模型**）。**§0–§66-6 既有行原文一律保留、一字不改、一行不删**（承 `AGENTS.md` §0-4）。
> **口径权威** = `docs/revision.spec.md`（**已按新模型定向改写**：§2 / §3 / **§3-1** / **§3-2** / **§4-6** / §5 / **§5-1** / **§5-2** / §6 / §7 / **§7-7** / §9 / §11 / §13）。
> **纪律（硬）**：本条**不写任何实现现状读数**（行号 / md5 / 字节 / 计数 / 路由条数**一律不预填**）；**判据一律以命令实际输出为准**。
> **状态词**：**定稿** / **已实现（Kong）、待独立质检（Neng）**；**不得写「已通过 / 已质检 / 已上线」**。

- **计费模型（新 · 取代 §66-0 旧计费段）**：
  - **常量写死、无后台入口**：`REVISION_FEE_START_BAMBOOS = 999`（**开轮恒价 · 首轮与后续同价**）· `REVISION_FEE_LOCKED_EDIT_BAMBOOS = 9999`（**锁定后一次保存 · `30 < days < 360`**）· `REVISION_FEE_LOCKED_LONG_BAMBOOS = 99999`（**锁定后一次保存 · `days >= 360`**）· `REVISION_EDIT_DAYS = 30`（**不变**）。
  - **天数**：`days = ceil((now - effective_at) / 86400000)`（**自然日向上取整，不足 1 天算 1 天**）；档位 `fee_tier`：`days<=30` ⇒ `edit_window`（**0**）· `30<days<360` ⇒ `locked`（**9999**）· `days>=360` ⇒ `long_locked`（**99999**）。
  - **语义**：**编辑期内（≤30 天）不限次数修改，只扣开轮那 1 次费用（999）**；**锁定后每「一次保存提交」扣一次费**（**一次调用 = 一次，不论该次提交了几个 `kind`**）。
  - **不退**：用户侧**一律不退**；**唯一例外 = 系统原因**（**落库失败 ⇒ 原路全额返还**）。
  - **间隔门槛保留**：`revision_interval_years` 默认 **[1,2,3,5,10] 年**、全站统一、后台可配；**M = 该树已开始的修谱总数（= `seq`）**（**作废概念整体取消**）；未到 ⇒ **409 `REVISION_COOLDOWN`** + `next_start_at`；已有进行中 ⇒ **409 `REVISION_ACTIVE`**。
- **写权（新 · 取代旧「固化后仅 `chief_editor` 终审」）**：**锁定后本树家族管理员（`tree_steward`）付费即可继续修改**，**不再需要 `chief_editor` 介入**；`chief_editor` 亦可、**同样按次扣费**（**单一计费路径**）。**保留 D-1 树归属校验**（`tree_steward` 仅可写本树 / `chief_editor` 任意树）。
- **路由收敛为 3 条（新）**：
  1. `GET /revisions?tree_id=<id>`（公开只读）；**出参逐字** = `{ ok, tree_id, now, edit_days:30, fee_start_bamboos:999, fee_locked_edit_bamboos:9999, fee_locked_long_bamboos:99999, interval_years, seq, can_start:{ok,reason,next_start_at}, active:{seq,effective_at,lock_at,editable,days,fee_tier,fee_next_bamboos,cover,article,helpers,donations}|null, revisions:[{seq,effective_at,locked_at,days,fee_tier,fee_next_bamboos,cover,article,helpers,donations}] }`；**旧键 `fee_bamboos` 删除**；`editable` **恒 `true`**。
  2. `POST /admin/revision/start {tree_id}` ⇒ `{ ok, seq, effective_at, lock_at, fee:{pieces:999, tx_id} }`。
  3. `POST /admin/revision/save {tree_id, seq, items:[{kind, payload}, …]}` —— **唯一内容写入口**：`kind ∈ 'article'|'helpers'|'donations'|'cover'`；`items` **非空数组**；**一次调用 = 一次计费**（编辑期内 0 片、锁定后 9999 / 99999）；不足 ⇒ **409 `ASSET_INSUFFICIENT` 且整单不写**；`cover` 的 `payload = {ext, data_base64}`（**≤2 MiB、jpg/png/webp、替换先传新成功再删旧**）；出参 `{ ok, seq, locked, fee:{pieces, tx_id}, items:[{kind}] }`。
  - **已删除**（**未发布、无兼容负担**）：`POST /admin/revision/abort` · `POST /admin/revision/content` · `POST /admin/revision/image`。
- **配置键（新）**：**保留** `revision_interval_years`；**删除** `revision_fee_bamboos`（**键 / 读函数 / `PUT /admin/wallet-fee` 分支全删**）。
- **上云面不变**（本阶段仍**不上云 · 只登记**）：**新集合 `jiapu_revisions`** + **云函数 `compat-api` 重打包** + **H5 / 小程序两产物重打**（**§66-2 的 5 条动作逐条不变**；**仅口径面变更、不新增上云动作**；云存储前缀 `revisions/` 不变）。
- **状态词与边界**：**本节只追加、不改 §0–§66-6 任何历史行**（承 `AGENTS.md` §0-4）；**未碰 `docs/*.qa.md`**（§0-5）；**本轮零真源写入 · 零打包 · 零部署**；**口径权威** = `docs/revision.spec.md`。

## §66-8 上云进展登记与端到端验收待办（**云端集合 `jiapu_revisions` 已建成 · 端到端验收待跑** · 2026-10-12 · **只追加 · 不改 §66-0–§66-7 任何行**）（Zang 制度员）

> **性质（只追加）**：本条为 §66 批次的**进展与待办登记**。**§0–§66-7 既有行原文一律保留、一字不改、一行不删**（承 `AGENTS.md` §0-4）。
> **纪律（硬）**：本条**不写任何实现现状读数**（行号 / md5 / 字节 / 计数 / 路由条数**一律不预填**）；**判据一律以命令实际输出为准**。
> **状态词**：**定稿 / 待落地**（及 **已实现（Kong）、待独立质检（Neng）**）；**不得写「已通过 / 已质检 / 已上线」**。
> **本阶段仍不上云 · 只登记**。

### §66-8-1 云端集合 `jiapu_revisions`（**已建成 · 待端到端写入验证**）

- **Kevin 2026-10-12 报已建成**（云端集合 `jiapu_revisions`）。
- **待办 = 端到端写入验证**（**建集合 ≠ 写入链路已验证**）。
- **容错口径（已实现（Kong）、待独立质检（Neng））**：**集合缺失时** —— **读路径已容错为 200 空态**（**不再冒泡 `DATABASE_COLLECTION_NOT_EXIST`**）、**写路径 503 可读文案**。

### §66-8-2 端到端验收待办（**待跑 · 分两链路**）

- **非图片链路（待跑）**：**开轮 → 保存 → 锁定后付费保存 + 留痕**（留痕口径见 `docs/revision.spec.md` **§3-3**）。
- **图片链路（留待上线时验收）**：**昭範正圖 base64 → 云存储 `revisions/<tree_id>/<seq>/cover.<ext>` → 文谱卷首大图**；**需云存储凭据**。
- **如实登记（不得美化）**：**本地 dev 实例为 cloud 模式直连生产，但真机上传未做**（**图片链路的真机上传未见证**）。
- **状态**：**本阶段不上云 · 只登记**。




## §67 迁徙地图台湾可见性 + 边界分片容错（**2026-10-12 · 只追加**）

> **性质**：本批 = **纯前端 + 前端资产 + 一处云端数据修正**。**§0–§66-8 既有行原文一律保留、一字不改、一行不删**。
> **状态词**：**已实现（Kong）· 已由 Zang 本机真机复核（H5 dev 链路）· 生产域名浏览器渲染未实测**（见 §67-4）。

### §67-1 上云动作清单（**已执行**）

- **① 云函数 `compat-api`：无需重打**（本批零 `cloudfunctions/**` 改动）。
- **② H5：已推送 → Vercel 自动构建**（`main`：`13cbac2` 边界真源+构建脚本容错、`a0ff523` 前端回退+loader、`62bb144` tree-meta 数据）。
- **③ 小程序产物：无需重打**（本批受影响面 100% 落在 `MigrationMapH5.vue` 的 `#ifdef H5` 内；loader 仅被该 H5 组件引用）。
- **④ 云端数据面（本批唯一数据写入 · 已直写生产）**：集合 `jiapu_tree_meta` 文档 `pan_28504_01` 补三字段 —— `founder_handle=e51052014f4b9e6fe7b0ef39` / `founder_gramps_id=000000389` / `founder_name=潘始祖`。备份 = `~/jiazu-backups/2026-10-12-pan-founder/`（云档 before JSON + 本地 tree-meta before 全文）；本地 `config/tree-meta.json` 已同批对齐（防未来 `upload-migrated-to-cloudbase.mjs` 同步回滚）。

### §67-2 本批口径（三条）

1. **边界真源容错**：`scripts/build-geo-bounds.mjs` 遇 DataV 双 404（上游确无该节点分片）⇒ **警告跳过 + skipped 清单**，不整批 throw；其它网络错误照常 throw。已知上游缺口码 = `120100` / `711600` / `711601`（与仓内 `config/geo-bounds/_unsourceable.json` 预登记一致）。
2. **站点分片三级回退**：`MigrationMapH5.vue` 站点码解析 = **自身 → 所属市 → 所属省**（单一 `shardOf` 口径，与 `need` 硬校验共用）；命中回退 ⇒ 站点用回退级分片承载绘制、标签仍用原码地点名。**三级皆无 ⇒ 仍整图 error 并列出缺失码**（不静默）。
3. **产地数据上新**：真源 + 产物新增 `710000`（台湾省自身面）与 `120116`（天津滨海新区）细/粗两档；`bounds-loader.ts` 是**手维护 import 表**（生成脚本不管它）⇒ 补分片必须同步补 import，否则运行时静默返 `null`。

### §67-3 本机证据（Zang 实测）

- `node scripts/build-geo-bounds.mjs`（`COMPAT_REAL_OUT=/tmp/geo-trees`，数据源 = 当前云上 19 棵树）⇒ exit 0；skipped = `120100, 711600, 711601`；真源 32/35 分片。
- `node scripts/gen-geo-bounds.mjs` → `--check` ⇒ 全绿（细/粗集合一致 32 ≡ 32）；`cd frontend && npm run type-check` ⇒ exit 0。
- **H5 dev 真机（总编辑视角 · `16601061656`）**：`pan_28504_01` 迁徙地图 **3/3 步**显示 `起点·丰润区 7 人 → 主居地·滨海新区 1 人 → 第 5 世·再分迁 3 处`；SVG 标签含 `台湾省` 与 `屏东市`；无错误态。对照 `ji_23395_01` 行为不变。
- `curl https://liwu-d8gek6jjdab1d087c.service.tcloudbase.com/api/tree-meta` ⇒ `pan_28504_01` 返上述 founder 三字段（生产数据链路直证）。
- 生产产物：`assets/pages-special-migration-map-index.*.js` 含字面 `边界分片缺失`（= 新回退代码已上线）。

### §67-4 未实测 / 阻塞（**如实登记，不得写成已验证**）

- **生产域名（`jiapu100.com`）上的浏览器端到端渲染未实测**：本机 DNS 被劫持（既有登记项），浏览器打开生产首页停在「加载中…」⇒ 以「生产产物含新代码 + 云函数端点返新数据 + 同源 dev 链路真机渲染」三条替代取证。
- **`711600` / `711601` 几何永久缺失**（DataV 上游无该两级分片）⇒ 屏东站点恒以 `710000` 省级面承载；若日后要县级精度，需另寻几何源。
- **`config/geo-bounds/_unsourceable.json` 豁免清单**需与上游缺口保持一致（新增缺口码时应登记）。

### §67-5 同病待批（**未执行 · 等 Kevin 拍板**）

- 全库盘点实测：**另有 8 棵 family 树的 `tree_meta` 档缺 `founder_handle`**（仅树 JSON 内存 legacy `founder_gramps_id`）= `heng_24658_01` / `ji_23395_02` / `ji_32426_01` / `li_26446_01` / `li_26446_02` / `li_26446_03` / `long_40857_01` / `rong_23481_01` ⇒ 这些树的迁徙地图同样退化为「起点 0 人」。**同一手术可一次修完**（待批）。

### §67-5 追记（**同病批已执行 · 2026-10-12 · 只追加 · 不改 §67-5 原行**）

- Kevin 对「三层梳理 + 防无根规则」批复后，**8 棵同病树已同批执行与 pan 相同的手术**（云档 + 本地 `config/tree-meta.json` 双写、逐树回读验证、云档旧键保全）：`heng_24658_01`（恒未知）/ `ji_23395_02`（季未知）/ `ji_32426_01`（纪恒山）/ `li_26446_01`（李宝华）/ `li_26446_02`（李未知）/ `li_26446_03`（李未知）/ `long_40857_01`（龙未知）/ `rong_23481_01`（容未知）。提交 `6aa3102`；备份 `~/jiazu-backups/2026-10-12-founder-batch/`（9 档）。
- **3100 已重载并经 `/api/tree-meta` 复验 9/9 三件套齐**。
- **如实登记**：8 棵中 6 棵的 `founder_name` 为「X未知」占位（树内节点名本就未录）⇒ 属**数据质量待完善**（找 Kevin/家族管理员补真名），不是本手术缺陷。
- 后续 = 三层防呆规则落册（`docs/three-tier-founder.spec.md`）与巡检脚本改造（**另批**）。


## §68 在线文谱排版批（三部分：修谱整体分列 / 人物名录不动 / 新增后记页）（**2026-10-12 · 只追加**）

> **性质**：**纯前端**（`frontend/src/business/wenpu.ts` +188/−73、`frontend/src/components/wenpu-book/wenpu-book.vue` +37/−4；零后端、零新请求、零真源写入）。**§0–§67 既有行原文一律保留**。

### §68-1 口径（Kevin 2026-10-12 拍定 · 三部分）

1. **第一部分 = 修谱信息**（article / roster / donation + 卷首 cover）：字号 ×1.5（`.book-col` 17→**26px**、name-col 20→**30px**）；排版改**整页整体分列**（去 4 行结构与行分隔线；每栏 26 字 × 每页 30 栏，常量标「一句话可改」）；**卷首（昭範正圖）保持独立整页、不入列**。
2. **第二部分 = 人物节点名录**：**字号与排版一字不动**（17px / 4 行 / 30 栏 / 10 字 / name-col 20px / 行线 1px）。
3. **第三部分 = 后记**（`kind='postscript'` 新增）：平台自动生成、读者不可编辑、**独立整页置于全书最末**；文案（繁体逐字、不经 `toTraditional`）：有修订 `本譜於{Y1}年由{creator}創建，歷 {N} 次修訂（{Y2}…），今為 {Ylast} 年訂本。` / 无修订 `本譜於{Y1}年由{creator}創建，尚未修訂，今為創建本。`；年份 = **农历干支年**（复用 `lunar.ts`）；`{N}` 上屏汉字序（同书口体例）；创建者 = `created_by` 手机号打码（前 3 后 4）；数据源 = tree-meta + 既有 `fetchRevisions()`（零新增请求）；revisions 缺失/空 ⇒ 按「无修订」态渲染不报错。
- 兜底（如实登记）：**GEDCOM 迁移树 tree-meta 无 `created_at`/`created_by`**（19 树中仅 13 树有）⇒ 句中省「於X年」、创建者显「**本平台**」（如 `ji_23395_01` 实测「本譜由本平台創建，歷 一 次修訂（丙午），今為 丙午 年訂本。」）——两兜底在 `wenpu.ts` 注释标「一句话可改」；若要求迁移树也显示真实创建者 ⇒ **属数据批**（补 tree-meta `created_at`/`created_by`，待 Kevin 拍板）。

### §68-2 上云动作

- **H5：随 main push 自动构建**（本批提交即上线）。
- **小程序产物：未重打**（并入**既有待办 2**：本批改动面在 MP 产物中同样落后，待与其它前端批合并重打）。
- **云函数：无需重打**（零 `cloudfunctions/**` 改动）。

### §68-3 验收（Zang 亲验 + Kong 实测）

- `type-check` EXIT 0（Zang 亲跑）。
- H5 真机（总编辑视角，`ji_23395_01`）：全书 17 页 = 1 修谱页 + 15 人物页 + 1 后记页；第 1 页 `.book-flow` / 26px / `.book-row`=0；第 16 页人物页 4 行 / 17px / 20px·700 / 行线 1px；第 17 页 = 后记（书口 葉三十三、连号不断）；键盘翻页 W-23 语义与边界（首页/末页 no-op）不变。
- 离线 harness 六态（A–F）全过（含 2 轮修订、48+10 字长文、helpers/donations、revisions=null）。
- 规格侧：`docs/revision.spec.md` 修谱栏格旧句已就地加注「已被取代 · 2026-10-12」（人物名录页不取代）；三层防呆新册 = `docs/three-tier-founder.spec.md`（另批登记 `AGENTS.md` 索引行，待批）。


### §68-4 追记：迁移树创建者数据批（**已执行 · 2026-10-12 · Kevin 拍定「统一补为 16601061656 + 实际创建时间」**）

- **5 棵** GEDCOM 迁移树（`gu_39038_01` / `ji_23395_01` / `liu_21016_01` / `qin_31206_01` / `shen_27784_01`）tree_meta 补 `created_at=2026-08-15T07:17:14.000Z` + `created_by=16601061656`（云档 + 本地 config 双写、逐树回读验证、云档旧键保全；备份 `~/jiazu-backups/2026-10-12-creator-batch/`）。
- **实际创建时间的证据** = 归档 `migrate-output/report.json` 的 `generated_at=2026-08-15T07:17:14Z`，该迁移批恰好覆盖上述 6 棵（含 zhonghua）。
- **`zhonghua` 不补**：世本无文谱书页、后记不渲染（补了无消费者）。
- §68-1 的兜底态（「本平台」）自此仅对**未补数据的树**生效；5 棵已补树的后记将显示「於丙午年由166\*\*\*\*1656創建」。
- AGENTS.md 索引行已获 Kevin 批复落盘（§0 +1 行、§9 +1 行、勘误 19）。


## §69 六批合并上云登记（襄事枚举 / 后记 postscript / 谱名计费 / 封面页 / 乌丝栏双轨 / 族務紀文校验）（**2026-10-12 · 只追加**）

> **性质**：本批 = **后端 + 前端 + 规格**三面。**§0–§68 既有行原文一律保留**。

### §69-1 上云动作（**已执行**）

| # | 动作 | 状态 / 判据 |
|---|---|---|
| ① | **云函数 `compat-api` 重打包**（esbuild，产物 1,477,780 B；ASCII 判据 `tree-rename`=2 / `postscript`=3 / `tree_rename_fee`=1） | **已执行** |
| ② | **云函数部署** `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c` | **21:21:53 部署完成** |
| ③ | **H5**：`main` 推送（`69c4c1a` 后端 / `5e33c23` 前端 / `ddd70ec` docs）→ Vercel 自动构建 | **已推送**；⚠️ **线上构建未逐片确证含本批**（首页仅惰性加载 15 chunk；对 entry+hall 引用面 50 片 grep 新 token 0 命中）⇒ 如实登记「以 push 触发构建为准」 |
| ④ | **小程序产物**：未重打 | 并入既有待办（与其它前端批合并重打） |
| ⑤ | **数据面**：无 | 本批零真源写入（`config/` / 树 JSON / 集合均未动） |

### §69-2 生产探针（云函数域名，Zang 实测）

- `GET /api/tree-meta` ⇒ 每树含 `genealogy_name_updated_at`（ji = `null`）与 `rename_fee_pieces`（ji = `999`）✓
- `GET /api/revisions?tree_id=ji_23395_01` ⇒ 顶层末三键 `active` / `revisions` / `postscript`，`postscript={"created_by":"16601061656","created_by_name":"季清昆","masters":[{"seq":1,"name":"季清昆"}]}` ✓
- `POST /api/admin/tree-rename`（无 token）⇒ **401** ✓

### §69-3 口径要点（六批）

1. **譜司襄事**：duty 枚举 `{主司,副司}`、总 ≤3、主司恰 1（必填）、副司 ≤2、禁同一人重复；6 条文案 + 命中次序（以两端已落盘实现为准）；
2. **后记**：`GET /revisions` 只增 `postscript`；名称 = 本轮主司优先 → 操作者回退（锚点本树名→昵称→手机号打码）；Kevin 定稿文案逐字（口径 **W-25**）；
3. **谱名计费**：`POST /admin/tree-rename` 三档 **999 / 9999 / 99999**（首次或 ≥360 天 999）；no-op 0 片；不退；409 整单不写；`ops_logs` 留痕 `op='tree_rename_fee'`；通用更新路由 `genealogy_name` 异值 ⇒ **400**；入口 = 【在线文谱】工具条【修改谱名】（家族树页）与祖谱页同规则入口，**共用同一弹窗组件**；
4. **封面页**：`kind='frontcover'`，整页只有繁体谱名、**无书口**、**不占叶序**（口径 **W-26**）；
5. **乌丝栏双轨**（口径 **W-27**）：`article`/`postscript` 两页改「字列 26px + 标点列 14px」（栏格 43px ⇒ **每页 20 栏**，实测值）；`，`⇒`·`、`。`⇒`○`；空格不占位；名录/人物/封面/昭範正圖不动；
6. **族務紀文校验**：只允许汉字 + `，`/`。`（数字/拉丁/空格/其它标点全拒）+ 禁连续标点；**存储保留原文**（取代旧「标点→空格」）；文案 `僅允許漢字與中文逗號、句號` / `標點不可連續`。

### §69-4 未实测 / 待办（如实登记）

- **线上 H5 未逐片确证**（见 §69-1 ③）；**小程序产物未重打**；
- **真机未覆盖面**（子代理如实报回，不得写成已验证）：`roster`/`donation`/昭範正圖 三页真机无读数（全库仅 `ji_23395_01` 有修谱记录且 `helpers/donations` 为空）⇒ 以离线 harness 字节对拍替代；**族務紀文页真机 `·`/`○` 非空读数不可得**（该轮存文 0 个标点）⇒ 转译真机证据由同一代码路径的后记页承担；
- **member / guest 视角 · 小程序竖排 · dpr>1** 未测；
- **旧 H5 缓存窗口**：云函数已上而用户浏览器未刷新时，谱名改名会 400（提示清晰）、旧修谱面板无法满足「主司必填」⇒ 修谱域目前仅测试轮在用，风险面极小；
- **AGENTS.md 索引/速查/勘误行**：六批拟稿已备（各册内登记），**待 Kevin 批准后由主代理一次落盘**。

### §69-5 本批提交（按层）

`69c4c1a` 后端（`compat-api` 源码 + 测试）· `5e33c23` 前端（`frontend/**`）· `ddd70ec` docs（`economy-fee` §17/§18 · `revision` §16 · `wenpu` §32/§33）· 打包产物同批（见 §69-1 ①）。

---

## §70 在线文谱 PDF 导出（浏览器打印路线）批（**纯前端** · 口径真源 = `docs/wenpu.spec.md` **§34（W-28 – W-32）** · **2026-10-13 · 只追加 · 不改 §0–§69 任何行**）（Zang 制度员）

> **编号（对账用 · 硬）**：**派单原拟编号 = 「§37-10」**；**§37（在线文谱批次 · 2026-09-26）已于 2026-10-12 按 Kevin 指令 B 移出本册**（见本册第 **54** 行清理登记；全文归档 = `git show 7622aa6:docs/PENDING_DEPLOY.md`）⇒ **本册按现证续编为 §70**（**派单原字面「§37-10」保留为别名、不回溯改历史节号**）。
> **性质**：本批 = **纯前端 + 文档** ⇒ **无云函数重打包 · 无数据修正 · 无新集合 · 真源零写入**。
> **状态词（硬）**：**已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。
> **本清单只登记上云动作与判据 · 不预填读数**（测试条数 / 产物字节 / md5 / 路由键一律以对应命令的实际输出为准）；**登记 ≠ 已执行 / 已验证**。
> **〔追记 · 2026-10-13 · 几何口径修正（口径来源 = Kevin 2026-10-11 当场纠正 · Zang 裁定）〕**：**口径真源续编** = `docs/wenpu.spec.md` **§35（W-33 / W-34 ＋ §34-3（W-30）改正 · Zang 裁定 · 2026-10-13）** —— **单页（书叶）= 480 × 720**（2:3 竖）· **展开 = 960 × 720 = 两单页并排** · **每张 A4 竖排纸印一张单页（一个展开 = 两张纸）** · **缩放 = 按高度适配**（**单页 ≈ 184.7 × 277mm · 宽 ≤ 190mm**）· **打印页序 = 左叶 → 右叶、连续递增（左 = 2k+1 / 右 = 2k+2）** · **展开视图正中 `x = 480` 有 1px 深色竖线 ＋ 两侧约 14px 柔和渐隐阴影（仅展开态渲染；单页 / 打印不渲染）**。**承 §70 体例「只追加 · 不改 §0–§69 任何行」** ⇒ **本批只在本节内追加本行与 §70-3 冒烟第 5 步的〔加注〕，§70 其余各行原文一字未改**。**别名映射（对账用 · 同 `docs/wenpu.spec.md` §34 / §35 编号行）**：**派单原拟「§37-10」= 本册 §70** · **派单原拟「§29」= `docs/wenpu.spec.md` §34** · **派单原拟「W-27」= 同册 W-30** · **派单原拟「W-30 / W-31」= 同册 W-33 / W-34**（**先行占用者保留，派单原字面不回溯覆盖**）。**本批仍为纯前端**（**零后端 / 零真源写入 / 无云函数重打包 / 无数据修正** —— 同 §70 性质行）。

### §70-1 上云动作（清单 · 待执行）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **H5 产物重打** | `npm run build:h5`（带 `VITE_API_BASE`）；**H5 现行部署模型 = 随 `main` push 自动构建上线（Vercel Git-connected）**（承本册第 **53** 行现行部署模型）⇒ **本批随 push 生效**（**旧 H5 缓存窗口风险 = §69-4 同款**） |
| **②** | **小程序产物重打** | 一次 `build:mp-weixin` + 开发者工具上传（**按需 · 并入既有「⬜ 待办 2：小程序产物重打」合并重打**）；**本批若 `pages.json` 新页条目已用 `#ifdef H5` 排除 ⇒ 小程序侧预期「无新增页面」，以实测为准** |
| **③** | **云函数 `compat-api`** | **无重打包 · 无部署**（本批**不改 `cloudfunctions/**`**） |
| **④** | **数据 / 集合面** | **无数据修正 · 无新集合 · 云端零写入** |
| **⑤** | **真源面** | **零写入**（`config/` / 树 JSON / 集合 / 云存储**均不动**） |

### §70-2 部署后判据（**形态判据 · 阈值写死 · 命令面不预填读数**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **H5 产物含新页路径** | 于 H5 产物目录内对**新页路径**取计数 ⇒ **命中 ≥ 1**（**路径 = `pages/special/wenpu-print/index`**；**产物目录 / 实际文件名形态以现证为准**） |
| **2** | **H5 产物含打印按钮文案** | 同目录内对**打印按钮文案**取计数 ⇒ **命中 ≥ 1**（**文案逐字 = `🖨 打印 / 保存为 PDF`**；**以该产物内的实际转义形态为准**，口径 = `docs/wenpu.spec.md` §34-5 ⑤） |
| **3** | **双处同名（缺一即判负）** | 新页 `navigationBarTitleText` 与 `frontend/src/business/seo.ts` 的 **`ROUTE_TITLE`** **双处** = `导出文谱 PDF`（口径 = §34-5 ④） |
| **4** | **不动面** | `pages/special/pdf-export` / `components/doc-layout-panel/` **未改**（`git diff --numstat` ⇒ **0 条**）；**tabBar 结构未动**；**无未使用 import / 无 `console.log`** |

- **判据写法（逐字 · 供执行者照抄）**：取计数 = 对 H5 产物**按「新页路径」与「打印按钮文案」两个模式**分别 `grep -c`，**两项均须 ≥ 1**；**不预设产物目录名与分片文件名**（以现证为准）。

### §70-3 部署后冒烟（按序做）

1. 家族树页 ⇒【在线文谱】⇒ 工具条「**⋯ 更多**」⇒ **菜单项文案仍为** `生成并下载 PDF`（**一字不改**）；
2. 点该菜单项 ⇒ **H5 跳子包页** `pages/special/wenpu-print/index?tree_id=…`（**带 `tree_id`**）；**新页导航栏标题 = `导出文谱 PDF`**；
3. 导出视图 = **屏上所见即打印所见**（**先预览**；**无第二套版式**）；
4. 点「**🖨 打印 / 保存为 PDF**」⇒ **浏览器打印对话框中选「另存为 PDF」** ⇒ 得文件（**再下载**）；
5. 打开所得 PDF ⇒ **A4 竖排 · 每张纸一张书页 · 书页 960×720 等比缩放居中 · 每页分页（末页无空白尾纸）· 纸页底色保留**（口径 = `docs/wenpu.spec.md` §34-3）； **（加注 · 2026-10-11 · **限该批前口径**：960×720 为**展开**；**单页 = 480×720** · Kevin 2026-10-11 裁定；原文保留、不回改）** —— **实判（按高度适配口径 · 硬 · 取代本行前段读法）**：**每张 A4 竖排纸印一张单页（480 × 720）** · **一个展开 = 两张纸** · **缩放按高度适配**（**单页高 = A4 竖排可印高 277mm ⇒ 单页 ≈ 184.7 × 277mm · 宽 ≈ 184.7mm ≤ 190mm**）· **打印页序 = 左叶 → 右叶、连续递增（左 = 2k+1 / 右 = 2k+2）** · **每张分页（末页无空白尾纸）** · **纸页底色保留**；**展开视图屏上**另有**正中 `x = 480` 书脊分割**（**仅展开态渲染；打印纸上不得出现**）；**口径真源 = `docs/wenpu.spec.md` §35（§35-1 / §35-2 / §35-3）**；
6. **范围 = 全部页**（封面 / 修谱卷首 / 族務紀文 / 名录 / 樂捐 / 后记 / 人物名录；**与屏上翻页完全一致**）；
7. **小程序**：点该菜单项 ⇒ **仍弹 `请使用网页版导出`（逐字不变）**；**小程序侧无新增页面**（以实测为准）。

### §70-4 未实测 / 待办（**如实登记 · 不得写成已验证**）

- **本批上云动作未执行**（本清单只登记动作与判据；**读数位由执行 / 质检收口后回写**）；
- **线上 H5 未逐片确证**（承 §69-1 ③ 同款风险：Vercel 构建分片，`grep` 可能落在入口未引用的惰性 chunk 外 ⇒ **以 push 触发构建为准**）；
- **小程序产物未重打**（并入既有「⬜ 待办 2」）；
- **真机打印对话框差异未测**（纸张档位 / 边距 / 缩放档 / **页眉页脚开关**由浏览器与用户在对话框内的选择决定 ⇒ **该等用户选择项不在本批口径内**）；
- **`@page` / `print-color-adjust` 在真机浏览器（尤其小程序 WebView）下的执行未取证**；
- **member / guest 视角未测**（可见集随登录态变化 ⇒ **导出页数亦变**）。

### §70-5 状态词与边界（**硬**）

- **本单 = 制度登记单**（**只改文档**：`docs/wenpu.spec.md` §34 ＋ 本节；**未改任何代码 / 配置 / 真源**；**未 commit / 未 push / 未部署 / 未跑构建 / 未跑测试**；`docs/*.qa.md` **一字未动**，承 `AGENTS.md` §0-5）；**实现归另单（Kong）**；
- **状态 = 已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。
---

## §71 后台可配后记（全局单档 `jiapu_wenpu_config`）批（**新集合 + 云函数重打包 + H5 / 小程序两产物重打** · 口径真源 = `docs/wenpu.spec.md` **§36（W-35 / W-36）** · **2026-10-13 · 只追加 · 不改 §0–§70 任何行**）（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§71**（前节 = **§70**（在线文谱 PDF 导出 · 纯前端批））；**节号以本册现证为准**。
> **性质**：本批 = **后端 + 前端 + 文档**三面 ⇒ **有云函数重打包 · 有新集合 · 无数据修正 · 真源零写入**（与 §70「纯前端」批相反，**不得按 §70 套用**）。
> **状态词（硬）**：**已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。
> **本清单只登记上云动作与判据 · 不预填读数**（产物字节 / md5 / 测试条数 / 路由条数 / 集合条数一律以对应命令的实际输出为准）；**登记 ≠ 已执行 / 已验证**。
> **口径真源** = `docs/wenpu.spec.md` **§36** —— **W-35**（后台可配后记 · 全局单档 `jiapu_wenpu_config` · `_id='global'` + `version` CAS · 字段 `postscript_template` / `postscript_round_template` · 6 变量 + 段占位 `{修辑段}` · 三条路由）· **W-36**（标点「，」⇒「●」；「。」⇒「○」不变）。（加注 · 2026-10-13 · **修正 B**：**配置字段只留 `postscript_template`**（`postscript_round_template` 已取消）· **6 变量标签一律繁体**（`{肇創年份}` / `{肇創人}` / `{當前年份}` / `{修譜年份}` / `{主司}` / `{修譜序次}`）· **段占位 `{修辑段}` 由 `{{{…}}}` 循环块承接**；上列旧字面原文保留、不回改 · **口径真源续编 = 同册 §36-13** · 登记 = §71-7）

### §71-1 上云动作（清单 · 待执行）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **新集合 `jiapu_wenpu_config` 同步进上传脚本** | **`scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 名单须补入 `jiapu_wenpu_config`**（**漏了 ⇒ 云端首写报错** —— 该脚本另有启动自检：**代码引用的 `jiapu_*` 集合须全部列入 `COLLECTIONS`**，差集非空即**告警并退出**）⇒ **本项是「云函数先上、脚本后补」时的头号踩坑点** |
| **②** | **云函数 `compat-api` 重打包 + 部署** | `esbuild` 重打包 `cloudfunctions/deploy/compat-api/index.js` ⇒ `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`（**现行 = 手工重打包 + 手工部署**，承本册第 **53** 行现行部署模型）；**不重打包 ⇒ 云端新路由 404 / 无 `wenpu_config` 出参** |
| **③** | **H5 产物重打** | `npm run build:h5`（带 `VITE_API_BASE`）；**H5 现行部署模型 = 随 `main` push 自动构建上线（Vercel Git-connected）** ⇒ **本批随 push 生效**（**旧 H5 缓存窗口风险 = §69-4 同款**） |
| **④** | **小程序产物重打** | 一次 `build:mp-weixin` + 开发者工具上传（**按需** · **并入既有「⬜ 待办 2：小程序产物重打」合并重打**） |
| **⑤** | **数据 / 真源面** | **无数据修正 · 无真源写入** —— `config/` / 树 JSON / 既有集合 / 云存储**均不动**；**本批唯一新增 = `jiapu_wenpu_config`（空集合 / 仅在首次后台保存时产生 `_id='global'` 单档）** |

### §71-2 部署后判据（**形态判据 · 阈值写死 · 命令面不预填读数**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **重打包产物含新路由片段 ＋ 新集合名** | 对**重打包产物**（`cloudfunctions/deploy/compat-api/index.js`）按**新路由片段**与**新集合名**两个模式分别取计数 ⇒ **两项均须 ≥ 1**（**集合名逐字 = `jiapu_wenpu_config`**；**路由片段逐字 = `admin/wenpu-config`**） |
| **2** | **H5 产物含同两项** | 于 H5 产物目录内对**新路由片段**与**新集合名**分别取计数 ⇒ **两项均须 ≥ 1**（**产物目录 / 分片文件名形态以现证为准**；**线上分片惰性加载风险 = §69-1 ③ / §70-4 同款**） |
| **3** | **集合同步** | `scripts/upload-migrated-to-cloudbase.mjs` 的 **`COLLECTIONS` 内含 `jiapu_wenpu_config`**（`grep -c` ⇒ **≥ 1**）；**脚本启动自检不再报「被代码引用却未列入」** |
| **4** | **生产 HTTP** | `GET /revisions?tree_id=…` **200** 且**顶层含 `wenpu_config`**（**未配置 ⇒ 返默认**）；`GET /admin/wenpu-config` 未授权 ⇒ **401** / 非 chief ⇒ **403**；`PUT /admin/wenpu-config` 非法模板 ⇒ **400** |
| **5** | **不动面** | `pages/special/pdf-export` / `components/doc-layout-panel/` **未改**（`git diff --numstat` ⇒ **0 条**）；**双轨排版常量未改**（栏格 43px / 每栏格字上限 26 字 / 每页栏数） |

- **判据写法（逐字 · 供执行者照抄）**：取计数 = 对**① 重打包产物**与 **② H5 产物**分别按 `admin/wenpu-config` 与 `jiapu_wenpu_config` **两个模式 `grep -c`**，**四项均须 ≥ 1**；**不预设产物目录名与分片文件名**（以现证为准）。

### §71-3 部署后冒烟（按序做）

1. **后台版块「家谱内容设定」**（`chief_editor`）⇒ 改后记模板 ⇒ 保存 ⇒ **回读一致**（`version` 递增；**非 chief 视角无入口 / 403**）；
2. **未配置时逐字判据**：**未配置（或重置为默认）⇒ 后记逐字 = 默认模板输出** —— **1 轮 = `本族家譜，肇創於{Y}之年，由{C}始纂。其後壹經修輯於{Y1}，主司{C1}。今為最新釐正版，是為{Ylast}訂本。願後之族人、續而增修之。`**（**仅轮段序次位字形与 `docs/wenpu.spec.md` §30-1 ① 不同**：`一` ⇒ `壹` —— **Kevin 2026-10-13 指定、非回归**；口径真源 = 同册 §36-12）· **无修订 = `本族家譜，肇創於{Y}之年，由{C}始纂。今為最新釐正版，是為{Y}訂本。願後之族人、續而增修之。`**（= 同册 §30-2 ① 逐字）；（加注 · 2026-10-13 · **已被取代 · 原文保留**：默认模板已**去「之年」**＋ 年位**精确到月** ⇒ 现字形 = `本族家譜，肇創於{Y}，由{C}始纂。…`（`{Y}` = `<干支>年<月名>` · **W-38** · **双处同步**）；原文保留、不回改 · 登记 = `docs/wenpu.spec.md` §37-3 / §37-4 / 本册 §72-4）
3. **改后记模板 ⇒ 回读**：改后**未刷新页面即可见新文案**（前端**零默认逻辑**、默认值来自实现侧）；
4. **多轮树**：轮段**逐轮展开、几轮几段**（**多轮信息不丢**）；**无修订的树 ⇒ 轮段不展开**；
5. **非法输入**：**未知占位符 / 简体变量标签 / 跨用（修正 B 后 = 块内专用变量出 `{{{…}}}` 块 / 循环符号 ≥2 · 未闭合 · 嵌套）⇒ 400**；**`version` 冲突 ⇒ 409**；
6. **标点（W-36）**：`article` / `postscript` 两页「**，**」上屏 **`●`**、「**。**」仍 **`○`**；**双轨几何与每页栏数不变**；**该两页不得出现 `·`**；
7. **痕迹面**：**保存配置不产生 `jiapu_ops_logs` 记录**（**不进计费闸门 · 不写 ops_logs**）、**不扣竹片**。

### §71-4 取代关系登记（**旧行一律原文保留、不回改**）

| # | 对象 | 关系 |
|---|---|---|
| **①** | **本册 §69-3 之 5**（「`，`⇒`·`、`。`⇒`○`」） | **字面保留、不回改、不加注**；**自本节起读作「`，`⇒`●`、`。`⇒`○`」**；**转译真源续编 = `docs/wenpu.spec.md` §36-2（W-36）** |
| **②** | **本册 §69-3 之 2**（后记 `postscript` · 名称 = 主司优先 → 操作者回退） | **口径不变**（**取值链一字不改**）；**仅「文案来源」由代码改为配置**（承 §36-1） |
| **③** | **本册 §69-1 ⑤ / §69-2**（「数据面：无」· 生产探针） | **旧行原文保留、不回改**（**各限其批**）；**本批 §71-1 ⑤ 的「数据面」口径以本节为准**（**无数据修正 · 无真源写入，但新增 `jiapu_wenpu_config` 集合**） |
| **④** | **`docs/wenpu.spec.md` §30-4 / §30-5 判据 6 / §30-7 ② 拟稿行 / §31-3 拟稿行** | **由 W-35 取代**（该册**已就地加注 4 处**，见该册 §36-5）；**本册不代改该册** |
| **⑤** | **`docs/wenpu.spec.md` §33-3 转译表「，」行 / §33-8 判据 3 / §33-10 拟稿 2 行** | **由 W-36 取代**（该册**已就地加注 2 处**，见该册 §36-4；**拟稿代码块内 2 行按读取规则**，见该册 §36-6 ⑤）；**本册不代改该册** |
| **⑥** | **各册 `AGENTS.md` 索引 / 速查 / 勘误拟稿行** | **未落盘 · 待 Kevin 批准后由主代理一次落盘**（承 §69-4 末条） |
| **⑦** | **后记轮段序次口径**（变量 `{轮次}` ⇒ **改名 `{修谱序次}`**；取值 = 该轮序次**繁体大写数字**） | **口径真源 = `docs/wenpu.spec.md` §36-12**（**Kevin 2026-10-13 追加修正**）；**采用默认配置后后记由「其後一經修輯於…」变为「其後壹經修輯於…」**（**Kevin 指定、非回归**）；**本册不代改该册** |

### §71-5 未实测 / 待办（**如实登记 · 不得写成已验证**）

- **本批上云动作未执行**（本清单只登记动作与判据；**读数位由执行 / 质检收口后回写**）；
- **上传脚本 `COLLECTIONS` 补名未执行**（**漏补的后果 = 云端首写报错 + 启动自检告警退出**，见 §71-1 ①）；
- **云函数重打包 / 部署未执行** ⇒ **云端新路由未上线**（未部署时 `GET /admin/wenpu-config` 预期 **404**）；
- **线上 H5 未逐片确证**（承 §69-1 ③ / §70-4 同款：Vercel 构建分片，`grep` 可能落在入口未引用的惰性 chunk 外 ⇒ **以 push 触发构建为准**）；
- **小程序产物未重打**（并入既有「⬜ 待办 2」）；**`●` 在真机 / 小程序竖排下的呈现未取证**；
- **member / guest 视角未测**（可见集随登录态变化）· **真机字体回退 / dpr > 1 未测**。

### §71-6 状态词与边界（**硬**）

- **本单 = 制度登记单**（**只改文档**：`docs/wenpu.spec.md` §36 ＋ 本节；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / `cloudfunctions/**` / `scripts/**` / `frontend/**` / `migrate-output/**` / `config/**`**；**未 commit / 未 push / 未部署 / 未跑构建 / 未跑测试**；**未重启任何服务**）；
- **状态 = 已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。

### §71-7 追记 · 两字段合一 ＋ 循环符号 `{{{…}}}` ＋ 变量标签全繁体（**修正 B** · **Kevin 2026-10-13 同批追加修正 · 立即生效 · 只追加 · 不改 §0–§70 任何行**）

> **性质**：本条 = **同批内追加修正**；**§0–§70 既有行原文一律保留、不回改**；**§71 头注「口径真源」行 / §71-3 之 5 随本次修正就地加注 / 就地更新**（**该几处属本批新节、非历史行** ⇒ 与「只追加」不冲突 · 体例承 `docs/wenpu.spec.md` §36-12 / §36-13）。**口径真源 = 同册 §36-13**。
> **状态词（硬）**：**已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。**本清单只登记上云动作与判据 · 不预填读数**。

- **① 字段合一（硬）**：配置与三条路由出参**只留一个键 `postscript_template`**；**`postscript_round_template` 已取消**（**不得再写入 / 读取 / 出参**）。
- **② 默认模板（逐字 · 现行）**：`本族家譜，肇創於{肇創年份}之年，由{肇創人}始纂。{{{其後{修譜序次}經修輯於{修譜年份}，主司{主司}。}}}今為最新釐正版，是為{當前年份}訂本。願後之族人、續而增修之。`（**变量标签一律繁体**）。（加注 · 2026-10-13 · **已被取代 · 原文保留**：默认模板已**去「之年」**（现行逐字 = `本族家譜，肇創於{肇創年份}，由{肇創人}始纂。{{{…}}}` · **W-38** · Kevin 2026-10-13 拍定）；原文保留、不回改 · 登记 = `docs/wenpu.spec.md` §37-4）
- **③ 循环符号（硬）**：`{{{` … `}}}` 包**逐轮重复的块体** ⇒ **恰 0 或 1 个**（**≥ 2 ⇒ 400** · **未闭合 ⇒ 400** · **嵌套 ⇒ 400**）；**块内专用变量**（`{修譜序次}` / `{修譜年份}` / `{主司}`）**出块 ⇒ 400**；`{肇創年份}` / `{肇創人}` / `{當前年份}` **任意位置允许**；**`{{{}}}` 缺失 / 为空 ⇒ 合法且不展开轮段**。
- **④ 渲染顺序（硬）**：① 逐轮渲染块体（`seq` 升序）拼接 ⇒ ② 替换 `{{{…}}}` ⇒ ③ 缺项省片段（连前置分隔符删 · 块内块外同规则）⇒ ④ 模板逐字用、**不做 s2t**（**后台直输繁体**）。
- **⑤ 标签字形校验（硬）**：**变量匹配只认繁体标签**；**简体标签**（`{肇创人}` / `{当前年份}` / `{修谱年份}` 等）⇒ **400「未知变量」**（**不静默 · 不做简繁归一**）。
- **⑥ 后台版块变量说明行（修正 B）**：**「家谱内容设定」版块的变量说明行同步为繁体标签**（**指向 W-35** 即可）；**界面落点仍以实现侧现证为准**（承 §71-1 / §36-9 ②）。
- **⑦ 旧字面处置**：本节内 §71 头注「字段 `postscript_template` / `postscript_round_template`」与 §71-3 之 5「跨用 … ⇒ 400」**旧字面原文保留、不回改**，**已就地加注 / 就地更新**（见其上）；**自本条起按修正 B 读**。
- **⑧ 未实测（如实登记）**：**本条所列上云动作与判据均未执行 / 未验证**（承 §71-5）；**状态 = 已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。

## §72 追记 · 农历表 **1–2100（全套月表 · 单一源 `sxtwl` · pre-1900 推算）** ＋ 后记时间**精确到月**（**W-37 / W-38**）批（**云函数 `compat-api` 重打包 + 部署（含删 `lib/lunar-year.js`）· H5 / 小程序两产物重打 ＋ 小程序主包体积重测 · 无新集合 · 无数据修正 · 真源零写入** · 口径真源 = `docs/wenpu.spec.md` **§37** · **2026-10-13 · 只追加 · 不改 §0–§71 任何行**（**唯一例外 = §71-3 之 2 / §71-7 ② 两行行尾就地加注，原行原文保留、未删行**））（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§72**（前节 = **§71**）；**节号以本册现证为准**；**若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面**。
> **性质**：本批 = **后端 ＋ 前端 ＋ 文档**三面 ⇒ **有云函数重打包 ＋ 有部署 ＋ 两产物重打 · 无新集合 · 无数据修正 · 真源零写入**（**与 §71 批「有新集合」不同 ⇒ 不得按 §71 套用**）。
> **状态词（硬）**：**已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。
> **本清单只登记上云动作与判据 · 不预填读数**（产物字节 / md5 / 主包体积 / 表条数 / `grep -c` 计数一律以对应命令的实际输出为准）；**登记 ≠ 已执行 / 已验证**。
> **口径真源** = `docs/wenpu.spec.md` **§37** —— **W-37**（农历表 **1–2100（全套月表）** · **单一源 = `sxtwl`**（含 1900–2100 整张重生成）· **pre-1900 = 历法推算值** · **后端去农历 · 工具唯一真源 = 前端**）· **W-38**（**后记时间精确到月**：变量值 = `<干支>年<月名>`；**默认模板去「之年」** · **前端 / 后端双处逐字同步**）。

### §72-1 上云动作（清单 · 待执行）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **云函数 `compat-api` 重打包 + 部署**（**含删 `lib/lunar-year.js`**） | `esbuild` 重打包 `cloudfunctions/deploy/compat-api/index.js` ⇒ `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`（**现行 = 手工重打包 + 手工部署** · 承 §71-1 ②）；**须删除 `cloudfunctions/compat-api/lib/lunar-year.js`** ⇒ **该文件不得再进产物**（**后端去农历 · 不重打包 ⇒ 云端仍带农历工具**） |
| **②** | **H5 产物重打** | `npm run build:h5`（带 `VITE_API_BASE`）；**H5 现行部署模型 = 随 `main` push 自动构建上线** ⇒ **本批随 push 生效**（**旧 H5 缓存窗口风险 = §69-4 / §71-1 ③ 同款**） |
| **③** | **小程序产物重打 ＋ 主包体积重测** | 一次 `build:mp-weixin` + 开发者工具上传（**并入既有「⬜ 待办 2：小程序产物重打」合并重打**）；**小程序主包体积必须重测并满足 `2 MiB` 限额**（扩表增量 ≈ `+7.5 KB` · **已知情并接受** · 口径真源 = 同册 §37-2） |
| **④** | **数据 / 真源面** | **无新集合 · 无数据修正 · 无真源写入** —— `config/` / 树 JSON / 既有集合 / 云存储**均不动**；**上传脚本 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 名单不动**（**无新集合 ⇒ 不改名单位**；**与 §71-1 ① 相反**） |
| **⑤** | **文档面** | `docs/wenpu.spec.md` **§37** ＋ 本节（**本单只改文档**） |

### §72-2 部署后判据（**形态判据 · 阈值写死 · 命令面不预填读数**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **新表年范围** | 于农历表产物内对**年范围模式**（下限 `1` / 上限 `2100`）分别 `grep -c` ⇒ **各 ≥ 1**（**模式逐字与表文件名以现证为准 · 不预设**） |
| **2** | **新路由片段（回归）** | 于**重打包产物**（`cloudfunctions/deploy/compat-api/index.js`）内对**新路由片段**（逐字 = `admin/wenpu-config`）`grep -c` ⇒ **≥ 1**（**防重打包回退**） |
| **3** | **后端去农历（阈值相反 · 不得混写）** | 于**重打包产物**内对 `lunar-year` **`grep -c` ⇒ `0`**；且 **`cloudfunctions/compat-api/lib/lunar-year.js` 不存在** |
| **4** | **模板双处同步** | **前端 / 后端两处默认模板逐字相等** 且 **均无「之年」**（`grep -c '肇創於{肇創年份}之年'` 于两处 ⇒ **`0`**）；**只改一处 ⇒ 判负** |
| **5** | **小程序主包限额** | 主包体积**重测** ≤ **`2 MiB`**（**不预填读数**） |
| **6** | **生产 HTTP（回归 ＋ 到月）** | `GET /revisions?tree_id=…` **200** 且顶层含 `wenpu_config`（未配置 ⇒ 返默认）；**后记三变量值形如 `<干支>年<月名>`**；`GET` / `PUT /admin/wenpu-config` 权限码与 **400 / 403 / 409** 照旧（§71-2 判据 4 继续有效） |
| **7** | **不动面** | 双轨排版常量（栏格 43px / 每栏格字上限 26 字 / 每页栏数）与 `pages/special/pdf-export` / `components/doc-layout-panel/` **未改**（`git diff --numstat` ⇒ **0 条** · 承 §71-2 判据 5） |

- **判据写法（逐字 · 供执行者照抄）**：取计数 = **① 年范围**（表产物 · 两模式）、**② 新路由片段**（重打包产物 · 一模式）、**③ `lunar-year`**（重打包产物 · 一模式）分别 `grep -c` ⇒ **前两项均须 ≥ 1 · 第三项须 = 0**；**不预设产物目录名 / 分片文件名 / 表文件名**（以现证为准）。
- **⚠️ 阈值方向（硬）**：**「新表年范围 ≥ 1」「新路由片段 ≥ 1」与「`lunar-year` = 0」方向相反 ⇒ 不得混写、不得互推**。

### §72-3 部署后冒烟（按序做）

1. **未配置时逐字判据（去「之年」版）**：**未配置（或重置为默认）⇒ 后记逐字 = 默认模板输出** —— **无修订 = `本族家譜，肇創於{Y}，由{C}始纂。今為最新釐正版，是為{Y}訂本。願後之族人、續而增修之。`**；**1 轮 = `本族家譜，肇創於{Y}，由{C}始纂。其後壹經修輯於{Y1}，主司{C1}。今為最新釐正版，是為{Ylast}訂本。願後之族人、續而增修之。`**（`{Y}` = **`<干支>年<月名>`** · 如 `丙午年七月`；**序次字形 `壹` 承 §71-4 ⑦ · 非回归** · 口径真源 = 同册 §37-3 / §37-4）；
2. **时间到月实测**：取**有 `created_at` 且含月**的树 ⇒ 后记三变量位**到月**；**只有年 ⇒ 仅到年**；**无日期 / 解析不出 ⇒ `不詳`**（**不省片段** · 现字形「肇創於不詳」）；
3. **后端去农历实测**：改模板 / 取值**走标准 ISO 进出**（后端**不返回任何农历字形**）；**农历串只在前端生成**；
4. **多轮树**：轮段**逐轮展开、几轮几段**；**无修订 ⇒ 轮段不展开**（承 §71-3 之 4）；
5. **后台版块**：改后记模板 ⇒ 保存 ⇒ **回读一致**（`version` 递增；非 chief ⇒ 无入口 / **403** · 承 §71-3 之 1）；
6. **痕迹面**：保存配置**不产生 `jiapu_ops_logs`**、**不扣竹片**（承 §71-3 之 7）。

### §72-4 取代关系登记（**旧行一律原文保留、不回改**）

| # | 对象 | 关系 |
|---|---|---|
| **①** | **本册 §71-3 之 2**（「未配置时逐字判据」· 含「之年」字面） | **原文保留 ＋ 就地加注**（**只加行尾文字 · 原行一字未改、未删**）；**自本节起按「去「之年」＋ 年位到月」读**；口径真源 = `docs/wenpu.spec.md` §37-3 / §37-4 |
| **②** | **本册 §71-7 ②**（「默认模板（逐字 · 现行）」· 含「之年」字面） | **同上**（**原文保留 ＋ 就地加注**）；**自本节起按去「之年」版读**；口径真源 = 同册 §37-4 |
| **③** | **`docs/wenpu.spec.md` §0 / §8 / §9 / §17 / §20 / §25 / §26 / §30 / §36 相关行** | **由该册 §37 取代 / 加注**（**该册已就地加注** · 见其 §37-6）；**本册不代改该册** |
| **④** | **本册 §71-1 ①（上传脚本 `COLLECTIONS` 补名）** | **本批不适用**（**无新集合**）；**该行原文保留、不回改**（**各限其批**） |
| **⑤** | **本册 §69-3 之 5 / §70 / §71 其余口径** | **一律继续有效**（标点 `●` / PDF 打印 / 路由 / 权限 / CAS / 循环符号 / 繁体标签 **不变**） |

### §72-5 未实测 / 待办（**如实登记 · 不得写成已验证**）

- **本批上云动作未执行**（本清单只登记动作与判据；**读数位由执行 / 质检收口后回写**）；
- **云函数重打包 / 部署未执行** ⇒ **云端仍带 `lib/lunar-year.js`**（**未部署前不得称「后端已去农历」**）；
- **小程序产物未重打 · 主包体积未重测**（并入既有「⬜ 待办 2」）；
- **线上 H5 未逐片确证**（承 §69-1 ③ / §70-4 / §71-5 同款：Vercel 构建分片，`grep` 可能落在入口未引用的惰性 chunk 外 ⇒ **以 push 触发构建为准**）；
- **pre-1900 段 = 历法推算值**（**无观测依据** ⇒ 精度未验证；**不得据史料判负**）；
- **前端 / 后端两处模板同步未落盘验证**（代码面 · **本单只改文档**）；
- **member / guest 视角未测** · **真机 / dpr > 1 / 字体回退未测**（承 §71-5）。

### §72-6 状态词与边界（**硬**）

- **本单 = 制度登记单**（**只改文档**：`docs/wenpu.spec.md` §37 ＋ 本节 ＋ **本册 §71-3 之 2 / §71-7 ② 两行行尾就地加注**；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / `cloudfunctions/**` / `scripts/**` / `frontend/**` / `migrate-output/**` / `config/**`**；**未 commit / 未 push / 未部署 / 未跑构建 / 未跑测试**；**未重启任何服务**）；
- **状态 = 已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。

## §73 追记 · 上云动作与判据收口（**H5 / 小程序两产物重打 ＋ 小程序主包体积必须重测 ≤ `2 MiB` ＋ 云函数 `compat-api` 重打包** · **本追记无新增代码改动面** · **无新集合 · 无数据修正 · 真源零写入** · 口径真源 = `docs/wenpu.spec.md` **§37 / §38** · **2026-10-14 · 只追加 · 不改 §0–§72 任何行**）（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§73**（前节 = **§72**；现证 = `grep -n '^## ' docs/PENDING_DEPLOY.md | tail`）—— **若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面**。
> **性质**：本节 = **§72 之后的同批追记**（**§37 批收尾期发现并已修一处真缺陷（月名简繁）＋ 一个旧体积预算被取代（`≤ 8192 B` ⇒ `≤ 16384 B`）** ⇒ 上云面追记；口径真源 = `docs/wenpu.spec.md` **§38**）；**本追记无新增代码改动面**（**动作面与 §72-1 同批、不另起一批**）；**§0–§72 既有行原文一律保留、不回改**。
> **状态词（硬）**：**已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。
> **本清单只登记上云动作与判据 · 不预填读数**（产物字节 / md5 / 主包体积 / `grep -c` 计数一律以对应命令的实际输出为准）；**登记 ≠ 已执行 / 已验证**。

### §73-1 上云动作（**清单 · 待执行** · 与 §72-1 同批）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **H5 / 小程序两产物重打** | 一次 `npm run build:h5`（带 `VITE_API_BASE`）＋ 一次 `build:mp-weixin` ＋ 开发者工具上传（**并入既有「⬜ 待办 2：小程序产物重打」合并重打**）；**H5 现行部署模型 = 随 `main` push 自动构建上线** ⇒ 本批随 push 生效（旧 H5 缓存窗口风险 = §69-4 / §71-1 ③ / §72-1 ② 同款） |
| **②** | **小程序主包体积必须重测（硬 · 必测）** | **重测且满足 `2 MiB` 限额**；**不预填读数**（本地既有读数 ≈ `1.98 MiB` 属 **Kevin 2026-10-13 告知的已知情口径 · 非本次实测**）；**表体积预算 = `docs/wenpu.spec.md` §38-2（`≤ 16384 B` 取代 `≤ 8192 B`）** ⇒ **不得据旧预算判负**；**主包判据 = `2 MiB`（不变）** |（加注 · 2026-10-14 · **口径纠正**：本行「本地既有读数 ≈ `1.98 MiB`」= **不含 `static/`** 的旧口径；**上限判定一律按含 `static/`**（= `subPackages` roots 之外的**全部文件**；判据工具 = `frontend/scripts/mainpkg_bytes.py`）⇒ **本册主包读数一律按含 `static/` 口径记、两口径不得互推**；原文保留、不回改 · 登记 = 本册 §74-2 判据 1 / `docs/wenpu.spec.md` §39-1 ⑦）
| **③** | **云函数 `compat-api` 重打包（＋部署）** | `esbuild` 重打包 `cloudfunctions/deploy/compat-api/index.js` ⇒ `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c`（现行 = 手工重打包 + 手工部署 · 承 §71-1 ② / §72-1 ①）；**含删 `lib/lunar-year.js` ⇒ 该文件不得再进产物**（**后端去农历**） |
| **④** | **数据 / 真源面** | **无新集合 · 无数据修正 · 无真源写入** —— `config/` / 树 JSON / 既有集合 / 云存储**均不动**；**上传脚本 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 名单不动**（**无新集合 ⇒ 不改名单位**） |
| **⑤** | **文档面** | `docs/wenpu.spec.md` **§38**（＋其 §38-5 ② 各落点行尾就地加注）＋ 本节（**本单只改文档**） |

### §73-2 部署后判据（**形态判据 · 阈值写死 · 命令面不预填读数**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **小程序主包限额** | 主包体积**重测** ≤ **`2 MiB`**（**不预填读数**） |
| **2** | **后记简体字形探针（新增 · 口径真源 = `docs/wenpu.spec.md` §38-1 ⑤）** | 后记页最终文本内对简体字形 `闰` / `腊` `grep -c` ⇒ **`0`**（**繁体侧 = `閏` / `臘`**；探针命令 / 产物路径**以执行侧现证为准、不预设**） |
| **3** | **模板双处同步（回归 · 承 §72-2 判据 4）** | 前端 / 后端两处默认模板**逐字相等** 且 均无「之年」（`grep -c '肇創於{肇創年份}之年'` 于两处 ⇒ **`0`**） |
| **4** | **新路由片段（回归 · 承 §72-2 判据 2）** | 于重打包产物内对 `admin/wenpu-config` `grep -c` ⇒ **≥ 1**（防重打包回退） |
| **5** | **后端去农历（阈值相反 · 不得混写 · 承 §72-2 判据 3）** | 于重打包产物内对 `lunar-year` `grep -c` ⇒ **`0`**；且 `cloudfunctions/compat-api/lib/lunar-year.js` **不存在** |
| **6** | **不动面（承 §72-2 判据 7）** | 双轨排版常量与 `pages/special/pdf-export` / `components/doc-layout-panel/` `git diff --numstat` ⇒ **0 条** |

- **⚠️ 阈值方向（硬）**：**判据 4（`≥ 1`）与判据 5（`= 0`）方向相反 ⇒ 不得混写、不得互推**（承 §72-2 同款）。
- **判据 2 的读数位**：**本册不预填**（**主包体积 / `grep -c` 计数 / 产物字节一律以执行侧现证输出为准**）。

### §73-3 未实测 / 待办（**如实登记 · 不得写成已验证**）

- **本追记上云动作未执行**（本清单只登记动作与判据；**读数位由执行 / 质检收口后回写**）；
- **小程序产物未重打 · 主包体积未重测**（并入既有「⬜ 待办 2」）；
- **云函数重打包 / 部署未执行** ⇒ **云端仍带 `lib/lunar-year.js`**（**未部署前不得称「后端已去农历」**）；
- **后记简体字形探针未实测**（§73-2 判据 2 属执行 / 质检面）；
- **线上 H5 未逐片确证**（承 §69-1 ③ / §70-4 / §71-5 / §72-5 同款：Vercel 构建分片 ⇒ **以 push 触发构建为准**）；
- **pre-1900（含 1–999 重建段）= 推算 / 重建值 · 精度不保证**（**不得据史料判负**；口径真源 = 同册 §37-1 ④ / §38-4）；
- **member / guest 视角未测** · **真机 / dpr > 1 / 字体回退未测**（承 §71-5 / §72-5）。

### §73-4 与既有条目的关系（**旧行一律不回改**）

| # | 对象 | 关系 |
|---|---|---|
| **①** | **本册 §72-1 ① ② ③（两产物重打 / 主包重测 / 云函数重打包）** | **继续有效**（本追记 = **追记 / 收口登记**，**不取代 §72-1**）；**§72-1 ③ 引「扩表增量 ≈ `+7.5 KB` · 已知情并接受」字面原文保留** |
| **②** | **本册 §72-2 判据 1–7** | **一律继续有效**；本追记**只增判据 2（后记简体字形探针）** |
| **③** | **`docs/wenpu.spec.md` §17 农历表体积预算行** | **数字面已被该册 §38-2 取代**（`≤ 8192 B` ⇒ `≤ 16384 B`；**该册已就地加注**）；**本册不代改该册** |
| **④** | **本册 §71 / §72 其余口径** | **一律继续有效**（标点 `●` / PDF 打印 / 路由 / 权限 / CAS / 循环符号 / 繁体标签 **不变**） |

### §73-5 状态词与边界（**硬**）

- **本单 = 制度登记单**（**只改文档**：`docs/wenpu.spec.md` **§38 ＋ 其 §38-5 ② 各落点行尾就地加注** ＋ 本节；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / `cloudfunctions/**` / `scripts/**` / `frontend/**` / `migrate-output/**` / `config/**`**；**未 commit / 未 push / 未部署 / 未跑构建 / 未跑测试**；**未重启任何服务**）；
- **状态 = 已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。

## §74 追记 · 两批同单上云登记（**① 小程序主包瘦身批 · 已提交 `e943923`** ＋ **② 封面 / 封底半叶化批**）（**两批均纯前端** ⇒ **云函数 `compat-api` 无需重打包（本批无后端改动）** · **H5 重建部署 ＋ 小程序重打并上传** · **判据 = 小程序主包 ≤ `2 MiB`（含 `static/` 口径）＋ 封面 / 封底四叶顺序目视** · 口径真源 = `docs/wenpu.spec.md` **§39** · **2026-10-14 · 只追加 · 不改 §0–§73 任何行**（**唯一例外 = §73-1 ② 一行行尾就地加注，原行原文保留、未删行**））（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§74**（前节 = **§73**；现证 = `grep -n '^## ' docs/PENDING_DEPLOY.md | tail`）—— **若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面**。
> **性质**：本节 = **§73 之后的两批同单追记**；**本批无后端改动面** ⇒ **云函数 `compat-api` 无需重打包、无需部署**（**⚠️ 与 §72-1 ③ / §73-1 ③ 的「重打包」动作不同批、不得互推**）；**§0–§73 既有行原文一律保留、不回改**。
> **状态词（硬）**：**已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。**另登记现证事实**：**批① 已提交 `e943923`**（现证 = `git show --stat e943923` ⇒ 2 文件：`frontend/vite.config.ts` ＋ `frontend/scripts/mainpkg_bytes.py`）；**批② 未提交**（现证 = `git status --short` ⇒ 三个改动文件 ＋ 未跟踪资产 `frontend/src/static/icons/wenpu-seal.svg`）。
> **本清单只登记上云动作与判据 · 不预填读数**（产物字节 / md5 / 主包体积 / `grep -c` 计数一律以对应命令的实际输出为准）；**登记 ≠ 已执行 / 已验证**。

### §74-1 上云动作（**清单 · 待执行**）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **云函数 `compat-api`** | **无需重打包、无需部署**（**本批零后端改动** —— 口径真源 = `docs/wenpu.spec.md` §39-1 ⑥ / §39-3 ⑧；**不动面** = `cloudfunctions/**` 一字未改）。**⚠️ 与 §72-1 ③ / §73-1 ③ 区别**：那两节的「`esbuild` 重打包 ＋ `tcb fn deploy`」属**上一批（农历表 / 后记）动作**，**本批不得据之重打包、亦不得据本节免掉那两节的动作**（**两件互不替代**） |
| **②** | **H5（重建部署）** | 一次 `npm run build:h5`（带 `VITE_API_BASE`）；**现行部署模型 = 随 `main` push 自动构建上线**（`frontend/vercel.json` 的 SPA `rewrites` 不动）；**旧 H5 缓存窗口风险同款 = §69-4 / §70-4 / §71-5 / §72-5 / §73-3** |
| **③** | **小程序（重打并上传）** | 一次 `build:mp-weixin` ＋ **微信开发者工具上传**（**并入既有「⬜ 待办 2：小程序产物重打」合并重打**）；**二批同单 ⇒ 一次重打同时带两批产物** |
| **④** | **数据 / 真源面** | **无新集合 · 无数据修正 · 无真源写入** —— `config/` / 树 JSON / 既有集合 / 云存储**均不动**；**上传脚本 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 名单不动** |
| **⑤** | **前端新增资产（须计入主包）** | 批②**新增** `frontend/src/static/icons/wenpu-seal.svg`（**SVG ⇒ 随小程序产物进包、增重计入主包**）⇒ **主包体积必须按含 `static/` 口径重测**（判据 1）；**与批①的剔除清单不同物**（**不得把印章算作「零引用静态」**） |
| **⑥** | **文档面** | `docs/wenpu.spec.md` **§39**（＋其 §39-6 ② 各落点行尾就地加注）＋ 本节（**本单只改文档**） |

### §74-2 部署后判据（**形态判据 · 阈值写死 · 命令面不预填读数**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **小程序主包 ≤ `2 MiB`（含 `static/` 口径 · 硬 · 必测）** | 重测 `python3 frontend/scripts/mainpkg_bytes.py dist/build/mp-weixin` ⇒ `main_package_bytes` **≤ 2,097,152**（`over_2MiB_by ≤ 0`）；**口径 = 含 `static/`**（= `app.json` 的 `subPackages[].root` 之外**全部文件**）—— **旧登记「≈ `1.98 MiB`」为不含 `static/` 的旧口径、不得作为判据读数**（口径真源 = `docs/wenpu.spec.md` §39-1 ⑦）；**本册不预填读数** |
| **2** | **小程序产物内静态死重为零** | 于重打产物内 `ls`（或等价命令）⇒ **`static/icons/favicon.svg` / `static/icons/favicon-32.png` / `static/icons/favicon-180.png` / `static/tree-meta.json` / `static/tree-api.json` 五者皆不存在**；**且产物文本内对五者文件名零引用** |
| **3** | **图标样式已按需（反向护栏 · 阈值方向与判据 2 相反）** | 于重打产物内 **`node-modules/@tdesign/uniapp/dist/icon/icon.wxss` 字节数 ≪ 145,106 B**（**不预填读数**）；**且 `@font-face` 与基础规则仍在**（不得整段丢失） |
| **4** | **H5 产物与源码落点不动（守 `docs/seo.spec.md` §7 H 落点）** | H5 产物内 **favicon 三件仍在**；**`frontend/src/static/**` 未被删改**（`git diff --numstat` ⇒ **0 条**，**新增 `wenpu-seal.svg` 除外**） |
| **5** | **封面 / 封底四叶顺序（目视 · 硬）** | 打印预览（`printAll`）**逐叶目视**：**封面叶**（左半深棕 `#4A3629` ＋ 米色题签 `#F7F3E8`/2px `#8B7355` ＋ **繁体竖排谱名**）→ **留白叶** → … → **留白叶** → **封底叶**（右半深棕 ＋ **暖白印章居中、印文 = 中华数字家谱**）；**无色块跨中线 · 封底无题签 / 无谱名** |
| **6** | **首叶仍 `葉一`（不占叶序回归）** | 封面 / 封底**不占叶序** ⇒ **谱文首叶书号仍 `葉一`**，与「无封面 / 无封底」时**逐字一致** |
| **7** | **空书不动面** | 空谱仍只出 **`暫無譜文`** 空态（**无封面叶、无封底叶**） |
| **8** | **不动面（回归）** | `cloudfunctions/**` / `config/**` / `migrate-output/**` 的 `git diff --numstat` ⇒ **0 条**；**云函数产物未变更**（本批无重打包 · 判据 1 与本节 ① 同源） |

- **⚠️ 阈值方向（硬）**：**判据 2（=`不存在` / 零引用）与判据 3（`≪` 上限）方向相反 · 判据 1（`≤` 上限）不得与「≥」类混写**（承 §72-2 / §73-2 同款）。
- **判据 1 的读数位**：**本册不预填**（**主包体积 / 产物字节 / `git diff --numstat` 计数一律以执行侧现证输出为准**）。

### §74-3 未实测 / 待办（**如实登记 · 不得写成已验证**）

- **两批均未上云**（本清单只登记动作与判据；**读数位由执行 / 质检收口后回写**）；
- **☐ 未测面（硬 · 必须明写）**：**小程序运行期**的 **(a) 图标按需裁剪后是否缺图标**与 **(b) 封面 / 封底半叶色块 ＋ 印章 SVG 的渲染** = **均需微信开发者工具（真机更佳）点检 ⇒ 本批未实测**；**H5 侧四叶顺序亦未逐张目视**（判据 5 属执行 / 质检面）；
- **主包体积未重测**（判据 1 读数位留空）；
- **小程序产物未重打**（并入既有「⬜ 待办 2」）；
- **线上 H5 未逐片确证**（承 §69-1 ③ / §70-4 / §71-5 / §72-5 / §73-3 同款：Vercel 构建分片 ⇒ **以 push 触发构建为准**）；
- **member / guest 视角未测** · **真机 / dpr > 1 / 字体回退未测**（承 §71-5 / §72-5 / §73-3）；
- **封底印章「约 300 × 300」为近似口径**（**精确尺寸未取证**）；**题签尺寸（现证注释 `150 × 430`）未按判据逐条确证**；
- **☐ 未裁 / 未取到**：**批① 的独立质检记录在 `docs/` 内零命中**（现证 = `grep -rln '瘦身\|main-package-slim' docs/`）⇒ **不得写「已质检」/「N1–N5 PASS」**；**批② 尚未送检（Neng）**。

### §74-4 与既有条目的关系（**旧行一律不回改**）

| # | 对象 | 关系 |
|---|---|---|
| **①** | **本册 §72-1 / §73-1（两产物重打 / 主包重测 / 云函数重打包）** | **继续有效**；**本批只适用其前两项（两产物重打 ＋ 主包重测）** ⇒ **云函数一项本批不适用** —— **⚠️ 不得据本节免掉 §72 / §73 的云函数动作**（**那两批若尚未执行，仍各自待办**），**亦不得据 §72-1 ③ / §73-1 ③ 为本批重打包**（**本批无后端改动面**） |
| **②** | **本册 §72-2 判据 5 / §73-2 判据 1（主包 ≤ `2 MiB`）** | **继续有效**；**本节判据 1 = 同一判据的口径收口**（**明写含 `static/`**，判据工具 = `frontend/scripts/mainpkg_bytes.py`） |
| **③** | **本册 §73-1 ②「本地既有读数 ≈ `1.98 MiB`」整行** | **口径纠正**：该读数为**不含 `static/`** 的旧口径 ⇒ **本册主包读数一律按含 `static/` 口径记**（口径真源 = `docs/wenpu.spec.md` §39-1 ⑦）；**该行原文保留 ＋ 行尾就地加注**（**本册自己的一行 ⇒ 本册就地加注、未删行**）；**`docs/wenpu.spec.md` 侧的对应三行由该册自加注、本册不代改** |
| **④** | **本册 §69-1 / §70-1 / §71-1（封面页 / PDF / 后记等批）** | **一律继续有效**；**本节不取代任何旧节**（**节间只登记差异、不互推**） |
| **⑤** | **`docs/wenpu.spec.md` §32（W-26）封面页** | **版面面部分取代 ＋ 页别扩充**（**该册已就地加注** · 见该册 §39-6 ②；**本册不代改该册**） |
| **⑥** | **本册「⬜ 待办 2：小程序产物重打」** | **继续有效**（本节 ③ 只是**把两批并入该待办**；**该待办条目字面不动**） |

### §74-5 状态词与边界（**硬**）

- **本单 = 制度登记单**（**只改文档**：`docs/wenpu.spec.md` **§39 ＋ 其 §39-6 ② 各落点行尾就地加注** ＋ 本节 **＋ §73-1 ② 一行行尾就地加注**；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / `cloudfunctions/**` / `scripts/**` / `frontend/**` / `migrate-output/**` / `config/**`**；**未 commit / 未 push / 未部署 / 未跑构建 / 未跑测试**（**唯一执行的命令 = 对既有产物目录只读跑 `frontend/scripts/mainpkg_bytes.py`**，**未重打产物**）；**未重启任何服务**）；
- **状态 = 已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**。

---

## §75 树写安全修复（**写前权威版本 CAS ＋ 读侧真源纳秒指纹**）上云登记（**云函数 `compat-api` 必须重打包（`esbuild`）＋ 部署** · **纯后端单批 ⇒ 前端本次不入本单** · **无新集合 · 无数据修正 · 真源零写入** · **已提交 `ef0ee9e`** · 口径真源 = `docs/data-model.md` **§11** · **2026-10-15 · 只追加 · 不改 §0–§74 任何行**）（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§75**（前节 = **§74**；现证 = `grep -n '^## ' docs/PENDING_DEPLOY.md | tail`）—— 若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面。
> **性质**：本节 = **树写安全修复批的上云动作登记**。**本批有后端改动面**（`cloudfunctions/compat-api/lib/store.js`；现证 = `git show --stat ef0ee9e` ⇒ **1 文件 / +142 / −7**）⇒ **必须重打包 ＋ 部署**（**⚠️ 与 §74-1 ①「无需重打包、无需部署」相反，属不同批、不得互推**）。
> **状态词（硬）**：**已实现（Kong）· 质检 PASS（Neng，附读数）** —— **不得写成「已通过」/「已上线」**（**云函数未部署 ⇒「已上线」不成立**）。
> **部署待 Kevin 发话**。
> **本清单只登记上云动作与判据 · 不预填读数**（产物字节 / md5 / `version` / HTTP 状态码一律以部署后执行侧实际输出为准）；**登记 ≠ 已执行 / 已验证**。

### §75-1 上云动作（**清单 · 待执行 · 部署待 Kevin 发话**）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **重打包（`esbuild`）** | 对 `cloudfunctions/compat-api` **重打包**（产物口径 = `cloudfunctions/deploy/**`，与既有批一致）；**不得跳过打包直接部署**（部署 = 打包含现证产物）；**改动面只有 `lib/store.js`**（现证 `git show --stat ef0ee9e`） |
| **②** | **部署云函数 `compat-api`** | 本批**唯一部署对象**；部署后**当场验三件**（§75-2） |
| **③** | **前端（H5 / 小程序）** | **本次不入本单**（**本批零前端改动** —— 现证 `ef0ee9e` 只改 `lib/store.js`）⇒ **H5 不重建部署、小程序不重打上传**（**⚠️ §74-1 ② ③ 的「两产物重打」属 §74 那一批，不得据本节免掉、亦不得据其为本批重打**） |
| **④** | **数据 / 真源面** | **无新集合 · 无数据修正 · 真源零写入** —— `config/` / 树 JSON / 既有集合 / 云存储 / `jiapu_tree_meta` **均不动**；**上传脚本 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 名单不动**；**不跑任何迁移脚本**（本批无存储形态变更） |
| **⑤** | **文档面** | `docs/data-model.md` **§11**（＋其 §11.7 ① ④ ⑤ 三行行尾就地加注）＋ 本节（**本单只改文档**） |
| **⑥** | **既有产物的有效性** | **本批不改前端** ⇒ 既有 H5 / 小程序产物**不受本批影响**；但**云函数产物必须换新**（旧产物里仍是「只比内存缓存」的旧 `saveTree`） |

### §75-2 部署后判据（**部署后当场验三件 · 硬 · 命令面不预填读数**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **同树连打稳定一致** | 对**同一棵树**连打 `GET /tree/rank`（≥ 5 次）⇒ **各次人数完全相同**；**不得再出现 `118 / 119` 抖动**（**修复前实测 = `118 / 119 / 118 / 118 / 118`，`119` = 云存储真值**；登记 = `docs/data-model.md` **§11.1 缺陷 ①**）；**cloud 模式新增 `downloadFile` 后读延迟属预期，不得以「变慢」判失败** |
| **2** | **陈旧写拦成 409** | 构造「手持陈旧树对象」的结构写（例：实例 A 写成功后，用写前取到的旧树在另一实例触发写）⇒ **HTTP `409`** ＋ 响应文案**逐字** = **`并发冲突：树已被其他操作修改，请刷新后重试`** ＋ **真源未变**（树 JSON / 云存储对象字节或 md5 不变、**别人写入的节点仍在**）；**已扣费路径同响应带 `fee_refunded:true`**（不得出现「扣了费又拒写」的裸失败） |
| **3** | **正常写仍成功** | **无外部修改**时同一结构写 ⇒ **HTTP `200`**，且 **`version` 恰好 `+1`**、改动**确实落库**（读回可见）；**不得出现「误报 409」**（误拒 = 回归） |

- **⚠️ 阈值方向（硬）**：**判据 1（相等 / 一致）与判据 2（`409` ＋ `未变`）、判据 3（`200` ＋ `+1`）方向各不相同，不得混写、不得把判据 1 写成「≥ / 上限」类**（承 §72-2 / §73-2 / §74-2 同款）。
- **读数位本册不预填**（状态码 / 文案 / `version` / md5 / `grep -c` 计数一律以部署后执行侧现证输出为准）。
- **判据 2 的 note**：本地已用「副本 ＋ 独立进程推进盘上 `version`」复现 **409 ＋ 文案 ＋ `fee_refunded:true` ＋ 资产批次逐字节还原 ＋ 树文件 md5 一字未变 ＋ 别人节点仍在 ＋ 本次改动未落盘**（**2 次**）；对照组（同位置注入**但不推进 `version`**）⇒ **200**（证拒写来自版本 CAS 本身）；无外部修改 ⇒ **200 ＋ `version + 1`**。**⚠️ 上述读数为 `local` 模式** —— **`cloud` 模式 CAS 分支（`downloadFile` 取权威版本）本轮未实跑，只能由判据 1 / 2 / 3 在部署后当场覆盖**。

### §75-3 未实测 / 待办（**如实登记 · 不得写成已验证**）

- **☐ 未测面（硬 · 必须明写）**：**`cloud` 模式 CAS 分支（`cloudfunctions/compat-api/lib/store.js` 的 `readAuthoritativeVersion` → `downloadFile` 取权威版本）本轮未实跑** ⇒ **必须在部署后当场验三件**（§75-2 判据 1–3）；
- **☐ 多实例并发真跑未做**：本地证据 = 「副本 ＋ 独立进程推进盘上 `version`」，**不等价于云端多实例**；云端多实例行为**部署后才有证据**；
- **☐ 跨实例可见性下界未实测**：读侧 `TREE_CACHE_TTL_MS = 15 s`（**取舍、非缺陷**）⇒ **15 s 内仍可能读到陈旧副本**（承 `docs/data-model.md` §11.6）；
- **☐ 本批未部署**（本节只登记动作；**部署待 Kevin 发话**）；
- **☐ 线上 H5 / 小程序未涉及**（本批零前端改动 ⇒ 既有「旧 H5 缓存窗口」风险**不适用**，承 §69-1 ③ / §70-4 / §71-5 / §72-5 / §73-3 / §74-1 ② 均为**其它批**）。

### §75-4 与既有条目的关系（**旧行一律不回改**）

| # | 对象 | 关系 |
|---|---|---|
| **①** | **本册 §72-1 ③ / §73-1 ③（云函数 `compat-api` 重打包 ＋ 部署）** | **各自继续有效**（**那两批若有后端改动面，仍各自待办**）；**本批的重打包是只属于本批的动作** —— **不得据本节免掉其动作，亦不得据其免掉本节**（**两件互不替代**） |
| **②** | **本册 §74-1 ①（「无需重打包、无需部署」）** | **仅对 §74 那一批有效**（**§74 零后端改动**）；**本批有后端改动面 ⇒ 与本行相反**；**⚠️ 不得互推** |
| **③** | **本册 §74-1 ② / ③（H5 重建部署 ＋ 小程序重打上传）** | **本批不适用**（**本批零前端改动**）；**§74 的那两项若尚未执行，仍各自待办** |
| **④** | **本册 §50（共用环境纪律 ＋ 路 B 前置）** | **继续有效**（**部署环境纪律照旧**）；本节**只增本批的动作面与判据** |
| **⑤** | **`docs/data-model.md` §7 / §7.1 / §7.2（写一致性）** | **一律继续有效**（§7.1 R1–R5 逐条不变；§7.2 = 业务集合文档 CAS，**本批不动**）；**本册不代改该册** —— 该册 **§11** = 本批口径真源 ＋ 三行行尾就地加注 |
| **⑥** | **`docs/data-model.md` §2 总览表 / §3 `version` 注释** | **口径收窄（写前与真源版本比对）**，**由该册 §11 与其三行行尾就地加注承载**；**本册不代改该册** |

### §75-5 状态词与边界（**硬**）

- **本单 = 制度登记单**（**只改文档**：`docs/data-model.md` **§11 ＋ 其 §11.7 ① ④ ⑤ 三行行尾就地加注** ＋ 本节；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档 / `cloudfunctions/**` / `scripts/**` / `frontend/**` / `migrate-output/**` / `config/**`**；**未 commit / 未 push / 未部署 / 未跑构建 / 未跑测试**；**未重启任何服务**）；
- **状态 = 已实现（Kong）· 质检 PASS（Neng，附读数）** —— **不得写成「已通过」/「已上线」**（**云函数未部署**）。

### §75-6 执行回写（**2026-10-15 · Zang 执行**）（**纯追加 · §75-1 / §75-2 / §75-3 / §75-4 / §75-5 既有行原文一律保留 · 不回改**；**读数逐字照抄执行侧现证，未改写、未推算**）

> **挂账关闭（语义覆盖 · 旧行不回改）**：**自本节起**，**§75-1 标题及其表内的「待执行 / 部署待 Kevin 发话」与 §75-3 末项「☐ 本批未部署」两处挂账关闭** —— **Kevin 已发话「1、部署」⇒ Zang 已于 2026-10-15 执行完毕**（读数见下）。**上述旧行字面一律保留、不回改**。
> **状态词（硬）**：**已实现（Kong）· 质检 PASS（Neng，附读数）· 已部署（2026-10-15）** —— **任何处仍不得写「已通过」**：**§75-2 判据 2（陈旧写拦成 `409`）与判据 3（正常写 `200` ＋ `version` 恰好 `+1`）在生产上未实测**（原因与覆盖路径见本节末「未实测面」）。
> **性质**：本节 = **对 §75-1 / §75-2 所登记的已执行动作与读数的回写**；**不是新的动作单**，**不预填任何未实测读数**。

**(1) 重打包（`esbuild`）· 对应 §75-1 ①**

- 命令（逐字）：`frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js`
- 产物（新）：**md5 `759dd884040cfec619ca144b904377d9`** ／ **1,487,364 B**
- 产物（旧 · 被换下）：**md5 `3f6ef8c263ea7ef4458d25197d879329`** ／ **1,477,780 B**
- **回滚基线（旧产物备份）= `~/jiazu-backups/2026-10-15-store-fix-deploy/index.js.before`**
- 产物三查（对新产物）：**`readAuthoritativeVersion` ×2** ／ **`TREE_CACHE_TTL_MS` ×3** ／ **`require("@cloudbase/node-sdk")` ×1**（**`external` 保持**）／ **`node --check` OK**

**(2) 部署 · 对应 §75-1 ②**

- 命令（逐字）：`yes | tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c` ⇒ **部署成功**
- **函数指纹（部署后现证）**：**代码大小 `6,319,519` → `6,331,376` B**；**修改时间 `2026-10-15 08:55:25`**

**(3) 判据 1 ・同树连打稳定一致 ⇒ PASS（§75-2 判据 1）**

- `GET /tree/rank?tree_id=zhonghua` **连打 8 次** = **`119 / 119 / 119 / 119 / 119 / 119 / 119 / 119`**
- 对照（**修复前实测**）= **`118 / 119 / 118 / 118 / 118`**；**`119` = 云存储真值** ⇒ **本次 8/8 与真值一致、不再抖动**（承 `docs/data-model.md` §11.1 缺陷 ①）

**(4) 用户可见面已恢复（同批现证）**

- `GET /people/fc4707894660e16cdff1907a`（带 **`X-Tree-Id: zhonghua`**）⇒ **HTTP `200`** 且**人档可读**（**此前 = `person not found`**），**`gramps_id = 000000415`**（**黄嘉**）
- `GET /people/92d03c30e92509b93348a113` ⇒ **`family_list = ['645b7dcca2559f10d2927783']`**（**此前 = `[]`** —— 即姬陆终看不到自己新建的子节点）

**(5) 回归（部署后）**

- `ji_23395_01` **58/4** ／ `li_26446_01` **4/1** ／ `pan_28504_01` **16/0**
- `/tree-meta` **`200`** ／ `/revisions?tree_id=ji_23395_01` **`200`** ／ `/tree/rank?tree_id=zhonghua` **`200`**

**(6) 产物已入库**

- commit **`chore(deploy): 重打包 compat-api 产物（esbuild · 含树写安全修复）`**（**已 push**）

#### 未实测面（**硬 · 必须明写 · 不得写成已验证 / 已通过**）

- **☐ 判据 2（陈旧写拦成 `409`）与判据 3（正常写 `200` ＋ `version` 恰好 `+1`）在生产上未实测**（即 **§75-2 判据 2 / 3**）；
- **原因**：**客户端结构写不携带版本参数、服务端自行重读真源版本** ⇒ **无法从外部安全诱发一次冲突而不真正修改用户数据**（**不得为验收在生产上真实改用户数据**）；
- **覆盖路径（只能自然覆盖）**：**由用户下一次真实写入自然覆盖** —— 写后**回读判 `version + 1`**（判据 3）；**若 15 s 缓存窗口内二次写命中陈旧副本** ⇒ 应得 **`409` ＋ 文案逐字 ＝ `并发冲突：树已被其他操作修改，请刷新后重试` ＋ `fee_refunded:true`**（判据 2 · `TREE_CACHE_TTL_MS = 15 s` 承 §75-2 判据 2 / §75-3 与 `docs/data-model.md` §11.6）；
- **已有但不等价的读数（明写模式，⚠️ 不得当生产读数）**：**`local` 模式**下判据 2 / 3 已有读数 = **`409` ＋ 文案 ＋ `fee_refunded` ＋ 真源 md5 不变** ／ **`200` ＋ `version + 1`**（登记 = `docs/data-model.md` **§11.5** 第 2–4 行）—— **那是 `local` 模式，不等价于生产 `cloud` 模式**；
- **§75-3 其余各项继续有效**（多实例并发真跑未做 / 跨实例可见性下界未实测 / 线上 H5 小程序未涉及 —— **仅「☐ 本批未部署」一项自本节起关闭**）。

#### 边界（继续成立）

- **无新集合 · 无数据修正 · 真源零写入**（**§75-1 ④ 继续成立**：`config/` / 树 JSON / 既有集合 / 云存储 / `jiapu_tree_meta` **均未动**；`scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 名单**未动**；**未跑任何迁移脚本**）；
- **前端不入本单**（**§75-1 ③ / ⑤ / ⑥ 继续成立**：**本批零前端改动** ⇒ **H5 未重建部署、小程序未重打上传**；既有前端产物不受本批影响）；
- **本回写 = 制度登记单（只改文档）**：`docs/PENDING_DEPLOY.md` **本节** ＋ `docs/data-model.md` **§11 追加的「部署实况」（§11.9 ＋ §11.8 状态续写一行）**；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档**；**本回写本身未跑构建、未跑测试、未部署、未 git 写、未重启任何服务**（**仅登记执行侧已完成的动作与读数**）。

## §76 create-clan 云端首写 500 修复批（**casWritePlan 三路分派**）登记（**生产 500 → 修复 → 已部署 · 待 Kevin 重试确认为最终判据** · **源码 commit = `ca7cef0`（= `895087b` 的父）** · 口径真源 = `docs/data-model.md` **§11.10** · **2026-10-15 · 只追加 · 不改 §0–§75 任何行**）

> **编号（对账用 · 硬）**：本册按现证续编为 **§76**（前节 = **§75**；现证 = `grep -n '^## ' docs/PENDING_DEPLOY.md | tail`；产物 commit `895087b` 提交信息亦预指「回填见 PENDING_DEPLOY §76」）—— 若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面。
> **性质**：本节 = **create-clan 云端首写 500 事故批的全量执行登记**（根因 / 修法 / 测试 / 部署 / 孤儿清理 / 提交链）；**事故与修复均已执行完毕**，本节为**逐字登记**（读数照抄执行侧现证，未改写、未推算）。
> **状态词（硬）**：**已实现 · 已部署 · 待重试验证** —— **不得写「已通过」/「已修复完成」**：**最终判据 = Kevin 在生产重试「新建祖谱」成功，尚未发生**（见 §76-7）。

### §76-1 事故与根因（**生产 500 · 2026-10-15**）

- **事故**：`POST /admin/create-clan`（**新建祖谱**）⇒ **HTTP `500`**（生产）；
- **根因**：云端 **`jiapu_tree_meta._meta` 档无 `version` 字段**（**keys = `['_id','_schema','_description','storage_files']`**，**只读探针 2026-10-15 实证**）⇒ 旧 `commitCloudCas` 以 **`curVersion === 0`** 推断「档不存在」⇒ 对**已存在**的 `_meta` 档走 **`add({_id})`** ⇒ CloudBase **`_id` 重复必败**（**异常被吞**）⇒ **读回比对恒失败** ⇒ **重试耗尽** ⇒ **500**；
- **教训（现证 = `cloudfunctions/compat-api/lib/store.js:351-362` JSDoc）**：**「version 收口为 0」≠「档不存在」** —— `versionOf` 把缺失 / 非法 version 都收口成 0，**「遗留档无 version」与「档真不存在」在 curVersion 上不可区分**，必须看**原始档 `cur` 本身**；
- **伴生损伤**：云存储留孤儿 **`trees/huang_40644.json`**（**09:06:56**，**tree-meta 无登记**）—— 已随本批清理（§76-5）。

### §76-2 修法（**Kong · 源码 commit `ca7cef0`**）

- **新增纯函数决策器 `casWritePlan(cur, next)`**（**现证 = `cloudfunctions/compat-api/lib/store.js:384`**），**三路分派按原始档形态**（**不按收口后的版本号猜**）：
  - **`cur == null` ⇒ `add`**（档真不存在 ⇒ `collection(col).add(payload)` 完整新建档首写）；
  - **有限数值 `version` ⇒ `guarded`**（**条件值 = 原始 version** ⇒ `where({_id, version}).update(payload)` 标准 CAS；`version: 0` 的存量档亦归此路 —— 0 是**真实落库的有限数值**，条件写照样成立且安全：归 add 撞 `_id` 重复、归 bootstrap 白丢条件保护；负数同理，条件值取原始值、读回比对不变）；
  - **其余（无 `version` 或非数值：string / NaN / Infinity）⇒ `bootstrap`**（**一次性自举**：`doc(id).update(payload)` 无条件写，rest 自带 `version = curVersion + 1`，**自举后该档即有数值 version，后续走标准 guarded CAS** —— 代码自愈，不手工补生产数据）；
- **`commitCloudCas` 删 `curVersion === 0 → add` 分支**，改按 `casWritePlan(cur, next)` 三路分派（**现证 = `store.js:403-422`**）；**写调用异常一律不据此判成败，仍以读回比对为准**（**读回比对口径不变**：`back.version === curVersion + 1`，`store.js:420-421`）；
- **`mutateDoc` 传入原始档 `cur`**（决策器输入 = 原始档形态，非收口版本号）；
- **`commitLocalCas` / local 分支零改动**（**local 的 `_meta` 走 `withMetaWriteLock`，不经 `mutateDoc`**）；
- **改动面（现证 = `git show --stat ca7cef0` ⇒ 5 文件 / +247 / −13）**：`cloudfunctions/compat-api/lib/store.js`（+68）／ `lib/cas-write-plan.test.js`（**新建**，173 行）／ `lib/friend-ops.test.js` ／ `lib/task-center.test.js`（**注册数绊线 46→47 定额同步**）／ `package.json`（`scripts.test` 注册**第 47 项**）。

### §76-3 测试（**过程判据 · 已过**）

- **新建 `lib/cas-write-plan.test.js`**：**8 用例**，**含事故回归锚：无 version 存量档必须归 `bootstrap` 不得归 `add`**；
- **注册数绊线同步**：`scripts.test` 注册**第 47 项**；`friend-ops` / `task-center` 两处注册数绊线 **46→47 定额同步**（**现证 = `task-center.test.js:789-795` ／ `friend-ops.test.js:865-867`**）；
- **`npm test` = 762 / 762 / 0 · EXIT 0**（**主代理亲跑 · 2026-10-15**）。

### §76-4 部署（**esbuild 重打包 ＋ `tcb fn deploy` · 2026-10-15**）

- **产物（新）**：md5 **`9e86bea4f7b581dc86553f064529bfb9`** ／ **1,487,856 B**（**含 `casWritePlan` ×2**）；
- **部署**：`tcb fn deploy` ⇒ **成功**；**函数指纹（部署后现证）= 代码大小 `6,331,536` B · 修改时间 `2026-10-15 10:23:44`**（上一版 = `6,331,376` B · `2026-10-15 08:55:25`，见 §75-6 (2)）；
- **回归冒烟（部署后）**：`zhonghua` **`/tree/rank` 连打 5 次 = `119 × 5`** ／ **`/tree-meta` = `200`**。

### §76-5 孤儿清理（**云存储 `trees/huang_40644.json` · 2026-10-15**）

- **先备份后删除**：已下载备份（**675 B** → **`~/jiazu-backups/2026-10-15-orphan-huang/huang_40644.json`**）后删除（**SDK `deleteFile` 返 `SUCCESS`**）；
- **删除后现证**：`tcb storage list trees/` **无 `huang_*`** ✓。

### §76-6 提交链（**已推 main**）

- **源码 commit** = **`ca7cef0`**（= **`895087b` 的父**；`fix(store): commitCloudCas 按真实档形态三路分派（add/guarded/bootstrap）—— 修云端新建祖谱/家族树首写 500`）；
- **产物 commit** = **`895087b`**（`chore(deploy): 重打包 compat-api 产物（含 casWritePlan 三路分派修复）—— 云端已部署`）；
- **均已推 main**（现证 = `git log --oneline -3` ⇒ `895087b` / `ca7cef0` / `a490c52`）。

### §76-7 判据与状态词（**硬**）

- **最终判据（未闭合）**：**Kevin 在生产重试「新建祖谱」成功** —— **尚未发生 ⇒ 待 Kevin 重试确认为最终判据**；**重试成功前，任何处不得写「已通过」/「已修复完成」**；
- **过程判据（已过）**：**`npm test` 762/762/0** ＋ **产物指纹（md5 `9e86bea4f7b581dc86553f064529bfb9` ／ 函数指纹修改时间 `2026-10-15 10:23:44`）** ＋ **回归冒烟（`119 × 5` ／ `/tree-meta` 200）** —— 三件均已现证（§76-3 / §76-4）；
- **状态词 = 已实现 · 已部署 · 待重试验证**；**「云端新建祖谱/家族树首写恢复可用」只能写「已部署 · 待重试验证」**；
- **语义覆盖（旧行不回改）**：前登记（勘误 22 · commit `a490c52`）之「create-clan 云端首写预存缺陷登记（修复批在途）」挂账，**自本节起语义关闭**（修复已落地部署，判据见本节）；
- **边界（继续成立）**：**无新集合 · 无数据修正**（孤儿文件 = 备份后删除，非数据修正）；**本批零前端改动**（H5 未重建部署、小程序未重打上传）；**`commitLocalCas` / local 分支零改动**；
- **登记面**：`docs/PENDING_DEPLOY.md` 本节 ＋ `docs/data-model.md` **§11.10**；**本登记 = 制度登记单（只改文档）**（**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档**；**本登记本身未跑构建 / 未跑测试 / 未部署 / 未 git 写**，仅登记执行侧已完成的动作与读数）。

---

## §77 祖谱子嗣本树化 ＋ 世本侧始祖节点拦加子嗣 · 数据搬迁批 上云登记（**云函数 `compat-api` 重打包（`esbuild`）＋ 部署 · 已执行** · **前端随 push 上线** · **无新集合 · 真源零写入** · 口径真源 = `docs/clan-tree.spec.md` **§13** · **2026-10-15 · 只追加 · 不改 §0–§76 任何行**）（Jing 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§77**（前节 = **§76**；现证 = `grep -n '^## ' docs/PENDING_DEPLOY.md | tail`）—— 若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面。
> **性质**：本节 = **本批上云动作与执行回写的登记单**（**执行侧已完成**：重打包 ＋ 部署已执行、前端随 push 上线）；**逐字登记**（读数照抄执行侧现证，**未改写、未推算**）。
> **状态词（硬）**：**已实现 · 已部署 · 已验证（数据层）· UI 可见性待 Kevin 复验** —— **不得**写成「UI 已验收」/「端到端已通过」。
> **口径真源** = `docs/clan-tree.spec.md` **§13**（口径 ①②、代码锚点、迁移实况、环境事实；**本节不复写口径**）。

### §77-1 本批上云动作（**逐条 · 均已执行**）

1. **云函数 `compat-api` 重打包（`esbuild`）＋ 部署** —— **已执行**（`tcb fn deploy`）；**本批含新增后端逻辑**（口径 ①② 落 `cloudfunctions/compat-api/lib/child-write.js`，已进产物）。
2. **前端** —— **随 push 上线**（前端提交 = **`c34a5eb`**；**口径照录**）。
3. **CloudBase 集合** —— **无新集合**（本批不新建 / 不修改集合）。
4. **真源** —— **零写入**（`config/**` / `migrate-output/**` **未动**；数据改动只经脚本直连云端真源，逐条见 `docs/clan-tree.spec.md` **§13-3**）。

### §77-2 执行回写（**实测读数 · 逐字沿用，不得推算**）

| 项 | 读数 |
|---|---|
| **云函数指纹（部署后现证）** | **`2026-10-15 12:54:03`** · **代码大小 `6,332,304` B** |
| **产物 md5 / 体积** | **`15bf6105705ce7e9bb75809db1c14aad`** ／ **`1,490,068` B** |
| **门槛 · `npm test`** | **775 tests / 775 pass / 0 fail**（**注册 48**） |
| **门槛 · `vue-tsc`** | **EXIT 0** |
| **树读数 · 祖谱 `huang_40644`** | **`version 1→2 · people 1→11 · families 0→10`** |
| **树读数 · 世本 `zhonghua`** | **`version 99→100 · people 129→119 · families 115→105`** |
| **415 的 `spouse_families`** | **`[F0] → []`** |
| **祖谱镜像的 `spouse_families`** | **`[] → [8501654c8e4778f90bd843a0]`** |
| **备份** | **`~/jiazu-backups/2026-10-15-clan-descendants-move/`** |
| **提交链** | **`da4fe5f`（后端）→ `c34a5eb`（前端）→ `656fd35`（搬迁脚本）→ `a4ab4db`（产物）**；现证 `git log --oneline -1` = **`a4ab4db`**（**后续提交 —— 如 `AGENTS.md` 勘误 23 —— 不在本节范围**） |

### §77-3 判据（**应用接口 · 迁移后**）

- `GET /tree/rank?tree_id=huang_40644` ⇒ **person_count 11 / mirror 1 / gens 11**；
- `GET /tree/rank?tree_id=zhonghua` ⇒ **119 / 0 / 90**（世本侧**抹净**：10 人 / 9 个内部家族 / 1 个顶层家族已删）。
- **过程判据（已过）**：`npm test` **775/775/0（注册 48）** ＋ `vue-tsc` **EXIT 0** ＋ 上述接口读数 ＋ 备份目录现证存在（含 `summary.json` / `MD5-LEDGER.txt`）。

### §77-4 环境事实（**必须写进文档**）：云存储 `uploadFile` → 立即 `downloadFile` 有传播延迟

- **事实**：CloudBase 云存储 **`uploadFile` 成功后、立即 `downloadFile` 读回，可能拿到写前字节**（实测延迟 **秒级 ~ 分钟级**）。
- **本批后果**：搬迁脚本**首次 `--apply` 的写后校验 19 项误报不符**（**退出码 1**），**数据实际已正确写入**（**几分钟后独立探针双路径复核一致**）⇒ **不得**写成「**写入失败**」或「**已回滚**」：**未回滚、不需要回滚**。
- **加固（在途 · 未提交）**：脚本已**加固为轮询重试** —— **另一单在途**；**登记时点工作区现证** = `git diff --stat scripts/migrate-clan-founder-descendants-2026-10.mjs` **`65 + / 3 −`（未提交）**、`HEAD` = **`a4ab4db`**（**其产物内脚本尚无此逻辑**）；**该加固未参与本批迁移**，逐条改动面与行号见 `docs/clan-tree.spec.md` **§13-4**（**在途快照，以其交付 / 提交为准**）。

### §77-5 未测面（**如实登记 · 不得写成已验**）

- **真实登录态 UI 点击未跑**：**未**点过「＋ 在《X》内添加子节点」/ 世本侧被拦入口（**无浏览器点击流证据**）。
- **页面可见性由 Kevin 复验**：入口**是否按预期出现 / 隐藏**、文案呈现，**待 Kevin 复验**。
- **轮询重试加固未提交 / 未参与本批**（§77-4）⇒ **不作为本批已交付项**。
- 本节**未跑构建 / 未跑测试 / 未重跑迁移脚本 / 未再部署**；读数照抄执行侧现证。

### §77-6 登记面与边界（**硬**）

- **登记面**：`docs/PENDING_DEPLOY.md` 本节 ＋ `docs/clan-tree.spec.md` **§13**。
- **本登记 = 制度登记单（只改文档）**：**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档**；**本登记本身未跑构建 / 未跑测试 / 未部署 / 未 git 写**，仅登记执行侧已完成的动作与读数。

## §78 树 JSON 写路径版本化（方案 A）上云登记（**云函数 `compat-api` 重打包（`esbuild`）＋ 部署 · 已执行** · **前端本批零改动** · **无新集合 · 真源零写入** · 口径真源 = `docs/data-model.md` **§11.11** · **2026-10-15 · 只追加 · 不改 §0–§77 任何行**）（Jing 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§78**（前节 = **§77**；现证 = `grep -n '^## ' docs/PENDING_DEPLOY.md | tail`）—— 若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面。
> **性质**：本节 = **本批上云动作与执行回写的登记单**（执行侧已完成：重打包 ＋ 部署已执行）；**逐字登记**（读数照抄执行侧现证与登记时现读，**未改写、未推算**）。
> **状态词（硬）**：**已实现 · 已部署 · 端到端待真实写入回填** —— **不得**写成「端到端已通过」/「写后立即可见已验」/「已验收」。
> **口径真源** = `docs/data-model.md` **§11.11**（环境事实 · 方案 A 设计 · 验收口径 · deleteTree 既有缺陷登记；**本节不复写口径**）。

### §78-1 本批上云动作（**逐条 · 均已执行**）

1. **云函数 `compat-api` 重打包（`esbuild`）＋ 部署** —— **已执行**（`tcb fn deploy`）；**本批含新增后端逻辑**（`lib/store.js` 写路径版本化：版本化上传 ＋ 重指 storage_files ＋ best-effort 清扫，已进产物 `cloudfunctions/deploy/compat-api/index.js`）。
2. **前端** —— **本批零改动**（H5 未重建部署、小程序未重打上传；根治面全在后端写路径）。
3. **CloudBase 集合** —— **无新集合**（本批不新建 / 不修改集合）。
4. **真源** —— **零写入**（`config/**` / `migrate-output/**` 未动；**版本化切换不迁移数据** —— 存量树维持现 fileID，**下一次真实写入起**才产生 `trees/<tree_id>/v<N>.json` 新对象并重指）。

### §78-2 执行回写（**实测读数 · 逐字沿用，不得推算**）

| 项 | 读数 |
|---|---|
| **云函数指纹（部署后现证）** | **修改时间 `2026-10-15 15:08:48` · 代码大小 `6,332,602` B · 状态 `部署完成`**（**现证 = `tcb fn detail compat-api -e liwu-d8gek6jjdab1d087c` · 2026-10-15 制度登记时现读**；上批基线 = `2026-10-15 12:54:03` ／ `6,332,304` B，照抄 §77-2；派单所载预读「6,335,***」**未采用** —— 登记以现读为准） |
| **产物 md5 / 体积** | **`6d213213a47d03850ba8b4dccad846c9`** ／ **`1,491,648` B**（现证 = `cloudfunctions/deploy/compat-api/index.js` @ **`c57d9e3`**）；**换下的 §77 批产物 = `15bf6105705ce7e9bb75809db1c14aad` ／ `1,490,068` B**（照抄 §77-2） |
| **门槛 · `npm test`** | **784 tests / 784 pass / 0 fail**（**注册 49**；friend-ops / task-center **绊线 48→49**；**主代理亲跑同值**） |
| **新增测试锚** | `tree-object-path.test.js` **9 例（①–⑨）**：路径形状 ① / sweepTargets 保留规则 ② / isVersionedTreeFileId 保守判定 ③ / saveTree·createTreeFile·读路径静态锚 ④⑤⑥ / 旧同路径模板绝迹 ⑦ / 清扫 best-effort ⑧ / deleteTree 照旧 ⑨ |
| **提交链** | **`6c197d9`（后端＋测试）→ `c57d9e3`（产物）**；现证 `git log --oneline -1` = **`c57d9e3`**（工作区干净） |

### §78-3 判据（**写后立即可见 · storage_files 版本化**）

- **端到端判据（尚未发生 · 待回填）**：下一次**真实树写入**后 —— **a.** UI 立即刷新可见（「新增节点后要等 ~10 分钟」不再出现）；**b.** `_meta.storage_files[tree_id]` 变为版本化路径 **`trees/<tree_id>/v<N>.json`**。两条均 PASS ⇒ 状态方可升「已验证（端到端）」。
- **存储面判据**：存储不再有「同路径覆盖写」（每次保存 = 全新对象；遗留路径 `trees/<id>.json` 为迁移尾件，由清扫规则逐步回收）。
- **过程判据（已过）**：`npm test` **784/784/0（注册 49）** ＋ 静态锚 ④⑤⑥⑦⑧⑨ ＋ 部署指纹（§78-2）。

### §78-4 未测面（**如实登记 · 不得写成已验**）

- **端到端实证未发生（硬）**：§78-3 的 **a / b 两条均未实测** —— **待 Kevin 下一次真实写入后由主代理回填本节**；回填前**任何处不得写「已验证」**。
- **多实例并发双写同一 `v(N)` 路径的 TOCTOU 维持现状**（与旧实现同窗口，CAS 保护不变）—— 不因本批变好或变坏。
- **`deleteTree` 既有缺陷未修（登记 · 建议下批一行修复）**：`deleteFile({ fileID })` 参数不符 @cloudbase/node-sdk 实际签名 `deleteFile({ fileList })` ⇒ **删树对象疑似一直静默无效**（逐条 = `docs/data-model.md` **§11.11** 未验证面第 3 项；现证 `store.js:1229` ／ SDK `dist/cloudbase.js:214`）。
- 本节**未跑构建 / 未跑测试 / 未重部署**；读数照抄执行侧现证 ＋ 登记时只读探针（`tcb fn detail` / `md5` / `git show`）。

### §78-5 登记面与边界（**硬**）

- **登记面**：`docs/PENDING_DEPLOY.md` 本节 ＋ `docs/data-model.md` **§11.11**。
- **本登记 = 制度登记单（只改文档）**：**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档**；**本登记本身未跑构建 / 未跑测试 / 未部署 / 未 git 写**，仅登记执行侧已完成的动作与读数。

## §79 「指定 ID」档（家族管理面板第三档 · 加父 / 加子 / 加配偶 / 世本续编四入口）上云登记（**纯前端** ⇒ **云函数 `compat-api` 无需重打包（本批无后端改动）** · **H5 重建部署 ＋ 小程序重打并上传** · **判据 = 真机读数（三颗按钮 / 三分支文案 / 自身防护）＋ 小程序主包 ≤ `2 MiB`（含 `static/` 口径）** · **无新集合 · 真源零写入** · 口径真源 = `docs/id-system.spec.md` **§11** · **2026-10-16 · 只追加 · 不改 §0–§78 任何行**）（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§79**（前节 = **§78**；现证 = `grep -n '^## ' docs/PENDING_DEPLOY.md | tail` ⇒ 末节 = `## §78 树 JSON 写路径版本化（方案 A）上云登记…`，`^## §79` 命中 **0**）—— **若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面**。
> **性质**：本节 = **「指定 ID」档批的上云动作登记**。**本批 = 纯前端**（改动文件 = `frontend/src/components/person-manage-panel/person-manage-panel.vue`；口径真源 = `docs/id-system.spec.md` **§11**）⇒ **云函数 `compat-api` 无需重打包、无需部署**（**⚠️ 与 §77-1 / §78-1 的「重打包 ＋ 部署」相反，属不同批、不得互推**）。
> **状态词（硬 · 仓库三段式）**：**已实现（Kong）· 质检 PASS（Neng，附读数）** —— **不得**写成「已通过」/「已上线」/「已部署」。
> **本阶段不上云、只登记**；**本清单只登记上云动作与判据 · 不预填读数**（产物字节 / md5 / 主包体积 / 真机读数一律以执行侧实际输出为准）；**登记 ≠ 已执行 / 已验证**。
> **提交 rev（留待回写 · 硬）**：**本批尚未提交** ⇒ 本节的**本批 rev 位留空、待派单方提交后回写**（**不得预填任何不存在的 sha**）。**批前基线（现证 · 只作对账）**：`git log --oneline -1` = **`d8ce55b`**（= 本册 §78 入册提交）；**登记时工作区现证** = `git status --short` ⇒ **`M frontend/src/components/person-manage-panel/person-manage-panel.vue`** ＋ **`?? docs/id-system.qa.md`**（= 被检件改动 ＋ 质检报告，**均未提交**）。

### §79-1 上云动作（**清单 · 待执行**）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **云函数 `compat-api`** | **无需重打包、无需部署**（**本批零后端改动** —— 口径真源 = `docs/id-system.spec.md` §11-1 / §11-2 F-9；**不动面** = `cloudfunctions/**` 一字未改）。**⚠️ 与 §77-1 / §78-1 区别**：那两节的「`esbuild` 重打包 ＋ `tcb fn deploy`」属**树写安全 / 树 JSON 版本化批动作**，**本批不得据之重打包、亦不得据本节免掉那两节的动作**（**两件互不替代**） |
| **②** | **H5（重建部署）** | 一次 `npm run build:h5`（带 `VITE_API_BASE`）；**现行部署模型 = 随 `main` push 自动构建上线**（`frontend/vercel.json` 的 SPA `rewrites` 不动）；**旧 H5 缓存窗口风险同款 = §69-4 / §70-4 / §71-5 / §72-5 / §73-3 / §74-3** |
| **③** | **小程序（重打并上传）** | 一次 `build:mp-weixin` ＋ **微信开发者工具上传**（**并入既有「⬜ 待办 2：小程序产物重打」合并重打**）；**本档为 H5 与小程序两平台通用**（F-9）⇒ **两产物均须重打**，**不重打则线上仍是两档旧界面** |
| **④** | **数据 / 真源面** | **无新集合 · 无数据修正 · 无真源写入** —— `config/` / 树 JSON / 既有集合 / 云存储**均不动**；**上传脚本 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS` 名单不动** |
| **⑤** | **文档面** | `docs/id-system.spec.md` **§11**（规格真源 · 本单入册）＋ 本节（**本单只改这两个文档**） |

### §79-2 部署后判据（**真机读数 ＋ 阈值写死 · 命令面不预填读数**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **档位渲染（三颗按钮 · 硬）** | 真机（微信开发者工具 / 真机更佳 ＋ H5）打开**加父 / 加子 / 加配偶 / 世本续编**四类入口的编辑面板 ⇒ 非批量档下 `.mode-switch .mode-btn` = **3** 颗，**顺序 = 新建节点 / 从树中选择（世本与配偶档为挂接已有节点）/ 指定 ID**（口径 = `docs/id-system.spec.md` §11-2 F-1） |
| **2** | **三分支文案（逐字）** | ① 本树命中 ⇒ 确认行「**已定位：**」＋姓名·九位编号；② 他树编号 ⇒「**编号「…」属于《…》家族树，不能作为本树的节点**」；③ 无此编号 ⇒「**找不到编号为「…」的节点**」（口径 = §11-2 F-5） |
| **3** | **自身防护（硬）** | 输入本档案节点编号 ⇒ 报错「**不能把本人指定为自己的父 / 子 / 配偶**」、**无确认行、提交按钮不可用**（口径 = §11-2 F-6） |
| **4** | **提交闸门与只挂接** | 解析成功前「确认添加」恒 `disabled`；解析成功后可提交，且**只挂接既有节点、不新建**（口径 = §11-2 F-2 / F-7） |
| **5** | **小程序主包 ≤ `2 MiB`（含 `static/` 口径 · 硬 · 必测）** | 重测 `python3 frontend/scripts/mainpkg_bytes.py dist/build/mp-weixin` ⇒ `main_package_bytes` **≤ 2,097,152**（`over_2MiB_by ≤ 0`）；**口径 = 含 `static/`**（**沿用既有判据** = 本册 §74-2 判据 1 / §72-2 判据 5 的同一条；**本册不预填读数**） |
| **6** | **不动面（回归）** | `cloudfunctions/**` / `config/**` / `migrate-output/**` 的 `git diff --numstat` ⇒ **0 条**；**云函数产物未变更**（本批无重打包 · 与本节 ① 同源） |

- **判据 1–4 的证据指针**：**开发期真机读数已在 `docs/id-system.qa.md` §⑫**（**Zang 真实浏览器补测**：三颗按钮 / placeholder 实际渲染文本 / 三分支文案 / 短形态等价 / 自身防护 / 离开新档复位，**逐字读数**）—— **⚠️ 该读数出自浏览器窗口（H5 侧）**，**小程序侧与真机（微信开发者工具）读数仍未取**（见 §79-3）。
- **⚠️ 阈值方向（硬）**：**判据 5 为 `≤` 上限**，**不得与「≥」类混写**（承 §72-2 / §73-2 / §74-2 同款）；**判据 6 为「零改动」类**，方向相反。

### §79-3 未实测 / 待办（**如实登记 · 不得写成已验证**）

- **本批未上云**（本清单只登记动作与判据；**读数位由执行 / 质检收口后回写**）；
- **☐ 未测面（硬 · 必须明写）**：**登录态档位下的两通道可见性读数**（本树搜索 / 全站搜索）与 **云真源 `legacy_gramps_id` 存在性** = **均未实测**（= `docs/id-system.qa.md` §⑨ NOT_MEASURED 尚存两项；第三项「与规范文本一致性」随 `docs/id-system.spec.md` **§11** 入册而覆盖）；
- **小程序侧未重打、主包体积未重测**（判据 5 读数位留空；并入既有「⬜ 待办 2」）；
- **线上 H5 未逐片确证**（承 §69-1 ③ / §70-4 / §71-5 / §72-5 / §73-3 / §74-3 同款：Vercel 构建分片 ⇒ **以 push 触发构建为准**）；
- **member / guest 视角未测** · **真机 / dpr > 1 / 字体回退未测**（承 §71-5 / §72-5 / §73-3 / §74-3）；
- **已知边界随批挂账（口径真源 = `docs/id-system.spec.md` §11-5）**：**树内历史编号（旧号）仍无法挂接**（本批只消除误报）· **持邀请码者「列表可见、搜索搜不到」为既有不对称、非本批引入** · **在飞时离开新档再立刻回档会回填（已裁定接受 · 本批口径由 Zang 裁定，尚未经 Kevin 逐条确认）** · **范围外挂账：「从树中选择」与「批量添加」两档 `await` 后无档位守卫、批量档提交期间档位按钮未禁用（本批不动）**。

### §79-4 与既有条目的关系 ＋ 登记面与边界（**硬**）

| # | 对象 | 关系 |
|---|---|---|
| **①** | **本册 §74（两批纯前端同单登记）** | **继续有效**；**本节 ①②③ 与其同款**（纯前端 ⇒ **云函数不适用 ＋ 两产物重打 ＋ 主包重测**）⇒ **可并入同批重打**；**⚠️ 其 ① 与本节 ① 同为「无需重打包」，不得据之免掉他节的云函数动作** |
| **②** | **本册「⬜ 待办 2：小程序产物重打」** | **继续有效**（本节 ③ 只是**把本批并入该待办**；**该待办条目字面不动**） |
| **③** | **本册 §72-1 / §73-1 / §77-1 / §78-1（云函数重打包 ＋ 部署）** | **一律继续有效、各自待办**；**本节不取代任何旧节**，**亦不得据本节免掉那几节的动作**（**节间只登记差异、不互推**） |
| **④** | **提交 rev 位** | **留待回写**（**本批未提交** ⇒ 提交后由**派单方**回写本批 rev；**不得预填任何不存在的 sha** · 承 §76 / §77 / §78 的表头体例） |

- **提交 rev 回写（**2026-10-16 · Zang 记 · 只追加**）**：本批已**本地入库 rev = `c6dc930`**（提交信息逐字含「本地入库、未部署」）；**未推送、未部署** ⇒ **本节 ①②③ 的动作面（H5 重建部署 / 小程序重打上传 / 主包重测）一件都还没做**。**上表 ④「留待回写 · 本批未提交」登载的是入库动作发生之前的时点，自本行起失效**（**原文保留、不回改**）；上云后的执行读数**仍待回写**。

- **登记面**：`docs/PENDING_DEPLOY.md` 本节 ＋ `docs/id-system.spec.md` **§11**。
- **本登记 = 纯文档入册单**：**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档**；**本登记本身未跑构建 / 未跑测试 / 未部署 / 未 `git add` / 未 `commit` / 未 `push`**，仅登记已实现的动作面与判据。

---

## §80 编号口径「甲」（`gramps_id` 标识**人** · **镜像不铸号**）批 上云登记（**云函数 `compat-api` 重打包（`esbuild`）＋ 部署** · **存量修正脚本 apply（含备份与逐条读回）** · **数据面：无新集合 · `jiapu_id_seq` 只抬不降 · 已铸号不回收** · 口径真源 = `docs/id-system.spec.md` **§12（A-1 ~ A-7）** · **2026-10-16 · 只追加 · 不改 §0–§79 任何行**）（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§80**（前节 = **§79**；现证 = `grep -n '^## ' docs/PENDING_DEPLOY.md | tail` ⇒ 末节 = `## §79 「指定 ID」档…`，`^## §80` 命中 **0**）—— **若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面**。
> **性质**：本节 = **编号口径「甲」批的上云动作登记**（口径真源 = `docs/id-system.spec.md` **§12**：A-1 `gramps_id` 标识人 · A-2 镜像不铸号 · A-3 人级唯一性 · A-4 计数器只抬不降 · A-5 真身优先 + 镜像标注 · A-6 存量修正 · A-7 不变项）。
> **状态词（硬）**：**已定口径、待实现** —— **实现与存量修正均未落盘** ⇒ **不得**写成「已实现 / 已部署 / 已上线 / 已验收」。
> **本阶段不上云、只登记**；**本清单只登记上云动作与判据 · 不预填读数**（产物 md5 / 镜像条数 / 脚本运行读数 / 冒烟读数一律以执行侧实际输出为准）；**登记 ≠ 已执行 / 已验证**。

### §80-1 上云动作（**清单 · 待执行**）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **云函数 `compat-api`** | **重打包（`esbuild`）＋ 部署** —— 本批含**后端口径改动**（A-2 镜像不铸号 / A-5 取记录 / 报错与巡检路径）⇒ **必须重打包 ＋ 部署**（产物 md5 与 `tcb fn detail` 修改时间**待回写**）。**⚠️ 与 §79-1 ① 的「无需重打包」相反，属不同批、不得互推**。（**落笔时工作区现证**：`cloudfunctions/compat-api/index.js` / `lib/founder-attach.js` / `lib/founder-attach.test.js` **已有在途未提交改动** ⇒ 与本节「必须重打包」一致；**未提交、未打包、未部署**） |
| **②** | **存量修正脚本（`--apply`）** | **步骤（顺序硬）**：**dry-run** → **备份**（备份目录 + `MD5-LEDGER` / `summary`）→ **`--apply`** → **逐条读回**（现证样本两条：`ji_23395` 世系链镜像读回 **`000000100`** · 登记镜像读回 **`000000209`**；`tree-meta.trees.ji_23395.founder_gramps_id` 读回 **`000000209`**）。脚本须**幂等、可重放**、**先跑副本校验再上真源**（承 `docs/id-system.spec.md` §9-4 第 4 条）；**已铸号不回收**（A-4） |
| **③** | **数据 / 真源面** | **无新集合**（`jiapu_id_seq` **既不新增集合、亦不重置** ⇒ **只抬不降**）；随 A-6 **就地改写**镜像 `gramps_id` ＋ 祖谱 `founder_gramps_id`（**全量清单以脚本产出**）；**`handle` / 详情键 / 家庭编号一字不动**（A-7）；上传脚本 `COLLECTIONS` 名单**不动** |
| **④** | **前端面（H5 / 小程序）** | **以实现单改动面为准 · 本册不预判**：若实现含前端改动（「镜像 · 源自 <树名>」等标注面）⇒ **H5 重建部署 ＋ 小程序重打并上传**（并入既有「⬜ 待办 2」）；**若纯后端 ⇒ 前端零改动**（届时本节判据 1–4 只走 API 冒烟） |
| **⑤** | **文档面** | `docs/id-system.spec.md` **§12** ＋ `docs/clan-tree.spec.md` **§14**（图上编号标注同源）＋ 本节（**本单只改这三个文档**） |

### §80-2 部署后判据（**阈值 / 样本写死 · 命令面不预填读数**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **镜像不铸号（冒烟 · 硬）** | 线上新建任一镜像记录 ⇒ 其 `gramps_id` **等于真身 `gramps_id`**，且 `jiapu_id_seq` 的 `next` **与操作前相等（零抬升）**（A-2 / A-4） |
| **2** | **真身编号取不到 ⇒ 拒绝创建** | 构造真身编号缺失 ⇒ **创建失败并报错**，且**三处零写入**（树 JSON / 详情档 / 计数器）（A-2） |
| **3** | **取记录口径（A-5 · 硬）** | 同一编号命中多条 ⇒ 返回**真身**；本树仅镜像 ⇒ 返回**本树那条** ＋ 标注「**镜像 · 源自 <树名>**」；**同一编号两条真身 ⇒ 巡检报错** |
| **4** | **存量修正逐条读回（硬）** | `ji_23395` 两镜像分别读回 **`000000100`** / **`000000209`**；`tree-meta.trees.ji_23395.founder_gramps_id` 读回 **`000000209`**；`jiapu_id_seq` **未下降、未回收** |
| **5** | **不变项回归（零改动类）** | `handle` 口径 · `mir_<上层 handle>` 派生 · 详情键 `tree_id:handle` · 家庭 `F` + 6 位体系 **逐项不变**（`git diff --numstat` 对 `config/**` / 详情键命名 ⇒ 除 A-6 授权面外 **0 条**） |
| **6** | **云端回读（重传面）** | 受影响树 JSON 的云端 md5 **== 本地**（逐树；口径 = §77 / §78 同款） |

- **⚠️ 方向（硬）**：判据 1–4 为**样本 / 阈值写死类**，判据 5–6 为**零改动 / 一致性类** —— **不得混写**。
- **现证样本（取自 `docs/id-system.spec.md` §12-3 / §12-4）**：季行父 真身 `zhonghua 000000100` ↔ 世系链镜像 `ji_23395 000000162`；季花 真身 `ji_23395_01 000000209` ↔ 登记镜像 `ji_23395 000000163`。

### §80-3 未实测 / 待办（**如实登记 · 不得写成已验证**）

- **本批未上云**（本清单只登记动作与判据；**读数位由执行侧收口后回写**）；
- **实现未落盘（在途 · 未提交）**（口径真源已入册 ⇒ 代码面归实现单；**落笔时工作区现证**：`cloudfunctions/compat-api/index.js` / `lib/founder-attach.js` / `lib/founder-attach.test.js` 已有在途改动，**未提交、未打包、未部署**）；报错文案 / 巡检报错形态 / 「指定 ID」命中多条分支 **一律归实现单，本册不预填**；
- **全站镜像清单与逐条修正表未产出**（本册只给两条现证样本，**条数以脚本产出为准**）；
- **存量修正脚本未编写 / 未 dry-run / 未 apply**（备份目录路径亦未定 ⇒ **不预填**）；
- **未跑构建 / 未跑测试 / 未打包 / 未部署**；**小程序与真机读数未取**；
- **待裁（不阻塞本批）**：`legacy_gramps_id` 是否随 A-6 一并留痕（现口径**不动**该字段）= `docs/id-system.spec.md` §12-8 第 ③ 条。

### §80-4 与既有条目的关系 ＋ 登记面与边界（**硬**）

| # | 对象 | 关系 |
|---|---|---|
| **①** | 本册 **§72-1 / §73-1 / §77-1 / §78-1（云函数重打包 ＋ 部署）** | **一律继续有效、各自待办**；**本节不取代任何旧节**，**亦不得据本节免掉那几节的动作**（**节间只登记差异、不互推**） |
| **②** | 本册 **§79（纯前端 ⇒ 无需重打包）** | **继续有效**；**其 ①「无需重打包」不适用于本节、本节 ①「必须重打包」不适用于其** ⇒ **两节互不替代** |
| **③** | **本册 §74 / §79 的「小程序产物重打」待办** | **继续有效**（本节 ④ 若成立则**并入同一待办**；**该待办条目字面不动**） |
| **④** | **提交 rev 位** | **留待回写**（**本批未提交** ⇒ 提交后由**派单方**回写；**不得预填任何不存在的 sha**） |

- **登记面**：`docs/PENDING_DEPLOY.md` 本节 ＋ `docs/id-system.spec.md` **§12**（＋ `docs/clan-tree.spec.md` **§14** 的编号标注同源面）。
- **本登记 = 纯文档入册单**：**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档**；**未跑构建 / 未跑测试 / 未打包 / 未部署 / 未 `git add` / 未 `commit` / 未 `push`**；**零真源写入**。

### §80-5 追记 · 上云动作面**上扩**（顶端镜像段 ＋ 其余三处铸造点的存量修正）＋ **「既有断言改锚」= 随批交付项**（**2026-10-16 · 只追加 · 不改 §80-1 – §80-4 任何行**）（Zang 制度员）

> **性质（只追加）**：本追记**只追加**；**§80-1 – §80-4 既有行原文一律保留、一字不改、一行不删**（承 `AGENTS.md` §0-4）。**口径真源 = `docs/id-system.spec.md` §12（含 §12-9 范围清尾）**。
> **归属（硬 · 分线 · 不得混写）**：**编号口径方向「甲」= Kevin 2026-10-16 拍定**；**范围与清尾口径 = Zang 裁定**（**标「一句话可改」**）。**登记 ≠ 已执行 / 已验证**；**不预填读数**（条数 / 行数 / md5 / 备份目录名 / 断言命中数一律以执行侧现证为准）。

- **① 存量修正动作面（上扩 · 逐条）**：**原动作面**（§80-1 ② 与 §80-2 判据 4 的样本面）= **登记镜像**；**现行动作面 = 登记镜像 ＋ 祖谱顶端镜像段 ＋ 其余三处铸造点（镜像子女 / 跨树婚姻镜像 / 立支路径：新树始祖镜像 ＋ 登记镜像）**，**一律同一步骤顺序**：**dry-run → 备份（备份目录 ＋ `MD5-LEDGER` / `summary`）→ `--apply` → 逐条读回**。脚本须**幂等、可重放**、**先跑副本校验再上真源**（承 `docs/id-system.spec.md` §9-4 第 4 条）；**已铸号不回收**（A-4）；**`jiapu_id_seq` 只抬不降**；**`handle` / 详情键 / 家庭编号一字不动**（A-7）。
  - **范围真源（逐条）** = `docs/id-system.spec.md` **§12-9（一）（二）**：**已落地 = 宗谱登记镜像**；**本轮在途 = 祖谱顶端世本镜像段 · 镜像子女 · 跨树婚姻镜像 · 立支路径（新树始祖镜像 ＋ 登记镜像）**。
  - **⚠️ 全量清单与逐条修正表 = 实现单以脚本产出**（本册**不预填**条数 / 行数 / md5 / 备份目录路径）。
  - **⚠️ 扩面前提（如实登记 · 硬）**：**其余铸造点的「新增侧」须先按其路径落地（A-2）**，**存量与新增口径一致**后方可纳入同一次 `--apply` —— 否则会出现「**存量已改、新增仍铸号**」的两套口径并存。**落地顺序与覆盖清单 = 实现单**；本册**只登记前提**，**不预填覆盖率**。
- **②「既有断言改锚」= 随批交付项（硬 · 登记为交付项，非可选）**：本批为**口径变更**（镜像 `gramps_id`：自铸号 → 真身号）⇒ 既有**硬编码镜像编号字面**的测试断言 / 夹具**随批同步改锚**（**改为新编号字面**，**或改用 `resolveNode` / `personIdDisplay` 之兼容断言**；承 `docs/id-system.spec.md` **§9-5 交付要求** ＋ **§8 第 3 条**）。
  - **理由（逐字登记 · 硬）**：**改锚的理由 = 口径变更（A-2 / A-6），非放宽** —— **不得**写成「测试放宽 / 断言弱化 / 跳过 / 忽略」；**改锚后判据强度不变**（同一不变量仍须为真）。
  - **交付面**：改锚件**随本批同一提交交付**（**不得**留作后续批次挂账）；**涉及文件与命中数 = 实现单以现证产出**（本册**不预填**）。
- **③ 判据面（不互推）**：§80-2 判据 **1–6 继续有效**（**原行字面不动**）；本追记**只扩动作面与交付面**，**不新增阈值、不改任何阈值方向**；**读数位仍留空**（执行侧收口后回写）。
- **④ 与既有条目的关系**：本追记**不取代任何旧节**；§80-1 ② 的「两条样本逐条读回」**继续有效**（样本不变），**其外扩面以本追记 ① 为准**；§80-3 所列「全站镜像清单与逐条修正表未产出 / 脚本未编写」**继续为待办**（**字面不动**）。
- **⑤ 边界（硬）**：本追记 = **纯文档追加**；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档**；**未跑构建 / 未跑测试 / 未打包 / 未部署 / 未 `git add` / 未 `commit` / 未 `push`**；**零真源写入**。

### §80-6 执行回写 · 上云窗口实测（**云函数重打包 ＋ 部署** · **存量镜像编号 `--apply`（**写云端真源**）** · **独立回读** · **判据逐条回写**）（**2026-10-16 · 只追加 · 不改 §80-1 – §80-5 任何行**）（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§80-6**（**落笔前现证** = `grep -n '^### §80-6' docs/PENDING_DEPLOY.md` ⇒ 命中 **0**；**前节 = §80-5**，现证 = **1145**）。**若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面**。
> **性质（只追加）**：本追记**只追加**；**§80-1 – §80-5 既有行原文一律保留、一字不改、一行不删**（承 `AGENTS.md` §0-4）。**口径真源 = `docs/id-system.spec.md` §12（A-1 ~ A-7）**。
> **归属（硬 · 分线 · 不得混写）**：**上云执行 = Zang**（**Kevin 2026-10-16 放行「现在全做」** —— 放行覆盖：**云函数重打包 ＋ 部署 → 存量编号 apply → H5 重打上线 → 小程序产物**）。**不得**写成 Kevin 亲自执行。
> **读数纪律（硬）**：本追记读数**逐字照抄执行侧现证 / 派单方实测**（**派单方实测者逐条标注**），**未改写、未推算**；**「未测」一律明写未测**（判据 **1 / 2**）；**不预填任何未知读数**。

- **① 云函数 `compat-api` 重打包 ＋ 部署（已执行 · Zang）**
  - **重打包命令（逐字）** = `frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js`。
  - **产物** = `cloudfunctions/deploy/compat-api/index.js` · **`1,617,760` B** · md5 **`352e90beeca40726156f839fb191679a`**（**Jing 落笔前现证复核同值**：`ls -l` ＋ `md5 -q`）。
  - **产物内含新口令（Jing 现证 `grep -c`）** = `mirrorGrampsIdOfTrueBody` / `pickByIdentity` / `is_mirror` / `mirror_source_title` / `remount-founder` **均在位**。
  - **部署命令（逐字）** = `tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c` —— **交互确认需送 `y`**；**本次实测：不送 `y` 那么不部署**（**如实登记该坑**）⇒ **成功**。
  - **部署指纹（本单现取 · 只读探针）** = `tcb fn detail compat-api -e liwu-d8gek6jjdab1d087c` ⇒ **状态 = 部署完成** · **代码大小（B） = `6,345,767`** · **修改时间 = `2026-10-16 20:56:00`**（**对照 §76-7 / 勘误 22 ⑦ 登记的 `2026-10-15 10:23:44` / `6,331,536` B ⇒ 已换版**；**旧行原文不动**）。**环境变量现证** = `MASTER_TREE_ID=zhonghua; COMPAT_SOURCE=cloud`（**未变**）。
  - **线上新码指纹（派单方实测）** = `POST https://liwu-d8gek6jjdab1d087c.service.tcloudbase.com/api/admin/remount-founder`（**空 body**）⇒ **HTTP `400`** ＋ **`{"error":"缺少 tree_id 或 registration_handle"}`** ⇒ **新路由已在场**。

- **② 存量编号 `--apply`（已执行 · **写云端真源** · Zang）**
  - **命令（逐字）** = `node scripts/fix-mirror-gramps-ids-2026-10-16.mjs --source=cloud --apply --backup-dir=$HOME/jiazu-backups/2026-10-16-mirror-renumber` ⇒ **退出码 `0`**（**脚本现证** = `scripts/fix-mirror-gramps-ids-2026-10-16.mjs` · **77,174 B**）。
  - **写路径（硬 · 不得写成同路径覆盖写）** = **生产 `lib/store.js#saveTree` / `#mutateTreeMeta`（方案 A：版本化新对象 ＋ CAS 重指 `_meta.storage_files` ＋ 清扫）** —— **不是**同路径覆盖写；**读回可见全新对象**（如 `trees/qin_31206/v5.json` / `trees/shen_27784_01/v29.json` / `trees/long_40857_01/v7.json`）（**与 §78 方案 A 同源**）。
  - **修正面（逐条）** = **33 条镜像**（**祖谱顶端世本镜像段 5** ＋ **宗谱登记镜像 3** ＋ **镜像子女 3** ＋ **跨树婚姻镜像 22**）＋ **`tree-meta` 3 处** ＋ **树 JSON 顶层 3 处**。
  - **历史漂移 · 不动 2 条** = `gu_39038` / `ji_23395` **顶层 = `000000001`**（**不动**）。
  - **撞号断言** = **同人双记录 0 组 · 违规 0 组**。
  - **`jiapu_id_seq` 未写**（**只抬不降 · 已铸号不回收**，A-4）。
  - **备份** = `~/jiazu-backups/2026-10-16-mirror-renumber/`（`MD5-LEDGER.txt` **20 行** · `summary.json`（含 `file_id_before` 与 `rollback` 配方）· `trees/` 目录 · `tree-meta/` 目录）。**Jing 现证实测**：`trees/` 内 `.json` = **17 项** · `tree-meta/` 内 `.json` = **3 项** · 备份目录内文件合计 = **22**（17 ＋ 3 ＋ ledger ＋ summary）。**⚠️ 如实登记差异（硬）**：派单原记「**`trees/` 18 项**」，**本单现证 = 17 项** ⇒ **一律以现证为准**（**派单原值原文保留**）。

- **③ 派单方独立回读（不信脚本自报 · 亲跑）**
  - `GET /tree-meta` ⇒ `ji_23395.founder_gramps_id` = **`000000209`**（季花）· `gu_39038` = **`000000143`** · `qin_31206` = **`000000275`**。
  - `GET /admin/clan-info?tree_id=ji_23395` ⇒ **顶端镜像** `mir_103ff661b13b19b0f44c89cbe2f7` 的 `gramps_id` = **`000000100`**（**原 `000000162`**）· **支系 `ji_23395_01` 始祖 `000000209` 季花 58 人**。
  - **生产** `GET /api/search/global?query=000000100` ⇒ 返**真身**（`zhonghua` `103ff661b13b19b0f44c89cbe2f7` · `is_mirror:false` · `mirror_source_title:""`）⇒ **§80-2 判据 3（真身优先）生产实测 PASS**。
  - **本单独立现证（Jing 只读复跑 · 与上列同值）** = `GET /tree-meta` ⇒ 三树 `founder_gramps_id` = **`000000209`** / **`000000143`** / **`000000275`**（HTTP **200**）；`GET /admin/clan-info?tree_id=ji_23395` ⇒ `mirrors[0].gramps_id = 000000100`（季行父）· `branches[0]` = `ji_23395_01` / 始祖 **季花** / **`000000209`** / **58**（HTTP **200**）；`GET /api/search/global?query=000000100` ⇒ 真身串**逐字同上**（HTTP **200**）。

- **④ 判据逐条回写（PASS / 未测 分写 · 不得混写）**

| # | §80-2 判据 | 回写 |
|---|---|---|
| **1** | 镜像不铸号（线上新建冒烟 · 硬） | **未测** —— 需**登录态**线上新建镜像；**未跑 ⇒ 不得写成已验证** |
| **2** | 真身编号取不到 ⇒ 拒绝创建 | **未测** —— 需**构造真身无号**；**未跑 ⇒ 不得写成已验证** |
| **3** | 取记录口径（A-5 · 真身优先） | **PASS** —— **生产实测**（见 ③：`GET /api/search/global?query=000000100` 返真身） |
| **4** | 存量修正逐条读回（硬） | **PASS** —— **逐条读回全绿**（见 ② / ③）；`jiapu_id_seq` **未下降、未回收** |
| **5** | 不变项回归（零改动类） | **本追记未回写** —— 派单**未给读数**（`handle` / 详情键 / 家庭编号口径**按脚本设计不动**，**未逐项现证**）⇒ **不预填、不推算** |
| **6** | 云端回读（重传面） | **本追记未回写** —— **云端 md5 逐树对拍未在本行跑** ⇒ **不预填**（**② 的版本化新对象读回**只作形态旁证，**不得据之写成已验证**） |

- **⑤ 提交链 ＋ 边界（硬）**
  - **提交链（现证 = `git log -1 --format='%H %ci %s'`）** = **`6609534`**（代码面 · **2026-10-16 20:55:25**）→ **`5bb973a`**（产物 · **20:55:25**）→ **`f1c5ae3`**（质检证据入册 · **20:59:20**）→ **`380c0d2`**（存量修正脚本 · **21:09:29**）。
  - **落笔时现证** = `git status --porcelain` ⇒ **空**（工作区干净）；`git rev-parse origin/main` ⇒ **`5bb973abe752799947128e5248823ea891c73362`** ⇒ **`6609534` / `5bb973a` 已在 `origin/main`**；**`f1c5ae3` / `380c0d2` 现证未随 `origin/main`**（**以现证为准**；**派单口径「后续另有 `f1c5ae3` / `380c0d2`」原文保留**）。
  - **本追记 = 纯文档追加**：**未改任何代码 / 真源 / `config/` / `docs/*.qa.md` / 其它文档**；**未跑构建 / 未跑测试 / 未打包 / 未部署 / 未 `git add` / 未 `commit` / 未 `push`**。
- **⑥ 未测 / 待办（如实登记 · 不得写成已验证）** = §80-2 判据 **1 / 2**（需登录态 / 需构造真身无号）· 判据 **5 / 6**（未给读数）· **§80-5 ②「既有断言改锚」的逐件命中数**（**归实现单**，本行**未回写**）· **全站镜像清单的逐条全量对账表**（**§80-3 所列该待办字面不动**；本行**只登读数**）。

---

## §81 祖谱首页**总图呈现**批（**①③ 段不再列 · 上游镜像段 ＋ 本宗自有世代 ＋ 下游支系登记镜像并入同一张谱系图 · 全树根构图**）上云登记（**纯前端** ⇒ **云函数 `compat-api` 无需重打包（本批无后端改动）** · **H5 重建部署 ＋ 小程序重打并上传** · **判据 = 全树根构图同图成链可见 ＋ 家族树 / 总谱档谱系图行为逐字不变 ＋ 功能保留清单五条在位 ＋ 小程序主包 ≤ `2 MiB`（含 `static/` 口径）** · **无新集合 · 真源零写入（祖谱 `founder_handle` / `founder_gramps_id` 均不改）** · 口径真源 = `docs/clan-tree.spec.md` **§14** · **2026-10-16 · 只追加 · 不改 §0–§80 任何行**）（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§81**（前节 = **§80**；现证 = `grep -n '^## ' docs/PENDING_DEPLOY.md | tail` 在 §80 入册后 ⇒ 末节 = `## §80 编号口径「甲」…`，`^## §81` 命中 **0**）。
> **性质**：本节 = **祖谱首页总图呈现批**的上云动作登记（口径真源 = `docs/clan-tree.spec.md` **§14**：①③ 段不再列 · 三者并入同一张谱系图 · **全树根构图** · 功能保留清单五条）。
> **状态词（硬）**：**已定口径、待实现**（**呈现形态 = Kevin 2026-10-16 当面裁定**；实现细节与功能保留清单 = Zang 补齐）⇒ **不得**写成「已实现 / 已上线 / 已验收」。
> **本阶段不上云、只登记**；**只登记动作与判据 · 不预填读数**（产物 md5 / 主包体积 / 真机读数一律以执行侧实际输出为准）；**登记 ≠ 已执行 / 已验证**。

### §81-1 上云动作（**清单 · 待执行**）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **云函数 `compat-api`** | **无需重打包、无需部署**（**本批零后端改动** —— 全部落在 `frontend/src/components/clan-hall/**` 与 `frontend/src/business/pedigree.ts` 侧的**读侧构图**）。**⚠️ 与 §80-1 ① / §77-1 / §78-1 的「重打包 ＋ 部署」相反，属不同批、不得互推** |
| **②** | **H5（重建部署）** | 一次 `npm run build:h5`（带 `VITE_API_BASE`）；**现行部署模型 = 随 `main` push 自动构建上线**（`frontend/vercel.json` 的 SPA `rewrites` 不动）；旧 H5 缓存窗口风险同款 = §69-4 / §70-4 / §71-5 / §72-5 / §73-3 / §74-3 / §79-1 ② |
| **③** | **小程序（重打并上传）** | 一次 `build:mp-weixin` ＋ **微信开发者工具上传**（**并入既有「⬜ 待办 2：小程序产物重打」合并重打**）；**本批为 H5 与小程序两平台通用**（祖谱页 `clan-hall` 两平台共用）⇒ **两产物均须重打**，**不重打则线上仍是三段版式** |
| **④** | **数据 / 真源面** | **无新集合 · 无数据修正 · 真源零写入** —— **祖谱 `tree-meta.founder_handle` / `founder_gramps_id` 是数据真源、本批不改**；`config/` / 树 JSON / 详情档 / 云存储**均不动**；上传脚本 `COLLECTIONS` 名单不动 |
| **⑤** | **文档面** | `docs/clan-tree.spec.md` **§14**（规格真源 · 本单入册）＋ 本节 |

### §81-2 部署后判据（**真机 / 目视 ＋ 阈值写死 · 命令面不预填读数**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **同图成链（祖谱页 · 硬）** | 打开 `/z/<tree_id>`（现证样本 = 季氏祖谱 `ji_23395`）⇒ 谱系图内**上游世本镜像段 ＋ 本宗自有世代 ＋ 支系登记镜像同图可见**（样本：`季行父 000000162`（zhonghua 镜像）→ 其子 `季花`（ji_23395 登记镜像 · 真身 `ji_23395_01 000000209`）**同图成链**） |
| **2** | **①③ 段不再列** | 原 ①段「世系链」与 ③段「支系入口列表」的**列表 / 卡片不再渲染**；同一批节点在页面内**只呈现一次**（图内）（口径 = §14-1 第 1 条） |
| **3** | **家族树 / 总谱档逐字不变（回归 · 硬）** | 家族树（`kind='family'`）与世本（`kind='master'`）的谱系图**行为不变**：`founderGrampsId` 截断**照旧**、`excludeChildMirrors` 判定**照旧**（口径 = §14-4 第 1 条） |
| **4** | **功能保留清单五条在位（逐条）** | ① 支系家族树打开入口 ＋ 人数统计落在图上**下游登记镜像节点**；② **「文献地址」卡**在位；③ 上游镜像节点**「只读 · 来源树」角标**在位；④ 支系空态文案（含「**暂无家族树认本祖谱为祖。**」）在位；⑤ **三类节点视觉可辨** ＋ **点击行为分行**（镜像 → 打开真身档案） |
| **5** | **落点标注（硬）** | 下游支系登记镜像标注「**挂于 <落点节点名（编号）> 之下**」；**取不到父 ⇒「未挂落点」** |
| **6** | **小程序主包 ≤ `2 MiB`（含 `static/` 口径 · 硬 · 必测）** | 重测 `python3 frontend/scripts/mainpkg_bytes.py dist/build/mp-weixin` ⇒ `main_package_bytes` **≤ 2,097,152**（`over_2MiB_by ≤ 0`）（**沿用既有判据** = §74-2 判据 1 / §79-2 判据 5 同一条；**本册不预填读数**） |
| **7** | **不动面（回归）** | `cloudfunctions/**` / `config/**` 的 `git diff --numstat` ⇒ **0 条**；**云函数产物未变更**（与本节 ① 同源） |

- **⚠️ 阈值方向（硬）**：判据 6 为 `≤` 上限，**不得与「≥」类混写**；判据 3 / 7 为「零改动」类，方向相反。
- **与 §80 批的交互（登记 · 不互推）**：若 §80 批的存量修正先落地，则祖谱页图上镜像编号随 A-6 变化（`000000162` → `000000100`、`000000163` → `000000209`）—— **那属 §80 面，本节不承担**；本节判据 1 以**执行时点真源编号**读回为准。

### §81-3 未实测 / 待办（**如实登记 · 不得写成已验证**）

- **本批未上云**；**实现有在途未提交改动**（`frontend/src/components/clan-hall/clan-hall.vue` · `components/tree-pedigree/tree-pedigree.vue` · `business/pedigree.ts` 三处**读侧构图** —— **未提交 / 未打包 / 未部署**）⇒ **线上仍是三段版式**，全部判据**读数位留空**；
- **小程序侧未重打、主包体积未重测**（判据 6；并入既有「⬜ 待办 2」）；
- **真实登录态真机点击未跑**（下游登记镜像节点的**菜单 / 副标入口**、角标、空态、点击分行 = 均未取真机读数）；
- **线上 H5 未逐片确证**（承 §69-1 ③ / §70-4 / §71-5 / §72-5 / §73-3 / §74-3 / §79-3 同款：Vercel 构建分片 ⇒ **以 push 触发构建为准**）；
- **待裁 / 待定稿（不影响本节动作面）**：三类节点视觉样式与角标形制 · 「文献地址」卡取「原位」还是「图上方工具区」· 统计栏文案是否随图改口（口径真源 = `docs/clan-tree.spec.md` §14-7）。

### §81-4 与既有条目的关系 ＋ 登记面与边界（**硬**）

| # | 对象 | 关系 |
|---|---|---|
| **①** | 本册 **§74（两批纯前端同单登记）/ §79（纯前端）** | **继续有效**；**本节 ①②③ 与其同款**（纯前端 ⇒ 云函数不适用 ＋ 两产物重打 ＋ 主包重测）⇒ **可并入同批重打**；**⚠️ 三节的 ① 同为「无需重打包」，不得据之免掉他节的云函数动作** |
| **②** | 本册 **「⬜ 待办 2：小程序产物重打」** | **继续有效**（本节 ③ 只是**把本批并入该待办**；**该待办条目字面不动**） |
| **③** | 本册 **§80（编号口径批 · 云函数重打包 ＋ 部署）** | **各自待办 · 互不替代**（本节纯前端、§80 含后端） |
| **④** | **提交 rev 位** | **留待回写**（**本批未提交** ⇒ 提交后由**派单方**回写；**不得预填任何不存在的 sha**） |

- **登记面**：`docs/PENDING_DEPLOY.md` 本节 ＋ `docs/clan-tree.spec.md` **§14**。
- **本登记 = 纯文档入册单**：**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档**；**未跑构建 / 未跑测试 / 未打包 / 未部署 / 未 `git add` / 未 `commit` / 未 `push`**；**零真源写入**。

### §81-5 追记 · 呈现批**可达性判据** ＋ 两处文案裁定（**撤「文献地址」卡清单项** · **统计栏「始祖」= 数据口径**）（**2026-10-16 · 只追加 · 不改 §81-1 – §81-4 任何行**）（Zang 制度员）

> **性质（只追加）**：本追记**只追加**；**§81-1 – §81-4 既有行原文一律保留、一字不改、一行不删**（承 `AGENTS.md` §0-4）。**口径真源 = `docs/clan-tree.spec.md` §14**（**本单不改该册** —— 其 §14-3 内同款条目的就地收口归后续批次）。
> **归属（硬 · 分线 · 不得混写）**：**呈现侧三件（可达性判据 / 撤「文献地址」卡 / 统计栏「始祖」口径）= Zang 裁定**；**呈现形态本体 = Kevin 2026-10-16 当面裁定**（承本节前言）。**不得**写成「Kevin 亲自逐条拍定」实现细节。
> **不预填读数**（产物 md5 / 主包体积 / 真机读数一律以执行侧现证为准）；**登记 ≠ 已执行 / 已验证**；**上云动作面不变**（仍 = §81-1 ① 纯前端、云函数 `compat-api` 无需重打包）。

- **① 可达性判据（新增 · 硬 · 真机可判 · 触屏可发现性）**：**支系家族树首页入口必须有不依赖右键 / 长按的可见可点入口**。
  - **判据句（可判）**：**真机（触屏）**打开祖谱页 `/z/<tree_id>` ⇒ **不执行任何右键 / 长按 / 悬停**操作，即**目视可见**并**可单击**进入某一支系家族树首页的入口；**入口只藏在右键菜单 / 长按菜单 / 悬停浮层内 ⇒ 判未达标**。
  - **落点（口径 · 同源）**：入口仍落在图上**「下游登记镜像节点」**（承 §81-2 判据 4 ① / `docs/clan-tree.spec.md` §14-3 一）—— 本判据**只加「可见可点」这一可发现性要求**，**不改落点、不改点击分派的既有口径**。
  - **⚠️ 与 §81-2 判据 4 ① 的关系（登记 · 不互推）**：判据 4 ①「在位」**继续有效**（**原行字面不动**）；本判据是其**可发现性细化**。**菜单 / 副标的交互形态与样式 = 实现单定稿**（本册不预填）。
- **② 撤项：「文献地址」卡（**该项系上一版清单误列 ⇒ 已撤**）**：**原 ①段无「文献地址」卡** ⇒ **§81-2 判据 4 ② 所记「『文献地址』卡 在位」系上一版清单误列 ⇒ **本追记撤回该项**（**该行原文一律保留、不回改**，承 §0-4；**取代语义自本行起**）。
  - **现证（落笔前 · HEAD 版）**：`git show HEAD:frontend/src/components/clan-hall/clan-hall.vue` ⇒ **①段模板 = `:51`–`:87`**（①段注释 `:51`、段头文案 `:54`，段体至 `:87`），**其内无任何「文献地址」字样**；该文件内「文献地址」现证 = `:185`（**「编辑祖谱信息」弹窗内表单 label**，非段内卡片）。⇒ **「文献地址」不是 ①段 / ③段的呈现项**。
  - **实际呈现面（登记 · 归实现单）**：文献地址的呈现 = `tree-meta.archive_url` **渲染行**（**有值才出**；缺省 / 空白 ⇒ 不渲染）⇒ **不属本批「①③ 段不再列」的取材面**；其**去留与位置 = 实现单定稿**。本册**只登记「清单误列已撤」这一裁定**，不代该册改动。
- **③ 统计栏「始祖」= 数据口径（硬 · 不得用图上顶端冒充）**：祖谱页统计栏的「**始祖**」**必须按数据口径** —— 即 **`tree-meta`（祖谱 `founder_handle` / `founder_gramps_id`）**所指的**始祖**；**不得**拿**图上顶端节点**（全树根构图后谱系图最上面那个节点）**冒充**「始祖」。
  - **张力（如实登记）**：全树根构图（承 §81-2 判据 1 / `docs/clan-tree.spec.md` §14-1 第 2 条）**会使图上顶端 ≠ 数据真源始祖**（顶端可能是上游世本镜像段的最上一环）⇒ **统计栏按数据口径写**，**图上顶端另行以角标 / 样式区分**（样式 = 实现单定稿）。
  - **现证（落笔前）**：统计栏文案构造点 = `frontend/src/components/tree-pedigree/tree-pedigree.vue` 的 `founderLabel`（现证 `:432`–`:437`；单根 ⇒ `始祖：<名>`（`:435`）、多根 ⇒ `<n> 支始祖`（`:437`）），**其取值源 = 图上 `visibleForest`（渲染面）** ⇒ **本裁定要求该口径回归数据真源**；**具体实现形状 = 实现单**（本册不预填）。
  - **⚠️ 与 §81-3 末条「待裁」的关系（登记 · 不互推）**：§81-3 所记「统计栏文案是否随图改口」**原行字面不动**；**其口径自本行起** = 本条（**数据口径为准**）。
- **④ 判据面（不互推）**：§81-2 判据 **1–7 继续有效**（**除本条 ② 明记撤回的「『文献地址』卡 在位」一项外，原行字面一律不动**）；本追记**不新增阈值、不改阈值方向**；**读数位仍留空**（执行侧收口后回写）。
- **⑤ 边界（硬）**：本追记 = **纯文档追加**；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / `docs/clan-tree.spec.md` / 其它文档**；**未跑构建 / 未跑测试 / 未打包 / 未部署 / 未 `git add` / 未 `commit` / 未 `push`**；**零真源写入**。

- **待裁 / 未完成（本条挂账 · 不阻塞本批）**：① `docs/clan-tree.spec.md` **§14-3 二**（「文献地址」卡）与 **§14-3 一**（入口落点）的**同款就地收口 = 后续批次**（**本单只动三文件、不改该册**）；② 统计栏在**多根 / 全树根构图**下的文案定稿（含「N 支始祖」是否保留）= **实现单**；③ 可达性判据的**真机读数未取**（本单未跑构建、未开浏览器）。

---

### §81-6 执行回写 · 上云窗口实测（**H5 上线（已为单图版式）** · **小程序产物重打（上传待 Kevin）** · **判据逐条回写**）（**2026-10-16 · 只追加 · 不改 §81-1 – §81-5 任何行**）（Zang 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§81-6**（**落笔前现证** = `grep -n '^### §81-6' docs/PENDING_DEPLOY.md` ⇒ 命中 **0**；**前节 = §81-5**，现证 = **1215**）。**若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面**。
> **性质（只追加）**：本追记**只追加**；**§81-1 – §81-5 既有行原文一律保留、一字不改、一行不删**（承 `AGENTS.md` §0-4）。**口径真源 = `docs/clan-tree.spec.md` §14**（**本单不改该册**）。
> **归属（硬 · 分线 · 不得混写）**：**上云执行 = Zang**（**Kevin 2026-10-16 放行「现在全做」**）。**不得**写成 Kevin 亲自执行；**微信开发者工具上传 = 待 Kevin（未上传）**。
> **读数纪律（硬）**：读数**逐字照抄执行侧现证 / 派单方实测**（**派单方实测者逐条标注**），**未改写、未推算**；**判据 1 目视 / 小程序上传 / 真机触屏 一律明写未测或待办**。

- **① H5 上线（已执行 · Zang）** = `git push origin main`（**`6083337..5bb973a`**；**后续另有 `f1c5ae3` / `380c0d2`**）。**线上实测（派单方浏览器真调 `https://www.jiapu100.com/pages/hall/index?tree_id=ji_23395`）⇒ 已是单图版式**：
  - **①「世系链」/ ③「支系入口列表」不再渲染**（**§81-2 判据 2 目视在位**）；
  - **图例三类在位（逐字）** = 「**上游镜像（世本/上层）· 只读 · 点开真身档案**」/「**本宗自有世代 · 可编辑**」/「**下游支系登记镜像 · 只读 · 点卡面「📂 打开…」进支系**」；
  - **底部足行** = 「**支系 1 支 · 登记镜像 0**」；**兜底块** = 「**未画进图谱的只读条目（1）**」内渲「**季氏费县白露家族 · 始祖：季花 · ji_23395_01 · 58 人**」（**始祖姓名已恢复**）。
- **② guest 视角裁剪（派单方观察项 · 如实登记 · 预期行为 · 非缺陷）** = **guest 视角下登记镜像 `depth≥2` 被裁剪 ⇒ 图上无该节点、走兜底列表 = 预期行为**。
- **③ 小程序重打（已打、未上传 · Zang 打 · 上传待 Kevin）** = `cd frontend && npm run build:mp-weixin` ⇒ 产物 **`frontend/dist/build/mp-weixin`**；**主包 `main_package_bytes = 1,991,535` ≤ 上限 `2,097,152`**（`over_2MiB_by = -105,617`）；**文件 225 · 1.899 MiB**；**分包 7 个**（`admin` / `spirit` / `market` / `friend` / `invite` / `task` / `special`）；**新口径字面已在位**（「未画进图谱」/「挂于」/「镜像 · 源自」「始祖：」）。**上传 = 待 Kevin 在微信开发者工具执行（未上传）**。
  - **本单独立现证（Jing 只读复跑 · 与上列同值）** = `python3 frontend/scripts/mainpkg_bytes.py frontend/dist/build/mp-weixin` ⇒ **`main_package_bytes = 1,991,535`** · **`main_package_files = 225`** · **`main_package_MiB = 1.899276`** · **`over_2MiB_by = -105,617`** · **`subpackages_bytes = 117,260`**；产物 `app.json` 的 `subPackages` 现证 = **7 个**（root 逐条同列）；产物内 `find -type f` = **265**（**主包 ＋ 分包合计**）。

- **④ 判据逐条回写（PASS / 未测 / 待验 分写 · 不得混写）**

| # | §81-2 判据 | 回写 |
|---|---|---|
| **1** | 同图成链（祖谱页 · 硬） | **待验（Kevin 登录态验收）** —— **guest 看不到 `depth≥2` 登记镜像，本地 / guest 无法目视** ⇒ **待 Kevin 登录态验收**；**不得写成已验证** |
| **2** | ①③ 段不再列 | **已验** —— **线上目视**（见 ①：①「世系链」/ ③「支系入口列表」**不再渲染**） |
| **3** | 家族树 / 总谱档逐字不变（回归 · 硬） | **已验** —— **独立质检归因式**：**15 棵树 `JSON.stringify` IDENTICAL · 差异树 0** |
| **4** | 功能保留清单五条在位 | **已验（限 ②③④ · 派单口径逐字）** —— 线上目视（④②③④ = 派单原记字面）。**⚠️ 登记张力（硬 · 不互推）**：其中 **②**「『文献地址』卡 在位」一项**已由 §81-5 ② 撤回**（**该行原文一律保留、不回改**；**取代语义自 §81-5 ② 起**）⇒ **该子项自 §81-5 ② 起不构成在位项**；本行**照录派单口径字面并如实登记该张力** |
| **5** | 落点标注（硬） | **已验** —— **独立质检真源探针 66/66 PASS** |
| **6** | 小程序主包 ≤ `2 MiB`（含 `static/` 口径 · 硬 · 必测） | **已验** —— **主包 `1,991,535` ≤ `2,097,152`**（**余量 `105,617` B**；见 ③ 本单复跑同值） |
| **7** | 不动面（回归） | **本追记未回写** —— `cloudfunctions/**` / `config/**` 的 `git diff --numstat`**本单未跑** ⇒ **不预填、不推算** |

- **⑤ 提交链 ＋ 边界（硬）**
  - **提交链（现证）** = **`6609534`**（代码面）→ **`5bb973a`**（产物）→ **`f1c5ae3`**（质检证据入册）→ **`380c0d2`**（存量修正脚本）；**H5 上线承 `push origin main`（`6083337..5bb973a`）**；**落笔时 `origin/main` 现证 = `5bb973abe752799947128e5248823ea891c73362`**。
  - **本追记 = 纯文档追加**：**未改任何代码 / 真源 / `config/` / `docs/*.qa.md` / 其它文档**；**未跑构建 / 未跑测试 / 未打包 / 未部署 / 未 `git add` / 未 `commit` / 未 `push`**。
- **⑥ 未测 / 待办（如实登记 · 不得写成已验证）** = **§81-2 判据 1（同图成链目视）= 待 Kevin 登录态验收**（**guest 视角看不到 `depth≥2` 登记镜像**）· **小程序上传 = 待 Kevin 在微信开发者工具执行**（**未上传**）· **§81-5 ① 可达性判据的真机（触屏）读数未取**（**本单未跑构建、未开真机**）· **线上 H5 逐片确证**（承 §81-3 同款：Vercel 构建分片 ⇒ **以 push 触发构建为准**）。

---

## §82 同族 SDK 签名缺陷修复批（`deleteFile` **实签名 = `{ fileList: [...] }`** · 旧写法从未真删且静默）上云登记（**云函数 `compat-api` 重打包（`esbuild`）＋ 部署 · 已执行** · **前端本批零改动** · **无新集合 · 无数据修正 · 真源零写入** · 口径真源 = `AGENTS.md` **勘误 24 ⑤**（其「修复单在途」挂账自本批落地）· **2026-10-17 · 只追加 · 不改 §0–§81 任何行**）（Jing 制度员）

> **编号（对账用 · 硬）**：本册按现证续编为 **§82**（前节 = **§81**（末子节 = **§81-6**）；**落笔前现证** = `grep -c '^## §82' docs/PENDING_DEPLOY.md` ⇒ **0** · `grep -c '§82-'` ⇒ **0** · `wc -l` ⇒ **1316**（**末行 = 第 1316 行**））—— **若与 Kevin 定稿冲突 ⇒ 就地加注别名、不改本节字面**。
> **性质**：本节 = **同族 SDK 签名缺陷修复批的「上云动作 ＋ 执行回写 ＋ 判据 ＋ 未测面」登记单**（**执行侧已完成**：重打包 ＋ 部署已执行、产物已入库、提交链已推 `main`）；**逐字登记**（读数照抄执行侧现证与登记时只读探针现读，**未改写、未推算**）。
> **状态词（硬）**：**已实现（Kong）· 已部署（2026-10-17）· 删除路径端到端未实测** —— **不得**写成「删除已恢复可用」/「端到端已通过」/「已验收」（原因与覆盖路径见 §82-4）。
> **口径真源** = `AGENTS.md` **勘误 24 ⑤**（**本单不代改 `AGENTS.md`** —— 该处「修复单在途」的追记由主代理处理）。
> **缺陷与修法（一句登记 · 只报告 · 细则以勘误 24 ⑤ 为准）**：`@cloudbase/node-sdk@3.18.3` 的 `deleteFile` **实际签名 = `{ fileList: [...] }`**；旧写法（入参只带 `fileID`、缺 `fileList`）在本仓默认配置（`throwOnCode = true` · SDK 模块级默认 `dist/utils/utils.js:69` · **本仓从未调用 `setThrowOnCode`**）下 **抛 `INVALID_PARAM`**（被调用方空 `catch` 吞掉）、在 `setThrowOnCode(false)` 下 **返错误对象**（被当成成功）⇒ **两条路都拿不到「删除成功」凭据：从未真删、且都静默**。**修法** = `lib/store.js` `deleteTree` 与 `lib/revision.js` `cloudDelete` 两处改用 `{ fileList: [id] }` ＋ 按 **`fileList[0].code === 'SUCCESS'`** 判成败；**`deleteTree` 判失败抛错**（保住「先删成功 → 再摘 `storage_files` / 失效缓存」写序不变式；两个既有调用方均按「可能失败」编写）；**`cloudDelete` 抛错由换封面调用方 best-effort `catch` 并记一行日志**（不阻断、不静默 —— 此刻新封面已上传成功、修订正文必须落库）。

### §82-1 上云动作（**逐条 · 均已执行**）

| # | 动作 | 口径 |
|---|---|---|
| **①** | **云函数 `compat-api` 重打包（`esbuild`）＋ 部署** | **已执行**（`tcb fn deploy` · 读数见 §82-2 (1)(2)）；**本批含后端逻辑改动**（`lib/store.js` `deleteTree` ／ `lib/revision.js` `cloudDelete`）⇒ **必须重打包**（**不重打包则云端仍是旧写法、删除链路照旧静默无效**）。**⚠️ 与 §79-1 ① / §81-1 ① 的「无需重打包、无需部署」相反，属不同批、不得互推** |
| **②** | **前端（H5 / 小程序）** | **本批零改动** —— 改动面 100% 在后端（现证 = `git show --stat f08d97a` ⇒ **4 文件全在 `cloudfunctions/compat-api/**`**）⇒ **H5 未重建部署、小程序未重打上传**；**既有前端产物不受本批影响**（**⚠️ §74-1 ② ③ / §79-1 ② ③ / §81-1 ② ③ 的「两产物重打」属各自那一批，不得据本节免掉、亦不得据其为本批重打**） |
| **③** | **CloudBase 集合** | **无新集合**（**不新建 / 不修改集合**）；`scripts/upload-migrated-to-cloudbase.mjs` 的 **`COLLECTIONS` 名单未动**；**本批未跑任何迁移脚本** |
| **④** | **数据 / 真源面** | **无数据修正 · 真源零写入** —— `config/**` / `migrate-output/**` / 树 JSON / 既有集合 / 云存储 / `jiapu_tree_meta` **均未动** |
| **⑤** | **文档面** | **本节**（`docs/PENDING_DEPLOY.md` · **本单只改这一个文档**）；**口径真源 = `AGENTS.md` 勘误 24 ⑤**（**本单不代改该册** —— 其追记由主代理处理） |

- **跨文件已知项（只报告 · 不另行动作）**：**本批前** `cloudfunctions/deploy/compat-api/index.js`（旧产物 · §80 批那版）内**曾有 2 处旧签名**（现证 = `git show 3e13de9` 的产物 diff：`- deleteFile({ fileID: fileId })` ／ `- deleteFile({ fileID })`）⇒ **已由本次重打包消除**（现证 = 产物内 `deleteFile({ fileID` ⇒ **`0`**、旧形 `deleteFile({ … fileID }` ⇒ **`0`**、`deleteFile` **三处全部为 `{ fileList: [...] }`**，逐条见 §82-2 (1)）；**仓内其余 `deleteFile` 使用点**（`lib/store.js:1027` 清扫路径）**本就正确**（`{ fileList: targets }` · 返回值不检查 = 留孤儿无害 · **非本批改动面**）。

### §82-2 执行回写（**实测读数 · 逐字沿用，不得推算**）

**(1) 重打包（`esbuild`）· 对应 §82-1 ①**

- 命令（逐字）：`frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk --outfile=cloudfunctions/deploy/compat-api/index.js`（体例承 §75-6 (1) / §80-6 ①）
- 产物（新）：**md5 `33ac68ff8c46979fd8cc8535c1cd9cdd`** ／ **`1,618,494` B**（**Jing 落笔前现证复核同值**：`md5 -q` ＋ `ls -l`）
- 产物（旧 · 被换下）：**md5 `352e90beeca40726156f839fb191679a`** ／ **`1,617,760` B**（照抄 §80-6 ①）
- **产物三查（对新产物 · 本单现证）** = `deleteFile` **恰 3 处、全部 `{ fileList: [...] }`**（`:780` 清扫 ／ `:918` `deleteTree` ／ `:37761` `cloudDelete`）；**旧签名（`deleteFile({ fileID` ／ 旧形 `deleteFile({ … fileID }`）= `0`**；**`fileList[0].code !== "SUCCESS"` 判成败 ×2**（`:919` `deleteTree` ／ `:37762` `cloudDelete`）；**`require("@cloudbase/node-sdk")` ×1**（**`--external` 保持**）；**`node --check` OK**
  - 注（**防误读 · 硬**）：产物内另有 **`downloadFile({ fileID: fileId })` ×2**（`:799` / `:819`）—— **同族 SDK 的 `downloadFile` 实签名就是 `{ fileID }`**（同族四签名清单见 `lib/revision.js:570-575` 注释：`deleteFile` / `getTempFileURL` = `{ fileList }`、`uploadFile` = `{ cloudPath, fileContent }`、`downloadFile` = `{ fileID }`）⇒ **不属旧签名残留、不得据之判负**。

**(2) 部署 · 对应 §82-1 ①**

- 命令（逐字）：`yes | tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c` ⇒ **部署成功**（**送 `y` 的坑**承 §80-6 ①：**不送 `y` 则不部署**）
- **函数指纹（部署后 · 本单现取只读探针 `tcb fn detail compat-api -e liwu-d8gek6jjdab1d087c`）** = **状态 `部署完成`** · **代码大小（B） `6,346,104`** · **修改时间 `2026-10-17 07:27:44`** · **环境变量** = `MASTER_TREE_ID=zhonghua; COMPAT_SOURCE=cloud`（**未变**）
  - **对照（已换版）** = §80-6 ① 登记 = `6,345,767` B ／ `2026-10-16 20:56:00` ⇒ **本次已换版**（**旧行原文不动**）

**(3) 测试门槛（过程判据 · 已过）**

- **`npm test` = `810 / 810 / 0`**（**主代理亲跑同值**）；
- **注册数绊线 = `49`（不变）** —— **本批测试并入既有文件**（`lib/revision.test.js` 附2 ＋ `lib/tree-object-path.test.js` ⑨ 改锚 ＋ ⑩ 新增实跑）；**现证** = `friend-ops.test.js:873-880` ／ `task-center.test.js:795-799` 的绊线定额 **`49`**；**本单未跑测试**（读数照抄执行侧）。

**(4) 提交链（**已推 `main`**）**

- **`f08d97a`**（代码 ＋ 测试 ＋ 注释订正 · **2026-10-17 07:27:23**；现证 `git show --stat` ⇒ **4 文件 / +205 / −9**：`lib/revision.js` 51 ／ `lib/revision.test.js` 68 ／ `lib/store.js` 30 ／ `lib/tree-object-path.test.js` 65）→ **`3e13de9`**（产物 · **07:27:49**；**1 文件 / +10 / −3**）；
- **现证**：`git rev-parse origin/main` = **`3e13de9f3d302fc60dc324097e41dcf4eb75e0b5`**（= `HEAD`）；`git status --porcelain` ⇒ **空**（工作区干净 · **本单只读探针，未 `git add` / 未 `commit` / 未 `push`**）。

**(5) 注释订正（连带面 · 只报告）**

- **四个文件**（`lib/store.js` ／ `lib/revision.js` ／ `lib/revision.test.js` ／ `lib/tree-object-path.test.js`）的**同类注释已按实测口径订正**（默认 `throwOnCode=true` ⇒ **抛 `INVALID_PARAM`**；仅 `setThrowOnCode(false)` ⇒ **返错误对象**；**两条路均从未真删且静默**）；
- **该类不准确句式全仓 = `0` 命中**（**本单现证 grep**）；**唯二留存形式（均非「主张」· 不得据之写成「仍有残留」）** = **①** 本批新写的**背景引用注释**（`lib/revision.test.js:924` · **引旧写法原形**以说明缺陷本体）／ **②** **反回退负向断言**（`lib/revision.test.js:945` ／ `:967` ／ `lib/tree-object-path.test.js:199` · `!/deleteFile\(\{\s*fileID/`）。

### §82-3 判据（**部署后 · 产物级 ＋ 生产回归**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **旧签名残留 = `0`（产物级 · 硬）** | 对**重打包产物**（`cloudfunctions/deploy/compat-api/index.js`）grep 旧签名 ⇒ **`0`**；且 `deleteFile` **三处全部**为 `{ fileList: [...] }`、`fileList[0].code !== "SUCCESS"` 判成败 **×2** —— **读数 = 见 §82-2 (1)（本单已现证 · 全过）** |
| **2** | **生产回归冒烟（部署后 · 本单只读实测 · 硬）** | `GET /tree-meta` ⇒ **`200`**；`GET /tree/rank?tree_id=zhonghua` **连打 3 次** ⇒ **`person_count` 恒 `119`**（`mirror_count` `0`）；`GET /tree/rank?tree_id=ji_23395_01` ⇒ **`58`** ／ 镜像 **`4`**；`GET /revisions?tree_id=ji_23395_01` ⇒ **`200`**（出参 **14 键**，含 `postscript` / `wenpu_config`）；`GET /search/global?query=000000209` ⇒ **`200`** —— **逐条均已现证通过** |
| **3** | **写序不变式（静态锚 · 已过）** | `lib/tree-object-path.test.js` **⑨** 断言写序 **删对象 → 摘 `storage_files` → 失效缓存** ＋ local 分支仍 `unlinkSync` 且**不含任何云删除调用**；`lib/revision.test.js` **附2.2** 断言换封面**「先传新、后删旧」**写序 ＋ 删旧仍在 `try/catch (e)` 内 **best-effort**、**不 `throw`**、**必须记一行日志（不静默）** |
| **4** | **云端真删成功路径（未测类 · 方向相反）** | **未实测** —— 见 §82-4（**不得据判据 1–3 写成「云端删除已恢复可用」/「已通过」**） |

- **⚠️ 阈值方向（硬）**：判据 1 = **`0` 命中类** · 判据 2 = **`200` / 稳定一致类** · 判据 3 = **静态锚类** · 判据 4 = **未测类** —— **四者方向各不相同，不得混写、不得互推**（承 §72-2 / §73-2 / §74-2 / §75-2 同款）。
- **判据 2 的一处如实登记（不得美化）**：对**未知路径**（现证探针 = `GET /api/no-such-route-xyz`）云函数返 **`400`**（**不是 `404`** —— 本函数对未匹配路径统一 `400`）；**该行为属既有形态、非本批引入**，**本单只登读数**。
- **判据写法（逐字 · 供执行者照抄）**：产物级取计数 = 对 `cloudfunctions/deploy/compat-api/index.js` 按 **`deleteFile({` 全部命中**（应恰 **3** 处）与**旧签名模式**（应 **`0`**）分别 grep；**生产回归** = 上表判据 2 所列 **5 条 GET** 逐个取 HTTP 状态码 / `person_count`。

### §82-4 未测面（**硬 · 如实登记 · 不得写成已验证 / 已通过 / 已恢复**）

- **☐ 删除路径的真实端到端触发未做（本批核心未测面）**：**`deleteTree`（走分宗 / 归宗回收）与 `cloudDelete`（走换封面）两条删除路径在生产上均未实际触发过** —— **两者均低频**；
  - **`deleteTree` 调用点（现证）** = `cloudfunctions/compat-api/lib/branch-clan-ops.js:765`（**分宗** —— 删回收新树那份 `try/catch` 吞错 best-effort）／ **`:920`**（**归宗** —— 删源树那份把异常收进 `stageError` → `markShellSource`（壳源树 reconcile 登记）＋ **`500`**）；**该两分支在生产未被触发**；
  - **`cloudDelete` 调用点（现证）** = `lib/revision.js:859`（`saveRevision` 换封面）；**生产上「换封面且旧 `fileID` ≠ 新 `fileID`」路径未被触发** ⇒ **best-effort 日志（`[revision] 刪除舊封面未成功…`）在生产无实际日志读数**；
  - **⇒ 云端 `fileList[0].code === 'SUCCESS'` 的「真删成功」路径、以及「判失败抛错 ⇒ `500` / 壳源树登记」的失败语义，均未在云上取得证据**。
- **已有但不等价的证据（明写模式 · ⚠️ 不得当云上读数）**：**静态锚**（`tree-object-path.test.js` ⑨ ／ `revision.test.js` 附2.1 ／ 附2.2）＋ **local 沙箱实跑**（`tree-object-path.test.js` ⑩：真删盘上树文件 ＋ 失效树缓存 ＋ 幂等）—— **那是源码文本锚与 local 沙箱，不等价于云端 SDK 真删**。
- **未跑（本单）**：**未跑构建 / 未跑测试 / 未打包 / 未部署 / 未重启任何服务**；**唯一执行的命令 = 只读探针**（`md5` / `ls` / `grep` / `node --check` / `tcb fn detail` / `curl` GET / `git log` / `git show` / `git status` / `git rev-parse` / `wc`）。
- **前端面**：**H5 / 小程序未涉及**（本批零前端改动）⇒ 既有「旧 H5 缓存窗口」风险**不适用**（承 §69-4 / §70-4 / §71-5 / §72-5 / §73-3 / §74-1 ② 均为**其它批**）。
- **`deleteTree` 抛错路径的一处残余代价（已在源码注释如实登记 · 云端未实测）**：**「对象其实已不存在、而 `storage_files` 仍指着它」时也会判失败** ⇒ 该路径从「静默放过」变成 **`500` ＋ 壳源树登记**，**可由既有 reconcile 收敛**（重试仍会走真删）；**未登记 `fileID` 的树压根不调 SDK、仍幂等**。

### §82-5 登记面与边界（**硬**）

- **登记面**：`docs/PENDING_DEPLOY.md` **本节**；**口径真源 = `AGENTS.md` 勘误 24 ⑤**（**本单不代改 `AGENTS.md`** —— 其「修复单在途」的追记由主代理处理）。
- **本登记 = 制度登记单（只改文档）**：**只改 `docs/PENDING_DEPLOY.md` 本节**；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档 / `cloudfunctions/**` / `scripts/**` / `frontend/**` / `migrate-output/**` / `config/**`**；**未 commit / 未 push / 未部署 / 未跑构建 / 未跑测试 / 未重启任何服务**（**唯一执行的命令 = §82-4 所列只读探针**）；**零真源写入**；**未改 §0–§81 任何历史行**（**纯追加** · 承 `AGENTS.md` §0-4）。
- **状态词（硬 · 重申）**：**已实现（Kong）· 已部署（2026-10-17）· 删除路径端到端未实测** —— **不得**写成「删除已恢复可用」/「端到端已通过」/「已验收」。

---

## §83 首页搜索行改版 · 家族/堂号搜索 · 地区筛选 ＋ `GET /geo/tree-index` 上云登记（**三笔部署事实 · 均已执行**：① Vercel H5 重打（`f943c2f` 首屏瘦身 ＋ 页脚）② Vercel H5 重打（`17ca301` 搜索 ＋ 筛选）③ 云函数 `compat-api` 重打包部署（**6,345,511 B** · `2026-10-17 17:25:00` · 含 `/geo/tree-index`）· **无新集合 · 真源零写入** · 口径真源 = `docs/home-sort-search.spec.md` **§16** ＋ `docs/geo-origin.spec.md` **§15** · **2026-10-17 · 只追加 · 不改 §0–§82 任何行**）（Jing 制度员）

> **本节补的是什么缺口**：`docs/home-sort-search.spec.md` **§15-4 ⑥** 已如实登记「`docs/PENDING_DEPLOY.md` 未见 `f943c2f` / 首屏瘦身 / 页脚降权的上云登记（`grep` ⇒ 0 命中）」，且注明「补登属另行派单」。**本单即该派单**：一次补登 **① ② ③** 三笔。补登前现证（本单落笔时）：`grep -n 'f943c2f\|17ca301\|c0e8726\|geo/tree-index\|首屏瘦身' docs/PENDING_DEPLOY.md` ⇒ **0 命中**（本节为**唯一**登记位）。

### §83-1 上云动作（**逐条 · 均已执行**）

| # | 动作 | 产物 / 指纹（现证） | 生产判据（**可判负 · 见 §83-3**） |
|---|---|---|---|
| **①** | **Vercel H5 重打 —— 首页首屏瘦身 ＋ 页脚降权** | 代码 **`f943c2f`**（`perf(h5): 首页首屏瘦身 + 页脚降权` · **2026-10-17 17:01:46**）· 现证 `git show --stat` = **7 文件 / +329 / −31**（`frontend/vite.config.ts` 164 ／ `frontend/scripts/build-td-icon-font.py` 113 ／ `frontend/src/pages/index/index.vue` 42 ／ `frontend/td-icon-keep.json` 20 ／ 字体子集三件（`tdesign-icon-subset.json` / `.woff` / `.woff2`））· **部署形态 = Vercel Git-connected 随 `main` push 自动构建** | 首屏 20 项 **209,498 B** ≤ **256,000 B**（gzip）· 图标规则 **15 / 2352** · `button-*.css` **32,270 B** · 产物对 `tdesign.gtimg.com` 命中 **0** · 子集字体 **woff2 1,292 B / woff 1,672 B** · 页脚 **102×33 / 11px** 三段在位。**读数与判据全文 = `docs/home-sort-search.spec.md` §15-1 – §15-3（本册不复写）** |
| **②** | **Vercel H5 重打 —— 搜索行改版 ＋ 家族/堂号搜索 ＋ 地区筛选** | 代码 **`17ca301`**（`feat(home): 搜索行内嵌暖棕「搜索」按钮 + 家族/堂号搜索 + 地区筛选` · **2026-10-17 17:45:25**）· 现证 `git show --stat` = **6 文件 / +734 / −26**（`pages/index/index.vue` 316 ／ `components/region-filter/region-filter.vue` 201 ／ `business/region-filter.ts` 171 ／ `business/api.ts` 38 ／ `business/types.ts` 18 ／ `business/index.ts` 16）· **纯前端、云函数零改动** · 部署形态同上 | 按钮文案**两字「搜索」**· 底色 `rgb(139,69,19)` · 几何 64×34 · placeholder `搜索人物 / 家族 / 堂号` · **Enter（CDP 发键）搜「季」⇒「家族 · 2」** · 山东 ⇒ **4 棵**且**仅**沈氏临沂带绿标「居 济南市」· 「未登记」⇒ **2 棵** · 全页「发源地」命中 **0** · 375/1280 两档无横向溢出 · console/pageerror **0/0** · `type-check` EXIT 0 · `npm test` **821/821/0**。**判据全文 = `docs/home-sort-search.spec.md` §16-1 – §16-7** |
| **③** | **云函数 `compat-api` 重打包（`esbuild`）＋ 部署 —— 新增 `GET /geo/tree-index`** | 代码 **`e633c62`**（`feat(api): 新增只读聚合口 GET /geo/tree-index` · **17:24:35**）→ 产物 **`c0e8726`**（`chore(deploy): 重打包 compat-api 产物（/geo/tree-index 上线）—— 云端已部署` · **17:25:31**，`cloudfunctions/deploy/compat-api/index.js` **+1,522 / −2,828**）· **云端函数指纹 = `2026-10-17 17:25:00` / `6,345,511 B`**（执行侧 `tcb fn detail` 读数）· 本地产物现证 = **1,613,737 B** / md5 **`bd0725362bdd6b9ec628da5244a5c27c`**（**与云端指纹非同量对象，差因见 §83-4 ⑤**）· **无新集合 · 真源零写入**（`lib/geo-tree-index.js` 只调三个只读函数） | `GET /geo/tree-index` ⇒ **200** · `v=1` · **`trees` = 20 棵** · **无 `failed` 键** · `generated_at` 为 ISO 时刻 · **不带任何 header 也 200**（不得 400 缺 `X-Tree-Id`）· 出参可**独立复算**（`geo-origin.spec.md` §15-6 **J6** / §15-7）· 六省 `籍/居` 与「未登记 2 棵」逐项对得上（**J7**） |

**(4) 提交链（现证 · 均已推 `main`）**

- `f943c2f` **17:01:46** → `6bc7bf2`（`perf(hall)` · 17:16:57）→ `187cc1f`（`docs(spec): 首页 §15 入册` · 17:16:57）→ `e633c62` **17:24:35** → `c0e8726` **17:25:31** → `17ca301` **17:45:25**。
- **现证**：`git rev-parse origin/main` = **`17ca30161d5fbfd040d333d7f53371f4387f59df`**（= `HEAD`）；本单落笔时 `git status --porcelain` = **仅两处文档改动**（`docs/geo-origin.spec.md` / `docs/home-sort-search.spec.md`）—— **本单未 `git add` / 未 `commit` / 未 `push`**。

### §83-2 执行回写（**实测读数 · 逐字沿用，不得推算**）

- **接口面（本单只读复核 · 现证）**：`curl https://liwu-d8gek6jjdab1d087c.service.tcloudbase.com/api/geo/tree-index` ⇒ **HTTP 200** · **1,418 B** · **0.23 s** · 体 = `{v:1, generated_at:"2026-10-17T09:48:01.825Z", trees:{…20 棵…}}`（**无 `failed` 键**）。
- **独立复算（本单现证 · 用上述出参 ＋ `GET /tree-meta` 按 `hitOfEntry` 口径重写一遍）**：家谱档 14 棵 —— 黑龙江 **籍6/居5** · 河北 **1/4** · 山东 **3/2** · 天津 **0/1** · 辽宁 **1/0** · 台湾 **0/1**；**「未登记」= 2 棵**（`li_26446_03` 李氏安达 · `rong_23481_01` 容氏梨树）；**山东命中 4 棵**（季氏费县白露 `371325` / 刘氏安达 `370000` / 秦氏鸡西 `371323` / 沈氏临沂 `origin_codes 230305` ＋ 居住地 `370100`）⇒ **仅沈氏临沂籍贯未命中 ⇒ 唯一绿标「居 济南市」**；**祖谱档 5 棵全部两数组皆空**（`gu_39038` / `ji_23395` / `liu_21016` / `qin_31206` / `huang_40644`）⇒ 祖谱档「未登记 · 5 棵」**可复算**。**与执行侧读数逐项一致**。
- **探针坑（硬 · 判负前必读）**：`GET https://www.jiapu100.com/api/geo/tree-index` ⇒ **HTTP 200 但返 SPA HTML**（`text/html`，现测 **2,275 B** 首页）—— **站点根域名不是 API 入口**（Vercel SPA `rewrites` 兜底）。**据「200」判定「接口在位」在本站必然误判**；**API 域名 = `…service.tcloudbase.com/api`**。

### §83-3 判据（**部署后 · 产物级 ＋ 生产回归**）

| # | 判据 | 通过条件 |
|---|---|---|
| **1** | **函数在场（产物级 · 硬）** | 对 `cloudfunctions/deploy/compat-api/index.js` grep `geo/tree-index` ⇒ **命中 ≥ 1**（**现证 = 2 处**：`/** `GET /geo/tree-index` 取值入口… */` 注释 1 ＋ `if (pathname === "/geo/tree-index" && method === "GET")` 路由判定 1）；**`0` 命中 ⇒ 部署未生效，判负**（阈值方向 = **命中数类**，**不是**等值类；大于 2 **不判负**，因注释随源码变化） |
| **2** | **接口契约（生产 · 硬）** | `GET …/api/geo/tree-index` ⇒ **200**、`v===1`、`Object.keys(trees).length === 20`、**无 `failed` 键**、`generated_at` 非空。**任一不符 ⇒ 判负**（判据全文 = `docs/geo-origin.spec.md` §15-6 J1 – J3） |
| **3** | **鉴权闸门（生产 · 硬）** | **不带任何 header** 的 `GET` ⇒ **200**（不是 400 缺 `X-Tree-Id`）⇒ 证明注册在**树编辑闸门之前** |
| **4** | **前端读数（生产 · 硬）** | 搜索按钮两字 ＋ `rgb(139,69,19)` ／ Enter 搜「季」⇒「家族 · 2」／ 山东 ⇒ 4 棵且仅 1 个绿标 ／ 「未登记」⇒ 2 棵 ／ 「发源地」命中 0 ／ 375·1280 无横向溢出（**逐条见 `home-sort-search.spec.md` §16-7**） |
| **5** | **跨批不回归** | 首屏 ≤ 250 KB gzip（现测 209,498 B）· 图标规则 15/2352 · 无 `tdesign.gtimg.com` 外链（**§15 判据 I1 – I5**）—— ② 的重打**不得**把 ① 的读数打回去 |

- **⚠️ 阈值方向（硬 · 不得混写）**：判据 1 = **命中数类**（`≥1`）· 判据 2 = **等值类**（`200` / `1` / `20`）· 判据 3 = **状态码类**（`200` 而非 `400`）· 判据 4 = **读数类** · 判据 5 = **不回归类**。**五者方向各不相同，不得互推。**

### §83-4 未测面（**硬 · 如实登记 · 不得写成已验证 / 已通过**）

- **① 小程序端 375 真机未测**：本批三笔**只验 H5 ＋ 生产**；小程序包**未重打、未上传** ⇒ `@enter` 在小程序（原生 `confirm` → 组件 `enter`）的触发形态、地区下拉在真机的绝对定位与 `56vh` 上限**均无证据**。**`home-sort-search.spec.md` §16-2 判据 E3 在小程序侧未做。**
- **② 祖谱档 × 地区筛选组合未实测**：祖谱档计数按**当前档位**设计（现可复算 **5 棵全部「未登记」**），但 **UI 上未点过**；切 tab 不清空筛选状态下两档计数是否刷新**未验**。
- **③ 搜索能力延迟未优化（已知 · 未处理）**：`GET /search/global` 实测 **3–8 s**；本批**未改后端**、**未加**防抖 / 竞态取消 / 骨架屏 ⇒ **「家族段即时、人物段慢」的双速体验已在线上**，本节**只登记、不承诺优化**。
- **④ `.tab-btn` 可点区 30px < 32（既有 · 非本批引入 · 未修）**：锚点 `frontend/src/pages/index/index.vue:921`–`:924`（`padding: 6px 14px` ＋ 13px 行盒 ⇒ **≈30px**）；与 §15 的 D4（可点区 ≥32）同族缺口，**本批未动**。
- **⑤ 部署包体差因未核**：云端指纹 **6,345,511 B**（执行侧 `tcb fn detail`）与本地单文件 **1,613,737 B**（现证 `ls -l` ＋ md5 `bd0725…`）**非同量对象**（前者 = 上传包 / 后者 = 混淆后的单 JS），**差因本单未核** ⇒ **不得**据本行推算打包比、**不得**据任一数判「部署的是哪一版」；版本身份的可靠判据 = **§83-3 判据 1 ＋ 2**。
- **⑥ 地区索引 24h 缓存的时点差**：`generated_at = 2026-10-17T09:48:01.825Z`（= 17:48 CST，**晚于** 17:25 部署 ⇒ 缓存为部署后首次计算）；**过期重扫 / 降级 / `failed` 三者云上均无读数**（`geo-origin.spec.md` §15-8 ①–③）。
- **本单未跑**：**未跑构建 / 未跑测试 / 未打包 / 未部署 / 未重启任何服务**；**唯一执行的命令 = 只读探针**（`grep` / `sed` / `awk` / `git log` / `git show` / `git status` / `git rev-parse` / `ls -l` / `md5` / `curl GET` / `python3` 复算）。

### §83-5 登记面与边界（**硬**）

- **登记面**：`docs/PENDING_DEPLOY.md` **本节（§83）**；**口径真源** = `docs/home-sort-search.spec.md` **§16**（前端四项）＋ `docs/geo-origin.spec.md` **§15**（接口契约）—— **本节不复写其条款，只登记「上云动作 / 产物指纹 / 生产判据」**。
- **本单 = 制度登记单（只改文档）**：改 **`docs/PENDING_DEPLOY.md`（本节）** ＋ **`docs/home-sort-search.spec.md`（新增 §16 ＋ 5 处就地加注）** ＋ **`docs/geo-origin.spec.md`（新增 §15）**；**未改任何代码 / `AGENTS.md` / `docs/*.qa.md` / 其它文档 / `cloudfunctions/**` / `scripts/**` / `frontend/**` / `migrate-output/**` / `config/**`**；**零真源写入**；**未改 §0–§82 任何历史行**（**纯追加** · 承 `AGENTS.md` §0-4）。
- **状态词（硬 · 重申）**：**已实现（Kong）· 已部署（2026-10-17）· H5 生产已验 · 小程序未测 · 搜索延迟未优化** —— **不得**写成「全端已通过」/「已验收」/「搜索性能已解决」。

## §84 追记 · 首页三项同排（A 版）＋ 地区索引空闲预取 / 系统深色模式 token 锁定 / `compat-api` geo 统计合并（一趟扫描）—— **四笔部署补登**（**四笔部署事实 · 均已执行**：① 云函数 `compat-api` 重打包部署（geo 统计合并）② Vercel H5 重打（深色 token 锁定）③ Vercel H5 重打（同排 A 版 ＋ 空闲预取）④ Vercel H5 重打（规范入册 · **docs-only**，无运行面变化）· **无新集合 · 无数据修正 · 真源零写入** · 口径真源 = `docs/home-sort-search.spec.md` **§17**（现证 `:910`–`:1042`）＋ `docs/theme-light-pin.spec.md`（现证 **143 行 / 7 节**）· **2026-10-17 · 只追加 · 不改 §0–§83 任何行**）（Jing 制度员）

> **本节补的是什么缺口**：§83 只登记到 **17:25** 那一笔（`f943c2f` / `17ca301` / `compat-api` `2026-10-17 17:25:00`）。**同日晚间又发生四笔已完成的部署事实（19:04 云函数一笔 · 19:20 H5 两笔 · 20:11 docs-only 一笔）**，此前**未入册**。本单落笔前现证：`grep -n '5045add\|78261bb\|6a055d4\|7c5815f\|7d05d19\|geo-stats\|td-light-pin\|jp-theme-pin' docs/PENDING_DEPLOY.md` ⇒ **0 命中**（**本节为唯一登记位**）。
> **本节性质 = 补登，不是新批**：四笔的**口径与判据真源不在本册**（→ `home-sort-search.spec.md` §17 ＋ `theme-light-pin.spec.md`），**本节只登记「上云动作 / 产物·指纹 / 提交 / 生产判据」**，**不复写条款、不新增任何「已通过」类断言**。
> **提交号与指纹一律现取**：本节所有 `h` 前缀、字节数、md5、行号、时刻均为 **本单 `git log` / `git show --stat` / `ls -l` / `md5` / `tcb fn detail` / `curl GET` / `grep -n` 的实取输出**（探针时刻 **2026-10-17 20:12–20:13 CST**），**未沿用任何转述号**。

### §84-1 上云动作（**逐条 · 均已执行**）

| # | 动作 | 产物 / 指纹（现证） | 提交（现证） | 生产判据（**可判负**） |
|---|---|---|---|---|
| **①** | **云函数 `compat-api` 重打包（`esbuild`）＋ 部署 —— `/geo/hot` 与 `/geo/tree-index` 合并为同一份 24h 快照（一趟扫描）** | 本地产物 `cloudfunctions/deploy/compat-api/index.js` = **1,613,365 B** / md5 **`6dfdcc0a7c116d36b9d627f8e1f81ea1`**（`ls -l` ＋ `md5 -q`）· grep `geo-stats` ⇒ **1 命中**（`// cloudfunctions/compat-api/lib/geo-stats.js` 模块标记 ＋ `GEO_STATS_TTL_MS` 同段）· **云端函数指纹（本单现取）= 状态「部署完成」· 代码大小 6,345,681 B · 修改时间 `2026-10-17 19:04:35`**（`tcb fn detail compat-api -e liwu-d8gek6jjdab1d087c` · 环境变量 `MASTER_TREE_ID=zhonghua; COMPAT_SOURCE=cloud` · `Nodejs16.13` · 512 MB / 20 s） | **`7d05d19`**（`refactor(api): /geo/hot 与 /geo/tree-index 合并为同一份 24h 快照（一趟扫描）` · **19:04:03** · 现证 `--stat` = **8 文件 / +655 / −267**：`lib/geo-stats.js` **+244（新建）** ／ `lib/geo-stats.test.js` **+332（新建）** ／ `lib/geo-hot.js` 168 ／ `lib/geo-tree-index.js` 159 ／ `lib/friend-ops.test.js` 9 ／ `lib/task-center.test.js` 6 ／ `lib/geo-hot.test.js` 2 ／ `package.json` 2）→ 产物 **`7c5815f`**（`chore(deploy): 重打包 compat-api 产物（geo 统计合并 · 一趟扫描）` · **19:04:54** · **1 文件 / +89 / −102**）· 部署命令（执行侧）= `yes \| tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c` | **两路 `generated_at` 逐字相同**（同一快照）· `hot` **35 码** / `direct` **23 码** / `trees` **20 棵** / **两路均无 `failed` 键** · 两路**键集未变**（`hot` = `{v,counts,direct,generated_at}`）。**本单只读复核见 §84-2 ①②** |
| **②** | **Vercel H5 重打 —— 系统深色模式下 `t-input` 白字压米白底：锁定暖色 token** | 现证 `--stat` = **2 文件 / +168 / −0**（`frontend/src/styles/td-light-pin.css` **+164（新建）** ／ `frontend/src/main.ts` **+4**；现证 `main.ts:9` = `import '@/styles/td-light-pin.css';`）· 产线侧现证：`https://www.jiapu100.com/assets/index-DeIYpIfZ.css` = **34,277 B** / md5 **`7bff6cc7a038a774eb7d6adbed5ae7eb`**，其中 `prefers-color-scheme: dark` 块共 **3 个**（起始 offset **17572 / 27946 / 28497**），**第 3 个（末位）即 pin 块**（`jp-theme-pin` 出现于 **28555**，落在该块选择器内）· 部署形态 = **Vercel Git-connected 随 `main` push 自动构建** | **`5045add`**（`fix(theme): 系统深色模式下全站 t-input 白字压米白底 —— 锁定暖色 token` · **19:20:41**） | 深色偏好下 `input` 文字 = **`rgba(0,0,0,0.9)`**、placeholder = **`rgba(0,0,0,0.4)`**（**与浅色逐字相等**）· 对比度 **1.01:1 → 17.24:1** · 几何签名逐值不变 · 搜索 / 筛选 / 后台回归全绿 · `type-check` EXIT 0 · `npm test` **832/832/0**（执行侧读数 · 判据真源 = `docs/theme-light-pin.spec.md` §4） |
| **③** | **Vercel H5 重打 —— 搜索框 / 搜索按钮 / 地区胶囊合并同一行（A 版）＋ 地区索引空闲静默预取 ＋ placeholder 二次收缩** | 现证 `--stat` = **2 文件 / +66 / −27**（`pages/index/index.vue` **70** ／ `components/region-filter/region-filter.vue` **23**）· 产线侧现证：首页 chunk `assets/pages-index-index.DRMITcmZ.js` = **19,249 B** / md5 **`a4a35fd814bc7e57e4695fcb24cc2127`**（`person-search` **1** ／ `requestIdleCallback` **1** ／ `人物 / 家族 / 堂号` **1** 命中）· 组件 CSS `assets/index-CjJ7HDcg.css` = **10,819 B** / md5 **`a0c96dea1465beef155ca4bccb17f036`**（`.region-bar[data-v-39143625]{…}` ＋ **`width:78px;height:36px`** ＋ 下拉 **`max-width:calc(100vw - 32px)`**）· 入口 chunk `assets/index-E_8mpRb5.js` = **379,899 B** / md5 **`7386749f02c1cd84460f115d09a83ba9`** | **`78261bb`**（`feat(home): 搜索框/搜索按钮/地区胶囊合并同一行 + 地区索引空闲预取` · **19:20:41**） | **375 档胶囊 78×36** · **三元素垂直中心 y 差 < 1.5 px** · **选省前后输入框 156 不跳宽**（`t-input` 恒 249 / 胶囊恒 78）· **`scrollWidth == clientWidth`** · **未点下拉时 `/geo/tree-index` 请求数 = 1**（空闲预取只发一次）· `type-check` EXIT 0 · `npm test` **832/832/0**（执行侧读数 · 判据真源 = `home-sort-search.spec.md` §17-1 L1–L4 / §17-2 P1–P2） |
| **④** | **Vercel H5 重打 —— 规范入册（§17 ＋ 新立 `theme-light-pin.spec.md`）** | **docs-only · 无运行面变化**（现证 `--stat` = **2 文件 / +288 / −9**：`docs/home-sort-search.spec.md` **154** ／ `docs/theme-light-pin.spec.md` **+143（新建）**；**零 `frontend/**` / 零 `cloudfunctions/**` / 零 `scripts/**`**）⇒ **本笔不改变任何产线读数**；随 push 触发的构建**与 ③ 同代码面** | **`6a055d4`**（`docs(spec): §17 同排/预取/placeholder 二次收缩 + 新立 theme-light-pin.spec.md（深色模式 token 锁定）` · **20:11:37**）· **= 本单 `HEAD` = `origin/main`** | **无行为判据可判**（**不得**据本笔的构建成功推「①②③ 已通过」）；本笔的**唯一**可判项 = **产物与 ③ 同代码面**（差分仅 `docs/**`） |

**(5) 提交链（现证 · 均已推 `main`）**

- `9b742f1`（`fix(ui)…@confirm → @enter` · 18:01:00）→ **`7d05d19` 19:04:03** → **`7c5815f` 19:04:54** → **`5045add` 19:20:41** → **`78261bb` 19:20:41** → **`6a055d4` 20:11:37**。
- **父提交现证**（`git log --format="%h %p"`）：`7c5815f` 的父 = `7d05d19` ／ `5045add` 的父 = `7c5815f` ／ `78261bb` 的父 = `5045add` ／ `6a055d4` 的父 = `78261bb` ⇒ **四笔线性、无合并、无「产物先于源码」**。
- **现证**：`git rev-parse HEAD` = `git rev-parse origin/main` = **`6a055d4272075aaa46e27291005471aedc33515d`**；本单落笔时 `git status --porcelain` = **空**（除本单追加的 `docs/PENDING_DEPLOY.md`）—— **本单未 `git add` / 未 `commit` / 未 `push`**。

### §84-2 执行回写（**本单只读复核 · 实测读数逐字登记，不推算**）

- **① 云函数在册（`tcb fn detail` · 本单现取 · 探针 `2026-10-17 20:13` CST）**：`状态 = 部署完成` · `代码大小(B) = 6345681` · `修改时间 = 2026-10-17 19:04:35`（**与 `7c5815f` 的 `19:04:54` 提交时刻同分钟级吻合**：部署先落云端、再提产物，与 `7c5815f` 的 commit message「云端已部署」一致）。**§83-4 ⑤ 挂的「函数指纹本轮未取」自本行结清。**
- **② 生产接口（本单现取 · 20:12:07 CST）**：`GET …/api/geo/hot` ⇒ **200 · 716 B · 8.67 s** · 体键 = `{counts, direct, generated_at, v}` · `counts` **35 码** · `direct` **23 码** · 无 `failed`；`GET …/api/geo/tree-index` ⇒ **200 · 1,443 B · 0.19 s** · `trees` **20 棵** · 无 `failed`；**两路 `generated_at` 逐字相同 = `2026-10-17T12:12:07.765Z`** ⇒ 合并生效（一条快照两路投影）。
- **③ `generated_at` 时点差（登记 · 差因未核）**：`7c5815f` 的 commit message 记录部署后首测 = `2026-10-17T11:04:53.839Z`；本单现取 = `2026-10-17T12:12:07.765Z`（**+67 min**）。**24h TTL（`GEO_STATS_TTL_MS = 24*60*60*1000`，现证 `lib/geo-stats.js:49`）未到期**，**差因本单未核**（疑与实例生命周期 / 冷启重扫有关，**不作结论**）⇒ **`generated_at` 不是版本身份判据**；版本身份的可靠判据 = **§84-1 ① 的 grep 命中 ＋ §84-2 ①② 的两路逐字相同 ＋ `tcb fn detail` 的修改时间**。
- **④ H5 产线 `jp-theme-pin` 在位（本单现取）**：`index-DeIYpIfZ.css` 内 `@media (prefers-color-scheme: dark)` **共 3 块**，**末块选择器 = `:root:root,uni-page-body:not(#jp-theme-pin),.page.page`**；该块内现证 `--td-text-color-primary: var(--td-font-gray-1)` / `--td-text-color-placeholder: var(--td-font-gray-3)`（**锁到 light 值，不翻白**）。**判据方向 = 「pin 块存在且在全部 theme 块之后」**（`6a055d4` 的 `④` 亦记「产物已验证 pin 块位于全部 theme 块之后」）。
- **⑤ H5 产线同排几何的可判证据（本单现取）**：`index-CjJ7HDcg.css` 内 `.region-bar[data-v-39143625]` = `display:flex; align-items:center; flex-wrap:nowrap; min-height:36px; flex:0 0 auto`；胶囊本体 = `display:inline-flex; width:78px; height:36px`；下拉 = `max-width:calc(100vw - 32px)`。**几何实测（三元素中心 y 差 / 156 不跳宽 / `scrollWidth==clientWidth`）为执行侧读数，本单未复测**（本单不跑浏览器几何探针）。
- **⑥ 探针面复用（避免误判）**：`https://www.jiapu100.com/` 根域 **返 SPA HTML**（本单现测 **2,275 B**）⇒ **据「200」判「接口在位」在本站必然误判**；**API 域名 = `…service.tcloudbase.com/api`**（同 §83-2 第三段）。

### §84-3 未测面（**硬 · 如实登记 · 不得写成已验证 / 已通过**）

- **① 小程序产物本轮未重打、未上传、未验**：四笔中 **三笔为 H5（`5045add` / `78261bb` / `6a055d4`）＋ 一笔云函数（`7c5815f`）**，**无任何 `uniapp` 小程序构建**。⇒ 小程序侧 **`@enter` 触发形态 / 胶囊 78px 在同排下的截断 / 空闲预取在无 `requestIdleCallback` 时的 `setTimeout 0` 兜底 / 深色模式 pin 在小程序 WebView 的表现**，**四项全无证据**（`home-sort-search.spec.md` §17-6 ①② 仍挂）。
- **② 真机深色模式未验**：`5045add` 的判据只在 **Chromium 深色偏好模拟**下取证；**iOS / Android 真机系统深色**、微信内置浏览器深色、以及 **`prefers-color-scheme` 在 WebView 的取值形态**均未测 ⇒ **不得**据产线 CSS「pin 块在位」推「真机深色已修」。
- **③ 函数指纹与上传包的对应关系未核**：云端 `代码大小 = 6,345,681 B`（`tcb fn detail`）与本地单文件 **1,613,365 B**（md5 `6dfdcc0a…`）**非同量对象**（前者 = 上传包 / 后者 = 混淆后单 JS）—— **同 §83-4 ⑤**，**差因本单未核** ⇒ **不得**据任一数推算打包比、**不得**据差异判「部署的是哪一版」。本笔云端时间 `19:04:35` 与产物提交 `19:04:54` 的先后关系虽是现证，但**不构成「内容等同」的证明**。
- **④ Vercel 构建身份未从平台侧取**：本单**未取** Vercel deployment id / 构建日志 / Git SHA 绑定；产线身份判据仅来自 **静态资源 hash 现取**（`index-DeIYpIfZ.css` / `pages-index-index.DRMITcmZ.js` / `index-CjJ7HDcg.css` / `index-E_8mpRb5.js`）。⇒ 若有 CDN 边缘缓存陈旧，**本单的 hash 读数不能排除**（**未核**）。
- **⑤ 深色模式的三项已知偏差仍是偏差**：`theme-light-pin.spec.md` §5 已登记 **① placeholder 对比度 2.84:1 ／ ② 320px 下 placeholder 截断 ／ ③ 6 条只在 dark 块出现的 token** —— **本笔 `5045add` 未修、本单未验**，**不得**读成「深色模式全清」。
- **⑥ 同排几何的执行侧读数本单未复测**：§84-1 ③ 的「中心 y 差 < 1.5 px / 156 不跳宽 / `scrollWidth==clientWidth`」= **执行侧实测**，本单只复核了 **CSS 声明层**（78×36 / `calc(100vw - 32px)`）与**产线 chunk 在版**；**两组读数不互相替代**。
- **本单未跑**：**未跑构建 / 未跑测试 / 未打包 / 未部署 / 未重启任何服务 / 未跑浏览器几何探针**；唯一执行的命令 = **只读探针**（`git log` / `git show --stat` / `git rev-parse` / `git status` / `grep -n` / `ls -l` / `md5` / `wc` / `python3` 解析 / `tcb fn detail`（只读查询）/ `curl GET`）。

### §84-4 登记面与边界（**硬**）

- **登记面**：`docs/PENDING_DEPLOY.md` **本节（§84）**。**口径真源** = `docs/home-sort-search.spec.md` **§17**（`:910`–`:1042`：同排 / 预取 / placeholder / 深色条目指向）＋ `docs/theme-light-pin.spec.md`（**143 行 / 7 节**：§4 判据 / §5 三项偏差 / §6 未测面）—— **本节不复写其条款**。
- **本单 = 制度登记单（只改文档）**：仅改 **`docs/PENDING_DEPLOY.md`（追加本节）**；**未改任何代码 / `frontend/**` / `cloudfunctions/**` / `scripts/**` / 其它文档**；**零真源写入**；**未改 §0–§83 任何历史行**（**纯追加** · 承 `AGENTS.md` §0-4）。**未 `commit` / 未 `push`**。
- **状态词（硬 · 重申）**：**已实现（Kong）· 已部署（2026-10-17）· H5 生产已验（执行侧读数）· 小程序未重打未验 · 真机深色未验 · 函数指纹与上传包对应关系未核** —— **不得**写成「全端已通过」/「已验收」/「深色模式已解决」/「geo 统计已验收」。
