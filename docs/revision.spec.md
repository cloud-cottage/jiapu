# 修谱域规格分册（docs/revision.spec.md）

> **状态**：**定稿、待实现**（本册**只落口径**，**不写任何实现现状读数**；行号 / md5 / 计数**一律不预填**）。
> **性质**：本批（「修谱」）= **全新业务域**，**仓内此前零实现**（落笔前实测：`frontend/src/business/revision.ts` 与 `cloudfunctions/compat-api/lib/revision.js` **均不存在**）。
> **本册管**：修谱的**核心概念** · **权限** · **周期与冷却** · **四类可写内容** · **编辑期与固化** · **数据模型** · **接口清单** · **在线文谱编排扩展** · **配置键**。
> **本册不管**：**PDF 导出**（修谱卷**不进 PDF**，登记为**后续批次**）/ 家族树页 `view-toggle` **第四档** / hero **修谱块** / **祖谱页** / **世本** / **新页面与路由**（编辑态为**弹窗**）。
> **体例**：中文、分节编号；已定口径标 **定稿**，未定项单列 **待裁**；每条口径**一句话能读懂**。
> **关联**：`docs/wenpu.spec.md`（在线文谱编排 · 本册 **§8** 为其**冻结契约**扩展）· `docs/PENDING_DEPLOY.md` **§66**（本批上云动作与判据）· `AGENTS.md` **§0-3 数值 / 字面纪律 · §0-4 历史行不机械改写 · §0-5 `docs/*.qa.md` 不回改**。
> **状态词纪律**：本册一律用「**定稿 / 待实现**」；**不得写「已实现 / 已上线 / 已质检」**（实现与质检由后续单承担）。

---

## §0 本册边界与字面纪律

| 项 | 口径 |
|---|---|
| **本册管** | §1 核心概念 · §2 权限 · §3 周期与冷却 · §4 四类可写内容 · §5 编辑期与固化 · §6 数据模型 · §7 接口清单 · §8 在线文谱编排 · §9 配置键 · §10 上云动作指向 · §11 如实登记 · §12 待裁 |
| **本册不管** | PDF 导出（修谱卷不进 PDF）· `view-toggle` 第四档 · hero 修谱块 · 祖谱页 · 世本 · 新页面 / 路由 |
| **数值 / 字面纪律** | 字段名 / 路由名 / 档位名 / 错误码 / 数值**一律逐字取自本冻结契约**；**不得自行发明**任何数值、字段名、路由名、档位（承 `AGENTS.md` §0-3） |
| **现状读数** | 本册**不预填**任何行号 / md5 / 计数 / 路由条数；**判据一律以命令实际输出为准** |

---

## §1 核心概念（定稿）

- **修谱** = 家族管理员在系统内对**单套家谱**执行「**内容新增 + 整体规整**」的**专属业务**；**权限专属、按次执行、有固定冷却周期与编辑时效**。
- **术语（逐字）**：
  - **修谱**（一次操作）；
  - **修谱记录**（一次修谱的一份数据）；
  - **编辑期**（生效起 **30 天**）；
  - **固化**（编辑期届满自动锁定）。

---

## §2 权限（定稿）

- **「家族管理员」** = 本树 **`tree_steward`**（档位阶梯 `lib/auth.js`：**`guest`0 < `user`1 < `branch_curator`2 < `tree_steward`3 < `chief_editor`4**）。
- **「上级管理员」** = **`chief_editor`**；**祖谱主理人不算其下普通树的上级**。
- **普通用户**（`user` / `branch_curator` / `guest`）**无任何修谱写权限**。
- **读写分离**：
  - 修谱内容**全档可读**（**guest 亦可读**）；
  - **写仅**两档 —— **家族管理员**（**编辑期内**）+ **上级管理员**（**固化后的终审修改**）。
- **前端可见性单点** = `frontend/src/business/revision.ts` 的 **`canManageRevision(role, treeId)`**。
- **后端同构守卫** = `cloudfunctions/compat-api/lib/revision.js`。
- **两端必须逐条同构**（对齐既有 `lib/badge-guard.js` 先例：前端 `canEditBadge` 与后端 `canEditBadge` 同口径）。
- ⚠️ **已被取代 · 2026-10-12**（上方「**写仅两档 —— 家族管理员（编辑期内）+ 上级管理员（固化后的终审修改）**」的**括号语义**）：锁定后的可写档位与计费口径**已改** ⇒ 见 **§5-1**（**锁定后本树家族管理员付费即可继续写**；`chief_editor` 亦可、**同样按次扣费**）；**两档集合不变**（`tree_steward` + `chief_editor`）。

