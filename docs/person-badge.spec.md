# 带色称号 — 规格（docs/person-badge.spec.md）

> 状态：**口径已拍定（Kevin 2026-10-10）· 未实施**（数据面 / 后端 / 前端三层均待落地）；本册为**唯一权威规格**，实施（`cloudfunctions/compat-api` / `frontend`）必须与本文件一致。
> 上游登记：`docs/PENDING_DEPLOY.md` **§60-7 条 2**（「带色称号数据化需求（待 Kevin 定 6 个决策点）」）—— 本册 = 该 6 点的**裁定落地**。
> 关联：`docs/permission-tier.spec.md`（档位阶梯）、`docs/data-model.md`（§6 兼容层 API 契约）、`docs/mirror-content-derivation.spec.md`（称号类属性的**读侧派生**姊妹册）、`docs/PENDING_DEPLOY.md` **§61**（本册的上云动作与判据）。
> 代码锚点（**落笔前已 `grep -n` / `awk` 复核，2026-10-10**）：`frontend/src/components/shiben-timeline/shiben-timeline.vue`（`KEY_NODES` **:122**、`KEY_THEME_COLORS` **:134**）、`frontend/src/components/tree-pedigree/tree-pedigree.vue`（`keyMarkerOf` **:502**、`cardLines` 计行 **:477**、★行入 `lines` **:573–574**、`focusLabel` 走 `_cardText` **:604–606**）、`cloudfunctions/compat-api/lib/tree-write.js`（attribute 透传 **:226–230**）、`cloudfunctions/compat-api/index.js`（`requireWriteUser` **:252**、总谱 chief-only **:260–261**）、`frontend/src/components/person-archive/person-archive.vue`（详情三行 `t-cell` **:152–154**、编辑三栏 **:389 注释 / :390 / :394 / :398**）。
> 纪律：本册**只新增 / 只追加**；**不改任何历史行**；不写实现现状读数（行号 / md5 / 测试条数**一律现证**）；**不碰 `docs/*.qa.md`**。

---

## §0 口径真源 / 裁定表 / 术语

### §0-1 口径真源

| 项 | 真源 |
|---|---|
| 本册（带色称号的**全部**语义） | 本文档 |
| 8 个现有锚点的**人名与标签文字** | 现 `shiben-timeline.vue` 的 `KEY_NODES`（**现证 `:122`**，**8 条**），迁移时**逐字照录**（见 §6） |
| 6 色板的**色值** | 本册 §3（前 4 条色值沿用现 `KEY_THEME_COLORS` **`：134`** 的逐字色值，后 2 条新增） |
| 权限档位阶梯 | `docs/permission-tier.spec.md`（guest < user < branch_curator < tree_steward < chief_editor） |
| 上云动作与判据 | `docs/PENDING_DEPLOY.md` §61 |

### §0-2 裁定表（Kevin 2026-10-10 拍定）

| # | 决策点 | 裁定 |
|---|---|---|
| ① | 一人几条带色称号 / 颜色是否必填 | **一人一条**；**颜色可选**（Kevin 2026-10-10 拍定） |
| ② | 色板 | **6 色**（沿用现有 4 + 补 2；Kevin 2026-10-10 拍定，见 §3） |
| ③ | 生效范围 | **所有树**（世本 / 家族树 / 祖谱）**均显示**；**另在档案详情页**显示一行（Kevin 2026-10-10 拍定） |
| ④ | 填 / 改称号的权限 | **`tree_steward` 及以上**（本树主理人 + `chief_editor`）；**总谱（`zhonghua`）仅 `chief_editor`**（Kevin 2026-10-10 拍定） |
| ⑤ | 现有 8 锚点 | **迁成数据**（写入对应节点 `attributes`）并**删掉 `KEY_NODES` 常量**（彻底数据驱动）（Kevin 2026-10-10 拍定） |
| ⑥ | 详情页 | **也显示**（Kevin 2026-10-10 拍定） |

### §0-3 术语

