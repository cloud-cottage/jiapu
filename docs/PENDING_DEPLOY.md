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