---

## §3 周期与冷却（定稿）
> ⚠️ **已被取代 · 2026-10-12**（本节「**按未作废修谱计数 M**」与「**作废的修谱不吃冷却、不计入 M**」两条口径）：**作废概念整体取消** ⇒ 现行口径 = **M = 该树已开始的修谱总数（= `seq`）**，见 **§3-1**；**间隔表 `[1,2,3,5,10]` 不变**；本节其余旧行**原文保留、不回改**。

- **间隔表** `revision_interval_years` **默认 `[1,2,3,5,10]`**，**全站统一配置**（**不按树单独配**），**落 `jiapu_wallets.config`**，**写入口扩既有 `PUT /admin/wallet-fee`**。
- **迭代语义** = 按该树**未作废**修谱的**计数 M** 查表：**M=1→1 年、2→2 年、3→3 年、4→5 年、M≥5→10 年**。
- ⚠️ **已被取代 · 2026-10-12**：本行「按**未作废**修谱计数 M」⇒ 现行为 **M = 该树已开始的修谱总数（= `seq`）**（**作废概念整体取消**）⇒ 见 **§3-1**。
- **第 M+1 次修谱最早开始时刻** = **最后一次未作废修谱的 `effective_at` + intervalFor(M) 年**（**自然年相加**）。
- ⚠️ **已被取代 · 2026-10-12**：本行「最后一次**未作废**修谱」⇒ 现行为 **最后一轮修谱（`seq` 最大者）的 `effective_at`**（**无作废筛选**）⇒ 见 **§3-1**。
- **第 1 次修谱无等待门槛**（**建树即可开始**）。
- **作废的修谱不吃冷却、不计入 M**，但 **`seq` 占号不重用**。
- ⚠️ **已被取代 · 2026-10-12**：本行**整条作废**（**作废概念整体取消**）⇒ 见 **§3-1** / **§7-7-4**。

### §3-1 现行口径（冷却与迭代 · 2026-10-12 取代）

- **间隔表保留、不变**：`revision_interval_years` 默认 **[1,2,3,5,10] 年**、**全站统一**、**后台可配**（落 `jiapu_wallets.config`，写入口 `PUT /admin/wallet-fee` 仅 `chief_editor`）。
- **迭代计数 M = 该树已开始的修谱总数（= `seq`）**（**作废概念整体取消** ⇒ **无「未作废」筛选**）。
- **第 M+1 轮最早开始** = **最后一轮 `effective_at` + `intervalFor(M)` 年**（**自然年相加**）。
- **第 1 次修谱无等待门槛**（建树即可开始）。
- **未到门槛** ⇒ **409 `REVISION_COOLDOWN`** + **`next_start_at`**。
- **已有进行中轮次** ⇒ **409 `REVISION_ACTIVE`**。

### §3-2 计费与档位（2026-10-12 新立 · 逐字 · 取代旧 §3 / §7-2 / §9 计费口径）

- **四常量写死、无后台入口**（**不得自行发明**）：
  - **`REVISION_FEE_START_BAMBOOS = 999`** —— **开新一轮恒价**（**首轮与后续同价**）；
  - **`REVISION_FEE_LOCKED_EDIT_BAMBOOS = 9999`** —— **锁定后一次保存**（**距该轮生效 `30 < days < 360`**）；
  - **`REVISION_FEE_LOCKED_LONG_BAMBOOS = 99999`** —— **锁定后一次保存**（**`days >= 360`**）；
  - **`REVISION_EDIT_DAYS = 30`** —— **不变**。
- **天数口径**：**`days = ceil((now - effective_at) / 86400000)`**（**自然日向上取整，不足 1 天算 1 天**）。
- **档位表**（`fee_tier` · 逐字）：

  | `days` | `fee_tier` | 锁定后一次保存费（片） |
  |---|---|---|
  | `days <= 30` | `edit_window` | **0**（编辑期内） |
  | `30 < days < 360` | `locked` | **9999** |
  | `days >= 360` | `long_locked` | **99999** |