- **带色称号**：挂在**单个节点**上的一个「文字 + 颜色」标注（文字 = `称号`，颜色 = `称号色`）；渲染为卡面 `★称号` 行 + 卡面文字着色。
- **色板键 / 色值**：`称号色` 存的是**色板键**（如 `gold`），渲染时经 §3 映射表换成**色值**（如 `#B26A00`）。
- **锚点（关键节点）**：现 `KEY_NODES` 的 8 个人名条目（人文始祖 / 五帝 / 周文王 / 周公元圣 / 鲁国始君 / 季氏得姓始祖 / 季孙氏宗主）。
- **回退默认色**：`称号` 有值而 `称号色` 未填 / 非法 ⇒ 用**金棕 `#B26A00`**。
- **称号三字段**（**本册不替代**）：既有 `封号` / `谥号` / `号`（走 `nameWithTitles` 姓名行拼接），与本册新增的 `称号` / `称号色`**互不替代**（见 §4-3）。

---

## §1 背景与现状（实测，2026-10-10）

- 现「★人文始祖 / 五帝 / 周文王 / 周公元圣 / 鲁国始君 / 季氏得姓始祖 / 季孙氏宗主」= **前端硬编码**，全部住在 `frontend/src/components/shiben-timeline/shiben-timeline.vue`：
  - `KEY_NODES`（**现证 `:122`**，**8 条**；key = Gramps「名+姓」拼写，如 `伏羲风`；每条含 `{tag, theme, gen}`）；
  - `KEY_THEME_COLORS`（**现证 `:134`**，**4 色**：`warning #B26A00` / `danger #C62828` / `primary #1565C0` / `success #2E7D32`）。
- **渲染通路（复用，不重造）**：宿主（`shiben-timeline.vue`）传 `keyMarkers: Record<handle, {label, color}>` → `tree-pedigree.vue` 的 `keyMarkerOf()`（**现证 `:502`**；`if (!node.handle || !node.gramps_id) return null;` → 以 `handle` 命中）→ 卡面加 `★label` 行 + 卡面文字主题色。
  - ⚠️ **现证更正（与派单原话不同，以本行为准）**：`★label` 行**是**经 `pushLine()` 进入 `lines`（**现证 `:573–574`**）、并计入 `cardLines`（**现证 `:477`**）的 ⇒ **会参与卡宽 / 卡高计算**（与「第N世」「外树配偶」同套行内排版）。**只有** `focusLabel`（★我 / ★建议绑定）走 `_cardText` 追加、**不进 `lines` / `cardLines`**（**现证 `:604–606`**）。本册按**现证**写，**不**按「不进 lines/cardLines、图元尺寸零影响」的派单原话。
  - **目前只有世本视图**（`shiben-timeline.vue`）传 `keyMarkers`。
- **编辑页现成参照**：`person-archive.vue` 编辑区已有「封号 / 谥号 / 号」三栏（**现证 :389 注释 / :390 / :394 / :398**）；详情页已有三行 `t-cell`（**现证 `:152–154`**）。
- **后端属性透传（关键约束）**：`cloudfunctions/compat-api/lib/tree-write.js` 的 `for (const a of body.attribute_list || [])`（**现证 `:226–230`**）→ `others.push({ key, value, type: key })` ⇒ **只保留 `key` / `value` / `type`，给 attribute 塞额外字段（如 `color`）会被静默剥掉**。⇒ **颜色必须走独立 attribute**（§2）。
- **数据来源（零新增请求）**：`GET /people/?profile=all` 的既有出参**本就**带 `attribute_list`（树图 / 列表同源）⇒ 「全树显示」**不需新路由、不需额外请求**。

---

## §2 数据形态（本册定死）

### §2-1 两个 attribute

| attribute key | value | 说明 |
|---|---|---|
| `称号` | 文字（如 `人文始祖`） | 标题文字 |
| `称号色` | 色板键（如 `gold`） | **色板键**，非色值（映射见 §3） |

- **不得**把颜色塞进 `称号` 的同一个 attribute 对象（上游只保留 `key/value/type`，**会被静默剥掉**，§1 现证）。
- 两条 attribute 一律落**人物详情文档** `attributes`（`jiapu_person_details`），与既有 `封号` / `谥号` / `号` 同处。

### §2-2 一人一条语义

- **一人一条**：同一节点重复提供 `称号` = **覆盖**（不是追加、不是多值数组）。
- `称号` **置空** = **同时清 `称号色`**（不允许「有颜色无文字」的悬空态）。

### §2-3 回退默认色

