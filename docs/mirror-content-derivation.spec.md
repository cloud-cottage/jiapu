# 镜像内容读侧派生（方案 A）— 规格（docs/mirror-content-derivation.spec.md）

> 状态：**口径已拍定（Kevin 2026-10-10）· 未实施**；本册为**唯一权威规格**，实施（`cloudfunctions/compat-api`）必须与本文件一致。
> 上游登记：`docs/PENDING_DEPLOY.md` **§60-7 条 1**（「镜像一致性架构问题（待 Kevin 定 C / A / D）」）—— 本册 = 该条**选 A（读侧派生）**的落地规格。
> 关联：`docs/founder-attach.spec.md`（R1–R4 只读不变量 / 契约 v2 C6）、`docs/marriage.spec.md`（跨树婚姻 = 镜像来源之一）、`docs/permission-tier.spec.md`、`docs/person-badge.spec.md`（`称号` / `称号色` 的**写侧**姊妹册）、`docs/PENDING_DEPLOY.md` **§62**（本册上云动作与判据）。
> 代码锚点（**落笔前已 `grep -n` / `awk` 复核，2026-10-10**）：`cloudfunctions/compat-api/lib/marriage.js`（`buildMirror` JSDoc **:137** / 函数首行 **:138**）、`cloudfunctions/compat-api/lib/founder-attach.js`（`isReadonlyMirror` JSDoc 末行 **:135** / 函数首行 **:136**、`isOrphanMirror` **:148**）、`cloudfunctions/compat-api/index.js`（镜像判据 **:2896–2897**、`/people` **:3403**、`/people/<handle>` **:3394**、`/search` **:3430**、`/search/global` **:2888**）、`frontend/src/business/api.ts`（**契约 v2 C6** **:601 / :647**）、`frontend/src/business/cross-tree.ts`（**C6** **:294**）、`frontend/src/components/person-archive/person-archive.vue`（只读镜像编辑面板 **:369–372**）。
> 纪律：本册**只新增 / 只追加**；**不改任何历史行**；不写实现现状读数（行号 / md5 / 测试条数**一律现证**）；**不碰 `docs/*.qa.md`**。

---

## §0 口径真源 / 裁定表 / 术语

### §0-1 口径真源

| 项 | 真源 |
|---|---|
| 本册（读侧派生的**全部**语义） | 本文档 |
| 派生字段清单（含**不派生项**） | 本册 §2 / §3 |
| 只读镜像判据（现状） | `lib/founder-attach.js` 的 `isReadonlyMirror`（**现证 `:136`**） |
| 既有「出生地 / 居住地可提交」例外 | **契约 v2 C6**（`business/api.ts` **:601 / :647**、`business/cross-tree.ts` **:294**、`lib/founder-attach.js` 的 `isPlaceFieldsOnly`） |
| 上云动作与判据 | `docs/PENDING_DEPLOY.md` §62 |

### §0-2 裁定表（Kevin 2026-10-10 拍定）

| # | 决策点 | 裁定 |
|---|---|---|
| ① | 方案 | **A = 读侧派生**：镜像的**身份类字段**与**称号类属性**，在**读路径**上**以真身为准**（后端读接口返回时合并真身值）；**前端零改动即可正确显示**（Kevin 2026-10-10 拍定） |
| ② | 不派生项 | **出生地 / 居住地**仍取**本树自填值**（**契约 v2 C6，不得覆盖**）；镜像自身**外树指针字段**（`external_*` / `external_mirror` / 婚姻序号等）**不动**（Kevin 2026-10-10 拍定） |
| ③ | 真身不可达 | **孤儿镜像** ⇒ 回退**镜像本树副本** + 保持**现有提示行为**（Kevin 2026-10-10 拍定） |
| ④ | 写入侧 | **本批不做自动同步**（不级联写镜像）；镜像侧**可编辑性不变**（除非另裁 **C 方案**补锁）（Kevin 2026-10-10 拍定） |

### §0-3 术语

- **镜像节点**：`String(external_mirror) === 'true'`（且 `external_person_handle` 齐备）的节点。⚠️ **真身自身也会带 `external_*` 配偶指针 ⇒ 不得用「有 `external_*`」当判据**（**现证 `index.js:2896–2897`**）。
- **真身**：镜像的 `external_tree` 树里、`external_person_handle` 指向的节点。
- **读侧派生**：**不改存储**，只在**读接口返回前**把镜像的身份类字段 / 称号类属性**替换**为真身值（真身不可达则回退镜像副本）。
- **身份类字段**：`name` / `surname` / `given` / `gender` / `birth_date` / `death_date` / `is_living`。
- **称号类属性**：`封号` / `谥号` / `号`（既有）+ `称号` / `称号色`（`docs/person-badge.spec.md` 新增）。
- **孤儿镜像**：镜像标记在、真身不可达（无 `external_tree`）—— `isOrphanMirror`，**现证 `lib/founder-attach.js:148`**。

---

## §1 背景与现状（实测，2026-10-10）