- **计费语义**：**编辑期内（`days <= 30`）不限次数修改，只扣开轮那 1 次费用（999）**；**锁定后每「一次保存提交」扣一次费** —— **一次调用 = 一次，不论该次提交了几个 `kind`**（见 **§7-7-3**）。
- **不退（用户侧一律不退）**：**开轮后不用 / 锁定后修改，均不退**；**唯一例外 = 系统原因**（**落库失败 ⇒ 原路全额返还**，否则等于收了钱没建记录）。

### §3-3 锁定后付费保存留痕（定稿 · Kevin 2026-10-12 拍定 · Kong 单并行落地）

- **触发**：**锁定后每次实际扣费的保存**（**`feePieces > 0`**）**各写一条** `jiapu_ops_logs`。
- **`op`（逐字）** = **`revision_locked_edit`**；**字段（逐字）** = **`tree_id` / `seq` / `operator` / `amount_pieces` / `tx_id` / `created_at`**。
- **编辑期内（`days <= 30`）** ⇒ **0 费保存一律不写**（**无留痕**）。
- **写权两档一律都写**：**`tree_steward` 与 `chief_editor` 同口径**（**不分叉本树 / 任意树**）。
- **失败不阻断**：**日志写入失败不阻断主流程**（**扣费与内容写入照常**），但**出参带 `log_warning: true`**（**对齐仓内既有 `detail_warning` 体例**）。
- **出参键（逐字 · 2026-10-12 补全）**：save 真响应体 = **`{ ok, seq, locked, fee:{pieces,tx_id}, items:[{kind}], revision:{…该轮完整对象…}, log_warning? }`**；**`log_warning` 仅在「留痕写入失败」时出现且值恒 `true`，成功路径不出该键**（对齐仓内既有 `detail_warning` 体例）；**`revision` = 本次保存后该轮的最新对象**（含 `article` / `helpers` / `donations` / `cover` / `content_updated_at`）。

---

## §4 单次修谱可写内容（四类 · 字段规则 · 定稿）

单次修谱可写内容 = **四类**，字段规则如下。

### §4-1 昭範正圖

- 形态 = **一张大图**（**整页 / 整幅展示**）。
- 每次修谱**单张**；**编辑期内可反复替换**（替换时**删旧云存储文件**）。
- 允许格式 **仅 jpg / png / webp**；**≤2 MiB**。

### §4-2 族務紀文

- **三固定字段** = `title` / `body` / `signature`。
- **全部必须繁体字录入**（后端**逐码点校验**；检测到简体 ⇒ **400「族務紀文須以繁體字錄入」**，并**在文案里指出首个简体字**）。
- **三字段禁止手动输入逗号、句号** ⇒ 系统**自动替换为空格**（`,  ，  。  .` → 空格，**连续空格折叠为一**）；**其余标点保留**；**无其他格式要求**。

### §4-3 譜司襄事

- 多条 `{ person_handle, duty }`。
- **`person_handle` 必须从本树人物节点点选绑定，不可手输**。
- `duty` 用**繁体字**（如 **总理 / 采访 / 校勘 / 核录**）。
- 编辑期内可**增删改**（**全量替换语义**）。

### §4-4 樂捐名錄

- 多条 `{ person_handle, amount }`。
- **`person_handle` 同上必须点选**。
- **`amount` = 正整数，单位元**（**唯一单位**）。
- 展示由后端出参给 **`amount_text` = 繁体汉字大写**（`零壹貳參肆伍陸柒捌玖拾佰仟萬` + 「元」，例 **`1234 → 壹仟貳佰參拾肆元`**、**`10 → 壹拾元`**、**`0 → 零元`**）。

### §4-5 名錄姓名（樂捐名錄 / 譜司襄事 通用）

- **存储只存 `person_handle`**；**出参由后端解析出 `name`**（解析不到 ⇒ 文案 **「（節點已刪除）」**）。
- **前端不做人物深链**。
### §4-6 本批提交形态（2026-10-12 补充 · **字段规则不变**）

- **四类内容的字段规则（§4-1 … §4-5）全部保留、不变**（昭範正圖 / 族務紀文 / 譜司襄事 / 樂捐名錄 的字段与繁体、标点、点选绑定、`amount_text` 一律不变）。
- **仅提交形态改为 `items` 批量**：四类内容经**唯一内容写入口** `POST /admin/revision/save` 的 `items:[{kind, payload}, …]` 一次性提交（见 **§7-7-3**）；`kind ∈ 'article'|'helpers'|'donations'|'cover'`。

---

## §5 编辑期与固化（定稿）