- `称号` 有值 且 `称号色` **未填 / 非法（不在 §3 映射表内）** ⇒ 渲染用**金棕 `#B26A00`**。
- **不因非法色拒绝写入**（颜色可选、容错）；**也不回写**修正色板键（读侧容错即可）。

---

## §3 色板（6 色，定死）

| 色板键 | 名称 | 色值 |
|---|---|---|
| `gold` | 金棕 | `#B26A00` |
| `crimson` | 朱红 | `#C62828` |
| `indigo` | 靛蓝 | `#1565C0` |
| `bamboo` | 竹绿 | `#2E7D32` |
| `purple` | 紫 | `#6A1B9A` |
| `graphite` | 石墨 | `#455A64` |

- 前 4 条**色值** = **沿用现 `KEY_THEME_COLORS`（现证 `:134`）的逐字色值**；后 2 条为新增（Kevin 2026-10-10 拍定）。
- **默认色 = 金棕 `#B26A00`**。
- ⚠️ **键名拼写**：`gold` 由拍板示例给定；其余 5 个拼写为**本册拟定**，改动 = **一句话可改**（须同步改 §2-3 回退判据与 §6 迁移脚本里的键）—— 登记见 §7。

---

## §4 渲染与显示

### §4-1 树图卡片（**所有树**）

- 由宿主按**数据**（§2）现算 `keyMarkers: Record<handle, {label, color}>` 传给 `tree-pedigree`；**三条通路全接**：世本（`shiben-timeline.vue`）、**家族树**、**祖谱**。数据来源 = `GET /people/?profile=all` 的既有 `attribute_list`（§1 末条）。
- 卡面渲染 = **`★称号` 行**（与「第N世」「外树配偶」同套行内排版，**参与卡宽 / 卡高**，§1 现证）+ **卡面文字着色**（`label.color` per-node 覆盖）。
- **命中即标**（`keyMarkerOf` 以 `handle` 命中）；**不再做**「名+姓 / 姓+名 / 名 / 封号·谥号·号」**候选串匹配**（那套是硬编码常量时代的产物，随 `KEY_NODES` 一起退场，§6）。
- 无 `称号` 的节点行为**与改造前完全一致**（无 ★行、无着色）。

### §4-2 档案详情页（**也显示**）

- 详情页新增**一行**带色显示（`称号` 文字按 `称号色` 着色），位置 = 与既有「封号 / 谥号 / 号」三行**同区**（`person-archive.vue` **现证 `:152–154`** 附近）。
- **仅在有 `称号` 时渲染**（与既有三行的 `v-if` 同体例）。

### §4-3 与「封号 / 谥号 / 号」的关系（**互不替代**）

- `封号` / `谥号` / `号` 仍走既有 `nameWithTitles(name, titles)` **姓名行拼接**（顺序 姓 + 名 + 封号 + 谥号 + 号），本册**一字不动**。
- `称号` / `称号色` 是**独立**的第四类标注：**不进** `nameWithTitles`、**不进**「封号 / 谥号 / 号」三行。

---

## §5 权限（字段级）

- **判定依据（实测）**：`cloudfunctions/compat-api/index.js` 的 `requireWriteUser`（**现证 `:252`**）——
  - 总谱（`zhonghua`）**非 `chief_editor` 一律 403**（**现证 `:260–261`**，文案「中华世本总谱仅总编辑（chief_editor）可编辑」）；
  - **普通树**下 `user` / `branch_curator` 走 `canEditPerson` 逐节点收敛（`user` = 本人及向下；`branch_curator` = 本人上下三代），`tree_steward` / `chief_editor` **无逐节点限制**。
  - ⇒ 「**比能编辑该节点的人高一档**」= **`tree_steward`**。

| 树 | 填 / 改 `称号` / `称号色` 的最低角色 |
|---|---|
| 普通家族树 / 祖谱（`kind` ≠ master） | **`tree_steward`**（含 `chief_editor`） |
| 总谱 `zhonghua`（`is_master`） | **仅 `chief_editor`** |