- 跨树镜像节点（`external_mirror='true'`）是**复制档**：`buildMirror()`（`lib/marriage.js`，**JSDoc :137 / 函数 :138**）建时**拄一份内容字段**（`name` / `surname` / `given` / `gender` 各抄一份；`birth_date` / `death_date` / `birth_place` / `death_place` **建时置空**），此后**两侧各自独立存储**。
- **只读锁只覆盖两类**：`isReadonlyMirror()`（**现证 `lib/founder-attach.js:136`**）⇒ 仅 `external_link_type ∈ {founder, chain}` 被锁；**`marriage` / `child` 型镜像两侧仍可编辑**。
- **无「真身 → 镜像」自动同步**。
- **存量盘点（**只读**，Jing 现证 2026-10-10）**：
  - **全站 32 个镜像**（逐树 `people` 扫 `external_mirror==='true'`）：`founder` **7** / `marriage` **22** / `child` **3** —— 与 `docs/PENDING_DEPLOY.md` §60-7 登记**一致**。
  - **与真身有内容出入**：§60-7 登记 = **29**（**口径未登记**）。**本册只读复核**按三口径各算一次：

    | 口径 | 结果 |
    |---|---|
    | 身份 7 字段（`name/surname/given/gender/birth_date/death_date/is_living`）+ 称号 3 字段（`封号/谥号/号`） | **21** |
    | 上条 **+ 出生地 / 居住地** | **25** |
    | 任一**非指针**字段（忽略 `handle` / `gramps_id` / `external_*` / `parent_family` / `spouse_families`） | **31** |

    ⚠️ **三口径数不同、且均 ≠ §60-7 的 29** ⇒ **§60-7 的「29」口径未登记**，**列入 §7 待对齐**（本册**不擅自改 §60-7 历史行**）。
  - **21 个镜像完全没有详情档**（`migrate-output/details/<tree_id>:<handle>.json` 不存在）⇒「**镜像缺档**」是一大类别（本册只读复核 2026-10-10）。
  - **几乎无两侧都有值且冲突**：本册复核未发现「两侧都非空且不等」的其它类别（除下列两条形态）。
  - **唯一「镜像领先」= 李玉梅**（`shen_27784_01` / `handle e86975605474b6268f31fc37` / `marriage` → 真身 `li_26446_02:aeb2c57bdfc2459878d34373`）：镜像 `death_date = 2006`，**真身 = 空**。（§60-7 记为「李梅 style」；**现证姓名为 `李玉梅`**。）
  - **附：真身值形态非 ISO**（本册复核，须在派生口径里处置）—— **沈伟**（镜像 `ji_23395_01:4fb0172be158d263afc1319d` → 真身 `shen_27784_01:103f95b86f98dd5f705a545ce84`）：镜像 `birth_date='1958-03-13'` / `death_date='2010-02-02'`，**真身 = `3月13,1958` / `2月2,2010`**（非 ISO 形态）。⇒ **直接派生会把镜像上更好的 ISO 形态降级为真身的非规范形态**，须在 §3 / §6 给出处置口径（→ §7 待裁 4）。

---

## §2 拍定口径：读侧派生（方案 A）

- **在读路径上**：镜像节点的**身份类字段**与**称号类属性**，一律**以真身为准**（后端读接口返回时合并真身值）。
- **前端零改动即可正确显示**（显示层**不新增**「去真身取数」逻辑）。
- **概念定位**：`founder` / `chain` 型镜像因**整节点只读**（`isReadonlyMirror`）**从不漂移** ⇒「以真身为准」**由构造保证**；本册把同一不变量**延伸到 `marriage` / `child` 型**（它们可写、会漂移）——**在读侧补齐**，而非靠写入侧锁死。

---

## §3 派生字段清单（硬）

### §3-1 **派生**（以真身为准）

- **身份类 7 项**：`name` / `surname` / `given` / `gender` / `birth_date` / `death_date` / `is_living`。
- **称号类**：`封号` / `谥号` / `号`（既有）+ `称号` / `称号色`（见 `docs/person-badge.spec.md`）。

### §3-2 **不派生（硬）**

| 项 | 口径 |
|---|---|
| **出生地 / 居住地** | 仍取**本树自填值**（**契约 v2 C6，不得覆盖**）—— 这是镜像侧**唯一保留的可提交字段**（`api.ts:601 / :647`） |
| **外树指针字段** | `external_tree` / `external_person_handle` / `external_link_type` / `external_mirror` / `external_marriage_id` / `external_marriage_no` / `external_relation_note` 等一律**不动** |
| **结构字段** | `handle` / `gramps_id` / `parent_family` / `spouse_families` **不动**（图结构与编号**以本树为准**） |

### §3-3 合并的落点（口径，不写代码）