- **「开始本次修谱」即生效**（**`effective_at` = 开始时刻**），享 **30 天专属编辑期**（常量 **`REVISION_EDIT_DAYS = 30`**，**写死不可配**）。
- **编辑期内**：**四类内容可新增 / 更新 / 替换**（**仅家族管理员**）。
- **编辑期届满** ⇒ 本次内容**自动固化锁定**。
- **锁定判定走惰性**（**读时算 `now > effective_at + 30d`，写时二次校验**），**不建定时任务**（对齐全站签到 / 灵气 / 21 点发售的**惰性结算口径**）。
- **固化后**：
  - **家族管理员无任何修改 / 编辑 / 删除权限**（**403**）；
  - **仅上级管理员（`chief_editor`）拥有终审修改权限** —— 可改，且**写 `jiapu_ops_logs` 留痕**（**op = `revision_override`**）、**不改锁态、不重启 30 天期**。
  - ⚠️ **已被取代 · 2026-10-12**（以上三条的**权限部分**）：**锁定后本树家族管理员付费即可继续写**（`chief_editor` 亦可 · **同样按次扣费** · **单一计费路径**）⇒ 见 **§5-1**；**保留** = **D-1 树归属校验**（`tree_steward` 仅可写本树 / `chief_editor` 任意树）。**「`op = revision_override` 留痕」一项本口径未重新规定**（**实现前须回本册确认，不得自行发明**）。
- **历次修谱记录全部留存**（**不删**）；**在线文谱内全部并列展示**（**按 `seq` 升序累加，不分组**）。
### §5-1 现行权限口径（锁定后 · 2026-10-12 取代）

- **锁定后本树家族管理员（`tree_steward`）付费即可继续修改**（**不再需要上级管理员 `chief_editor` 介入**）。
- **`chief_editor` 亦可**，且 **同样按次扣费**（**单一计费路径**，与家族管理员同价）。
- **保留：D-1 树归属校验** —— **`tree_steward` 仅可写本树**；**`chief_editor` 任意树**。
- **前端可见性单点** 仍为 `frontend/src/business/revision.ts`；**后端同构守卫** 仍为 `cloudfunctions/compat-api/lib/revision.js`（**两端逐条同构**）。

### §5-2 现行计费语义（2026-10-12 取代 · 详见 §3-2）

- **编辑期内（`days <= 30`）**：**不限次数修改，只扣开轮那 1 次费用（999）**。
- **锁定后**：**每「一次保存提交」扣一次费**（**一次调用 = 一次，不论该次提交了几个 `kind`**）；档位费见 **§3-2**（**9999 / 99999**）。
- **不退**：**用户侧一律不退**；**唯一例外 = 系统原因**（**落库失败 ⇒ 原路全额返还**）。
- **已删除**：`POST /admin/revision/abort` **整体删除**（**取消 abort** ⇒ 无「作废全额返还」路径）⇒ 见 **§7-7-4**。

---

## §6 数据模型（定稿）

- **新集合 `jiapu_revisions`**：**每树一档**，**`_id = <tree_id>`**，档内 **`version` 做 CAS**。
- **档体（逐字）**：

  ```
  {
    _id,
    version(int),
    seq(int · 单调递增 · 不重用),
    revisions: [{
      seq, started_at, effective_at, locked_at(ISO|null · 惰性求得),
      aborted(bool), aborted_at(ISO|null),
      cover:{fileID, ext, width, height, updated_at}|null,
      article:{title, body, signature, updated_at}|null,
      helpers:[{person_handle, duty}],
      donations:[{person_handle, amount}],
      content_updated_at(ISO|null)
    }]
  }
  ```

- ⚠️ **已被取代 · 2026-10-12**（上方档体里的 **`aborted(bool)` / `aborted_at(ISO|null)`** 两字段）：**作废概念整体取消** ⇒ **新档体不再含该两字段**（**其余字段不变**）⇒ 见 **§3-1** / **§7-7-4**。
- 新集合**必须**加进 `scripts/upload-migrated-to-cloudbase.mjs` 的 **`COLLECTIONS`**（该脚本有**启动自检**：运行时代码里出现的 `jiapu_*` 集合名**漏登记会直接 `exit 1`**）。
- **「本次修谱是否有内容」判据** = **cover / article / helpers / donations 四者全空才允许作废**。
  - ⚠️ **已被取代 · 2026-10-12**：本行**整条作废**（**`POST /admin/revision/abort` 已删除**）⇒ **无「是否允许作废」判据**（见 **§7-7-4**）。