- **落点 = 后端字段级校验（必须）**：请求体**含** `称号` / `称号色` 且请求者角色**不足** ⇒ **403**；**不得扣费**（竹片 / 石榴籽 / 其它一律不动）——即**前置拒绝**，不进入扣费闸门。
- **前端**：权限不足时**不渲染** `称号` / `称号色` 的编辑控件（**只读展示不受限**——所有树、所有档位都显示）。
- ⚠️ **与既有节点级编辑门槛的关系**：`称号` 是**节点级附加属性**，其门槛（`tree_steward`）**独立于且严格于** `PUT /people/` 的节点级门槛（`user` / `branch_curator`）。⇒ 实现须**先过 `requireWriteUser`（既有节点编辑闸门）**，**再过本册的字段级称号校验**；两次都过才落库。⇒ **能编辑本人节点（`user`）≠ 能填称号**。

---

## §6 现有 8 锚点迁成数据（并删 `KEY_NODES`）

- **逐条照录**（现证 `shiben-timeline.vue:122–131`）：

| # | 现 `KEY_NODES` key | 现 `tag`（=`称号` 文字） | 现 `theme` → 新 `称号色` 键 | 现 `gen` | 节点 handle |
|---|---|---|---|---|---|
| 1 | `伏羲风` | `人文始祖` | warning → `gold` | 1 | **待现证** |
| 2 | `黄帝姬` | `五帝` | warning → `gold` | 56 | **待现证** |
| 3 | `帝喾姬` | `五帝` | warning → `gold` | 59 | **待现证** |
| 4 | `昌姬` | `周文王` | danger → `crimson` | 74 | **待现证** |
| 5 | `旦姬` | `周公·元圣` | danger → `crimson` | 75 | **待现证** |
| 6 | `伯禽姬` | `鲁国始君` | primary → `indigo` | 76 | **待现证** |
| 7 | `友季` | `季氏得姓始祖` | primary → `indigo` | 88 | **待现证** |
| 8 | `文子季` | `季孙氏宗主` | success → `bamboo` | 90 | **待现证** |

> **handle 一律「待现证」**：本册**不预填、不推算** handle；写入批（`docs/PENDING_DEPLOY.md` §61）须**先现取 8 个 handle** 再写。
> `gen` 列**仅作迁移期对照**，**不写入数据**（`gen` 仍由 `external_chain_gen` 现算，见 `docs/PENDING_DEPLOY.md` §7 世本链口径）。

- **迁移动作**：把上表写入对应 `zhonghua` 节点详情文档的 `attributes`（`称号` + `称号色` 两条），**动作与判据 = `docs/PENDING_DEPLOY.md` §61**。
- **删掉 `KEY_NODES` 常量**（连同 `KEY_INDEX` 与 `matchKeyNode` 这套「候选串匹配」一起退场）；`keyMarkers` 改为**纯数据驱动**（从节点 `称号` / `称号色` 现算）。
- ⚠️ **删除时间点 = 待裁**（§7）：须**先完成数据写入、并复核 8 个锚点全部命中**，**再删常量**（避免「常量已删、数据未写」的中间态丢标注）。

---

## §7 未定项（待裁 · 登记为待办，不当作已解决）

| # | 待裁项 | 现状 |
|---|---|---|
| 1 | `称号` 输入**长度上限** | **未定**（建议与既有 `MAX_BATCH_NAME_LEN=20` 同量级，**一句话可改**） |
| 2 | 是否允许**一人多色交替**（多条称号轮流） | 现定 **一人一条**（§2-2）；多条 = **未裁** |
| 3 | 迁移后 **`KEY_NODES` 删除的时间点** | 现定「先写数据、后删常量」（§6）；**具体时点未裁** |
| 4 | 5 个新色板**键名拼写** | 本册拟定（`crimson` / `indigo` / `bamboo` / `purple` / `graphite`），**一句话可改** |

---

## §8 上云动作与判据（指针）

- 完整动作与判据 = **`docs/PENDING_DEPLOY.md` §61**（**云函数重打包 + H5 / 小程序两产物重打 + 8 个锚点的数据写入**）。
- 本册**不重复**命令与读数。

---

## §9 交叉引用

- `docs/permission-tier.spec.md`（档位阶梯）
- `docs/mirror-content-derivation.spec.md`（称号类属性在读路径上「以真身为准」—— 镜像侧显示受该册约束）
- `docs/PENDING_DEPLOY.md` §60-7（上游登记）/ §61（本册上云动作）
- 代码：`shiben-timeline.vue` / `tree-pedigree.vue` / `lib/tree-write.js` / `index.js` / `person-archive.vue`