- **合并点在 compat-api 读路径**，覆盖全部读出口：`/people`（**现证 `index.js:3403`**）、`/people/<handle>`（**:3394**）、`/search`（**:3430**）、`/search/global`（**:2888**）、以及树图 / 列表 / 详情所依赖的同一批读出口。
- **一条硬约束**：合并**只在读路径**；**绝不写回**树 JSON / 详情档（读接口保持**只读**语义 ⇒ 树 `version` / `updated_at` **不变**）。

---

## §4 真身不可达（孤儿镜像）

- 真身不可达（`external_tree` 空 / 真身树缺 / 真身 handle 不在）⇒ **回退镜像本树副本**（现状行为）+ **保持现有提示行为**（`MIRROR_UNAVAILABLE_NOTE` / `mirrorNoteText`，`frontend/src/business/cross-tree.ts`）。
- **不做**任何「把镜像当真人」的代替（不改 `external_*`、不新增根、不改图结构）。

---

## §5 写入侧（本批不做）

- **不做任何「真身 → 镜像」自动同步**（不级联写镜像；镜像树的 `version` / `updated_at` 不因真身变更而变）。
- **镜像侧的可编辑性不变**（`marriage` / `child` 型两侧仍可写）——**除非**另裁 **C 方案**补锁（§7）。
- ⇒ **直接后果（须写清，不得含糊）**：镜像侧**自己的存储值仍会陈旧**（读侧已正确）；**下次真身变更**同样由读侧修正；**存量陈旧值不清理**（除另裁 D 方案，§7）。

---

## §6 影响面（逐条）

### §6-1 读接口（哪些走合并）

| 接口 | 是否走合并 | 说明 |
|---|---|---|
| `GET /people/?profile=all`（**现证 `index.js:3403`**） | **是** | 树图 / 列表的数据源 |
| `GET /people/<handle>`（单对象，**现证 `:3394`**） | **是** | 详情 / 编辑读取 |
| `GET /search`（树内，**现证 `:3430`**） | **是** | 命中镜像时按真身显示 |
| `GET /search/global`（**现证 `:2888`**） | **是** | 已按「最终真身 handle」**归并**；本册补齐**字段级**以真身为准 |
| 树图（`tree-pedigree` 的 people feed） | 由上游接口决定 | 走 `/people/?profile=all` ⇒ **自动生效** |
| 档案详情（`person-archive` / `person-detail-modal`） | 由上游接口决定 | 走单对象 ⇒ **自动生效** |
| `GET /tree/rank` | **否（计数）** | `person_count` 等**聚合计数**不含字段合并语义 |

### §6-2 显示项（逐项对齐）

| 显示项 | 合并后来源 |
|---|---|
| 卡片**姓名行** | 真身 `name` / `nameWithTitles` |
| 生卒**角标** | 真身 `birth_date` / `death_date` |
| **称号行** | 真身 `封号` / `谥号` / `号` + `称号` / `称号色` |
| 已故**黑框**（`is_living === false`） | 真身 `is_living` |
| **出生地 / 居住地** | **镜像本树自填**（不派生） |

### §6-3 需要一并裁决的口径缺口

- **真身值非 ISO**（沈伟类）：派生后镜像日期形态可能**退化**（§1 末条）→ §7 待裁 4。
- **真身值空而镜像有值**（李玉梅类）：严格以真身为准 ⇒ 镜像的 `death_date` 被**抹成空**，「镜像领先」信息丢失 → §7 待裁 5。

---

## §7 未定项（待裁 · 登记为待办，不当作已解决）

| # | 待裁项 | 现状 |
|---|---|---|
| 1 | 是否**同时补 C 方案**（把 `marriage` / `child` 型也纳入只读锁 `isReadonlyMirror`） | **未裁**；本批只做 A |
| 2 | **29 个存量**是否做**一次性清理（D）** | **未裁** |
| 3 | §60-7 的「**29**」**口径** | **未登记**；本册只读复核三口径 = **21 / 25 / 31** ⇒ **待对齐**（**不擅自改 §60-7 历史行**） |
| 4 | 真身日期**非 ISO** 时的派生口径（原样派生 / 归一后再派生 / 非法则回退镜像副本） | **未裁** |
| 5 | 真身值**空**而镜像**非空**时的口径（严格以真身为准 = 抹空 / 空值回退镜像副本） | **未裁** |
| 6 | 「**21 个镜像缺详情档**」是否随本批补齐 | **未裁** |

---

## §8 上云动作与判据（指针）

- 完整动作与判据 = **`docs/PENDING_DEPLOY.md` §62**（**云函数重打包；无两产物重打、无数据修正**）。
- 本册**不重复**命令与读数。

---

## §9 交叉引用

- `docs/founder-attach.spec.md`（R1–R4 只读不变量 / 契约 v2 C6）
- `docs/marriage.spec.md`（`marriage` 型镜像来源）
- `docs/person-badge.spec.md`（`称号` / `称号色` 的**写侧**规格）
- `docs/PENDING_DEPLOY.md` §60-7（上游登记）/ §62（本册上云动作）
- 代码：`lib/marriage.js` / `lib/founder-attach.js` / `index.js` / `business/api.ts` / `business/cross-tree.ts`