---

## §7 接口清单（compat-api · 定稿）
> ⚠️ **已被取代 · 2026-10-12**：本节 **§7-1 … §7-5** 的**出参与路由集**已被取代 ⇒ 现行 **3 条路由** 见 **§7-7**（**§7-3 / §7-4 / §7-5 整体移除**）。旧行**原文保留、不回改**；**§7-6（流水类型 `edit_fee`）不变**。

### §7-1 `GET /revisions?tree_id=<id>` —— 公开只读（无需 `X-Tree-Id`）

- **出参冻结（逐字）**：

  ```
  { ok, tree_id, now, fee_bamboos, interval_years, edit_days,
    seq,
    can_start:{ok, reason, next_start_at},
    active:{seq, effective_at, lock_at, editable, cover, article, helpers, donations}|null,
    revisions:[{seq, effective_at, locked_at, aborted, cover, article, helpers, donations}] }
  ```

- **名录条目**出参带 **`name`**；**捐款条目**带 **`amount_text`**。
- **cover** 出参带**可访问 `url`**（后端换临时链）+ **`fileID`**。
- ⚠️ **已被取代 · 2026-10-12**（本条**整条**）：**出参已重写** —— **旧键 `fee_bamboos` 删除**、`editable` **恒 `true`**、**新增** `days` / `fee_tier` / `fee_next_bamboos` 与**三费率常量** ⇒ 现行为 **§7-7-1**。

### §7-2 `POST /admin/revision/start {tree_id}` —— 仅家族管理员

- **预扣 `revision_fee_bamboos`（默认 999）片竹简**（**FIFO by 最早到期**）。
- **不足** ⇒ **`409 ASSET_INSUFFICIENT`**，且带 **need / current / unit / how_to_get**，**整单不扣不落记录**。
- **冷却未到** ⇒ **409**（错误码 **`REVISION_COOLDOWN`** + **`next_start_at`**）。
- **已有进行中修谱** ⇒ **409 `REVISION_ACTIVE`**。
- **成功** ⇒ **`200 { seq, effective_at, lock_at, fee:{pieces, tx_id} }`**。
- ⚠️ **已被取代 · 2026-10-12**（本条）：**开轮计费改为恒价 `999`**（`REVISION_FEE_START_BAMBOOS`）、**不再预扣 `revision_fee_bamboos`**（该配置键已删除，见 **§9**）⇒ 现行为 **§7-7-2**。

### §7-3 `POST /admin/revision/abort {tree_id, seq}` —— 仅家族管理员

- 仅「**进行中 且 四类内容全空**」⇒ **成功**（**`aborted:true`**）+ **原路全额返还 999 片**（**复用既有 `fee_refund` 先例 + 幂等重放检查**，对齐 `lib/clan.js` 的**驳回返还**写法）。
- **有内容** ⇒ **400「本次修谱已有内容，不可作废」**。
- ⚠️ **已被取代 · 已移除 · 2026-10-12**（本条**整体删除**）：**`POST /admin/revision/abort` 路由不存在**（**费用不退**；唯一例外 = 系统原因返还，见 **§3-2**）⇒ 见 **§7-7-4**。

### §7-4 `POST /admin/revision/content {tree_id, seq, kind:'article'|'helpers'|'donations', payload}`

- **编辑期内仅家族管理员**；**固化后仅 `chief_editor`**（**留痕**）。
- **helpers / donations 为全量替换语义**。
- ⚠️ **已被取代 · 已移除 · 2026-10-12**（本条**整体删除**）：内容写入**收敛为唯一内容写入口 `POST /admin/revision/save`**（**`items` 批量**）⇒ 见 **§7-7-3**。

### §7-5 `POST /admin/revision/image {tree_id, seq, ext, data_base64}`

- **同上权限**；校验 **≤2 MiB + 扩展名白名单**。
- 后端 **`uploadFile({cloudPath:'revisions/<tree_id>/<seq>/cover.<ext>'})`**，写 **fileID** 到 **cover**，**替换时 `deleteFile` 旧文件**。
- **传输形态 = base64 JSON**（**不用 multipart**）。
- ⚠️ **已被取代 · 已移除 · 2026-10-12**（本条**整体删除**）：图像写入**并入 `save` 的 `cover` kind**（`payload = {ext, data_base64}`）⇒ 见 **§7-7-3**。

### §7-6 扣费流水类型

- **`edit_fee`**（**既有枚举**，对齐「**竹片消耗一律 `edit_fee`**」既有先例，**不新增枚举**）。
### §7-7 现行接口（3 条 · 2026-10-12 取代 · 逐字）

**已删除（未发布、无兼容负担）**：`POST /admin/revision/abort` / `POST /admin/revision/content` / `POST /admin/revision/image`。

#### §7-7-1 `GET /revisions?tree_id=<id>` —— 公开只读（无需 `X-Tree-Id`）

- **出参逐字（冻结）**：

  ```
  { ok, tree_id, now, edit_days:30,
    fee_start_bamboos:999, fee_locked_edit_bamboos:9999, fee_locked_long_bamboos:99999,
    interval_years,
    seq,
    can_start:{ok, reason, next_start_at},
    active:{seq, effective_at, lock_at, editable, days, fee_tier, fee_next_bamboos, cover, article, helpers, donations}|null,
    revisions:[{seq, effective_at, locked_at, days, fee_tier, fee_next_bamboos, cover, article, helpers, donations}] }
  ```

- **旧键 `fee_bamboos` 删除**（**出参不得再出现**）。
- **`editable` 恒 `true`**（**锁定后本树家族管理员付费即可继续写** ⇒ **无「不可编辑」态**，见 **§5-1**）。
- **`days` / `fee_tier` / `fee_next_bamboos`** 逐条按 **§3-2** 的档位表求得。
- **名录条目**出参带 **`name`**；**捐款条目**带 **`amount_text`**（§4-5 口径不变）。
- **`cover`** 出参带可访问 **`url`**（后端换临时链）+ **`fileID`**。

#### §7-7-2 `POST /admin/revision/start {tree_id}` —— 开轮

- **恒价** = **999 片**（**`REVISION_FEE_START_BAMBOOS`** · **首轮与后续同价**）。
- **不足** ⇒ **409 `ASSET_INSUFFICIENT`**（带 **need / current / unit / how_to_get**），**整单不扣不落**。
- **冷却未到** ⇒ **409 `REVISION_COOLDOWN`** + **`next_start_at`**（见 **§3-1**）。
- **已有进行中轮次** ⇒ **409 `REVISION_ACTIVE`**。
- **成功** ⇒ **`200 { ok, seq, effective_at, lock_at, fee:{pieces:999, tx_id} }`**。

#### §7-7-3 `POST /admin/revision/save {tree_id, seq, items:[{kind, payload}, …]}` —— 唯一内容写入口

- **`kind ∈ 'article' | 'helpers' | 'donations' | 'cover'`**（**逐字**）。
- **`items` 非空数组**（**空数组 ⇒ 拒绝**）。
- **一次调用 = 一次计费**：**编辑期内（`days <= 30`）0 片**、**锁定后 `9999` / `99999`**（按 **§3-2** 档位）；**不论该次提交了几个 `kind`，都只扣一次**。
- **不足** ⇒ **409 `ASSET_INSUFFICIENT`**，**整单不写**（**不部分落**）。
- **`cover` 的 `payload = {ext, data_base64}`**：**≤2 MiB**、**jpg / png / webp**、**替换先传新成功再删旧**（§4-1 口径不变）。
- **`helpers` / `donations` 全量替换语义**（§4-3 / §4-4 不变）。
- **出参** ⇒ **`{ ok, seq, locked, fee:{pieces, tx_id}, items:[{kind}] }`**。
- ⚠️ **2026-10-12 补全（逐字）**：save 真响应体 = **`{ ok, seq, locked, fee:{pieces,tx_id}, items:[{kind}], revision:{…该轮完整对象…}, log_warning? }`**（**路由层透传 lib 出参** ⇒ 契约必须在 HTTP 面成立）；**`log_warning` 仅在「留痕写入失败」时出现且值恒 `true`，成功路径不出该键**（对齐仓内既有 `detail_warning` 体例）；**`revision` = 本次保存后该轮的最新对象**（含 `article` / `helpers` / `donations` / `cover` / `content_updated_at`）。
- **流水类型** = 既有 **`edit_fee`**（**不新增枚举** · 见 **§7-6**）。

#### §7-7-4 已删除路由（2026-10-12）

- **`POST /admin/revision/abort`** —— **整体删除**（**作废概念整体取消** · **费用不退**，**唯一例外 = 系统原因返还** ⇒ §3-2）。
- **`POST /admin/revision/content`** —— **整体删除**（内容写入收敛到 **`save`**）。
- **`POST /admin/revision/image`** —— **整体删除**（图像写入并入 **`save`** 的 **`cover`** kind）。
- **三者均未发布、无兼容负担**。

---

## §8 在线文谱编排（`frontend/src/business/wenpu.ts` 冻结契约扩展 · 定稿）

### §8-1 现状（冻结契约）

- `buildWenpuBook(treeId)` 产 **`WenpuBook{ pages:[ WenpuPage{ rows, leftLabel, rightLabel } ] }`**。
- 常量 **`WENPU_COLS_PER_ROW = 30`** / **`WENPU_ROWS_PER_PAGE = 4`** / **`WENPU_CHARS_PER_COL = 10`**。
- 第 k 页**左书口 `2k+1`、右书口 `2k+2`**（**汉字序**）。

### §8-2 本批扩展

- **卷首插入修谱页**，**与谱文同一套连号**（**从 `葉一` 起连续顺延**）。
- **`WenpuPage` 增 `kind: 'genealogy' | 'cover' | 'article' | 'roster' | 'donation'`**。
- **`kind` 缺省 = `'genealogy'`**（**向后兼容**，**普通树零变化**）。

### §8-3 各类页形态

- **`cover` 页** = **整幅大图占满纸页（960×720）**，**保留左右书口**。
- **`article` / `roster` / `donation` 三页** = **沿用书页竖排栏格规格**（**30 栏 × 10 字、一条超 10 字只在该条内部续栏、缺项整条跳过**）。
  - **已被取代 · 2026-10-12（排版批）**：修谱三类内容页改**整页整体分列**（去 4 行结构与行分隔线；每栏 26 字 × 每页 30 栏、字号 26px / name-col 30px，常量 `WENPU_FLOW_CHARS_PER_COL` / `WENPU_FLOW_COLS_PER_PAGE` 标「一句话可改」）；并新增 `kind = 'postscript'` **后记页**（平台自动生成、独立整页置于全书最末）。上句旧行原文保留（仅对修谱部分被取代；**人物名录页仍按上句 30 栏 × 10 字口径执行、一字未动**）。口径真源 = `frontend/src/business/wenpu.ts` 头注释 + `docs/wenpu.spec.md` 续编。
- **族務紀文页** = **标题 / 正文 / 落款三条各自成栏**。
- **譜司襄事页** = **一人一条「姓名 + 空格 + 職務」**。
- **樂捐名錄页** = **一人一条「姓名 + 空格 + 金額漢字大寫」**。

### §8-4 繁体例外（重要）

- 修谱卷内容**存储即繁体**，**不再经 `toTraditional` 渲染派生**（避免 **s2t 表非幂等 quirk「苎→苧→薴」**造成**字形漂移**）。
- **书口文案仍按既有口径**（承 `docs/wenpu.spec.md`）。

### §8-5 零变化与边界

- **无修谱记录 ⇒ 文谱与现状完全一致**（**零变化**）。
- 本批**不接 PDF 导出**（**修谱卷不进 PDF**），**登记为后续批次**。
- 家族树页 `tree-hall.vue` 的 **`view-toggle` 不加第四档**、**hero 不加修谱块**。
- **祖谱页 / 世本不动**；**不新增页面 / 路由**（**编辑态为弹窗**）。

---

## §9 配置键（定稿）

- **载体** = `jiapu_wallets.config`；**写入口** = **扩既有 `PUT /admin/wallet-fee`**（**仅 `chief_editor`**）。
- **`revision_fee_bamboos`** = 默认 **999**（片；**非法 / 缺省 → 999**）。
  - ⚠️ **已删除 · 2026-10-12**：**该配置键整体删除** —— **键、读函数、`PUT /admin/wallet-fee` 分支全删**（计费改为**写死常量**，见 **§3-2**；**无后台入口**）。
- **`revision_interval_years`** = 默认 **[1,2,3,5,10]**（**正整数数组**；**非法 / 缺省 → 默认**；**全站统一**）。
- ⚠️ **2026-10-12 现行**：`jiapu_wallets.config` **只保留 `revision_interval_years`**（**其余计费键不存在**）；写入口 `PUT /admin/wallet-fee` 仍仅 `chief_editor`（**其 `revision_fee_bamboos` 分支已删**）。

---

## §10 上云动作（指向 `docs/PENDING_DEPLOY.md` §66）

- 新集合 **`jiapu_revisions`** 需**云端创建**（**漏登 ⇒ 首写报 `DATABASE_COLLECTION_NOT_EXIST`**）。
- 云函数 **`compat-api`** **重打包 + 部署**；**H5 + 小程序两产物重打**。
- 云存储**新前缀 `revisions/`**。
- **本阶段不上云、只登记**（逐条判据见 `docs/PENDING_DEPLOY.md` **§66**）。

---

## §11 如实登记（不得美化 · 定稿）

- 本批**新增全站第一个用户上传图片通道**（**既有后端只有树 JSON 专用的 `uploadFile` / `downloadFile` / `deleteFile`，前端 `api.ts` 零上传封装**）。
- **后端简繁表**由前端 `frontend/src/business/traditional.ts` 的 **s2t 表**经**生成脚本派生**（**单一真源 = 前端表**），**不得手抄**。
- **已知边界**：
  - **云函数 HTTP 体上限** ⇒ **图限 ≤2 MiB**；
  - **小程序端压缩实现与真机渲染未实测**。
- ⚠️ **2026-10-12 追记（不得美化）**：本批**曾一度实现**「**开轮预扣 + `abort` 作废全额返还**」与「**`revision_fee_bamboos` 后台可配**」，**后被 2026-10-12 的计费模型取代** ⇒ **现行口径 = 恒价开轮（999）+ 锁定后按次扣费（9999 / 99999）+ 费用不退（仅系统原因返还）+ 常量写死无后台入口**（见 **§3-2**）；**`POST /admin/revision/abort` 已删除**（见 **§7-7-4**）。
- ⚠️ **2026-10-12 追记（留痕口径 · 不得美化）**：本域**曾一度删除留痕**（**单一计费路径时不再写 `jiapu_ops_logs`**），**后于 2026-10-12 恢复** ⇒ 现行口径 = **锁定后每次实际扣费的保存（`feePieces > 0`）各写一条 `op = revision_locked_edit`**（见 **§3-3**）。
- ⚠️ **2026-10-12 已知残留（不得美化 · 一）**：**路由层出参透传目前仅有副本实例的接口级实测**（两次原始响应：日志集合损坏 ⇒ 带 `log_warning:true`；日志健康 ⇒ 无该键），**单测套件未覆盖 HTTP 面**。
- ⚠️ **2026-10-12 已知残留（不得美化 · 二）**：前端 `business/revision.ts` **未声明** save 出参类型、**不消费** `log_warning` ⇒ 留痕写失败时界面**无提示**（仅后端可观测）。

---

## §12 待裁

- 本单**冻结契约已列全部口径**，**无新增未定项**。
- **实现中如遇本册未覆盖的分支**，须**回本册单列「待裁」后再实现**（**不得自行发明**数值 / 字段名 / 路由名 / 档位）。

---

## §13 交叉引用

| 文件 | 关系 |
|---|---|
| `docs/wenpu.spec.md` | 在线文谱编排冻结契约（本册 §8 为其扩展）；书口文案 / 栏格规格 / `葉` 口径 |
| `docs/PENDING_DEPLOY.md` | **§66**（本批上云动作与判据） |
| `docs/PENDING_DEPLOY.md` | **§66 / §66-7**（本批上云动作与判据 · **§66-7 = 2026-10-12 口径变更追记：计费模型 / 路由收敛 / 配置键删除**） |
| `cloudfunctions/compat-api/lib/auth.js` | 档位阶梯（§2） |
| `cloudfunctions/compat-api/lib/badge-guard.js` | 前端 `canEditBadge` ↔ 后端 `canEditBadge` 两端同构先例（§2） |
| `cloudfunctions/compat-api/lib/clan.js` | 「用户申请 → 管理员审批」驳回**原路全额返还**写法（§7-3 复用 `fee_refund` + 幂等重放检查） |
| `frontend/src/business/traditional.ts` | s2t 表**单一真源**（§11） |
| `scripts/upload-migrated-to-cloudbase.mjs` | `COLLECTIONS` 登记 + 启动自检（§6） |
| `AGENTS.md` | §0-3 数值 / 字面纪律 · §0-4 历史行不机械改写 · §0-5 `docs/*.qa.md` 不回改 |
